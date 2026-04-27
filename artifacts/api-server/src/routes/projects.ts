import { Router, type IRouter } from "express";
import { eq, and, or, sql, ilike, inArray } from "drizzle-orm";
import {
  db,
  projectsTable,
  teamsTable,
  campusesTable,
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
import { logAudit } from "../lib/audit";

const router: IRouter = Router();

// True if the user is admin/coordinator OR a member of the team that owns
// this project. Returns null if the project does not exist.
async function getProjectAuthorization(
  projectId: number,
  user: { id: string; role: string },
): Promise<{ project: typeof projectsTable.$inferSelect; isMember: boolean; isStaff: boolean } | null> {
  const [project] = await db.select().from(projectsTable).where(eq(projectsTable.id, projectId));
  if (!project) return null;
  const isStaff = user.role === "admin" || user.role === "coordinator";
  let isMember = false;
  if (!isStaff) {
    const [member] = await db
      .select()
      .from(teamMembersTable)
      .where(and(eq(teamMembersTable.userId, user.id), eq(teamMembersTable.teamId, project.teamId)));
    isMember = !!member;
  }
  return { project, isMember, isStaff };
}

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
  const { teamId, status, search } = queryParams.data;
  const isStaff = req.user.role === "admin" || req.user.role === "coordinator";
  let effectiveTeamId = teamId;
  if (!isStaff) {
    // Non-staff are scoped to their own team. Their own teamId is derived
    // from membership and any teamId in the query is ignored to prevent IDOR.
    const [member] = await db.select().from(teamMembersTable).where(eq(teamMembersTable.userId, req.user.id));
    if (!member) {
      res.json([]);
      return;
    }
    if (effectiveTeamId && effectiveTeamId !== member.teamId) {
      res.status(403).json({ error: "You can only view projects for your own team." });
      return;
    }
    effectiveTeamId = member.teamId;
  }
  let conditions: ReturnType<typeof and>[] = [];
  if (effectiveTeamId) conditions.push(eq(projectsTable.teamId, effectiveTeamId));
  if (status) conditions.push(eq(projectsTable.status, status));
  if (search) {
    const pattern = `%${search}%`;
    // Match by team name and campus name -> set of team IDs
    const matchingCampuses = await db
      .select({ id: campusesTable.id })
      .from(campusesTable)
      .where(ilike(campusesTable.name, pattern));
    const matchingCampusIds = matchingCampuses.map((c) => c.id);
    const teamMatchOr = or(
      ilike(teamsTable.name, pattern),
      ...(matchingCampusIds.length > 0 ? [inArray(teamsTable.campusId, matchingCampusIds)] : []),
    );
    let matchingTeamIds: number[] = [];
    if (teamMatchOr) {
      const matchingTeams = await db
        .select({ id: teamsTable.id })
        .from(teamsTable)
        .where(teamMatchOr);
      matchingTeamIds = matchingTeams.map((t) => t.id);
    }
    const orParts = [
      ilike(projectsTable.title, pattern),
      ilike(projectsTable.description, pattern),
    ];
    if (matchingTeamIds.length > 0) orParts.push(inArray(projectsTable.teamId, matchingTeamIds));
    const orFilter = or(...orParts);
    if (orFilter) conditions.push(orFilter);
  }

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
  const auth = await getProjectAuthorization(params.data.id, req.user);
  if (!auth) {
    res.status(404).json({ error: "Project not found" });
    return;
  }
  if (!auth.isStaff && !auth.isMember) {
    res.status(403).json({ error: "You do not have access to this project." });
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
  // Only team members (or admin/coordinator) can edit the project. Without
  // this gate any authenticated user could rename or deactivate any project.
  const auth = await getProjectAuthorization(params.data.id, req.user);
  if (!auth) {
    res.status(404).json({ error: "Project not found" });
    return;
  }
  if (!auth.isStaff && !auth.isMember) {
    res.status(403).json({ error: "Only team members can edit this project." });
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

router.delete("/projects/:id", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const params = GetProjectParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const projectId = params.data.id;
  const userId = req.user.id;

  let blockedReason: string | null = null;
  let projectTitle: string | null = null;

  try {
    projectTitle = await db.transaction(async (tx) => {
      const [project] = await tx
        .select()
        .from(projectsTable)
        .where(eq(projectsTable.id, projectId))
        .for("update");
      if (!project) return null;

      const isStaff = req.user.role === "admin" || req.user.role === "coordinator";
      let isMember = false;
      if (!isStaff) {
        const [member] = await tx
          .select()
          .from(teamMembersTable)
          .where(and(eq(teamMembersTable.userId, userId), eq(teamMembersTable.teamId, project.teamId)));
        isMember = !!member;
      }
      if (!isStaff && !isMember) {
        blockedReason = "forbidden";
        return null;
      }

      // Block deletion if any submitted/verified entries exist (everyone,
      // including admins — those entries represent reviewed financial data
      // that should be moved or rejected explicitly before tearing down the
      // project). Draft entries are cascaded.
      const [revHit] = await tx
        .select({ id: revenueEntriesTable.id })
        .from(revenueEntriesTable)
        .where(
          and(
            eq(revenueEntriesTable.projectId, projectId),
            sql`status in ('submitted', 'verified')`,
          ),
        )
        .limit(1);
      if (revHit) {
        blockedReason = "has_revenue";
        return null;
      }
      const [obHit] = await tx
        .select({ id: orderBookEntriesTable.id })
        .from(orderBookEntriesTable)
        .where(
          and(
            eq(orderBookEntriesTable.projectId, projectId),
            sql`status in ('submitted', 'verified')`,
          ),
        )
        .limit(1);
      if (obHit) {
        blockedReason = "has_orderbook";
        return null;
      }

      await tx.delete(revenueEntriesTable).where(eq(revenueEntriesTable.projectId, projectId));
      await tx.delete(orderBookEntriesTable).where(eq(orderBookEntriesTable.projectId, projectId));
      await tx.delete(projectsTable).where(eq(projectsTable.id, projectId));
      return project.title;
    });
  } catch (err) {
    res.status(500).json({
      error: "Failed to delete project",
      detail: err instanceof Error ? err.message : String(err),
    });
    return;
  }

  if (projectTitle === null) {
    if (blockedReason === "forbidden") {
      res.status(403).json({ error: "Only team members can delete this project." });
      return;
    }
    if (blockedReason === "has_revenue") {
      res.status(409).json({
        error:
          "This project has submitted or verified revenue entries. Reject or remove those entries before deleting.",
      });
      return;
    }
    if (blockedReason === "has_orderbook") {
      res.status(409).json({
        error:
          "This project has submitted or verified order book entries. Reject or remove those entries before deleting.",
      });
      return;
    }
    res.status(404).json({ error: "Project not found" });
    return;
  }

  await logAudit(userId, "delete_project", "project", projectId, projectTitle);
  res.status(204).end();
});

export default router;
