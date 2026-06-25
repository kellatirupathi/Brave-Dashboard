// Schedules the per-journal reel scan shortly after a journal is submitted or
// edited. Mirrors journal-scheduler.ts. Never throws. If the server restarts
// before the timer fires, the startup catch-up sweep picks it up.
import { logger } from "../logger";
import {
  analyseJournalReel,
  analyseAllPendingJournalReels,
} from "./analyse-journal-reel";

const SCAN_DELAY_MS = 35 * 1000;

const scheduledTimers = new Map<number, NodeJS.Timeout>();

export function scheduleJournalReelScan(journalId: number): void {
  try {
    const existing = scheduledTimers.get(journalId);
    if (existing) {
      clearTimeout(existing);
      scheduledTimers.delete(journalId);
    }
    const timer = setTimeout(() => {
      scheduledTimers.delete(journalId);
      void analyseJournalReel(journalId).catch((err) => {
        logger.error({ err, journalId }, "[reel-scan] scheduled run threw");
      });
    }, SCAN_DELAY_MS);
    if (typeof timer.unref === "function") timer.unref();
    scheduledTimers.set(journalId, timer);
  } catch (err) {
    logger.error(
      { err, journalId },
      "[reel-scan] scheduleJournalReelScan failed",
    );
  }
}

// Admin per-journal "Re-scan" — run now, resolve when done. Returns true if a
// verdict was stored.
export async function runJournalReelScanNow(
  journalId: number,
): Promise<boolean> {
  const existing = scheduledTimers.get(journalId);
  if (existing) {
    clearTimeout(existing);
    scheduledTimers.delete(journalId);
  }
  return analyseJournalReel(journalId);
}

// One-shot boot sweep: scan any journals never reel-scanned.
export async function catchUpPendingJournalReelScans(): Promise<void> {
  try {
    await analyseAllPendingJournalReels(200);
  } catch (err) {
    logger.error({ err }, "[reel-scan] catch-up sweep failed");
  }
}
