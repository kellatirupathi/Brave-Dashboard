import { Router, type IRouter } from "express";
import { eq, and, sql } from "drizzle-orm";
import {
  db,
  orderBookEntriesTable,
  revenueEntriesTable,
  projectsTable,
  teamsTable,
  campusesTable,
  teamMembersTable,
  milestonesTable,
  programmeConfigTable,
} from "@workspace/db";
import {
  ListOrderBookEntriesQueryParams,
  CreateOrderBookEntryBody,
  GetOrderBookEntryParams,
  UpdateOrderBookEntryParams,
  UpdateOrderBookEntryBody,
  SubmitOrderBookEntryParams,
  VerifyOrderBookEntryParams,
  VerifyOrderBookEntryBody,
  RejectOrderBookEntryParams,
  RejectOrderBookEntryBody,
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
} from "@workspace/api-zod";
import { logAudit } from "../lib/audit";
import { createNotification } from "../lib/notifications";

const router: IRouter = Router();

async function enrichOBEntry(entry: typeof orderBookEntriesTable.$inferSelect) {
  const [project] = await db.select().from(projectsTable).where(eq(projectsTable.id, entry.projectId));
  const [team] = await db.select().from(teamsTable).where(eq(teamsTable.id, entry.teamId));
  const [campus] = team ? await db.select().from(campusesTable).where(eq(campusesTable.id, team.campusId)) : [null];
  return {
    ...entry,
    projectTitle: project?.title ?? "",
    teamName: team?.name ?? "",
    campusName: campus?.name ?? "",
  };
}

async function enrichRevEntry(entry: typeof revenueEntriesTable.$inferSelect) {
  const [project] = await db.select().from(projectsTable).where(eq(projectsTable.id, entry.projectId));
  const [team] = await db.select().from(teamsTable).where(eq(teamsTable.id, entry.teamId));
  const [campus] = team ? await db.select().from(campusesTable).where(eq(campusesTable.id, team.campusId)) : [null];
  return {
    ...entry,
    projectTitle: project?.title ?? "",
    teamName: team?.name ?? "",
    campusName: campus?.name ?? "",
  };
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
  if (projectId) conditions.push(eq(orderBookEntriesTable.projectId, projectId));
  if (teamId) conditions.push(eq(orderBookEntriesTable.teamId, teamId));
  if (status) conditions.push(eq(orderBookEntriesTable.status, status));
  const entries = conditions.length > 0
    ? await db.select().from(orderBookEntriesTable).where(and(...conditions))
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
  const [project] = await db.select().from(projectsTable).where(eq(projectsTable.id, parsed.data.projectId));
  if (!project) {
    res.status(404).json({ error: "Project not found" });
    return;
  }
  const [entry] = await db
    .insert(orderBookEntriesTable)
    .values({ ...parsed.data, teamId: project.teamId })
    .returning();
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
  const [entry] = await db.select().from(orderBookEntriesTable).where(eq(orderBookEntriesTable.id, params.data.id));
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
  const [entry] = await db
    .update(orderBookEntriesTable)
    .set(parsed.data)
    .where(eq(orderBookEntriesTable.id, params.data.id))
    .returning();
  if (!entry) {
    res.status(404).json({ error: "Entry not found" });
    return;
  }
  res.json(await enrichOBEntry(entry));
});

router.post("/order-book-entries/:id/submit", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const params = SubmitOrderBookEntryParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [entry] = await db
    .update(orderBookEntriesTable)
    .set({ status: "submitted", submittedAt: new Date() })
    .where(eq(orderBookEntriesTable.id, params.data.id))
    .returning();
  if (!entry) {
    res.status(404).json({ error: "Entry not found" });
    return;
  }
  res.json(await enrichOBEntry(entry));
});

