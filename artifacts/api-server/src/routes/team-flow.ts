import { Router, type IRouter, type Request, type Response } from "express";
import { and, eq, ilike, or, ne, inArray, sql, desc } from "drizzle-orm";
import {
  db,
  teamsTable,
  teamMembersTable,
  teamInvitationsTable,
  teamJoinRequestsTable,
  teamLeaveRequestsTable,
  usersTable,
  campusesTable,
  rosterTable,
  createOrGetUserByFormsId,
} from "@workspace/db";
import {
  SendTeamInvitationBody as CreateTeamInvitationBody,
  RequestToJoinTeamBody,
  RequestToLeaveTeamBody,
  JoinTeamByCodeBody as JoinByCodeBody,
} from "@workspace/api-zod";
import { z } from "zod/v4";
import { createNotification } from "../lib/notifications";
import {
  getTeamMemberLimit,
  getTeamMemberCount,
  teamFullMessage,
} from "../lib/team-limits";

const router: IRouter = Router();

const IdParam = z.object({ id: z.coerce.number().int().positive() });

function requireAuth(
  req: Request,
  res: Response,
): req is Request & { user: NonNullable<Request["user"]> } {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return false;
  }
  return true;
}

async function getMembership(userId: string) {
  const [m] = await db
    .select()
    .from(teamMembersTable)
    .where(eq(teamMembersTable.userId, userId));
  return m ?? null;
}

async function getTeamOrNull(id: number) {
  const [t] = await db.select().from(teamsTable).where(eq(teamsTable.id, id));
  return t ?? null;
}

async function userDisplayName(userId: string): Promise<string> {
  const [u] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.id, userId));
  if (!u) return "Unknown";
  const name = `${u.firstName ?? ""} ${u.lastName ?? ""}`.trim();
  return name || u.email;
}

// Re-export getTeamWithStats logic; instead of importing across files, do a minimal version
async function getTeamDetail(teamId: number) {
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
      const [u] = await db
        .select()
        .from(usersTable)
        .where(eq(usersTable.id, m.userId));
      return {
        userId: m.userId,
        email: u?.email ?? "",
        firstName: u?.firstName ?? "",
        lastName: u?.lastName ?? "",
        profileImage: u?.profileImage ?? null,
        memberRole: m.memberRole,
        isLeader: m.userId === team.leaderId,
      };
    }),
  );
  return {
    ...team,
    campusName: campus?.name ?? "",
    leaderName: leader ? `${leader.firstName} ${leader.lastName}`.trim() : "",
    memberCount: members.length,
    projectCount: 0,
    totalRevenue: 0,
    totalOrderBook: 0,
    nationalRank: null as number | null,
    members: memberDetails,
    projects: [],
  };
}

async function shapeInvitation(inv: typeof teamInvitationsTable.$inferSelect) {
  const [team] = await db
    .select()
    .from(teamsTable)
    .where(eq(teamsTable.id, inv.teamId));
  return {
    id: inv.id,
    teamId: inv.teamId,
    teamName: team?.name ?? "Unknown",
    teamPhotoUrl: team?.photoUrl ?? null,
    inviterId: inv.inviterId,
    inviterName: await userDisplayName(inv.inviterId),
    inviteeId: inv.inviteeId,
    inviteeName: await userDisplayName(inv.inviteeId),
    status: inv.status,
    createdAt: inv.createdAt,
    respondedAt: inv.respondedAt,
  };
}

async function shapeJoinRequest(jr: typeof teamJoinRequestsTable.$inferSelect) {
  const [team] = await db
    .select()
    .from(teamsTable)
    .where(eq(teamsTable.id, jr.teamId));
  return {
    id: jr.id,
    teamId: jr.teamId,
    teamName: team?.name ?? "Unknown",
    requesterId: jr.requesterId,
    requesterName: await userDisplayName(jr.requesterId),
    status: jr.status,
    message: jr.message,
    createdAt: jr.createdAt,
    respondedAt: jr.respondedAt,
  };
}

async function shapeLeaveRequest(
  lr: typeof teamLeaveRequestsTable.$inferSelect,
) {
  return {
    id: lr.id,
    teamId: lr.teamId,
    memberId: lr.requesterId,
    memberName: await userDisplayName(lr.requesterId),
    status: lr.status,
    reason: lr.reason,
    createdAt: lr.createdAt,
    respondedAt: lr.respondedAt,
  };
}

