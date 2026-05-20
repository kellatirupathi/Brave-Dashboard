import { Router, type IRouter } from "express";
import { sql, eq } from "drizzle-orm";
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

// VIEW A — one row per campus.
router.get("/admin/campus-insights", async (req, res): Promise<void> => {
  if (!requireAdmin(req, res)) return;

  // Run the four aggregates and programme-weeks total in parallel.
  const [campusList, teamsAgg, journalsAgg, revenueAgg, programmeWeeksTotal] =
    await Promise.all([
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
        })
        .from(weeklyJournalsTable)
        .innerJoin(teamsTable, eq(weeklyJournalsTable.teamId, teamsTable.id))
        .groupBy(teamsTable.campusId),

      db
        .select({
          campusId: teamsTable.campusId,
          verifiedCount: sql<number>`count(*) filter (where ${revenueEntriesTable.status} = 'verified')::int`,
          rejectedCount: sql<number>`count(*) filter (where ${revenueEntriesTable.status} = 'rejected')::int`,
          verifiedAmount: sql<number>`coalesce(sum(${revenueEntriesTable.verifiedAmount}) filter (where ${revenueEntriesTable.status} = 'verified'), 0)::bigint`,
        })
        .from(revenueEntriesTable)
        .innerJoin(teamsTable, eq(revenueEntriesTable.teamId, teamsTable.id))
        .groupBy(teamsTable.campusId),

      getProgrammeWeeksTotal(),
    ]);

  const teamsByCampus = new Map<number, number>();
  for (const r of teamsAgg) {
    if (r.campusId != null) teamsByCampus.set(r.campusId, r.teamsCount);
  }
  const journalsByCampus = new Map<number, number>();
  for (const r of journalsAgg) {
    if (r.campusId != null)
      journalsByCampus.set(r.campusId, r.journalsSubmitted);
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

  const rows = campusList
    .map((c) => {
      const rev = revByCampus.get(c.id) ?? {
        verifiedCount: 0,
        rejectedCount: 0,
        verifiedAmount: 0,
      };
      return {
        campusId: c.id,
        campusName: c.name,
        teamsCount: teamsByCampus.get(c.id) ?? 0,
        journalsSubmitted: journalsByCampus.get(c.id) ?? 0,
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

  res.json({ rows, programmeWeeksTotal, totals });
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

    const [teamList, journalsAgg, revenueAgg, orderBookAgg, programmeWeeksTotal] =
      await Promise.all([
        db
          .select({ id: teamsTable.id, name: teamsTable.name })
          .from(teamsTable)
          .where(eq(teamsTable.campusId, campusId)),

        db
          .select({
            teamId: weeklyJournalsTable.teamId,
            weeks: sql<number>`count(distinct ${weeklyJournalsTable.weekStartDate})::int`,
          })
          .from(weeklyJournalsTable)
          .innerJoin(teamsTable, eq(weeklyJournalsTable.teamId, teamsTable.id))
          .where(eq(teamsTable.campusId, campusId))
          .groupBy(weeklyJournalsTable.teamId),

        db
          .select({
            teamId: revenueEntriesTable.teamId,
            verifiedCount: sql<number>`count(*) filter (where ${revenueEntriesTable.status} = 'verified')::int`,
            rejectedCount: sql<number>`count(*) filter (where ${revenueEntriesTable.status} = 'rejected')::int`,
            verifiedAmount: sql<number>`coalesce(sum(${revenueEntriesTable.verifiedAmount}) filter (where ${revenueEntriesTable.status} = 'verified'), 0)::bigint`,
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
          .where(eq(teamsTable.campusId, campusId))
          .groupBy(orderBookEntriesTable.teamId),

        getProgrammeWeeksTotal(),
      ]);

    const journalsByTeam = new Map<number, number>();
    for (const r of journalsAgg) journalsByTeam.set(r.teamId, r.weeks);
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
        return {
          teamId: t.id,
          teamName: t.name,
          journalWeeksSubmitted: journalsByTeam.get(t.id) ?? 0,
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
    });
  },
);

export default router;
