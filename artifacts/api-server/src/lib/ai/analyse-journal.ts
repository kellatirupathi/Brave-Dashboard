import { db, weeklyJournalsTable, teamsTable } from "@workspace/db";
import { and, eq, isNull, sql } from "drizzle-orm";
import { logger } from "../logger";
import { generateBrdAnalysis, getGeminiApiKey } from "./gemini-client";
import {
  buildJournalAnalysisPrompt,
  JOURNAL_CATEGORIES,
  type JournalAnalysisInput,
} from "./journal-prompt";

type Priority = "high" | "medium" | "low" | "none";

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

// Coerce the raw model output into a stable, fully-shaped blob so the frontend
// can read it defensively without guarding every field. Unknown categories are
// dropped back to the fixed set.
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

/**
 * Run the AI auditor on a single weekly journal by id. Idempotent and safe to
 * call even with no Gemini key (silent no-op). Never throws — all failures are
 * logged so a single bad row can't break a batch or a request handler.
 *
 * Respects admin triage:
 *  - blockerPriority is only overwritten when the admin has NOT manually set it
 *    (blockerPriorityManual = false).
 *  - blockerStatus / blockerNote (the admin's assign/resolve state) are never
 *    touched here.
 *
 * Returns true if analysis was stored, false otherwise.
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

    const input: JournalAnalysisInput = {
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
    };

    const prompt = buildJournalAnalysisPrompt(input);
    // Text-only Gemini 2.5 Flash call (no PDF files attached).
    const raw = await generateBrdAnalysis(apiKey, [], prompt);
    const { blob, priority } = normaliseAnalysis(raw);

    // Only update the denormalized priority column when the admin hasn't pinned
    // it manually. blockerStatus / note are left exactly as the admin set them.
    const setFields: Partial<typeof weeklyJournalsTable.$inferInsert> = {
      aiAnalysis: blob,
      aiAnalysedAt: new Date(),
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

    logger.info({ journalId, priority }, "[journal-ai] analysis stored");
    return true;
  } catch (err) {
    logger.error({ err, journalId }, "[journal-ai] analysis failed");
    return false;
  }
}

/**
 * Analyse every journal that has not yet been analysed (aiAnalysedAt IS NULL),
 * serially with a small pause so we don't hammer Gemini on the backlog.
 * Used by the admin "Analyse all" action and the startup catch-up sweep.
 * Returns counts. Never throws.
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
      .where(isNull(weeklyJournalsTable.aiAnalysedAt))
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
