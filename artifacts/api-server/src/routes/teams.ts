import { Router, type IRouter } from "express";
import { eq, and, ilike, sql, or, ne, inArray, notInArray } from "drizzle-orm";
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
  teamInvitationsTable,
  teamJoinRequestsTable,
  teamLeaveRequestsTable,
  rosterTable,
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
  TransferTeamLeadershipParams,
  TransferTeamLeadershipBody,
  SearchCampusStudentsQueryParams,
  JoinTeamByCodeBody,
  ListTeamInvitationsParams,
  SendTeamInvitationParams,
  SendTeamInvitationBody,
  AcceptInvitationParams,
  DeclineInvitationParams,
  ListTeamJoinRequestsParams,
  RequestToJoinTeamParams,
  RequestToJoinTeamBody,
  ApproveJoinRequestParams,
  DeclineJoinRequestParams,
  ListTeamLeaveRequestsParams,
  RequestToLeaveTeamParams,
  RequestToLeaveTeamBody,
  ApproveLeaveRequestParams,
  DeclineLeaveRequestParams,
} from "@workspace/api-zod";
import { logAudit } from "../lib/audit";
import { createNotification } from "../lib/notifications";

const router: IRouter = Router();

function generateInviteCode(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < 8; i++) {
    out += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return out;
}

async function generateUniqueInviteCode(): Promise<string> {
  for (let i = 0; i < 8; i++) {
    const code = generateInviteCode();
    const [existing] = await db.select().from(teamsTable).where(eq(teamsTable.inviteCode, code));
    if (!existing) return code;
  }
  // Extremely unlikely; fall back to longer
  return generateInviteCode() + generateInviteCode().slice(0, 4);
}

function fullName(u: { firstName?: string | null; lastName?: string | null } | undefined | null): string {
  if (!u) return "";
  return `${u.firstName ?? ""} ${u.lastName ?? ""}`.trim();
}

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
  if (search) {
    const pattern = `%${search}%`;
    // Find campus IDs whose name matches
    const matchingCampuses = await db
      .select({ id: campusesTable.id })
      .from(campusesTable)
      .where(ilike(campusesTable.name, pattern));
    const matchingCampusIds = matchingCampuses.map((c) => c.id);

    // Find user IDs whose name/email matches
    const matchingUsers = await db
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(
        or(
          ilike(usersTable.email, pattern),
          ilike(usersTable.firstName, pattern),
          ilike(usersTable.lastName, pattern),
          ilike(sql`(${usersTable.firstName} || ' ' || ${usersTable.lastName})`, pattern),
        ),
      );
    const matchingUserIds = matchingUsers.map((u) => u.id);

    // Find user IDs by NIAT ID via roster (match by roster.email -> users.email,
    // or roster.studentId -> users.formsUserId)
    const matchingRoster = await db
      .select()
      .from(rosterTable)
      .where(ilike(rosterTable.niatId, pattern));
    const rosterEmails = matchingRoster.map((r) => r.email).filter((e): e is string => !!e);
    const rosterStudentIds = matchingRoster
      .map((r) => r.studentId)
      .filter((s): s is string => !!s);
    if (rosterEmails.length > 0 || rosterStudentIds.length > 0) {
      const rosterUserOr = or(
        ...(rosterEmails.length > 0 ? [inArray(usersTable.email, rosterEmails)] : []),
        ...(rosterStudentIds.length > 0 ? [inArray(usersTable.formsUserId, rosterStudentIds)] : []),
      );
      if (rosterUserOr) {
        const rosterMatchedUsers = await db
          .select({ id: usersTable.id })
          .from(usersTable)
          .where(rosterUserOr);
        for (const u of rosterMatchedUsers) {
          if (!matchingUserIds.includes(u.id)) matchingUserIds.push(u.id);
        }
      }
    }

    // Map matching users -> their team IDs via team_members
    let memberTeamIds: number[] = [];
    if (matchingUserIds.length > 0) {
      const memberRows = await db
        .select({ teamId: teamMembersTable.teamId })
        .from(teamMembersTable)
        .where(inArray(teamMembersTable.userId, matchingUserIds));
      memberTeamIds = Array.from(new Set(memberRows.map((m) => m.teamId)));
    }

    const orParts = [ilike(teamsTable.name, pattern)];
    if (matchingCampusIds.length > 0) orParts.push(inArray(teamsTable.campusId, matchingCampusIds));
    if (memberTeamIds.length > 0) orParts.push(inArray(teamsTable.id, memberTeamIds));
    const orFilter = or(...orParts);
    if (orFilter) conditions.push(orFilter);
  }

  const teamsRaw = conditions.length > 0
    ? await db.select().from(teamsTable).where(and(...conditions)).orderBy(teamsTable.createdAt)
    : await db.select().from(teamsTable).orderBy(teamsTable.createdAt);
  // De-duplicate by team id (defensive — query above shouldn't dup, but joins/usage may)
  const seenTeamIds = new Set<number>();
  const teams = teamsRaw.filter((t) => {
    if (seenTeamIds.has(t.id)) return false;
    seenTeamIds.add(t.id);
    return true;
  });

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
  // Students can only create a team for their own campus
  if (req.user.role === "student" && req.user.campusId && parsed.data.campusId !== req.user.campusId) {
    res.status(403).json({ error: "You can only create a team at your own campus" });
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
  // Enforce campus = user's campus; reject if not assigned (admins may set campusId explicitly)
  const campusId = req.user.role === "admin"
    ? (req.user.campusId ?? parsed.data.campusId)
    : req.user.campusId;
  if (!campusId) {
    res.status(400).json({ error: "Your account has no campus assigned. Please contact your coordinator." });
    return;
  }
  const inviteCode = await generateUniqueInviteCode();
  const teamData = {
    name: parsed.data.name,
    campusId,
    tagline: parsed.data.tagline ?? null,
    photoUrl: parsed.data.photoUrl ?? null,
    leaderId: req.user.id,
    inviteCode,
  };
  let team;
  try {
    [team] = await db
      .insert(teamsTable)
      .values(teamData)
      .returning();
    await db.insert(teamMembersTable).values({ teamId: team.id, userId: req.user.id });
  } catch {
    res.status(409).json({ error: "Could not create team. You may already be on a team." });
    return;
  }
  const teamDetail = await getTeamWithStats(team.id);
  res.status(201).json(teamDetail);
});

