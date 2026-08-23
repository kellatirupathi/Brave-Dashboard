import { Router, type IRouter } from "express";
import { eq, and, ilike, sql, or, ne, inArray, notInArray } from "drizzle-orm";
import { resolveSeason } from "../lib/season";
import { getProjectClientCount } from "../lib/project-stats";
import { requireAdminPage } from "../lib/require-admin-page";
import {
  getTeamMemberLimit,
  getTeamMemberCount,
  teamFullMessage,
} from "../lib/team-limits";
import {
  createMembershipRequest,
  findPendingRequestForUser,
} from "../lib/membership-requests";
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
  demoDayApplicationsTable,
  announcementsTable,
  membershipRequestsTable,
  rosterTable,
} from "@workspace/db";
import {
  ListTeamsQueryParams,
  CreateTeamBody,
  GetTeamParams,
  UpdateTeamParams,
  UpdateTeamBody,
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
  CancelInvitationParams,
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
import { generateUniqueInviteCode } from "../lib/team-helpers";

const router: IRouter = Router();

function fullName(
  u: { firstName?: string | null; lastName?: string | null } | undefined | null,
): string {
  if (!u) return "";
  return `${u.firstName ?? ""} ${u.lastName ?? ""}`.trim();
}

// Teams are SHARED across seasons, but their revenue / order book / project
// figures are not. `seasonId` is required so no caller can silently report a
// team's lifetime totals where a single season's were meant.
async function getTeamWithStats(teamId: number, seasonId: number) {
  const [team] = await db
    .select()
    .from(teamsTable)
    .where(eq(teamsTable.id, teamId));
  if (!team) return null;
  const [campus] = await db
    .select()
    .from(campusesTable)
    .where(eq(campusesTable.id, team.campusId));
  const [leader] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.id, team.leaderId));
  const members = await db
    .select({
      userId: teamMembersTable.userId,
      memberRole: teamMembersTable.memberRole,
    })
    .from(teamMembersTable)
    .where(eq(teamMembersTable.teamId, teamId));
  const memberDetails = await Promise.all(
    members.map(async (m) => {
      const [user] = await db
        .select()
        .from(usersTable)
        .where(eq(usersTable.id, m.userId));
      return {
        userId: m.userId,
        email: user?.email ?? "",
        niatId: user?.niatId ?? null,
        firstName: user?.firstName ?? "",
        lastName: user?.lastName ?? "",
        profileImage: user?.profileImage ?? null,
        memberRole: m.memberRole,
        isLeader: m.userId === team.leaderId,
      };
    }),
  );
  const [revenueStats] = await db
    .select({ total: sql<number>`coalesce(sum(verified_amount), 0)` })
    .from(revenueEntriesTable)
    .where(
      and(
        eq(revenueEntriesTable.teamId, teamId),
        eq(revenueEntriesTable.seasonId, seasonId),
        sql`status = 'verified'`,
      ),
    );
  const [orderBookStats] = await db
    .select({ total: sql<number>`coalesce(sum(verified_amount), 0)` })
    .from(orderBookEntriesTable)
    .where(
      and(
        eq(orderBookEntriesTable.teamId, teamId),
        eq(orderBookEntriesTable.seasonId, seasonId),
        sql`status = 'verified'`,
      ),
    );
  const [projectCount] = await db
    .select({ count: sql<number>`count(*)` })
    .from(projectsTable)
    .where(
      and(
        eq(projectsTable.teamId, teamId),
        eq(projectsTable.seasonId, seasonId),
        eq(projectsTable.status, "active"),
      ),
    );
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
  const { campusId, status, search, page, pageSize } = queryParams.data;
  const effectivePage = page && page >= 1 ? page : 1;
  const effectivePageSize =
    pageSize && pageSize >= 1 ? Math.min(pageSize, 10000) : 100;
  const offset = (effectivePage - 1) * effectivePageSize;
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
          ilike(
            sql`(${usersTable.firstName} || ' ' || ${usersTable.lastName})`,
            pattern,
          ),
        ),
      );
    const matchingUserIds = matchingUsers.map((u) => u.id);

    // Find user IDs by NIAT ID via roster (match by roster.email -> users.email,
    // or roster.studentId -> users.formsUserId)
    const matchingRoster = await db
      .select()
      .from(rosterTable)
      .where(ilike(rosterTable.niatId, pattern));
    const rosterEmails = matchingRoster
      .map((r) => r.email)
      .filter((e): e is string => !!e);
    const rosterStudentIds = matchingRoster
      .map((r) => r.studentId)
      .filter((s): s is string => !!s);
    if (rosterEmails.length > 0 || rosterStudentIds.length > 0) {
      const rosterUserOr = or(
        ...(rosterEmails.length > 0
          ? [inArray(usersTable.email, rosterEmails)]
          : []),
        ...(rosterStudentIds.length > 0
          ? [inArray(usersTable.formsUserId, rosterStudentIds)]
          : []),
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
    if (matchingCampusIds.length > 0)
      orParts.push(inArray(teamsTable.campusId, matchingCampusIds));
    if (memberTeamIds.length > 0)
      orParts.push(inArray(teamsTable.id, memberTeamIds));
    const orFilter = or(...orParts);
    if (orFilter) conditions.push(orFilter);
  }

  const teamsRaw =
    conditions.length > 0
      ? await db
          .select()
          .from(teamsTable)
          .where(and(...conditions))
          .orderBy(teamsTable.createdAt)
      : await db.select().from(teamsTable).orderBy(teamsTable.createdAt);
  // De-duplicate by team id (defensive — query above shouldn't dup, but joins/usage may)
  const seenTeamIds = new Set<number>();
  const teamsDeduped = teamsRaw.filter((t) => {
    if (seenTeamIds.has(t.id)) return false;
    seenTeamIds.add(t.id);
    return true;
  });
  const totalCount = teamsDeduped.length;
  const teams = teamsDeduped.slice(offset, offset + effectivePageSize);

  const items = await Promise.all(
    teams.map(async (team) => {
      const [campus] = await db
        .select()
        .from(campusesTable)
        .where(eq(campusesTable.id, team.campusId));
      const [leader] = await db
        .select()
        .from(usersTable)
        .where(eq(usersTable.id, team.leaderId));
      const [memberCount] = await db
        .select({ count: sql<number>`count(*)` })
        .from(teamMembersTable)
        .where(eq(teamMembersTable.teamId, team.id));
      const [projectCount] = await db
        .select({ count: sql<number>`count(*)` })
        .from(projectsTable)
        .where(
          and(
            eq(projectsTable.teamId, team.id),
            eq(projectsTable.seasonId, await resolveSeason(req)),
            eq(projectsTable.status, "active"),
          ),
        );
      const [revenueStats] = await db
        .select({ total: sql<number>`coalesce(sum(verified_amount), 0)` })
        .from(revenueEntriesTable)
        .where(
          and(
            eq(revenueEntriesTable.teamId, team.id),
            eq(revenueEntriesTable.seasonId, await resolveSeason(req)),
            sql`status = 'verified'`,
          ),
        );
      const [orderBookStats] = await db
        .select({ total: sql<number>`coalesce(sum(verified_amount), 0)` })
        .from(orderBookEntriesTable)
        .where(
          and(
            eq(orderBookEntriesTable.teamId, team.id),
            eq(orderBookEntriesTable.seasonId, await resolveSeason(req)),
            sql`status = 'verified'`,
          ),
        );
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
    }),
  );
  res.json({
    items,
    total: totalCount,
    page: effectivePage,
    pageSize: effectivePageSize,
  });
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
  // Students can only create a team for their own campus (when one is already set)
  if (
    req.user.role === "student" &&
    req.user.campusId &&
    parsed.data.campusId !== req.user.campusId
  ) {
    res
      .status(403)
      .json({ error: "You can only create a team at your own campus" });
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
  // Resolve effective campus. Admins may pick any campus. Coordinators must be
  // pre-assigned to one. Students use their own when assigned; if a student has
  // no campus yet (auto-provisioned Forms SSO user), let them pick one during
  // team creation and persist it onto their user row.
  let campusId: number | undefined;
  if (req.user.role === "admin") {
    campusId = req.user.campusId ?? parsed.data.campusId;
  } else if (req.user.role === "student") {
    campusId = req.user.campusId ?? parsed.data.campusId;
  } else {
    // coordinator (or any other role) must already have a campus assigned
    campusId = req.user.campusId ?? undefined;
  }
  if (!campusId) {
    res.status(400).json({ error: "Please choose a campus for your team." });
    return;
  }
  // Validate the campus exists before we touch the user row.
  const [campusRow] = await db
    .select({ id: campusesTable.id })
    .from(campusesTable)
    .where(eq(campusesTable.id, campusId));
  if (!campusRow) {
    res.status(400).json({ error: "Selected campus does not exist." });
    return;
  }

  // Capture-on-create profile fields. Only persist values for fields the
  // user's row is currently missing; never overwrite an existing email or
  // niatId from a request body (that's what /auth/me is for).
  const [currentUser] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.id, req.user.id));
  if (!currentUser) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const userUpdates: Partial<typeof usersTable.$inferInsert> = {};
  if (!req.user.campusId && req.user.role === "student") {
    userUpdates.campusId = campusId;
  }

  const trimmedFullName = parsed.data.fullName?.trim();
  if ((!currentUser.firstName || !currentUser.lastName) && trimmedFullName) {
    const parts = trimmedFullName.split(/\s+/);
    const fn = parts[0] ?? "";
    const ln = parts.slice(1).join(" ");
    if (!currentUser.firstName && fn) userUpdates.firstName = fn;
    if (!currentUser.lastName && ln) userUpdates.lastName = ln;
  }

  const trimmedEmail = parsed.data.email?.trim();
  const wantsEmailCapture =
    !!trimmedEmail &&
    (!currentUser.email || currentUser.email.endsWith("@replit.user"));
  if (wantsEmailCapture && trimmedEmail !== currentUser.email) {
    userUpdates.email = trimmedEmail;
  }

  const trimmedNiat = parsed.data.niatId?.trim();
  const wantsNiatCapture = !!trimmedNiat && !currentUser.niatId;
  if (wantsNiatCapture) {
    userUpdates.niatId = trimmedNiat;
  }

  // Pre-flight uniqueness checks so we can return 409 before consuming an
  // invite code or starting the transaction.
  if (userUpdates.email) {
    const [emailHit] = await db
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(
        and(
          eq(usersTable.email, userUpdates.email),
          ne(usersTable.id, req.user.id),
        ),
      );
    if (emailHit) {
      res
        .status(409)
        .json({ error: "That email is already in use by another account." });
      return;
    }
  }
  if (userUpdates.niatId) {
    const [niatHit] = await db
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(
        and(
          eq(usersTable.niatId, userUpdates.niatId),
          ne(usersTable.id, req.user.id),
        ),
      );
    if (niatHit) {
      res
        .status(409)
        .json({ error: "That NIAT ID is already in use by another account." });
      return;
    }
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

  let teamId: number;
  try {
    teamId = await db.transaction(async (tx) => {
      if (Object.keys(userUpdates).length > 0) {
        try {
          await tx
            .update(usersTable)
            .set({ ...userUpdates, updatedAt: new Date() })
            .where(eq(usersTable.id, req.user.id));
        } catch (err) {
          // Translate unique-violation into a sentinel the outer catch
          // can map to a 409.
          throw new Error(
            (err as { code?: string })?.code === "23505"
              ? "user_unique_violation"
              : String(err),
          );
        }
      }
      const [createdTeam] = await tx
        .insert(teamsTable)
        .values({ ...teamData, status: "active" })
        .returning();
      await tx
        .insert(teamMembersTable)
        .values({ teamId: createdTeam.id, userId: req.user.id });
      // Auto-approve: seed the "Team Registered" milestone immediately so the
      // team timeline reflects activation at creation time. Keeps the timeline
      // identical to the legacy admin-approval flow it replaces.
      await tx.insert(milestonesTable).values({
        teamId: createdTeam.id,
        // Teams are shared across seasons; the milestone is activity, so it
        // belongs to the season being worked in.
        seasonId: await resolveSeason(req),
        type: "auto",
        title: "Team Registered",
        description: "Your team is now active!",
        date: new Date(),
        isPinned: false,
      });
      return createdTeam.id;
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg === "user_unique_violation") {
      res.status(409).json({
        error: "That email or NIAT ID is already in use by another account.",
      });
      return;
    }
    res
      .status(409)
      .json({ error: "Could not create team. You may already be on a team." });
    return;
  }

  const teamDetail = await getTeamWithStats(teamId, await resolveSeason(req));
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
    .where(
      and(
        eq(teamsTable.campusId, req.user.campusId),
        eq(teamsTable.isHidden, false),
      ),
    )
    .orderBy(teamsTable.createdAt);
  const result = await Promise.all(
    teams.map(async (team) => {
      const [campus] = await db
        .select()
        .from(campusesTable)
        .where(eq(campusesTable.id, team.campusId));
      const [leader] = await db
        .select()
        .from(usersTable)
        .where(eq(usersTable.id, team.leaderId));
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
    }),
  );
  res.json(result);
});

