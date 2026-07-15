import { Router, type IRouter } from "express";
import { eq, and, sql } from "drizzle-orm";
import {
  db,
  orderBookEntriesTable,
  revenueEntriesTable,
  projectsTable,
  teamsTable,
  teamMembersTable,
  campusesTable,
  milestonesTable,
  programmeConfigTable,
  usersTable,
  uploadedFilesTable,
} from "@workspace/db";
import {
  ListOrderBookEntriesQueryParams,
  CreateOrderBookEntryBody,
  GetOrderBookEntryParams,
  UpdateOrderBookEntryParams,
  UpdateOrderBookEntryBody,
  ListRevenueEntriesQueryParams,
  CreateRevenueEntryBody,
  GetRevenueEntryParams,
  UpdateRevenueEntryParams,
  UpdateRevenueEntryBody,
  SubmitRevenueEntryParams,
  VerifyRevenueEntryParams,
  VerifyRevenueEntryBody,
  RejectRevenueEntryParams,
  RejectRevenueEntryBody,
  UnverifyRevenueEntryParams,
  UnverifyOrderBookEntryParams,
} from "@workspace/api-zod";
import { logAudit } from "../lib/audit";
import { requireAdminPage } from "../lib/require-admin-page";
import { createNotification } from "../lib/notifications";
import { requireTeamLeader } from "../lib/auth";
import { sendEmail, getAppUrl } from "../lib/email/brevo";
import { renderRevenueVerifiedEmail } from "../lib/email/templates/revenue-verified";
import { renderRevenueRejectedEmail } from "../lib/email/templates/revenue-rejected";
import {
  scheduleBrdAnalysis,
  runBrdAnalysisNow,
} from "../lib/ai/brd-scheduler";
import { getProjectSubmissionsLockError } from "./projects-lock";

const router: IRouter = Router();

// Returns true only when we can POSITIVELY confirm the uploaded BRD is not a
// PDF, using the content type / filename recorded in uploaded_files at upload
// time. If no metadata row exists we fail open (the upload picker already
// restricts BRDs to PDF client-side) so a missing best-effort metadata insert
// never blocks a legitimate entry. Used to enforce "BRD must be a PDF" on the
// server so the client-side restriction can't be bypassed.
async function brdIsConfirmedNonPdf(brdUrl: string): Promise<boolean> {
  const [meta] = await db
    .select({
      contentType: uploadedFilesTable.contentType,
      filename: uploadedFilesTable.filename,
    })
    .from(uploadedFilesTable)
    .where(eq(uploadedFilesTable.objectPath, brdUrl));
  if (!meta) return false;
  const contentType = (meta.contentType ?? "").trim().toLowerCase();
  const filename = (meta.filename ?? "").trim().toLowerCase();
  const looksPdf =
    contentType === "application/pdf" ||
    (contentType === "" && filename.endsWith(".pdf"));
  return !looksPdf;
}

const BRD_PDF_ONLY_ERROR =
  "Only PDF files are supported for the BRD. Please upload a PDF.";

async function enrichOBEntry(entry: typeof orderBookEntriesTable.$inferSelect) {
  const [project] = await db
    .select()
    .from(projectsTable)
    .where(eq(projectsTable.id, entry.projectId));
  const [team] = await db
    .select()
    .from(teamsTable)
    .where(eq(teamsTable.id, entry.teamId));
  const [campus] = team
    ? await db
        .select()
        .from(campusesTable)
        .where(eq(campusesTable.id, team.campusId))
    : [null];
  return {
    ...entry,
    projectTitle: project?.title ?? "",
    teamName: team?.name ?? "",
    campusName: campus?.name ?? "",
  };
}

async function enrichRevEntry(entry: typeof revenueEntriesTable.$inferSelect) {
  const [project] = await db
    .select()
    .from(projectsTable)
    .where(eq(projectsTable.id, entry.projectId));
  const [team] = await db
    .select()
    .from(teamsTable)
    .where(eq(teamsTable.id, entry.teamId));
  const [campus] = team
    ? await db
        .select()
        .from(campusesTable)
        .where(eq(campusesTable.id, team.campusId))
    : [null];
  return {
    ...entry,
    projectTitle: project?.title ?? "",
    teamName: team?.name ?? "",
    campusName: campus?.name ?? "",
  };
}

