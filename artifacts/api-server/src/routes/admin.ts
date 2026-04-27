import { Router, type IRouter } from "express";
import { eq, ilike, and, or, sql, desc } from "drizzle-orm";
import {
  db,
  usersTable,
  programmeConfigTable,
  auditLogTable,
  rosterTable,
  accessRequestsTable,
  campusesTable,
  revenueEntriesTable,
  teamsTable,
  projectsTable,
} from "@workspace/db";
import {
  ListUsersQueryParams,
  CreateUserBody,
  UpdateUserParams,
  UpdateUserBody,
  GetProgrammeConfigResponse,
  UpdateProgrammeConfigBody,
  GetAuditLogQueryParams,
  ListRosterEntriesQueryParams,
  AddRosterEntryBody,
  BulkImportRosterBody,
  ImportUsersCsvBody,
  UpdateRosterEntryBody,
  UpdateAccessRequestBody,
  UpdateAccessRequestParams,
} from "@workspace/api-zod";
import { logAudit } from "../lib/audit";
import { runSeed } from "../seed";
import * as bcrypt from "bcryptjs";

const router: IRouter = Router();

// In-flight reseed guard: prevents two admins from clobbering each other.
let reseedInFlight = false;

// Review Queue
router.get("/admin/review-queue", async (req, res): Promise<void> => {
  if (!req.isAuthenticated() || req.user.role !== "admin") {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  const type = req.query.type as string | undefined;
  const campusId = req.query.campusId ? Number(req.query.campusId) : undefined;
  const search = typeof req.query.search === "string" ? req.query.search.trim() : "";
  const cutoff = new Date(Date.now() - 48 * 60 * 60 * 1000);
  const searchLower = search.toLowerCase();
  const searchAmount = search && /^\d+$/.test(search) ? Number(search) : null;

  const items: Array<{
    id: number; type: "revenue"; teamId: number; teamName: string;
    campusName: string; projectTitle: string; clientName: string; amount: number;
    submittedAt: Date; isOverdue: boolean; supportingDocUrl: string | null;
    brdUrl: string | null;
  }> = [];

  if (!type || type === "revenue") {
    const revEntries = await db
      .select()
      .from(revenueEntriesTable)
      .where(eq(revenueEntriesTable.status, "submitted"))
      .orderBy(desc(revenueEntriesTable.submittedAt));
    for (const e of revEntries) {
      const [team] = await db.select().from(teamsTable).where(eq(teamsTable.id, e.teamId));
      if (campusId && team?.campusId !== campusId) continue;
      const [campus] = team ? await db.select().from(campusesTable).where(eq(campusesTable.id, team.campusId)) : [null];
      const [project] = await db.select().from(projectsTable).where(eq(projectsTable.id, e.projectId));
      // submitter: prefer the team leader as the submitter context
      const [submitter] = team ? await db.select().from(usersTable).where(eq(usersTable.id, team.leaderId)) : [null];
      const submitterName = submitter ? `${submitter.firstName ?? ""} ${submitter.lastName ?? ""}`.trim() : "";
      if (search) {
        const haystack = [
          team?.name ?? "",
          campus?.name ?? "",
          project?.title ?? "",
          e.clientName ?? "",
          submitterName,
          submitter?.email ?? "",
        ].join(" \u0001 ").toLowerCase();
        const textMatch = haystack.includes(searchLower);
        const amountMatch =
          searchAmount !== null &&
          (e.amount === searchAmount || e.verifiedAmount === searchAmount);
        if (!textMatch && !amountMatch) continue;
      }
      items.push({
        id: e.id, type: "revenue", teamId: e.teamId, teamName: team?.name ?? "",
        campusName: campus?.name ?? "", projectTitle: project?.title ?? "",
        clientName: e.clientName, amount: e.amount,
        submittedAt: e.submittedAt ?? new Date(),
        isOverdue: (e.submittedAt ?? new Date()) < cutoff,
        supportingDocUrl: null, brdUrl: e.brdUrl ?? null,
      });
    }
  }

  items.sort((a, b) => new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime());
  res.json({
    items,
    overdueCount: items.filter(i => i.isOverdue).length,
    totalCount: items.length,
  });
});

// User Management
router.get("/admin/users", async (req, res): Promise<void> => {
  if (!req.isAuthenticated() || req.user.role !== "admin") {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  const queryParams = ListUsersQueryParams.safeParse(req.query);
  if (!queryParams.success) {
    res.status(400).json({ error: queryParams.error.message });
    return;
  }
  const { role, campusId, search } = queryParams.data;
  let conditions: ReturnType<typeof and>[] = [];
  if (role) conditions.push(eq(usersTable.role, role));
  if (campusId) conditions.push(eq(usersTable.campusId, campusId));
  if (search) {
    const pattern = `%${search}%`;
    const orFilter = or(
      ilike(usersTable.email, pattern),
      ilike(usersTable.firstName, pattern),
      ilike(usersTable.lastName, pattern),
      ilike(sql`(${usersTable.firstName} || ' ' || ${usersTable.lastName})`, pattern),
    );
    if (orFilter) conditions.push(orFilter);
  }
  const users = conditions.length > 0
    ? await db.select().from(usersTable).where(and(...conditions))
    : await db.select().from(usersTable);
  const result = await Promise.all(users.map(async (u) => {
    let campusName: string | null = null;
    if (u.role !== "admin" && u.campusId) {
      const [campus] = await db.select().from(campusesTable).where(eq(campusesTable.id, u.campusId));
      campusName = campus?.name ?? null;
    }
    const { passwordHash, ...safe } = u;
    return {
      ...safe,
      campusId: u.role === "admin" ? null : safe.campusId,
      campusName,
    };
  }));
  res.json(result);
});

// Resolve a campus by name (case-insensitive). Returns null if not found.
async function resolveCampusByName(name: string | null | undefined) {
  if (!name) return null;
  const trimmed = name.trim();
  if (!trimmed) return null;
  const [campus] = await db
    .select()
    .from(campusesTable)
    .where(ilike(campusesTable.name, trimmed));
  return campus ?? null;
}

router.post("/admin/users", async (req, res): Promise<void> => {
  if (!req.isAuthenticated() || req.user.role !== "admin") {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  const parsed = CreateUserBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { password, campusName, niatId, batchSectionName, formsUserId, ...userData } = parsed.data;

  // Resolve campusId from name when provided
  let resolvedCampusId: number | null | undefined = userData.campusId;
  if (campusName && resolvedCampusId == null) {
    const c = await resolveCampusByName(campusName);
    if (!c) {
      res.status(400).json({ error: `Unknown campus: "${campusName}"` });
      return;
    }
    resolvedCampusId = c.id;
  }

  if (userData.role === "admin") {
    resolvedCampusId = null;
  } else if ((userData.role === "coordinator" || userData.role === "student") && resolvedCampusId == null) {
    res.status(400).json({ error: `A ${userData.role} must be assigned to a campus.` });
    return;
  }

  const passwordHash = password ? await bcrypt.hash(password, 10) : null;
  const insertValues: Partial<typeof usersTable.$inferInsert> = {
    ...userData,
    campusId: resolvedCampusId ?? null,
    passwordHash,
    formsUserId: formsUserId ?? null,
  };

  let user;
  try {
    [user] = await db.insert(usersTable).values(insertValues as typeof usersTable.$inferInsert).returning();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("unique") || msg.includes("duplicate")) {
      res.status(409).json({ error: "A user with this email or Forms ID already exists." });
      return;
    }
    throw err;
  }

  // For students, also mirror into the roster table so existing
  // roster-based UI sees them.
  if (user.role === "student") {
    const campus = resolvedCampusId
      ? await db.select().from(campusesTable).where(eq(campusesTable.id, resolvedCampusId)).then(r => r[0])
      : null;
    await db.insert(rosterTable).values({
      studentId: formsUserId ?? user.id,
      fullName: `${user.firstName} ${user.lastName}`.trim(),
      email: user.email,
      campusName: campus?.name ?? "",
      campusId: resolvedCampusId ?? null,
      niatId: niatId ?? null,
      batchSectionName: batchSectionName ?? null,
      isWhitelisted: true,
    }).onConflictDoNothing();
  }

  await logAudit(req.user.id, "create_user", "user", undefined, `Created ${user.role} ${user.id}: ${user.email}`);
  const { passwordHash: _, ...safe } = user;
  res.status(201).json({ ...safe, campusName: null });
});

router.patch("/admin/users/:id", async (req, res): Promise<void> => {
  if (!req.isAuthenticated() || req.user.role !== "admin") {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  const params = UpdateUserParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = UpdateUserBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const updates: typeof parsed.data = { ...parsed.data };
  const [existing] = await db.select().from(usersTable).where(eq(usersTable.id, params.data.id));
  if (!existing) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  const finalRole: string = updates.role ?? existing.role;
  if (finalRole === "admin") {
    updates.campusId = null;
  } else if (finalRole === "coordinator" || finalRole === "student") {
    const finalCampusId =
      updates.campusId === undefined ? existing.campusId : updates.campusId;
    if (finalCampusId == null) {
      const label = finalRole === "coordinator" ? "coordinator" : "student";
      res.status(400).json({ error: `A ${label} must be assigned to a campus.` });
      return;
    }
  }
  const [user] = await db
    .update(usersTable)
    .set(updates)
    .where(eq(usersTable.id, params.data.id))
    .returning();
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  await logAudit(req.user.id, "update_user", "user", undefined, `${user.id} ${JSON.stringify(updates)}`);
  const { passwordHash, ...safe } = user;
  res.json({ ...safe, campusName: null });
});

router.delete("/admin/users/:id", async (req, res): Promise<void> => {
  if (!req.isAuthenticated() || req.user.role !== "admin") {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  const id = String(req.params.id);
  if (id === req.user.id) {
    res.status(400).json({ error: "You cannot delete your own account." });
    return;
  }
  const [target] = await db.select().from(usersTable).where(eq(usersTable.id, id));
  if (!target) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  if (target.role === "admin") {
    const [{ count: adminCount }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(usersTable)
      .where(eq(usersTable.role, "admin"));
    if (Number(adminCount) <= 1) {
      res.status(400).json({ error: "Cannot delete the last remaining admin." });
      return;
    }
  }
  await db.delete(usersTable).where(eq(usersTable.id, id));
  // If this user is also a student on the roster, remove the linked roster row.
  // Match the SAME entry deterministically: prefer formsUserId, otherwise
  // email, otherwise both — and always restrict to a single id before deleting.
  if (target.role === "student") {
    let rosterMatch: { id: number } | undefined;
    if (target.formsUserId) {
      [rosterMatch] = await db
        .select({ id: rosterTable.id })
        .from(rosterTable)
        .where(eq(rosterTable.studentId, target.formsUserId))
        .limit(1);
    }
    if (!rosterMatch && target.email) {
      [rosterMatch] = await db
        .select({ id: rosterTable.id })
        .from(rosterTable)
        .where(eq(rosterTable.email, target.email))
        .limit(1);
    }
    if (rosterMatch) {
      await db.delete(rosterTable).where(eq(rosterTable.id, rosterMatch.id));
    }
  }
  await logAudit(req.user.id, "delete_user", "user", undefined, `Deleted ${target.role} ${target.email}`);
  res.json({ ok: true });
});

// Bulk import / upsert users (admin / coordinator / student) from a parsed CSV.
// Identity key is forms_user_id. Existing rows are updated; missing rows are created.
router.post("/admin/users/import-csv", async (req, res): Promise<void> => {
  if (!req.isAuthenticated() || req.user.role !== "admin") {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  const parsed = ImportUsersCsvBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const rows = parsed.data.rows;

  // Pre-load all campuses once for fast case-insensitive lookup.
  const allCampuses = await db.select().from(campusesTable);
  const campusByName = new Map<string, typeof allCampuses[number]>();
  for (const c of allCampuses) campusByName.set(c.name.trim().toLowerCase(), c);

  let created = 0;
  let updated = 0;
  let failed = 0;
  const errors: { rowNumber: number; forms_user_id: string | null; message: string }[] = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const rowNumber = i + 2; // 1 header + 1-indexed
    try {
      const formsUserId = String(row.forms_user_id || "").trim();
      const role = String(row.role || "").trim().toLowerCase();
      const name = String(row.name || "").trim();
      const email = String(row.email || "").trim().toLowerCase();
      const campusNameRaw = (row.campus_name ?? "").toString().trim();
      const niatId = (row.niat_id ?? "").toString().trim() || null;
      const batchSection = (row.batch_section ?? "").toString().trim() || null;

      if (!formsUserId) throw new Error("forms_user_id is required");
      if (!["admin", "coordinator", "student"].includes(role)) throw new Error(`role must be admin | coordinator | student (got "${role}")`);
      if (!name) throw new Error("name is required");
      if (!email || !/^\S+@\S+\.\S+$/.test(email)) throw new Error(`invalid email: "${email}"`);

      let campusId: number | null = null;
      if (role !== "admin") {
        if (!campusNameRaw) throw new Error(`${role} requires campus_name`);
        const campus = campusByName.get(campusNameRaw.toLowerCase());
        if (!campus) throw new Error(`unknown campus: "${campusNameRaw}"`);
        campusId = campus.id;
      }

      const parts = name.split(/\s+/);
      const firstName = parts[0] ?? "";
      const lastName = parts.slice(1).join(" ") || "";

      // Upsert by forms_user_id
      const [existing] = await db
        .select()
        .from(usersTable)
        .where(eq(usersTable.formsUserId, formsUserId));

      if (existing) {
        await db
          .update(usersTable)
          .set({
            email,
            firstName,
            lastName,
            role: role as "admin" | "coordinator" | "student",
            campusId,
            isActive: true,
          })
          .where(eq(usersTable.id, existing.id));
        updated++;
      } else {
        await db.insert(usersTable).values({
          formsUserId,
          email,
          firstName,
          lastName,
          role: role as "admin" | "coordinator" | "student",
          campusId,
          isActive: true,
        });
        created++;
      }

      // Mirror students into the roster table.
      if (role === "student" && campusId != null) {
        const campus = allCampuses.find(c => c.id === campusId);
        const [existingRoster] = await db
          .select()
          .from(rosterTable)
          .where(eq(rosterTable.studentId, formsUserId));
        if (existingRoster) {
          await db
            .update(rosterTable)
            .set({
              fullName: name,
              email,
              campusName: campus?.name ?? "",
              campusId,
              niatId,
              batchSectionName: batchSection,
              isWhitelisted: true,
            })
            .where(eq(rosterTable.id, existingRoster.id));
        } else {
          await db.insert(rosterTable).values({
            studentId: formsUserId,
            fullName: name,
            email,
            campusName: campus?.name ?? "",
            campusId,
            niatId,
            batchSectionName: batchSection,
            isWhitelisted: true,
          }).onConflictDoNothing();
        }
      }
    } catch (err) {
      failed++;
      errors.push({
        rowNumber,
        forms_user_id: row.forms_user_id ? String(row.forms_user_id) : null,
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }

  await logAudit(
    req.user.id,
    "import_users_csv",
    "user",
    undefined,
    `Imported ${created} created, ${updated} updated, ${failed} failed (of ${rows.length}).`,
  );
  res.json({ total: rows.length, created, updated, failed, errors });
});

// Programme Config
router.get("/admin/programme-config", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  let configs = await db.select().from(programmeConfigTable).limit(1);
  if (configs.length === 0) {
    const [config] = await db.insert(programmeConfigTable).values({}).returning();
    configs = [config];
  }
  res.json(configs[0]);
});

router.patch("/admin/programme-config", async (req, res): Promise<void> => {
  if (!req.isAuthenticated() || req.user.role !== "admin") {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  const parsed = UpdateProgrammeConfigBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  let configs = await db.select().from(programmeConfigTable).limit(1);
  let config;
  if (configs.length === 0) {
    [config] = await db.insert(programmeConfigTable).values(parsed.data as Partial<typeof programmeConfigTable.$inferInsert>).returning();
  } else {
    [config] = await db
      .update(programmeConfigTable)
      .set(parsed.data as Partial<typeof programmeConfigTable.$inferInsert>)
      .where(eq(programmeConfigTable.id, configs[0].id))
      .returning();
  }
  await logAudit(req.user.id, "update_programme_config", "programme_config", config?.id, JSON.stringify(parsed.data));
  res.json(config);
});

// Audit Log
router.get("/admin/audit-log", async (req, res): Promise<void> => {
  if (!req.isAuthenticated() || req.user.role !== "admin") {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  const queryParams = GetAuditLogQueryParams.safeParse(req.query);
  if (!queryParams.success) {
    res.status(400).json({ error: queryParams.error.message });
    return;
  }
  const limit = queryParams.data.limit ?? 50;
  const offset = queryParams.data.offset ?? 0;
  const logs = await db
    .select()
    .from(auditLogTable)
    .orderBy(sql`created_at desc`)
    .limit(limit)
    .offset(offset);
  const result = await Promise.all(logs.map(async (log) => {
    const [actor] = await db.select().from(usersTable).where(eq(usersTable.id, log.actorId));
    return { ...log, actorName: actor ? `${actor.firstName} ${actor.lastName}` : "System" };
  }));
  res.json(result);
});

// Roster
router.get("/admin/roster", async (req, res): Promise<void> => {
  if (!req.isAuthenticated() || req.user.role !== "admin") {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  const queryParams = ListRosterEntriesQueryParams.safeParse(req.query);
  if (!queryParams.success) {
    res.status(400).json({ error: queryParams.error.message });
    return;
  }
  const { campusId } = queryParams.data;
  const entries = campusId
    ? await db.select().from(rosterTable).where(eq(rosterTable.campusId, campusId))
    : await db.select().from(rosterTable);
  res.json(entries);
});

router.post("/admin/roster", async (req, res): Promise<void> => {
  if (!req.isAuthenticated() || req.user.role !== "admin") {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  const parsed = AddRosterEntryBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const data = parsed.data;
  // Resolve campusId from campusName if not provided
  let campusId = data.campusId ?? null;
  if (campusId == null && data.campusName) {
    const c = await resolveCampusByName(data.campusName);
    if (c) campusId = c.id;
  }
  const [entry] = await db
    .insert(rosterTable)
    .values({ ...data, campusId, isWhitelisted: data.isWhitelisted ?? true })
    .returning();

  // Mirror into users table so /admin/users shows the student.
  if (data.studentId || data.email) {
    const nameParts = data.fullName.trim().split(/\s+/);
    const firstName = nameParts[0] ?? "";
    const lastName = nameParts.slice(1).join(" ") || "";
    await db.insert(usersTable).values({
      formsUserId: data.studentId || null,
      email: data.email || `sso_${data.studentId}@forms.local`,
      firstName,
      lastName,
      role: "student",
      campusId,
    }).onConflictDoNothing();
  }

  await logAudit(req.user.id, "create_roster_entry", "roster", entry.id, `Added ${entry.fullName} (${entry.studentId})`);
  res.status(201).json(entry);
});

// Update a single roster entry
router.patch("/admin/roster/:id", async (req, res): Promise<void> => {
  if (!req.isAuthenticated() || req.user.role !== "admin") {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const parsed = UpdateRosterEntryBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const updates = parsed.data;
  let campusId: number | null | undefined;
  if (updates.campusName) {
    const c = await resolveCampusByName(updates.campusName);
    if (!c) {
      res.status(400).json({ error: `Unknown campus: "${updates.campusName}"` });
      return;
    }
    campusId = c.id;
  }
  const set: Record<string, unknown> = {};
  if (updates.studentId !== undefined && updates.studentId !== null) set.studentId = updates.studentId;
  if (updates.fullName !== undefined && updates.fullName !== null) set.fullName = updates.fullName;
  if (updates.email !== undefined) set.email = updates.email;
  if (updates.campusName !== undefined && updates.campusName !== null) set.campusName = updates.campusName;
  if (campusId !== undefined) set.campusId = campusId;
  if (updates.niatId !== undefined) set.niatId = updates.niatId;
  if (updates.batchSectionName !== undefined) set.batchSectionName = updates.batchSectionName;
  if (updates.isWhitelisted !== undefined && updates.isWhitelisted !== null) set.isWhitelisted = updates.isWhitelisted;

  const [updated] = await db
    .update(rosterTable)
    .set(set)
    .where(eq(rosterTable.id, id))
    .returning();
  if (!updated) {
    res.status(404).json({ error: "Roster entry not found" });
    return;
  }

  // Mirror into the linked user row, if one exists. Use the PRE-UPDATE
  // identifiers (target) to find the linked row so renaming the studentId or
  // email still resolves to the same person. Always restrict to a single row.
  let linkedUserId: string | undefined;
  if (target.studentId) {
    const [hit] = await db
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(eq(usersTable.formsUserId, target.studentId))
      .limit(1);
    linkedUserId = hit?.id;
  }
  if (!linkedUserId && target.email) {
    const [hit] = await db
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(eq(usersTable.email, target.email))
      .limit(1);
    linkedUserId = hit?.id;
  }
  if (linkedUserId) {
    const userSet: Record<string, unknown> = {};
    if (updates.fullName) {
      const parts = updates.fullName.trim().split(/\s+/);
      userSet.firstName = parts[0] ?? "";
      userSet.lastName = parts.slice(1).join(" ") || "";
    }
    if (campusId !== undefined) userSet.campusId = campusId;
    if (updates.email !== undefined && updates.email !== null) userSet.email = updates.email;
    if (updates.studentId !== undefined && updates.studentId !== null) userSet.formsUserId = updates.studentId;
    if (Object.keys(userSet).length > 0) {
      await db.update(usersTable).set(userSet).where(eq(usersTable.id, linkedUserId));
    }
  }

  await logAudit(req.user.id, "update_roster_entry", "roster", updated.id, `Updated ${updated.fullName}`);
  res.json(updated);
});

// Delete a roster entry (and its mirrored user row, if any).
router.delete("/admin/roster/:id", async (req, res): Promise<void> => {
  if (!req.isAuthenticated() || req.user.role !== "admin") {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const [target] = await db.select().from(rosterTable).where(eq(rosterTable.id, id));
  if (!target) {
    res.status(404).json({ error: "Roster entry not found" });
    return;
  }
  await db.delete(rosterTable).where(eq(rosterTable.id, id));

  // Also delete the linked user row, if it exists and is a student. Resolve
  // ONE matching user (formsUserId first, email fallback) and delete by id so
  // we never accidentally hit unrelated rows that share an email.
  let linkedUserId: string | undefined;
  if (target.studentId) {
    const [hit] = await db
      .select({ id: usersTable.id, role: usersTable.role })
      .from(usersTable)
      .where(eq(usersTable.formsUserId, target.studentId))
      .limit(1);
    if (hit?.role === "student") linkedUserId = hit.id;
  }
  if (!linkedUserId && target.email) {
    const [hit] = await db
      .select({ id: usersTable.id, role: usersTable.role })
      .from(usersTable)
      .where(eq(usersTable.email, target.email))
      .limit(1);
    if (hit?.role === "student") linkedUserId = hit.id;
  }
  if (linkedUserId) {
    await db.delete(usersTable).where(eq(usersTable.id, linkedUserId));
  }

  await logAudit(req.user.id, "delete_roster_entry", "roster", id, `Deleted ${target.fullName} (${target.studentId})`);
  res.json({ ok: true });
});

// Bulk import roster from parsed Excel/CSV data
router.post("/admin/roster/import", async (req, res): Promise<void> => {
  if (!req.isAuthenticated() || req.user.role !== "admin") {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  const parsed = BulkImportRosterBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { students } = parsed.data;
  // Pre-resolve campuses so every imported row gets a real campusId — without
  // it the SSO whitelist gate would refuse to log these students in.
  const allCampuses = await db.select().from(campusesTable);
  const campusByName = new Map<string, typeof allCampuses[number]>();
  for (const c of allCampuses) campusByName.set(c.name.trim().toLowerCase(), c);

  let inserted = 0;
  let skipped = 0;
  for (const s of students) {
    try {
      const campus = campusByName.get((s.instituteName ?? "").trim().toLowerCase());
      if (!campus) {
        skipped++;
        continue;
      }
      await db.insert(rosterTable).values({
        studentId: s.studentUserId ?? "",
        fullName: s.studentName,
        campusName: campus.name,
        campusId: campus.id,
        niatId: s.niatId ?? null,
        batchSectionName: s.batchSectionName ?? null,
        isWhitelisted: true,
      }).onConflictDoNothing();
      inserted++;
    } catch {
      skipped++;
    }
  }
  await logAudit(req.user.id, "bulk_import_roster", "roster", undefined, `Imported ${inserted} students, skipped ${skipped}`);
  res.json({ inserted, skipped, total: students.length });
});

// Access Requests (admin)
router.get("/admin/access-requests", async (req, res): Promise<void> => {
  if (!req.isAuthenticated() || req.user.role !== "admin") {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  const status = req.query.status as string | undefined;
  const requests = status
    ? await db.select().from(accessRequestsTable).where(eq(accessRequestsTable.status, status))
    : await db.select().from(accessRequestsTable);
  res.json(requests.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()));
});

router.patch("/admin/access-requests/:id", async (req, res): Promise<void> => {
  if (!req.isAuthenticated() || req.user.role !== "admin") {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  const params = UpdateAccessRequestParams.safeParse({ id: Number(req.params.id) });
  const body = UpdateAccessRequestBody.safeParse(req.body);
  if (!params.success || !body.success) {
    res.status(400).json({ error: "Invalid request" });
    return;
  }
  const [updated] = await db
    .update(accessRequestsTable)
    .set({ status: body.data.status, notes: body.data.notes ?? null })
    .where(eq(accessRequestsTable.id, params.data.id))
    .returning();
  if (!updated) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  await logAudit(req.user.id, `access_request_${body.data.status}`, "access_request", updated.id, `${body.data.status}: ${updated.email}`);
  res.json(updated);
});

// Dev-only: re-run the seed routine that the CLI runs. Hidden in production.
router.post("/admin/dev/reseed", async (req, res): Promise<void> => {
  if (process.env.NODE_ENV === "production") {
    res.status(404).json({ error: "Not found" });
    return;
  }
  if (!req.isAuthenticated() || req.user.role !== "admin") {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  if (reseedInFlight) {
    res.status(409).json({ error: "A reseed is already in progress." });
    return;
  }

  reseedInFlight = true;
  const startedAt = Date.now();
  try {
    await runSeed();
    const durationMs = Date.now() - startedAt;
    await logAudit(
      req.user.id,
      "reseed_demo_data",
      "system",
      undefined,
      `Demo data reseeded via admin UI in ${durationMs}ms.`,
    );
    res.json({ ok: true, durationMs });
  } catch (err) {
    req.log.error({ err }, "reseed failed");
    res.status(500).json({ error: "Reseed failed", detail: err instanceof Error ? err.message : String(err) });
  } finally {
    reseedInFlight = false;
  }
});

export default router;