router.get("/teams/students/search", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const queryParams = SearchCampusStudentsQueryParams.safeParse(req.query);
  if (!queryParams.success) {
    res.status(400).json({ error: queryParams.error.message });
    return;
  }
  // Admins may pass campusId to scope the search to any campus; everyone else
  // is forced to their own campus.
  const effectiveCampusId =
    req.user.role === "admin" && queryParams.data.campusId
      ? queryParams.data.campusId
      : req.user.campusId;
  if (!effectiveCampusId) {
    res.status(400).json({ error: "Your account has no campus assigned" });
    return;
  }
  const q = queryParams.data.q.trim();
  if (q.length < 1) {
    res.json([]);
    return;
  }

  // Bug 1 fix: Search ROSTER table only, widening the OR-match to include
  // email + studentId (in addition to fullName + niatId). The roster is the
  // source of truth for who is allowed on the platform — students who haven't
  // logged in yet still appear here, and we can invite them by rosterId.
  const like = `%${q}%`;
  const rosterRows = await db
    .select()
    .from(rosterTable)
    .where(
      and(
        eq(rosterTable.campusId, effectiveCampusId),
        eq(rosterTable.isWhitelisted, true),
        or(
          ilike(rosterTable.fullName, like),
          ilike(rosterTable.niatId, like),
          ilike(rosterTable.email, like),
          ilike(rosterTable.studentId, like),
        ),
      ),
    )
    .limit(50);

  // Resolve linked user (if any) for each roster entry, and exclude
  // requester / students already on a team.
  const result: Array<{
    id: string | null;
    rosterId: number;
    firstName: string;
    lastName: string;
    email: string;
    niatId: string | null;
    profileImage: string | null;
  }> = [];

  for (const r of rosterRows) {
    const matchClauses = [] as Array<ReturnType<typeof eq>>;
    if (r.studentId) matchClauses.push(eq(usersTable.formsUserId, r.studentId));
    if (r.email) matchClauses.push(eq(usersTable.email, r.email));
    let linkedUser: typeof usersTable.$inferSelect | undefined;
    if (matchClauses.length > 0) {
      [linkedUser] = await db
        .select()
        .from(usersTable)
        .where(or(...matchClauses)!)
        .limit(1);
    }

    if (linkedUser) {
      if (linkedUser.id === req.user.id) continue;
      const [m] = await db
        .select()
        .from(teamMembersTable)
        .where(eq(teamMembersTable.userId, linkedUser.id))
        .limit(1);
      if (m) continue;
    }

    const parts = (r.fullName ?? "").trim().split(/\s+/);
    const fnFromRoster = parts[0] ?? "";
    const lnFromRoster = parts.slice(1).join(" ");

    result.push({
      id: linkedUser?.id ?? null,
      rosterId: r.id,
      firstName: linkedUser?.firstName || fnFromRoster,
      lastName: linkedUser?.lastName || lnFromRoster,
      email: linkedUser?.email || r.email || "",
      niatId: r.niatId ?? null,
      profileImage: linkedUser?.profileImage ?? null,
    });
    if (result.length >= 25) break;
  }

  // Suppress unused-import warnings for symbols we no longer need on this hot path.
  void inArray;
  void notInArray;
  void ne;
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
  const [team] = await db
    .select()
    .from(teamsTable)
    .where(eq(teamsTable.inviteCode, code));
  if (!team) {
    res.status(404).json({ error: "Invalid invite code" });
    return;
  }
  if (req.user.campusId && team.campusId !== req.user.campusId) {
    res.status(403).json({ error: "This team is at a different campus" });
    return;
  }
  const [existing] = await db
    .select()
    .from(teamMembersTable)
    .where(eq(teamMembersTable.userId, req.user.id));
  if (existing) {
    if (existing.teamId === team.id) {
      const detail = await getTeamWithStats(team.id, await resolveSeason(req));
      res.json({ ...detail, projects: [] });
      return;
    }
    res.status(400).json({ error: "You are already on a team" });
    return;
  }
  // Enforce team capacity atomically.
  const joinResult = await db.transaction(async (tx) => {
    await tx
      .select({ id: teamsTable.id })
      .from(teamsTable)
      .where(eq(teamsTable.id, team.id))
      .for("update");
    const limit = await getTeamMemberLimit(tx);
    const count = await getTeamMemberCount(team.id, tx);
    if (count >= limit) return { kind: "full" as const, count, limit };
    try {
      await tx
        .insert(teamMembersTable)
        .values({ teamId: team.id, userId: req.user.id });
    } catch {
      return { kind: "duplicate" as const };
    }
    return { kind: "ok" as const };
  });
  if (joinResult.kind === "full") {
    res
      .status(400)
      .json({ error: teamFullMessage(joinResult.count, joinResult.limit) });
    return;
  }
  if (joinResult.kind === "duplicate") {
    res
      .status(409)
      .json({ error: "Could not join team. You may already be on a team." });
    return;
  }
  // Cancel pending invites/join requests for this user
  await db
    .update(teamInvitationsTable)
    .set({ status: "cancelled", respondedAt: new Date() })
    .where(
      and(
        eq(teamInvitationsTable.inviteeId, req.user.id),
        eq(teamInvitationsTable.status, "pending"),
      ),
    );
  await db
    .update(teamJoinRequestsTable)
    .set({ status: "cancelled", respondedAt: new Date() })
    .where(
      and(
        eq(teamJoinRequestsTable.requesterId, req.user.id),
        eq(teamJoinRequestsTable.status, "pending"),
      ),
    );

  // Notify all existing members
  const others = await db
    .select()
    .from(teamMembersTable)
    .where(eq(teamMembersTable.teamId, team.id));
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
  const detail = await getTeamWithStats(team.id, await resolveSeason(req));
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
  const teamDetail = await getTeamWithStats(member.teamId, await resolveSeason(req));
  if (!teamDetail) {
    res.status(404).json({ error: "Team not found" });
    return;
  }
  const projects = await db
    .select()
    .from(projectsTable)
    .where(
      and(
        eq(projectsTable.teamId, member.teamId),
        eq(projectsTable.seasonId, await resolveSeason(req)),
      ),
    );
  const projectsWithStats = await Promise.all(
    projects.map(async (p) => {
      const [revStats] = await db
        .select({ total: sql<number>`coalesce(sum(verified_amount), 0)` })
        .from(revenueEntriesTable)
        .where(
          and(
            eq(revenueEntriesTable.projectId, p.id),
            sql`status = 'verified'`,
          ),
        );
      const [obStats] = await db
        .select({ total: sql<number>`coalesce(sum(verified_amount), 0)` })
        .from(orderBookEntriesTable)
        .where(
          and(
            eq(orderBookEntriesTable.projectId, p.id),
            sql`status = 'verified'`,
          ),
        );
      const clientCount = await getProjectClientCount(p.id);
      return {
        ...p,
        teamName: teamDetail.name,
        verifiedRevenue: Number(revStats?.total ?? 0),
        verifiedOrderBook: Number(obStats?.total ?? 0),
        clientCount,
      };
    }),
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
  const teamDetail = await getTeamWithStats(params.data.id, await resolveSeason(req));
  if (!teamDetail) {
    res.status(404).json({ error: "Team not found" });
    return;
  }
  // Strip invite code unless the requester is a member of this team or staff
  const isStaff = ["admin", "coordinator"].includes(req.user.role ?? "");
  const isMember =
    teamDetail.members?.some?.((m: any) => m.userId === req.user.id) ?? false;
  if (!isStaff && !isMember) {
    (teamDetail as any).inviteCode = null;
  }
  const projects = await db
    .select()
    .from(projectsTable)
    .where(
      and(
        eq(projectsTable.teamId, params.data.id),
        eq(projectsTable.seasonId, await resolveSeason(req)),
      ),
    );
  const projectsWithStats = await Promise.all(
    projects.map(async (p) => {
      const [revStats] = await db
        .select({ total: sql<number>`coalesce(sum(verified_amount), 0)` })
        .from(revenueEntriesTable)
        .where(
          and(
            eq(revenueEntriesTable.projectId, p.id),
            sql`status = 'verified'`,
          ),
        );
      const [obStats] = await db
        .select({ total: sql<number>`coalesce(sum(verified_amount), 0)` })
        .from(orderBookEntriesTable)
        .where(
          and(
            eq(orderBookEntriesTable.projectId, p.id),
            sql`status = 'verified'`,
          ),
        );
      return {
        ...p,
        teamName: teamDetail.name,
        verifiedRevenue: Number(revStats?.total ?? 0),
        verifiedOrderBook: Number(obStats?.total ?? 0),
        clientCount: 0,
      };
    }),
  );
  res.json({ ...teamDetail, projects: projectsWithStats });
});

