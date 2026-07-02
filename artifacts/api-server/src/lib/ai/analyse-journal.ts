import {
  db,
  weeklyJournalsTable,
  teamsTable,
  reelScriptsTable,
} from "@workspace/db";
import { and, eq, isNull, lt, ne, or, desc, sql } from "drizzle-orm";
import { logger } from "../logger";
import { generateBrdAnalysis, getGeminiApiKey } from "./gemini-client";
import {
  buildJournalMergedPrompt,
  JOURNAL_CATEGORIES,
  REEL_BUCKETS,
  type JournalMergedInput,
  type ReelContextJournal,
} from "./journal-prompt";

type Priority = "high" | "medium" | "low" | "none";

const MAX_PREVIOUS = 8; // bound the prompt size with this team's history

// Normalized form of a script used to detect duplicates in reel_scripts, same
// scheme as the old standalone reel scan / batch generator so old + new rows
// dedupe alike. Also imported by routes/reels-scripts.ts for bulk import.
export function reelDedupeKey(script: string): string {
  return script
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 300);
}

function normPriority(v: unknown): Priority {
  const s = typeof v === "string" ? v.trim().toLowerCase() : "";
  if (s === "high" || s === "medium" || s === "low" || s === "none") return s;
  return "none";
}

function asStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v
    .map((x) => (typeof x === "string" ? x.trim() : ""))
    .filter((x) => x !== "");
}

