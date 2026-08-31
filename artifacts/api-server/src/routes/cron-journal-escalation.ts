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
import { getActiveSeasonId } from "../lib/season";
import { tryAcquireCronLock } from "../lib/cron-lock";
import {
  resolvePreviousReportWeek,
  computeCampusWeekReports,
  resolveCampusTagRecipients,
  computeWeekGrid,
  type WeekRef,
  type CampusWeekReport,
} from "../lib/journal-reports";

const router: IRouter = Router();

// Cross-instance guard: the admin-level blast sends one campus-wide email to
// every notification subscriber. Two near-simultaneous triggers (a cron-job.org
// retry, or two running instances) could both pass the "already sent?" check
// before either writes its log row and double-send. The campusId is NULL for
// admin rows, so the existing unique constraint cannot dedup them. A Postgres
// advisory lock serialises the whole escalation run across every instance.
const ESCALATION_LOCK = "cron:journal-escalation";

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

// Map weekday → escalation level, computed in Asia/Kolkata (the programme's
// timezone) rather than the server's UTC clock. Without this, a job scheduled
// late in the IST evening lands on the next UTC day and resolves the wrong
// level. Wed → Success Coach, Thu → COS, Fri → Admin.
function levelForToday(): Level | null {
  const weekday = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Kolkata",
    weekday: "short",
  }).format(new Date());
  if (weekday === "Wed") return "success_coach";
  if (weekday === "Thu") return "cos";
  if (weekday === "Fri") return "admin";
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
    seasonId: opts.week.seasonId,
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

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// Admin escalation email rendered as an HTML table (campus-wise submission
// status). The plain-text bullet list is still sent alongside as a fallback.
function renderAdminEscalationHtml(
  week: WeekRef,
  reports: CampusWeekReport[],
  link: string,
): string {
  const totals = reports.reduce(
    (acc, r) => ({
      submitted: acc.submitted + r.submittedCount,
      total: acc.total + r.totalTeams,
      pending: acc.pending + r.notSubmittedCount,
    }),
    { submitted: 0, total: 0, pending: 0 },
  );

  const cell = "padding:8px 12px;border:1px solid #e5e7eb;font-size:14px;";
  const rowsHtml = reports
    .map((r, i) => {
      const bg = i % 2 === 0 ? "#ffffff" : "#f9fafb";
      const pendingColor =
        r.notSubmittedCount > 0
          ? "color:#b91c1c;font-weight:600;"
          : "color:#059669;";
      return `<tr style="background:${bg};">
        <td style="${cell}">${escapeHtml(r.campusName)}</td>
        <td style="${cell}text-align:center;">${r.submittedCount}/${r.totalTeams}</td>
        <td style="${cell}text-align:center;${pendingColor}">${r.notSubmittedCount}</td>
      </tr>`;
    })
    .join("");

  const th =
    "padding:10px 12px;border:1px solid #e5e7eb;font-size:14px;color:#ffffff;";
  return `<div style="font-family:Arial,Helvetica,sans-serif;color:#111827;max-width:640px;">
  <h2 style="font-size:18px;margin:0 0 4px;">Weekly journal escalation</h2>
  <p style="margin:0 0 16px;color:#6b7280;font-size:14px;">${escapeHtml(weekLabel(week))}</p>
  <table style="border-collapse:collapse;width:100%;">
    <thead>
      <tr style="background:#b91c1c;">
        <th style="${th}text-align:left;">Campus</th>
        <th style="${th}text-align:center;">Submitted</th>
        <th style="${th}text-align:center;">Pending</th>
      </tr>
    </thead>
    <tbody>
      ${rowsHtml}
      <tr style="background:#f3f4f6;font-weight:700;">
        <td style="${cell}">Total</td>
        <td style="${cell}text-align:center;">${totals.submitted}/${totals.total}</td>
        <td style="${cell}text-align:center;">${totals.pending}</td>
      </tr>
    </tbody>
  </table>
  <p style="margin:16px 0;font-size:14px;">
    <a href="${link}" style="color:#b91c1c;font-weight:600;">View full report →</a>
  </p>
</div>`;
}

router.post(
  "/internal/cron/journal-escalation",
  async (req: Request, res: Response): Promise<void> => {
    if (!verifyCronSecret(req, res)) return;

    // Serialise the whole run across instances with a Postgres advisory lock so
    // two near-simultaneous triggers (a cron-job.org retry, or two running
    // instances) can never both pass the "already sent?" check and double-send.
    // Released in `finally` so the lock lifetime tracks actual execution — a
    // client/proxy disconnect must not free it while work is still running.
    const lock = await tryAcquireCronLock(ESCALATION_LOCK);
    if (!lock) {
      logger.warn("[cron-escalation] run already in flight — skipping trigger");
      res.status(202).json({ ok: true, alreadyRunning: true });
      return;
    }
    try {
      await runJournalEscalation(req, res);
    } finally {
      await lock.release();
    }
  },
);

// Body of the journal-escalation run, extracted so the route handler can hold
// the advisory lock across the entire execution via try/finally. Every early
// `return` below just ends the run; the caller always releases the lock.
async function runJournalEscalation(
  req: Request,
  res: Response,
): Promise<void> {
  // A cron has no viewer, so this is always the ACTIVE season's toggle.
  const [cfg] = await db
    .select({ enabled: programmeConfigTable.escalationEnabled })
    .from(programmeConfigTable)
    .where(eq(programmeConfigTable.seasonId, await getActiveSeasonId()))
    .limit(1);
  if (cfg && cfg.enabled === false) {
    res.status(202).json({ ok: true, reason: "escalation_disabled" });
    return;
  }

  const bodyLevel = (req.body?.level ?? req.query.level) as Level | undefined;
  const level: Level | null = bodyLevel ?? levelForToday();
  if (!level) {
    res.status(202).json({ ok: true, reason: "no_escalation_scheduled_today" });
    return;
  }

  // Escalation chases the week that just closed on Tuesday, NOT the week that
  // contains today (which started Wed and isn't due yet).
  const week = await resolvePreviousReportWeek();
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
    const html = renderAdminEscalationHtml(week, reports, link);

    let sent = 0;
    for (const s of subs) {
      const ok = await sendEmail({ category: "journalEscalations",
        to: { email: s.email, name: s.name ?? undefined },
        subject: `[BRAVE] Journal report — ${weekLabel(week)}`,
        text,
        html,
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
      const ok = await sendEmail({ category: "journalEscalations",
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
}

// Weekly Friday report — full week grid + campus summary, emailed (as a link)
// to admin notification subscribers.
router.post(
  "/internal/cron/weekly-journal-report",
  async (req: Request, res: Response): Promise<void> => {
    if (!verifyCronSecret(req, res)) return;

    // The weekly report covers the week that just closed on Tuesday, matching
    // the escalation chain (see resolvePreviousReportWeek).
    const week = await resolvePreviousReportWeek();
    if (!week) {
      res.status(202).json({ ok: true, reason: "no_programme_week" });
      return;
    }
    const grid = await computeWeekGrid(week.seasonId);
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
      const ok = await sendEmail({ category: "journalEscalations",
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
