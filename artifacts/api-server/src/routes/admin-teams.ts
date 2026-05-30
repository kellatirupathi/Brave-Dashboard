import { Router, type IRouter, type Request, type Response } from "express";
import { eq, ilike, inArray, sql, and, or } from "drizzle-orm";
import * as XLSX from "xlsx";
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
async function resolveOrProvisionUser(
  studentUserId: string,
): Promise<
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

  return {
    ok: true,
    userId: provisioned.id,
    campusId: provisioned.campusId ?? null,
  };
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
    res.status(400).json({ error: "Leader cannot also be listed as a member" });
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
router.post("/admin/teams/bulk-import", async (req, res): Promise<void> => {
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
});

// =============================================================================
// Export — Teams + members directory
//
// Two flavours, both admin-only and respect the same filters as the Teams
// Directory list (`status` + `search`):
//   GET /admin/teams/export-all.csv         — single flat CSV, all teams
//   GET /admin/teams/export-by-campus.xlsx  — multi-sheet workbook, one sheet
//                                             per campus
//
// Row ordering: campus → team name → leader first → members in joined_at order
// Teams are visually separated by an empty row.
// Empty teams (0 members) are skipped.
// =============================================================================

type ExportRow = {
  team_id: number;
  team_name: string;
  team_status: string;
  team_created_at: Date;
  campus_id: number;
  campus_name: string;
  user_id: string;
  first_name: string;
  last_name: string;
  niat_id: string | null;
  email: string;
  joined_at: Date;
  member_role: string; // 'Leader' | 'Member'
  batch_section_name: string | null;
  team_verified_revenue: number;
  team_verified_order_book: number;
  team_projects_count: number;
};

const CSV_COLUMNS: Array<{
  key: keyof ExportRow | "full_name";
  header: string;
}> = [
  { key: "team_name", header: "Team Name" },
  { key: "campus_name", header: "Campus" },
  { key: "member_role", header: "Role" },
  { key: "full_name", header: "Full Name" },
  { key: "niat_id", header: "NIAT ID" },
  { key: "email", header: "Email" },
  { key: "batch_section_name", header: "Batch / Section" },
  { key: "joined_at", header: "Joined At" },
  { key: "team_status", header: "Team Status" },
  { key: "team_verified_revenue", header: "Verified Revenue (INR)" },
  { key: "team_verified_order_book", header: "Verified Order Book (INR)" },
  { key: "team_projects_count", header: "Projects Count" },
  { key: "team_created_at", header: "Team Created" },
];

