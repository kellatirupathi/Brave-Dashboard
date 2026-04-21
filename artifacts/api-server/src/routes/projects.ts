import { Router, type IRouter } from "express";
import { eq, and, sql } from "drizzle-orm";
import {
  db,
  projectsTable,
  teamsTable,
  orderBookEntriesTable,
  revenueEntriesTable,
  teamMembersTable,
  milestonesTable,
} from "@workspace/db";
import {
  ListProjectsQueryParams,
  CreateProjectBody,
  GetProjectParams,
  UpdateProjectParams,
  UpdateProjectBody,
} from "@workspace/api-zod";
import { createNotification } from "../lib/notifications";

const router: IRouter = Router();

async function getProjectWithStats(projectId: number) {
  const [project] = await db.select().from(projectsTable).where(eq(projectsTable.id, projectId));
  if (!project) return null;
  const [team] = await db.select().from(teamsTable).where(eq(teamsTable.id, project.teamId));
  const [revStats] = await db
    .select({ total: sql<number>`coalesce(sum(verified_amount), 0)` })
    .from(revenueEntriesTable)
    .where(and(eq(revenueEntriesTable.projectId, projectId), sql`status = 'verified'`));
  const [obStats] = await db
    .select({ total: sql<number>`coalesce(sum(verified_amount), 0)` })
    .from(orderBookEntriesTable)
    .where(and(eq(orderBookEntriesTable.projectId, projectId), sql`status = 'verified'`));
  return {
    ...project,
    teamName: team?.name ?? "",
    verifiedRevenue: Number(revStats?.total ?? 0),
    verifiedOrderBook: Number(obStats?.total ?? 0),
    clientCount: 0,
  };
}

router.get("/projects", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const queryParams = ListProjectsQueryParams.safeParse(req.query);
  if (!queryParams.success) {
    res.status(400).json({ error: queryParams.error.message });
    return;
  }
  const { teamId, status } = queryParams.data;
  let effectiveTeamId = teamId;
  if (!effectiveTeamId && req.user.role === "student") {
    const [member] = await db.select().from(teamMembersTable).where(eq(teamMembersTable.userId, req.user.id));
    effectiveTeamId = member?.teamId;
  }
  let conditions: ReturnType<typeof and>[] = [];
  if (effectiveTeamId) conditions.push(eq(projectsTable.teamId, effectiveTeamId));
  if (status) conditions.push(eq(projectsTable.status, status));

  const projects = conditions.length > 0
    ? await db.select().from(projectsTable).where(and(...conditions)).orderBy(projectsTable.createdAt)
    : await db.select().from(projectsTable).orderBy(projectsTable.createdAt);

  const result = await Promise.all(projects.map(async (p) => {
    const [team] = await db.select().from(teamsTable).where(eq(teamsTable.id, p.teamId));
    const [revStats] = await db
      .select({ total: sql<number>`coalesce(sum(verified_amount), 0)` })
      .from(revenueEntriesTable)
      .where(and(eq(revenueEntriesTable.projectId, p.id), sql`status = 'verified'`));
    const [obStats] = await db
      .select({ total: sql<number>`coalesce(sum(verified_amount), 0)` })
      .from(orderBookEntriesTable)
      .where(and(eq(orderBookEntriesTable.projectId, p.id), sql`status = 'verified'`));
    return {
      ...p,
      teamName: team?.name ?? "",
      verifiedRevenue: Number(revStats?.total ?? 0),
      verifiedOrderBook: Number(obStats?.total ?? 0),
      clientCount: 0,
    };
  }));
  res.json(result);
});

router.post("/projects", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const parsed = CreateProjectBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  let effectiveTeamId = parsed.data.teamId;
  if (!effectiveTeamId) {
    const [member] = await db.select().from(teamMembersTable).where(eq(teamMembersTable.userId, req.user.id));
    effectiveTeamId = member?.teamId;
    if (!effectiveTeamId) {
      res.status(400).json({ error: "You must join or create a team before creating a project." });
      return;
    }
  } else {
    const [member] = await db
      .select()
      .from(teamMembersTable)
      .where(and(eq(teamMembersTable.userId, req.user.id), eq(teamMembersTable.teamId, effectiveTeamId)));
    if (!member) {
      res.status(403).json({ error: "You are not a member of this team." });
      return;
    }
  }
  const [project] = await db
    .insert(projectsTable)
    .values({ ...parsed.data, teamId: effectiveTeamId, createdBy: req.user.id })
    .returning();
  // Check if first project
  const [projectCount] = await db
    .select({ count: sql<number>`count(*)` })
    .from(projectsTable)
    .where(eq(projectsTable.teamId, effectiveTeamId));
  if (Number(projectCount?.count ?? 0) === 1) {
    await db.insert(milestonesTable).values({
      teamId: effectiveTeamId,
      type: "auto",
      title: "First Project Created",
      description: `First project: "${project.title}"`,
      date: new Date(),
      isPinned: false,
    });
  }
  const projectDetail = await getProjectWithStats(project.id);
  res.status(201).json(projectDetail);
});

router.get("/projects/:id", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const params = GetProjectParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const project = await getProjectWithStats(params.data.id);
  if (!project) {
    res.status(404).json({ error: "Project not found" });
    return;
  }
  const orderBookEntries = await db
    .select()
    .from(orderBookEntriesTable)
    .where(eq(orderBookEntriesTable.projectId, params.data.id));
  const revenueEntries = await db
    .select()
    .from(revenueEntriesTable)
    .where(eq(revenueEntriesTable.projectId, params.data.id));
  const [team] = await db.select().from(teamsTable).where(eq(teamsTable.id, project.teamId));
  const toOBEntry = (e: typeof orderBookEntries[0]) => ({
    ...e,
    projectTitle: project.title,
    teamName: team?.name ?? "",
    campusName: "",
  });
  const toRevEntry = (e: typeof revenueEntries[0]) => ({
    ...e,
    projectTitle: project.title,
    teamName: team?.name ?? "",
    campusName: "",
  });
  res.json({
    ...project,
    orderBookEntries: orderBookEntries.map(toOBEntry),
    revenueEntries: revenueEntries.map(toRevEntry),
  });
});

router.patch("/projects/:id", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const params = UpdateProjectParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = UpdateProjectBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [project] = await db
    .update(projectsTable)
    .set(parsed.data)
    .where(eq(projectsTable.id, params.data.id))
    .returning();
  if (!project) {
    res.status(404).json({ error: "Project not found" });
    return;
  }
  const projectDetail = await getProjectWithStats(project.id);
  res.json(projectDetail);
});

export default router;