router.patch(
  "/teams/:id",
  requireAdminPage("/admin/teams", "edit"),
  async (req, res): Promise<void> => {
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
    // Authorization: admins/coordinators can edit any team; otherwise only the
    // current team leader may edit their own team. Previously this endpoint
    // accepted any authenticated user, which let regular members rename or
    // change the photo of teams they were not even on.
    const [existingTeam] = await db
      .select()
      .from(teamsTable)
      .where(eq(teamsTable.id, params.data.id));
    if (!existingTeam) {
      res.status(404).json({ error: "Team not found" });
      return;
    }
    const isStaff =
      req.user.role === "admin" || req.user.role === "coordinator";
    const isLeader = existingTeam.leaderId === req.user.id;
    if (!isStaff && !isLeader) {
      res.status(403).json({
        error:
          "Only the team leader, a coordinator, or an admin can edit this team.",
      });
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
      await logAudit(
        req.user.id,
        "update_team",
        "team",
        team.id,
        reason ?? JSON.stringify(updateData),
      );
    }
    const teamData = await getTeamWithStats(team.id, await resolveSeason(req));
    res.json(teamData);
  },
);

router.delete(
  "/teams/:id",
  requireAdminPage("/admin/teams", "delete"),
  async (req, res): Promise<void> => {
    if (!req.isAuthenticated()) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    // Reuse GetTeamParams – same shape (id: integer path param) and avoids minting a new schema.
    const params = GetTeamParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const teamId = params.data.id;
    const userId = req.user.id;

    // Wrap the entire cascade in a single transaction so a mid-sequence failure
    // rolls back cleanly. We also lock the team row up-front (FOR UPDATE) so
    // concurrent writers cannot insert new child rows while we are tearing the
    // team down — eliminating the race window of orphaned rows in this no-FK
    // schema.
    let teamName: string | null = null;
    let blockedReason: string | null = null;
    try {
      teamName = await db.transaction(async (tx) => {
        const [team] = await tx
          .select()
          .from(teamsTable)
          .where(eq(teamsTable.id, teamId))
          .for("update");

        if (!team) return null;

        // Authorization inside the lock so we authorize against the
        // post-lock leader and so leaders can delete their own team.
        const isAdmin = req.user.role === "admin";
        const isLeader = team.leaderId === userId;
        if (!isAdmin && !isLeader) {
          blockedReason = "forbidden";
          return null;
        }

        // Leaders may only delete a team that has no submitted/verified entries
        // — preserves auditable financial history. Admins keep their wider
        // override (cascade everything).
        //
        // DELIBERATELY NOT season-scoped: teams are shared across seasons, so
        // deleting one would orphan EVERY season's financial history. The guard
        // must see entries from all seasons, not just the one being viewed.
        if (!isAdmin) {
          const [revHit] = await tx
            .select({ id: revenueEntriesTable.id })
            .from(revenueEntriesTable)
            .where(
              and(
                eq(revenueEntriesTable.teamId, teamId),
                sql`status in ('submitted', 'verified')`,
              ),
            )
            .limit(1);
          if (revHit) {
            blockedReason = "has_revenue";
            return null;
          }
          const [obHit] = await tx
            .select({ id: orderBookEntriesTable.id })
            .from(orderBookEntriesTable)
            .where(
              and(
                eq(orderBookEntriesTable.teamId, teamId),
                sql`status in ('submitted', 'verified')`,
              ),
            )
            .limit(1);
          if (obHit) {
            blockedReason = "has_orderbook";
            return null;
          }
        }

        await tx
          .delete(orderBookEntriesTable)
          .where(eq(orderBookEntriesTable.teamId, teamId));
        await tx
          .delete(revenueEntriesTable)
          .where(eq(revenueEntriesTable.teamId, teamId));
        await tx.delete(projectsTable).where(eq(projectsTable.teamId, teamId));
        await tx
          .delete(milestonesTable)
          .where(eq(milestonesTable.teamId, teamId));
        await tx
          .delete(demoDayApplicationsTable)
          .where(eq(demoDayApplicationsTable.teamId, teamId));
        await tx
          .delete(teamInvitationsTable)
          .where(eq(teamInvitationsTable.teamId, teamId));
        await tx
          .delete(teamJoinRequestsTable)
          .where(eq(teamJoinRequestsTable.teamId, teamId));
        await tx
          .delete(teamLeaveRequestsTable)
          .where(eq(teamLeaveRequestsTable.teamId, teamId));
        // Drop any pending admin-approval requests for this team. Without this
        // they would linger in /admin/team-requests as un-actionable "leaving
        // Unknown" cards that error with "Team no longer exists" on approve.
        await tx
          .delete(membershipRequestsTable)
          .where(
            and(
              eq(membershipRequestsTable.teamId, teamId),
              eq(membershipRequestsTable.status, "pending"),
            ),
          );
        await tx
          .delete(teamMembersTable)
          .where(eq(teamMembersTable.teamId, teamId));
        await tx
          .delete(announcementsTable)
          .where(
            and(
              eq(announcementsTable.target, "team"),
              eq(announcementsTable.teamId, teamId),
            ),
          );

        await tx.delete(teamsTable).where(eq(teamsTable.id, teamId));

        return team.name;
      });
    } catch (err) {
      res.status(500).json({
        error: "Failed to delete team",
        detail: err instanceof Error ? err.message : String(err),
      });
      return;
    }

    if (teamName === null) {
      if (blockedReason === "forbidden") {
        res.status(403).json({
          error: "Only the team leader or an admin can delete this team.",
        });
        return;
      }
      if (blockedReason === "has_revenue") {
        res.status(409).json({
          error:
            "This team has submitted or verified revenue entries. Only an admin can delete a team with reviewed revenue.",
        });
        return;
      }
      if (blockedReason === "has_orderbook") {
        res.status(409).json({
          error:
            "This team has submitted or verified order book entries. Only an admin can delete a team with reviewed orders.",
        });
        return;
      }
      res.status(404).json({ error: "Team not found" });
      return;
    }

    await logAudit(userId, "delete_team", "team", teamId, teamName);
    res.status(204).end();
  },
);

