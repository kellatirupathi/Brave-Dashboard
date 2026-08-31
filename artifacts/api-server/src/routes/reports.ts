/**
 * Admin Reports — campus-wise journal submission reports + saved report links.
 *
 * Login-gated (admin + coordinator). The escalation/weekly crons persist
 * snapshots into journal_report_links; this router serves the live tables and
 * the saved-link viewer.
 */
import { Router, type IRouter, type Request, type Response } from "express";
import { and, desc, eq, isNull, or } from "drizzle-orm";
import {
  db,
  journalReportLinksTable,
  journalEscalationLogTable,
  programmeWeeksTable,
} from "@workspace/db";
import {
  resolveReportWeek,
  listAllWeeks,
  computeCampusWeekReports,
} from "../lib/journal-reports";
import { getSeasonById, resolveSeason, SEASON_1_ID } from "../lib/season";

const router: IRouter = Router();

function filenamePart(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]/g, "-");
}

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
    const seasonId = await resolveSeason(req);
    const season = await getSeasonById(seasonId);
    const weekId = req.query.weekId ? Number(req.query.weekId) : undefined;
    const week = await resolveReportWeek(
      weekId && Number.isFinite(weekId) ? weekId : undefined,
      seasonId,
    );
    if (!week) {
      res.status(404).json({ error: "No week to export" });
      return;
    }
    const [report] = await computeCampusWeekReports(week, campusId);
    const esc = (s: string) => `"${(s ?? "").replace(/"/g, '""')}"`;
    const seasonLabel =
      season?.name ?? season?.slug ?? `Season ${seasonId}`;
    const lines = [
      "Team,Submitted,Submitted By,Submitted At,Week,Week Start,Week End,Season",
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
          esc(seasonLabel),
        ].join(","),
      );
    }
    const csv = lines.join("\n");
    const seasonPart = season?.slug
      ? `-season-${filenamePart(season.slug)}`
      : "";
    const fname = `journal-report-campus-${campusId}${seasonPart}-week-${week.weekNumber}.csv`;
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
    const seasonId = await resolveSeason(req);
    const rows = await db
      .select({
        id: journalReportLinksTable.id,
        token: journalReportLinksTable.token,
        scope: journalReportLinksTable.scope,
        kind: journalReportLinksTable.kind,
        campusId: journalReportLinksTable.campusId,
        campusName: journalReportLinksTable.campusName,
        storedSeasonId: journalReportLinksTable.seasonId,
        weekSeasonId: programmeWeeksTable.seasonId,
        weekId: journalReportLinksTable.weekId,
        weekLabel: journalReportLinksTable.weekLabel,
        title: journalReportLinksTable.title,
        payload: journalReportLinksTable.payload,
        createdAt: journalReportLinksTable.createdAt,
      })
      .from(journalReportLinksTable)
      .leftJoin(
        programmeWeeksTable,
        eq(programmeWeeksTable.id, journalReportLinksTable.weekId),
      )
      .where(
        seasonId === SEASON_1_ID
          ? or(
              eq(journalReportLinksTable.seasonId, seasonId),
              and(
                isNull(journalReportLinksTable.seasonId),
                eq(programmeWeeksTable.seasonId, seasonId),
              ),
              // Snapshots created before seasons are Season 1 history. If a
              // later week regeneration removed their week row, keep them
              // discoverable in the Season 1 archive without rewriting data.
              and(
                isNull(journalReportLinksTable.seasonId),
                isNull(programmeWeeksTable.id),
              ),
            )
          : or(
              eq(journalReportLinksTable.seasonId, seasonId),
              and(
                isNull(journalReportLinksTable.seasonId),
                eq(programmeWeeksTable.seasonId, seasonId),
              ),
            ),
      )
      .orderBy(desc(journalReportLinksTable.createdAt))
      .limit(500);
    res.json({
      links: rows.map(
        ({ storedSeasonId, weekSeasonId, ...row }) => ({
          ...row,
          seasonId: storedSeasonId ?? weekSeasonId ?? SEASON_1_ID,
        }),
      ),
    });
  },
);

// Login-gated report viewer by token. Admins see any; coordinators only their
// own campus's links.
router.get(
  "/reports/view/:token",
  async (req: Request, res: Response): Promise<void> => {
    if (!requireStaff(req, res)) return;
    const [row] = await db
      .select({
        id: journalReportLinksTable.id,
        token: journalReportLinksTable.token,
        scope: journalReportLinksTable.scope,
        kind: journalReportLinksTable.kind,
        campusId: journalReportLinksTable.campusId,
        campusName: journalReportLinksTable.campusName,
        storedSeasonId: journalReportLinksTable.seasonId,
        weekSeasonId: programmeWeeksTable.seasonId,
        weekId: journalReportLinksTable.weekId,
        weekLabel: journalReportLinksTable.weekLabel,
        title: journalReportLinksTable.title,
        payload: journalReportLinksTable.payload,
        createdAt: journalReportLinksTable.createdAt,
      })
      .from(journalReportLinksTable)
      .leftJoin(
        programmeWeeksTable,
        eq(programmeWeeksTable.id, journalReportLinksTable.weekId),
      )
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
    const seasonId = row.storedSeasonId ?? row.weekSeasonId ?? null;
    const season = seasonId == null ? null : await getSeasonById(seasonId);
    const { storedSeasonId: _storedSeasonId, weekSeasonId: _weekSeasonId, ...report } =
      row;
    res.json({
      report: {
        ...report,
        seasonId,
        seasonName: season?.name ?? null,
        seasonSlug: season?.slug ?? null,
      },
    });
  },
);

export default router;
