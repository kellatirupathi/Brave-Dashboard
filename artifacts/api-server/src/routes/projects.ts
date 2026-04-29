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
import { requireTeamLeader } from "../lib/auth";
import { getProjectClientCount } from "../lib/project-stats";

const router: IRouter = Router();

// Resolves whether the requesting user is allowed to see this project.
// - Admins: always isStaff=true.
// - Coordinators: isStaff=true ONLY if the project's team belongs to their
//   assigned campus. Coordinators with mismatched campus are treated like
//   non-staff (and will get 403 from callers).
// - Students: isStaff=false; isMember=true if they are on the team that
//   owns the project.
// Returns null if the project does not exist.
async function getProjectAuthorization(
  projectId: number,
  user: { id: string; role: string; campusId?: number | null },
): Promise<{ project: typeof projectsTable.$inferSelect; isMember: boolean; isStaff: boolean } | null> {
  const [project] = await db.select().from(projectsTable).where(eq(projectsTable.id, projectId));
  if (!project) return null;

  let isStaff = false;
  if (user.role === "admin") {
    isStaff = true;
  } else if (user.role === "coordinator") {
    if (!user.campusId) {
      isStaff = false;
    } else {
      const [team] = await db
        .select({ campusId: teamsTable.campusId })
        .from(teamsTable)
        .where(eq(teamsTable.id, project.teamId));
      isStaff = !!team && team.campusId === user.campusId;
    }
  }

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
  const clientCount = await getProjectClientCount(projectId);
  return {
    ...project,
    teamName: team?.name ?? "",
    verifiedRevenue: Number(revStats?.total ?? 0),
    verifiedOrderBook: Number(obStats?.total ?? 0),
    clientCount,
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
  const { teamId, campusId, status, search, page, pageSize } = queryParams.data;
  const effectivePage = page && page >= 1 ? page : 1;
  const effectivePageSize = pageSize && pageSize >= 1 ? Math.min(pageSize, 10000) : 100;
  const offset = (effectivePage - 1) * effectivePageSize;

  const isAdmin = req.user.role === "admin";
  const isCoordinator = req.user.role === "coordinator";
  const isStaff = isAdmin || isCoordinator;

  let conditions: ReturnType<typeof and>[] = [];
  let effectiveTeamId = teamId;

  if (!isStaff) {
    // Students/team members are scoped to their own team. Their teamId is
    // derived from membership and any teamId in the query is ignored to
    // prevent IDOR.
    const [member] = await db.select().from(teamMembersTable).where(eq(teamMembersTable.userId, req.user.id));
    if (!member) {
      res.json({ items: [], total: 0, page: effectivePage, pageSize: effectivePageSize });
      return;
    }
    if (effectiveTeamId && effectiveTeamId !== member.teamId) {
      res.status(403).json({ error: "You can only view projects for your own team." });
      return;
    }
    effectiveTeamId = member.teamId;
  }

  // Coordinators are hard-scoped to their own campus. If a campusId is
  // supplied in the query, it must match — otherwise it's silently ignored.
  let effectiveCampusId: number | undefined;
  if (isCoordinator) {
    if (req.user.campusId == null) {
      res.json({ items: [], total: 0, page: effectivePage, pageSize: effectivePageSize });
      return;
    }
    effectiveCampusId = req.user.campusId;
  } else if (isAdmin && campusId) {
    effectiveCampusId = campusId;
  }

  if (effectiveTeamId) conditions.push(eq(projectsTable.teamId, effectiveTeamId));
  if (status) conditions.push(eq(projectsTable.status, status));

  if (effectiveCampusId) {
    const teamsInCampus = await db
      .select({ id: teamsTable.id })
      .from(teamsTable)
      .where(eq(teamsTable.campusId, effectiveCampusId));
    const idsInCampus = teamsInCampus.map((t) => t.id);
    if (idsInCampus.length === 0) {
      res.json({ items: [], total: 0, page: effectivePage, pageSize: effectivePageSize });
      return;
    }
    conditions.push(inArray(projectsTable.teamId, idsInCampus));
  }

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

  const totalCount = projects.length;
  const pageSlice = projects.slice(offset, offset + effectivePageSize);

  const items = await Promise.all(pageSlice.map(async (p) => {
    const [team] = await db.select().from(teamsTable).where(eq(teamsTable.id, p.teamId));
    const [revStats] = await db
      .select({ total: sql<number>`coalesce(sum(verified_amount), 0)` })
      .from(revenueEntriesTable)
      .where(and(eq(revenueEntriesTable.projectId, p.id), sql`status = 'verified'`));
    const [obStats] = await db
      .select({ total: sql<number>`coalesce(sum(verified_amount), 0)` })
      .from(orderBookEntriesTable)
      .where(and(eq(orderBookEntriesTable.projectId, p.id), sql`status = 'verified'`));
    const clientCount = await getProjectClientCount(p.id);
    return {
      ...p,
      teamName: team?.name ?? "",
      verifiedRevenue: Number(revStats?.total ?? 0),
      verifiedOrderBook: Number(obStats?.total ?? 0),
      clientCount,
    };
  }));

  res.json({
    items,
    total: totalCount,
    page: effectivePage,
    pageSize: effectivePageSize,
  });
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
  }
  // Only the team leader (or an admin override) may create projects on a
  // team. Coordinators and regular members are blocked.
  if (!(await requireTeamLeader(req, res, effectiveTeamId))) {
    return;
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
  // Only the team leader (or an admin override) may edit the project. Without
  // this gate any team member could rename or deactivate the team's projects.
  const [existingProject] = await db
    .select()
    .from(projectsTable)
    .where(eq(projectsTable.id, params.data.id));
  if (!existingProject) {
    res.status(404).json({ error: "Project not found" });
    return;
  }
  if (!(await requireTeamLeader(req, res, existingProject.teamId))) {
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

      // Only the team leader (or an admin override) may delete a project.
      // Coordinators and regular members are blocked.
      const isAdmin = req.user.role === "admin";
      const [team] = await tx
        .select()
        .from(teamsTable)
        .where(eq(teamsTable.id, project.teamId));
      if (!team) {
        // Orphaned project (no team row). Treat as not-found rather than
        // forbidden so callers don't get a misleading 403.
        blockedReason = "team_missing";
        return null;
      }
      const isLeader = team.leaderId === userId;
      if (!isAdmin && !isLeader) {
        blockedReason = "forbidden";
        return null;
      }

      // Block deletion if reviewed financial data still exists.
      //   - Team leaders: blocked on submitted OR verified entries — they
      //     must not silently throw away pending or approved submissions.
      //     The team leader has to ask an admin to reject the entries first.
      //   - Admins: blocked only on verified entries. Submitted entries are
      //     cascaded, because the admin is the one who reviews them and
      //     unverify (verified -> submitted) is the explicit recovery path
      //     to make a project deletable. Verified entries still require an
      //     explicit unverify first, preserving the "reviewed = protected"
      //     intent for the admin's own approvals.
      // Draft and rejected entries are always cascaded.
      const blockingStatuses = isAdmin
        ? sql`status = 'verified'`
        : sql`status in ('submitted', 'verified')`;
      const [revHit] = await tx
        .select({ id: revenueEntriesTable.id })
        .from(revenueEntriesTable)
        .where(
          and(
            eq(revenueEntriesTable.projectId, projectId),
            blockingStatuses,
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
            blockingStatuses,
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
      res.status(403).json({ error: "Only the team leader can perform this action." });
      return;
    }
    if (blockedReason === "team_missing") {
      res.status(404).json({ error: "Team not found" });
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
