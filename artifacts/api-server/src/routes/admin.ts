import { Router, type IRouter } from "express";
import { eq, ilike, and, or, sql, desc, inArray } from "drizzle-orm";
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
import {
  shapeMembershipRequest,
  applyMembershipRequest,
  notifyMembershipRejected,
  buildMembershipTimeline,
} from "../lib/membership-requests";
import { membershipRequestsTable } from "@workspace/db";
import { invalidateChatbotProviderCache } from "./chatbot";
import { deleteSessionsForUser } from "../lib/auth";
import { runSeed } from "../seed";
import { sendEmail, getAppUrl } from "../lib/email/brevo";
import { renderRevenueVerifiedEmail } from "../lib/email/templates/revenue-verified";
import { renderRevenueRejectedEmail } from "../lib/email/templates/revenue-rejected";
import { renderAccessApprovedEmail } from "../lib/email/templates/access-approved";
import { renderAccessRejectedEmail } from "../lib/email/templates/access-rejected";
import * as bcrypt from "bcryptjs";
import { z } from "zod";

const router: IRouter = Router();

// In-flight reseed guard: prevents two admins from clobbering each other.
let reseedInFlight = false;

// Review Queue
// Admins see everything (or filter by `?campusId=`). Coordinators are
// hard-locked to their own campus — any campusId query string is ignored
// for them so they can never peek at another campus's entries.
router.get("/admin/review-queue", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const isAdmin = req.user.role === "admin";
  const isCoordinator = req.user.role === "coordinator";
  if (!isAdmin && !isCoordinator) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  if (isCoordinator && req.user.campusId == null) {
    res.json({ items: [], overdueCount: 0, totalCount: 0 });
    return;
  }
  const type = req.query.type as string | undefined;
  const statusParam = req.query.status as string | undefined;
  const status: "submitted" | "verified" | "rejected" =
    statusParam === "verified"
      ? "verified"
      : statusParam === "rejected"
        ? "rejected"
        : "submitted";
  const campusId = isCoordinator
    ? (req.user.campusId ?? undefined)
    : req.query.campusId
      ? Number(req.query.campusId)
      : undefined;
  const search =
    typeof req.query.search === "string" ? req.query.search.trim() : "";
  const cutoff = new Date(Date.now() - 48 * 60 * 60 * 1000);
  const searchLower = search.toLowerCase();
  const searchAmount = search && /^\d+$/.test(search) ? Number(search) : null;

  const items: Array<{
    id: number;
    type: "revenue";
    teamId: number;
    teamName: string;
    campusName: string;
    projectTitle: string;
    clientName: string;
    amount: number;
    submittedAt: Date;
    isOverdue: boolean;
    supportingDocUrl: string | null;
    brdUrl: string | null;
    status: "submitted" | "verified" | "rejected";
    verifiedAmount: number | null;
    verifiedAt: Date | null;
    adminNotes: string | null;
    brdScore: number | null;
    uniquenessScore: number | null;
    aiAnalysedAt: Date | null;
    aiAnalysisDetail: unknown;
  }> = [];

  if (!type || type === "revenue") {
    const revEntries = await db
      .select()
      .from(revenueEntriesTable)
      .where(eq(revenueEntriesTable.status, status))
      .orderBy(
        status === "verified"
          ? desc(revenueEntriesTable.verifiedAt)
          : desc(revenueEntriesTable.submittedAt),
      );
    for (const e of revEntries) {
      const [team] = await db
        .select()
        .from(teamsTable)
        .where(eq(teamsTable.id, e.teamId));
      if (campusId && team?.campusId !== campusId) continue;
      const [campus] = team
        ? await db
            .select()
            .from(campusesTable)
            .where(eq(campusesTable.id, team.campusId))
        : [null];
      const [project] = await db
        .select()
        .from(projectsTable)
        .where(eq(projectsTable.id, e.projectId));
      // submitter: prefer the team leader as the submitter context
      const [submitter] = team
        ? await db
            .select()
            .from(usersTable)
            .where(eq(usersTable.id, team.leaderId))
        : [null];
      const submitterName = submitter
        ? `${submitter.firstName ?? ""} ${submitter.lastName ?? ""}`.trim()
        : "";
      if (search) {
        const haystack = [
          team?.name ?? "",
          campus?.name ?? "",
          project?.title ?? "",
          e.clientName ?? "",
          submitterName,
          submitter?.email ?? "",
        ]
          .join(" \u0001 ")
          .toLowerCase();
        const textMatch = haystack.includes(searchLower);
        const amountMatch =
          searchAmount !== null &&
          (e.amount === searchAmount || e.verifiedAmount === searchAmount);
        if (!textMatch && !amountMatch) continue;
      }
      items.push({
        id: e.id,
        type: "revenue",
        teamId: e.teamId,
        teamName: team?.name ?? "",
        campusName: campus?.name ?? "",
        projectTitle: project?.title ?? "",
        clientName: e.clientName,
        amount: e.amount,
        submittedAt: e.submittedAt ?? new Date(),
        isOverdue:
          status === "submitted" && (e.submittedAt ?? new Date()) < cutoff,
        supportingDocUrl: null,
        brdUrl: e.brdUrl ?? null,
        status: e.status as "submitted" | "verified" | "rejected",
        verifiedAmount: e.verifiedAmount ?? null,
        verifiedAt: e.verifiedAt ?? null,
        adminNotes: e.adminNotes ?? null,
        brdScore: e.brdScore ?? null,
        uniquenessScore: e.uniquenessScore ?? null,
        aiAnalysedAt: e.aiAnalysedAt ?? null,
        aiAnalysisDetail: e.aiAnalysisDetail ?? null,
      });
    }
  }

  if (status === "verified") {
    items.sort((a, b) => {
      const av = a.verifiedAt ? new Date(a.verifiedAt).getTime() : 0;
      const bv = b.verifiedAt ? new Date(b.verifiedAt).getTime() : 0;
      return bv - av;
    });
  } else {
    items.sort(
      (a, b) =>
        new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime(),
    );
  }
  res.json({
    items,
    overdueCount: items.filter((i) => i.isOverdue).length,
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
  const { role, campusId, search, provisionedVia, page, pageSize } =
    queryParams.data;
  const effectivePage = page && page >= 1 ? page : 1;
  const effectivePageSize =
    pageSize && pageSize >= 1 ? Math.min(pageSize, 10000) : 100;
  const offset = (effectivePage - 1) * effectivePageSize;

  let conditions: ReturnType<typeof and>[] = [];
  if (role) conditions.push(eq(usersTable.role, role));
  if (campusId) conditions.push(eq(usersTable.campusId, campusId));
  if (provisionedVia)
    conditions.push(eq(usersTable.provisionedVia, provisionedVia));
  if (search) {
    const pattern = `%${search}%`;
    const orFilter = or(
      ilike(usersTable.email, pattern),
      ilike(usersTable.firstName, pattern),
      ilike(usersTable.lastName, pattern),
      ilike(
        sql`(${usersTable.firstName} || ' ' || ${usersTable.lastName})`,
        pattern,
      ),
    );
    if (orFilter) conditions.push(orFilter);
  }
  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  // Role-priority ordering: admins first, then coordinators, then students.
  // Within each role group, preserve the existing creation order.
  const roleOrder = sql`CASE ${usersTable.role}
      WHEN 'admin' THEN 0
      WHEN 'coordinator' THEN 1
      WHEN 'student' THEN 2
      ELSE 3
    END`;

  const [{ count: totalCount }] = whereClause
    ? await db
        .select({ count: sql<number>`count(*)::int` })
        .from(usersTable)
        .where(whereClause)
    : await db.select({ count: sql<number>`count(*)::int` }).from(usersTable);

  const users = whereClause
    ? await db
        .select()
        .from(usersTable)
        .where(whereClause)
        .orderBy(roleOrder, usersTable.createdAt)
        .limit(effectivePageSize)
        .offset(offset)
    : await db
        .select()
        .from(usersTable)
        .orderBy(roleOrder, usersTable.createdAt)
        .limit(effectivePageSize)
        .offset(offset);

  const items = await Promise.all(
    users.map(async (u) => {
      let campusName: string | null = null;
      if (u.role !== "admin" && u.campusId) {
        const [campus] = await db
          .select()
          .from(campusesTable)
          .where(eq(campusesTable.id, u.campusId));
        campusName = campus?.name ?? null;
      }
      const { passwordHash, ...safe } = u;
      return {
        ...safe,
        campusId: u.role === "admin" ? null : safe.campusId,
        campusName,
        niatId: u.niatId ?? null,
        // Surface auth-method to the admin UI without leaking the hash itself.
        // True iff this account can log in with email + password.
        hasPassword: !!passwordHash,
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

// Keep `campuses.coordinator_id` in sync with `users.campus_id` for users
// whose role is `coordinator`. Both columns model the same relationship and
// must agree, otherwise the Campuses page renders "Unassigned" even though
// a coordinator account is wired to that campus.
//
// Pass the BEFORE state (or `null`/undefined for a fresh insert) and the
// AFTER state to compute the right pair of writes:
//   - if the old campus had this user as its coordinator, clear it
//   - if the new role is coordinator and there's a campus, set it
async function syncCampusCoordinatorLink(opts: {
  userId: string;
  before: { role: string | null; campusId: number | null } | null;
  after: { role: string; campusId: number | null };
}): Promise<void> {
  const { userId, before, after } = opts;
  const wasCoord = before?.role === "coordinator";
  const isCoord = after.role === "coordinator";
  const oldCampusId = before?.campusId ?? null;
  const newCampusId = after.campusId ?? null;

  // Clear the link on the OLD campus if this user was its registered
  // coordinator and either the user is no longer a coordinator or has moved
  // to a different campus.
  if (wasCoord && oldCampusId != null && oldCampusId !== newCampusId) {
    await db
      .update(campusesTable)
      .set({ coordinatorId: null, updatedAt: new Date() })
      .where(
        and(
          eq(campusesTable.id, oldCampusId),
          eq(campusesTable.coordinatorId, userId),
        ),
      );
  }

  // Stamp the link on the NEW campus if the user is currently a coordinator
  // with a campus assigned. Overwrites any prior coordinator on that campus
  // — the admin's most recent assignment wins.
  if (isCoord && newCampusId != null) {
    await db
      .update(campusesTable)
      .set({ coordinatorId: userId, updatedAt: new Date() })
      .where(eq(campusesTable.id, newCampusId));
  }
}

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
  const {
    password,
    campusName,
    niatId,
    batchSectionName,
    formsUserId,
    ...userData
  } = parsed.data;

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
  } else if (
    (userData.role === "coordinator" || userData.role === "student") &&
    resolvedCampusId == null
  ) {
    res
      .status(400)
      .json({ error: `A ${userData.role} must be assigned to a campus.` });
    return;
  }

  const passwordHash = password ? await bcrypt.hash(password, 10) : null;
  const insertValues: Partial<typeof usersTable.$inferInsert> = {
    ...userData,
    campusId: resolvedCampusId ?? null,
    passwordHash,
    formsUserId: formsUserId ?? null,
    provisionedVia: "manual",
  };

  let user;
  try {
    [user] = await db
      .insert(usersTable)
      .values(insertValues as typeof usersTable.$inferInsert)
      .returning();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("unique") || msg.includes("duplicate")) {
      res
        .status(409)
        .json({ error: "A user with this email or Forms ID already exists." });
      return;
    }
    throw err;
  }

  // For students, also mirror into the roster table so existing
  // roster-based UI sees them.
  if (user.role === "student") {
    const campus = resolvedCampusId
      ? await db
          .select()
          .from(campusesTable)
          .where(eq(campusesTable.id, resolvedCampusId))
          .then((r) => r[0])
      : null;
    await db
      .insert(rosterTable)
      .values({
        studentId: formsUserId ?? user.id,
        fullName: `${user.firstName} ${user.lastName}`.trim(),
        email: user.email,
        campusName: campus?.name ?? "",
        campusId: resolvedCampusId ?? null,
        niatId: niatId ?? null,
        batchSectionName: batchSectionName ?? null,
        isWhitelisted: true,
      })
      .onConflictDoNothing();
  }

  // Mirror the relationship onto campuses.coordinator_id so the Campuses
  // page reflects the assignment immediately. No-op for non-coordinators.
  try {
    await syncCampusCoordinatorLink({
      userId: user.id,
      before: null,
      after: { role: user.role, campusId: user.campusId ?? null },
    });
  } catch (err) {
    req.log.warn(
      { err, userId: user.id },
      "Failed to sync campuses.coordinator_id after create_user",
    );
  }

  await logAudit(
    req.user.id,
    "create_user",
    "user",
    undefined,
    `Created ${user.role} ${user.id}: ${user.email}`,
  );
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
  if (typeof updates.firstName === "string")
    updates.firstName = updates.firstName.trim();
  if (typeof updates.lastName === "string")
    updates.lastName = updates.lastName.trim();
  if (typeof updates.email === "string")
    updates.email = updates.email.trim().toLowerCase();
  if (typeof updates.niatId === "string") {
    const v = updates.niatId.trim();
    updates.niatId = v.length === 0 ? null : v;
  }
  if (typeof updates.profileImage === "string") {
    const v = updates.profileImage.trim();
    updates.profileImage = v.length === 0 ? null : v;
  }
  if (updates.firstName === "") {
    res.status(400).json({ error: "First name cannot be empty." });
    return;
  }
  if (updates.lastName === "") {
    res.status(400).json({ error: "Last name cannot be empty." });
    return;
  }
  const [existing] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.id, params.data.id));
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
      res
        .status(400)
        .json({ error: `A ${label} must be assigned to a campus.` });
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
  // If role or active status changed, kill the target user's existing
  // sessions so they can't keep using stale (possibly elevated) permissions.
  const roleChanged =
    updates.role !== undefined && updates.role !== existing.role;
  const activeChanged =
    updates.isActive !== undefined && updates.isActive !== existing.isActive;
  if (roleChanged || activeChanged) {
    try {
      await deleteSessionsForUser(user.id);
    } catch (err) {
      req.log.warn(
        { err, userId: user.id },
        "Failed to invalidate sessions after role/isActive change",
      );
    }
  }

  // Mirror the role/campus change onto campuses.coordinator_id. Handles all
  // the transition cases: coordinator gaining/losing the role, and a
  // coordinator switching campuses.
  try {
    await syncCampusCoordinatorLink({
      userId: user.id,
      before: { role: existing.role, campusId: existing.campusId ?? null },
      after: { role: user.role, campusId: user.campusId ?? null },
    });
  } catch (err) {
    req.log.warn(
      { err, userId: user.id },
      "Failed to sync campuses.coordinator_id after update_user",
    );
  }

  await logAudit(
    req.user.id,
    "update_user",
    "user",
    undefined,
    `${user.id} ${JSON.stringify(updates)}`,
  );
  const { passwordHash, ...safe } = user;
  res.json({ ...safe, campusName: null });
});

// Admin sets a password for any admin / coordinator account. Used both to
// bootstrap a password on an account that was created SSO-only and to reset
// a forgotten password. Students are excluded — they remain SSO-only.
const AdminSetPasswordBody = z.object({
  password: z.string().min(8, "Password must be at least 8 characters"),
});
router.post("/admin/users/:id/password", async (req, res): Promise<void> => {
  if (!req.isAuthenticated() || req.user.role !== "admin") {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  const id = String(req.params.id);
  const parsed = AdminSetPasswordBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [target] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.id, id));
  if (!target) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  if (target.role === "student") {
    res.status(400).json({ error: "Students sign in via Forms SSO only." });
    return;
  }
  const passwordHash = await bcrypt.hash(parsed.data.password, 10);
  await db
    .update(usersTable)
    .set({ passwordHash, updatedAt: new Date() })
    .where(eq(usersTable.id, id));
  await logAudit(
    req.user.id,
    "set_user_password",
    "user",
    undefined,
    `Set password for ${target.id}`,
  );
  res.json({ ok: true });
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
  const [target] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.id, id));
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
      res
        .status(400)
        .json({ error: "Cannot delete the last remaining admin." });
      return;
    }
  }
  // If this user was the registered coordinator on a campus, clear that
  // link first so the Campuses page doesn't dangle a reference to a deleted
  // user. Done before the user delete so the WHERE-by-coordinatorId works.
  if (target.role === "coordinator" && target.campusId != null) {
    try {
      await db
        .update(campusesTable)
        .set({ coordinatorId: null, updatedAt: new Date() })
        .where(
          and(
            eq(campusesTable.id, target.campusId),
            eq(campusesTable.coordinatorId, target.id),
          ),
        );
    } catch (err) {
      req.log.warn(
        { err, userId: target.id },
        "Failed to clear campuses.coordinator_id before delete_user",
      );
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
  await logAudit(
    req.user.id,
    "delete_user",
    "user",
    undefined,
    `Deleted ${target.role} ${target.email}`,
  );
  res.json({ ok: true });
});

