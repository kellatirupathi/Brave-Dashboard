/**
 * Admin Reports — campus-wise journal submission reports + saved report links.
 *
 * Login-gated (admin + coordinator). The escalation/weekly crons persist
 * snapshots into journal_report_links; this router serves the live tables and
 * the saved-link viewer.
 */
import { Router, type IRouter, type Request, type Response } from "express";
import { and, desc, eq } from "drizzle-orm";
import {
  db,
  journalReportLinksTable,
  journalEscalationLogTable,
} from "@workspace/db";
import {
  resolveReportWeek,
  listAllWeeks,
  computeCampusWeekReports,
} from "../lib/journal-reports";
import { resolveSeason } from "../lib/season";

const router: IRouter = Router();

function requireStaff(req: Request, res: Response): boolean {
  if (
    !req.isAuthenticated() ||
    (req.user.role !== "admin" && req.user.role !== "coordinator")
  ) {
    res.status(403).json({ error: "Forbidden" });
    return false;
  }
  return true;
}

function requireAdmin(req: Request, res: Response): boolean {
  if (!req.isAuthenticated() || req.user.role !== "admin") {
    res.status(403).json({ error: "Forbidden" });
    return false;
  }
  return true;
}

// Programme weeks for the report week filter.
router.get(
  "/admin/reports/weeks",
  async (req: Request, res: Response): Promise<void> => {
    if (!requireAdmin(req, res)) return;
    const weeks = await listAllWeeks(await resolveSeason(req));
    res.json({ weeks });
  },
);

// Campus-wise summary table. ?weekId=<id> for one week, ?weekId=all to
// aggregate across every week, or omit for the current week.
router.get(
  "/admin/reports/campus-summary",
  async (req: Request, res: Response): Promise<void> => {
    if (!requireAdmin(req, res)) return;
    const isAll = req.query.weekId === "all";

    if (isAll) {
      const weeks = await listAllWeeks(await resolveSeason(req));
      // Aggregate submitted counts across all weeks per campus.
      const agg = new Map<
        number,
        { campusName: string; totalTeams: number; submitted: number }
      >();
      for (const w of weeks) {
        const reports = await computeCampusWeekReports(w);
        for (const r of reports) {
          const cur = agg.get(r.campusId) ?? {
            campusName: r.campusName,
            totalTeams: r.totalTeams,
            submitted: 0,
          };
          cur.submitted += r.submittedCount;
          cur.totalTeams = r.totalTeams; // active team count (week-invariant)
          agg.set(r.campusId, cur);
        }
      }
      const rows = Array.from(agg.entries()).map(([campusId, v]) => ({
        campusId,
        campusName: v.campusName,
        totalTeams: v.totalTeams,
        submittedTeams: v.submitted,
        notSubmittedTeams: Math.max(
          0,
          v.totalTeams * weeks.length - v.submitted,
        ),
        mailedSuccessCoach: false,
        mailedCos: false,
        mailedAdmin: false,
      }));
      res.json({ week: null, weekId: "all", weeksCount: weeks.length, rows });
      return;
    }

    const weekId = req.query.weekId ? Number(req.query.weekId) : undefined;
    const week = await resolveReportWeek(
      weekId && Number.isFinite(weekId) ? weekId : undefined,
      await resolveSeason(req),
    );
    if (!week) {
      res.json({ week: null, rows: [] });
      return;
    }
    const reports = await computeCampusWeekReports(week);

    // Which escalation levels have been mailed for this week, per campus.
    const logs = await db
      .select({
        campusId: journalEscalationLogTable.campusId,
        level: journalEscalationLogTable.level,
      })
      .from(journalEscalationLogTable)
      .where(eq(journalEscalationLogTable.weekId, week.id));
    const mailed = new Map<string, boolean>();
    for (const l of logs) mailed.set(`${l.campusId}|${l.level}`, true);

    const rows = reports.map((r) => ({
      campusId: r.campusId,
      campusName: r.campusName,
      totalTeams: r.totalTeams,
      submittedTeams: r.submittedCount,
      notSubmittedTeams: r.notSubmittedCount,
      mailedSuccessCoach: mailed.get(`${r.campusId}|success_coach`) ?? false,
      mailedCos: mailed.get(`${r.campusId}|cos`) ?? false,
      mailedAdmin: mailed.get(`${r.campusId}|admin`) ?? false,
    }));
    res.json({
      week: {
        weekId: week.id,
        weekNumber: week.weekNumber,
        startDate: week.startDate,
        endDate: week.endDate,
      },
      rows,
    });
  },
);

