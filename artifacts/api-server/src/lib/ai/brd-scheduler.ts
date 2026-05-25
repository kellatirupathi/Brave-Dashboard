import { logger } from "../logger";
import { analyseRevenueEntryBrd } from "./analyse-brd";

const ANALYSIS_DELAY_MS = 5 * 60 * 1000;

// Track in-flight setTimeouts so we don't double-schedule for the same entry
// (e.g. if a student re-submits twice within the 5-minute window).
const scheduledTimers = new Map<number, NodeJS.Timeout>();

/**
 * Schedule the AI BRD auditor to run on a revenue entry exactly once, 5
 * minutes from now. Safe to call from any route handler; never throws.
 *
 * If the server restarts before the timer fires, the startup catch-up sweep
 * (catchUpPendingBrdAnalyses) will pick the entry up.
 */
export function scheduleBrdAnalysis(entryId: number): void {
  try {
    const existing = scheduledTimers.get(entryId);
    if (existing) {
      clearTimeout(existing);
      scheduledTimers.delete(entryId);
    }
    const timer = setTimeout(() => {
      scheduledTimers.delete(entryId);
      void analyseRevenueEntryBrd(entryId).catch((err) => {
        logger.error({ err, entryId }, "[brd-ai] scheduled run threw");
      });
    }, ANALYSIS_DELAY_MS);
    // Don't keep the event loop alive solely for this timer.
    if (typeof timer.unref === "function") timer.unref();
    scheduledTimers.set(entryId, timer);
    logger.info(
      { entryId, delayMs: ANALYSIS_DELAY_MS },
      "[brd-ai] scheduled analysis",
    );
  } catch (err) {
    logger.error({ err, entryId }, "[brd-ai] scheduleBrdAnalysis failed");
  }
}

/**
 * Trigger analysis immediately (used by the admin "Re-analyse" button).
 * Returns a promise that resolves when the analysis is complete (or has
 * failed and been logged).
 */
export async function runBrdAnalysisNow(entryId: number): Promise<void> {
  const existing = scheduledTimers.get(entryId);
  if (existing) {
    clearTimeout(existing);
    scheduledTimers.delete(entryId);
  }
  await analyseRevenueEntryBrd(entryId);
}
