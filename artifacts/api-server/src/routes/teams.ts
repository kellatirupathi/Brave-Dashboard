import { Router, type IRouter } from "express";
import { eq, and, ilike, sql } from "drizzle-orm";
import {
  db,
  teamsTable,
  usersTable,
  campusesTable,
  teamMembersTable,
  projectsTable,
  revenueEntriesTable,
  orderBookEntriesTable,
  milestonesTable,
} from "@workspace/db";
import {
  ListTeamsQueryParams,
  CreateTeamBody,
  GetTeamParams,
  UpdateTeamParams,
  UpdateTeamBody,
  ApproveTeamParams,
  RejectTeamParams,
  RejectTeamBody,
  RequestTeamChangesParams,
  RequestTeamChangesBody,
  AddTeamMemberParams,
  AddTeamMemberBody,
  RemoveTeamMemberParams,
} from "@workspace/api-zod";
import { logAudit } from "../lib/audit";
import { createNotification } from "../lib/notifications";

const router: IRouter = Router();

async function getTeamWithStats(teamId: number) {
  const [team] = await db.select().from(teamsTable).where(eq(teamsTable.id, teamId));
  if (!team) return null;
  const [campus] = await db.select().from(campusesTable).where(eq(campusesTable.id, team.campusId));
  const [leader] = await db.select().from(usersTable).where(eq(usersTable.id, team.leaderId));
  const members = await db
    .select({ userId: teamMembersTable.userId, memberRole: teamMembersTable.memberRole })
    .from(teamMembersTable)
    .where(eq(teamMembersTable.teamId, teamId));
  const memberDetails = await Promise.all(
    members.map(async (m) => {
      const [user] = await db.select().from(usersTable).where(eq(usersTable.id, m.userId));
      return {
        userId: m.userId,
        email: user?.email ?? "",
        firstName: user?.firstName ?? "",
        lastName: user?.lastName ?? "",
        profileImage: user?.profileImage ?? null,
        memberRole: m.memberRole,
        isLeader: m.userId === team.leaderId,
      };
    })
  );
  const [revenueStats] = await db
    .select({ total: sql<number>`coalesce(sum(verified_amount), 0)` })
    .from(revenueEntriesTable)
    .where(and(eq(revenueEntriesTable.teamId, teamId), sql`status = 'verified'`));
  const [orderBookStats] = await db
    .select({ total: sql<number>`coalesce(sum(verified_amount), 0)` })
    .from(orderBookEntriesTable)
    .where(and(eq(orderBookEntriesTable.teamId, teamId), sql`status = 'verified'`));
  const [projectCount] = await db
    .select({ count: sql<number>`count(*)` })
    .from(projectsTable)
    .where(and(eq(projectsTable.teamId, teamId), eq(projectsTable.status, "active")));
  return {
    ...team,
    campusName: campus?.name ?? "",
    leaderName: leader ? `${leader.firstName} ${leader.lastName}` : "",
    memberCount: members.length,
    projectCount: Number(projectCount?.count ?? 0),
    totalRevenue: Number(revenueStats?.total ?? 0),
    totalOrderBook: Number(orderBookStats?.total ?? 0),
    nationalRank: null as number | null,
    members: memberDetails,
  };
}

router.get("/teams", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const queryParams = ListTeamsQueryParams.safeParse(req.query);
  if (!queryParams.success) {
    res.status(400).json({ error: queryParams.error.message });
    return;
  }
  const { campusId, status, search } = queryParams.data;
  let conditions: ReturnType<typeof and>[] = [];
  if (req.user.role === "coordinator" && req.user.campusId) {
    conditions.push(eq(teamsTable.campusId, req.user.campusId));
  } else if (campusId) {
    conditions.push(eq(teamsTable.campusId, campusId));
  }
  if (status) conditions.push(eq(teamsTable.status, status));
  if (search) conditions.push(ilike(teamsTable.name, `%${search}%`));

  const teams = conditions.length > 0
    ? await db.select().from(teamsTable).where(and(...conditions)).orderBy(teamsTable.createdAt)
    : await db.select().from(teamsTable).orderBy(teamsTable.createdAt);

  const result = await Promise.all(
    teams.map(async (team) => {
      const [campus] = await db.select().from(campusesTable).where(eq(campusesTable.id, team.campusId));
      const [leader] = await db.select().from(usersTable).where(eq(usersTable.id, team.leaderId));
      const [memberCount] = await db
        .select({ count: sql<number>`count(*)` })
        .from(teamMembersTable)
        .where(eq(teamMembersTable.teamId, team.id));
      const [projectCount] = await db
        .select({ count: sql<number>`count(*)` })
        .from(projectsTable)
        .where(and(eq(projectsTable.teamId, team.id), eq(projectsTable.status, "active")));
      const [revenueStats] = await db
        .select({ total: sql<number>`coalesce(sum(verified_amount), 0)` })
        .from(revenueEntriesTable)
        .where(and(eq(revenueEntriesTable.teamId, team.id), sql`status = 'verified'`));
      const [orderBookStats] = await db
        .select({ total: sql<number>`coalesce(sum(verified_amount), 0)` })
        .from(orderBookEntriesTable)
        .where(and(eq(orderBookEntriesTable.teamId, team.id), sql`status = 'verified'`));
      return {
        ...team,
        campusName: campus?.name ?? "",
        leaderName: leader ? `${leader.firstName} ${leader.lastName}` : "",
        memberCount: Number(memberCount?.count ?? 0),
        projectCount: Number(projectCount?.count ?? 0),
        totalRevenue: Number(revenueStats?.total ?? 0),
        totalOrderBook: Number(orderBookStats?.total ?? 0),
        nationalRank: null as number | null,
      };
    })
  );
  res.json(result);
});