// ----- Browse / Search / Join-by-code (must come before /teams/:id) -----

router.get("/teams/browse", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  if (!req.user.campusId) {
    res.status(400).json({ error: "Your account has no campus assigned" });
    return;
  }
  const teams = await db
    .select()
    .from(teamsTable)
    .where(and(eq(teamsTable.campusId, req.user.campusId), eq(teamsTable.isHidden, false)))
    .orderBy(teamsTable.createdAt);
  const result = await Promise.all(
    teams.map(async (team) => {
      const [campus] = await db.select().from(campusesTable).where(eq(campusesTable.id, team.campusId));
      const [leader] = await db.select().from(usersTable).where(eq(usersTable.id, team.leaderId));
      const [memberCount] = await db
        .select({ count: sql<number>`count(*)` })
        .from(teamMembersTable)
        .where(eq(teamMembersTable.teamId, team.id));
      return {
        ...team,
        campusName: campus?.name ?? "",
        leaderName: leader ? `${leader.firstName} ${leader.lastName}` : "",
        memberCount: Number(memberCount?.count ?? 0),
        projectCount: 0,
        totalRevenue: 0,
        totalOrderBook: 0,
        nationalRank: null as number | null,
      };
    })
  );
  res.json(result);
});

router.get("/teams/students/search", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  if (!req.user.campusId) {
    res.status(400).json({ error: "Your account has no campus assigned" });
    return;
  }
  const queryParams = SearchCampusStudentsQueryParams.safeParse(req.query);
  if (!queryParams.success) {
    res.status(400).json({ error: queryParams.error.message });
    return;
  }
  const q = queryParams.data.q.trim();
  if (q.length < 1) {
    res.json([]);
    return;
  }
  // Users on same campus, role student. Not on any team. Match by name OR niat id (via roster).
  const onTeamSubquery = db.select({ uid: teamMembersTable.userId }).from(teamMembersTable);

  // Find roster entries matching by niatId/studentId prefix
  const rosterMatches = await db
    .select()
    .from(rosterTable)
    .where(
      and(
        eq(rosterTable.campusId, req.user.campusId),
        or(
          ilike(rosterTable.niatId, `${q}%`),
          ilike(rosterTable.studentId, `${q}%`)
        )
      )
    );
  const rosterEmails = rosterMatches.map((r) => r.email).filter((e): e is string => !!e);
  const rosterStudentIds = rosterMatches.map((r) => r.studentId).filter((s): s is string => !!s);

  const conditions = [
    eq(usersTable.campusId, req.user.campusId),
    eq(usersTable.role, "student"),
    ne(usersTable.id, req.user.id),
    notInArray(usersTable.id, onTeamSubquery),
  ];

  const orParts = [
    ilike(usersTable.firstName, `%${q}%`),
    ilike(usersTable.lastName, `%${q}%`),
    ilike(sql`(${usersTable.firstName} || ' ' || ${usersTable.lastName})`, `%${q}%`),
    ilike(usersTable.email, `${q}%`),
  ];
  if (rosterEmails.length > 0) orParts.push(inArray(usersTable.email, rosterEmails));
  if (rosterStudentIds.length > 0) orParts.push(inArray(usersTable.formsUserId, rosterStudentIds));

  const rows = await db
    .select()
    .from(usersTable)
    .where(and(...conditions, or(...orParts)))
    .limit(20);

  // Look up niat ids for matched users
  const result = await Promise.all(
    rows.map(async (u) => {
      const matchClauses = [eq(rosterTable.email, u.email)];
      if (u.formsUserId) matchClauses.push(eq(rosterTable.studentId, u.formsUserId));
      const [r] = await db.select().from(rosterTable).where(or(...matchClauses));
      return {
        id: u.id,
        firstName: u.firstName,
        lastName: u.lastName,
        email: u.email,
        niatId: r?.niatId ?? null,
        profileImage: u.profileImage ?? null,
      };
    })
  );
  res.json(result);
});

