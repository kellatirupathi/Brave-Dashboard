// Internal cron endpoint — emails active subscribers a daily digest of any
// revenue review-queue items that have been waiting more than 48 hours.
//
//   POST /internal/cron/overdue-notifications
//   Header: X-Cron-Secret: <CRON_SECRET env var>
//
// IMPORTANT: This file is completely separate from cron-reminders.ts /
// cron.ts (which handles the weekly journal reminders). It does not touch
// any of those reminder flows.
import { Router, type IRouter, type Request, type Response } from "express";
import { eq, and, lt, desc } from "drizzle-orm";
import {
  db,
  revenueEntriesTable,
  teamsTable,
  campusesTable,
  overdueNotificationSubscribersTable,
} from "@workspace/db";
import { sendEmail, getAppUrl } from "../lib/email/brevo";
import { renderOverdueReminderEmail } from "../lib/email/templates/overdue-reminder";
import { logger } from "../lib/logger";

const router: IRouter = Router();

// Match the Review Queue's 48-hour overdue cutoff (admin.ts / dashboard.ts).
const OVERDUE_MS = 48 * 60 * 60 * 1000;

function verifyCronSecret(req: Request, res: Response): boolean {
  const expected = process.env.CRON_SECRET;
  if (!expected) {
    logger.error("[cron-overdue] CRON_SECRET is not configured on the server");
    res.status(500).json({ error: "CRON_SECRET not configured" });
    return false;
  }
  const provided = req.header("x-cron-secret");
  if (provided !== expected) {
    res.status(403).json({ error: "Invalid cron secret" });
    return false;
  }
  return true;
}

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

router.post(
  "/internal/cron/overdue-notifications",
  async (req: Request, res: Response): Promise<void> => {
    if (!verifyCronSecret(req, res)) return;

    // Identify overdue items (submitted ≥48h ago, still in 'submitted' state).
    const cutoff = new Date(Date.now() - OVERDUE_MS);
    let overdueRows: Array<{
      id: number;
      amount: number;
      clientName: string;
      submittedAt: Date | null;
      teamName: string | null;
      campusName: string | null;
    }> = [];
    try {
      overdueRows = await db
        .select({
          id: revenueEntriesTable.id,
          amount: revenueEntriesTable.amount,
          clientName: revenueEntriesTable.clientName,
          submittedAt: revenueEntriesTable.submittedAt,
          teamName: teamsTable.name,
          campusName: campusesTable.name,
        })
        .from(revenueEntriesTable)
        .leftJoin(teamsTable, eq(teamsTable.id, revenueEntriesTable.teamId))
        .leftJoin(campusesTable, eq(campusesTable.id, teamsTable.campusId))
        .where(
          and(
            eq(revenueEntriesTable.status, "submitted"),
            lt(revenueEntriesTable.submittedAt, cutoff),
          ),
        )
        .orderBy(desc(revenueEntriesTable.submittedAt));
    } catch (err) {
      logger.error({ err }, "[cron-overdue] failed to load overdue queue");
      res.status(202).json({
        ok: false,
        reason: "failed_to_load_overdue",
        sent: 0,
        skipped: 0,
      });
      return;
    }

    if (overdueRows.length === 0) {
      res
        .status(202)
        .json({ ok: true, reason: "no_overdue_items", sent: 0, skipped: 0 });
      return;
    }

    const now = Date.now();
    const items = overdueRows.map((r) => ({
      teamName: r.teamName ?? "(unknown team)",
      campusName: r.campusName ?? "(unknown campus)",
      clientName: r.clientName ?? "",
      amount: r.amount ?? 0,
      submittedAt: r.submittedAt ?? new Date(),
      hoursOverdue: r.submittedAt
        ? (now - new Date(r.submittedAt).getTime()) / (60 * 60 * 1000)
        : 48,
    }));

    // Load active subscribers.
    let subscribers: Array<{ email: string; name: string | null }> = [];
    try {
      subscribers = await db
        .select({
          email: overdueNotificationSubscribersTable.email,
          name: overdueNotificationSubscribersTable.name,
        })
        .from(overdueNotificationSubscribersTable)
        .where(eq(overdueNotificationSubscribersTable.isActive, true));
    } catch (err) {
      logger.error({ err }, "[cron-overdue] failed to load subscribers");
      res.status(202).json({
        ok: false,
        reason: "failed_to_load_subscribers",
        sent: 0,
        skipped: 0,
      });
      return;
    }

    if (subscribers.length === 0) {
      res
        .status(202)
        .json({ ok: true, reason: "no_subscribers", sent: 0, skipped: 0 });
      return;
    }

    const appUrl = getAppUrl();
    let sent = 0;
    let skipped = 0;

    // Batch: 10 sends per second with a 1s pause between batches.
    const BATCH_SIZE = 10;
    for (let i = 0; i < subscribers.length; i += BATCH_SIZE) {
      const batch = subscribers.slice(i, i + BATCH_SIZE);
      const results = await Promise.all(
        batch.map(async (s) => {
          try {
            const { subject, text } = renderOverdueReminderEmail({
              recipientName: s.name,
              items,
              totalCount: items.length,
              appUrl,
            });
            const ok = await sendEmail({
              to: { email: s.email, name: s.name ?? undefined },
              subject,
              text,
            });
            return ok ? "sent" : "skipped";
          } catch (err) {
            logger.error(
              { err, email: s.email },
              "[cron-overdue] email send threw",
            );
            return "skipped";
          }
        }),
      );
      for (const r of results) {
        if (r === "sent") sent += 1;
        else skipped += 1;
      }
      if (i + BATCH_SIZE < subscribers.length) {
        await sleep(1000);
      }
    }

    res.status(202).json({
      ok: true,
      sent,
      skipped,
      overdueCount: items.length,
      subscriberCount: subscribers.length,
    });
  },
);

export default router;