router.post("/teams", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const parsed = CreateTeamBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  // Check if user already has a team
  const [existingMember] = await db
    .select()
    .from(teamMembersTable)
    .where(eq(teamMembersTable.userId, req.user.id));
  if (existingMember) {
    res.status(400).json({ error: "You are already a member of a team" });
    return;
  }
  const { memberEmails: _ignored, ...teamData } = parsed.data;
  // Enforce campus = user's campus; reject if not assigned (admins may set campusId explicitly)
  const campusId = req.user.role === "admin"
    ? (req.user.campusId ?? parsed.data.campusId)
    : req.user.campusId;
  if (!campusId) {
    res.status(400).json({ error: "Your account has no campus assigned. Please contact your coordinator." });
    return;
  }
  const inviteCode = generateInviteCode();
  const [team] = await db
    .insert(teamsTable)
    .values({ ...teamData, leaderId: req.user.id, campusId, inviteCode })
    .returning();
  // Add leader as member
  await db.insert(teamMembersTable).values({ teamId: team.id, userId: req.user.id });
  const teamDetail = await getTeamWithStats(team.id);
  res.status(201).json(teamDetail);
});

function generateInviteCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let s = "BRAVE-";
  for (let i = 0; i < 5; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

router.get("/teams/my", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const [member] = await db
    .select()
    .from(teamMembersTable)
    .where(eq(teamMembersTable.userId, req.user.id));
  if (!member) {
    res.status(404).json({ error: "No team found" });
    return;
  }
  const teamDetail = await getTeamWithStats(member.teamId);
  if (!teamDetail) {
    res.status(404).json({ error: "Team not found" });
    return;
  }
  // Get projects
  const projects = await db.select().from(projectsTable).where(eq(projectsTable.teamId, member.teamId));
  const projectsWithStats = await Promise.all(
    projects.map(async (p) => {
      const [campus] = await db.select().from(campusesTable).where(eq(campusesTable.id, teamDetail.campusId));
      const [revStats] = await db
        .select({ total: sql<number>`coalesce(sum(verified_amount), 0)` })
        .from(revenueEntriesTable)
        .where(and(eq(revenueEntriesTable.projectId, p.id), sql`status = 'verified'`));
      const [obStats] = await db
        .select({ total: sql<number>`coalesce(sum(verified_amount), 0)` })
        .from(orderBookEntriesTable)
        .where(and(eq(orderBookEntriesTable.projectId, p.id), sql`status = 'verified'`));
      return {
        ...p,
        teamName: teamDetail.name,
        verifiedRevenue: Number(revStats?.total ?? 0),
        verifiedOrderBook: Number(obStats?.total ?? 0),
        clientCount: 0,
      };
    })
  );
  res.json({ ...teamDetail, projects: projectsWithStats });
});

router.get("/teams/:id", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const params = GetTeamParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const teamDetail = await getTeamWithStats(params.data.id);
  if (!teamDetail) {
    res.status(404).json({ error: "Team not found" });
    return;
  }
  // Strip invite code unless the requester is a member of this team or staff
  const isStaff = ["admin", "coordinator"].includes(req.user.role ?? "");
  const isMember = teamDetail.members?.some?.((m: any) => m.userId === req.user.id) ?? false;
  if (!isStaff && !isMember) {
    (teamDetail as any).inviteCode = null;
  }
  const projects = await db.select().from(projectsTable).where(eq(projectsTable.teamId, params.data.id));
  const projectsWithStats = await Promise.all(
    projects.map(async (p) => {
      const [revStats] = await db
        .select({ total: sql<number>`coalesce(sum(verified_amount), 0)` })
        .from(revenueEntriesTable)
        .where(and(eq(revenueEntriesTable.projectId, p.id), sql`status = 'verified'`));
      const [obStats] = await db
        .select({ total: sql<number>`coalesce(sum(verified_amount), 0)` })
        .from(orderBookEntriesTable)
        .where(and(eq(orderBookEntriesTable.projectId, p.id), sql`status = 'verified'`));
      return {
        ...p,
        teamName: teamDetail.name,
        verifiedRevenue: Number(revStats?.total ?? 0),
        verifiedOrderBook: Number(obStats?.total ?? 0),
        clientCount: 0,
      };
    })
  );
  res.json({ ...teamDetail, projects: projectsWithStats });
});

