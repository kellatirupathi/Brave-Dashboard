import { Router, type IRouter } from "express";
import { eq, and, sql } from "drizzle-orm";
import {
  db,
  teamsTable,
  campusesTable,
  revenueEntriesTable,
  orderBookEntriesTable,
  projectsTable,
  teamMembersTable,
  milestonesTable,
  announcementsTable,
  programmeConfigTable,
  orderBookEntriesTable as obe,
  revenueEntriesTable as re,
  auditLogTable,
  usersTable,
  demoDayApplicationsTable,
  accessRequestsTable,
} from "@workspace/db";

const router: IRouter = Router();

router.get("/dashboard/summary", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const configs = await db.select().from(programmeConfigTable).limit(1);
  const threshold = configs[0]?.demoEligibilityThreshold ?? 200000;

  const [totalRevenue] = await db
    .select({ total: sql<number>`coalesce(sum(verified_amount), 0)` })
    .from(revenueEntriesTable)
    .where(sql`status = 'verified'`);
  const [totalOB] = await db
    .select({ total: sql<number>`coalesce(sum(verified_amount), 0)` })
    .from(orderBookEntriesTable)
    .where(sql`status = 'verified'`);
  const [activeTeams] = await db
    .select({ count: sql<number>`count(*)` })
    .from(teamsTable)
    .where(eq(teamsTable.status, "active"));
  const [pendingTeamsAgg] = await db
    .select({
      count: sql<number>`count(*)`,
      oldestAt: sql<string | null>`min(created_at)`,
    })
    .from(teamsTable)
    .where(eq(teamsTable.status, "pending"));
  const [totalCampuses] = await db
    .select({ count: sql<number>`count(*)` })
    .from(campusesTable);
  const [pendingRevReviewAgg] = await db
    .select({
      count: sql<number>`count(*)`,
      oldestAt: sql<string | null>`min(submitted_at)`,
    })
    .from(revenueEntriesTable)
    .where(sql`status = 'submitted'`);
  // Match the Review Queue's 48-hour overdue cutoff
  const overdueCutoff = new Date(Date.now() - 48 * 60 * 60 * 1000);
  const [overdueRevReview] = await db
    .select({ count: sql<number>`count(*)` })
    .from(revenueEntriesTable)
    .where(sql`status = 'submitted' and submitted_at < ${overdueCutoff}`);
  const [pendingDemoDayAgg] = await db
    .select({
      count: sql<number>`count(*)`,
      oldestAt: sql<string | null>`min(submitted_at)`,
    })
    .from(demoDayApplicationsTable)
    .where(sql`status = 'submitted'`);
  const [pendingAccessReqAgg] = await db
    .select({
      count: sql<number>`count(*)`,
      oldestAt: sql<string | null>`min(created_at)`,
    })
    .from(accessRequestsTable)
    .where(sql`status = 'pending'`);

  // Demo eligible teams
  const teams = await db.select().from(teamsTable).where(eq(teamsTable.status, "active"));
  let demoEligible = 0;
  for (const team of teams) {
    const [revStats] = await db
      .select({ total: sql<number>`coalesce(sum(verified_amount), 0)` })
      .from(revenueEntriesTable)
      .where(and(eq(revenueEntriesTable.teamId, team.id), sql`status = 'verified'`));
    if (Number(revStats?.total ?? 0) >= threshold) demoEligible++;
  }

  // Top campuses
  const campuses = await db.select().from(campusesTable);
  const campusStats = await Promise.all(campuses.map(async (campus) => {
    const [revStats] = await db
      .select({ total: sql<number>`coalesce(sum(verified_amount), 0)` })
      .from(revenueEntriesTable)
      .where(sql`team_id in (select id from teams where campus_id = ${campus.id}) and status = 'verified'`);
    const [teamStats] = await db
      .select({
        totalTeams: sql<number>`count(*)`,
        activeTeams: sql<number>`count(*) filter (where status = 'active')`,
      })
      .from(teamsTable)
      .where(eq(teamsTable.campusId, campus.id));
    return {
      ...campus,
      coordinatorName: null as string | null,
      totalTeams: Number(teamStats?.totalTeams ?? 0),
      activeTeams: Number(teamStats?.activeTeams ?? 0),
      totalRevenue: Number(revStats?.total ?? 0),
    };
  }));
  campusStats.sort((a, b) => b.totalRevenue - a.totalRevenue);

  const recentAudit = await db
    .select()
    .from(auditLogTable)
    .orderBy(sql`created_at desc`)
    .limit(10);
  const recentActivity = await Promise.all(recentAudit.map(async (log) => {
    const [actor] = await db.select().from(usersTable).where(eq(usersTable.id, log.actorId));
    return { ...log, actorName: actor ? `${actor.firstName} ${actor.lastName}` : "System" };
  }));

  const toIso = (v: string | Date | null | undefined): string | null => {
    if (!v) return null;
    return v instanceof Date ? v.toISOString() : new Date(v).toISOString();
  };

  res.json({
    totalVerifiedRevenue: Number(totalRevenue?.total ?? 0),
    totalOrderBook: Number(totalOB?.total ?? 0),
    activeTeams: Number(activeTeams?.count ?? 0),
    pendingTeams: Number(pendingTeamsAgg?.count ?? 0),
    pendingTeamsOldestAt: toIso(pendingTeamsAgg?.oldestAt),
    demoEligibleTeams: demoEligible,
    pendingReviewCount: Number(pendingRevReviewAgg?.count ?? 0),
    overdueReviewCount: Number(overdueRevReview?.count ?? 0),
    pendingReviewOldestAt: toIso(pendingRevReviewAgg?.oldestAt),
    pendingDemoDayCount: Number(pendingDemoDayAgg?.count ?? 0),
    pendingDemoDayOldestAt: toIso(pendingDemoDayAgg?.oldestAt),
    pendingAccessRequestCount: Number(pendingAccessReqAgg?.count ?? 0),
    pendingAccessRequestOldestAt: toIso(pendingAccessReqAgg?.oldestAt),
    totalCampuses: Number(totalCampuses?.count ?? 0),
    topCampuses: campusStats.slice(0, 5),
    recentActivity,
  });
});

