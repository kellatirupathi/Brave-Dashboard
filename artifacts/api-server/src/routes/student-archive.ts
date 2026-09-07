/**
 * Student-facing history across seasons (additive, isolated, READ-ONLY).
 *
 * Two things live here, both answering "what did I do before this season":
 *
 *   1. Performance figures for ONE season, or every season combined, so the
 *      dashboard's snapshot can be filtered without touching the live summary
 *      endpoint that GRIT Miles and the leaderboard already read.
 *   2. The weekly journals and projects of an EARLIER season, for the Past
 *      Seasons page.
 *
 * READ-ONLY BY CONSTRUCTION. Every route here is a GET and there is no writing
 * counterpart anywhere in this file. Season 1 is a settled archive; a student
 * must be able to read it back and must never be able to change it. That is
 * enforced by the absence of a write path, not by a flag somebody could forget
 * to check.
 *
 * The caller's own team is always resolved server-side from the session. No
 * endpoint here accepts a teamId, so one student cannot read another's history
 * by editing a query string.
 *
 * Deleting the feature means removing the single `router.use(...)` line in
 * routes/index.ts plus its import.
 */
import { Router, type IRouter, type Request, type Response } from "express";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import {
  db,
  teamMembersTable,
  weeklyJournalsTable,
  programmeWeeksTable,
  projectsTable,
  revenueEntriesTable,
  seasonsTable,
} from "@workspace/db";
import { resolveSeason } from "../lib/season";
import { logger } from "../lib/logger";

const router: IRouter = Router();

/** The caller's team, or null when they are not on one. */
async function getMyTeamId(userId: string): Promise<number | null> {
  const [row] = await db
    .select({ teamId: teamMembersTable.teamId })
    .from(teamMembersTable)
    .where(eq(teamMembersTable.userId, userId))
    .limit(1);
  return row?.teamId ?? null;
}

/**
 * Parse the `season` query parameter.
 *
 * "all" means every season combined; a number means that one season; absent
 * means the caller's current season. Anything unparseable is treated as absent
 * rather than rejected, so a stale client cannot 400 its way out of a
 * dashboard.
 */
function parseSeasonParam(raw: unknown): number | "all" | null {
  if (typeof raw !== "string") return null;
  if (raw === "all") return "all";
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : null;
}

/**
 * GET /api/student/performance?season=<id|all>
 *
 * The four snapshot figures — verified revenue, order book, national rank and
 * campus rank — for one season or for every season combined.
 *
 * A SEPARATE endpoint on purpose. /dashboard/team-summary is read by GRIT
 * Miles, the progress centre and the KPI tiles, all of which mean "this
 * season"; teaching it to return another season's numbers would change what
 * those callers get. This one is only ever read by the snapshot filter.
 */
