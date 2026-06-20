/**
 * Journal escalation + weekly report crons (campus-wise).
 *
 *   POST /internal/cron/journal-escalation   Header: X-Cron-Secret
 *   POST /internal/cron/weekly-journal-report Header: X-Cron-Secret
 *
 * Escalation chain after the Tue EOD journal deadline:
 *   Wed 6 PM → Success Coach   (coordinators tagged "Success Coach")
 *   Thu 6 PM → COS             (coordinators tagged "COS")
 *   Fri 6 PM → Admin           (notification subscribers)
 * Each email carries a unique, login-gated report link. Every send is logged so
 * re-runs never double-send and the Reports table can show "mailed?" marks.
 */
import { Router, type IRouter, type Request, type Response } from "express";
import { randomUUID } from "crypto";
import { eq, and } from "drizzle-orm";
import {
  db,
  programmeConfigTable,
  journalReportLinksTable,
  journalEscalationLogTable,
  overdueNotificationSubscribersTable,
} from "@workspace/db";
import { sendEmail, getAppUrl } from "../lib/email/brevo";
import { logger } from "../lib/logger";
import {
  resolveReportWeek,
  computeCampusWeekReports,
  resolveCampusTagRecipients,
  computeWeekGrid,
  type WeekRef,
  type CampusWeekReport,
} from "../lib/journal-reports";

const router: IRouter = Router();

function verifyCronSecret(req: Request, res: Response): boolean {
  const expected = process.env.CRON_SECRET;
  if (!expected) {
    logger.error("[cron-escalation] CRON_SECRET not configured");
    res.status(500).json({ error: "CRON_SECRET not configured" });
    return false;
  }
  if (req.header("x-cron-secret") !== expected) {
    res.status(403).json({ error: "Invalid cron secret" });
    return false;
  }
  return true;
}

type Level = "success_coach" | "cos" | "admin";

const TAG_FOR_LEVEL: Record<"success_coach" | "cos", string> = {
  success_coach: "Success Coach",
  cos: "COS",
};

const LEVEL_LABEL: Record<Level, string> = {
  success_coach: "Success Coach",
  cos: "COS",
  admin: "Admin",
};

// Map weekday → escalation level (server local time). Wed=3, Thu=4, Fri=5.
function levelForToday(): Level | null {
  const day = new Date().getDay();
  if (day === 3) return "success_coach";
  if (day === 4) return "cos";
  if (day === 5) return "admin";
  return null;
}

function weekLabel(week: WeekRef): string {
  return `Week ${week.weekNumber} (${week.startDate} → ${week.endDate})`;
}

async function persistReportLink(opts: {
  scope: "campus" | "admin";
  kind: string;
  campusId: number | null;
  campusName: string | null;
  week: WeekRef;
  title: string;
  payload: unknown;
}): Promise<string> {
  const token = randomUUID();
  await db.insert(journalReportLinksTable).values({
    token,
    scope: opts.scope,
    kind: opts.kind,
    campusId: opts.campusId,
    campusName: opts.campusName,
    weekId: opts.week.id,
    weekLabel: weekLabel(opts.week),
    title: opts.title,
    payload: opts.payload as object,
  });
  return token;
}

function missingTeamsText(report: CampusWeekReport): string {
  const missing = report.teams.filter((t) => !t.submitted);
  if (missing.length === 0) return "All teams submitted. 🎉";
  return missing.map((t) => `  • ${t.teamName}`).join("\n");
}

