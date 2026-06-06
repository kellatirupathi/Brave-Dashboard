// Admin approval gate for team membership changes.
//
// Each gated mutation (join-by-code, accept invite, approve join-request,
// leave, leader-remove) creates a PENDING row in `membership_requests` instead
// of applying the change immediately. An admin then approves (which applies the
// real change) or rejects. Both approve and reject send email + notification.
//
// All apply-time invariants (one team per student, team capacity, leader can't
// leave/be removed) are re-checked here at approval time, not at request time,
// because the world may have moved on between request and decision.
import { and, eq, ne, desc, inArray } from "drizzle-orm";
import {
  db,
  membershipRequestsTable,
  teamsTable,
  teamMembersTable,
  teamInvitationsTable,
  teamJoinRequestsTable,
  teamLeaveRequestsTable,
  usersTable,
  campusesTable,
  type MembershipRequest,
} from "@workspace/db";
import { createNotification } from "./notifications";
import { sendEmail, getAppUrl } from "./email/brevo";
import { logAudit } from "./audit";
import {
  getTeamMemberLimit,
  getTeamMemberCount,
  teamFullMessage,
} from "./team-limits";

export type MembershipRequestType = MembershipRequest["type"];

const ADD_TYPES: ReadonlyArray<MembershipRequestType> = [
  "join_by_code",
  "invite_accept",
  "join_request_approve",
];

export function isAddType(type: MembershipRequestType): boolean {
  return ADD_TYPES.includes(type);
}

function displayName(u: {
  firstName: string | null;
  lastName: string | null;
  email: string;
}): string {
  const name = `${u.firstName ?? ""} ${u.lastName ?? ""}`.trim();
  return name || u.email;
}

const TYPE_LABELS: Record<MembershipRequestType, string> = {
  join_by_code: "Join team via invite code",
  invite_accept: "Accept team invitation",
  join_request_approve: "Approve join request",
  leave: "Leave team",
  leader_remove: "Remove member from team",
};

export function membershipRequestTypeLabel(
  type: MembershipRequestType,
): string {
  return TYPE_LABELS[type] ?? type;
}

// True when the user already has a pending membership request as the target or
// the actor. Used to block stacking up multiple concurrent requests.
export async function findPendingRequestForUser(
  userId: string,
): Promise<MembershipRequest | null> {
  const [row] = await db
    .select()
    .from(membershipRequestsTable)
    .where(
      and(
        eq(membershipRequestsTable.status, "pending"),
        eq(membershipRequestsTable.targetUserId, userId),
      ),
    )
    .orderBy(desc(membershipRequestsTable.createdAt))
    .limit(1);
  return row ?? null;
}

// Pending requests that affect a given team (so leaders/members can see that a
// change is awaiting admin approval).
export async function listPendingRequestsForTeam(
  teamId: number,
): Promise<MembershipRequest[]> {
  return db
    .select()
    .from(membershipRequestsTable)
    .where(
      and(
        eq(membershipRequestsTable.teamId, teamId),
        eq(membershipRequestsTable.status, "pending"),
      ),
    )
    .orderBy(desc(membershipRequestsTable.createdAt));
}

export type CreateMembershipRequestInput = {
  type: MembershipRequestType;
  teamId: number;
  targetUserId: string;
  actorUserId: string;
  campusId?: number | null;
  sourceInvitationId?: number | null;
  sourceJoinRequestId?: number | null;
  reason?: string | null;
};