/**
 * Checks if the current user is allowed to review a given revenue entry.
 * - Admins only. Verify / reject / re-open (unverify) are admin-only actions.
 * - Coordinators are view-only on revenue and are rejected here.
 * - Anyone else is rejected.
 *
 * Writes the appropriate error response and returns false on failure so the
 * caller can simply `if (!ok) return;`.
 */
async function ensureCanReviewRevenueEntry(
  req: import("express").Request,
  res: import("express").Response,
  entryId: number,
): Promise<{ teamId: number } | null> {
  if (!req.isAuthenticated || !req.isAuthenticated() || !req.user) {
    res.status(401).json({ error: "Unauthorized" });
    return null;
  }
  if (req.user.role !== "admin") {
    res.status(403).json({ error: "Forbidden" });
    return null;
  }
  const [entry] = await db
    .select({ teamId: revenueEntriesTable.teamId })
    .from(revenueEntriesTable)
    .where(eq(revenueEntriesTable.id, entryId));
  if (!entry) {
    res.status(404).json({ error: "Entry not found" });
    return null;
  }
  return { teamId: entry.teamId };
}

// Order Book Entries
router.get("/order-book-entries", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const queryParams = ListOrderBookEntriesQueryParams.safeParse(req.query);
  if (!queryParams.success) {
    res.status(400).json({ error: queryParams.error.message });
    return;
  }
  const { projectId, teamId, status } = queryParams.data;
  let conditions: ReturnType<typeof and>[] = [];
  if (projectId)
    conditions.push(eq(orderBookEntriesTable.projectId, projectId));
  if (teamId) conditions.push(eq(orderBookEntriesTable.teamId, teamId));
  if (status) conditions.push(eq(orderBookEntriesTable.status, status));
  const entries =
    conditions.length > 0
      ? await db
          .select()
          .from(orderBookEntriesTable)
          .where(and(...conditions))
      : await db.select().from(orderBookEntriesTable);
  const result = await Promise.all(entries.map(enrichOBEntry));
  res.json(result);
});

router.post("/order-book-entries", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const parsed = CreateOrderBookEntryBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [project] = await db
    .select()
    .from(projectsTable)
    .where(eq(projectsTable.id, parsed.data.projectId));
  if (!project) {
    res.status(404).json({ error: "Project not found" });
    return;
  }
  // Only the team leader (or an admin override) may add order book entries.
  if (!(await requireTeamLeader(req, res, project.teamId))) {
    return;
  }
  // Admin Config "projects submissions lock" — blocks students (not admins)
  // from adding order book entries while enabled.
  const obLockMessage = await getProjectSubmissionsLockError(req);
  if (obLockMessage) {
    res.status(403).json({ error: obLockMessage });
    return;
  }
  const now = new Date();
  const [entry] = await db
    .insert(orderBookEntriesTable)
    .values({
      ...parsed.data,
      teamId: project.teamId,
      status: "verified",
      verifiedAmount: parsed.data.amount,
      submittedAt: now,
      verifiedAt: now,
    })
    .returning();
  // First-order-book milestone (kept from previous verify flow)
  const [obCount] = await db
    .select({ count: sql<number>`count(*)` })
    .from(orderBookEntriesTable)
    .where(
      and(
        eq(orderBookEntriesTable.teamId, project.teamId),
        sql`status = 'verified'`,
      ),
    );
  if (Number(obCount?.count ?? 0) === 1) {
    await db.insert(milestonesTable).values({
      teamId: project.teamId,
      type: "auto",
      title: "First Order Book Entry",
      description: `First order book entry added for ₹${parsed.data.amount.toLocaleString("en-IN")}`,
      date: now,
    });
  }
  res.status(201).json(await enrichOBEntry(entry));
});

router.get("/order-book-entries/:id", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const params = GetOrderBookEntryParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [entry] = await db
    .select()
    .from(orderBookEntriesTable)
    .where(eq(orderBookEntriesTable.id, params.data.id));
  if (!entry) {
    res.status(404).json({ error: "Entry not found" });
    return;
  }
  res.json(await enrichOBEntry(entry));
});

