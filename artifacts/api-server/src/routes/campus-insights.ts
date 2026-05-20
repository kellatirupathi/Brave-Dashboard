import { Router, type IRouter } from "express";
import { sql, eq, and, gte, lte } from "drizzle-orm";
import {
  db,
  campusesTable,
  teamsTable,
  weeklyJournalsTable,
  revenueEntriesTable,
  orderBookEntriesTable,
  programmeWeeksTable,
} from "@workspace/db";

const router: IRouter = Router();

function requireAdmin(
  req: Parameters<Parameters<typeof router.get>[1]>[0],
  res: Parameters<Parameters<typeof router.get>[1]>[1],
): boolean {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return false;
  }
  if (req.user.role !== "admin") {
    res.status(403).json({ error: "Forbidden" });
    return false;
  }
  return true;
}

async function getProgrammeWeeksTotal(): Promise<number> {
  const [row] = await db
    .select({ c: sql<number>`count(*)::int` })
    .from(programmeWeeksTable);
  return row?.c ?? 0;
}

// Resolve optional ?week=<weekNumber> into the matching programme_weeks row.
// Returns null when not supplied; throws "invalid" sentinel when supplied but
// not found so callers can return 400.
async function resolveWeekFilter(
  raw: unknown,
): Promise<
  | null
  | "invalid"
  | { id: number; weekNumber: number; startDate: string; endDate: string }
> {
  if (raw === undefined || raw === null || raw === "" || raw === "all")
    return null;
  const n = Number(raw);
  if (!Number.isInteger(n) || n <= 0) return "invalid";
  const [w] = await db
    .select({
      id: programmeWeeksTable.id,
      weekNumber: programmeWeeksTable.weekNumber,
      startDate: programmeWeeksTable.startDate,
      endDate: programmeWeeksTable.endDate,
    })
    .from(programmeWeeksTable)
    .where(eq(programmeWeeksTable.weekNumber, n))
    .limit(1);
  if (!w) return "invalid";
  return w;
}

// Convert a YYYY-MM-DD inclusive end date to a Date strictly after that day
// for use with timestamp range comparisons.
function endOfDay(dateIso: string): Date {
  return new Date(`${dateIso}T23:59:59.999Z`);
}
function startOfDay(dateIso: string): Date {
  return new Date(`${dateIso}T00:00:00.000Z`);
}