router.post("/teams/join-by-code", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const parsed = JoinTeamByCodeBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const code = parsed.data.code.trim().toUpperCase();
  const [team] = await db.select().from(teamsTable).where(eq(teamsTable.inviteCode, code));
  if (!team) {
    res.status(404).json({ error: "Invalid invite code" });
    return;
  }
  if (req.user.campusId && team.campusId !== req.user.campusId) {
    res.status(403).json({ error: "This team is at a different campus" });
    return;
  }
  const [existing] = await db.select().from(teamMembersTable).where(eq(teamMembersTable.userId, req.user.id));
  if (existing) {
    if (existing.teamId === team.id) {
      const detail = await getTeamWithStats(team.id);
      res.json({ ...detail, projects: [] });
      return;
    }
    res.status(400).json({ error: "You are already on a team" });
    return;
  }
  try {
    await db.insert(teamMembersTable).values({ teamId: team.id, userId: req.user.id });
  } catch {
    res.status(409).json({ error: "Could not join team. You may already be on a team." });
    return;
  }
  // Cancel pending invites/join requests for this user
  await db
    .update(teamInvitationsTable)
    .set({ status: "cancelled", respondedAt: new Date() })
    .where(and(eq(teamInvitationsTable.inviteeId, req.user.id), eq(teamInvitationsTable.status, "pending")));
  await db
    .update(teamJoinRequestsTable)
    .set({ status: "cancelled", respondedAt: new Date() })
    .where(and(eq(teamJoinRequestsTable.requesterId, req.user.id), eq(teamJoinRequestsTable.status, "pending")));

  // Notify all existing members
  const others = await db.select().from(teamMembersTable).where(eq(teamMembersTable.teamId, team.id));
  for (const m of others) {
    if (m.userId !== req.user.id) {
      await createNotification(
        m.userId,
        "New teammate",
        `${fullName(req.user)} joined "${team.name}" using the invite code.`,
        "team_member_joined",
        "/team",
      );
    }
  }
  const detail = await getTeamWithStats(team.id);
  res.json({ ...detail, projects: [] });
});

// ----- /teams/my and /teams/:id -----

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
  const projects = await db.select().from(projectsTable).where(eq(projectsTable.teamId, member.teamId));
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
  await db.insert(milestonesTable).values({
    teamId: team.id,
    type: "auto",
    title: "Team Registered",
    description: "Your team has been approved and is now active!",
    date: new Date(),
    isPinned: false,
  });
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
  res.status(201).json({ ...teamDetail, projects: [] });
});

router.delete("/teams/:id/members/:userId", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const params = RemoveTeamMemberParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [team] = await db.select().from(teamsTable).where(eq(teamsTable.id, params.data.id));
  if (!team) {
    res.status(404).json({ error: "Team not found" });
    return;
  }
  const isAdmin = req.user.role === "admin";
  const isLeader = team.leaderId === req.user.id;
  if (!isAdmin && !isLeader) {
    res.status(403).json({ error: "Only the team leader or an admin can remove members." });
    return;
  }
  // A leader cannot remove themselves through this endpoint
  if (isLeader && !isAdmin && params.data.userId === req.user.id) {
    res.status(400).json({ error: "You cannot remove yourself. Transfer leadership first." });
    return;
  }
  // Prevent removing the team leader
  if (team.leaderId === params.data.userId) {
    res.status(400).json({ error: "Cannot remove the team leader. Transfer leadership first." });
    return;
  }
  // Confirm the target is actually a member of this team
  const [membership] = await db
    .select()
    .from(teamMembersTable)
    .where(and(eq(teamMembersTable.teamId, params.data.id), eq(teamMembersTable.userId, params.data.userId)));
  if (!membership) {
    res.status(404).json({ error: "That user is not a member of this team." });
    return;
  }
  await db
    .delete(teamMembersTable)
    .where(and(eq(teamMembersTable.teamId, params.data.id), eq(teamMembersTable.userId, params.data.userId)));
  await createNotification(
    params.data.userId,
    "Removed from team",
    `You were removed from "${team.name}".`,
    "team_member_removed",
    "/",
  );
  const teamDetail = await getTeamWithStats(params.data.id);
  res.json({ ...teamDetail, projects: [] });
});