// Cancel all other pending invites + outgoing join requests for a user (used after they join a team)
async function cancelOtherPendingForUser(
  userId: string,
  opts?: { keepInvitationId?: number; keepJoinRequestId?: number },
) {
  const invConds = [
    eq(teamInvitationsTable.inviteeId, userId),
    eq(teamInvitationsTable.status, "pending"),
  ];
  if (opts?.keepInvitationId != null)
    invConds.push(ne(teamInvitationsTable.id, opts.keepInvitationId));
  await db
    .update(teamInvitationsTable)
    .set({ status: "cancelled", respondedAt: new Date() })
    .where(and(...invConds));

  const jrConds = [
    eq(teamJoinRequestsTable.requesterId, userId),
    eq(teamJoinRequestsTable.status, "pending"),
  ];
  if (opts?.keepJoinRequestId != null)
    jrConds.push(ne(teamJoinRequestsTable.id, opts.keepJoinRequestId));
  await db
    .update(teamJoinRequestsTable)
    .set({ status: "cancelled", respondedAt: new Date() })
    .where(and(...jrConds));
}

async function isTeamMember(userId: string, teamId: number) {
  const [m] = await db
    .select()
    .from(teamMembersTable)
    .where(
      and(
        eq(teamMembersTable.userId, userId),
        eq(teamMembersTable.teamId, teamId),
      ),
    );
  return !!m;
}

// ---------- Browse + search + join-by-code ----------

router.get("/teams/browse", async (req, res): Promise<void> => {
  if (!requireAuth(req, res)) return;
  const campusId = req.user.campusId;
  if (!campusId) {
    res.status(400).json({ error: "Your account has no campus assigned" });
    return;
  }
  const teams = await db
    .select()
    .from(teamsTable)
    .where(
      and(eq(teamsTable.campusId, campusId), eq(teamsTable.isHidden, false)),
    )
    .orderBy(desc(teamsTable.createdAt));

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
      const [mc] = await db
        .select({ count: sql<number>`count(*)` })
        .from(teamMembersTable)
        .where(eq(teamMembersTable.teamId, team.id));
      // Strip invite code + internal coordinator/rejection metadata
      const {
        inviteCode: _ic,
        coordinatorComment: _cc,
        rejectionReason: _rr,
        ...safe
      } = team as any;
      return {
        ...safe,
        inviteCode: null,
        campusName: campus?.name ?? "",
        leaderName: leader
          ? `${leader.firstName} ${leader.lastName}`.trim()
          : "",
        memberCount: Number(mc?.count ?? 0),
        projectCount: 0,
        totalRevenue: 0,
        totalOrderBook: 0,
        nationalRank: null as number | null,
      };
    }),
  );
  res.json(result);
});

router.get("/students/search", async (req, res): Promise<void> => {
  if (!requireAuth(req, res)) return;
  const campusId = req.user.campusId;
  if (!campusId) {
    res.status(400).json({ error: "Your account has no campus assigned" });
    return;
  }
  const q = String(req.query.q ?? "").trim();
  if (q.length < 2) {
    res.json([]);
    return;
  }
  const like = `%${q}%`;
  const results = await db
    .select()
    .from(rosterTable)
    .where(
      and(
        eq(rosterTable.campusId, campusId),
        eq(rosterTable.isWhitelisted, true),
        or(ilike(rosterTable.fullName, like), ilike(rosterTable.niatId, like)),
      ),
    )
    .limit(25);

  const out = await Promise.all(
    results.map(async (r) => {
      // Find linked user account by email or by formsUserId == studentId
      const [u] = await db
        .select()
        .from(usersTable)
        .where(
          or(
            eq(usersTable.formsUserId, r.studentId),
            eq(usersTable.email, r.email ?? "__none__"),
          ),
        );
      let onTeam = false;
      if (u) {
        const [m] = await db
          .select()
          .from(teamMembersTable)
          .where(eq(teamMembersTable.userId, u.id));
        onTeam = !!m;
      }
      return {
        userId: u?.id ?? null,
        rosterId: r.id,
        fullName: r.fullName,
        niatId: r.niatId ?? null,
        batchSectionName: r.batchSectionName ?? null,
        hasAccount: !!u,
        onTeam,
      };
    }),
  );
  // Exclude students already on a team
  res.json(out.filter((s) => !s.onTeam).map(({ onTeam, ...rest }) => rest));
});