function asString(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

// Coerce the raw analysis half into a stable, fully-shaped blob so the
// frontend can read it defensively without guarding every field. Unknown
// categories are dropped back to the fixed set.
function normaliseAnalysis(raw: unknown): {
  blob: Record<string, unknown>;
  priority: Priority;
} {
  const r = (raw ?? {}) as Record<string, unknown>;
  const www = (r["what_we_did"] ?? {}) as Record<string, unknown>;
  const blk = (r["blockers"] ?? {}) as Record<string, unknown>;
  const nxt = (r["next_week"] ?? {}) as Record<string, unknown>;

  const allowed = new Set<string>(JOURNAL_CATEGORIES as readonly string[]);
  const categories = asStringArray(www["categories"]).filter((c) =>
    allowed.has(c),
  );
  let primary = asString(r["primary_category"]);
  if (!allowed.has(primary)) primary = categories[0] ?? "Other";

  const priority = normPriority(blk["priority"]);

  const blob = {
    what_we_did: {
      summary: asString(www["summary"]),
      bullets: asStringArray(www["bullets"]),
      categories,
    },
    blockers: {
      summary: asString(blk["summary"]),
      priority,
      priority_reason: asString(blk["priority_reason"]),
      needs_admin: blk["needs_admin"] === true,
      items: asStringArray(blk["items"]),
    },
    next_week: {
      summary: asString(nxt["summary"]),
      bullets: asStringArray(nxt["bullets"]),
    },
    primary_category: primary,
    overall_summary: asString(r["overall_summary"]),
  };
  return { blob, priority };
}

// Coerce the reel half into the exact field set stored on the journal row.
// Behaviour matches the old standalone reel scan: worthy without a script is
// downgraded to not-worthy, unknown buckets fall back to INFORMATIVE.
function normaliseReel(raw: unknown): {
  reelWorthy: boolean;
  reelBucket: string | null;
  reelScript: string | null;
  reelReason: string | null;
} {
  const r = (raw ?? {}) as Record<string, unknown>;
  const worthy = r["worthy"] === true;
  const reason =
    typeof r["reason"] === "string"
      ? (r["reason"] as string).trim().slice(0, 500)
      : null;

  if (!worthy) {
    return {
      reelWorthy: false,
      reelBucket: null,
      reelScript: null,
      reelReason: reason,
    };
  }

  const script = typeof r["script"] === "string" ? r["script"].trim() : "";
  if (!script) {
    // Model said worthy but gave no script — treat as not worthy.
    return {
      reelWorthy: false,
      reelBucket: null,
      reelScript: null,
      reelReason: reason ?? "No script produced.",
    };
  }

  const bucketRaw =
    typeof r["bucket"] === "string" ? r["bucket"].trim().toUpperCase() : "";
  const bucket = (REEL_BUCKETS as readonly string[]).includes(bucketRaw)
    ? bucketRaw
    : "INFORMATIVE";

  return {
    reelWorthy: true,
    reelBucket: bucket,
    reelScript: script,
    reelReason: reason,
  };
}

function toReelContext(
  j: typeof weeklyJournalsTable.$inferSelect,
): ReelContextJournal {
  return {
    weekStartDate: j.weekStartDate,
    weekEndDate: j.weekEndDate,
    whatWeDid: (j.whatWeDid ?? "").slice(0, 1500),
    blockers: j.blockers ? j.blockers.slice(0, 800) : null,
    nextWeekPlan: j.nextWeekPlan ? j.nextWeekPlan.slice(0, 600) : null,
    clientsVisited: j.clientsVisited,
    activeConversations: j.activeConversations,
    projectsStarted: j.projectsStarted,
    projectsClosed: j.projectsClosed,
  };
}

/**
 * Run the AI auditor on a single weekly journal by id — ONE Gemini call that
 * produces BOTH the journal analysis and the reel-scan verdict. Idempotent and
 * safe to call even with no Gemini key (silent no-op). Never throws — all
 * failures are logged so a single bad row can't break a batch or a request
 * handler.
 *
 * Respects admin triage:
 *  - blockerPriority is only overwritten when the admin has NOT manually set it
 *    (blockerPriorityManual = false).
 *  - blockerStatus / blockerNote (the admin's assign/resolve state) are never
 *    touched here.
 *
 * Returns true if the results were stored, false otherwise.
 */
export async function analyseJournal(journalId: number): Promise<boolean> {
  const apiKey = getGeminiApiKey();
  if (!apiKey) {
    logger.debug(
      { journalId },
      "[journal-ai] GEMINI_API_KEY not set — skipping analysis",
    );
    return false;
  }

  try {
    const [journal] = await db
      .select()
      .from(weeklyJournalsTable)
      .where(eq(weeklyJournalsTable.id, journalId));
    if (!journal) {
      logger.warn({ journalId }, "[journal-ai] journal not found");
      return false;
    }

    // Snapshot to guard against an edit landing while this (slow) call is in
    // flight — the final UPDATE refuses to overwrite a newer submission.
    const submittedAtSnapshot = journal.submittedAt;

    const [team] = await db
      .select({ name: teamsTable.name })
      .from(teamsTable)
      .where(eq(teamsTable.id, journal.teamId));

    // This team's EARLIER journals only (strictly before this one), newest
    // first — reel-worthiness context.
    const previousRows = await db
      .select()
      .from(weeklyJournalsTable)
      .where(
        and(
          eq(weeklyJournalsTable.teamId, journal.teamId),
          ne(weeklyJournalsTable.id, journal.id),
          lt(weeklyJournalsTable.weekStartDate, journal.weekStartDate),
        ),
      )
      .orderBy(desc(weeklyJournalsTable.weekStartDate))
      .limit(MAX_PREVIOUS);

    const input: JournalMergedInput = {
      teamName: team?.name ?? `Team #${journal.teamId}`,
      weekStartDate: journal.weekStartDate,
      weekEndDate: journal.weekEndDate,
      whatWeDid: journal.whatWeDid,
      blockers: journal.blockers,
      nextWeekPlan: journal.nextWeekPlan,
      clientsVisited: journal.clientsVisited,
      activeConversations: journal.activeConversations,
      projectsStarted: journal.projectsStarted,
      projectsClosed: journal.projectsClosed,
      previous: previousRows.map(toReelContext),
    };

    const prompt = buildJournalMergedPrompt(input);
    // Text-only Gemini 2.5 Flash call (no PDF files attached). ONE call for
    // both halves — analysis + reel scan.
    const raw = (await generateBrdAnalysis(apiKey, [], prompt)) as
      | Record<string, unknown>
      | null
      | undefined;

    const { blob, priority } = normaliseAnalysis(raw?.["analysis"]);
    const reel = normaliseReel(raw?.["reel"]);

    // ONE guarded UPDATE writes both the analysis fields and the reel verdict.
    // Only update the denormalized priority column when the admin hasn't
    // pinned it manually. blockerStatus / note are left exactly as the admin
    // set them.
    const now = new Date();
    const setFields: Partial<typeof weeklyJournalsTable.$inferInsert> = {
      aiAnalysis: blob,
      aiAnalysedAt: now,
      reelWorthy: reel.reelWorthy,
      reelBucket: reel.reelBucket,
      reelScript: reel.reelScript,
      reelReason: reel.reelReason,
      reelAnalysedAt: now,
    };
    if (!journal.blockerPriorityManual) {
      setFields.blockerPriority = priority;
    }

    const written = await db
      .update(weeklyJournalsTable)
      .set(setFields)
      .where(
        and(
          eq(weeklyJournalsTable.id, journal.id),
          eq(weeklyJournalsTable.submittedAt, submittedAtSnapshot),
        ),
      )
      .returning({ id: weeklyJournalsTable.id });

    if (written.length === 0) {
      logger.info(
        { journalId },
        "[journal-ai] stale run — journal edited while analysis in flight; discarded",
      );
      return false;
    }

    // Mirror worthy scripts into the reels library (additive, dedup-safe).
    if (reel.reelWorthy && reel.reelScript && reel.reelBucket) {
      try {
        await db
          .insert(reelScriptsTable)
          .values({
            bucket: reel.reelBucket,
            script: reel.reelScript,
            source: "generated",
            dedupeKey: reelDedupeKey(reel.reelScript),
            sourceJournalId: journal.id,
            teamId: journal.teamId,
            meta: { via: "journal-reel-scan" },
          })
          .onConflictDoNothing({ target: reelScriptsTable.dedupeKey });
      } catch (err) {
        // Library mirroring is best-effort — never fail the analysis over it.
        logger.warn(
          { err, journalId: journal.id },
          "[journal-ai] reel_scripts mirror insert failed (non-fatal)",
        );
      }
    }

    logger.info(
      { journalId, priority, reelWorthy: reel.reelWorthy },
      "[journal-ai] analysis + reel verdict stored",
    );
    return true;
  } catch (err) {
    logger.error({ err, journalId }, "[journal-ai] analysis failed");
    return false;
  }
}

/**
 * Analyse every journal that is missing either half of the merged result —
 * analysis (aiAnalysedAt IS NULL) OR reel verdict (reelAnalysedAt IS NULL) —
 * serially so we don't hammer Gemini on the backlog.
 * Used by the admin "Analyse all" action and the startup catch-up sweep.
 * The merged call covers the reel scan too, so this single sweep replaces the
 * old separate reel-scan sweep (and back-fills rows the old reel scanner
 * never completed). Returns counts. Never throws.
 */
export async function analyseAllPendingJournals(
  limit = 1000,
): Promise<{ analysed: number; failed: number; total: number }> {
  let analysed = 0;
  let failed = 0;
  if (!getGeminiApiKey()) {
    logger.debug("[journal-ai] analyse-all: GEMINI_API_KEY not set, skipping");
    return { analysed, failed, total: 0 };
  }
  try {
    const rows = await db
      .select({ id: weeklyJournalsTable.id })
      .from(weeklyJournalsTable)
      .where(
        or(
          isNull(weeklyJournalsTable.aiAnalysedAt),
          isNull(weeklyJournalsTable.reelAnalysedAt),
        ),
      )
      .orderBy(sql`${weeklyJournalsTable.submittedAt} desc`)
      .limit(limit);
    for (const r of rows) {
      const ok = await analyseJournal(r.id);
      if (ok) analysed += 1;
      else failed += 1;
    }
    logger.info(
      { analysed, failed, total: rows.length },
      "[journal-ai] analyse-all complete",
    );
    return { analysed, failed, total: rows.length };
  } catch (err) {
    logger.error({ err }, "[journal-ai] analyse-all sweep failed");
    return { analysed, failed, total: analysed + failed };
  }
}