export async function createMembershipRequest(
  input: CreateMembershipRequestInput,
): Promise<MembershipRequest> {
  const [row] = await db
    .insert(membershipRequestsTable)
    .values({
      type: input.type,
      teamId: input.teamId,
      targetUserId: input.targetUserId,
      actorUserId: input.actorUserId,
      campusId: input.campusId ?? null,
      sourceInvitationId: input.sourceInvitationId ?? null,
      sourceJoinRequestId: input.sourceJoinRequestId ?? null,
      reason: input.reason ?? null,
      status: "pending",
    })
    .returning();

  // Tell every admin a request is waiting. Best-effort: failure to notify must
  // not fail the student's request.
  try {
    const admins = await db
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(eq(usersTable.role, "admin"));
    const [team] = await db
      .select({ name: teamsTable.name })
      .from(teamsTable)
      .where(eq(teamsTable.id, input.teamId));
    for (const admin of admins) {
      await createNotification(
        admin.id,
        "New team request",
        `${membershipRequestTypeLabel(input.type)} — "${team?.name ?? "a team"}" needs your review.`,
        "membership_request",
        "/admin/team-requests",
      );
    }
  } catch {
    // ignore notification failures
  }

  return row;
}

export type ShapedMembershipRequest = {
  id: number;
  type: MembershipRequestType;
  typeLabel: string;
  status: MembershipRequest["status"];
  teamId: number;
  teamName: string;
  campusId: number | null;
  campusName: string | null;
  targetUserId: string;
  targetName: string;
  targetEmail: string;
  actorUserId: string;
  actorName: string;
  reason: string | null;
  decisionNote: string | null;
  decidedById: string | null;
  decidedByName: string | null;
  decidedAt: string | null;
  createdAt: string | null;
};

export async function shapeMembershipRequest(
  mr: MembershipRequest,
): Promise<ShapedMembershipRequest> {
  const [team] = await db
    .select({ name: teamsTable.name })
    .from(teamsTable)
    .where(eq(teamsTable.id, mr.teamId));
  const [target] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.id, mr.targetUserId));
  const [actor] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.id, mr.actorUserId));
  let campusName: string | null = null;
  if (mr.campusId != null) {
    const [campus] = await db
      .select({ name: campusesTable.name })
      .from(campusesTable)
      .where(eq(campusesTable.id, mr.campusId));
    campusName = campus?.name ?? null;
  }
  let decidedByName: string | null = null;
  if (mr.decidedById) {
    const [d] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.id, mr.decidedById));
    decidedByName = d ? displayName(d) : null;
  }
  return {
    id: mr.id,
    type: mr.type,
    typeLabel: membershipRequestTypeLabel(mr.type),
    status: mr.status,
    teamId: mr.teamId,
    teamName: team?.name ?? "Unknown",
    campusId: mr.campusId,
    campusName,
    targetUserId: mr.targetUserId,
    targetName: target ? displayName(target) : "Unknown",
    targetEmail: target?.email ?? "",
    actorUserId: mr.actorUserId,
    actorName: actor ? displayName(actor) : "Unknown",
    reason: mr.reason,
    decisionNote: mr.decisionNote,
    decidedById: mr.decidedById,
    decidedByName,
    decidedAt: mr.decidedAt ? mr.decidedAt.toISOString() : null,
    createdAt: mr.createdAt ? mr.createdAt.toISOString() : null,
  };
}