router.post("/teams/join-by-code", async (req, res): Promise<void> => {
  if (!requireAuth(req, res)) return;
  const parsed = JoinByCodeBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  // Bug 2 fix: trim + uppercase server-side too (defence in depth — frontend
  // already does this, but the API is the source of truth for normalization).
  const code = parsed.data.code.trim().toUpperCase();
  const [team] = await db
    .select()
    .from(teamsTable)
    .where(eq(teamsTable.inviteCode, code));
  if (!team) {
    res.status(404).json({ error: "Invalid invite code" });
    return;
  }

  // Bug 2 fix: backfill req.user.campusId from the user's roster row when null.
  // Without this, brand-new SSO users hit a spurious 403 "different campus"
  // even when the team is at their actual campus.
  let userCampusId = req.user.campusId ?? null;
  if (userCampusId == null) {
    const [dbUser] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.id, req.user.id));
    if (dbUser) {
      const matchClauses = [eq(rosterTable.email, dbUser.email)];
      if (dbUser.formsUserId) {
        matchClauses.push(eq(rosterTable.studentId, dbUser.formsUserId));
      }
      const [rosterEntry] = await db
        .select()
        .from(rosterTable)
        .where(and(or(...matchClauses)!, eq(rosterTable.isWhitelisted, true)));
      if (rosterEntry?.campusId != null) {
        userCampusId = rosterEntry.campusId;
        await db
          .update(usersTable)
          .set({ campusId: userCampusId, updatedAt: new Date() })
          .where(eq(usersTable.id, req.user.id));
        // Refresh in-memory session user so subsequent requests see it.
        req.user.campusId = userCampusId;
      }
    }
  }

  // Bug 2 fix: distinct error messages for "no campus" vs "different campus".
  if (userCampusId == null) {
    res.status(403).json({
      error:
        "Your account has no campus assigned yet. Ask your campus coordinator to add you to the roster, then try again.",
    });
    return;
  }
  if (team.campusId !== userCampusId) {
    res.status(403).json({ error: "This team belongs to a different campus" });
    return;
  }

  const existing = await getMembership(req.user.id);
  if (existing) {
    res.status(400).json({ error: "You are already on a team" });
    return;
  }
  // Enforce team capacity atomically (lock the team row, recount under lock).
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
      .status(400)
      .json({ error: "Could not join team (already a member of one)" });
    return;
  }
  await cancelOtherPendingForUser(req.user.id);
  await createNotification(
    team.leaderId,
    "New teammate joined",
    `${req.user.firstName} ${req.user.lastName} joined your team via invite code.`,
    "team_member_joined",
    "/team",
  );
  const detail = await getTeamDetail(team.id);
  res.json(detail);
});

// ---------- Invitations ----------