router.patch("/order-book-entries/:id", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const params = UpdateOrderBookEntryParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = UpdateOrderBookEntryBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [existing] = await db
    .select()
    .from(orderBookEntriesTable)
    .where(eq(orderBookEntriesTable.id, params.data.id));
  if (!existing) {
    res.status(404).json({ error: "Entry not found" });
    return;
  }
  if (!(await requireTeamLeader(req, res, existing.teamId))) {
    return;
  }
  const updateData: Record<string, unknown> = { ...parsed.data };
  if (parsed.data.amount !== undefined) {
    updateData.verifiedAmount = parsed.data.amount;
  }
  const [entry] = await db
    .update(orderBookEntriesTable)
    .set(updateData as Partial<typeof orderBookEntriesTable.$inferInsert>)
    .where(eq(orderBookEntriesTable.id, params.data.id))
    .returning();
  if (!entry) {
    res.status(404).json({ error: "Entry not found" });
    return;
  }
  await logAudit(
    req.user.id,
    "update_order_book_entry",
    "order_book_entry",
    entry.id,
    `Updated by ${req.user.role}`,
  );
  res.json(await enrichOBEntry(entry));
});

router.delete("/order-book-entries/:id", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const params = GetOrderBookEntryParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [existing] = await db
    .select()
    .from(orderBookEntriesTable)
    .where(eq(orderBookEntriesTable.id, params.data.id));
  if (!existing) {
    res.status(404).json({ error: "Entry not found" });
    return;
  }
  if (!(await requireTeamLeader(req, res, existing.teamId))) {
    return;
  }
  await db
    .delete(orderBookEntriesTable)
    .where(eq(orderBookEntriesTable.id, params.data.id));
  await logAudit(
    req.user.id,
    "delete_order_book_entry",
    "order_book_entry",
    params.data.id,
    `Deleted by ${req.user.role}`,
  );
  res.status(204).end();
});

// Revenue Entries
router.get("/revenue-entries", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const queryParams = ListRevenueEntriesQueryParams.safeParse(req.query);
  if (!queryParams.success) {
    res.status(400).json({ error: queryParams.error.message });
    return;
  }
  const { projectId, teamId, status } = queryParams.data;
  let conditions: ReturnType<typeof and>[] = [];
  if (projectId) conditions.push(eq(revenueEntriesTable.projectId, projectId));
  if (teamId) conditions.push(eq(revenueEntriesTable.teamId, teamId));
  if (status) conditions.push(eq(revenueEntriesTable.status, status));
  const entries =
    conditions.length > 0
      ? await db
          .select()
          .from(revenueEntriesTable)
          .where(and(...conditions))
      : await db.select().from(revenueEntriesTable);
  const result = await Promise.all(entries.map(enrichRevEntry));
  res.json(result);
});

router.post("/revenue-entries", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const parsed = CreateRevenueEntryBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  if (!parsed.data.brdUrl || parsed.data.brdUrl.trim() === "") {
    res
      .status(400)
      .json({ error: "BRD document is required for every revenue entry." });
    return;
  }
  if (await brdIsConfirmedNonPdf(parsed.data.brdUrl)) {
    res.status(400).json({ error: BRD_PDF_ONLY_ERROR });
    return;
  }
  const [project] = await db
    .select()
    .from(projectsTable)
    .where(eq(projectsTable.id, parsed.data.projectId));
  if (!project) {
    res.status(404).json({ error: "Project not found" });
    return;
  }
  // Only the team leader (or an admin override) may add revenue entries.
  if (!(await requireTeamLeader(req, res, project.teamId))) {
    return;
  }
  // Admin Config "projects submissions lock" — blocks students (not admins)
  // from adding revenue entries (BRD uploads) while enabled.
  const revLockMessage = await getProjectSubmissionsLockError(req);
  if (revLockMessage) {
    res.status(403).json({ error: revLockMessage });
    return;
  }
  const paymentDateStr =
    typeof parsed.data.paymentDate === "string"
      ? parsed.data.paymentDate
      : new Date(parsed.data.paymentDate as Date).toISOString().split("T")[0];
  // Block future-dated payments. Compare on YYYY-MM-DD only so a same-day
  // entry submitted late at night is still accepted.
  const todayStr = new Date().toISOString().split("T")[0];
  if (paymentDateStr > todayStr) {
    res.status(400).json({ error: "Payment date cannot be in the future." });
    return;
  }
  const [entry] = await db
    .insert(revenueEntriesTable)
    .values({
      ...parsed.data,
      paymentDate: paymentDateStr,
      teamId: project.teamId,
    })
    .returning();
  res.status(201).json(await enrichRevEntry(entry));
});

