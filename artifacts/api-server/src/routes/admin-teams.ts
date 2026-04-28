import { Router, type IRouter } from "express";
import { eq, ilike, inArray } from "drizzle-orm";
import {
  db,
  teamsTable,
  teamMembersTable,
  usersTable,
  campusesTable,
  milestonesTable,
  rosterTable,
} from "@workspace/db";
import {
  AdminCreateTeamBody,
  AdminBulkImportTeamsBody,
} from "@workspace/api-zod";
import { logAudit } from "../lib/audit";
import { generateUniqueInviteCode } from "../lib/team-helpers";

const router: IRouter = Router();

/**
 * Resolves a Student User ID to a users-table row. The CSV "Student User ID"
 * column maps to roster.studentId — admins bulk-import the entire enrolled-
 * student profile into roster long before the student first logs in via
 * Replit OIDC. Until that login happens, no users-table row exists.
 *
 * To let admins build teams ahead of student onboarding, this helper:
 *  1. Returns the existing users row if it's already there.
 *  2. Otherwise looks up the id in roster, and provisions a users row from
 *     roster data using the SAME id (so the OIDC login flow later matches by
 *     id and does not create a duplicate).
 *  3. Returns ok:false if the id isn't in roster either.
 *
 * Returns:
 *   { ok: true, userId, campusId } when the user is ready to be added to a team
 *   { ok: false, reason } when the id is not in roster, or any other validation fails
 */
async function resolveOrProvisionUser(studentUserId: string): Promise<
  | { ok: true; userId: string; campusId: number | null }
  | { ok: false; reason: string }
> {
  if (!studentUserId || !studentUserId.trim()) {
    return { ok: false, reason: "Empty user id" };
  }
  const id = studentUserId.trim();

  // 1. Already in users table by primary key? Done.
  const [existingById] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.id, id));
  if (existingById) {
    return {
      ok: true,
      userId: existingById.id,
      campusId: existingById.campusId ?? null,
    };
  }

  // 1b. Maybe the student logged in via Forms SSO before being imported, so
  //     a row exists with formsUserId = studentUserId but a different
  //     synthetic users.id. Reuse THAT row — putting them on the team via
  //     its real users.id keeps team_members consistent with the row their
  //     subsequent logins resolve to.
  const [existingByFormsId] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.formsUserId, id));
  if (existingByFormsId) {
    return {
      ok: true,
      userId: existingByFormsId.id,
      campusId: existingByFormsId.campusId ?? null,
    };
  }

  // 2. Not in users — try roster.
  const [rosterRow] = await db
    .select()
    .from(rosterTable)
    .where(eq(rosterTable.studentId, id));
  if (!rosterRow) {
    return { ok: false, reason: `User not found in roster: ${id}` };
  }

  // 3. Resolve campus from roster (campusId on roster row, or look up by campusName).
  let campusId: number | null = rosterRow.campusId ?? null;
  if (!campusId && rosterRow.campusName) {
    const [c] = await db
      .select()
      .from(campusesTable)
      .where(eq(campusesTable.name, rosterRow.campusName.trim()));
    campusId = c?.id ?? null;
  }

  // 4. Split fullName into first/last (best effort).
  const fullName = (rosterRow.fullName ?? "").trim();
  const parts = fullName.split(/\s+/);
  const firstName = parts[0] ?? "";
  const lastName = parts.slice(1).join(" ") || "";

  // 5. Insert the users row. Set formsUserId = studentUserId because that is
  //    how the Forms SSO first-login flow (createOrGetUserByFormsId in
  //    lib/db/src/forms-auth.ts) matches an incoming login to an existing
  //    row — without it, the student's first login would create a *second*
  //    users row and they'd never see the team they were assigned to.
  //    We also keep id = studentUserId for symmetry, and rely on email
  //    fallback for any future Replit-OIDC login path.
  //    onConflictDoNothing + re-select makes the helper safe against
  //    concurrent imports racing to provision the same studentId.
  await db
    .insert(usersTable)
    .values({
      id,
      formsUserId: id,
      email: rosterRow.email ?? `${id}@placeholder.brave.local`,
      firstName,
      lastName,
      role: "student",
      campusId,
      niatId: rosterRow.niatId ?? null,
      isActive: true,
      provisionedVia: "manual",
    })
    .onConflictDoNothing();

  // Re-select in case a concurrent insert won the race (or the conflict was
  // on the unique formsUserId / email constraint rather than the id PK).
  // Try by id first, then by formsUserId — a concurrent Forms-SSO first
  // login could have created a row with a synthetic id and our formsUserId.
  let [provisioned] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.id, id));
  if (!provisioned) {
    [provisioned] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.formsUserId, id));
  }
  if (!provisioned) {
    return {
      ok: false,
      reason: `Failed to provision user from roster: ${id}`,
    };
  }

  return { ok: true, userId: provisioned.id, campusId: provisioned.campusId ?? null };
}

type CreateOk = { ok: true; teamId: number };
type CreateErr = { ok: false; status: number; reason: string };

