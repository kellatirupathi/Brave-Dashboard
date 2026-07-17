import { Router, type IRouter, type Request, type Response } from "express";
import { eq, and, or, sql, ilike, inArray } from "drizzle-orm";
import * as XLSX from "xlsx";
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
import { requireAdminPage } from "../lib/require-admin-page";

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
): Promise<{
  project: typeof projectsTable.$inferSelect;
  isMember: boolean;
  isStaff: boolean;
} | null> {
  const [project] = await db
    .select()
    .from(projectsTable)
    .where(eq(projectsTable.id, projectId));
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
      .where(
        and(
          eq(teamMembersTable.userId, user.id),
          eq(teamMembersTable.teamId, project.teamId),
        ),
      );
    isMember = !!member;
  }
  return { project, isMember, isStaff };
}

async function getProjectWithStats(projectId: number) {
  const [project] = await db
    .select()
    .from(projectsTable)
    .where(eq(projectsTable.id, projectId));
  if (!project) return null;
  const [team] = await db
    .select()
    .from(teamsTable)
    .where(eq(teamsTable.id, project.teamId));
  const [revStats] = await db
    .select({ total: sql<number>`coalesce(sum(verified_amount), 0)` })
    .from(revenueEntriesTable)
    .where(
      and(
        eq(revenueEntriesTable.projectId, projectId),
        sql`status = 'verified'`,
      ),
    );
  const [obStats] = await db
    .select({ total: sql<number>`coalesce(sum(verified_amount), 0)` })
    .from(orderBookEntriesTable)
    .where(
      and(
        eq(orderBookEntriesTable.projectId, projectId),
        sql`status = 'verified'`,
      ),
    );
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
  const { teamId, campusId, status, search, page, pageSize, sortBy, sortDir } =
    queryParams.data;
  const effectivePage = page && page >= 1 ? page : 1;
  const effectivePageSize =
    pageSize && pageSize >= 1 ? Math.min(pageSize, 10000) : 100;
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
    const [member] = await db
      .select()
      .from(teamMembersTable)
      .where(eq(teamMembersTable.userId, req.user.id));
    if (!member) {
      res.json({
        items: [],
        total: 0,
        page: effectivePage,
        pageSize: effectivePageSize,
      });
      return;
    }
    if (effectiveTeamId && effectiveTeamId !== member.teamId) {
      res
        .status(403)
        .json({ error: "You can only view projects for your own team." });
      return;
    }
    effectiveTeamId = member.teamId;
  }

  // Coordinators are hard-scoped to their own campus. If a campusId is
  // supplied in the query, it must match — otherwise it's silently ignored.
  let effectiveCampusId: number | undefined;
  if (isCoordinator) {
    if (req.user.campusId == null) {
      res.json({
        items: [],
        total: 0,
        page: effectivePage,
        pageSize: effectivePageSize,
      });
      return;
    }
    effectiveCampusId = req.user.campusId;
  } else if (isAdmin && campusId) {
    effectiveCampusId = campusId;
  }

  if (effectiveTeamId)
    conditions.push(eq(projectsTable.teamId, effectiveTeamId));
  if (status) conditions.push(eq(projectsTable.status, status));

  if (effectiveCampusId) {
    const teamsInCampus = await db
      .select({ id: teamsTable.id })
      .from(teamsTable)
      .where(eq(teamsTable.campusId, effectiveCampusId));
    const idsInCampus = teamsInCampus.map((t) => t.id);
    if (idsInCampus.length === 0) {
      res.json({
        items: [],
        total: 0,
        page: effectivePage,
        pageSize: effectivePageSize,
      });
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
      ...(matchingCampusIds.length > 0
        ? [inArray(teamsTable.campusId, matchingCampusIds)]
        : []),
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
    if (matchingTeamIds.length > 0)
      orParts.push(inArray(projectsTable.teamId, matchingTeamIds));
    const orFilter = or(...orParts);
    if (orFilter) conditions.push(orFilter);
  }

  const projects =
    conditions.length > 0
      ? await db
          .select()
          .from(projectsTable)
          .where(and(...conditions))
          .orderBy(projectsTable.createdAt)
      : await db.select().from(projectsTable).orderBy(projectsTable.createdAt);

  // Bulk-load the per-project aggregates (team name, verified revenue / order
  // book, and the derived revenue review status) for EVERY matching project in
  // a handful of grouped queries. This lets us sort globally across all pages
  // rather than only the current page. (Previously this was an N+1 over just the
  // page slice, which could not support cross-page sorting.)
  const projectIds = projects.map((p) => p.id);
  const teamIds = [...new Set(projects.map((p) => p.teamId))];

  const teamRows = teamIds.length
    ? await db
        .select({ id: teamsTable.id, name: teamsTable.name })
        .from(teamsTable)
        .where(inArray(teamsTable.id, teamIds))
    : [];
  const teamNameById = new Map(teamRows.map((t) => [t.id, t.name]));

  const revRows = projectIds.length
    ? await db
        .select({
          projectId: revenueEntriesTable.projectId,
          verified: sql<number>`coalesce(sum(case when status = 'verified' then coalesce(verified_amount, 0) else 0 end), 0)`,
          hasVerified: sql<boolean>`bool_or(status = 'verified')`,
          hasSubmitted: sql<boolean>`bool_or(status = 'submitted')`,
          hasRejected: sql<boolean>`bool_or(status = 'rejected')`,
        })
        .from(revenueEntriesTable)
        .where(inArray(revenueEntriesTable.projectId, projectIds))
        .groupBy(revenueEntriesTable.projectId)
    : [];
  const revById = new Map(revRows.map((r) => [r.projectId, r]));

  const obRows = projectIds.length
    ? await db
        .select({
          projectId: orderBookEntriesTable.projectId,
          verified: sql<number>`coalesce(sum(case when status = 'verified' then coalesce(verified_amount, 0) else 0 end), 0)`,
        })
        .from(orderBookEntriesTable)
        .where(inArray(orderBookEntriesTable.projectId, projectIds))
        .groupBy(orderBookEntriesTable.projectId)
    : [];
  const obVerifiedById = new Map(
    obRows.map((r) => [r.projectId, Number(r.verified)]),
  );

  // Precedence: verified > pending (submitted) > rejected > none. Draft and
  // revoked entries do not map to any of the three review states, so a project
  // with only those (or no revenue at all) reads as "none".
  const deriveRevenueStatus = (
    r:
      | { hasVerified: boolean; hasSubmitted: boolean; hasRejected: boolean }
      | undefined,
  ): "verified" | "pending" | "rejected" | "none" => {
    if (!r) return "none";
    if (r.hasVerified) return "verified";
    if (r.hasSubmitted) return "pending";
    if (r.hasRejected) return "rejected";
    return "none";
  };

  const enriched = projects.map((p) => {
    const r = revById.get(p.id);
    return {
      ...p,
      teamName: teamNameById.get(p.teamId) ?? "",
      verifiedRevenue: Number(r?.verified ?? 0),
      verifiedOrderBook: obVerifiedById.get(p.id) ?? 0,
      revenueStatus: deriveRevenueStatus(r),
    };
  });

  // Global sort. Without an explicit sortBy we keep the existing creation order
  // (projects were fetched ordered by created_at ASC).
  if (sortBy) {
    const dir = sortDir === "desc" ? -1 : 1;
    const statusRank: Record<string, number> = {
      verified: 3,
      pending: 2,
      rejected: 1,
      none: 0,
    };
    enriched.sort((a, b) => {
      let cmp = 0;
      switch (sortBy) {
        case "title":
          cmp = a.title.localeCompare(b.title);
          break;
        case "team":
          cmp = a.teamName.localeCompare(b.teamName);
          break;
        case "status":
          cmp = a.status.localeCompare(b.status);
          break;
        case "revenueStatus":
          cmp = statusRank[a.revenueStatus] - statusRank[b.revenueStatus];
          break;
        case "revenue":
          cmp = a.verifiedRevenue - b.verifiedRevenue;
          break;
        case "orderBook":
          cmp = a.verifiedOrderBook - b.verifiedOrderBook;
          break;
        case "updated":
          cmp =
            new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime();
          break;
        case "created":
          cmp =
            new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
          break;
      }
      if (cmp === 0) cmp = a.id - b.id; // stable tiebreak
      return cmp * dir;
    });
  }

  const totalCount = enriched.length;
  const pageSlice = enriched.slice(offset, offset + effectivePageSize);

  // clientCount stays a per-row lookup, but only for the visible page slice.
  const items = await Promise.all(
    pageSlice.map(async (p) => ({
      ...p,
      clientCount: await getProjectClientCount(p.id),
    })),
  );

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
    const [member] = await db
      .select()
      .from(teamMembersTable)
      .where(eq(teamMembersTable.userId, req.user.id));
    effectiveTeamId = member?.teamId;
    if (!effectiveTeamId) {
      res.status(400).json({
        error: "You must join or create a team before creating a project.",
      });
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
  const [team] = await db
    .select()
    .from(teamsTable)
    .where(eq(teamsTable.id, project.teamId));
  const toOBEntry = (e: (typeof orderBookEntries)[0]) => ({
    ...e,
    projectTitle: project.title,
    teamName: team?.name ?? "",
    campusName: "",
  });
  const toRevEntry = (e: (typeof revenueEntries)[0]) => ({
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

router.patch(
  "/projects/:id",
  requireAdminPage("/admin/projects", "edit"),
  async (req, res): Promise<void> => {
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
  },
);

router.delete(
  "/projects/:id",
  requireAdminPage("/admin/projects", "delete"),
  async (req, res): Promise<void> => {
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
            and(eq(revenueEntriesTable.projectId, projectId), blockingStatuses),
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

        await tx
          .delete(revenueEntriesTable)
          .where(eq(revenueEntriesTable.projectId, projectId));
        await tx
          .delete(orderBookEntriesTable)
          .where(eq(orderBookEntriesTable.projectId, projectId));
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
        res
          .status(403)
          .json({ error: "Only the team leader can perform this action." });
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

    await logAudit(
      userId,
      "delete_project",
      "project",
      projectId,
      projectTitle,
    );
    res.status(204).end();
  },
);

// =============================================================================
// Admin export — projects directory
//
// Two flavours, both admin-only and respect the same filters as the list:
//   GET /admin/projects/export-all.csv         — single flat CSV, all projects
//   GET /admin/projects/export-by-campus.xlsx  — multi-sheet workbook, one
//                                                sheet per campus + an
//                                                "All Projects" overview sheet
//
// Row ordering: campus name → team name → project title (alphabetical).
// Each row = one project (no empty separators between projects).
// =============================================================================

type ProjectExportRow = {
  project_id: number;
  project_title: string;
  description: string | null;
  status: string;
  team_id: number;
  team_name: string;
  campus_id: number;
  campus_name: string;
  leader_full_name: string;
  client_count: number;
  verified_revenue: number;
  verified_order_book: number;
  revenue_entry_count: number;
  order_book_entry_count: number;
  team_projects_count: number;
  created_at: Date;
  updated_at: Date;
};

const PROJECT_CSV_COLUMNS: Array<{
  key: keyof ProjectExportRow;
  header: string;
}> = [
  { key: "project_title", header: "Project Title" },
  { key: "description", header: "Description" },
  { key: "status", header: "Status" },
  { key: "team_name", header: "Team Name" },
  { key: "leader_full_name", header: "Team Leader" },
  { key: "campus_name", header: "Campus" },
  { key: "client_count", header: "Client Count" },
  { key: "verified_revenue", header: "Verified Revenue (INR)" },
  { key: "verified_order_book", header: "Verified Order Book (INR)" },
  { key: "revenue_entry_count", header: "Revenue Entries" },
  { key: "order_book_entry_count", header: "Order Book Entries" },
  { key: "team_projects_count", header: "Team Projects Count" },
  { key: "created_at", header: "Created At" },
  { key: "updated_at", header: "Updated At" },
];

async function fetchProjectExportRows(opts: {
  status?: string;
  search?: string;
  campusId?: number;
}): Promise<ProjectExportRow[]> {
  // Single SQL with aggregate sub-selects for revenue / order book stats and
  // distinct client counts. Same shape the dashboard uses (dashboard.ts).
  const statusClause =
    opts.status === "active" || opts.status === "inactive"
      ? sql`AND p.status = ${opts.status}`
      : sql``;

  const campusClause =
    opts.campusId != null && Number.isFinite(opts.campusId)
      ? sql`AND t.campus_id = ${opts.campusId}`
      : sql``;

  const search = opts.search?.trim();
  const searchPattern = search ? `%${search.toLowerCase()}%` : null;
  const searchClause = searchPattern
    ? sql`AND (
        LOWER(p.title) LIKE ${searchPattern} OR
        LOWER(COALESCE(p.description, '')) LIKE ${searchPattern} OR
        LOWER(t.name) LIKE ${searchPattern} OR
        LOWER(c.name) LIKE ${searchPattern}
      )`
    : sql``;

  const rows = await db.execute<{
    project_id: number;
    project_title: string;
    description: string | null;
    status: string;
    team_id: number;
    team_name: string;
    campus_id: number;
    campus_name: string;
    leader_first_name: string | null;
    leader_last_name: string | null;
    client_count: string;
    verified_revenue: string;
    verified_order_book: string;
    revenue_entry_count: string;
    order_book_entry_count: string;
    team_projects_count: string;
    created_at: Date | string;
    updated_at: Date | string;
  }>(sql`
    SELECT
      p.id                                                    AS project_id,
      p.title                                                 AS project_title,
      p.description                                           AS description,
      p.status                                                AS status,
      t.id                                                    AS team_id,
      t.name                                                  AS team_name,
      c.id                                                    AS campus_id,
      c.name                                                  AS campus_name,
      leader.first_name                                       AS leader_first_name,
      leader.last_name                                        AS leader_last_name,
      COALESCE(rev.client_count, 0)                           AS client_count,
      COALESCE(rev.verified_amount, 0)                        AS verified_revenue,
      COALESCE(ob.verified_amount, 0)                         AS verified_order_book,
      COALESCE(rev.entry_count, 0)                            AS revenue_entry_count,
      COALESCE(ob.entry_count, 0)                             AS order_book_entry_count,
      COALESCE(tpc.cnt, 0)                                    AS team_projects_count,
      p.created_at                                            AS created_at,
      p.updated_at                                            AS updated_at
    FROM projects p
    JOIN teams t       ON t.id = p.team_id
    JOIN campuses c    ON c.id = t.campus_id
    JOIN users leader  ON leader.id = t.leader_id
    LEFT JOIN (
      SELECT
        project_id,
        SUM(CASE WHEN status = 'verified' THEN COALESCE(verified_amount, 0) ELSE 0 END) AS verified_amount,
        COUNT(*)                                                AS entry_count,
        COUNT(DISTINCT NULLIF(TRIM(client_name), ''))           AS client_count
      FROM revenue_entries
      GROUP BY project_id
    ) rev ON rev.project_id = p.id
    LEFT JOIN (
      SELECT
        project_id,
        SUM(CASE WHEN status = 'verified' THEN COALESCE(verified_amount, 0) ELSE 0 END) AS verified_amount,
        COUNT(*)                                                AS entry_count
      FROM order_book_entries
      GROUP BY project_id
    ) ob ON ob.project_id = p.id
    LEFT JOIN (
      SELECT team_id, COUNT(*) AS cnt FROM projects GROUP BY team_id
    ) tpc ON tpc.team_id = t.id
    WHERE TRUE
      ${statusClause}
      ${campusClause}
      ${searchClause}
    ORDER BY c.name ASC, t.name ASC, p.title ASC
  `);

  return rows.rows.map(
    (r): ProjectExportRow => ({
      project_id: Number(r.project_id),
      project_title: r.project_title ?? "",
      description: r.description ?? null,
      status: r.status ?? "",
      team_id: Number(r.team_id),
      team_name: r.team_name ?? "",
      campus_id: Number(r.campus_id),
      campus_name: r.campus_name ?? "",
      leader_full_name:
        `${r.leader_first_name ?? ""} ${r.leader_last_name ?? ""}`.trim(),
      client_count: Number(r.client_count ?? 0),
      verified_revenue: Number(r.verified_revenue ?? 0),
      verified_order_book: Number(r.verified_order_book ?? 0),
      revenue_entry_count: Number(r.revenue_entry_count ?? 0),
      order_book_entry_count: Number(r.order_book_entry_count ?? 0),
      team_projects_count: Number(r.team_projects_count ?? 0),
      created_at:
        r.created_at instanceof Date ? r.created_at : new Date(r.created_at),
      updated_at:
        r.updated_at instanceof Date ? r.updated_at : new Date(r.updated_at),
    }),
  );
}

function fmtProjectCell(v: unknown): string {
  if (v == null) return "";
  if (v instanceof Date) return v.toISOString().slice(0, 16).replace("T", " ");
  return String(v);
}

function csvEscapeProject(v: string): string {
  if (v === "") return "";
  if (/[",\n\r]/.test(v)) return `"${v.replace(/"/g, '""')}"`;
  return v;
}

function projectRowToCsvLine(row: ProjectExportRow): string {
  return PROJECT_CSV_COLUMNS.map((col) =>
    csvEscapeProject(fmtProjectCell(row[col.key])),
  ).join(",");
}

function projectRowToObject(row: ProjectExportRow): Record<string, string> {
  const out: Record<string, string> = {};
  for (const col of PROJECT_CSV_COLUMNS) {
    out[col.header] = fmtProjectCell(row[col.key]);
  }
  return out;
}

function projectTimestampForFilename(): string {
  return new Date().toISOString().slice(0, 19).replace(/[T:]/g, "-");
}

// ---------- Export 1: single flat CSV ----------
router.get(
  "/admin/projects/export-all.csv",
  async (req: Request, res: Response): Promise<void> => {
    if (!req.isAuthenticated() || req.user.role !== "admin") {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
    try {
      const campusIdNum =
        typeof req.query.campusId === "string" && req.query.campusId
          ? Number(req.query.campusId)
          : undefined;
      const rows = await fetchProjectExportRows({
        status:
          typeof req.query.status === "string" ? req.query.status : undefined,
        search:
          typeof req.query.search === "string" ? req.query.search : undefined,
        campusId:
          campusIdNum != null && Number.isFinite(campusIdNum)
            ? campusIdNum
            : undefined,
      });

      const lines: string[] = [];
      lines.push(
        PROJECT_CSV_COLUMNS.map((c) => csvEscapeProject(c.header)).join(","),
      );
      for (const row of rows) {
        lines.push(projectRowToCsvLine(row));
      }

      const csv = lines.join("\r\n");
      // UTF-8 BOM so Excel auto-detects encoding.
      const buffer = Buffer.concat([
        Buffer.from("﻿", "utf8"),
        Buffer.from(csv, "utf8"),
      ]);

      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="brave-projects-${projectTimestampForFilename()}.csv"`,
      );
      res.send(buffer);
    } catch (err) {
      req.log.error({ err }, "[admin/projects/export-all.csv] failed");
      res.status(500).json({ error: "Export failed" });
    }
  },
);

// ---------- Export 2: multi-sheet xlsx (one sheet per campus) ----------
router.get(
  "/admin/projects/export-by-campus.xlsx",
  requireAdminPage("/admin/projects", "export"),
  async (req: Request, res: Response): Promise<void> => {
    if (!req.isAuthenticated() || req.user.role !== "admin") {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
    try {
      const campusIdNum =
        typeof req.query.campusId === "string" && req.query.campusId
          ? Number(req.query.campusId)
          : undefined;
      const rows = await fetchProjectExportRows({
        status:
          typeof req.query.status === "string" ? req.query.status : undefined,
        search:
          typeof req.query.search === "string" ? req.query.search : undefined,
        campusId:
          campusIdNum != null && Number.isFinite(campusIdNum)
            ? campusIdNum
            : undefined,
      });

      const byCampus = new Map<string, ProjectExportRow[]>();
      for (const row of rows) {
        const key = row.campus_name || "(no campus)";
        const bucket = byCampus.get(key) ?? [];
        bucket.push(row);
        byCampus.set(key, bucket);
      }

      const workbook = XLSX.utils.book_new();

      // Sheet 1 — overview of every project across campuses.
      {
        const sheetRows = rows.map(projectRowToObject);
        const ws = XLSX.utils.json_to_sheet(sheetRows, {
          header: PROJECT_CSV_COLUMNS.map((c) => c.header),
        });
        XLSX.utils.book_append_sheet(workbook, ws, "All Projects");
      }

      // One sheet per campus, alphabetical.
      const campusNames = [...byCampus.keys()].sort((a, b) =>
        a.localeCompare(b),
      );
      for (const campusName of campusNames) {
        const campusRows = byCampus.get(campusName)!.map(projectRowToObject);
        const ws = XLSX.utils.json_to_sheet(campusRows, {
          header: PROJECT_CSV_COLUMNS.map((c) => c.header),
        });
        // Excel sheet name: max 31 chars, no : \ / ? * [ ]
        const safeName =
          campusName.replace(/[\\/?*[\]:]/g, "-").slice(0, 31) || "Campus";
        XLSX.utils.book_append_sheet(workbook, ws, safeName);
      }

      const buffer = XLSX.write(workbook, {
        type: "buffer",
        bookType: "xlsx",
      }) as Buffer;

      res.setHeader(
        "Content-Type",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      );
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="brave-projects-by-campus-${projectTimestampForFilename()}.xlsx"`,
      );
      res.send(buffer);
    } catch (err) {
      req.log.error({ err }, "[admin/projects/export-by-campus.xlsx] failed");
      res.status(500).json({ error: "Export failed" });
    }
  },
);

export default router;