router.post("/teams/:id/transfer-leadership", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const params = TransferTeamLeadershipParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = TransferTeamLeadershipBody.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [team] = await db.select().from(teamsTable).where(eq(teamsTable.id, params.data.id));
  if (!team) {
    res.status(404).json({ error: "Team not found" });
    return;
  }
  if (team.leaderId !== req.user.id) {
    res.status(403).json({ error: "Only the current team leader can transfer leadership." });
    return;
  }
  if (parsed.data.newLeaderId === team.leaderId) {
    res.status(400).json({ error: "That member is already the team leader." });
    return;
  }
  const [target] = await db
    .select()
    .from(teamMembersTable)
    .where(and(eq(teamMembersTable.teamId, params.data.id), eq(teamMembersTable.userId, parsed.data.newLeaderId)));
  if (!target) {
    res.status(400).json({ error: "The new leader must be a current member of this team." });
    return;
  }
  const previousLeaderId = team.leaderId;
  await db
    .update(teamsTable)
    .set({ leaderId: parsed.data.newLeaderId })
    .where(eq(teamsTable.id, params.data.id));
  await createNotification(
    parsed.data.newLeaderId,
    "You're now the team leader",
    `You are the new leader of "${team.name}".`,
    "team_leadership_received",
    "/team",
  );
  await createNotification(
    previousLeaderId,
    "Leadership transferred",
    `You transferred leadership of "${team.name}" to a teammate.`,
    "team_leadership_transferred",
    "/team",
  );
  const teamDetail = await getTeamWithStats(params.data.id);
  res.json({ ...teamDetail, projects: [] });
});

// ============= INVITATIONS =============

async function ensureTeamMember(teamId: number, userId: string): Promise<boolean> {
  const [m] = await db.select().from(teamMembersTable).where(and(eq(teamMembersTable.teamId, teamId), eq(teamMembersTable.userId, userId)));
  return !!m;
}

async function shapeInvitation(inv: typeof teamInvitationsTable.$inferSelect) {
  const [team] = await db.select().from(teamsTable).where(eq(teamsTable.id, inv.teamId));
  const [invitee] = await db.select().from(usersTable).where(eq(usersTable.id, inv.inviteeId));
  const [inviter] = await db.select().from(usersTable).where(eq(usersTable.id, inv.inviterId));
  return {
    id: inv.id,
    teamId: inv.teamId,
    teamName: team?.name ?? "",
    teamPhotoUrl: team?.photoUrl ?? null,
    inviteeId: inv.inviteeId,
    inviteeName: fullName(invitee),
    inviteeEmail: invitee?.email ?? "",
    inviterId: inv.inviterId,
    inviterName: fullName(inviter),
    status: inv.status,
    createdAt: inv.createdAt,
    respondedAt: inv.respondedAt,
  };
}

router.get("/teams/:id/invitations", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const params = ListTeamInvitationsParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  if (!(await ensureTeamMember(params.data.id, req.user.id)) && req.user.role !== "admin") {
    res.status(403).json({ error: "You are not a member of this team" });
    return;
  }
  const invs = await db
    .select()
    .from(teamInvitationsTable)
    .where(eq(teamInvitationsTable.teamId, params.data.id))
    .orderBy(sql`created_at desc`);
  const result = await Promise.all(invs.map(shapeInvitation));
  res.json(result);
});