async function createActiveTeam(args: {
  name: string;
  campusId: number;
  leaderUserId: string;
  memberUserIds: string[];
  actorUserId: string;
}): Promise<CreateOk | CreateErr> {
  const { name, campusId, leaderUserId, memberUserIds, actorUserId } = args;

  // Verify campus exists
  const [campus] = await db
    .select({ id: campusesTable.id })
    .from(campusesTable)
    .where(eq(campusesTable.id, campusId));
  if (!campus) {
    return { ok: false, status: 400, reason: `Unknown campus id: ${campusId}` };
  }

  // Build deduped INPUT list, leader first. Intra-row duplicates (same id
  // appearing as leader and member, or twice as members) are silently
  // collapsed.
  const seenInput = new Set<string>();
  const inputIds: string[] = [];
  for (const id of [leaderUserId, ...memberUserIds]) {
    if (!seenInput.has(id)) {
      seenInput.add(id);
      inputIds.push(id);
    }
  }
  // Server-side cap (defence-in-depth even if API client violates spec):
  // leader + up to 4 members = max 5 ids total.
  if (inputIds.length > 5) {
    return {
      ok: false,
      status: 400,
      reason: "Too many members (maximum 4 in addition to leader)",
    };
  }

  // Resolve every input id against users-or-roster, auto-provisioning a
  // users row from roster data when the student hasn't logged in yet.
  // We process ids sequentially and bail out on the first failure with a
  // 400 — by design, any earlier ids that were freshly provisioned are
  // kept (those rows are valid; they just won't be attached to a team this
  // call). The map records the actual users.id we should write to
  // teams.leader_id and team_members.user_id — that may differ from the
  // input studentUserId when the student already exists with a synthetic
  // id and formsUserId = studentUserId (Forms-SSO first-login case).
  const resolvedById = new Map<string, string>();
  for (const id of inputIds) {
    const r = await resolveOrProvisionUser(id);
    if (!r.ok) {
      return { ok: false, status: 400, reason: r.reason };
    }
    resolvedById.set(id, r.userId);
  }
  const resolvedLeaderId = resolvedById.get(leaderUserId)!;

  // Dedup again on resolved ids, in case two different input ids resolved
  // to the same users row (extremely rare but possible).
  const seenResolved = new Set<string>();
  const allResolvedIds: string[] = [];
  for (const inputId of inputIds) {
    const resolved = resolvedById.get(inputId)!;
    if (!seenResolved.has(resolved)) {
      seenResolved.add(resolved);
      allResolvedIds.push(resolved);
    }
  }
  // Reverse map so the "already in team" error reports the studentUserId
  // the admin actually typed in the CSV, not the synthetic resolved id.
  const inputByResolved = new Map<string, string>();
  for (const [input, resolved] of resolvedById) {
    if (!inputByResolved.has(resolved)) inputByResolved.set(resolved, input);
  }

  // Verify none already in a team (preflight; transactional insert below
  // also catches racing inserts that slip past this check).
  const existingMembers = await db
    .select({ userId: teamMembersTable.userId })
    .from(teamMembersTable)
    .where(inArray(teamMembersTable.userId, allResolvedIds));
  if (existingMembers.length > 0) {
    const offending = existingMembers[0].userId;
    return {
      ok: false,
      status: 400,
      reason: `User already in team: ${inputByResolved.get(offending) ?? offending}`,
    };
  }

  const inviteCode = await generateUniqueInviteCode();

  // Run team + member inserts + milestone in a single transaction so that a
  // unique(team_members.userId) conflict from a concurrent admin insert
  // rolls back the team row instead of leaving an orphan active team.
  let teamId: number;
  try {
    teamId = await db.transaction(async (tx) => {
      const [team] = await tx
        .insert(teamsTable)
        .values({
          name,
          campusId,
          // Always store the resolved users.id, never the raw studentUserId
          // input — they differ for Forms-SSO-first students whose row has
          // a synthetic id and formsUserId = studentUserId.
          leaderId: resolvedLeaderId,
          status: "active",
          inviteCode,
        })
        .returning();

      await tx.insert(teamMembersTable).values(
        allResolvedIds.map((userId) => ({
          teamId: team.id,
          userId,
          memberRole: "member" as const,
        })),
      );

      await tx.insert(milestonesTable).values({
        teamId: team.id,
        type: "auto",
        title: "Team Registered",
        description: "Your team has been approved and is now active!",
        date: new Date(),
        isPinned: false,
      });

      return team.id;
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // Surface the membership unique-constraint race as a deterministic 409.
    if (/team_members.*user_id/i.test(msg) || /unique/i.test(msg)) {
      return {
        ok: false,
        status: 409,
        reason: "User already in team (concurrent change)",
      };
    }
    throw err;
  }

  await logAudit(
    actorUserId,
    "admin.team_created",
    "team",
    teamId,
    JSON.stringify({ teamName: name, memberCount: allResolvedIds.length }),
  );

  return { ok: true, teamId };
}

// POST /admin/teams — create one team
router.post("/admin/teams", async (req, res): Promise<void> => {
  if (!req.isAuthenticated() || req.user.role !== "admin") {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  const parsed = AdminCreateTeamBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const name = parsed.data.name.trim();
  if (!name) {
    res.status(400).json({ error: "Team name required" });
    return;
  }
  const memberUserIds = parsed.data.memberUserIds ?? [];
  if (memberUserIds.includes(parsed.data.leaderUserId)) {
    res
      .status(400)
      .json({ error: "Leader cannot also be listed as a member" });
    return;
  }

  const result = await createActiveTeam({
    name,
    campusId: parsed.data.campusId,
    leaderUserId: parsed.data.leaderUserId,
    memberUserIds,
    actorUserId: req.user.id,
  });

  if (!result.ok) {
    res.status(result.status).json({ error: result.reason });
    return;
  }

  // Return the freshly-created team in Team-shape
  const [team] = await db
    .select({
      id: teamsTable.id,
      name: teamsTable.name,
      campusId: teamsTable.campusId,
      campusName: campusesTable.name,
      leaderId: teamsTable.leaderId,
      status: teamsTable.status,
      tagline: teamsTable.tagline,
      photoUrl: teamsTable.photoUrl,
      inviteCode: teamsTable.inviteCode,
      rejectionReason: teamsTable.rejectionReason,
      coordinatorComment: teamsTable.coordinatorComment,
      isHidden: teamsTable.isHidden,
      isFeatured: teamsTable.isFeatured,
      createdAt: teamsTable.createdAt,
    })
    .from(teamsTable)
    .innerJoin(campusesTable, eq(teamsTable.campusId, campusesTable.id))
    .where(eq(teamsTable.id, result.teamId));

  const [leader] = await db
    .select({ firstName: usersTable.firstName, lastName: usersTable.lastName })
    .from(usersTable)
    .where(eq(usersTable.id, team.leaderId));

  res.status(201).json({
    ...team,
    leaderName: `${leader?.firstName ?? ""} ${leader?.lastName ?? ""}`.trim(),
    memberCount: 1 + (parsed.data.memberUserIds?.length ?? 0),
    projectCount: 0,
    totalRevenue: 0,
    totalOrderBook: 0,
    nationalRank: null,
  });
});

// POST /admin/teams/bulk-import — bulk create
router.post(
  "/admin/teams/bulk-import",
  async (req, res): Promise<void> => {
    if (!req.isAuthenticated() || req.user.role !== "admin") {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
    const parsed = AdminBulkImportTeamsBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }

    const inserted: Array<{
      rowNumber: number;
      teamId: number;
      teamName: string;
    }> = [];
    const skipped: Array<{
      rowNumber: number;
      teamName: string;
      reason: string;
    }> = [];

    for (const row of parsed.data.teams) {
      try {
        const teamName = (row.teamName ?? "").trim();
        const leaderUserId = (row.leaderUserId ?? "").trim();
        const universityName = (row.universityName ?? "").trim();
        const memberUserIds = (row.memberUserIds ?? [])
          .map((m) => m.trim())
          .filter((m) => m.length > 0);

        if (!teamName) {
          skipped.push({
            rowNumber: row.rowNumber,
            teamName,
            reason: "Team name required",
          });
          continue;
        }
        if (!leaderUserId) {
          skipped.push({
            rowNumber: row.rowNumber,
            teamName,
            reason: "Leader required",
          });
          continue;
        }
        if (!universityName) {
          skipped.push({
            rowNumber: row.rowNumber,
            teamName,
            reason: "University required",
          });
          continue;
        }

        // Resolve campus by name (case-insensitive)
        const [campus] = await db
          .select({ id: campusesTable.id })
          .from(campusesTable)
          .where(ilike(campusesTable.name, universityName));
        if (!campus) {
          skipped.push({
            rowNumber: row.rowNumber,
            teamName,
            reason: `Unknown university: ${universityName}`,
          });
          continue;
        }

        const result = await createActiveTeam({
          name: teamName,
          campusId: campus.id,
          leaderUserId,
          memberUserIds,
          actorUserId: req.user.id,
        });

        if (!result.ok) {
          skipped.push({
            rowNumber: row.rowNumber,
            teamName,
            reason: result.reason,
          });
          continue;
        }

        inserted.push({
          rowNumber: row.rowNumber,
          teamId: result.teamId,
          teamName,
        });
      } catch (err) {
        skipped.push({
          rowNumber: row.rowNumber,
          teamName: row.teamName ?? "",
          reason:
            err instanceof Error ? err.message : "Unexpected error during import",
        });
      }
    }

    await logAudit(
      req.user.id,
      "admin.teams_bulk_imported",
      "team",
      undefined,
      JSON.stringify({
        totalRows: parsed.data.teams.length,
        insertedCount: inserted.length,
        skippedCount: skipped.length,
      }),
    );

    res.status(200).json({
      totalRows: parsed.data.teams.length,
      insertedCount: inserted.length,
      skippedCount: skipped.length,
      inserted,
      skipped,
    });
  },
);

export default router;