router.get(
  "/student/performance",
  async (req: Request, res: Response): Promise<void> => {
    if (!req.isAuthenticated()) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const teamId = await getMyTeamId(req.user.id);
    if (teamId == null) {
      res.status(400).json({ error: "You are not on a team" });
      return;
    }

    const requested = parseSeasonParam(req.query["season"]);
    const currentSeason = await resolveSeason(req);
    const scope: number | "all" = requested ?? currentSeason;

    // One predicate reused across every sub-query below, so the four figures
    // can never disagree about which season they describe.
    const seasonRe =
      scope === "all" ? sql`` : sql`AND re.season_id = ${scope}`;
    const seasonProj =
      scope === "all" ? sql`` : sql`AND season_id = ${scope}`;

    try {
      const totalsP = db.execute<{
        revenue: string;
        orderbook: string;
      }>(sql`
        SELECT
          (SELECT COALESCE(SUM(re.verified_amount), 0)
             FROM revenue_entries re
            WHERE re.team_id = ${teamId}
              AND re.status = 'verified'
              ${seasonRe})                                    AS revenue,
          (SELECT COALESCE(SUM(amount), 0)
             FROM order_book_entries
            WHERE team_id = ${teamId}
              ${seasonProj})                                  AS orderbook
      `);

      // Ranks use the same ordering and eligibility filter as /leaderboard and
      // /dashboard/team-summary — featured first, then verified revenue, then
      // team id — so a rank shown here means the same thing it does there.
      // Combined ("all") ranks a team by its lifetime revenue, which is what
      // the leaderboard's own Overall tab does.
      const ranksP = db.execute<{
        national_rank: string;
        campus_rank: string;
      }>(sql`
        SELECT national_rank, campus_rank FROM (
          SELECT
            t.id,
            ROW_NUMBER() OVER (
              ORDER BY t.is_featured DESC,
                       COALESCE(rev.total, 0) DESC,
                       t.id ASC
            ) AS national_rank,
            ROW_NUMBER() OVER (
              PARTITION BY t.campus_id
              ORDER BY t.is_featured DESC,
                       COALESCE(rev.total, 0) DESC,
                       t.id ASC
            ) AS campus_rank
          FROM teams t
          LEFT JOIN (
            SELECT re.team_id, SUM(re.verified_amount) AS total
            FROM revenue_entries re
            WHERE re.status = 'verified'
              ${seasonRe}
            GROUP BY re.team_id
          ) rev ON rev.team_id = t.id
          WHERE t.status = 'active'
            AND t.is_hidden = FALSE
        ) ranked
        WHERE id = ${teamId}
      `);

      const [totalsRes, ranksRes] = await Promise.all([totalsP, ranksP]);
      const totals = (totalsRes as unknown as {
        rows: Array<{ revenue: string; orderbook: string }>;
      }).rows[0];
      const ranks = (ranksRes as unknown as {
        rows: Array<{ national_rank: string; campus_rank: string }>;
      }).rows[0];

      res.json({
        season: scope,
        verifiedRevenue: Number(totals?.revenue ?? 0),
        orderBook: Number(totals?.orderbook ?? 0),
        // Null when the team is inactive or hidden, so it is not in the ranked
        // set at all — the same shape team-summary already returns.
        nationalRank: ranks?.national_rank ? Number(ranks.national_rank) : null,
        campusRank: ranks?.campus_rank ? Number(ranks.campus_rank) : null,
      });
    } catch (err) {
      logger.error(
        { err, teamId, scope },
        "[student-archive] performance query failed",
      );
      res.status(500).json({ error: "Could not load performance figures." });
    }
  },
);

/**
 * GET /api/student/archive/seasons
 *
 * The seasons this student may look back at: everything BEFORE their current
 * one. Returned with a count of what each holds, so the page can tell an empty
 * season from an absent one without a second round-trip.
 */
router.get(
  "/student/archive/seasons",
  async (req: Request, res: Response): Promise<void> => {
    if (!req.isAuthenticated()) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const teamId = await getMyTeamId(req.user.id);
    if (teamId == null) {
      res.json({ seasons: [] });
      return;
    }

    const currentSeason = await resolveSeason(req);
    const rows = await db
      .select({
        id: seasonsTable.id,
        slug: seasonsTable.slug,
        name: seasonsTable.name,
      })
      .from(seasonsTable)
      .where(sql`${seasonsTable.id} < ${currentSeason}`)
      .orderBy(desc(seasonsTable.id));

    // Counts per earlier season, so the selector and the tab labels agree.
    const seasons = await Promise.all(
      rows.map(async (s) => {
        const [journals] = await db
          .select({ n: sql<number>`count(*)::int` })
          .from(weeklyJournalsTable)
          .where(
            and(
              eq(weeklyJournalsTable.teamId, teamId),
              eq(weeklyJournalsTable.seasonId, s.id),
            ),
          );
        const [projects] = await db
          .select({ n: sql<number>`count(*)::int` })
          .from(projectsTable)
          .where(
            and(
              eq(projectsTable.teamId, teamId),
              eq(projectsTable.seasonId, s.id),
            ),
          );
        return {
          ...s,
          journalCount: Number(journals?.n ?? 0),
          projectCount: Number(projects?.n ?? 0),
        };
      }),
    );

    res.json({ seasons });
  },
);