router.get("/revenue-entries/:id", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const params = GetRevenueEntryParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [entry] = await db
    .select()
    .from(revenueEntriesTable)
    .where(eq(revenueEntriesTable.id, params.data.id));
  if (!entry) {
    res.status(404).json({ error: "Entry not found" });
    return;
  }
  res.json(await enrichRevEntry(entry));
});

router.patch("/revenue-entries/:id", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const params = UpdateRevenueEntryParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = UpdateRevenueEntryBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [existingRev] = await db
    .select()
    .from(revenueEntriesTable)
    .where(eq(revenueEntriesTable.id, params.data.id));
  if (!existingRev) {
    res.status(404).json({ error: "Entry not found" });
    return;
  }
  // Only the team leader (or an admin override) may edit revenue entries.
  if (!(await requireTeamLeader(req, res, existingRev.teamId))) {
    return;
  }
  // A team leader may edit their own revenue entries in any status (draft,
  // submitted, verified, rejected) — clientName, amount, paymentDate and the
  // BRD file are all editable and re-saved. Ownership is already enforced by
  // requireTeamLeader above. Note: status is left unchanged and, for a verified
  // entry, verifiedAmount is preserved (edits never alter the admin-verified
  // amount that counts toward the leaderboard).
  if (
    parsed.data.brdUrl &&
    parsed.data.brdUrl.trim() !== "" &&
    (await brdIsConfirmedNonPdf(parsed.data.brdUrl))
  ) {
    res.status(400).json({ error: BRD_PDF_ONLY_ERROR });
    return;
  }
  const updateData: Record<string, unknown> = { ...parsed.data };
  if (parsed.data.paymentDate) {
    const paymentDateStr =
      typeof parsed.data.paymentDate === "string"
        ? parsed.data.paymentDate
        : new Date(parsed.data.paymentDate as Date).toISOString().split("T")[0];
    // Block future-dated payments on edit as well.
    const todayStr = new Date().toISOString().split("T")[0];
    if (paymentDateStr > todayStr) {
      res.status(400).json({ error: "Payment date cannot be in the future." });
      return;
    }
    updateData.paymentDate = paymentDateStr;
  }
  const [entry] = await db
    .update(revenueEntriesTable)
    .set(updateData as Partial<typeof revenueEntriesTable.$inferInsert>)
    .where(eq(revenueEntriesTable.id, params.data.id))
    .returning();
  if (!entry) {
    res.status(404).json({ error: "Entry not found" });
    return;
  }
  res.json(await enrichRevEntry(entry));
});

// Revoke a verified revenue entry. This does NOT delete the row — the entry
// stays on the project (the frontend renders it struck-through) but its amount
// stops counting toward the team's verified revenue, the leaderboard and Demo
// Day eligibility. Every revenue aggregation filters on status = 'verified',
// so moving the row to status = 'revoked' drops it out of all of those totals
// automatically. Available to the team leader (or an admin override); only a
// currently verified entry can be revoked.
router.post("/revenue-entries/:id/revoke", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const params = GetRevenueEntryParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [existing] = await db
    .select()
    .from(revenueEntriesTable)
    .where(eq(revenueEntriesTable.id, params.data.id));
  if (!existing) {
    res.status(404).json({ error: "Entry not found" });
    return;
  }
  // Only the team leader (or an admin override) may revoke revenue entries.
  if (!(await requireTeamLeader(req, res, existing.teamId))) {
    return;
  }
  // Lock the row and re-check status under the lock so two concurrent revoke
  // requests can't both succeed (the second must see "revoked" and 409).
  const result = await db.transaction(async (tx) => {
    const [locked] = await tx
      .select()
      .from(revenueEntriesTable)
      .where(eq(revenueEntriesTable.id, params.data.id))
      .for("update");
    if (!locked) return { kind: "not_found" as const };
    if (locked.status !== "verified") return { kind: "conflict" as const };
    const [updated] = await tx
      .update(revenueEntriesTable)
      .set({ status: "revoked" })
      .where(eq(revenueEntriesTable.id, params.data.id))
      .returning();
    return { kind: "ok" as const, entry: updated };
  });
  if (result.kind === "not_found") {
    res.status(404).json({ error: "Entry not found" });
    return;
  }
  if (result.kind === "conflict") {
    res.status(409).json({ error: "Only verified entries can be revoked." });
    return;
  }
  await logAudit(
    req.user.id,
    "revoke_revenue_entry",
    "revenue_entry",
    result.entry.id,
    `Revoked by ${req.user.role} (was verified ₹${
      existing.verifiedAmount ?? existing.amount
    })`,
  );
  res.json(await enrichRevEntry(result.entry));
});