router.post(
  "/internal/cron/journal-escalation",
  async (req: Request, res: Response): Promise<void> => {
    if (!verifyCronSecret(req, res)) return;

    const [cfg] = await db
      .select({ enabled: programmeConfigTable.escalationEnabled })
      .from(programmeConfigTable)
      .limit(1);
    if (cfg && cfg.enabled === false) {
      res.status(202).json({ ok: true, reason: "escalation_disabled" });
      return;
    }

    const bodyLevel = (req.body?.level ?? req.query.level) as Level | undefined;
    const level: Level | null = bodyLevel ?? levelForToday();
    if (!level) {
      res
        .status(202)
        .json({ ok: true, reason: "no_escalation_scheduled_today" });
      return;
    }

    const week = await resolveReportWeek();
    if (!week) {
      res.status(202).json({ ok: true, reason: "no_programme_week" });
      return;
    }

    const appUrl = getAppUrl();
    const reports = await computeCampusWeekReports(week);

    // ── Admin level: one campus-wide report to notification subscribers ──────
    if (level === "admin") {
      const already = await db
        .select({ id: journalEscalationLogTable.id })
        .from(journalEscalationLogTable)
        .where(
          and(
            eq(journalEscalationLogTable.weekId, week.id),
            eq(journalEscalationLogTable.level, "admin"),
          ),
        );
      if (already.length > 0) {
        res.status(202).json({ ok: true, reason: "admin_already_sent" });
        return;
      }
      const subs = await db
        .select({
          email: overdueNotificationSubscribersTable.email,
          name: overdueNotificationSubscribersTable.name,
        })
        .from(overdueNotificationSubscribersTable)
        .where(eq(overdueNotificationSubscribersTable.isActive, true));

      const token = await persistReportLink({
        scope: "admin",
        kind: "escalation_admin",
        campusId: null,
        campusName: null,
        week,
        title: `Campus-wise journal report — ${weekLabel(week)}`,
        payload: { week, campuses: reports },
      });
      const link = `${appUrl}/reports/view/${token}`;
      const summary = reports
        .map(
          (r) =>
            `  • ${r.campusName}: ${r.submittedCount}/${r.totalTeams} submitted, ${r.notSubmittedCount} pending`,
        )
        .join("\n");
      const text = `Weekly journal escalation — ${weekLabel(week)}\n\nCampus-wise submission status:\n${summary}\n\nFull report: ${link}\n`;

      let sent = 0;
      for (const s of subs) {
        const ok = await sendEmail({
          to: { email: s.email, name: s.name ?? undefined },
          subject: `[BRAVE] Journal report — ${weekLabel(week)}`,
          text,
        });
        if (ok) sent += 1;
      }
      await db
        .insert(journalEscalationLogTable)
        .values({
          campusId: null,
          weekId: week.id,
          level: "admin",
          recipientCount: sent,
          reportToken: token,
        })
        .onConflictDoNothing();
      res.status(202).json({ ok: true, level, campuses: reports.length, sent });
      return;
    }

    // ── Success Coach / COS level: per-campus to tagged coordinators ─────────
    const tagName = TAG_FOR_LEVEL[level];
    let campusesMailed = 0;
    let totalRecipients = 0;
    for (const report of reports) {
      if (report.notSubmittedCount === 0) continue; // nothing to escalate

      // Skip if already sent for this campus + week + level.
      const already = await db
        .select({ id: journalEscalationLogTable.id })
        .from(journalEscalationLogTable)
        .where(
          and(
            eq(journalEscalationLogTable.campusId, report.campusId),
            eq(journalEscalationLogTable.weekId, week.id),
            eq(journalEscalationLogTable.level, level),
          ),
        );
      if (already.length > 0) continue;

      const recipients = await resolveCampusTagRecipients(
        report.campusId,
        tagName,
      );
      const token = await persistReportLink({
        scope: "campus",
        kind: `escalation_${level}`,
        campusId: report.campusId,
        campusName: report.campusName,
        week,
        title: `${report.campusName} — ${LEVEL_LABEL[level]} escalation — ${weekLabel(week)}`,
        payload: { week, campus: report },
      });
      const link = `${appUrl}/reports/view/${token}`;
      const text = `Journal escalation (${LEVEL_LABEL[level]}) — ${report.campusName}\n${weekLabel(week)}\n\nSubmitted: ${report.submittedCount}/${report.totalTeams}\nPending teams (${report.notSubmittedCount}):\n${missingTeamsText(report)}\n\nFull report: ${link}\n`;

      let sent = 0;
      for (const r of recipients) {
        const ok = await sendEmail({
          to: { email: r.email, name: r.firstName ?? undefined },
          subject: `[BRAVE] ${LEVEL_LABEL[level]} — ${report.campusName} journals pending (${weekLabel(week)})`,
          text,
        });
        if (ok) sent += 1;
      }
      await db
        .insert(journalEscalationLogTable)
        .values({
          campusId: report.campusId,
          weekId: week.id,
          level,
          recipientCount: sent,
          reportToken: token,
        })
        .onConflictDoNothing();
      campusesMailed += 1;
      totalRecipients += sent;
    }

    res.status(202).json({
      ok: true,
      level,
      week: week.weekNumber,
      campusesMailed,
      totalRecipients,
    });
  },
);

// Weekly Friday report — full week grid + campus summary, emailed (as a link)
// to admin notification subscribers.
router.post(
  "/internal/cron/weekly-journal-report",
  async (req: Request, res: Response): Promise<void> => {
    if (!verifyCronSecret(req, res)) return;

    const week = await resolveReportWeek();
    if (!week) {
      res.status(202).json({ ok: true, reason: "no_programme_week" });
      return;
    }
    const grid = await computeWeekGrid();
    const campuses = await computeCampusWeekReports(week);

    const token = await persistReportLink({
      scope: "admin",
      kind: "weekly_admin",
      campusId: null,
      campusName: null,
      week,
      title: `Weekly journal report — ${weekLabel(week)}`,
      payload: {
        week,
        campusSummary: campuses.map((c) => ({
          campusName: c.campusName,
          totalTeams: c.totalTeams,
          submitted: c.submittedCount,
          pending: c.notSubmittedCount,
        })),
        grid,
      },
    });
    const appUrl = getAppUrl();
    const link = `${appUrl}/reports/view/${token}`;

    const subs = await db
      .select({
        email: overdueNotificationSubscribersTable.email,
        name: overdueNotificationSubscribersTable.name,
      })
      .from(overdueNotificationSubscribersTable)
      .where(eq(overdueNotificationSubscribersTable.isActive, true));

    const text = `Weekly BRAVE journal report — ${weekLabel(week)}\n\n${campuses
      .map(
        (c) =>
          `  • ${c.campusName}: ${c.submittedCount}/${c.totalTeams} submitted`,
      )
      .join(
        "\n",
      )}\n\nFull report (Journal status, Campus summary, week grid): ${link}\n`;

    let sent = 0;
    for (const s of subs) {
      const ok = await sendEmail({
        to: { email: s.email, name: s.name ?? undefined },
        subject: `[BRAVE] Weekly journal report — ${weekLabel(week)}`,
        text,
      });
      if (ok) sent += 1;
    }
    res.status(202).json({ ok: true, token, sent, campuses: campuses.length });
  },
);

export default router;
