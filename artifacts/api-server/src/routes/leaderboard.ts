import { Router, type IRouter } from "express";
import { isAdminRole } from "../lib/admin-guard";
import { eq, and, sql, desc, ilike } from "drizzle-orm";
import {
  db,
  teamsTable,
  campusesTable,
  revenueEntriesTable,
  orderBookEntriesTable,
  projectsTable,
  programmeConfigTable,
} from "@workspace/db";
import { GetLeaderboardQueryParams } from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/leaderboard", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const queryParams = GetLeaderboardQueryParams.safeParse(req.query);
  if (!queryParams.success) {
    res.status(400).json({ error: queryParams.error.message });
    return;
  }
  const { view, campusId, period, search } = queryParams.data;
  const configs = await db.select().from(programmeConfigTable).limit(1);
  const threshold = configs[0]?.demoEligibilityThreshold ?? 200000;

  let effectiveCampusId = campusId;
  if (view === "campus" && !campusId && req.user.campusId) {
    effectiveCampusId = req.user.campusId;
  }

  // Get all active teams
  let teamsQuery = db
    .select()
    .from(teamsTable)
    .where(eq(teamsTable.status, "active"));

  const teams = await teamsQuery;
  const results = await Promise.all(
    teams.map(async (team) => {
      const [campus] = await db.select().from(campusesTable).where(eq(campusesTable.id, team.campusId));
      // Build date filter for revenue
      let revWhere = and(eq(revenueEntriesTable.teamId, team.id), sql`status = 'verified'`);
      const [revStats] = await db
        .select({
          total: sql<number>`coalesce(sum(verified_amount), 0)`,
          lastPayment: sql<string>`max(payment_date)`,
        })
        .from(revenueEntriesTable)
        .where(revWhere);
      const [obStats] = await db
        .select({ total: sql<number>`coalesce(sum(verified_amount), 0)` })
        .from(orderBookEntriesTable)
        .where(and(eq(orderBookEntriesTable.teamId, team.id), sql`status = 'verified'`));
      const [projectCount] = await db
        .select({ count: sql<number>`count(*)` })
        .from(projectsTable)
        .where(and(eq(projectsTable.teamId, team.id), eq(projectsTable.status, "active")));
      return {
        teamId: team.id,
        teamName: team.name,
        campusName: campus?.name ?? "",
        campusId: team.campusId,
        tagline: team.tagline ?? null,
        photoUrl: team.photoUrl ?? null,
        totalRevenue: Number(revStats?.total ?? 0),
        totalOrderBook: Number(obStats?.total ?? 0),
        activeProjects: Number(projectCount?.count ?? 0),
        clientCount: 0,
        lastPaymentDate: revStats?.lastPayment ?? null,
        isDemoEligible: Number(revStats?.total ?? 0) >= threshold,
        isFeatured: team.isFeatured,
        isHidden: team.isHidden,
        rank: 0,
      };
    })
  );

  // Filter
  let filtered = results.filter(t => !t.isHidden || isAdminRole(req.user.role));
  if (effectiveCampusId) {
    filtered = filtered.filter(t => t.campusId === effectiveCampusId);
  }
  if (search) {
    const lower = search.toLowerCase();
    filtered = filtered.filter(t => t.teamName.toLowerCase().includes(lower));
  }

  // Sort by totalRevenue desc
  filtered.sort((a, b) => {
    if (b.isFeatured && !a.isFeatured) return 1;
    if (a.isFeatured && !b.isFeatured) return -1;
    return b.totalRevenue - a.totalRevenue;
  });

  const ranked = filtered.map((t, idx) => ({ ...t, rank: idx + 1 }));
  const final = view === "top10" ? ranked.slice(0, 10) : ranked;

  res.json(final);
});

export default router;