// VIEW A — one row per campus.
router.get("/admin/campus-insights", async (req, res): Promise<void> => {
  if (!requireAdmin(req, res)) return;

  const week = await resolveWeekFilter(req.query.week);
  if (week === "invalid") {
    res.status(400).json({ error: "Invalid week" });
    return;
  }

  // Journal scope by week.startDate equality; revenue/orderbook by date range.
  const journalWhere = week
    ? eq(weeklyJournalsTable.weekStartDate, week.startDate)
    : undefined;
  const revVerifiedRange = week
    ? sql`${revenueEntriesTable.verifiedAt} >= ${startOfDay(week.startDate)} AND ${revenueEntriesTable.verifiedAt} <= ${endOfDay(week.endDate)}`
    : sql`true`;
  const revRejectedRange = week
    ? sql`${revenueEntriesTable.updatedAt} >= ${startOfDay(week.startDate)} AND ${revenueEntriesTable.updatedAt} <= ${endOfDay(week.endDate)}`
    : sql`true`;
  const obRange = week
    ? sql`${orderBookEntriesTable.createdAt} >= ${startOfDay(week.startDate)} AND ${orderBookEntriesTable.createdAt} <= ${endOfDay(week.endDate)}`
    : sql`true`;

  const [
    campusList,
    teamsAgg,
    journalsAgg,
    revenueAgg,
    orderBookAgg,
    programmeWeeksTotal,
  ] = await Promise.all([
    db
      .select({ id: campusesTable.id, name: campusesTable.name })
      .from(campusesTable),

    db
      .select({
        campusId: teamsTable.campusId,
        teamsCount: sql<number>`count(*)::int`,
      })
      .from(teamsTable)
      .groupBy(teamsTable.campusId),

    db
      .select({
        campusId: teamsTable.campusId,
        journalsSubmitted: sql<number>`count(${weeklyJournalsTable.id})::int`,
        clientsVisited: sql<number>`coalesce(sum(${weeklyJournalsTable.clientsVisited}),0)::int`,
        activeConversations: sql<number>`coalesce(sum(${weeklyJournalsTable.activeConversations}),0)::int`,
        projectsStarted: sql<number>`coalesce(sum(${weeklyJournalsTable.projectsStarted}),0)::int`,
        projectsClosed: sql<number>`coalesce(sum(${weeklyJournalsTable.projectsClosed}),0)::int`,
      })
      .from(weeklyJournalsTable)
      .innerJoin(teamsTable, eq(weeklyJournalsTable.teamId, teamsTable.id))
      .where(journalWhere)
      .groupBy(teamsTable.campusId),

    db
      .select({
        campusId: teamsTable.campusId,
        verifiedCount: sql<number>`count(*) filter (where ${revenueEntriesTable.status} = 'verified' AND ${revVerifiedRange})::int`,
        rejectedCount: sql<number>`count(*) filter (where ${revenueEntriesTable.status} = 'rejected' AND ${revRejectedRange})::int`,
        verifiedAmount: sql<number>`coalesce(sum(${revenueEntriesTable.verifiedAmount}) filter (where ${revenueEntriesTable.status} = 'verified' AND ${revVerifiedRange}), 0)::bigint`,
      })
      .from(revenueEntriesTable)
      .innerJoin(teamsTable, eq(revenueEntriesTable.teamId, teamsTable.id))
      .groupBy(teamsTable.campusId),

    db
      .select({
        campusId: teamsTable.campusId,
        orderBookSubmittedCount: sql<number>`count(*) filter (where ${orderBookEntriesTable.status} in ('submitted','verified') AND ${obRange})::int`,
      })
      .from(orderBookEntriesTable)
      .innerJoin(teamsTable, eq(orderBookEntriesTable.teamId, teamsTable.id))
      .groupBy(teamsTable.campusId),

    getProgrammeWeeksTotal(),
  ]);

  const teamsByCampus = new Map<number, number>();
  for (const r of teamsAgg) {
    if (r.campusId != null) teamsByCampus.set(r.campusId, r.teamsCount);
  }
  const journalsByCampus = new Map<
    number,
    {
      journalsSubmitted: number;
      clientsVisited: number;
      activeConversations: number;
      projectsStarted: number;
      projectsClosed: number;
    }
  >();
  for (const r of journalsAgg) {
    if (r.campusId != null)
      journalsByCampus.set(r.campusId, {
        journalsSubmitted: r.journalsSubmitted,
        clientsVisited: r.clientsVisited,
        activeConversations: r.activeConversations,
        projectsStarted: r.projectsStarted,
        projectsClosed: r.projectsClosed,
      });
  }
  const revByCampus = new Map<
    number,
    { verifiedCount: number; rejectedCount: number; verifiedAmount: number }
  >();
  for (const r of revenueAgg) {
    if (r.campusId != null)
      revByCampus.set(r.campusId, {
        verifiedCount: r.verifiedCount,
        rejectedCount: r.rejectedCount,
        verifiedAmount: Number(r.verifiedAmount ?? 0),
      });
  }
  const obByCampus = new Map<number, number>();
  for (const r of orderBookAgg) {
    if (r.campusId != null)
      obByCampus.set(r.campusId, r.orderBookSubmittedCount);
  }

  const rows = campusList
    .map((c) => {
      const rev = revByCampus.get(c.id) ?? {
        verifiedCount: 0,
        rejectedCount: 0,
        verifiedAmount: 0,
      };
      const jrn = journalsByCampus.get(c.id) ?? {
        journalsSubmitted: 0,
        clientsVisited: 0,
        activeConversations: 0,
        projectsStarted: 0,
        projectsClosed: 0,
      };
      return {
        campusId: c.id,
        campusName: c.name,
        teamsCount: teamsByCampus.get(c.id) ?? 0,
        journalsSubmitted: jrn.journalsSubmitted,
        clientsVisited: jrn.clientsVisited,
        activeConversations: jrn.activeConversations,
        projectsStarted: jrn.projectsStarted,
        projectsClosed: jrn.projectsClosed,
        orderBookSubmittedCount: obByCampus.get(c.id) ?? 0,
        verifiedRevenueCount: rev.verifiedCount,
        rejectedRevenueCount: rev.rejectedCount,
        totalVerifiedAmount: rev.verifiedAmount,
      };
    })
    .sort((a, b) => a.campusName.localeCompare(b.campusName));

  const totals = rows.reduce(
    (acc, r) => {
      acc.totalTeams += r.teamsCount;
      acc.totalJournalsSubmitted += r.journalsSubmitted;
      acc.totalVerifiedRevenue += r.totalVerifiedAmount;
      acc.totalVerifiedCount += r.verifiedRevenueCount;
      acc.totalRejectedCount += r.rejectedRevenueCount;
      return acc;
    },
    {
      totalTeams: 0,
      totalJournalsSubmitted: 0,
      totalVerifiedRevenue: 0,
      totalVerifiedCount: 0,
      totalRejectedCount: 0,
    },
  );

  res.json({
    rows,
    programmeWeeksTotal,
    totals,
    week: week
      ? {
          weekNumber: week.weekNumber,
          startDate: week.startDate,
          endDate: week.endDate,
        }
      : null,
  });
});

