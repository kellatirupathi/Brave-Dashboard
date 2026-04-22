import { Router, type IRouter } from "express";
import { eq, ilike, and, sql } from "drizzle-orm";
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
  const cutoff = new Date(Date.now() - 48 * 60 * 60 * 1000);

  const items: Array<{
    id: number; type: "revenue"; teamId: number; teamName: string;
    campusName: string; projectTitle: string; clientName: string; amount: number;
    submittedAt: Date; isOverdue: boolean; supportingDocUrl: string | null;
    paymentProofUrl: string | null; invoiceUrl: string | null; notes: string | null;
  }> = [];

  if (!type || type === "revenue") {
    const revEntries = await db
      .select()
      .from(revenueEntriesTable)
      .where(eq(revenueEntriesTable.status, "submitted"))
      .orderBy(revenueEntriesTable.submittedAt);
    for (const e of revEntries) {
      const [team] = await db.select().from(teamsTable).where(eq(teamsTable.id, e.teamId));
      if (campusId && team?.campusId !== campusId) continue;
      const [campus] = team ? await db.select().from(campusesTable).where(eq(campusesTable.id, team.campusId)) : [null];
      const [project] = await db.select().from(projectsTable).where(eq(projectsTable.id, e.projectId));
      items.push({
        id: e.id, type: "revenue", teamId: e.teamId, teamName: team?.name ?? "",
        campusName: campus?.name ?? "", projectTitle: project?.title ?? "",
        clientName: e.clientName, amount: e.amount,
        submittedAt: e.submittedAt ?? new Date(),
        isOverdue: (e.submittedAt ?? new Date()) < cutoff,
        supportingDocUrl: null, paymentProofUrl: e.paymentProofUrl ?? null,
        invoiceUrl: e.invoiceUrl ?? null, notes: e.notes ?? null,
      });
    }
  }

  items.sort((a, b) => new Date(a.submittedAt).getTime() - new Date(b.submittedAt).getTime());
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
  if (search) conditions.push(ilike(usersTable.email, `%${search}%`));
  const users = conditions.length > 0
    ? await db.select().from(usersTable).where(and(...conditions))
    : await db.select().from(usersTable);
  const result = await Promise.all(users.map(async (u) => {
    let campusName: string | null = null;
    if (u.campusId) {
      const [campus] = await db.select().from(campusesTable).where(eq(campusesTable.id, u.campusId));
      campusName = campus?.name ?? null;
    }
    const { passwordHash, ...safe } = u;
    return { ...safe, campusName };
  }));
  res.json(result);
});

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
  const { password, ...userData } = parsed.data;
  const passwordHash = await bcrypt.hash(password, 10);
  const [user] = await db
    .insert(usersTable)
    .values({ ...userData, passwordHash })
    .returning();
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
  const [user] = await db
    .update(usersTable)
    .set(parsed.data)
    .where(eq(usersTable.id, params.data.id))
    .returning();
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  await logAudit(req.user.id, "update_user", "user", undefined, `${user.id} ${JSON.stringify(parsed.data)}`);
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
  if (target.role === "student") {
    res.status(400).json({ error: "Use the roster tools to manage students." });
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
  await logAudit(req.user.id, "delete_user", "user", undefined, `Deleted ${target.role} ${target.email}`);
  res.json({ ok: true });
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
  const [entry] = await db.insert(rosterTable).values(parsed.data).returning();
  res.status(201).json(entry);
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
  let inserted = 0;
  let skipped = 0;
  for (const s of students) {
    try {
      await db.insert(rosterTable).values({
        studentId: s.studentUserId ?? "",
        fullName: s.studentName,
        campusName: s.instituteName,
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