// Full leaderboard payload with team members for Excel export.
// Always includes hidden teams. No campus / search filters.
// Returns teams pre-sorted by national rank with members sorted leader-first
// then by joined date ascending.
type LeaderboardExportTeamRow = {
  team_id: number;
  team_name: string;
  campus_name: string | null;
  campus_id: number;
  tagline: string | null;
  total_revenue: string | null;
  total_order_book: string | null;
  active_projects: string | null;
  is_featured: boolean;
  is_hidden: boolean;
  leader_id: string;
};

type LeaderboardExportMemberRow = {
  team_id: number;
  user_id: string;
  forms_user_id: string | null;
  first_name: string | null;
  last_name: string | null;
  niat_id: string | null;
  email: string;
  joined_at: Date;
};

router.get("/admin/leaderboard-export", async (req, res): Promise<void> => {
  if (!req.isAuthenticated() || req.user.role !== "admin") {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const [config] = await db
    .select({ threshold: programmeConfigTable.demoEligibilityThreshold })
    .from(programmeConfigTable)
    .limit(1);
  const threshold = config?.threshold ?? 200000;

  const teamsResult = await db.execute<LeaderboardExportTeamRow>(sql`
    SELECT
      t.id            AS team_id,
      t.name          AS team_name,
      c.name          AS campus_name,
      t.campus_id     AS campus_id,
      t.tagline       AS tagline,
      COALESCE(rev.total, 0)      AS total_revenue,
      COALESCE(ob.total,  0)      AS total_order_book,
      COALESCE(p.active_count, 0) AS active_projects,
      t.is_featured               AS is_featured,
      t.is_hidden                 AS is_hidden,
      t.leader_id                 AS leader_id
    FROM teams t
    LEFT JOIN campuses c ON c.id = t.campus_id
    LEFT JOIN (
      SELECT team_id, SUM(verified_amount) AS total
      FROM revenue_entries
      WHERE status = 'verified'
      GROUP BY team_id
    ) rev ON rev.team_id = t.id
    LEFT JOIN (
      SELECT team_id, SUM(verified_amount) AS total
      FROM order_book_entries
      WHERE status = 'verified'
      GROUP BY team_id
    ) ob ON ob.team_id = t.id
    LEFT JOIN (
      SELECT team_id, COUNT(*) AS active_count
      FROM projects
      WHERE status = 'active'
      GROUP BY team_id
    ) p ON p.team_id = t.id
    WHERE t.status = 'active'
    ORDER BY
      t.is_featured DESC,
      COALESCE(rev.total, 0) DESC,
      t.id ASC
  `);
  const teamRows = (
    teamsResult as unknown as { rows: LeaderboardExportTeamRow[] }
  ).rows;

  const teamIds = teamRows.map((r) => Number(r.team_id));

  let memberRows: LeaderboardExportMemberRow[] = [];
  if (teamIds.length > 0) {
    const membersResult = await db.execute<LeaderboardExportMemberRow>(sql`
      SELECT
        tm.team_id      AS team_id,
        u.id            AS user_id,
        u.forms_user_id AS forms_user_id,
        u.first_name    AS first_name,
        u.last_name     AS last_name,
        u.niat_id       AS niat_id,
        u.email         AS email,
        tm.joined_at    AS joined_at
      FROM team_members tm
      JOIN users u ON u.id = tm.user_id
      WHERE tm.team_id IN (${sql.join(
        teamIds.map((id) => sql`${id}`),
        sql`, `,
      )})
      ORDER BY tm.joined_at ASC
    `);
    memberRows = (
      membersResult as unknown as { rows: LeaderboardExportMemberRow[] }
    ).rows;
  }

  // Group members by team
  const membersByTeam = new Map<number, LeaderboardExportMemberRow[]>();
  for (const m of memberRows) {
    const tid = Number(m.team_id);
    const arr = membersByTeam.get(tid) ?? [];
    arr.push(m);
    membersByTeam.set(tid, arr);
  }

  const teams = teamRows.map((r, idx) => {
    const teamId = Number(r.team_id);
    const totalRevenue = Number(r.total_revenue ?? 0);
    const teamMembers = membersByTeam.get(teamId) ?? [];
    // Sort: Leader first, then by joinedAt ASC
    const sorted = [...teamMembers].sort((a, b) => {
      const aIsLeader = a.user_id === r.leader_id ? 0 : 1;
      const bIsLeader = b.user_id === r.leader_id ? 0 : 1;
      if (aIsLeader !== bIsLeader) return aIsLeader - bIsLeader;
      return new Date(a.joined_at).getTime() - new Date(b.joined_at).getTime();
    });
    return {
      teamId,
      teamName: r.team_name,
      tagline: r.tagline ?? null,
      campusId: Number(r.campus_id),
      campusName: r.campus_name ?? null,
      totalRevenue,
      totalOrderBook: Number(r.total_order_book ?? 0),
      activeProjects: Number(r.active_projects ?? 0),
      isDemoEligible: totalRevenue >= threshold,
      isHidden: r.is_hidden,
      isFeatured: r.is_featured,
      nationalRank: idx + 1,
      members: sorted.map((m) => ({
        userId: m.user_id,
        formsUserId: m.forms_user_id ?? null,
        name: `${m.first_name ?? ""} ${m.last_name ?? ""}`.trim() || m.email,
        niatId: m.niat_id ?? null,
        email: m.email,
        role:
          m.user_id === r.leader_id ? ("Leader" as const) : ("Member" as const),
        joinedAt: new Date(m.joined_at).toISOString(),
      })),
    };
  });

  res.json({
    generatedAt: new Date().toISOString(),
    threshold,
    teams,
  });
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
  const campusByName = new Map<string, (typeof allCampuses)[number]>();
  for (const c of allCampuses) campusByName.set(c.name.trim().toLowerCase(), c);

  let created = 0;
  let updated = 0;
  let failed = 0;
  const errors: {
    rowNumber: number;
    forms_user_id: string | null;
    message: string;
  }[] = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const rowNumber = i + 2; // 1 header + 1-indexed
    try {
      const formsUserId = String(row.forms_user_id || "").trim();
      const role = String(row.role || "")
        .trim()
        .toLowerCase();
      const name = String(row.name || "").trim();
      const email = String(row.email || "")
        .trim()
        .toLowerCase();
      const campusNameRaw = (row.campus_name ?? "").toString().trim();
      const niatId = (row.niat_id ?? "").toString().trim() || null;
      const batchSection = (row.batch_section ?? "").toString().trim() || null;

      if (!formsUserId) throw new Error("forms_user_id is required");
      if (!["admin", "coordinator", "student"].includes(role))
        throw new Error(
          `role must be admin | coordinator | student (got "${role}")`,
        );
      if (!name) throw new Error("name is required");
      if (!email || !/^\S+@\S+\.\S+$/.test(email))
        throw new Error(`invalid email: "${email}"`);

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
            provisionedVia: "csv_import",
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
          provisionedVia: "csv_import",
        });
        created++;
      }

      // Mirror students into the roster table.
      if (role === "student" && campusId != null) {
        const campus = allCampuses.find((c) => c.id === campusId);
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
          await db
            .insert(rosterTable)
            .values({
              studentId: formsUserId,
              fullName: name,
              email,
              campusName: campus?.name ?? "",
              campusId,
              niatId,
              batchSectionName: batchSection,
              isWhitelisted: true,
            })
            .onConflictDoNothing();
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
    const [config] = await db
      .insert(programmeConfigTable)
      .values({})
      .returning();
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
    [config] = await db
      .insert(programmeConfigTable)
      .values(parsed.data as Partial<typeof programmeConfigTable.$inferInsert>)
      .returning();
  } else {
    [config] = await db
      .update(programmeConfigTable)
      .set(parsed.data as Partial<typeof programmeConfigTable.$inferInsert>)
      .where(eq(programmeConfigTable.id, configs[0].id))
      .returning();
  }
  await logAudit(
    req.user.id,
    "update_programme_config",
    "programme_config",
    config?.id,
    JSON.stringify(parsed.data),
  );
  res.json(config);
});

