import { logger } from "../logger";
import { analyseJournal, analyseAllPendingJournals } from "./analyse-journal";

const ANALYSIS_DELAY_MS = 30 * 1000;

// Track in-flight setTimeouts so a re-submit within the window doesn't
// double-schedule the same journal.
const scheduledTimers = new Map<number, NodeJS.Timeout>();

/**
 * Schedule the journal AI auditor to run on a journal once, shortly after
 * submission. Safe to call from any route handler; never throws. If the server
 * restarts before the timer fires, the startup catch-up sweep picks it up.
 */
export function scheduleJournalAnalysis(journalId: number): void {
  try {
    const existing = scheduledTimers.get(journalId);
    if (existing) {
      clearTimeout(existing);
      scheduledTimers.delete(journalId);
    }
    const timer = setTimeout(() => {
      scheduledTimers.delete(journalId);
      void analyseJournal(journalId).catch((err) => {
        logger.error({ err, journalId }, "[journal-ai] scheduled run threw");
      });
    }, ANALYSIS_DELAY_MS);
    if (typeof timer.unref === "function") timer.unref();
    scheduledTimers.set(journalId, timer);
  } catch (err) {
    logger.error(
      { err, journalId },
      "[journal-ai] scheduleJournalAnalysis failed",
    );
  }
}

/**
 * Trigger analysis immediately (admin per-journal "Re-analyse" button).
 * Resolves when complete (or failed-and-logged). Returns true if stored.
 */
export async function runJournalAnalysisNow(
  journalId: number,
): Promise<boolean> {
  const existing = scheduledTimers.get(journalId);
  if (existing) {
    clearTimeout(existing);
    scheduledTimers.delete(journalId);
  }
  return analyseJournal(journalId);
}

/**
 * One-shot sweep at server boot: analyse any journals that were never analysed
 * (e.g. submitted while no Gemini key was set, or a setTimeout lost across a
 * redeploy). Throttled and fire-and-forget; never throws.
 */
export async function catchUpPendingJournalAnalyses(): Promise<void> {
  try {
    await analyseAllPendingJournals(200);
  } catch (err) {
    logger.error({ err }, "[journal-ai] catch-up sweep failed");
  }
}