router.post("/revenue-entries/:id/submit", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const params = SubmitRevenueEntryParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [existing] = await db
    .select()
    .from(revenueEntriesTable)
    .where(eq(revenueEntriesTable.id, params.data.id));
  if (!existing) {
    res.status(404).json({ error: "Entry not found" });
    return;
  }
  // Only the team leader (or an admin override) may submit revenue entries
  // for verification.
  if (!(await requireTeamLeader(req, res, existing.teamId))) {
    return;
  }
  // Admin Config "projects submissions lock" — blocks students (not admins)
  // from submitting revenue for verification while enabled.
  const submitLockMessage = await getProjectSubmissionsLockError(req);
  if (submitLockMessage) {
    res.status(403).json({ error: submitLockMessage });
    return;
  }
  if (!existing.brdUrl || existing.brdUrl.trim() === "") {
    res.status(400).json({
      error:
        "Upload a BRD document before submitting this entry for verification.",
    });
    return;
  }
  const [entry] = await db
    .update(revenueEntriesTable)
    .set({
      status: "submitted",
      submittedAt: new Date(),
      // Clear any prior AI verdict; a fresh analysis fires 5 minutes from now.
      brdScore: null,
      uniquenessScore: null,
      aiAnalysisDetail: null,
      aiAnalysedAt: null,
    })
    .where(eq(revenueEntriesTable.id, params.data.id))
    .returning();
  if (!entry) {
    res.status(404).json({ error: "Entry not found" });
    return;
  }
  // Fire the BRD AI auditor in 5 minutes (setTimeout, not cron). Never blocks
  // the response. Startup catch-up handles missed timers across redeploys.
  scheduleBrdAnalysis(entry.id);
  res.json(await enrichRevEntry(entry));
});

router.post(
  "/revenue-entries/:id/reanalyse",
  async (req, res): Promise<void> => {
    if (
      !req.isAuthenticated ||
      !req.isAuthenticated() ||
      !req.user ||
      req.user.role !== "admin"
    ) {
      res.status(403).json({ error: "Admin only" });
      return;
    }
    const idRaw = Number(req.params["id"]);
    if (!Number.isFinite(idRaw) || idRaw <= 0) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }
    const [entry] = await db
      .select()
      .from(revenueEntriesTable)
      .where(eq(revenueEntriesTable.id, idRaw));
    if (!entry) {
      res.status(404).json({ error: "Entry not found" });
      return;
    }
    if (!entry.brdUrl || entry.brdUrl.trim() === "") {
      res
        .status(400)
        .json({ error: "Entry has no BRD attached; nothing to analyse." });
      return;
    }
    // Run immediately (admin button bypasses the 5-minute delay).
    await runBrdAnalysisNow(entry.id);
    const [refreshed] = await db
      .select()
      .from(revenueEntriesTable)
      .where(eq(revenueEntriesTable.id, entry.id));
    res.json(await enrichRevEntry(refreshed ?? entry));
  },
);