router.get("/teams/:id/invitations", async (req, res): Promise<void> => {
  if (!requireAuth(req, res)) return;
  const params = IdParam.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const memberOK = await isTeamMember(req.user.id, params.data.id);
  if (!memberOK && req.user.role !== "admin") {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  const invites = await db
    .select()
    .from(teamInvitationsTable)
    .where(eq(teamInvitationsTable.teamId, params.data.id))
    .orderBy(desc(teamInvitationsTable.createdAt));
  res.json(await Promise.all(invites.map(shapeInvitation)));
});

router.post("/teams/:id/invitations", async (req, res): Promise<void> => {
  if (!requireAuth(req, res)) return;
  const params = IdParam.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const parsed = CreateTeamInvitationBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const team = await getTeamOrNull(params.data.id);
  if (!team) {
    res.status(404).json({ error: "Team not found" });
    return;
  }
  const memberOK = await isTeamMember(req.user.id, team.id);
  if (!memberOK) {
    res.status(403).json({ error: "Only team members can send invites" });
    return;
  }

  // Bug 1 fix: accept either `inviteeId` (existing user) OR `rosterId`
  // (auto-provision a placeholder user from the roster row so the invite
  // is stored against the invited student even if they haven't logged in).
  const body = parsed.data as {
    inviteeId?: string | null;
    rosterId?: number | null;
  };
  let inviteeUserId: string | null = body.inviteeId ?? null;
  if (!inviteeUserId && body.rosterId != null) {
    const [rosterRow] = await db
      .select()
      .from(rosterTable)
      .where(eq(rosterTable.id, body.rosterId));
    if (!rosterRow) {
      res.status(404).json({ error: "Roster entry not found" });
      return;
    }
    if (!rosterRow.isWhitelisted) {
      res
        .status(403)
        .json({ error: "Student is not whitelisted to join the program yet" });
      return;
    }
    if (rosterRow.campusId && rosterRow.campusId !== team.campusId) {
      res.status(403).json({ error: "Invitee is on a different campus" });
      return;
    }
    // Try to find an existing linked user first.
    const orClauses = [] as Array<ReturnType<typeof eq>>;
    if (rosterRow.studentId)
      orClauses.push(eq(usersTable.formsUserId, rosterRow.studentId));
    if (rosterRow.email) orClauses.push(eq(usersTable.email, rosterRow.email));
    let existing: typeof usersTable.$inferSelect | undefined;
    if (orClauses.length > 0) {
      [existing] = await db
        .select()
        .from(usersTable)
        .where(or(...orClauses)!)
        .limit(1);
    }
    if (existing) {
      inviteeUserId = existing.id;
    } else {
      // Provision a placeholder users row keyed off the roster studentId
      // so subsequent SSO logins reconcile to the same account.
      if (!rosterRow.studentId) {
        res.status(400).json({
          error:
            "Roster entry is missing a student id; cannot create placeholder account",
        });
        return;
      }
      const { user: placeholder } = await createOrGetUserByFormsId(
        rosterRow.studentId,
        { provisionedVia: "roster" },
      );
      // Backfill name/campus from roster onto the placeholder.
      const updates: Partial<typeof usersTable.$inferInsert> = {};
      const parts = (rosterRow.fullName ?? "").trim().split(/\s+/);
      if (!placeholder.firstName && parts[0]) updates.firstName = parts[0];
      if (!placeholder.lastName && parts.slice(1).length > 0)
        updates.lastName = parts.slice(1).join(" ");
      if (!placeholder.campusId && rosterRow.campusId)
        updates.campusId = rosterRow.campusId;
      if (Object.keys(updates).length > 0) {
        await db
          .update(usersTable)
          .set({ ...updates, updatedAt: new Date() })
          .where(eq(usersTable.id, placeholder.id));
      }
      inviteeUserId = placeholder.id;
    }
  }
  if (!inviteeUserId) {
    res.status(400).json({ error: "Provide inviteeId or rosterId" });
    return;
  }

  const [invitee] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.id, inviteeUserId));
  if (!invitee) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  if (invitee.id === req.user.id) {
    res.status(400).json({ error: "You cannot invite yourself" });
    return;
  }

  // Cross-campus check (allow if invitee has no campus yet — they'll inherit on first login)
  if (invitee.campusId && invitee.campusId !== team.campusId) {
    res.status(403).json({ error: "Invitee is on a different campus" });
    return;
  }
  const existing = await getMembership(invitee.id);
  if (existing) {
    res.status(400).json({ error: "That student is already on a team" });
    return;
  }

  // Don't duplicate a pending invite for the same team
  const [dup] = await db
    .select()
    .from(teamInvitationsTable)
    .where(
      and(
        eq(teamInvitationsTable.teamId, team.id),
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

  // Block new invitations when the team is already at capacity.
  {
    const limit = await getTeamMemberLimit();
    const count = await getTeamMemberCount(team.id);
    if (count >= limit) {
      res.status(400).json({ error: teamFullMessage(count, limit) });
      return;
    }
  }

  const [inv] = await db
    .insert(teamInvitationsTable)
    .values({ teamId: team.id, inviterId: req.user.id, inviteeId: invitee.id })
    .returning();

  await createNotification(
    invitee.id,
    "Team Invitation",
    `${req.user.firstName} ${req.user.lastName} invited you to join "${team.name}".`,
    "team_invitation",
    "/invitations",
  );
  res.status(201).json(await shapeInvitation(inv));
});

router.get("/invitations/mine", async (req, res): Promise<void> => {
  if (!requireAuth(req, res)) return;
  const invites = await db
    .select()
    .from(teamInvitationsTable)
    .where(
      and(
        eq(teamInvitationsTable.inviteeId, req.user.id),
        eq(teamInvitationsTable.status, "pending"),
      ),
    )
    .orderBy(desc(teamInvitationsTable.createdAt));
  res.json(await Promise.all(invites.map(shapeInvitation)));
});

router.post("/invitations/:id/accept", async (req, res): Promise<void> => {
  if (!requireAuth(req, res)) return;
  const params = IdParam.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "Invalid id" });
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
    res.status(403).json({ error: "Not your invitation" });
    return;
  }
  if (inv.status !== "pending") {
    res.status(400).json({ error: "Invitation is no longer pending" });
    return;
  }

  const team = await getTeamOrNull(inv.teamId);
  if (!team) {
    res.status(404).json({ error: "Team no longer exists" });
    return;
  }

  const existing = await getMembership(req.user.id);
  if (existing) {
    res.status(400).json({ error: "You are already on a team" });
    return;
  }

  // Enforce team capacity atomically: lock the team row, recount members
  // under the lock, then insert. This prevents two concurrent acceptances
  // from racing past the limit.
  const acceptResult = await db.transaction(async (tx) => {
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
  if (acceptResult.kind === "full") {
    res
      .status(400)
      .json({ error: teamFullMessage(acceptResult.count, acceptResult.limit) });
    return;
  }
  if (acceptResult.kind === "duplicate") {
    res.status(400).json({ error: "Could not join team" });
    return;
  }
  await db
    .update(teamInvitationsTable)
    .set({ status: "accepted", respondedAt: new Date() })
    .where(eq(teamInvitationsTable.id, inv.id));
  await cancelOtherPendingForUser(req.user.id, { keepInvitationId: inv.id });

  await createNotification(
    inv.inviterId,
    "Invitation Accepted",
    `${req.user.firstName} ${req.user.lastName} joined "${team.name}".`,
    "invitation_accepted",
    "/team",
  );
  const detail = await getTeamDetail(team.id);
  res.json(detail);
});