router.post(
  "/teams/:id/reject",
  requireAdminPage("/admin/teams", "edit"),
  async (req, res): Promise<void> => {
    if (
      !req.isAuthenticated() ||
      !["coordinator", "admin"].includes(req.user.role ?? "")
    ) {
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
    // Auto-approve flow: only pending teams can be rejected. Active/rejected/
    // changes_requested teams are off-limits — reject is a registration-time
    // gate, not a way to re-state an active team.
    const [team] = await db
      .update(teamsTable)
      .set({ status: "rejected", rejectionReason: parsed.data.reason })
      .where(
        and(
          eq(teamsTable.id, params.data.id),
          eq(teamsTable.status, "pending"),
        ),
      )
      .returning();
    if (!team) {
      res
        .status(404)
        .json({ error: "Team not found or not in a pending state" });
      return;
    }
    await createNotification(
      team.leaderId,
      "Team Registration Rejected",
      `Your team "${team.name}" was rejected: ${parsed.data.reason}`,
      "team_rejected",
      "/team",
    );
    await logAudit(
      req.user.id,
      "reject_team",
      "team",
      team.id,
      parsed.data.reason,
    );
    const teamData = await getTeamWithStats(team.id, await resolveSeason(req));
    res.json(teamData);
  },
);

router.post(
  "/teams/:id/request-changes",
  requireAdminPage("/admin/teams", "edit"),
  async (req, res): Promise<void> => {
    if (
      !req.isAuthenticated() ||
      !["coordinator", "admin"].includes(req.user.role ?? "")
    ) {
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
    // Auto-approve flow: only pending teams can have changes requested.
    const [team] = await db
      .update(teamsTable)
      .set({
        status: "changes_requested",
        coordinatorComment: parsed.data.comment,
      })
      .where(
        and(
          eq(teamsTable.id, params.data.id),
          eq(teamsTable.status, "pending"),
        ),
      )
      .returning();
    if (!team) {
      res
        .status(404)
        .json({ error: "Team not found or not in a pending state" });
      return;
    }
    await createNotification(
      team.leaderId,
      "Changes Requested",
      `Changes requested for team "${team.name}": ${parsed.data.comment}`,
      "team_changes_requested",
      "/team",
    );
    const teamData = await getTeamWithStats(team.id, await resolveSeason(req));
    res.json(teamData);
  },
);

router.post(
  "/teams/:id/members",
  requireAdminPage("/admin/teams", "edit"),
  async (req, res): Promise<void> => {
    if (!req.isAuthenticated() || req.user.role !== "admin") {
      res.status(403).json({
        error: "Admin only — students must use the team invitation flow.",
      });
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
    const [user] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.email, parsed.data.email));
    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }
    const [existing] = await db
      .select()
      .from(teamMembersTable)
      .where(eq(teamMembersTable.userId, user.id));
    if (existing) {
      res.status(400).json({ error: "User is already a member of a team" });
      return;
    }
    await db
      .insert(teamMembersTable)
      .values({ teamId: params.data.id, userId: user.id });
    const teamDetail = await getTeamWithStats(params.data.id, await resolveSeason(req));
    res.status(201).json({ ...teamDetail, projects: [] });
  },
);