// VIEW B — one row per team in a campus.
router.get(
  "/admin/campus-insights/:campusId",
  async (req, res): Promise<void> => {
    if (!requireAdmin(req, res)) return;
    const campusId = Number(req.params.campusId);
    if (!Number.isInteger(campusId) || campusId <= 0) {
      res.status(400).json({ error: "Invalid campusId" });
      return;
    }
    const [campus] = await db
      .select()
      .from(campusesTable)
      .where(eq(campusesTable.id, campusId));
    if (!campus) {
      res.status(404).json({ error: "Campus not found" });
      return;
    }

    const week = await resolveWeekFilter(req.query.week);
    if (week === "invalid") {
      res.status(400).json({ error: "Invalid week" });
      return;
    }

    const journalConds = [eq(teamsTable.campusId, campusId)];
    if (week)
      journalConds.push(eq(weeklyJournalsTable.weekStartDate, week.startDate));

    const revVerifiedRange = week
      ? sql`${revenueEntriesTable.verifiedAt} >= ${startOfDay(week.startDate)} AND ${revenueEntriesTable.verifiedAt} <= ${endOfDay(week.endDate)}`
      : sql`true`;
    const revRejectedRange = week
      ? sql`${revenueEntriesTable.updatedAt} >= ${startOfDay(week.startDate)} AND ${revenueEntriesTable.updatedAt} <= ${endOfDay(week.endDate)}`
      : sql`true`;
    const obConds = [eq(teamsTable.campusId, campusId)];
    if (week)
      obConds.push(
        and(
          gte(orderBookEntriesTable.createdAt, startOfDay(week.startDate)),
          lte(orderBookEntriesTable.createdAt, endOfDay(week.endDate)),
        )!,
      );

    const [
      teamList,
      journalsAgg,
      revenueAgg,
      orderBookAgg,
      programmeWeeksTotal,
    ] = await Promise.all([
      db
        .select({ id: teamsTable.id, name: teamsTable.name })
        .from(teamsTable)
        .where(eq(teamsTable.campusId, campusId)),

      db
        .select({
          teamId: weeklyJournalsTable.teamId,
          weeks: sql<number>`count(distinct ${weeklyJournalsTable.weekStartDate})::int`,
          clientsVisited: sql<number>`coalesce(sum(${weeklyJournalsTable.clientsVisited}),0)::int`,
          activeConversations: sql<number>`coalesce(sum(${weeklyJournalsTable.activeConversations}),0)::int`,
          projectsStarted: sql<number>`coalesce(sum(${weeklyJournalsTable.projectsStarted}),0)::int`,
          projectsClosed: sql<number>`coalesce(sum(${weeklyJournalsTable.projectsClosed}),0)::int`,
        })
        .from(weeklyJournalsTable)
        .innerJoin(teamsTable, eq(weeklyJournalsTable.teamId, teamsTable.id))
        .where(and(...journalConds))
        .groupBy(weeklyJournalsTable.teamId),

      db
        .select({
          teamId: revenueEntriesTable.teamId,
          verifiedCount: sql<number>`count(*) filter (where ${revenueEntriesTable.status} = 'verified' AND ${revVerifiedRange})::int`,
          rejectedCount: sql<number>`count(*) filter (where ${revenueEntriesTable.status} = 'rejected' AND ${revRejectedRange})::int`,
          verifiedAmount: sql<number>`coalesce(sum(${revenueEntriesTable.verifiedAmount}) filter (where ${revenueEntriesTable.status} = 'verified' AND ${revVerifiedRange}), 0)::bigint`,
        })
        .from(revenueEntriesTable)
        .innerJoin(teamsTable, eq(revenueEntriesTable.teamId, teamsTable.id))
        .where(eq(teamsTable.campusId, campusId))
        .groupBy(revenueEntriesTable.teamId),

      db
        .select({
          teamId: orderBookEntriesTable.teamId,
          submittedCount: sql<number>`count(*) filter (where ${orderBookEntriesTable.status} in ('submitted','verified'))::int`,
        })
        .from(orderBookEntriesTable)
        .innerJoin(teamsTable, eq(orderBookEntriesTable.teamId, teamsTable.id))
        .where(and(...obConds))
        .groupBy(orderBookEntriesTable.teamId),

      getProgrammeWeeksTotal(),
    ]);

    const journalsByTeam = new Map<
      number,
      {
        weeks: number;
        clientsVisited: number;
        activeConversations: number;
        projectsStarted: number;
        projectsClosed: number;
      }
    >();
    for (const r of journalsAgg)
      journalsByTeam.set(r.teamId, {
        weeks: r.weeks,
        clientsVisited: r.clientsVisited,
        activeConversations: r.activeConversations,
        projectsStarted: r.projectsStarted,
        projectsClosed: r.projectsClosed,
      });
    const revByTeam = new Map<
      number,
      { verifiedCount: number; rejectedCount: number; verifiedAmount: number }
    >();
    for (const r of revenueAgg)
      revByTeam.set(r.teamId, {
        verifiedCount: r.verifiedCount,
        rejectedCount: r.rejectedCount,
        verifiedAmount: Number(r.verifiedAmount ?? 0),
      });
    const obByTeam = new Map<number, number>();
    for (const r of orderBookAgg) obByTeam.set(r.teamId, r.submittedCount);

    const rows = teamList
      .map((t) => {
        const rev = revByTeam.get(t.id) ?? {
          verifiedCount: 0,
          rejectedCount: 0,
          verifiedAmount: 0,
        };
        const jrn = journalsByTeam.get(t.id) ?? {
          weeks: 0,
          clientsVisited: 0,
          activeConversations: 0,
          projectsStarted: 0,
          projectsClosed: 0,
        };
        return {
          teamId: t.id,
          teamName: t.name,
          journalWeeksSubmitted: jrn.weeks,
          clientsVisited: jrn.clientsVisited,
          activeConversations: jrn.activeConversations,
          projectsStarted: jrn.projectsStarted,
          projectsClosed: jrn.projectsClosed,
          orderBookSubmittedCount: obByTeam.get(t.id) ?? 0,
          verifiedRevenueCount: rev.verifiedCount,
          rejectedRevenueCount: rev.rejectedCount,
          totalVerifiedAmount: rev.verifiedAmount,
        };
      })
      .sort((a, b) => a.teamName.localeCompare(b.teamName));

    res.json({
      campusId: campus.id,
      campusName: campus.name,
      programmeWeeksTotal,
      rows,
      week: week
        ? {
            weekNumber: week.weekNumber,
            startDate: week.startDate,
            endDate: week.endDate,
          }
        : null,
    });
  },
);

// List all programme weeks (lightweight, used by the Week filter dropdown).
router.get("/admin/campus-insights-weeks", async (req, res): Promise<void> => {
  if (!requireAdmin(req, res)) return;
  const rows = await db
    .select({
      weekNumber: programmeWeeksTable.weekNumber,
      startDate: programmeWeeksTable.startDate,
      endDate: programmeWeeksTable.endDate,
    })
    .from(programmeWeeksTable)
    .orderBy(programmeWeeksTable.weekNumber);
  res.json(rows);
});

export default router;