router.post(
  "/revenue-entries/:id/verify",
  requireAdminPage("/admin/queue", "edit"),
  async (req, res): Promise<void> => {
    const params = VerifyRevenueEntryParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const ok = await ensureCanReviewRevenueEntry(req, res, params.data.id);
    if (!ok) return;
    const parsed = VerifyRevenueEntryBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const [entry] = await db
      .update(revenueEntriesTable)
      .set({
        status: "verified",
        verifiedAmount: parsed.data.verifiedAmount,
        adminNotes: parsed.data.adminNotes ?? null,
        verifiedAt: new Date(),
      })
      .where(eq(revenueEntriesTable.id, params.data.id))
      .returning();
    if (!entry) {
      res.status(404).json({ error: "Entry not found" });
      return;
    }
    // Milestone checks
    const [team] = await db
      .select()
      .from(teamsTable)
      .where(eq(teamsTable.id, entry.teamId));
    const [revCount] = await db
      .select({ count: sql<number>`count(*)` })
      .from(revenueEntriesTable)
      .where(
        and(
          eq(revenueEntriesTable.teamId, entry.teamId),
          sql`status = 'verified'`,
        ),
      );
    if (Number(revCount?.count ?? 0) === 1) {
      await db.insert(milestonesTable).values({
        teamId: entry.teamId,
        type: "auto",
        title: "First Revenue Received Verified",
        description: `First revenue entry verified for ₹${parsed.data.verifiedAmount?.toLocaleString("en-IN")}`,
        date: new Date(),
      });
    }
    // Check cumulative milestones
    const [totalRev] = await db
      .select({ total: sql<number>`coalesce(sum(verified_amount), 0)` })
      .from(revenueEntriesTable)
      .where(
        and(
          eq(revenueEntriesTable.teamId, entry.teamId),
          sql`status = 'verified'`,
        ),
      );
    const total = Number(totalRev?.total ?? 0);
    const configs = await db.select().from(programmeConfigTable).limit(1);
    const threshold = configs[0]?.demoEligibilityThreshold ?? 200000;
    if (total >= 50000 && total - (parsed.data.verifiedAmount ?? 0) < 50000) {
      await db.insert(milestonesTable).values({
        teamId: entry.teamId,
        type: "auto",
        title: "₹50,000 Revenue Reached",
        date: new Date(),
      });
    }
    if (total >= 100000 && total - (parsed.data.verifiedAmount ?? 0) < 100000) {
      await db.insert(milestonesTable).values({
        teamId: entry.teamId,
        type: "auto",
        title: "₹1,00,000 Revenue Reached",
        date: new Date(),
      });
    }
    if (
      total >= threshold &&
      total - (parsed.data.verifiedAmount ?? 0) < threshold
    ) {
      await db.insert(milestonesTable).values({
        teamId: entry.teamId,
        type: "auto",
        title: `Demo Day Eligible — ₹${(threshold / 100000).toFixed(0)} Lakh Reached`,
        date: new Date(),
      });
      if (team)
        await createNotification(
          team.leaderId,
          "Demo Day Eligible!",
          `Congratulations! Your team has crossed ₹${(threshold / 100000).toFixed(0)} Lakh in verified revenue.`,
          "demo_eligible",
          "/demo-day",
        );
    }
    if (team)
      await createNotification(
        team.leaderId,
        "Revenue Verified",
        `Revenue entry of ₹${parsed.data.verifiedAmount?.toLocaleString("en-IN")} has been verified.`,
        "entry_verified",
        "/projects",
      );
    // Email the WHOLE team (leader + all members) on the To: line. Failures
    // are swallowed inside sendEmail so they never block the verify response.
    if (team) {
      const [leader] = await db
        .select()
        .from(usersTable)
        .where(eq(usersTable.id, team.leaderId));
      const [project] = await db
        .select()
        .from(projectsTable)
        .where(eq(projectsTable.id, entry.projectId));
      const memberRows = await db
        .select({
          id: usersTable.id,
          email: usersTable.email,
          firstName: usersTable.firstName,
        })
        .from(teamMembersTable)
        .leftJoin(usersTable, eq(usersTable.id, teamMembersTable.userId))
        .where(eq(teamMembersTable.teamId, team.id));
      // Build recipient list (de-duplicated by email) — include leader even
      // if they happen to not be in teamMembersTable for any reason.
      const seen = new Set<string>();
      const recipients: { email: string; name?: string }[] = [];
      const addRecipient = (
        email: string | null | undefined,
        firstName: string | null | undefined,
      ) => {
        if (!email) return;
        const lower = email.toLowerCase();
        if (seen.has(lower)) return;
        seen.add(lower);
        recipients.push({ email, name: firstName ?? undefined });
      };
      addRecipient(leader?.email, leader?.firstName);
      for (const m of memberRows) addRecipient(m.email, m.firstName);
      // SES caps a single Destination at 50 ToAddresses; cap defensively so an
      // unusually large team can never silently drop the whole send.
      const cappedRecipients = recipients.slice(0, 50);

      if (cappedRecipients.length > 0) {
        const { subject, text } = renderRevenueVerifiedEmail({
          recipientName: "team",
          teamName: team.name,
          amount: parsed.data.verifiedAmount ?? 0,
          clientName: entry.clientName,
          projectTitle: project?.title ?? "",
          totalVerifiedRevenue: total,
          adminNotes: parsed.data.adminNotes ?? null,
          appUrl: getAppUrl(),
        });
        void sendEmail({ to: cappedRecipients, subject, text });
      }
    }
    await logAudit(
      req.user!.id,
      "verify_revenue_entry",
      "revenue_entry",
      entry.id,
      `Verified: ₹${parsed.data.verifiedAmount}`,
    );
    res.json(await enrichRevEntry(entry));
  },
);