router.post("/teams/:id/invitations", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const params = SendTeamInvitationParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = SendTeamInvitationBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  if (!(await ensureTeamMember(params.data.id, req.user.id))) {
    res.status(403).json({ error: "Only team members can send invitations" });
    return;
  }
  const [team] = await db.select().from(teamsTable).where(eq(teamsTable.id, params.data.id));
  if (!team) {
    res.status(404).json({ error: "Team not found" });
    return;
  }
  const [invitee] = await db.select().from(usersTable).where(eq(usersTable.id, parsed.data.inviteeId));
  if (!invitee) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  if (invitee.role !== "student") {
    res.status(400).json({ error: "Only students can be invited" });
    return;
  }
  if (invitee.campusId !== team.campusId) {
    res.status(400).json({ error: "You can only invite students from the same campus" });
    return;
  }
  // Check roster whitelist
  const matchClauses = [eq(rosterTable.email, invitee.email)];
  if (invitee.formsUserId) matchClauses.push(eq(rosterTable.studentId, invitee.formsUserId));
  const [roster] = await db.select().from(rosterTable).where(and(or(...matchClauses), eq(rosterTable.isWhitelisted, true)));
  if (!roster) {
    res.status(400).json({ error: "Student is not on the roster" });
    return;
  }
  const [onTeam] = await db.select().from(teamMembersTable).where(eq(teamMembersTable.userId, invitee.id));
  if (onTeam) {
    res.status(400).json({ error: "Student is already on a team" });
    return;
  }
  // Check duplicate pending invite from this team
  const [dup] = await db
    .select()
    .from(teamInvitationsTable)
    .where(and(
      eq(teamInvitationsTable.teamId, params.data.id),
      eq(teamInvitationsTable.inviteeId, invitee.id),
      eq(teamInvitationsTable.status, "pending"),
    ));
  if (dup) {
    res.status(400).json({ error: "An invitation is already pending for this student" });
    return;
  }
  const [inv] = await db
    .insert(teamInvitationsTable)
    .values({ teamId: params.data.id, inviteeId: invitee.id, inviterId: req.user.id })
    .returning();
  await createNotification(
    invitee.id,
    "Team Invitation",
    `${fullName(req.user)} invited you to join "${team.name}".`,
    "team_invitation",
    "/invitations",
  );
  res.status(201).json(await shapeInvitation(inv));
});

router.get("/invitations/my", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const invs = await db
    .select()
    .from(teamInvitationsTable)
    .where(and(eq(teamInvitationsTable.inviteeId, req.user.id), eq(teamInvitationsTable.status, "pending")))
    .orderBy(sql`created_at desc`);
  const result = await Promise.all(invs.map(shapeInvitation));
  res.json(result);
});

router.post("/invitations/:id/accept", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const params = AcceptInvitationParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [inv] = await db.select().from(teamInvitationsTable).where(eq(teamInvitationsTable.id, params.data.id));
  if (!inv) {
    res.status(404).json({ error: "Invitation not found" });
    return;
  }
  if (inv.inviteeId !== req.user.id) {
    res.status(403).json({ error: "This invitation is not for you" });
    return;
  }
  if (inv.status !== "pending") {
    res.status(400).json({ error: "Invitation is no longer pending" });
    return;
  }
  const [onTeam] = await db.select().from(teamMembersTable).where(eq(teamMembersTable.userId, req.user.id));
  if (onTeam) {
    res.status(400).json({ error: "You are already on a team" });
    return;
  }
  const [team] = await db.select().from(teamsTable).where(eq(teamsTable.id, inv.teamId));
  if (!team) {
    res.status(404).json({ error: "Team not found" });
    return;
  }
  try {
    await db.insert(teamMembersTable).values({ teamId: inv.teamId, userId: req.user.id });
  } catch {
    res.status(409).json({ error: "Could not join team. You may already be on a team." });
    return;
  }
  await db
    .update(teamInvitationsTable)
    .set({ status: "accepted", respondedAt: new Date() })
    .where(eq(teamInvitationsTable.id, inv.id));
  // Cancel my other pending invites + join requests
  await db
    .update(teamInvitationsTable)
    .set({ status: "cancelled", respondedAt: new Date() })
    .where(and(
      eq(teamInvitationsTable.inviteeId, req.user.id),
      eq(teamInvitationsTable.status, "pending"),
    ));
  await db
    .update(teamJoinRequestsTable)
    .set({ status: "cancelled", respondedAt: new Date() })
    .where(and(
      eq(teamJoinRequestsTable.requesterId, req.user.id),
      eq(teamJoinRequestsTable.status, "pending"),
    ));
  // Notify inviter and team members
  await createNotification(
    inv.inviterId,
    "Invitation Accepted",
    `${fullName(req.user)} accepted your invite to "${team.name}".`,
    "team_invitation_accepted",
    "/team",
  );
  const others = await db.select().from(teamMembersTable).where(eq(teamMembersTable.teamId, team.id));
  for (const m of others) {
    if (m.userId !== req.user.id && m.userId !== inv.inviterId) {
      await createNotification(
        m.userId,
        "New teammate",
        `${fullName(req.user)} joined "${team.name}".`,
        "team_member_joined",
        "/team",
      );
    }
  }
  const detail = await getTeamWithStats(team.id);
  res.json({ ...detail, projects: [] });
});

