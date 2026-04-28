import { Router, type IRouter } from "express";
import { eq, ilike, inArray } from "drizzle-orm";
import {
  db,
  teamsTable,
  teamMembersTable,
  usersTable,
  campusesTable,
  milestonesTable,
} from "@workspace/db";
import {
  AdminCreateTeamBody,
  AdminBulkImportTeamsBody,
} from "@workspace/api-zod";
import { logAudit } from "../lib/audit";
import { generateUniqueInviteCode } from "../lib/team-helpers";

const router: IRouter = Router();

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

  // Build deduped list, leader first. Intra-row duplicates (same id appearing
  // as leader and member, or twice as members) are silently collapsed.
  const seen = new Set<string>();
  const allIds: string[] = [];
  for (const id of [leaderUserId, ...memberUserIds]) {
    if (!seen.has(id)) {
      seen.add(id);
      allIds.push(id);
    }
  }
  // Server-side cap (defence-in-depth even if API client violates spec):
  // leader + up to 4 members = max 5 ids total.
  if (allIds.length > 5) {
    return {
      ok: false,
      status: 400,
      reason: "Too many members (maximum 4 in addition to leader)",
    };
  }

  // Verify all users exist
  const userRows = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(inArray(usersTable.id, allIds));
  const foundIds = new Set(userRows.map((u) => u.id));
  for (const id of allIds) {
    if (!foundIds.has(id)) {
      return { ok: false, status: 400, reason: `User not found: ${id}` };
    }
  }

  // Verify none already in a team (preflight; transactional insert below
  // also catches racing inserts that slip past this check).
  const existingMembers = await db
    .select({ userId: teamMembersTable.userId })
    .from(teamMembersTable)
    .where(inArray(teamMembersTable.userId, allIds));
  if (existingMembers.length > 0) {
    return {
      ok: false,
      status: 400,
      reason: `User already in team: ${existingMembers[0].userId}`,
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
          leaderId: leaderUserId,
          status: "active",
          inviteCode,
        })
        .returning();

      await tx.insert(teamMembersTable).values(
        allIds.map((userId) => ({
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
    JSON.stringify({ teamName: name, memberCount: allIds.length }),
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