router.delete(
  "/teams/:id/members/:userId",
  requireAdminPage("/admin/teams", "delete"),
  async (req, res): Promise<void> => {
    if (!req.isAuthenticated()) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    const params = RemoveTeamMemberParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const [team] = await db
      .select()
      .from(teamsTable)
      .where(eq(teamsTable.id, params.data.id));
    if (!team) {
      res.status(404).json({ error: "Team not found" });
      return;
    }
    const isAdmin = req.user.role === "admin";
    const isLeader = team.leaderId === req.user.id;
    if (!isAdmin && !isLeader) {
      res
        .status(403)
        .json({
          error: "Only the team leader or an admin can remove members.",
        });
      return;
    }
    // A leader cannot remove themselves through this endpoint
    if (isLeader && !isAdmin && params.data.userId === req.user.id) {
      res.status(400).json({
        error: "You cannot remove yourself. Transfer leadership first.",
      });
      return;
    }
    // Prevent removing the team leader
    if (team.leaderId === params.data.userId) {
      res.status(400).json({
        error: "Cannot remove the team leader. Transfer leadership first.",
      });
      return;
    }
    // Confirm the target is actually a member of this team
    const [membership] = await db
      .select()
      .from(teamMembersTable)
      .where(
        and(
          eq(teamMembersTable.teamId, params.data.id),
          eq(teamMembersTable.userId, params.data.userId),
        ),
      );
    if (!membership) {
      res
        .status(404)
        .json({ error: "That user is not a member of this team." });
      return;
    }
    // Admin approval gate: a team leader removing a member no longer removes them
    // instantly — it records a pending request for an admin to approve. Admin
    // direct removals stay instant (handled by the branch below).
    if (!isAdmin) {
      const alreadyPending = await findPendingRequestForUser(
        params.data.userId,
      );
      if (alreadyPending) {
        res.status(409).json({
          error:
            "There is already a membership request for this student awaiting admin approval.",
        });
        return;
      }
      const result = await createMembershipRequest({
        type: "leader_remove",
        teamId: team.id,
        targetUserId: params.data.userId,
        actorUserId: req.user.id,
        campusId: team.campusId,
      });
      if (result.kind === "error") {
        res.status(result.status).json({ error: result.error });
        return;
      }
      if (result.kind === "applied") {
        res.status(200).json({
          status: "applied",
          requestId: result.request.id,
          message: "The member has been removed from the team.",
        });
        return;
      }
      res.status(202).json({
        status: "pending_approval",
        requestId: result.request.id,
        message:
          "Removal request sent for admin approval. The member stays until approved.",
      });
      return;
    }
    await db
      .delete(teamMembersTable)
      .where(
        and(
          eq(teamMembersTable.teamId, params.data.id),
          eq(teamMembersTable.userId, params.data.userId),
        ),
      );
    const [removedUser] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.id, params.data.userId));
    await logAudit(
      req.user.id,
      "team_member_removed",
      "team",
      team.id,
      JSON.stringify({
        removedUserId: params.data.userId,
        removedUserEmail: removedUser?.email ?? null,
        removedUserName: fullName(removedUser),
        removedBy: isAdmin ? "admin" : "leader",
      }),
    );
    await createNotification(
      params.data.userId,
      "Removed from team",
      `You were removed from "${team.name}".`,
      "team_member_removed",
      "/",
    );
    const teamDetail = await getTeamWithStats(params.data.id, await resolveSeason(req));
    res.json({ ...teamDetail, projects: [] });
  },
);