router.post("/invitations/:id/decline", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const params = DeclineInvitationParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [inv] = await db.select().from(teamInvitationsTable).where(eq(teamInvitationsTable.id, params.data.id));
  if (!inv) {
    res.status(404).json({ error: "Invitation not found" });
    return;
  }
  if (inv.inviteeId !== req.user.id) {
    res.status(403).json({ error: "This invitation is not for you" });
    return;
  }
  if (inv.status !== "pending") {
    res.status(400).json({ error: "Invitation is no longer pending" });
    return;
  }
  await db
    .update(teamInvitationsTable)
    .set({ status: "declined", respondedAt: new Date() })
    .where(eq(teamInvitationsTable.id, inv.id));
  const [team] = await db.select().from(teamsTable).where(eq(teamsTable.id, inv.teamId));
  await createNotification(
    inv.inviterId,
    "Invitation Declined",
    `${fullName(req.user)} declined your invite to "${team?.name ?? ""}".`,
    "team_invitation_declined",
    "/team",
  );
  res.json({ success: true });
});

// ============= JOIN REQUESTS =============

async function shapeJoinRequest(jr: typeof teamJoinRequestsTable.$inferSelect) {
  const [team] = await db.select().from(teamsTable).where(eq(teamsTable.id, jr.teamId));
  const [requester] = await db.select().from(usersTable).where(eq(usersTable.id, jr.requesterId));
  return {
    id: jr.id,
    teamId: jr.teamId,
    teamName: team?.name ?? "",
    requesterId: jr.requesterId,
    requesterName: fullName(requester),
    requesterEmail: requester?.email ?? "",
    requesterProfileImage: requester?.profileImage ?? null,
    message: jr.message ?? null,
    status: jr.status,
    createdAt: jr.createdAt,
  };
}

router.get("/teams/:id/join-requests", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const params = ListTeamJoinRequestsParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  if (!(await ensureTeamMember(params.data.id, req.user.id)) && req.user.role !== "admin") {
    res.status(403).json({ error: "You are not a member of this team" });
    return;
  }
  const rows = await db
    .select()
    .from(teamJoinRequestsTable)
    .where(and(eq(teamJoinRequestsTable.teamId, params.data.id), eq(teamJoinRequestsTable.status, "pending")))
    .orderBy(sql`created_at desc`);
  const result = await Promise.all(rows.map(shapeJoinRequest));
  res.json(result);
});

router.post("/teams/:id/join-requests", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const params = RequestToJoinTeamParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = RequestToJoinTeamBody.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [team] = await db.select().from(teamsTable).where(eq(teamsTable.id, params.data.id));
  if (!team) {
    res.status(404).json({ error: "Team not found" });
    return;
  }
  if (req.user.campusId && team.campusId !== req.user.campusId) {
    res.status(403).json({ error: "You can only request to join teams at your campus" });
    return;
  }
  const [onTeam] = await db.select().from(teamMembersTable).where(eq(teamMembersTable.userId, req.user.id));
  if (onTeam) {
    res.status(400).json({ error: "You are already on a team" });
    return;
  }
  const [dup] = await db
    .select()
    .from(teamJoinRequestsTable)
    .where(and(
      eq(teamJoinRequestsTable.teamId, params.data.id),
      eq(teamJoinRequestsTable.requesterId, req.user.id),
      eq(teamJoinRequestsTable.status, "pending"),
    ));
  if (dup) {
    res.status(400).json({ error: "You already have a pending request for this team" });
    return;
  }
  const [jr] = await db
    .insert(teamJoinRequestsTable)
    .values({ teamId: params.data.id, requesterId: req.user.id, message: parsed.data.message ?? null })
    .returning();
  // Notify all team members
  const members = await db.select().from(teamMembersTable).where(eq(teamMembersTable.teamId, params.data.id));
  for (const m of members) {
    await createNotification(
      m.userId,
      "Join Request",
      `${fullName(req.user)} requested to join "${team.name}".`,
      "team_join_request",
      "/team",
    );
  }
  res.status(201).json(await shapeJoinRequest(jr));
});