router.post("/order-book-entries/:id/verify", async (req, res): Promise<void> => {
  if (!req.isAuthenticated() || req.user.role !== "admin") {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  const params = VerifyOrderBookEntryParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = VerifyOrderBookEntryBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [entry] = await db
    .update(orderBookEntriesTable)
    .set({ status: "verified", verifiedAmount: parsed.data.verifiedAmount, adminNotes: parsed.data.adminNotes ?? null, verifiedAt: new Date() })
    .where(eq(orderBookEntriesTable.id, params.data.id))
    .returning();
  if (!entry) {
    res.status(404).json({ error: "Entry not found" });
    return;
  }
  // Check first order book milestone
  const [team] = await db.select().from(teamsTable).where(eq(teamsTable.id, entry.teamId));
  const [obCount] = await db
    .select({ count: sql<number>`count(*)` })
    .from(orderBookEntriesTable)
    .where(and(eq(orderBookEntriesTable.teamId, entry.teamId), sql`status = 'verified'`));
  if (Number(obCount?.count ?? 0) === 1) {
    await db.insert(milestonesTable).values({
      teamId: entry.teamId,
      type: "auto",
      title: "First Order Book Entry Verified",
      description: `First order book entry verified for ₹${parsed.data.verifiedAmount?.toLocaleString('en-IN')}`,
      date: new Date(),
    });
  }
  if (team) await createNotification(team.leaderId, "Order Book Verified", `Your order book entry of ₹${parsed.data.verifiedAmount?.toLocaleString('en-IN')} has been verified.`, "entry_verified", "/projects");
  await logAudit(req.user.id, "verify_order_book_entry", "order_book_entry", entry.id, `Verified: ₹${parsed.data.verifiedAmount}`);
  res.json(await enrichOBEntry(entry));
});

router.post("/order-book-entries/:id/reject", async (req, res): Promise<void> => {
  if (!req.isAuthenticated() || req.user.role !== "admin") {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  const params = RejectOrderBookEntryParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = RejectOrderBookEntryBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [entry] = await db
    .update(orderBookEntriesTable)
    .set({ status: "rejected", adminNotes: parsed.data.adminNotes })
    .where(eq(orderBookEntriesTable.id, params.data.id))
    .returning();
  if (!entry) {
    res.status(404).json({ error: "Entry not found" });
    return;
  }
  const [team] = await db.select().from(teamsTable).where(eq(teamsTable.id, entry.teamId));
  if (team) await createNotification(team.leaderId, "Order Book Rejected", `Your order book entry was rejected: ${parsed.data.adminNotes}`, "entry_rejected", "/projects");
  await logAudit(req.user.id, "reject_order_book_entry", "order_book_entry", entry.id, parsed.data.adminNotes);
  res.json(await enrichOBEntry(entry));
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
  const entries = conditions.length > 0
    ? await db.select().from(revenueEntriesTable).where(and(...conditions))
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
  const [project] = await db.select().from(projectsTable).where(eq(projectsTable.id, parsed.data.projectId));
  if (!project) {
    res.status(404).json({ error: "Project not found" });
    return;
  }
  const paymentDateStr = typeof parsed.data.paymentDate === "string"
    ? parsed.data.paymentDate
    : new Date(parsed.data.paymentDate as Date).toISOString().split("T")[0];
  const [entry] = await db
    .insert(revenueEntriesTable)
    .values({ ...parsed.data, paymentDate: paymentDateStr, teamId: project.teamId })
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
  const [entry] = await db.select().from(revenueEntriesTable).where(eq(revenueEntriesTable.id, params.data.id));
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
  const updateData: Record<string, unknown> = { ...parsed.data };
  if (parsed.data.paymentDate) {
    updateData.paymentDate = typeof parsed.data.paymentDate === "string"
      ? parsed.data.paymentDate
      : new Date(parsed.data.paymentDate as Date).toISOString().split("T")[0];
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
  const [entry] = await db
    .update(revenueEntriesTable)
    .set({ status: "submitted", submittedAt: new Date() })
    .where(eq(revenueEntriesTable.id, params.data.id))
    .returning();
  if (!entry) {
    res.status(404).json({ error: "Entry not found" });
    return;
  }
  res.json(await enrichRevEntry(entry));
});

router.post("/revenue-entries/:id/verify", async (req, res): Promise<void> => {
  if (!req.isAuthenticated() || req.user.role !== "admin") {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  const params = VerifyRevenueEntryParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = VerifyRevenueEntryBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [entry] = await db
    .update(revenueEntriesTable)
    .set({ status: "verified", verifiedAmount: parsed.data.verifiedAmount, adminNotes: parsed.data.adminNotes ?? null, verifiedAt: new Date() })
    .where(eq(revenueEntriesTable.id, params.data.id))
    .returning();
  if (!entry) {
    res.status(404).json({ error: "Entry not found" });
    return;
  }
  // Milestone checks
  const [team] = await db.select().from(teamsTable).where(eq(teamsTable.id, entry.teamId));
  const [revCount] = await db
    .select({ count: sql<number>`count(*)` })
    .from(revenueEntriesTable)
    .where(and(eq(revenueEntriesTable.teamId, entry.teamId), sql`status = 'verified'`));
  if (Number(revCount?.count ?? 0) === 1) {
    await db.insert(milestonesTable).values({
      teamId: entry.teamId, type: "auto", title: "First Revenue Received Verified",
      description: `First revenue entry verified for ₹${parsed.data.verifiedAmount?.toLocaleString('en-IN')}`,
      date: new Date(),
    });
  }
  // Check cumulative milestones
  const [totalRev] = await db
    .select({ total: sql<number>`coalesce(sum(verified_amount), 0)` })
    .from(revenueEntriesTable)
    .where(and(eq(revenueEntriesTable.teamId, entry.teamId), sql`status = 'verified'`));
  const total = Number(totalRev?.total ?? 0);
  const configs = await db.select().from(programmeConfigTable).limit(1);
  const threshold = configs[0]?.demoEligibilityThreshold ?? 200000;
  if (total >= 50000 && total - (parsed.data.verifiedAmount ?? 0) < 50000) {
    await db.insert(milestonesTable).values({ teamId: entry.teamId, type: "auto", title: "₹50,000 Revenue Reached", date: new Date() });
  }
  if (total >= 100000 && total - (parsed.data.verifiedAmount ?? 0) < 100000) {
    await db.insert(milestonesTable).values({ teamId: entry.teamId, type: "auto", title: "₹1,00,000 Revenue Reached", date: new Date() });
  }
  if (total >= threshold && total - (parsed.data.verifiedAmount ?? 0) < threshold) {
    await db.insert(milestonesTable).values({ teamId: entry.teamId, type: "auto", title: `Demo Day Eligible — ₹${(threshold/100000).toFixed(0)} Lakh Reached`, date: new Date() });
    if (team) await createNotification(team.leaderId, "Demo Day Eligible!", `Congratulations! Your team has crossed ₹${(threshold/100000).toFixed(0)} Lakh in verified revenue.`, "demo_eligible", "/demo-day");
  }
  if (team) await createNotification(team.leaderId, "Revenue Verified", `Revenue entry of ₹${parsed.data.verifiedAmount?.toLocaleString('en-IN')} has been verified.`, "entry_verified", "/projects");
  await logAudit(req.user.id, "verify_revenue_entry", "revenue_entry", entry.id, `Verified: ₹${parsed.data.verifiedAmount}`);
  res.json(await enrichRevEntry(entry));
});

router.post("/revenue-entries/:id/reject", async (req, res): Promise<void> => {
  if (!req.isAuthenticated() || req.user.role !== "admin") {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  const params = RejectRevenueEntryParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
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
  const [team] = await db.select().from(teamsTable).where(eq(teamsTable.id, entry.teamId));
  if (team) await createNotification(team.leaderId, "Revenue Entry Rejected", `Your revenue entry was rejected: ${parsed.data.adminNotes}`, "entry_rejected", "/projects");
  await logAudit(req.user.id, "reject_revenue_entry", "revenue_entry", entry.id, parsed.data.adminNotes);
  res.json(await enrichRevEntry(entry));
});

export default router;