router.post(
  "/teams/:id/transfer-leadership",
  async (req, res): Promise<void> => {
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
    const [team] = await db
      .select()
      .from(teamsTable)
      .where(eq(teamsTable.id, params.data.id));
    if (!team) {
      res.status(404).json({ error: "Team not found" });
      return;
    }
    if (team.leaderId !== req.user.id) {
      res.status(403).json({
        error: "Only the current team leader can transfer leadership.",
      });
      return;
    }
    if (parsed.data.newLeaderId === team.leaderId) {
      res
        .status(400)
        .json({ error: "That member is already the team leader." });
      return;
    }
    const [target] = await db
      .select()
      .from(teamMembersTable)
      .where(
        and(
          eq(teamMembersTable.teamId, params.data.id),
          eq(teamMembersTable.userId, parsed.data.newLeaderId),
        ),
      );
    if (!target) {
      res.status(400).json({
        error: "The new leader must be a current member of this team.",
      });
      return;
    }
    const previousLeaderId = team.leaderId;
    await db
      .update(teamsTable)
      .set({ leaderId: parsed.data.newLeaderId })
      .where(eq(teamsTable.id, params.data.id));
    const [newLeaderUser] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.id, parsed.data.newLeaderId));
    await logAudit(
      previousLeaderId,
      "team_leader_transferred",
      "team",
      team.id,
      JSON.stringify({
        previousLeaderId,
        newLeaderId: parsed.data.newLeaderId,
        newLeaderEmail: newLeaderUser?.email ?? null,
        newLeaderName: fullName(newLeaderUser),
      }),
    );
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
    const teamDetail = await getTeamWithStats(params.data.id, await resolveSeason(req));
    res.json({ ...teamDetail, projects: [] });
  },
);

// ============= INVITATIONS =============

async function ensureTeamMember(
  teamId: number,
  userId: string,
): Promise<boolean> {
  const [m] = await db
    .select()
    .from(teamMembersTable)
    .where(
      and(
        eq(teamMembersTable.teamId, teamId),
        eq(teamMembersTable.userId, userId),
      ),
    );
  return !!m;
}

async function shapeInvitation(inv: typeof teamInvitationsTable.$inferSelect) {
  const [team] = await db
    .select()
    .from(teamsTable)
    .where(eq(teamsTable.id, inv.teamId));
  const [invitee] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.id, inv.inviteeId));
  const [inviter] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.id, inv.inviterId));
  return {
    id: inv.id,
    teamId: inv.teamId,
    teamName: team?.name ?? "",
    teamPhotoUrl: team?.photoUrl ?? null,
    inviteeId: inv.inviteeId,
    inviteeName: fullName(invitee),
    inviteeEmail: invitee?.email ?? "",
    inviteeNiatId: invitee?.niatId ?? null,
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
  if (
    !(await ensureTeamMember(params.data.id, req.user.id)) &&
    req.user.role !== "admin"
  ) {
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
  const [team] = await db
    .select()
    .from(teamsTable)
    .where(eq(teamsTable.id, params.data.id));
  if (!team) {
    res.status(404).json({ error: "Team not found" });
    return;
  }
  // Block new invitations when the team is already at capacity.
  {
    const limit = await getTeamMemberLimit();
    const count = await getTeamMemberCount(team.id);
    if (count >= limit) {
      res.status(400).json({ error: teamFullMessage(count, limit) });
      return;
    }
  }
  // Note: this route is shadowed by the version in team-flow.ts which
  // additionally accepts a rosterId. Kept here for back-compat; rosterId-only
  // payloads should be routed through the team-flow handler.
  if (!parsed.data.inviteeId) {
    res.status(400).json({ error: "inviteeId is required on this endpoint" });
    return;
  }
  const [invitee] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.id, parsed.data.inviteeId));
  if (!invitee) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  if (invitee.role !== "student") {
    res.status(400).json({ error: "Only students can be invited" });
    return;
  }
  if (invitee.campusId !== team.campusId) {
    res
      .status(400)
      .json({ error: "You can only invite students from the same campus" });
    return;
  }
  // Check roster whitelist
  const matchClauses = [eq(rosterTable.email, invitee.email)];
  if (invitee.formsUserId)
    matchClauses.push(eq(rosterTable.studentId, invitee.formsUserId));
  const [roster] = await db
    .select()
    .from(rosterTable)
    .where(and(or(...matchClauses), eq(rosterTable.isWhitelisted, true)));
  if (!roster) {
    res.status(400).json({ error: "Student is not on the roster" });
    return;
  }
  const [onTeam] = await db
    .select()
    .from(teamMembersTable)
    .where(eq(teamMembersTable.userId, invitee.id));
  if (onTeam) {
    res.status(400).json({ error: "Student is already on a team" });
    return;
  }
  // Check duplicate pending invite from this team
  const [dup] = await db
    .select()
    .from(teamInvitationsTable)
    .where(
      and(
        eq(teamInvitationsTable.teamId, params.data.id),
        eq(teamInvitationsTable.inviteeId, invitee.id),
        eq(teamInvitationsTable.status, "pending"),
      ),
    );
  if (dup) {
    res
      .status(400)
      .json({ error: "An invitation is already pending for this student" });
    return;
  }
  const [inv] = await db
    .insert(teamInvitationsTable)
    .values({
      teamId: params.data.id,
      inviteeId: invitee.id,
      inviterId: req.user.id,
    })
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
    .where(
      and(
        eq(teamInvitationsTable.inviteeId, req.user.id),
        eq(teamInvitationsTable.status, "pending"),
      ),
    )
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
  const [inv] = await db
    .select()
    .from(teamInvitationsTable)
    .where(eq(teamInvitationsTable.id, params.data.id));
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
  const [onTeam] = await db
    .select()
    .from(teamMembersTable)
    .where(eq(teamMembersTable.userId, req.user.id));
  if (onTeam) {
    res.status(400).json({ error: "You are already on a team" });
    return;
  }
  const [team] = await db
    .select()
    .from(teamsTable)
    .where(eq(teamsTable.id, inv.teamId));
  if (!team) {
    res.status(404).json({ error: "Team not found" });
    return;
  }
  // Enforce team capacity atomically: lock the team row, recount members
  // under the lock, then insert. This prevents two concurrent acceptances
  // from racing past the limit.
  const acceptResult = await db.transaction(async (tx) => {
    await tx
      .select({ id: teamsTable.id })
      .from(teamsTable)
      .where(eq(teamsTable.id, inv.teamId))
      .for("update");
    const limit = await getTeamMemberLimit(tx);
    const count = await getTeamMemberCount(inv.teamId, tx);
    if (count >= limit) return { kind: "full" as const, count, limit };
    try {
      await tx
        .insert(teamMembersTable)
        .values({ teamId: inv.teamId, userId: req.user.id });
    } catch {
      return { kind: "duplicate" as const };
    }
    return { kind: "ok" as const };
  });
  if (acceptResult.kind === "full") {
    res
      .status(400)
      .json({ error: teamFullMessage(acceptResult.count, acceptResult.limit) });
    return;
  }
  if (acceptResult.kind === "duplicate") {
    res
      .status(409)
      .json({ error: "Could not join team. You may already be on a team." });
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
    .where(
      and(
        eq(teamInvitationsTable.inviteeId, req.user.id),
        eq(teamInvitationsTable.status, "pending"),
      ),
    );
  await db
    .update(teamJoinRequestsTable)
    .set({ status: "cancelled", respondedAt: new Date() })
    .where(
      and(
        eq(teamJoinRequestsTable.requesterId, req.user.id),
        eq(teamJoinRequestsTable.status, "pending"),
      ),
    );
  // Notify inviter and team members
  await createNotification(
    inv.inviterId,
    "Invitation Accepted",
    `${fullName(req.user)} accepted your invite to "${team.name}".`,
    "team_invitation_accepted",
    "/team",
  );
  const others = await db
    .select()
    .from(teamMembersTable)
    .where(eq(teamMembersTable.teamId, team.id));
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
  const detail = await getTeamWithStats(team.id, await resolveSeason(req));
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
  const [inv] = await db
    .select()
    .from(teamInvitationsTable)
    .where(eq(teamInvitationsTable.id, params.data.id));
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
  const [team] = await db
    .select()
    .from(teamsTable)
    .where(eq(teamsTable.id, inv.teamId));
  await createNotification(
    inv.inviterId,
    "Invitation Declined",
    `${fullName(req.user)} declined your invite to "${team?.name ?? ""}".`,
    "team_invitation_declined",
    "/team",
  );
  res.json({ success: true });
});