router.post("/invitations/:id/decline", async (req, res): Promise<void> => {
  if (!requireAuth(req, res)) return;
  const params = IdParam.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "Invalid id" });
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
    res.status(403).json({ error: "Not your invitation" });
    return;
  }
  if (inv.status !== "pending") {
    res.status(400).json({ error: "Invitation is no longer pending" });
    return;
  }
  const [updated] = await db
    .update(teamInvitationsTable)
    .set({ status: "declined", respondedAt: new Date() })
    .where(eq(teamInvitationsTable.id, inv.id))
    .returning();
  await createNotification(
    inv.inviterId,
    "Invitation Declined",
    `${req.user.firstName} ${req.user.lastName} declined your invitation.`,
    "invitation_declined",
    "/team",
  );
  res.json(await shapeInvitation(updated));
});

// ---------- Join requests ----------

router.get("/teams/:id/join-requests", async (req, res): Promise<void> => {
  if (!requireAuth(req, res)) return;
  const params = IdParam.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const memberOK = await isTeamMember(req.user.id, params.data.id);
  if (!memberOK && req.user.role !== "admin") {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  const reqs = await db
    .select()
    .from(teamJoinRequestsTable)
    .where(eq(teamJoinRequestsTable.teamId, params.data.id))
    .orderBy(desc(teamJoinRequestsTable.createdAt));
  res.json(await Promise.all(reqs.map(shapeJoinRequest)));
});

router.post("/teams/:id/join-requests", async (req, res): Promise<void> => {
  if (!requireAuth(req, res)) return;
  const params = IdParam.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const parsed = RequestToJoinTeamBody.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const team = await getTeamOrNull(params.data.id);
  if (!team) {
    res.status(404).json({ error: "Team not found" });
    return;
  }
  if (!req.user.campusId || team.campusId !== req.user.campusId) {
    res.status(403).json({ error: "Team is at a different campus" });
    return;
  }
  const existing = await getMembership(req.user.id);
  if (existing) {
    res.status(400).json({ error: "You are already on a team" });
    return;
  }

  // Block requests to teams that are already at the configured member limit.
  // The browse-teams UI hides the button in this case, but the API enforces
  // the same rule so direct calls (or stale clients) cannot bypass it.
  const [memberCount, memberLimit] = await Promise.all([
    getTeamMemberCount(team.id),
    getTeamMemberLimit(),
  ]);
  if (memberCount >= memberLimit) {
    res.status(400).json({ error: teamFullMessage(memberCount, memberLimit) });
    return;
  }

  const [dup] = await db
    .select()
    .from(teamJoinRequestsTable)
    .where(
      and(
        eq(teamJoinRequestsTable.teamId, team.id),
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
      teamId: team.id,
      requesterId: req.user.id,
      message: parsed.data.message ?? null,
    })
    .returning();

  // Notify all team members
  const members = await db
    .select()
    .from(teamMembersTable)
    .where(eq(teamMembersTable.teamId, team.id));
  for (const m of members) {
    await createNotification(
      m.userId,
      "New Join Request",
      `${req.user.firstName} ${req.user.lastName} wants to join "${team.name}".`,
      "join_request",
      "/team",
    );
  }
  res.status(201).json(await shapeJoinRequest(jr));
});

router.get("/join-requests/mine", async (req, res): Promise<void> => {
  if (!requireAuth(req, res)) return;
  const reqs = await db
    .select()
    .from(teamJoinRequestsTable)
    .where(eq(teamJoinRequestsTable.requesterId, req.user.id))
    .orderBy(desc(teamJoinRequestsTable.createdAt));
  res.json(await Promise.all(reqs.map(shapeJoinRequest)));
});

router.post("/join-requests/:id/approve", async (req, res): Promise<void> => {
  if (!requireAuth(req, res)) return;
  const params = IdParam.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "Invalid id" });
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
  const memberOK = await isTeamMember(req.user.id, jr.teamId);
  if (!memberOK) {
    res.status(403).json({ error: "Only team members can approve" });
    return;
  }

  const team = await getTeamOrNull(jr.teamId);
  if (!team) {
    res.status(404).json({ error: "Team no longer exists" });
    return;
  }
  const existing = await getMembership(jr.requesterId);
  if (existing) {
    await db
      .update(teamJoinRequestsTable)
      .set({
        status: "cancelled",
        respondedAt: new Date(),
        decidedById: req.user.id,
      })
      .where(eq(teamJoinRequestsTable.id, jr.id));
    res
      .status(400)
      .json({ error: "Requester has already joined another team" });
    return;
  }
  // Enforce team capacity atomically (lock the team row, recount under lock).
  const approveResult = await db.transaction(async (tx) => {
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
        .values({ teamId: team.id, userId: jr.requesterId });
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
    res.status(400).json({ error: "Could not add member" });
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
  await cancelOtherPendingForUser(jr.requesterId, { keepJoinRequestId: jr.id });

  await createNotification(
    jr.requesterId,
    "Join Request Approved",
    `You're now a member of "${team.name}".`,
    "join_approved",
    "/team",
  );
  res.json(await getTeamDetail(team.id));
});

router.post("/join-requests/:id/decline", async (req, res): Promise<void> => {
  if (!requireAuth(req, res)) return;
  const params = IdParam.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "Invalid id" });
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
  const memberOK = await isTeamMember(req.user.id, jr.teamId);
  if (!memberOK) {
    res.status(403).json({ error: "Only team members can decline" });
    return;
  }
  const [updated] = await db
    .update(teamJoinRequestsTable)
    .set({
      status: "declined",
      respondedAt: new Date(),
      decidedById: req.user.id,
    })
    .where(eq(teamJoinRequestsTable.id, jr.id))
    .returning();
  const team = await getTeamOrNull(jr.teamId);
  await createNotification(
    jr.requesterId,
    "Join Request Declined",
    `Your request to join "${team?.name ?? "the team"}" was declined.`,
    "join_declined",
    "/team",
  );
  res.json(await shapeJoinRequest(updated));
});