/**
 * Refuse a season the caller is not entitled to read back.
 *
 * Only strictly EARLIER seasons: this endpoint exists to look backwards, and
 * allowing the current one would create a second, read-only door onto live data
 * that the real pages already serve.
 */
async function assertEarlierSeason(
  req: Request,
  res: Response,
  seasonId: number,
): Promise<boolean> {
  const currentSeason = await resolveSeason(req);
  if (seasonId >= currentSeason) {
    res.status(400).json({
      error: "Only earlier seasons can be viewed here.",
    });
    return false;
  }
  return true;
}

/**
 * GET /api/student/archive/journals?season=<id>
 *
 * The team's weekly journals for an earlier season, newest first.
 */
router.get(
  "/student/archive/journals",
  async (req: Request, res: Response): Promise<void> => {
    if (!req.isAuthenticated()) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    const teamId = await getMyTeamId(req.user.id);
    if (teamId == null) {
      res.json({ journals: [] });
      return;
    }

    const seasonId = parseSeasonParam(req.query["season"]);
    if (typeof seasonId !== "number") {
      res.status(400).json({ error: "A season is required." });
      return;
    }
    if (!(await assertEarlierSeason(req, res, seasonId))) return;

    const rows = await db
      .select({
        id: weeklyJournalsTable.id,
        weekStartDate: weeklyJournalsTable.weekStartDate,
        weekEndDate: weeklyJournalsTable.weekEndDate,
        // The week number lives on programme_weeks, matched on the week's own
        // start date. A left join, because a journal whose week row was later
        // removed must still be readable — it happened, and the archive says so.
        weekNumber: programmeWeeksTable.weekNumber,
        submittedAt: weeklyJournalsTable.submittedAt,
        submittedByRole: weeklyJournalsTable.submittedByRole,
        whatWeDid: weeklyJournalsTable.whatWeDid,
        blockers: weeklyJournalsTable.blockers,
        nextWeekPlan: weeklyJournalsTable.nextWeekPlan,
      })
      .from(weeklyJournalsTable)
      .leftJoin(
        programmeWeeksTable,
        and(
          eq(programmeWeeksTable.seasonId, weeklyJournalsTable.seasonId),
          eq(programmeWeeksTable.startDate, weeklyJournalsTable.weekStartDate),
        ),
      )
      .where(
        and(
          eq(weeklyJournalsTable.teamId, teamId),
          eq(weeklyJournalsTable.seasonId, seasonId),
        ),
      )
      .orderBy(desc(weeklyJournalsTable.weekStartDate));

    res.json({ journals: rows });
  },
);

/**
 * GET /api/student/archive/projects?season=<id>
 *
 * The team's projects for an earlier season, with the verified revenue each
 * one earned so the card can state what it was worth.
 */
router.get(
  "/student/archive/projects",
  async (req: Request, res: Response): Promise<void> => {
    if (!req.isAuthenticated()) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    const teamId = await getMyTeamId(req.user.id);
    if (teamId == null) {
      res.json({ projects: [] });
      return;
    }

    const seasonId = parseSeasonParam(req.query["season"]);
    if (typeof seasonId !== "number") {
      res.status(400).json({ error: "A season is required." });
      return;
    }
    if (!(await assertEarlierSeason(req, res, seasonId))) return;

    const rows = await db
      .select({
        id: projectsTable.id,
        title: projectsTable.title,
        status: projectsTable.status,
        serviceCategory: projectsTable.serviceCategory,
        problemStatement: projectsTable.problemStatement,
        solutionDescription: projectsTable.solutionDescription,
        createdAt: projectsTable.createdAt,
        verifiedRevenue: sql<number>`(
          SELECT COALESCE(SUM(re.verified_amount), 0)::int
          FROM revenue_entries re
          WHERE re.project_id = ${projectsTable.id}
            AND re.status = 'verified'
        )`,
      })
      .from(projectsTable)
      .where(
        and(
          eq(projectsTable.teamId, teamId),
          eq(projectsTable.seasonId, seasonId),
        ),
      )
      .orderBy(asc(projectsTable.createdAt));

    res.json({ projects: rows });
  },
);

export default router;