// Cancel a pending invitation that the requester's team sent. Allowed for
// any member of the sending team (matches the existing "any member can
// invite" policy on POST /teams/:id/invitations). The invited student is
// intentionally NOT notified.
router.post("/invitations/:id/cancel", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const params = CancelInvitationParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [inv] = await db
    .select()
    .from(teamInvitationsTable)
    .where(eq(teamInvitationsTable.id, params.data.id));
  if (!inv) {
    res.status(404).json({ error: "Invitation not found" });
    return;
  }
  if (!(await ensureTeamMember(inv.teamId, req.user.id))) {
    res.status(403).json({
      error: "Only members of the sending team can cancel this invitation",
    });
    return;
  }
  // Idempotent: already-cancelled is treated as success.
  if (inv.status === "cancelled") {
    res.json({ success: true });
    return;
  }
  // Atomic transition: only flips when still pending. Prevents racing with
  // accept/decline performed by the invitee in another request.
  const updated = await db
    .update(teamInvitationsTable)
    .set({ status: "cancelled", respondedAt: new Date() })
    .where(
      and(
        eq(teamInvitationsTable.id, inv.id),
        eq(teamInvitationsTable.status, "pending"),
      ),
    )
    .returning({ id: teamInvitationsTable.id });
  if (updated.length === 0) {
    // Re-read to report the current state. Either the invitee responded
    // first (accepted/declined) or another tab already cancelled.
    const [latest] = await db
      .select()
      .from(teamInvitationsTable)
      .where(eq(teamInvitationsTable.id, inv.id));
    if (latest?.status === "cancelled") {
      res.json({ success: true });
      return;
    }
    res.status(409).json({
      error: `Invitation is no longer pending (status: ${latest?.status ?? "unknown"})`,
    });
    return;
  }
  res.json({ success: true });
});

// ============= JOIN REQUESTS =============

async function shapeJoinRequest(jr: typeof teamJoinRequestsTable.$inferSelect) {
  const [team] = await db
    .select()
    .from(teamsTable)
    .where(eq(teamsTable.id, jr.teamId));
  const [requester] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.id, jr.requesterId));
  return {
    id: jr.id,
    teamId: jr.teamId,
    teamName: team?.name ?? "",
    requesterId: jr.requesterId,
    requesterName: fullName(requester),
    requesterEmail: requester?.email ?? "",
    requesterNiatId: requester?.niatId ?? null,
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
  if (
    !(await ensureTeamMember(params.data.id, req.user.id)) &&
    req.user.role !== "admin"
  ) {
    res.status(403).json({ error: "You are not a member of this team" });
    return;
  }
  const rows = await db
    .select()
    .from(teamJoinRequestsTable)
    .where(
      and(
        eq(teamJoinRequestsTable.teamId, params.data.id),
        eq(teamJoinRequestsTable.status, "pending"),
      ),
    )
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
  const [team] = await db
    .select()
    .from(teamsTable)
    .where(eq(teamsTable.id, params.data.id));
  if (!team) {
    res.status(404).json({ error: "Team not found" });
    return;
  }
  if (req.user.campusId && team.campusId !== req.user.campusId) {
    res
      .status(403)
      .json({ error: "You can only request to join teams at your campus" });
    return;
  }
  const [onTeam] = await db
    .select()
    .from(teamMembersTable)
    .where(eq(teamMembersTable.userId, req.user.id));
  if (onTeam) {
    res.status(400).json({ error: "You are already on a team" });
    return;
  }
  const [dup] = await db
    .select()
    .from(teamJoinRequestsTable)
    .where(
      and(
        eq(teamJoinRequestsTable.teamId, params.data.id),
        eq(teamJoinRequestsTable.requesterId, req.user.id),
        eq(teamJoinRequestsTable.status, "pending"),
      ),
    );
  if (dup) {
    res
      .status(400)
      .json({ error: "You already have a pending request for this team" });
    return;
  }
  const [jr] = await db
    .insert(teamJoinRequestsTable)
    .values({
      teamId: params.data.id,
      requesterId: req.user.id,
      message: parsed.data.message ?? null,
    })
    .returning();
  // Notify all team members
  const members = await db
    .select()
    .from(teamMembersTable)
    .where(eq(teamMembersTable.teamId, params.data.id));
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
  const [jr] = await db
    .select()
    .from(teamJoinRequestsTable)
    .where(eq(teamJoinRequestsTable.id, params.data.id));
  if (!jr) {
    res.status(404).json({ error: "Request not found" });
    return;
  }
  if (jr.status !== "pending") {
    res.status(400).json({ error: "Request is no longer pending" });
    return;
  }
  if (!(await ensureTeamMember(jr.teamId, req.user.id))) {
    res
      .status(403)
      .json({ error: "Only team members can approve join requests" });
    return;
  }
  const [team] = await db
    .select()
    .from(teamsTable)
    .where(eq(teamsTable.id, jr.teamId));
  if (!team) {
    res.status(404).json({ error: "Team not found" });
    return;
  }
  const [onTeam] = await db
    .select()
    .from(teamMembersTable)
    .where(eq(teamMembersTable.userId, jr.requesterId));
  if (onTeam) {
    await db
      .update(teamJoinRequestsTable)
      .set({
        status: "cancelled",
        respondedAt: new Date(),
        decidedById: req.user.id,
      })
      .where(eq(teamJoinRequestsTable.id, jr.id));
    res.status(400).json({ error: "Requester is already on a team" });
    return;
  }
  // Enforce team capacity atomically.
  const approveResult = await db.transaction(async (tx) => {
    await tx
      .select({ id: teamsTable.id })
      .from(teamsTable)
      .where(eq(teamsTable.id, jr.teamId))
      .for("update");
    const limit = await getTeamMemberLimit(tx);
    const count = await getTeamMemberCount(jr.teamId, tx);
    if (count >= limit) return { kind: "full" as const, count, limit };
    try {
      await tx
        .insert(teamMembersTable)
        .values({ teamId: jr.teamId, userId: jr.requesterId });
    } catch {
      return { kind: "duplicate" as const };
    }
    return { kind: "ok" as const };
  });
  if (approveResult.kind === "full") {
    res.status(400).json({
      error: teamFullMessage(approveResult.count, approveResult.limit),
    });
    return;
  }
  if (approveResult.kind === "duplicate") {
    res
      .status(409)
      .json({ error: "Could not add member. They may already be on a team." });
    return;
  }
  await db
    .update(teamJoinRequestsTable)
    .set({
      status: "approved",
      respondedAt: new Date(),
      decidedById: req.user.id,
    })
    .where(eq(teamJoinRequestsTable.id, jr.id));
  // Cancel requester's other pending invites + join requests
  await db
    .update(teamInvitationsTable)
    .set({ status: "cancelled", respondedAt: new Date() })
    .where(
      and(
        eq(teamInvitationsTable.inviteeId, jr.requesterId),
        eq(teamInvitationsTable.status, "pending"),
      ),
    );
  await db
    .update(teamJoinRequestsTable)
    .set({ status: "cancelled", respondedAt: new Date() })
    .where(
      and(
        eq(teamJoinRequestsTable.requesterId, jr.requesterId),
        eq(teamJoinRequestsTable.status, "pending"),
      ),
    );
  await createNotification(
    jr.requesterId,
    "Request Approved",
    `Your request to join "${team.name}" was approved.`,
    "team_join_approved",
    "/team",
  );
  const others = await db
    .select()
    .from(teamMembersTable)
    .where(eq(teamMembersTable.teamId, team.id));
  const [requester] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.id, jr.requesterId));
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
  const detail = await getTeamWithStats(team.id, await resolveSeason(req));
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
  const [jr] = await db
    .select()
    .from(teamJoinRequestsTable)
    .where(eq(teamJoinRequestsTable.id, params.data.id));
  if (!jr) {
    res.status(404).json({ error: "Request not found" });
    return;
  }
  if (jr.status !== "pending") {
    res.status(400).json({ error: "Request is no longer pending" });
    return;
  }
  if (!(await ensureTeamMember(jr.teamId, req.user.id))) {
    res
      .status(403)
      .json({ error: "Only team members can decline join requests" });
    return;
  }
  await db
    .update(teamJoinRequestsTable)
    .set({
      status: "declined",
      respondedAt: new Date(),
      decidedById: req.user.id,
    })
    .where(eq(teamJoinRequestsTable.id, jr.id));
  const [team] = await db
    .select()
    .from(teamsTable)
    .where(eq(teamsTable.id, jr.teamId));
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