async function fetchExportRows(opts: {
  status?: string;
  search?: string;
  campusId?: number;
}): Promise<ExportRow[]> {
  // Build WHERE clause matching the existing /teams list behaviour:
  //  - status filter narrows to one team status (active / rejected / etc.)
  //  - campusId filter narrows to one campus
  //  - search matches team name, campus name, member name/email/niatId
  // Empty teams are filtered out by the INNER JOIN on team_members.
  const conditions = [] as any[];
  if (opts.status && opts.status !== "all") {
    conditions.push(eq(teamsTable.status, opts.status as any));
  }
  if (opts.campusId != null && Number.isFinite(opts.campusId)) {
    conditions.push(eq(teamsTable.campusId, opts.campusId));
  }
  if (opts.search && opts.search.trim()) {
    const like = `%${opts.search.trim()}%`;
    conditions.push(
      or(
        ilike(teamsTable.name, like),
        ilike(campusesTable.name, like),
        ilike(usersTable.firstName, like),
        ilike(usersTable.lastName, like),
        ilike(usersTable.email, like),
        ilike(usersTable.niatId, like),
      ),
    );
  }
  const whereClause = conditions.length === 0 ? sql`TRUE` : and(...conditions);

  // Single JOIN query with team-level aggregate sub-selects for revenue,
  // order book, and project count. Ordering: campus → team → leader-first
  // → joined_at.
  const rows = await db
    .select({
      team_id: teamsTable.id,
      team_name: teamsTable.name,
      team_status: teamsTable.status,
      team_created_at: teamsTable.createdAt,
      campus_id: campusesTable.id,
      campus_name: campusesTable.name,
      user_id: usersTable.id,
      first_name: usersTable.firstName,
      last_name: usersTable.lastName,
      niat_id: usersTable.niatId,
      email: usersTable.email,
      joined_at: teamMembersTable.joinedAt,
      member_role: sql<string>`CASE WHEN ${usersTable.id} = ${teamsTable.leaderId} THEN 'Leader' ELSE 'Member' END`,
      batch_section_name: rosterTable.batchSectionName,
      team_verified_revenue: sql<string>`COALESCE((
        SELECT SUM(COALESCE(re.verified_amount, 0))
        FROM revenue_entries re
        WHERE re.team_id = ${teamsTable.id} AND re.status = 'verified'
      ), 0)`,
      team_verified_order_book: sql<string>`COALESCE((
        SELECT SUM(COALESCE(obe.verified_amount, 0))
        FROM order_book_entries obe
        WHERE obe.team_id = ${teamsTable.id} AND obe.status = 'verified'
      ), 0)`,
      team_projects_count: sql<string>`(
        SELECT COUNT(*) FROM projects p WHERE p.team_id = ${teamsTable.id}
      )`,
    })
    .from(teamsTable)
    .innerJoin(campusesTable, eq(campusesTable.id, teamsTable.campusId))
    .innerJoin(teamMembersTable, eq(teamMembersTable.teamId, teamsTable.id))
    .innerJoin(usersTable, eq(usersTable.id, teamMembersTable.userId))
    .leftJoin(
      rosterTable,
      or(
        eq(rosterTable.email, usersTable.email),
        eq(rosterTable.studentId, usersTable.formsUserId),
      ),
    )
    .where(whereClause)
    .orderBy(
      sql`${campusesTable.name} ASC`,
      sql`${teamsTable.name} ASC`,
      sql`CASE WHEN ${usersTable.id} = ${teamsTable.leaderId} THEN 0 ELSE 1 END`,
      sql`${teamMembersTable.joinedAt} ASC`,
    );

  return rows.map((r: Record<string, unknown>) => ({
    ...r,
    team_verified_revenue: Number(r["team_verified_revenue"] ?? 0),
    team_verified_order_book: Number(r["team_verified_order_book"] ?? 0),
    team_projects_count: Number(r["team_projects_count"] ?? 0),
  })) as unknown as ExportRow[];
}

function fmtCell(v: unknown): string {
  if (v == null) return "";
  if (v instanceof Date) {
    // YYYY-MM-DD HH:MM (UTC) — short, sortable, opens cleanly in Excel
    return v.toISOString().slice(0, 16).replace("T", " ");
  }
  return String(v);
}

