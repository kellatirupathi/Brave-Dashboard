import { Router, type IRouter } from "express";
import { eq, sql } from "drizzle-orm";
import {
  db,
  demoDayApplicationsTable,
  teamsTable,
  teamMembersTable,
  revenueEntriesTable,
} from "@workspace/db";
import {
  SubmitDemoDayApplicationBody,
  UpdateDemoDayApplicationBody,
} from "@workspace/api-zod";

const router: IRouter = Router();

async function enrichApplication(app: typeof demoDayApplicationsTable.$inferSelect) {
  const [team] = await db.select().from(teamsTable).where(eq(teamsTable.id, app.teamId));
  const [revStats] = await db
    .select({ total: sql<number>`coalesce(sum(verified_amount), 0)` })
    .from(revenueEntriesTable)
    .where(sql`team_id = ${app.teamId} and status = 'verified'`);
  return {
    ...app,
    teamName: team?.name ?? "",
    totalRevenue: Number(revStats?.total ?? 0),
  };
}

router.get("/demo-day/application", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const [member] = await db.select().from(teamMembersTable).where(eq(teamMembersTable.userId, req.user.id));
  if (!member) {
    res.status(404).json({ error: "No team found" });
    return;
  }
  const [app] = await db.select().from(demoDayApplicationsTable).where(eq(demoDayApplicationsTable.teamId, member.teamId));
  if (!app) {
    res.status(404).json({ error: "No application found" });
    return;
  }
  res.json(await enrichApplication(app));
});

router.post("/demo-day/application", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const [member] = await db.select().from(teamMembersTable).where(eq(teamMembersTable.userId, req.user.id));
  if (!member) {
    res.status(404).json({ error: "No team found" });
    return;
  }
  const parsed = SubmitDemoDayApplicationBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [app] = await db
    .insert(demoDayApplicationsTable)
    .values({ ...parsed.data, teamId: member.teamId, status: "draft", submittedAt: new Date() })
    .returning();
  res.status(201).json(await enrichApplication(app));
});

router.patch("/demo-day/application", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const parsed = UpdateDemoDayApplicationBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  let teamId: number | undefined;
  if (req.user.role === "admin") {
    // Admin can update by team_id
    teamId = parsed.data.status !== undefined ? undefined : undefined;
  }
  const [member] = await db.select().from(teamMembersTable).where(eq(teamMembersTable.userId, req.user.id));
  if (!member) {
    res.status(404).json({ error: "No team found" });
    return;
  }
  const { status, timeSlot, presentationOrder, ...rest } = parsed.data;
  const updateData: Record<string, unknown> = { ...rest };
  if (req.user.role === "admin") {
    if (status) updateData.status = status;
    if (timeSlot !== undefined) updateData.timeSlot = timeSlot;
    if (presentationOrder !== undefined) updateData.presentationOrder = presentationOrder;
  }
  const [app] = await db
    .update(demoDayApplicationsTable)
    .set(updateData as Partial<typeof demoDayApplicationsTable.$inferInsert>)
    .where(eq(demoDayApplicationsTable.teamId, member.teamId))
    .returning();
  if (!app) {
    res.status(404).json({ error: "Application not found" });
    return;
  }
  res.json(await enrichApplication(app));
});

router.get("/admin/demo-day/applications", async (req, res): Promise<void> => {
  if (!req.isAuthenticated() || req.user.role !== "admin") {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  const apps = await db.select().from(demoDayApplicationsTable);
  const result = await Promise.all(apps.map(enrichApplication));
  res.json(result);
});

export default router;