router.patch("/teams/:id", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const params = UpdateTeamParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = UpdateTeamBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { reason, ...updateData } = parsed.data;
  const [team] = await db
    .update(teamsTable)
    .set(updateData)
    .where(eq(teamsTable.id, params.data.id))
    .returning();
  if (!team) {
    res.status(404).json({ error: "Team not found" });
    return;
  }
  if (req.user.role === "admin") {
    await logAudit(req.user.id, "update_team", "team", team.id, reason ?? JSON.stringify(updateData));
  }
  const teamData = await getTeamWithStats(team.id);
  res.json(teamData);
});

router.post("/teams/:id/approve", async (req, res): Promise<void> => {
  if (!req.isAuthenticated() || !["coordinator", "admin"].includes(req.user.role ?? "")) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  const params = ApproveTeamParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [team] = await db
    .update(teamsTable)
    .set({ status: "active" })
    .where(eq(teamsTable.id, params.data.id))
    .returning();
  if (!team) {
    res.status(404).json({ error: "Team not found" });
    return;
  }
  // Auto milestone
  await db.insert(milestonesTable).values({
    teamId: team.id,
    type: "auto",
    title: "Team Registered",
    description: "Your team has been approved and is now active!",
    date: new Date(),
    isPinned: false,
  });
  // Notify leader
  await createNotification(team.leaderId, "Team Approved!", `Your team "${team.name}" has been approved.`, "team_approved", "/team");
  await logAudit(req.user.id, "approve_team", "team", team.id);
  const teamData = await getTeamWithStats(team.id);
  res.json(teamData);
});

router.post("/teams/:id/reject", async (req, res): Promise<void> => {
  if (!req.isAuthenticated() || !["coordinator", "admin"].includes(req.user.role ?? "")) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  const params = RejectTeamParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = RejectTeamBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [team] = await db
    .update(teamsTable)
    .set({ status: "rejected", rejectionReason: parsed.data.reason })
    .where(eq(teamsTable.id, params.data.id))
    .returning();
  if (!team) {
    res.status(404).json({ error: "Team not found" });
    return;
  }
  await createNotification(team.leaderId, "Team Registration Rejected", `Your team "${team.name}" was rejected: ${parsed.data.reason}`, "team_rejected", "/team");
  await logAudit(req.user.id, "reject_team", "team", team.id, parsed.data.reason);
  const teamData = await getTeamWithStats(team.id);
  res.json(teamData);
});

router.post("/teams/:id/request-changes", async (req, res): Promise<void> => {
  if (!req.isAuthenticated() || !["coordinator", "admin"].includes(req.user.role ?? "")) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  const params = RequestTeamChangesParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = RequestTeamChangesBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [team] = await db
    .update(teamsTable)
    .set({ status: "changes_requested", coordinatorComment: parsed.data.comment })
    .where(eq(teamsTable.id, params.data.id))
    .returning();
  if (!team) {
    res.status(404).json({ error: "Team not found" });
    return;
  }
  await createNotification(team.leaderId, "Changes Requested", `Changes requested for team "${team.name}": ${parsed.data.comment}`, "team_changes_requested", "/team");
  const teamData = await getTeamWithStats(team.id);
  res.json(teamData);
});

router.post("/teams/:id/members", async (req, res): Promise<void> => {
  if (!req.isAuthenticated() || req.user.role !== "admin") {
    res.status(403).json({ error: "Admin only — students must use the team invitation flow." });
    return;
  }
  const params = AddTeamMemberParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = AddTeamMemberBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [user] = await db.select().from(usersTable).where(eq(usersTable.email, parsed.data.email));
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  const [existing] = await db.select().from(teamMembersTable).where(eq(teamMembersTable.userId, user.id));
  if (existing) {
    res.status(400).json({ error: "User is already a member of a team" });
    return;
  }
  await db.insert(teamMembersTable).values({ teamId: params.data.id, userId: user.id });
  const teamDetail = await getTeamWithStats(params.data.id);
  const projects = await db.select().from(projectsTable).where(eq(projectsTable.teamId, params.data.id));
  res.status(201).json({ ...teamDetail, projects: [] });
});

router.delete("/teams/:id/members/:userId", async (req, res): Promise<void> => {
  if (!req.isAuthenticated() || req.user.role !== "admin") {
    res.status(403).json({ error: "Admin only — students must use the leave-request flow." });
    return;
  }
  const params = RemoveTeamMemberParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  // Prevent removing the team leader
  const [team] = await db.select().from(teamsTable).where(eq(teamsTable.id, params.data.id));
  if (team && team.leaderId === params.data.userId) {
    res.status(400).json({ error: "Cannot remove the team leader. Transfer leadership first." });
    return;
  }
  await db
    .delete(teamMembersTable)
    .where(and(eq(teamMembersTable.teamId, params.data.id), eq(teamMembersTable.userId, params.data.userId)));
  const teamDetail = await getTeamWithStats(params.data.id);
  res.json({ ...teamDetail, projects: [] });
});

export default router;