// ---------- Leave requests ----------

router.get("/teams/:id/leave-requests", async (req, res): Promise<void> => {
  if (!requireAuth(req, res)) return;
  const params = IdParam.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const team = await getTeamOrNull(params.data.id);
  if (!team) {
    res.status(404).json({ error: "Team not found" });
    return;
  }
  if (team.leaderId !== req.user.id && req.user.role !== "admin") {
    res.status(403).json({ error: "Only the leader can view leave requests" });
    return;
  }
  const reqs = await db
    .select()
    .from(teamLeaveRequestsTable)
    .where(eq(teamLeaveRequestsTable.teamId, params.data.id))
    .orderBy(desc(teamLeaveRequestsTable.createdAt));
  res.json(await Promise.all(reqs.map(shapeLeaveRequest)));
});

router.post("/teams/:id/leave-requests", async (req, res): Promise<void> => {
  if (!requireAuth(req, res)) return;
  const params = IdParam.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const parsed = RequestToLeaveTeamBody.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const team = await getTeamOrNull(params.data.id);
  if (!team) {
    res.status(404).json({ error: "Team not found" });
    return;
  }
  if (team.leaderId === req.user.id) {
    res.status(400).json({
      error: "The leader cannot leave the team. Transfer leadership first.",
    });
    return;
  }
  const memberOK = await isTeamMember(req.user.id, team.id);
  if (!memberOK) {
    res.status(403).json({ error: "You are not a member of this team" });
    return;
  }

  // Members leave instantly — no leader approval. We still write a row to
  // teamLeaveRequestsTable as an audit trail (status=approved, decided by
  // the requester themselves) so leader-side history queries keep working.
  const now = new Date();
  const lr = await db.transaction(async (tx) => {
    await tx
      .delete(teamMembersTable)
      .where(
        and(
          eq(teamMembersTable.teamId, team.id),
          eq(teamMembersTable.userId, req.user.id),
        ),
      );
    const [row] = await tx
      .insert(teamLeaveRequestsTable)
      .values({
        teamId: team.id,
        requesterId: req.user.id,
        reason: parsed.data.reason ?? null,
        status: "approved",
        respondedAt: now,
        decidedById: req.user.id,
      })
      .returning();
    return row;
  });

  await createNotification(
    team.leaderId,
    "Member left team",
    `${req.user.firstName} ${req.user.lastName} left "${team.name}".`,
    "leave_approved",
    "/team",
  );
  res.status(201).json(await shapeLeaveRequest(lr));
});