router.post(
  "/revenue-entries/:id/reject",
  requireAdminPage("/admin/queue", "edit"),
  async (req, res): Promise<void> => {
    const params = RejectRevenueEntryParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const ok = await ensureCanReviewRevenueEntry(req, res, params.data.id);
    if (!ok) return;
    const parsed = RejectRevenueEntryBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const [entry] = await db
      .update(revenueEntriesTable)
      .set({ status: "rejected", adminNotes: parsed.data.adminNotes })
      .where(eq(revenueEntriesTable.id, params.data.id))
      .returning();
    if (!entry) {
      res.status(404).json({ error: "Entry not found" });
      return;
    }
    const [team] = await db
      .select()
      .from(teamsTable)
      .where(eq(teamsTable.id, entry.teamId));
    if (team)
      await createNotification(
        team.leaderId,
        "Revenue Entry Rejected",
        `Your revenue entry was rejected: ${parsed.data.adminNotes}`,
        "entry_rejected",
        "/projects",
      );
    // Email the WHOLE team (leader + all members) on the To: line. Failures
    // are swallowed inside sendEmail so they never block the reject response.
    if (team) {
      const [leader] = await db
        .select()
        .from(usersTable)
        .where(eq(usersTable.id, team.leaderId));
      const [project] = await db
        .select()
        .from(projectsTable)
        .where(eq(projectsTable.id, entry.projectId));
      const memberRows = await db
        .select({
          id: usersTable.id,
          email: usersTable.email,
          firstName: usersTable.firstName,
        })
        .from(teamMembersTable)
        .leftJoin(usersTable, eq(usersTable.id, teamMembersTable.userId))
        .where(eq(teamMembersTable.teamId, team.id));
      const seen = new Set<string>();
      const recipients: { email: string; name?: string }[] = [];
      const addRecipient = (
        email: string | null | undefined,
        firstName: string | null | undefined,
      ) => {
        if (!email) return;
        const lower = email.toLowerCase();
        if (seen.has(lower)) return;
        seen.add(lower);
        recipients.push({ email, name: firstName ?? undefined });
      };
      addRecipient(leader?.email, leader?.firstName);
      for (const m of memberRows) addRecipient(m.email, m.firstName);
      const cappedRecipients = recipients.slice(0, 50);

      if (cappedRecipients.length > 0) {
        const { subject, text } = renderRevenueRejectedEmail({
          recipientName: "team",
          teamName: team.name,
          amount: entry.amount,
          clientName: entry.clientName,
          projectTitle: project?.title ?? "",
          reason: parsed.data.adminNotes,
          appUrl: getAppUrl(),
        });
        void sendEmail({ to: cappedRecipients, subject, text });
      }
    }
    await logAudit(
      req.user!.id,
      "reject_revenue_entry",
      "revenue_entry",
      entry.id,
      parsed.data.adminNotes,
    );
    res.json(await enrichRevEntry(entry));
  },
);