// Chatbot LLM provider — runtime switch between Cloudflare Workers AI and
// Cerebras. Admin-only. ADD-only: do not touch existing routes.
const ChatbotProviderBody = z.object({
  provider: z.enum(["cloudflare", "cerebras"]),
});

router.get("/admin/chatbot-provider", async (req, res): Promise<void> => {
  if (!req.isAuthenticated() || req.user.role !== "admin") {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  const [row] = await db
    .select({ provider: programmeConfigTable.chatbotProvider })
    .from(programmeConfigTable)
    .limit(1);
  res.json({ provider: row?.provider ?? "cloudflare" });
});

router.patch("/admin/chatbot-provider", async (req, res): Promise<void> => {
  if (!req.isAuthenticated() || req.user.role !== "admin") {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  const parsed = ChatbotProviderBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const newProvider = parsed.data.provider;

  let configs = await db.select().from(programmeConfigTable).limit(1);
  const oldProvider = configs[0]?.chatbotProvider ?? "cloudflare";

  let config;
  if (configs.length === 0) {
    [config] = await db
      .insert(programmeConfigTable)
      .values({ chatbotProvider: newProvider })
      .returning();
  } else {
    [config] = await db
      .update(programmeConfigTable)
      .set({ chatbotProvider: newProvider })
      .where(eq(programmeConfigTable.id, configs[0].id))
      .returning();
  }

  invalidateChatbotProviderCache();

  await logAudit(
    req.user.id,
    "change_chatbot_provider",
    "programme_config",
    config?.id,
    JSON.stringify({ from: oldProvider, to: newProvider }),
  );

  res.json({ provider: newProvider });
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
  const result = await Promise.all(
    logs.map(async (log) => {
      const [actor] = await db
        .select()
        .from(usersTable)
        .where(eq(usersTable.id, log.actorId));
      return {
        ...log,
        actorName: actor ? `${actor.firstName} ${actor.lastName}` : "System",
      };
    }),
  );
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
  const { campusId, q, page, pageSize } = queryParams.data;
  const effectivePageSize = Math.min(Math.max(pageSize ?? 100, 1), 10000);
  const effectivePage = Math.max(page ?? 1, 1);
  const offset = (effectivePage - 1) * effectivePageSize;

  const conditions = [];
  if (campusId) {
    conditions.push(eq(rosterTable.campusId, campusId));
  }
  if (q && q.trim()) {
    const needle = `%${q.trim()}%`;
    conditions.push(
      or(
        ilike(rosterTable.fullName, needle),
        ilike(rosterTable.email, needle),
        ilike(rosterTable.studentId, needle),
        ilike(rosterTable.niatId, needle),
        ilike(rosterTable.batchSectionName, needle),
        ilike(rosterTable.campusName, needle),
      )!,
    );
  }
  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const [items, totalRows] = await Promise.all([
    db
      .select()
      .from(rosterTable)
      .where(whereClause)
      .orderBy(desc(rosterTable.createdAt))
      .limit(effectivePageSize)
      .offset(offset),
    db
      .select({ count: sql<number>`count(*)` })
      .from(rosterTable)
      .where(whereClause),
  ]);
  const total = Number(totalRows[0]?.count ?? 0);

  res.json({
    items,
    total,
    page: effectivePage,
    pageSize: effectivePageSize,
  });
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

  // Uniqueness on roster is enforced ONLY on studentId. Duplicate emails,
  // NIAT IDs, and full names are explicitly allowed (multiple students
  // legitimately share a college mailbox or have the same name).
  const [existing] = await db
    .select({ id: rosterTable.id })
    .from(rosterTable)
    .where(eq(rosterTable.studentId, data.studentId))
    .limit(1);
  if (existing) {
    res
      .status(409)
      .json({ error: "A student with this Student User ID already exists" });
    return;
  }

  let entry;
  try {
    [entry] = await db
      .insert(rosterTable)
      .values({
        ...data,
        email: data.email ?? null,
        campusId,
        isWhitelisted: data.isWhitelisted ?? true,
      })
      .returning();
  } catch (err: unknown) {
    // Race: another request inserted the same studentId between the pre-check
    // and the insert. Surface as a 409 instead of a generic 500.
    const code = (err as { code?: string } | null)?.code;
    if (code === "23505") {
      res
        .status(409)
        .json({ error: "A student with this Student User ID already exists" });
      return;
    }
    throw err;
  }

  // Mirror into users table so /admin/users shows the student. Dedup by
  // formsUserId only — never by email, since multiple students may share
  // a mailbox. If the admin didn't supply an email, synthesize a unique
  // placeholder so the (still NOT NULL) users.email column is satisfied
  // without colliding with any other row.
  if (data.studentId || data.email) {
    const nameParts = data.fullName.trim().split(/\s+/);
    const firstName = nameParts[0] ?? "";
    const lastName = nameParts.slice(1).join(" ") || "";
    const userEmail =
      data.email && data.email.trim().length > 0
        ? data.email
        : `sso_${data.studentId}_${Date.now()}@forms.local`;
    await db
      .insert(usersTable)
      .values({
        formsUserId: data.studentId || null,
        email: userEmail,
        firstName,
        lastName,
        role: "student",
        campusId,
      })
      .onConflictDoNothing({ target: usersTable.formsUserId });
  }

  await logAudit(
    req.user.id,
    "create_roster_entry",
    "roster",
    entry.id,
    `Added ${entry.fullName} (${entry.studentId})`,
  );
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

  // Look up the row BEFORE mutating it so we can resolve the linked user
  // record by the OLD identifiers below — otherwise renaming the studentId
  // or email here would orphan the mirror update.
  const [target] = await db
    .select({ studentId: rosterTable.studentId, email: rosterTable.email })
    .from(rosterTable)
    .where(eq(rosterTable.id, id))
    .limit(1);
  if (!target) {
    res.status(404).json({ error: "Roster entry not found" });
    return;
  }

  let campusId: number | null | undefined;
  if (updates.campusName) {
    const c = await resolveCampusByName(updates.campusName);
    if (!c) {
      res
        .status(400)
        .json({ error: `Unknown campus: "${updates.campusName}"` });
      return;
    }
    campusId = c.id;
  }
  const set: Record<string, unknown> = {};
  if (updates.studentId !== undefined && updates.studentId !== null)
    set.studentId = updates.studentId;
  if (updates.fullName !== undefined && updates.fullName !== null)
    set.fullName = updates.fullName;
  if (updates.email !== undefined) set.email = updates.email;
  if (updates.campusName !== undefined && updates.campusName !== null)
    set.campusName = updates.campusName;
  if (campusId !== undefined) set.campusId = campusId;
  if (updates.niatId !== undefined) set.niatId = updates.niatId;
  if (updates.batchSectionName !== undefined)
    set.batchSectionName = updates.batchSectionName;
  if (updates.isWhitelisted !== undefined && updates.isWhitelisted !== null)
    set.isWhitelisted = updates.isWhitelisted;

  // If we're changing the studentId, pre-check that no OTHER row already
  // has it. We still wrap the actual update in try/catch below so a race
  // (admin A and admin B renaming to the same id concurrently) maps to a
  // clean 409 instead of a 500.
  if (typeof set.studentId === "string" && set.studentId !== target.studentId) {
    const [clash] = await db
      .select({ id: rosterTable.id })
      .from(rosterTable)
      .where(eq(rosterTable.studentId, set.studentId as string))
      .limit(1);
    if (clash && clash.id !== id) {
      res.status(409).json({
        error: `Another roster entry already uses Student User ID "${set.studentId}".`,
      });
      return;
    }
  }

  let updated: typeof rosterTable.$inferSelect | undefined;
  try {
    [updated] = await db
      .update(rosterTable)
      .set(set)
      .where(eq(rosterTable.id, id))
      .returning();
  } catch (err: unknown) {
    // Postgres unique-violation: surface as a friendly 409 rather than a 500.
    if (
      typeof err === "object" &&
      err !== null &&
      (err as { code?: unknown }).code === "23505"
    ) {
      res.status(409).json({
        error: "Another roster entry already uses that Student User ID.",
      });
      return;
    }
    throw err;
  }
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
    if (updates.email !== undefined && updates.email !== null)
      userSet.email = updates.email;
    if (updates.studentId !== undefined && updates.studentId !== null)
      userSet.formsUserId = updates.studentId;
    if (Object.keys(userSet).length > 0) {
      await db
        .update(usersTable)
        .set(userSet)
        .where(eq(usersTable.id, linkedUserId));
    }
  }

  await logAudit(
    req.user.id,
    "update_roster_entry",
    "roster",
    updated.id,
    `Updated ${updated.fullName}`,
  );
  res.json(updated);
});

// Wipe ALL roster entries in a single transaction. Linked user accounts,
// teams, projects and progress are intentionally left intact — only the
// roster whitelist is cleared, so affected students will lose campus
// eligibility but can be re-added later via Add Student or Bulk Import.
//
// Caller must POST { confirm: "DELETE ALL ROSTER" } to defend against
// accidental clicks. There are currently no tables with a FK pointing at
// roster.id, so no `?force=true` flag is exposed (the schema makes this
// always safe to run; nothing else cascades).
router.post("/admin/roster/clear", async (req, res): Promise<void> => {
  if (!req.isAuthenticated() || req.user.role !== "admin") {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  const confirm =
    typeof req.body?.confirm === "string" ? req.body.confirm.trim() : "";
  if (confirm !== "DELETE ALL ROSTER") {
    res.status(400).json({
      error:
        'Confirmation phrase missing. Send { confirm: "DELETE ALL ROSTER" } to proceed.',
    });
    return;
  }

  // Use DELETE ... RETURNING so the count reflects the rows actually
  // removed by THIS statement, even under READ COMMITTED concurrency.
  const deletedRows = await db
    .delete(rosterTable)
    .returning({ id: rosterTable.id });
  const deleted = deletedRows.length;

  await logAudit(
    req.user.id,
    "clear_roster_all",
    "roster",
    undefined,
    `Cleared all roster entries (${deleted} deleted)`,
  );
  res.json({ ok: true, deleted });
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
  const [target] = await db
    .select()
    .from(rosterTable)
    .where(eq(rosterTable.id, id));
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

  await logAudit(
    req.user.id,
    "delete_roster_entry",
    "roster",
    id,
    `Deleted ${target.fullName} (${target.studentId})`,
  );
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
  const campusByName = new Map<string, (typeof allCampuses)[number]>();
  for (const c of allCampuses) campusByName.set(c.name.trim().toLowerCase(), c);

  // ---------------------------------------------------------------------
  // Pass 1: prepare in-memory rows. Drop blank-studentId rows up front
  // and de-duplicate within the import payload itself (first row wins),
  // mirroring the prior per-row behavior.
  // ---------------------------------------------------------------------
  type Prepared = {
    studentId: string;
    fullName: string;
    email: string | null;
    campusName: string;
    campusId: number | null;
    niatId: string | null;
    batchSectionName: string | null;
    isWhitelisted: true;
  };
  const prepared: Prepared[] = [];
  const seenInPayload = new Set<string>();
  let skipped = 0;
  for (const s of students) {
    const studentUserId = (s.studentUserId ?? "").trim();
    if (!studentUserId) {
      skipped++;
      continue;
    }
    if (seenInPayload.has(studentUserId)) {
      skipped++;
      continue;
    }
    seenInPayload.add(studentUserId);
    const campus = s.instituteName
      ? campusByName.get(s.instituteName.trim().toLowerCase())
      : undefined;
    const email = s.email?.trim() ? s.email.trim().toLowerCase() : null;
    prepared.push({
      studentId: studentUserId,
      fullName: s.studentName?.trim() || studentUserId,
      email,
      campusName: campus?.name ?? s.instituteName?.trim() ?? "",
      campusId: campus?.id ?? null,
      niatId: s.niatId?.trim() || null,
      batchSectionName: s.batchSectionName?.trim() || null,
      isWhitelisted: true,
    });
  }

  // ---------------------------------------------------------------------
  // Pass 2: in a single round-trip, find which studentIds already exist
  // in the DB and exclude them. Postgres parameter limit is 65k so we
  // chunk the IN-list into 1k-id slices. Uniqueness on roster is
  // enforced ONLY on studentId — duplicate emails / NIAT IDs / names
  // are allowed.
  // ---------------------------------------------------------------------
  const ID_LOOKUP_CHUNK = 1000;
  const existingIds = new Set<string>();
  const allIds = prepared.map((p) => p.studentId);
  for (let i = 0; i < allIds.length; i += ID_LOOKUP_CHUNK) {
    const slice = allIds.slice(i, i + ID_LOOKUP_CHUNK);
    if (slice.length === 0) continue;
    const rows = await db
      .select({ s: rosterTable.studentId })
      .from(rosterTable)
      .where(inArray(rosterTable.studentId, slice));
    for (const r of rows) existingIds.add(r.s);
  }
  const fresh = prepared.filter((p) => {
    if (existingIds.has(p.studentId)) {
      skipped++;
      return false;
    }
    return true;
  });

  // ---------------------------------------------------------------------
  // Pass 3: chunked INSERT inside a transaction. onConflictDoNothing on
  // studentId guards against any race where another admin imports the
  // same id concurrently — those rows are silently skipped.
  // ---------------------------------------------------------------------
  const INSERT_CHUNK = 250;
  let inserted = 0;
  // Track the studentIds the DB actually accepted (not the optimistic
  // `fresh` list) so the email-mirror pass below only updates rows that
  // really got imported, even under races with onConflictDoNothing.
  const insertedStudentIds = new Set<string>();
  if (fresh.length > 0) {
    await db.transaction(async (tx) => {
      for (let i = 0; i < fresh.length; i += INSERT_CHUNK) {
        const slice = fresh.slice(i, i + INSERT_CHUNK);
        const inserted_rows = await tx
          .insert(rosterTable)
          .values(slice)
          .onConflictDoNothing({ target: rosterTable.studentId })
          .returning({
            id: rosterTable.id,
            studentId: rosterTable.studentId,
          });
        inserted += inserted_rows.length;
        for (const row of inserted_rows) insertedStudentIds.add(row.studentId);
      }
    });
    // Anything that conflicted at insert time was a race — count it.
    skipped += fresh.length - inserted;
  }

  // ---------------------------------------------------------------------
  // Pass 4: mirror email onto linked user rows that match by formsUserId.
  // Bulk: load all matching users in one query, then issue a single
  // UPDATE per (email -> userIds) bucket. Multiple students may share a
  // college mailbox, so matching is keyed strictly by formsUserId.
  //
  // Restrict to rows we actually inserted (insertedStudentIds) — anything
  // dropped by onConflictDoNothing belongs to another import / admin and
  // shouldn't have its mirrored email overwritten by ours.
  // ---------------------------------------------------------------------
  const idsWithEmail = fresh.filter(
    (p) => p.email && insertedStudentIds.has(p.studentId),
  );
  if (idsWithEmail.length > 0) {
    const lookupIds = idsWithEmail.map((p) => p.studentId);
    const linkedUsers: { id: string; formsUserId: string | null }[] = [];
    for (let i = 0; i < lookupIds.length; i += ID_LOOKUP_CHUNK) {
      const slice = lookupIds.slice(i, i + ID_LOOKUP_CHUNK);
      const rows = await db
        .select({ id: usersTable.id, formsUserId: usersTable.formsUserId })
        .from(usersTable)
        .where(inArray(usersTable.formsUserId, slice));
      linkedUsers.push(...rows);
    }
    const userIdByFormsId = new Map<string, string>();
    for (const u of linkedUsers) {
      if (u.formsUserId) userIdByFormsId.set(u.formsUserId, u.id);
    }
    if (userIdByFormsId.size > 0) {
      // Group user ids by the new email value so each distinct email
      // becomes one UPDATE … WHERE id IN (…) instead of one per row.
      const idsByEmail = new Map<string, string[]>();
      for (const p of idsWithEmail) {
        const userId = userIdByFormsId.get(p.studentId);
        if (!userId || !p.email) continue;
        const bucket = idsByEmail.get(p.email);
        if (bucket) bucket.push(userId);
        else idsByEmail.set(p.email, [userId]);
      }
      for (const [email, userIds] of idsByEmail) {
        for (let i = 0; i < userIds.length; i += ID_LOOKUP_CHUNK) {
          const slice = userIds.slice(i, i + ID_LOOKUP_CHUNK);
          await db
            .update(usersTable)
            .set({ email })
            .where(inArray(usersTable.id, slice));
        }
      }
    }
  }

  await logAudit(
    req.user.id,
    "bulk_import_roster",
    "roster",
    undefined,
    `Imported ${inserted} students, skipped ${skipped}`,
  );
  res.json({ inserted, skipped, total: students.length });
});

// Access Requests (admin)
router.get("/admin/access-requests", async (req, res): Promise<void> => {
  if (!req.isAuthenticated() || req.user.role !== "admin") {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  const status = req.query.status as string | undefined;
  const search = (req.query.search as string | undefined)?.trim();
  const clauses = [];
  if (status && status !== "all") {
    clauses.push(eq(accessRequestsTable.status, status));
  }
  if (search) {
    const like = `%${search}%`;
    clauses.push(
      or(
        ilike(accessRequestsTable.fullName, like),
        ilike(accessRequestsTable.email, like),
        ilike(accessRequestsTable.niatId, like),
        ilike(accessRequestsTable.campusName, like),
      ),
    );
  }
  const requests = clauses.length
    ? await db
        .select()
        .from(accessRequestsTable)
        .where(and(...clauses))
    : await db.select().from(accessRequestsTable);
  res.json(
    requests.sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    ),
  );
});

router.patch("/admin/access-requests/:id", async (req, res): Promise<void> => {
  if (!req.isAuthenticated() || req.user.role !== "admin") {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  const params = UpdateAccessRequestParams.safeParse({
    id: Number(req.params.id),
  });
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
  await logAudit(
    req.user.id,
    `access_request_${body.data.status}`,
    "access_request",
    updated.id,
    `${body.data.status}: ${updated.email}`,
  );
  res.json(updated);
});

// --- New-User Access Request review (powers the separate /admin/new-users
// page). Approve provisions roster + user; reject revokes the whitelist.
// Additive: existing GET/PATCH above are untouched. ---

type AccessRequestTx = Parameters<Parameters<typeof db.transaction>[0]>[0];

async function provisionApprovedAccessRequest(
  tx: AccessRequestTx,
  reqRow: typeof accessRequestsTable.$inferSelect,
): Promise<void> {
  const parts = reqRow.fullName.trim().split(/\s+/);
  const firstName = parts[0] ?? "";
  const lastName = parts.slice(1).join(" ");

  // Resolve the SSO user (by stored userId, then email).
  let userRow: typeof usersTable.$inferSelect | undefined;
  if (reqRow.userId) {
    [userRow] = await tx
      .select()
      .from(usersTable)
      .where(eq(usersTable.id, reqRow.userId));
  }
  if (!userRow) {
    [userRow] = await tx
      .select()
      .from(usersTable)
      .where(eq(usersTable.email, reqRow.email));
  }

  if (userRow) {
    // Never downgrade an elevated account (admin/coordinator) that happens to
    // match by email — only promote genuine students.
    const nextRole =
      userRow.role === "admin" || userRow.role === "coordinator"
        ? userRow.role
        : "student";
    // Replace the synthetic `sso_<id>@forms.local` placeholder with the real
    // email captured on the request, so the users table stores the same real
    // address as the roster row written below. Never overwrite an already-real
    // email, and never write another synthetic value.
    const isSyntheticEmail = (e: string | null | undefined): boolean =>
      !!e && (/@forms\.local$/i.test(e) || /^sso_/i.test(e));
    const nextEmail =
      isSyntheticEmail(userRow.email) && !isSyntheticEmail(reqRow.email)
        ? reqRow.email
        : userRow.email;
    await tx
      .update(usersTable)
      .set({
        role: nextRole,
        email: nextEmail,
        campusId: reqRow.campusId ?? userRow.campusId ?? null,
        niatId: reqRow.niatId ?? userRow.niatId ?? null,
        firstName: userRow.firstName || firstName,
        lastName: userRow.lastName || lastName,
        isActive: true,
        updatedAt: new Date(),
      })
      .where(eq(usersTable.id, userRow.id));
  } else {
    [userRow] = await tx
      .insert(usersTable)
      .values({
        email: reqRow.email,
        role: "student",
        campusId: reqRow.campusId ?? null,
        niatId: reqRow.niatId ?? null,
        firstName,
        lastName,
      })
      .returning();
  }

  const studentId = userRow.formsUserId ?? userRow.id;

  // Upsert the roster row, idempotently (guard on studentId/email).
  const [existingRoster] = await tx
    .select()
    .from(rosterTable)
    .where(
      or(
        eq(rosterTable.studentId, studentId),
        eq(rosterTable.email, reqRow.email),
      ),
    );
  if (existingRoster) {
    await tx
      .update(rosterTable)
      .set({
        isWhitelisted: true,
        fullName: reqRow.fullName,
        email: reqRow.email,
        campusName: reqRow.campusName,
        campusId: reqRow.campusId ?? existingRoster.campusId ?? null,
        niatId: reqRow.niatId ?? existingRoster.niatId ?? null,
        batchSectionName:
          reqRow.sectionName ?? existingRoster.batchSectionName ?? null,
      })
      .where(eq(rosterTable.id, existingRoster.id));
  } else {
    await tx.insert(rosterTable).values({
      studentId,
      fullName: reqRow.fullName,
      email: reqRow.email,
      campusName: reqRow.campusName,
      campusId: reqRow.campusId ?? null,
      niatId: reqRow.niatId ?? null,
      batchSectionName: reqRow.sectionName ?? null,
      isWhitelisted: true,
    });
  }
}

const accessRequestCsvEscape = (v: unknown): string => {
  const s = v == null ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

// CSV export — MUST be registered before the ":id" route below so the literal
// path wins over the param route.
router.get(
  "/admin/access-requests/export.csv",
  async (req, res): Promise<void> => {
    if (!req.isAuthenticated() || req.user.role !== "admin") {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
    const rows = await db.select().from(accessRequestsTable);
    rows.sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
    const header = [
      "Full Name",
      "NIAT ID",
      "Email",
      "Campus",
      "Mobile",
      "Section",
      "Status",
      "Submitted",
      "Decided",
    ].join(",");
    const lines = rows.map((r) =>
      [
        r.fullName,
        r.niatId,
        r.email,
        r.campusName,
        r.mobileNumber,
        r.sectionName,
        r.status,
        new Date(r.createdAt).toISOString(),
        r.decidedAt ? new Date(r.decidedAt).toISOString() : "",
      ]
        .map(accessRequestCsvEscape)
        .join(","),
    );
    const csv = "\ufeff" + [header, ...lines].join("\n");
    const filename = `brave-new-users-${new Date().toISOString().slice(0, 10)}.csv`;
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.send(csv);
  },
);

router.get("/admin/access-requests/:id", async (req, res): Promise<void> => {
  if (!req.isAuthenticated() || req.user.role !== "admin") {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const [row] = await db
    .select()
    .from(accessRequestsTable)
    .where(eq(accessRequestsTable.id, id));
  if (!row) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  res.json(row);
});

router.post(
  "/admin/access-requests/:id/approve",
  async (req, res): Promise<void> => {
    if (!req.isAuthenticated() || req.user.role !== "admin") {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }
    const adminId = req.user.id;
    const result = await db.transaction(async (tx) => {
      const [reqRow] = await tx
        .select()
        .from(accessRequestsTable)
        .where(eq(accessRequestsTable.id, id));
      if (!reqRow) return null;
      await provisionApprovedAccessRequest(tx, reqRow);
      const [updated] = await tx
        .update(accessRequestsTable)
        .set({
          status: "approved",
          decidedBy: adminId,
          decidedAt: new Date(),
        })
        .where(eq(accessRequestsTable.id, id))
        .returning();
      return { reqRow, updated };
    });
    if (!result) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    await logAudit(
      adminId,
      "access_request_approved",
      "access_request",
      id,
      `approved: ${result.reqRow.email}`,
    );
    // Notify the approved student (best-effort; never blocks the response).
    try {
      const { subject, text } = renderAccessApprovedEmail({
        fullName: result.reqRow.fullName,
        niatId: result.reqRow.niatId,
        campusName: result.reqRow.campusName,
        appUrl: getAppUrl(),
      });
      await sendEmail({
        to: { email: result.reqRow.email, name: result.reqRow.fullName },
        subject,
        text,
      });
    } catch (err) {
      req.log.warn({ err }, "Failed to send access-approved email");
    }
    res.json(result.updated);
  },
);

router.post(
  "/admin/access-requests/:id/reject",
  async (req, res): Promise<void> => {
    if (!req.isAuthenticated() || req.user.role !== "admin") {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }
    const adminId = req.user.id;
    const result = await db.transaction(async (tx) => {
      const [reqRow] = await tx
        .select()
        .from(accessRequestsTable)
        .where(eq(accessRequestsTable.id, id));
      if (!reqRow) return null;
      // Re-freeze precisely: resolve the user this request belongs to and
      // un-whitelist only their roster row. roster.email is NOT unique, so a
      // blanket email update could revoke unrelated students.
      let userRow: typeof usersTable.$inferSelect | undefined;
      if (reqRow.userId) {
        [userRow] = await tx
          .select()
          .from(usersTable)
          .where(eq(usersTable.id, reqRow.userId));
      }
      if (!userRow) {
        [userRow] = await tx
          .select()
          .from(usersTable)
          .where(eq(usersTable.email, reqRow.email));
      }
      if (userRow) {
        const studentId = userRow.formsUserId ?? userRow.id;
        await tx
          .update(rosterTable)
          .set({ isWhitelisted: false })
          .where(eq(rosterTable.studentId, studentId));
      }
      const [updated] = await tx
        .update(accessRequestsTable)
        .set({
          status: "rejected",
          decidedBy: adminId,
          decidedAt: new Date(),
        })
        .where(eq(accessRequestsTable.id, id))
        .returning();
      return { reqRow, updated };
    });
    if (!result) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    await logAudit(
      adminId,
      "access_request_rejected",
      "access_request",
      id,
      `rejected: ${result.reqRow.email}`,
    );
    // Notify the student of the decision (best-effort; never blocks response).
    try {
      const { subject, text } = renderAccessRejectedEmail({
        fullName: result.reqRow.fullName,
        notes: result.reqRow.notes,
      });
      await sendEmail({
        to: { email: result.reqRow.email, name: result.reqRow.fullName },
        subject,
        text,
      });
    } catch (err) {
      req.log.warn({ err }, "Failed to send access-rejected email");
    }
    res.json(result.updated);
  },
);

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
    res.status(500).json({
      error: "Reseed failed",
      detail: err instanceof Error ? err.message : String(err),
    });
  } finally {
    reseedInFlight = false;
  }
});

// ---------------------------------------------------------------------------
// Admin self-test for transactional email (Amazon SES).
// Admin enters an email + picks a template; we render it with sample data
// and call sendEmail(). Returns 502 if delivery fails so the UI can surface
// the SES/credentials/sandbox problem.
// ---------------------------------------------------------------------------
const TestEmailBody = z.object({
  email: z
    .string()
    .trim()
    .min(1, "Email is required")
    .email("Enter a valid email"),
  template: z.enum(["revenue_verified", "revenue_rejected", "plain"]),
});

router.post("/admin/test-email", async (req, res): Promise<void> => {
  if (!req.isAuthenticated() || req.user.role !== "admin") {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const parsed = TestEmailBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { email, template } = parsed.data;
  const appUrl = getAppUrl();

  let subject: string;
  let text: string;

  if (template === "revenue_verified") {
    const rendered = renderRevenueVerifiedEmail({
      recipientName: "Test User",
      teamName: "Test Team",
      amount: 50_000,
      clientName: "Sample Client",
      projectTitle: "Test Project",
      totalVerifiedRevenue: 100_000,
      adminNotes: null,
      appUrl,
    });
    subject = `[TEST] ${rendered.subject}`;
    text = `(This is a test email triggered from the admin Config page.)\n\n${rendered.text}`;
  } else if (template === "revenue_rejected") {
    const rendered = renderRevenueRejectedEmail({
      recipientName: "Test User",
      teamName: "Test Team",
      amount: 50_000,
      clientName: "Sample Client",
      projectTitle: "Test Project",
      reason: "Sample rejection reason — BRD attachment was unclear.",
      appUrl,
    });
    subject = `[TEST] ${rendered.subject}`;
    text = `(This is a test email triggered from the admin Config page.)\n\n${rendered.text}`;
  } else {
    subject = "BRAVE — SES test email";
    text = [
      "This is a test email from the BRAVE Dashboard.",
      "",
      "If you're reading this, Amazon SES is delivering transactional",
      "email correctly from this environment.",
      "",
      `Dashboard: ${appUrl}`,
      "",
      "— BRAVE Team",
    ].join("\n");
  }

  const ok = await sendEmail({ to: { email }, subject, text });
  if (!ok) {
    res
      .status(502)
      .json({ ok: false, error: "Email failed — check SES config/logs" });
    return;
  }
  res.json({ ok: true });
});

// ---------- Membership requests (admin approval gate) ----------

// List membership requests, filtered by status. Defaults to pending. Used by the
// admin "Team Requests" page (Pending + History tabs).
router.get("/admin/membership-requests", async (req, res): Promise<void> => {
  if (!req.isAuthenticated() || req.user.role !== "admin") {
    res.status(403).json({ error: "Admin access required" });
    return;
  }
  const statusParam =
    typeof req.query.status === "string" ? req.query.status : "pending";
  const conds = [];
  if (statusParam === "pending") {
    conds.push(eq(membershipRequestsTable.status, "pending"));
    // Hide orphaned requests whose team has since been deleted. These are
    // un-actionable (approve fails with "Team no longer exists") and show up
    // as meaningless "leaving Unknown" cards. Belt-and-suspenders alongside
    // the delete-time cleanup in DELETE /teams/:id — also clears any orphans
    // created before that cleanup existed. The pending count badge is derived
    // from this list length, so filtering here fixes the count too.
    conds.push(
      sql`exists (select 1 from ${teamsTable} where ${teamsTable.id} = ${membershipRequestsTable.teamId})`,
    );
  } else if (statusParam === "approved") {
    conds.push(eq(membershipRequestsTable.status, "approved"));
  } else if (statusParam === "rejected") {
    conds.push(eq(membershipRequestsTable.status, "rejected"));
  } else if (statusParam === "history") {
    conds.push(
      inArray(membershipRequestsTable.status, ["approved", "rejected"]),
    );
  }
  // "all" → no status filter.
  const rows = await db
    .select()
    .from(membershipRequestsTable)
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(
      statusParam === "pending"
        ? desc(membershipRequestsTable.createdAt)
        : desc(membershipRequestsTable.decidedAt),
    );
  res.json(await Promise.all(rows.map(shapeMembershipRequest)));
});

// Per-student membership life-cycle timeline (admin popover on Team Requests).
router.get(
  "/admin/users/:userId/membership-history",
  async (req, res): Promise<void> => {
    if (!req.isAuthenticated() || req.user.role !== "admin") {
      res.status(403).json({ error: "Admin access required" });
      return;
    }
    const userId = req.params.userId;
    if (!userId) {
      res.status(400).json({ error: "Invalid user id" });
      return;
    }
    const timeline = await buildMembershipTimeline(userId);
    if (!timeline.user) {
      res.status(404).json({ error: "User not found" });
      return;
    }
    res.json(timeline);
  },
);

const MembershipDecisionBody = z.object({
  note: z.string().trim().max(1000).optional(),
});

// Approve a pending membership request: apply the real change (membership +
// source rows + email + notification). Re-checks invariants at approval time.
router.post(
  "/admin/membership-requests/:id/approve",
  async (req, res): Promise<void> => {
    if (!req.isAuthenticated() || req.user.role !== "admin") {
      res.status(403).json({ error: "Admin access required" });
      return;
    }
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      res.status(400).json({ error: "Invalid request id" });
      return;
    }
    const parsed = MembershipDecisionBody.safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid request body" });
      return;
    }
    // Atomically claim the pending request so two concurrent approvals can't
    // both run applyMembershipRequest (which would double-apply side effects).
    const [mr] = await db
      .update(membershipRequestsTable)
      .set({
        status: "approved",
        decidedById: req.user.id,
        decidedAt: new Date(),
        decisionNote: parsed.data.note ?? null,
      })
      .where(
        and(
          eq(membershipRequestsTable.id, id),
          eq(membershipRequestsTable.status, "pending"),
        ),
      )
      .returning();
    if (!mr) {
      const [existing] = await db
        .select({ status: membershipRequestsTable.status })
        .from(membershipRequestsTable)
        .where(eq(membershipRequestsTable.id, id));
      if (!existing) {
        res.status(404).json({ error: "Request not found" });
      } else {
        res
          .status(409)
          .json({ error: "This request has already been decided." });
      }
      return;
    }
    const result = await applyMembershipRequest(mr, req.user.id);
    if (!result.ok) {
      // Apply failed an invariant (capacity / one-team / leader rule). Release
      // the claim so an admin can retry or reject it.
      await db
        .update(membershipRequestsTable)
        .set({
          status: "pending",
          decidedById: null,
          decidedAt: null,
          decisionNote: null,
        })
        .where(eq(membershipRequestsTable.id, id));
      res.status(result.status).json({ error: result.error });
      return;
    }
    await logAudit(
      req.user.id,
      "membership_request_approved",
      "team",
      mr.teamId,
      JSON.stringify({
        requestId: mr.id,
        type: mr.type,
        targetUserId: mr.targetUserId,
      }),
    );
    res.json(await shapeMembershipRequest(mr));
  },
);

// Reject a pending membership request: no membership change, only a
// notification to the initiator (and target for add-flows).
router.post(
  "/admin/membership-requests/:id/reject",
  async (req, res): Promise<void> => {
    if (!req.isAuthenticated() || req.user.role !== "admin") {
      res.status(403).json({ error: "Admin access required" });
      return;
    }
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      res.status(400).json({ error: "Invalid request id" });
      return;
    }
    const parsed = MembershipDecisionBody.safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid request body" });
      return;
    }
    const note = parsed.data.note ?? null;
    // Atomically claim the pending request so a concurrent approve/reject can't
    // double-process it.
    const [updated] = await db
      .update(membershipRequestsTable)
      .set({
        status: "rejected",
        decidedById: req.user.id,
        decidedAt: new Date(),
        decisionNote: note,
      })
      .where(
        and(
          eq(membershipRequestsTable.id, id),
          eq(membershipRequestsTable.status, "pending"),
        ),
      )
      .returning();
    if (!updated) {
      const [existing] = await db
        .select({ status: membershipRequestsTable.status })
        .from(membershipRequestsTable)
        .where(eq(membershipRequestsTable.id, id));
      if (!existing) {
        res.status(404).json({ error: "Request not found" });
      } else {
        res
          .status(409)
          .json({ error: "This request has already been decided." });
      }
      return;
    }
    const mr = updated;
    await notifyMembershipRejected(mr, note);
    await logAudit(
      req.user.id,
      "membership_request_rejected",
      "team",
      mr.teamId,
      JSON.stringify({
        requestId: mr.id,
        type: mr.type,
        targetUserId: mr.targetUserId,
      }),
    );
    res.json(await shapeMembershipRequest(updated));
  },
);

export default router;
