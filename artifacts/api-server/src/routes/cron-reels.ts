/**
 * Daily reel-script generation cron (additive, isolated).
 *
 *   POST /internal/cron/generate-reels   Header: X-Cron-Secret
 *
 * Schedule it on cron-job.org once per day (e.g. 6 PM IST). It analyses the
 * weekly journals submitted in the last 24 hours and stores one Gemini-written
 * reel script per reel-worthy journal. Fire-and-forget: responds 202 instantly
 * so cron-job.org never times out, then runs the (slow) Gemini job in the
 * background.
 */
import { Router, type IRouter, type Request, type Response } from "express";
import { generateReelsForWindow } from "../lib/ai/generate-reels";
import { logger } from "../lib/logger";

const router: IRouter = Router();

// Guards against overlapping runs if cron-job.org retries while a (slow) Gemini
// generation pass is still in flight.
let reelsRunInFlight = false;

router.post(
  "/internal/cron/generate-reels",
  (req: Request, res: Response): void => {
    const expected = process.env.CRON_SECRET;
    if (!expected) {
      logger.error("[cron-reels] CRON_SECRET not configured");
      res.status(500).json({ error: "CRON_SECRET not configured" });
      return;
    }
    if (req.header("x-cron-secret") !== expected) {
      res.status(403).json({ error: "Invalid cron secret" });
      return;
    }

    if (reelsRunInFlight) {
      logger.warn("[cron-reels] run already in flight — skipping this trigger");
      res.status(202).json({ ok: true, alreadyRunning: true });
      return;
    }

    // Fire-and-forget: respond immediately, then run in the background.
    reelsRunInFlight = true;
    res.status(202).json({ ok: true, queued: true });

    logger.info("[cron-reels] generation run starting (background)");
    generateReelsForWindow(new Date())
      .then((result) => {
        logger.info(result, "[cron-reels] generation run done");
      })
      .catch((err) => {
        logger.error({ err }, "[cron-reels] generation run failed");
      })
      .finally(() => {
        reelsRunInFlight = false;
      });
  },
);

export default router;