// Drill-down: one campus's team-by-team status for a week.
router.get(
  "/admin/reports/campus/:campusId",
  async (req: Request, res: Response): Promise<void> => {
    if (!requireAdmin(req, res)) return;
    const campusId = Number(req.params.campusId);
    if (!Number.isInteger(campusId)) {
      res.status(400).json({ error: "Invalid campusId" });
      return;
    }
    const weekId = req.query.weekId ? Number(req.query.weekId) : undefined;
    const week = await resolveReportWeek(
      weekId && Number.isFinite(weekId) ? weekId : undefined,
      await resolveSeason(req),
    );
    if (!week) {
      res.json({ week: null, campus: null });
      return;
    }
    const [report] = await computeCampusWeekReports(week, campusId);
    res.json({
      week: {
        weekId: week.id,
        weekNumber: week.weekNumber,
        startDate: week.startDate,
        endDate: week.endDate,
      },
      campus: report ?? null,
    });
  },
);

// CSV export of one campus's team status for a week.
router.get(
  "/admin/reports/campus/:campusId/export",
  async (req: Request, res: Response): Promise<void> => {
    if (!requireAdmin(req, res)) return;
    const campusId = Number(req.params.campusId);
    if (!Number.isInteger(campusId)) {
      res.status(400).json({ error: "Invalid campusId" });
      return;
    }
    const weekId = req.query.weekId ? Number(req.query.weekId) : undefined;
    const week = await resolveReportWeek(
      weekId && Number.isFinite(weekId) ? weekId : undefined,
      await resolveSeason(req),
    );
    if (!week) {
      res.status(404).json({ error: "No week to export" });
      return;
    }
    const [report] = await computeCampusWeekReports(week, campusId);
    const esc = (s: string) => `"${(s ?? "").replace(/"/g, '""')}"`;
    const lines = [
      "Team,Submitted,Submitted By,Submitted At,Week,Week Start,Week End",
    ];
    for (const t of report?.teams ?? []) {
      lines.push(
        [
          esc(t.teamName),
          t.submitted ? "Yes" : "No",
          esc(t.submittedByRole ?? ""),
          esc(t.submittedAt ? new Date(t.submittedAt).toISOString() : ""),
          `Week ${week.weekNumber}`,
          week.startDate,
          week.endDate,
        ].join(","),
      );
    }
    const csv = lines.join("\n");
    const fname = `journal-report-campus-${campusId}-week-${week.weekNumber}.csv`;
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${fname}"`);
    res.send(csv);
  },
);

// Saved report links (escalation + weekly snapshots).
router.get(
  "/admin/reports/links",
  async (req: Request, res: Response): Promise<void> => {
    if (!requireAdmin(req, res)) return;
    const rows = await db
      .select()
      .from(journalReportLinksTable)
      .orderBy(desc(journalReportLinksTable.createdAt))
      .limit(500);
    res.json({ links: rows });
  },
);

// Login-gated report viewer by token. Admins see any; coordinators only their
// own campus's links.
router.get(
  "/reports/view/:token",
  async (req: Request, res: Response): Promise<void> => {
    if (!requireStaff(req, res)) return;
    const [row] = await db
      .select()
      .from(journalReportLinksTable)
      .where(eq(journalReportLinksTable.token, String(req.params.token)));
    if (!row) {
      res.status(404).json({ error: "Report not found" });
      return;
    }
    if (
      req.user!.role === "coordinator" &&
      row.campusId != null &&
      row.campusId !== req.user!.campusId
    ) {
      res.status(403).json({ error: "Not your campus report." });
      return;
    }
    res.json({ report: row });
  },
);

export default router;