async function shapeLeaveRequest(
  lr: typeof teamLeaveRequestsTable.$inferSelect,
) {
  const [requester] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.id, lr.requesterId));
  return {
    id: lr.id,
    teamId: lr.teamId,
    requesterId: lr.requesterId,
    requesterName: fullName(requester),
    requesterEmail: requester?.email ?? "",
    requesterNiatId: requester?.niatId ?? null,
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
  const [team] = await db
    .select()
    .from(teamsTable)
    .where(eq(teamsTable.id, params.data.id));
  if (!team) {
    res.status(404).json({ error: "Team not found" });
    return;
  }
  if (team.leaderId !== req.user.id && req.user.role !== "admin") {
    res
      .status(403)
      .json({ error: "Only the team leader can view leave requests" });
    return;
  }
  const rows = await db
    .select()
    .from(teamLeaveRequestsTable)
    .where(
      and(
        eq(teamLeaveRequestsTable.teamId, params.data.id),
        eq(teamLeaveRequestsTable.status, "pending"),
      ),
    )
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
  const [team] = await db
    .select()
    .from(teamsTable)
    .where(eq(teamsTable.id, params.data.id));
  if (!team) {
    res.status(404).json({ error: "Team not found" });
    return;
  }
  if (team.leaderId === req.user.id) {
    res.status(400).json({
      error: "Team leaders cannot leave the team. Transfer leadership first.",
    });
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
    .where(
      and(
        eq(teamLeaveRequestsTable.teamId, params.data.id),
        eq(teamLeaveRequestsTable.requesterId, userId),
        eq(teamLeaveRequestsTable.status, "pending"),
      ),
    );
  if (dup) {
    res.status(400).json({ error: "You already have a pending leave request" });
    return;
  }
  const [lr] = await db
    .insert(teamLeaveRequestsTable)
    .values({
      teamId: params.data.id,
      requesterId: userId,
      reason: parsed.data.reason ?? undefined,
    })
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
  const [lr] = await db
    .select()
    .from(teamLeaveRequestsTable)
    .where(eq(teamLeaveRequestsTable.id, params.data.id));
  if (!lr) {
    res.status(404).json({ error: "Request not found" });
    return;
  }
  if (lr.status !== "pending") {
    res.status(400).json({ error: "Request is no longer pending" });
    return;
  }
  const [team] = await db
    .select()
    .from(teamsTable)
    .where(eq(teamsTable.id, lr.teamId));
  if (!team) {
    res.status(404).json({ error: "Team not found" });
    return;
  }
  if (team.leaderId !== req.user.id && req.user.role !== "admin") {
    res
      .status(403)
      .json({ error: "Only the team leader can approve leave requests" });
    return;
  }
  if (lr.requesterId === team.leaderId) {
    res.status(400).json({ error: "Cannot approve a leader's leave request" });
    return;
  }
  await db
    .delete(teamMembersTable)
    .where(
      and(
        eq(teamMembersTable.teamId, lr.teamId),
        eq(teamMembersTable.userId, lr.requesterId),
      ),
    );
  await db
    .update(teamLeaveRequestsTable)
    .set({
      status: "approved",
      respondedAt: new Date(),
      decidedById: req.user.id,
    })
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
  const [lr] = await db
    .select()
    .from(teamLeaveRequestsTable)
    .where(eq(teamLeaveRequestsTable.id, params.data.id));
  if (!lr) {
    res.status(404).json({ error: "Request not found" });
    return;
  }
  if (lr.status !== "pending") {
    res.status(400).json({ error: "Request is no longer pending" });
    return;
  }
  const [team] = await db
    .select()
    .from(teamsTable)
    .where(eq(teamsTable.id, lr.teamId));
  if (!team) {
    res.status(404).json({ error: "Team not found" });
    return;
  }
  if (team.leaderId !== req.user.id && req.user.role !== "admin") {
    res
      .status(403)
      .json({ error: "Only the team leader can decline leave requests" });
    return;
  }
  await db
    .update(teamLeaveRequestsTable)
    .set({
      status: "declined",
      respondedAt: new Date(),
      decidedById: req.user.id,
    })
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