// Cancel all other pending invites + outgoing join requests for a user, after
// they have been added to a team. Mirrors the helper in team-flow.ts.
async function cancelOtherPendingForUser(
  userId: string,
  opts?: { keepInvitationId?: number; keepJoinRequestId?: number },
): Promise<void> {
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

export type ApplyResult =
  | { ok: true }
  | { ok: false; status: number; error: string };

// Apply an approved membership request. Re-checks all invariants at decision
// time. On success, performs the membership change + source-row updates +
// notifications + email. Returns a structured error (without mutating) when an
// invariant now fails so the admin sees a clear reason.
export async function applyMembershipRequest(
  mr: MembershipRequest,
  decidedById: string,
): Promise<ApplyResult> {
  const [team] = await db
    .select()
    .from(teamsTable)
    .where(eq(teamsTable.id, mr.teamId));
  if (!team) {
    return { ok: false, status: 404, error: "Team no longer exists" };
  }

  const [target] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.id, mr.targetUserId));
  const targetName = target ? displayName(target) : "A student";
  const appUrl = getAppUrl();

  if (isAddType(mr.type)) {
    // One-team-per-student: re-check the target is not already on a team.
    const [existing] = await db
      .select()
      .from(teamMembersTable)
      .where(eq(teamMembersTable.userId, mr.targetUserId));
    if (existing) {
      return {
        ok: false,
        status: 409,
        error: `${targetName} has already joined a team.`,
      };
    }
    // Capacity: lock the team row, recount under the lock, then insert.
    const result = await db.transaction(async (tx) => {
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
          .values({ teamId: team.id, userId: mr.targetUserId });
      } catch {
        return { kind: "duplicate" as const };
      }
      return { kind: "ok" as const };
    });
    if (result.kind === "full") {
      return {
        ok: false,
        status: 409,
        error: teamFullMessage(result.count, result.limit),
      };
    }
    if (result.kind === "duplicate") {
      return {
        ok: false,
        status: 409,
        error: `${targetName} could not be added (already on a team).`,
      };
    }

    // Update the source row (invitation / join request) so it reflects reality.
    if (mr.type === "invite_accept" && mr.sourceInvitationId != null) {
      await db
        .update(teamInvitationsTable)
        .set({ status: "accepted", respondedAt: new Date() })
        .where(eq(teamInvitationsTable.id, mr.sourceInvitationId));
      await cancelOtherPendingForUser(mr.targetUserId, {
        keepInvitationId: mr.sourceInvitationId,
      });
    } else if (
      mr.type === "join_request_approve" &&
      mr.sourceJoinRequestId != null
    ) {
      await db
        .update(teamJoinRequestsTable)
        .set({
          status: "approved",
          respondedAt: new Date(),
          decidedById,
        })
        .where(eq(teamJoinRequestsTable.id, mr.sourceJoinRequestId));
      await cancelOtherPendingForUser(mr.targetUserId, {
        keepJoinRequestId: mr.sourceJoinRequestId,
      });
    } else {
      await cancelOtherPendingForUser(mr.targetUserId);
    }

    await createNotification(
      mr.targetUserId,
      "You've joined a team",
      `An admin approved your request — you're now a member of "${team.name}".`,
      "membership_approved",
      "/team",
    );
    await createNotification(
      team.leaderId,
      "New teammate joined",
      `${targetName} has joined your team "${team.name}".`,
      "team_member_joined",
      "/team",
    );
    if (target?.email) {
      await sendEmail({
        to: { email: target.email, name: targetName },
        subject: `You've joined ${team.name} on BRAVE`,
        text: `Hi ${targetName},\n\nAn admin has approved your request to join "${team.name}". You're now a member of the team.\n\nOpen your team: ${appUrl}/team\n\n— BRAVE Dashboard`,
      });
    }
    return { ok: true };
  }

  // Removal flows: leave (self) and leader_remove (kicked by leader).
  // Leader can never be removed/leave through these flows.
  if (team.leaderId === mr.targetUserId) {
    return {
      ok: false,
      status: 409,
      error:
        "The team leader cannot leave or be removed. Transfer leadership first.",
    };
  }
  const [membership] = await db
    .select()
    .from(teamMembersTable)
    .where(
      and(
        eq(teamMembersTable.teamId, team.id),
        eq(teamMembersTable.userId, mr.targetUserId),
      ),
    );
  if (!membership) {
    return {
      ok: false,
      status: 409,
      error: `${targetName} is no longer a member of this team.`,
    };
  }

  await db
    .delete(teamMembersTable)
    .where(
      and(
        eq(teamMembersTable.teamId, team.id),
        eq(teamMembersTable.userId, mr.targetUserId),
      ),
    );

  if (mr.type === "leave") {
    await db.insert(teamLeaveRequestsTable).values({
      teamId: team.id,
      requesterId: mr.targetUserId,
      reason: mr.reason ?? null,
      status: "approved",
      respondedAt: new Date(),
      decidedById,
    });
    await createNotification(
      mr.targetUserId,
      "You've left your team",
      `An admin approved your request to leave "${team.name}".`,
      "membership_approved",
      "/get-started",
    );
    await createNotification(
      team.leaderId,
      "Member left team",
      `${targetName} has left "${team.name}".`,
      "leave_approved",
      "/team",
    );
    if (target?.email) {
      await sendEmail({
        to: { email: target.email, name: targetName },
        subject: `You've left ${team.name}`,
        text: `Hi ${targetName},\n\nAn admin has approved your request to leave "${team.name}". You're no longer a member of the team.\n\nFind or start a new team: ${appUrl}/get-started\n\n— BRAVE Dashboard`,
      });
    }
  } else {
    // leader_remove
    await logAudit(
      decidedById,
      "team_member_removed",
      "team",
      team.id,
      JSON.stringify({
        removedUserId: mr.targetUserId,
        removedUserEmail: target?.email ?? null,
        removedUserName: targetName,
        removedBy: "leader_via_admin_approval",
        requestedBy: mr.actorUserId,
      }),
    );
    await createNotification(
      mr.targetUserId,
      "Removed from team",
      `An admin approved your team leader's request to remove you from "${team.name}".`,
      "team_member_removed",
      "/",
    );
    await createNotification(
      team.leaderId,
      "Member removed",
      `${targetName} has been removed from "${team.name}".`,
      "team_member_removed",
      "/team",
    );
    if (target?.email) {
      await sendEmail({
        to: { email: target.email, name: targetName },
        subject: `You've been removed from ${team.name}`,
        text: `Hi ${targetName},\n\nAn admin has approved a request to remove you from "${team.name}". You're no longer a member of the team.\n\nFind or start a new team: ${appUrl}/get-started\n\n— BRAVE Dashboard`,
      });
    }
  }
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Per-student membership life-cycle timeline (admin popover on Team Requests).
// Aggregates a single student's account creation, current team membership,
// historical leaves, and every membership request (join-by-code / invite /
// join-request / leave / leader-remove) with its status.
// ---------------------------------------------------------------------------
export type MembershipTimelineEventKind =
  | "account_created"
  | "joined"
  | "left"
  | "removed"
  | "request";