router.post("/join-requests/:id/approve", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const params = ApproveJoinRequestParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [jr] = await db.select().from(teamJoinRequestsTable).where(eq(teamJoinRequestsTable.id, params.data.id));
  if (!jr) {
    res.status(404).json({ error: "Request not found" });
    return;
  }
  if (jr.status !== "pending") {
    res.status(400).json({ error: "Request is no longer pending" });
    return;
  }
  if (!(await ensureTeamMember(jr.teamId, req.user.id))) {
    res.status(403).json({ error: "Only team members can approve join requests" });
    return;
  }
  const [team] = await db.select().from(teamsTable).where(eq(teamsTable.id, jr.teamId));
  if (!team) {
    res.status(404).json({ error: "Team not found" });
    return;
  }
  const [onTeam] = await db.select().from(teamMembersTable).where(eq(teamMembersTable.userId, jr.requesterId));
  if (onTeam) {
    await db
      .update(teamJoinRequestsTable)
      .set({ status: "cancelled", respondedAt: new Date(), decidedById: req.user.id })
      .where(eq(teamJoinRequestsTable.id, jr.id));
    res.status(400).json({ error: "Requester is already on a team" });
    return;
  }
  try {
    await db.insert(teamMembersTable).values({ teamId: jr.teamId, userId: jr.requesterId });
  } catch {
    res.status(409).json({ error: "Could not add member. They may already be on a team." });
    return;
  }
  await db
    .update(teamJoinRequestsTable)
    .set({ status: "approved", respondedAt: new Date(), decidedById: req.user.id })
    .where(eq(teamJoinRequestsTable.id, jr.id));
  // Cancel requester's other pending invites + join requests
  await db
    .update(teamInvitationsTable)
    .set({ status: "cancelled", respondedAt: new Date() })
    .where(and(eq(teamInvitationsTable.inviteeId, jr.requesterId), eq(teamInvitationsTable.status, "pending")));
  await db
    .update(teamJoinRequestsTable)
    .set({ status: "cancelled", respondedAt: new Date() })
    .where(and(
      eq(teamJoinRequestsTable.requesterId, jr.requesterId),
      eq(teamJoinRequestsTable.status, "pending"),
    ));
  await createNotification(
    jr.requesterId,
    "Request Approved",
    `Your request to join "${team.name}" was approved.`,
    "team_join_approved",
    "/team",
  );
  const others = await db.select().from(teamMembersTable).where(eq(teamMembersTable.teamId, team.id));
  const [requester] = await db.select().from(usersTable).where(eq(usersTable.id, jr.requesterId));
  for (const m of others) {
    if (m.userId !== jr.requesterId) {
      await createNotification(
        m.userId,
        "New teammate",
        `${fullName(requester)} joined "${team.name}".`,
        "team_member_joined",
        "/team",
      );
    }
  }
  const detail = await getTeamWithStats(team.id);
  res.json({ ...detail, projects: [] });
});

router.post("/join-requests/:id/decline", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const params = DeclineJoinRequestParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [jr] = await db.select().from(teamJoinRequestsTable).where(eq(teamJoinRequestsTable.id, params.data.id));
  if (!jr) {
    res.status(404).json({ error: "Request not found" });
    return;
  }
  if (jr.status !== "pending") {
    res.status(400).json({ error: "Request is no longer pending" });
    return;
  }
  if (!(await ensureTeamMember(jr.teamId, req.user.id))) {
    res.status(403).json({ error: "Only team members can decline join requests" });
    return;
  }
  await db
    .update(teamJoinRequestsTable)
    .set({ status: "declined", respondedAt: new Date(), decidedById: req.user.id })
    .where(eq(teamJoinRequestsTable.id, jr.id));
  const [team] = await db.select().from(teamsTable).where(eq(teamsTable.id, jr.teamId));
  await createNotification(
    jr.requesterId,
    "Request Declined",
    `Your request to join "${team?.name ?? ""}" was declined.`,
    "team_join_declined",
    "/team",
  );
  res.json({ success: true });
});

// ============= LEAVE REQUESTS =============

async function shapeLeaveRequest(lr: typeof teamLeaveRequestsTable.$inferSelect) {
  const [requester] = await db.select().from(usersTable).where(eq(usersTable.id, lr.requesterId));
  return {
    id: lr.id,
    teamId: lr.teamId,
    requesterId: lr.requesterId,
    requesterName: fullName(requester),
    requesterEmail: requester?.email ?? "",
    requesterProfileImage: requester?.profileImage ?? null,
    reason: lr.reason ?? null,
    status: lr.status,
    createdAt: lr.createdAt,
  };
}