router.post(
  "/revenue-entries/:id/unverify",
  requireAdminPage("/admin/queue", "edit"),
  async (req, res): Promise<void> => {
    const params = UnverifyRevenueEntryParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const ok = await ensureCanReviewRevenueEntry(req, res, params.data.id);
    if (!ok) return;

    // Run the read + transition under a row lock so concurrent unverify
    // requests cannot both succeed (only the first should win; the second
    // must see the new "submitted" state and return 409).
    const result = await db.transaction(async (tx) => {
      const [existing] = await tx
        .select()
        .from(revenueEntriesTable)
        .where(eq(revenueEntriesTable.id, params.data.id))
        .for("update");
      if (!existing) return { kind: "not_found" as const };
      if (existing.status !== "verified" && existing.status !== "rejected")
        return { kind: "conflict" as const };
      const previousVerifiedAmount = existing.verifiedAmount;
      const [updated] = await tx
        .update(revenueEntriesTable)
        .set({
          status: "submitted",
          verifiedAmount: null,
          verifiedAt: null,
          adminNotes: null,
          submittedAt: existing.submittedAt ?? new Date(),
        })
        .where(eq(revenueEntriesTable.id, params.data.id))
        .returning();
      return { kind: "ok" as const, entry: updated, previousVerifiedAmount };
    });

    if (result.kind === "not_found") {
      res.status(404).json({ error: "Entry not found" });
      return;
    }
    if (result.kind === "conflict") {
      res
        .status(409)
        .json({ error: "Only verified or rejected entries can be re-opened." });
      return;
    }
    const { entry, previousVerifiedAmount } = result;

    const [team] = await db
      .select()
      .from(teamsTable)
      .where(eq(teamsTable.id, entry.teamId));
    if (team) {
      await createNotification(
        team.leaderId,
        "Revenue Entry Re-opened",
        `Your revenue entry of ₹${entry.amount.toLocaleString("en-IN")} has been re-opened for review.`,
        "entry_unverified",
        "/projects",
      );
    }
    await logAudit(
      req.user!.id,
      "unverify_revenue_entry",
      "revenue_entry",
      entry.id,
      `Re-opened (was ${previousVerifiedAmount != null ? `verified ₹${previousVerifiedAmount}` : "rejected"}); moved back to submitted`,
    );
    res.json(await enrichRevEntry(entry));
  },
);

router.post(
  "/order-book-entries/:id/unverify",
  requireAdminPage("/admin/queue", "edit"),
  async (req, res): Promise<void> => {
    if (!req.isAuthenticated() || req.user.role !== "admin") {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
    const params = UnverifyOrderBookEntryParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }

    // Mirror the revenue unverify flow: lock the row, recheck status, and
    // transition back to "submitted" only when the entry is currently verified.
    const result = await db.transaction(async (tx) => {
      const [existing] = await tx
        .select()
        .from(orderBookEntriesTable)
        .where(eq(orderBookEntriesTable.id, params.data.id))
        .for("update");
      if (!existing) return { kind: "not_found" as const };
      if (existing.status !== "verified") return { kind: "conflict" as const };
      const previousVerifiedAmount = existing.verifiedAmount;
      const [updated] = await tx
        .update(orderBookEntriesTable)
        .set({
          status: "submitted",
          verifiedAmount: null,
          verifiedAt: null,
          adminNotes: null,
          submittedAt: existing.submittedAt ?? new Date(),
        })
        .where(eq(orderBookEntriesTable.id, params.data.id))
        .returning();
      return { kind: "ok" as const, entry: updated, previousVerifiedAmount };
    });

    if (result.kind === "not_found") {
      res.status(404).json({ error: "Entry not found" });
      return;
    }
    if (result.kind === "conflict") {
      res
        .status(409)
        .json({ error: "Only verified entries can be unverified." });
      return;
    }
    const { entry, previousVerifiedAmount } = result;

    const [team] = await db
      .select()
      .from(teamsTable)
      .where(eq(teamsTable.id, entry.teamId));
    if (team) {
      await createNotification(
        team.leaderId,
        "Order Book Entry Re-opened",
        `Your previously verified order book entry of ₹${previousVerifiedAmount?.toLocaleString("en-IN") ?? entry.amount.toLocaleString("en-IN")} is back under review.`,
        "entry_unverified",
        "/projects",
      );
    }
    await logAudit(
      req.user.id,
      "unverify_order_book_entry",
      "order_book_entry",
      entry.id,
      `Unverified (was ₹${previousVerifiedAmount ?? entry.amount}); moved back to submitted`,
    );
    res.json(await enrichOBEntry(entry));
  },
);

export default router;