router.post("/leave-requests/:id/approve", async (req, res): Promise<void> => {
  if (!requireAuth(req, res)) return;
  const params = IdParam.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "Invalid id" });
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
  const team = await getTeamOrNull(lr.teamId);
  if (!team) {
    res.status(404).json({ error: "Team no longer exists" });
    return;
  }
  if (team.leaderId !== req.user.id && req.user.role !== "admin") {
    res.status(403).json({ error: "Only the leader can approve" });
    return;
  }
  await db
    .delete(teamMembersTable)
    .where(
      and(
        eq(teamMembersTable.teamId, team.id),
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
    "Leave Request Approved",
    `You have been removed from "${team.name}".`,
    "leave_approved",
    "/team",
  );
  res.json(await getTeamDetail(team.id));
});

router.post("/leave-requests/:id/decline", async (req, res): Promise<void> => {
  if (!requireAuth(req, res)) return;
  const params = IdParam.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "Invalid id" });
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
  const team = await getTeamOrNull(lr.teamId);
  if (!team) {
    res.status(404).json({ error: "Team no longer exists" });
    return;
  }
  if (team.leaderId !== req.user.id && req.user.role !== "admin") {
    res.status(403).json({ error: "Only the leader can decline" });
    return;
  }
  const [updated] = await db
    .update(teamLeaveRequestsTable)
    .set({
      status: "declined",
      respondedAt: new Date(),
      decidedById: req.user.id,
    })
    .where(eq(teamLeaveRequestsTable.id, lr.id))
    .returning();
  await createNotification(
    lr.requesterId,
    "Leave Request Declined",
    `Your request to leave "${team.name}" was declined.`,
    "leave_declined",
    "/team",
  );
  res.json(await shapeLeaveRequest(updated));
});

export default router;