router.get("/dashboard/team-summary", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const [member] = await db.select().from(teamMembersTable).where(eq(teamMembersTable.userId, req.user.id));
  if (!member) {
    res.json({
      team: null,
      totalRevenue: 0,
      totalOrderBook: 0,
      nationalRank: null,
      campusRank: null,
      activeProjects: 0,
      pendingSubmissions: 0,
      demoEligible: false,
      recentMilestones: [],
      announcements: [],
    });
    return;
  }
  const [team] = await db.select().from(teamsTable).where(eq(teamsTable.id, member.teamId));
  if (!team) {
    res.status(404).json({ error: "Team not found" });
    return;
  }
  const [campus] = await db.select().from(campusesTable).where(eq(campusesTable.id, team.campusId));
  const configs = await db.select().from(programmeConfigTable).limit(1);
  const threshold = configs[0]?.demoEligibilityThreshold ?? 200000;

  const [revStats] = await db
    .select({ total: sql<number>`coalesce(sum(verified_amount), 0)` })
    .from(revenueEntriesTable)
    .where(and(eq(revenueEntriesTable.teamId, team.id), sql`status = 'verified'`));
  const [obStats] = await db
    .select({ total: sql<number>`coalesce(sum(verified_amount), 0)` })
    .from(orderBookEntriesTable)
    .where(and(eq(orderBookEntriesTable.teamId, team.id), sql`status = 'verified'`));
  const [projectCount] = await db
    .select({ count: sql<number>`count(*)` })
    .from(projectsTable)
    .where(and(eq(projectsTable.teamId, team.id), eq(projectsTable.status, "active")));
  const [pendingRev] = await db
    .select({ count: sql<number>`count(*)` })
    .from(revenueEntriesTable)
    .where(and(eq(revenueEntriesTable.teamId, team.id), sql`status in ('draft', 'submitted')`));

  const milestones = await db
    .select()
    .from(milestonesTable)
    .where(eq(milestonesTable.teamId, team.id))
    .orderBy(sql`date desc`)
    .limit(5);

  const announcements = await db
    .select()
    .from(announcementsTable)
    .where(sql`target = 'all' or (target = 'campus' and campus_id = ${team.campusId}) or (target = 'team' and team_id = ${team.id})`)
    .orderBy(sql`created_at desc`)
    .limit(5);
  const enrichedAnnouncements = await Promise.all(announcements.map(async (a) => {
    const [author] = await db.select().from(usersTable).where(eq(usersTable.id, a.authorId));
    return { ...a, authorName: author ? `${author.firstName} ${author.lastName}` : "Admin" };
  }));

  const [memberCount] = await db
    .select({ count: sql<number>`count(*)` })
    .from(teamMembersTable)
    .where(eq(teamMembersTable.teamId, team.id));

  res.json({
    team: {
      ...team,
      campusName: campus?.name ?? "",
      leaderName: "",
      memberCount: Number(memberCount?.count ?? 0),
      projectCount: Number(projectCount?.count ?? 0),
      totalRevenue: Number(revStats?.total ?? 0),
      totalOrderBook: Number(obStats?.total ?? 0),
      nationalRank: null as number | null,
    },
    totalRevenue: Number(revStats?.total ?? 0),
    totalOrderBook: Number(obStats?.total ?? 0),
    nationalRank: null,
    campusRank: null,
    activeProjects: Number(projectCount?.count ?? 0),
    pendingSubmissions: Number(pendingRev?.count ?? 0),
    demoEligible: Number(revStats?.total ?? 0) >= threshold,
    recentMilestones: milestones,
    announcements: enrichedAnnouncements,
  });
});

export default router;
