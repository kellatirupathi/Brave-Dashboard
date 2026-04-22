import { Router, type IRouter } from "express";
import { isAdminRole } from "../lib/admin-guard";
import { eq, sql } from "drizzle-orm";
import {
  db,
  campusesTable,
  usersTable,
  teamsTable,
  revenueEntriesTable,
} from "@workspace/db";
import { CreateCampusBody, UpdateCampusBody, UpdateCampusParams, GetCampusParams } from "@workspace/api-zod";
import { logAudit } from "../lib/audit";

const router: IRouter = Router();

router.get("/campuses", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const campuses = await db.select().from(campusesTable).orderBy(campusesTable.name);
  const result = await Promise.all(
    campuses.map(async (campus) => {
      const [teamStats] = await db
        .select({
          totalTeams: sql<number>`count(*)`,
          activeTeams: sql<number>`count(*) filter (where status = 'active')`,
        })
        .from(teamsTable)
        .where(eq(teamsTable.campusId, campus.id));
      const [revStats] = await db
        .select({ totalRevenue: sql<number>`coalesce(sum(verified_amount), 0)` })
        .from(revenueEntriesTable)
        .where(
          sql`team_id in (select id from teams where campus_id = ${campus.id}) and status = 'verified'`
        );
      let coordinatorName: string | null = null;
      if (campus.coordinatorId) {
        const [coord] = await db.select().from(usersTable).where(eq(usersTable.id, campus.coordinatorId));
        if (coord) coordinatorName = `${coord.firstName} ${coord.lastName}`;
      }
      return {
        ...campus,
        coordinatorName,
        totalTeams: Number(teamStats?.totalTeams ?? 0),
        activeTeams: Number(teamStats?.activeTeams ?? 0),
        totalRevenue: Number(revStats?.totalRevenue ?? 0),
      };
    })
  );
  res.json(result);
});

router.post("/campuses", async (req, res): Promise<void> => {
  if (!req.isAuthenticated() || !isAdminRole(req.user.role)) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  const parsed = CreateCampusBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [campus] = await db.insert(campusesTable).values(parsed.data).returning();
  await logAudit(req.user.id, "create_campus", "campus", campus.id, campus.name);
  res.status(201).json({ ...campus, coordinatorName: null, totalTeams: 0, activeTeams: 0, totalRevenue: 0 });
});

router.get("/campuses/:id", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const params = GetCampusParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [campus] = await db.select().from(campusesTable).where(eq(campusesTable.id, params.data.id));
  if (!campus) {
    res.status(404).json({ error: "Campus not found" });
    return;
  }
  const [teamStats] = await db
    .select({
      totalTeams: sql<number>`count(*)`,
      activeTeams: sql<number>`count(*) filter (where status = 'active')`,
    })
    .from(teamsTable)
    .where(eq(teamsTable.campusId, campus.id));
  const [revStats] = await db
    .select({ totalRevenue: sql<number>`coalesce(sum(verified_amount), 0)` })
    .from(revenueEntriesTable)
    .where(
      sql`team_id in (select id from teams where campus_id = ${campus.id}) and status = 'verified'`
    );
  let coordinatorName: string | null = null;
  if (campus.coordinatorId) {
    const [coord] = await db.select().from(usersTable).where(eq(usersTable.id, campus.coordinatorId));
    if (coord) coordinatorName = `${coord.firstName} ${coord.lastName}`;
  }
  res.json({
    ...campus,
    coordinatorName,
    totalTeams: Number(teamStats?.totalTeams ?? 0),
    activeTeams: Number(teamStats?.activeTeams ?? 0),
    totalRevenue: Number(revStats?.totalRevenue ?? 0),
  });
});

router.patch("/campuses/:id", async (req, res): Promise<void> => {
  if (!req.isAuthenticated() || !isAdminRole(req.user.role)) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  const params = UpdateCampusParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = UpdateCampusBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [campus] = await db
    .update(campusesTable)
    .set(parsed.data)
    .where(eq(campusesTable.id, params.data.id))
    .returning();
  if (!campus) {
    res.status(404).json({ error: "Campus not found" });
    return;
  }
  await logAudit(req.user.id, "update_campus", "campus", campus.id, JSON.stringify(parsed.data));
  res.json({ ...campus, coordinatorName: null, totalTeams: 0, activeTeams: 0, totalRevenue: 0 });
});

export default router;