router.get("/teams/:id/leave-requests", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const params = ListTeamLeaveRequestsParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [team] = await db.select().from(teamsTable).where(eq(teamsTable.id, params.data.id));
  if (!team) {
    res.status(404).json({ error: "Team not found" });
    return;
  }
  if (team.leaderId !== req.user.id && req.user.role !== "admin") {
    res.status(403).json({ error: "Only the team leader can view leave requests" });
    return;
  }
  const rows = await db
    .select()
    .from(teamLeaveRequestsTable)
    .where(and(eq(teamLeaveRequestsTable.teamId, params.data.id), eq(teamLeaveRequestsTable.status, "pending")))
    .orderBy(sql`created_at desc`);
  const result = await Promise.all(rows.map(shapeLeaveRequest));
  res.json(result);
});

router.post("/teams/:id/leave-requests", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const params = RequestToLeaveTeamParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = RequestToLeaveTeamBody.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [team] = await db.select().from(teamsTable).where(eq(teamsTable.id, params.data.id));
  if (!team) {
    res.status(404).json({ error: "Team not found" });
    return;
  }
  if (team.leaderId === req.user.id) {
    res.status(400).json({ error: "Team leaders cannot leave the team. Transfer leadership first." });
    return;
  }
  if (!(await ensureTeamMember(params.data.id, req.user.id))) {
    res.status(403).json({ error: "You are not a member of this team" });
    return;
  }
  const userId = req.user.id!;
  const [dup] = await db
    .select()
    .from(teamLeaveRequestsTable)
    .where(and(
      eq(teamLeaveRequestsTable.teamId, params.data.id),
      eq(teamLeaveRequestsTable.requesterId, userId),
      eq(teamLeaveRequestsTable.status, "pending"),
    ));
  if (dup) {
    res.status(400).json({ error: "You already have a pending leave request" });
    return;
  }
  const [lr] = await db
    .insert(teamLeaveRequestsTable)
    .values({ teamId: params.data.id, requesterId: userId, reason: parsed.data.reason ?? undefined })
    .returning();
  await createNotification(
    team.leaderId,
    "Leave Request",
    `${fullName(req.user)} requested to leave "${team.name}".`,
    "team_leave_request",
    "/team",
  );
  res.status(201).json(await shapeLeaveRequest(lr));
});

router.post("/leave-requests/:id/approve", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const params = ApproveLeaveRequestParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [lr] = await db.select().from(teamLeaveRequestsTable).where(eq(teamLeaveRequestsTable.id, params.data.id));
  if (!lr) {
    res.status(404).json({ error: "Request not found" });
    return;
  }
  if (lr.status !== "pending") {
    res.status(400).json({ error: "Request is no longer pending" });
    return;
  }
  const [team] = await db.select().from(teamsTable).where(eq(teamsTable.id, lr.teamId));
  if (!team) {
    res.status(404).json({ error: "Team not found" });
    return;
  }
  if (team.leaderId !== req.user.id && req.user.role !== "admin") {
    res.status(403).json({ error: "Only the team leader can approve leave requests" });
    return;
  }
  if (lr.requesterId === team.leaderId) {
    res.status(400).json({ error: "Cannot approve a leader's leave request" });
    return;
  }
  await db
    .delete(teamMembersTable)
    .where(and(eq(teamMembersTable.teamId, lr.teamId), eq(teamMembersTable.userId, lr.requesterId)));
  await db
    .update(teamLeaveRequestsTable)
    .set({ status: "approved", respondedAt: new Date(), decidedById: req.user.id })
    .where(eq(teamLeaveRequestsTable.id, lr.id));
  await createNotification(
    lr.requesterId,
    "Leave Approved",
    `You have left "${team.name}".`,
    "team_leave_approved",
    "/",
  );
  res.json({ success: true });
});

router.post("/leave-requests/:id/decline", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const params = DeclineLeaveRequestParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [lr] = await db.select().from(teamLeaveRequestsTable).where(eq(teamLeaveRequestsTable.id, params.data.id));
  if (!lr) {
    res.status(404).json({ error: "Request not found" });
    return;
  }
  if (lr.status !== "pending") {
    res.status(400).json({ error: "Request is no longer pending" });
    return;
  }
  const [team] = await db.select().from(teamsTable).where(eq(teamsTable.id, lr.teamId));
  if (!team) {
    res.status(404).json({ error: "Team not found" });
    return;
  }
  if (team.leaderId !== req.user.id && req.user.role !== "admin") {
    res.status(403).json({ error: "Only the team leader can decline leave requests" });
    return;
  }
  await db
    .update(teamLeaveRequestsTable)
    .set({ status: "declined", respondedAt: new Date(), decidedById: req.user.id })
    .where(eq(teamLeaveRequestsTable.id, lr.id));
  await createNotification(
    lr.requesterId,
    "Leave Declined",
    `Your request to leave "${team.name}" was declined.`,
    "team_leave_declined",
    "/team",
  );
  res.json({ success: true });
});

export default router;
