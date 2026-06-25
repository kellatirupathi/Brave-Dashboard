// Per-journal reel scan. For one newly submitted/edited weekly journal, ask
// Gemini — using THIS team's previous journals as context — whether the entry
// is worthy of an Instagram reel, and if so generate a single script. Results
// are stored on the journal row (reelWorthy / reelBucket / reelScript /
// reelReason / reelAnalysedAt) and surfaced inline on the admin journals page.
//
// When worthy, a row is ALSO inserted into reel_scripts (source='generated',
// tied to sourceJournalId + teamId) so the existing reels library keeps showing
// generated scripts. This is the same table the old daily cron used — the cron
// is gone, but the library page is untouched.
//
// Mirrors analyse-journal.ts: idempotent, never throws, silent no-op without a
// Gemini key, and guarded against a stale run if the journal is edited while a
// (slow) call is in flight.
import {
  db,
  weeklyJournalsTable,
  teamsTable,
  reelScriptsTable,
} from "@workspace/db";
import { and, eq, isNull, lt, ne, desc, sql } from "drizzle-orm";
import { logger } from "../logger";
import { generateBrdAnalysis, getGeminiApiKey } from "./gemini-client";
import {
  buildJournalReelPrompt,
  REEL_BUCKETS,
  type ReelScanInput,
  type ReelScanJournal,
} from "./journal-reel-prompt";

const MAX_PREVIOUS = 8; // bound the prompt size with this team's history

// Normalized form of a script used to detect duplicates in reel_scripts, same
// scheme as the (now-removed) batch generator so old + new rows dedupe alike.
function reelDedupeKey(script: string): string {
  return script
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 300);
}

function toScanJournal(
  j: typeof weeklyJournalsTable.$inferSelect,
): ReelScanJournal {
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
 * Run the reel scan on a single weekly journal by id. Idempotent and safe to
 * call with no Gemini key (silent no-op). Never throws. Returns true if a
 * verdict was stored.
 */
export async function analyseJournalReel(journalId: number): Promise<boolean> {
  const apiKey = getGeminiApiKey();
  if (!apiKey) {
    logger.debug(
      { journalId },
      "[reel-scan] GEMINI_API_KEY not set — skipping reel scan",
    );
    return false;
  }

  try {
    const [journal] = await db
      .select()
      .from(weeklyJournalsTable)
      .where(eq(weeklyJournalsTable.id, journalId));
    if (!journal) {
      logger.warn({ journalId }, "[reel-scan] journal not found");
      return false;
    }

    // Guard against an edit landing mid-flight (same approach as analyse-journal).
    const submittedAtSnapshot = journal.submittedAt;

    const [team] = await db
      .select({ name: teamsTable.name })
      .from(teamsTable)
      .where(eq(teamsTable.id, journal.teamId));

    // This team's EARLIER journals only (strictly before this one), newest first.
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

    const input: ReelScanInput = {
      teamName: team?.name ?? `Team #${journal.teamId}`,
      current: toScanJournal(journal),
      previous: previousRows.map(toScanJournal),
    };

    const prompt = buildJournalReelPrompt(input);
    const raw = (await generateBrdAnalysis(apiKey, [], prompt)) as
      | Record<string, unknown>
      | null
      | undefined;

    const worthy = (raw as { worthy?: unknown })?.worthy === true;
    const reason =
      typeof (raw as { reason?: unknown })?.reason === "string"
        ? (raw as { reason: string }).reason.trim().slice(0, 500)
        : null;

    let bucket: string | null = null;
    let script: string | null = null;
    if (worthy) {
      const rawScript = (raw as { script?: unknown })?.script;
      script = typeof rawScript === "string" ? rawScript.trim() : "";
      if (!script) {
        // Model said worthy but gave no script — treat as not worthy.
        return await storeVerdict(journal.id, submittedAtSnapshot, {
          reelWorthy: false,
          reelBucket: null,
          reelScript: null,
          reelReason: reason ?? "No script produced.",
          reelAnalysedAt: new Date(),
        });
      }
      const bucketRaw =
        typeof (raw as { bucket?: unknown })?.bucket === "string"
          ? (raw as { bucket: string }).bucket.trim().toUpperCase()
          : "";
      bucket = (REEL_BUCKETS as readonly string[]).includes(bucketRaw)
        ? bucketRaw
        : "INFORMATIVE";
    }

    const stored = await storeVerdict(journal.id, submittedAtSnapshot, {
      reelWorthy: worthy,
      reelBucket: bucket,
      reelScript: script,
      reelReason: reason,
      reelAnalysedAt: new Date(),
    });

    // Mirror worthy scripts into the reels library (additive, dedup-safe).
    if (stored && worthy && script && bucket) {
      try {
        await db
          .insert(reelScriptsTable)
          .values({
            bucket,
            script,
            source: "generated",
            dedupeKey: reelDedupeKey(script),
            sourceJournalId: journal.id,
            teamId: journal.teamId,
            meta: { via: "journal-reel-scan" },
          })
          .onConflictDoNothing({ target: reelScriptsTable.dedupeKey });
      } catch (err) {
        // Library mirroring is best-effort — never fail the scan over it.
        logger.warn(
          { err, journalId: journal.id },
          "[reel-scan] reel_scripts mirror insert failed (non-fatal)",
        );
      }
    }

    logger.info({ journalId, worthy }, "[reel-scan] verdict stored");
    return stored;
  } catch (err) {
    logger.error({ err, journalId }, "[reel-scan] reel scan failed");
    return false;
  }
}

// Write the verdict, refusing to overwrite if the journal was edited (newer
// submittedAt) while the call was in flight.
async function storeVerdict(
  journalId: number,
  submittedAtSnapshot: Date,
  fields: Partial<typeof weeklyJournalsTable.$inferInsert>,
): Promise<boolean> {
  const written = await db
    .update(weeklyJournalsTable)
    .set(fields)
    .where(
      and(
        eq(weeklyJournalsTable.id, journalId),
        eq(weeklyJournalsTable.submittedAt, submittedAtSnapshot),
      ),
    )
    .returning({ id: weeklyJournalsTable.id });
  if (written.length === 0) {
    logger.info(
      { journalId },
      "[reel-scan] stale run — journal edited mid-flight; discarded",
    );
    return false;
  }
  return true;
}

/**
 * Scan every journal that has not yet been reel-scanned (reelAnalysedAt IS
 * NULL), serially. Used by the startup catch-up sweep and an admin "scan all".
 * Never throws.
 */
export async function analyseAllPendingJournalReels(
  limit = 500,
): Promise<{ scanned: number; failed: number; total: number }> {
  let scanned = 0;
  let failed = 0;
  if (!getGeminiApiKey()) {
    logger.debug("[reel-scan] scan-all: GEMINI_API_KEY not set, skipping");
    return { scanned, failed, total: 0 };
  }
  try {
    const rows = await db
      .select({ id: weeklyJournalsTable.id })
      .from(weeklyJournalsTable)
      .where(isNull(weeklyJournalsTable.reelAnalysedAt))
      .orderBy(sql`${weeklyJournalsTable.submittedAt} desc`)
      .limit(limit);
    for (const r of rows) {
      const ok = await analyseJournalReel(r.id);
      if (ok) scanned += 1;
      else failed += 1;
    }
    logger.info(
      { scanned, failed, total: rows.length },
      "[reel-scan] scan-all complete",
    );
    return { scanned, failed, total: rows.length };
  } catch (err) {
    logger.error({ err }, "[reel-scan] scan-all sweep failed");
    return { scanned, failed, total: scanned + failed };
  }
}