export type MembershipTimelineEvent = {
  id: string;
  kind: MembershipTimelineEventKind;
  title: string;
  teamName: string | null;
  status: MembershipRequest["status"] | null;
  note: string | null;
  at: string; // ISO timestamp
};

export type MembershipTimeline = {
  user: { id: string; name: string; email: string } | null;
  events: MembershipTimelineEvent[];
};

const REQUEST_TIMELINE_TITLES: Record<MembershipRequestType, string> = {
  join_by_code: "Joined via invite code",
  invite_accept: "Accepted team invitation",
  join_request_approve: "Join request",
  leave: "Requested to leave team",
  leader_remove: "Removal requested by team leader",
};

export async function buildMembershipTimeline(
  userId: string,
): Promise<MembershipTimeline> {
  const [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.id, userId));

  const memberships = await db
    .select()
    .from(teamMembersTable)
    .where(eq(teamMembersTable.userId, userId));

  const leaves = await db
    .select()
    .from(teamLeaveRequestsTable)
    .where(
      and(
        eq(teamLeaveRequestsTable.requesterId, userId),
        eq(teamLeaveRequestsTable.status, "approved"),
      ),
    );

  const requests = await db
    .select()
    .from(membershipRequestsTable)
    .where(eq(membershipRequestsTable.targetUserId, userId))
    .orderBy(desc(membershipRequestsTable.createdAt));

  // Resolve all referenced team names in one query.
  const teamIds = new Set<number>();
  for (const m of memberships) teamIds.add(m.teamId);
  for (const l of leaves) teamIds.add(l.teamId);
  for (const r of requests) teamIds.add(r.teamId);
  const teamNameById = new Map<number, string>();
  if (teamIds.size > 0) {
    const teams = await db
      .select({ id: teamsTable.id, name: teamsTable.name })
      .from(teamsTable)
      .where(inArray(teamsTable.id, Array.from(teamIds)));
    for (const t of teams) teamNameById.set(t.id, t.name);
  }

  const events: MembershipTimelineEvent[] = [];

  if (user?.createdAt) {
    events.push({
      id: `account-${user.id}`,
      kind: "account_created",
      title: "Account created",
      teamName: null,
      status: null,
      note: null,
      at: user.createdAt.toISOString(),
    });
  }

  for (const m of memberships) {
    if (!m.joinedAt) continue;
    events.push({
      id: `member-${m.id}`,
      kind: "joined",
      title: "Joined team",
      teamName: teamNameById.get(m.teamId) ?? null,
      status: null,
      note: null,
      at: m.joinedAt.toISOString(),
    });
  }

  for (const l of leaves) {
    const at = l.respondedAt ?? l.createdAt;
    if (!at) continue;
    events.push({
      id: `leave-${l.id}`,
      kind: "left",
      title: "Left team",
      teamName: teamNameById.get(l.teamId) ?? null,
      status: null,
      note: l.reason ?? null,
      at: at.toISOString(),
    });
  }

  for (const r of requests) {
    const at = r.createdAt;
    if (!at) continue;
    const kind: MembershipTimelineEventKind =
      r.type === "leader_remove" ? "removed" : "request";
    events.push({
      id: `request-${r.id}`,
      kind,
      title: REQUEST_TIMELINE_TITLES[r.type] ?? "Membership request",
      teamName: teamNameById.get(r.teamId) ?? null,
      status: r.status,
      note: r.decisionNote ?? r.reason ?? null,
      at: at.toISOString(),
    });
  }

  // Newest first.
  events.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());

  return {
    user: user
      ? { id: user.id, name: displayName(user), email: user.email }
      : null,
    events,
  };
}