function csvEscape(v: string): string {
  if (v === "") return "";
  // Quote if contains delimiter, quote, newline. Double internal quotes.
  if (/[",\n\r]/.test(v)) return `"${v.replace(/"/g, '""')}"`;
  return v;
}

function rowToCsvLine(row: ExportRow): string {
  return CSV_COLUMNS.map((col) => {
    if (col.key === "full_name") {
      const name = `${row.first_name ?? ""} ${row.last_name ?? ""}`.trim();
      return csvEscape(name);
    }
    return csvEscape(fmtCell(row[col.key as keyof ExportRow]));
  }).join(",");
}

function rowToObject(row: ExportRow): Record<string, string> {
  const out: Record<string, string> = {};
  for (const col of CSV_COLUMNS) {
    if (col.key === "full_name") {
      out[col.header] = `${row.first_name ?? ""} ${row.last_name ?? ""}`.trim();
    } else {
      out[col.header] = fmtCell(row[col.key as keyof ExportRow]);
    }
  }
  return out;
}

function emptyCsvRow(): string {
  return CSV_COLUMNS.map(() => "").join(",");
}

function emptyObjectRow(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const col of CSV_COLUMNS) out[col.header] = "";
  return out;
}

function timestampForFilename(): string {
  return new Date().toISOString().slice(0, 19).replace(/[T:]/g, "-");
}

// ---------- Export 1: single flat CSV ----------
router.get(
  "/admin/teams/export-all.csv",
  async (req: Request, res: Response): Promise<void> => {
    if (!req.isAuthenticated() || req.user.role !== "admin") {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
    try {
      const campusIdNum =
        typeof req.query.campusId === "string" && req.query.campusId
          ? Number(req.query.campusId)
          : undefined;
      const rows = await fetchExportRows({
        status:
          typeof req.query.status === "string" ? req.query.status : undefined,
        search:
          typeof req.query.search === "string" ? req.query.search : undefined,
        campusId:
          campusIdNum != null && Number.isFinite(campusIdNum)
            ? campusIdNum
            : undefined,
      });

      const lines: string[] = [];
      // Header
      lines.push(CSV_COLUMNS.map((c) => csvEscape(c.header)).join(","));
      // Body, with empty row between teams
      let prevTeamId: number | null = null;
      for (const row of rows) {
        if (prevTeamId != null && row.team_id !== prevTeamId) {
          lines.push(emptyCsvRow());
        }
        lines.push(rowToCsvLine(row));
        prevTeamId = row.team_id;
      }

      const csv = lines.join("\r\n");
      // UTF-8 BOM so Excel auto-detects encoding (Indian names with diacritics)
      const buffer = Buffer.concat([
        Buffer.from("﻿", "utf8"),
        Buffer.from(csv, "utf8"),
      ]);

      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="brave-teams-${timestampForFilename()}.csv"`,
      );
      res.send(buffer);
    } catch (err) {
      req.log.error({ err }, "[admin/teams/export-all.csv] failed");
      res.status(500).json({ error: "Export failed" });
    }
  },
);

// ---------- Export 2: multi-sheet xlsx (one sheet per campus) ----------
router.get(
  "/admin/teams/export-by-campus.xlsx",
  async (req: Request, res: Response): Promise<void> => {
    if (!req.isAuthenticated() || req.user.role !== "admin") {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
    try {
      const campusIdNum =
        typeof req.query.campusId === "string" && req.query.campusId
          ? Number(req.query.campusId)
          : undefined;
      const rows = await fetchExportRows({
        status:
          typeof req.query.status === "string" ? req.query.status : undefined,
        search:
          typeof req.query.search === "string" ? req.query.search : undefined,
        campusId:
          campusIdNum != null && Number.isFinite(campusIdNum)
            ? campusIdNum
            : undefined,
      });

      // Group rows by campus, preserving the SQL ordering inside each group.
      const byCampus = new Map<string, ExportRow[]>();
      for (const row of rows) {
        const key = row.campus_name || "(no campus)";
        const bucket = byCampus.get(key) ?? [];
        bucket.push(row);
        byCampus.set(key, bucket);
      }

      const workbook = XLSX.utils.book_new();

      // Sheet 1: an "All Teams" overview sheet first
      {
        const sheetRows: Record<string, string>[] = [];
        let prevTeamId: number | null = null;
        for (const row of rows) {
          if (prevTeamId != null && row.team_id !== prevTeamId) {
            sheetRows.push(emptyObjectRow());
          }
          sheetRows.push(rowToObject(row));
          prevTeamId = row.team_id;
        }
        const ws = XLSX.utils.json_to_sheet(sheetRows, {
          header: CSV_COLUMNS.map((c) => c.header),
        });
        XLSX.utils.book_append_sheet(workbook, ws, "All Teams");
      }

      // One sheet per campus, alphabetical
      const campusNames = [...byCampus.keys()].sort((a, b) =>
        a.localeCompare(b),
      );
      for (const campusName of campusNames) {
        const campusRows = byCampus.get(campusName)!;
        const sheetRows: Record<string, string>[] = [];
        let prevTeamId: number | null = null;
        for (const row of campusRows) {
          if (prevTeamId != null && row.team_id !== prevTeamId) {
            sheetRows.push(emptyObjectRow());
          }
          sheetRows.push(rowToObject(row));
          prevTeamId = row.team_id;
        }
        const ws = XLSX.utils.json_to_sheet(sheetRows, {
          header: CSV_COLUMNS.map((c) => c.header),
        });
        // Excel sheet names: max 31 chars, no : \ / ? * [ ]
        const safeName =
          campusName.replace(/[\\/?*[\]:]/g, "-").slice(0, 31) || "Campus";
        XLSX.utils.book_append_sheet(workbook, ws, safeName);
      }

      const buffer = XLSX.write(workbook, {
        type: "buffer",
        bookType: "xlsx",
      }) as Buffer;

      res.setHeader(
        "Content-Type",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      );
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="brave-teams-by-campus-${timestampForFilename()}.xlsx"`,
      );
      res.send(buffer);
    } catch (err) {
      req.log.error({ err }, "[admin/teams/export-by-campus.xlsx] failed");
      res.status(500).json({ error: "Export failed" });
    }
  },
);

export default router;
