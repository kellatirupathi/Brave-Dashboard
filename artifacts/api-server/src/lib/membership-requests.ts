// Admin approval gate for team membership changes.
//
// Each gated mutation (join-by-code, accept invite, approve join-request,
// leave, leader-remove) creates a PENDING row in `membership_requests` instead
// of applying the change immediately. An admin then approves (which applies the
// real change + sends email + notification) or rejects (notification only).
//
// All apply-time invariants (one team per student, team capacity, leader can't
// leave/be removed) are re-checked here at approval time, not at request time,
// because the world may have moved on between request and decision.
import { and, eq, ne, desc } from "drizzle-orm";
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

export function membershipRequestTypeLabel(type: MembershipRequestType): string {
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
      error: "The team leader cannot leave or be removed. Transfer leadership first.",
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

// Send the rejection notification (no membership change happens).
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
  const label = membershipRequestTypeLabel(mr.type).toLowerCase();

  // Notify whoever initiated the request.
  await createNotification(
    mr.actorUserId,
    "Request not approved",
    `Your request to ${label} for "${teamName}" was not approved.${suffix}`,
    "membership_rejected",
    "/team",
  );
  // For add-flows the target (the joining student) may differ from the actor.
  if (isAddType(mr.type) && mr.targetUserId !== mr.actorUserId) {
    await createNotification(
      mr.targetUserId,
      "Request not approved",
      `Your request to join "${teamName}" was not approved.${suffix}`,
      "membership_rejected",
      "/get-started",
    );
  }
}