// Send the rejection notification + email (no membership change happens).
// Emails mirror the in-app notification recipients: always the requester, plus
// the joining student on add-flows when they differ. sendEmail never throws, so
// a mail failure can't block the reject response.
export async function notifyMembershipRejected(
  mr: MembershipRequest,
  note: string | null,
): Promise<void> {
  const [team] = await db
    .select({ name: teamsTable.name })
    .from(teamsTable)
    .where(eq(teamsTable.id, mr.teamId));
  const teamName = team?.name ?? "the team";
  const suffix = note && note.trim() ? ` Note from admin: ${note.trim()}` : "";
  const noteLine =
    note && note.trim() ? `\n\nAdmin's note: ${note.trim()}` : "";
  const label = membershipRequestTypeLabel(mr.type).toLowerCase();
  const appUrl = getAppUrl();

  // Notify + email whoever initiated the request.
  await createNotification(
    mr.actorUserId,
    "Request not approved",
    `Your request to ${label} for "${teamName}" was not approved.${suffix}`,
    "membership_rejected",
    "/team",
  );
  const [actor] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.id, mr.actorUserId));
  if (actor?.email) {
    await sendEmail({
      to: { email: actor.email, name: displayName(actor) },
      subject: `Your request was not approved — ${teamName}`,
      text: `Hi ${displayName(actor)},\n\nYour request to ${label} for "${teamName}" was not approved by an admin.${noteLine}\n\nOpen BRAVE: ${appUrl}/team\n\n— BRAVE Dashboard`,
    });
  }

  // For add-flows the target (the joining student) may differ from the actor.
  if (isAddType(mr.type) && mr.targetUserId !== mr.actorUserId) {
    await createNotification(
      mr.targetUserId,
      "Request not approved",
      `Your request to join "${teamName}" was not approved.${suffix}`,
      "membership_rejected",
      "/get-started",
    );
    const [targetUser] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.id, mr.targetUserId));
    if (targetUser?.email) {
      await sendEmail({
        to: { email: targetUser.email, name: displayName(targetUser) },
        subject: `Your request to join ${teamName} was not approved`,
        text: `Hi ${displayName(targetUser)},\n\nYour request to join "${teamName}" was not approved by an admin.${noteLine}\n\nFind or start a team: ${appUrl}/get-started\n\n— BRAVE Dashboard`,
      });
    }
  }
}
