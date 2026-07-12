import { Router, type IRouter } from "express";
import { sql, eq } from "drizzle-orm";
import { db, usersTable } from "@workspace/db";

const router: IRouter = Router();

const toIso = (v: string | Date | null | undefined): string | null => {
  if (!v) return null;
  return v instanceof Date ? v.toISOString() : new Date(v).toISOString();
};

// =============================================================================
// GET /dashboard/summary  (used by Admin AND Coordinator dashboards)
//
// Previously fired ~30+ counter queries plus an N+1 loop over every active
// team (one query per team to compute "demo eligible") plus 2 queries per
// campus plus 10 actor lookups for recent activity — ~1,050 round-trips on
// production. This rewrite uses 4 parallel queries:
//   1. Counters + config in one statement (multiple scalar subqueries)
//   2. Demo-eligible team count in one aggregate
//   3. Top campuses with team + revenue stats joined in one statement
//   4. Recent audit log with actor name JOINed in one statement
// Response shape is byte-identical to the old implementation.
// =============================================================================
router.get("/dashboard/summary", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  // Match the Review Queue's 48-hour overdue cutoff.
  const overdueCutoff = new Date(Date.now() - 48 * 60 * 60 * 1000);

  // Coordinators only ever see their OWN campus. Admins see everything.
  // When the requester is a coordinator we resolve their campus and inject a
  // `t.campus_id = X` predicate into each team-derived subquery; when admin,
  // the predicate is empty SQL so the aggregates stay global (unchanged).
  let scopedCampusId: number | null = null;
  if (req.user.role === "coordinator") {
    const [me] = await db
      .select({ campusId: usersTable.campusId })
      .from(usersTable)
      .where(eq(usersTable.id, req.user.id));
    // -1 can never match a real campus → coordinator with no campus sees zeros.
    scopedCampusId = me?.campusId ?? -1;
  }
  const teamScope =
    scopedCampusId != null ? sql`AND t.campus_id = ${scopedCampusId}` : sql``;

  const countersP = db.execute<{
    threshold: number;
    total_revenue: string;
    total_pending_revenue: string;
    total_rejected_revenue: string;
    total_ob: string;
    active_teams: string;
    pending_teams: string;
    pending_teams_oldest: string | null;
    total_campuses: string;
    pending_review: string;
    pending_review_oldest: string | null;
    overdue_review: string;
    pending_demo_day: string;
    pending_demo_day_oldest: string | null;
    pending_access_req: string;
    pending_access_req_oldest: string | null;
  }>(sql`
    SELECT
      COALESCE((SELECT demo_eligibility_threshold FROM programme_config LIMIT 1), 200000) AS threshold,
      (SELECT COALESCE(SUM(re.verified_amount), 0) FROM revenue_entries re JOIN teams t ON t.id = re.team_id WHERE re.status = 'verified' ${teamScope})      AS total_revenue,
      (SELECT COALESCE(SUM(re.amount), 0) FROM revenue_entries re JOIN teams t ON t.id = re.team_id WHERE re.status = 'submitted' ${teamScope})              AS total_pending_revenue,
      (SELECT COALESCE(SUM(re.amount), 0) FROM revenue_entries re JOIN teams t ON t.id = re.team_id WHERE re.status = 'rejected' ${teamScope})               AS total_rejected_revenue,
      (SELECT COALESCE(SUM(obe.verified_amount), 0) FROM order_book_entries obe JOIN teams t ON t.id = obe.team_id WHERE obe.status = 'verified' ${teamScope})   AS total_ob,
      (SELECT COUNT(*) FROM teams t WHERE t.status = 'active' ${teamScope})                           AS active_teams,
      (SELECT COUNT(*) FROM teams t WHERE t.status = 'pending' ${teamScope})                          AS pending_teams,
      (SELECT MIN(t.created_at) FROM teams t WHERE t.status = 'pending' ${teamScope})                 AS pending_teams_oldest,
      (SELECT COUNT(*) FROM campuses)                                                                 AS total_campuses,
      (SELECT COUNT(*) FROM revenue_entries re JOIN teams t ON t.id = re.team_id WHERE re.status = 'submitted' ${teamScope})                               AS pending_review,
      (SELECT MIN(re.submitted_at) FROM revenue_entries re JOIN teams t ON t.id = re.team_id WHERE re.status = 'submitted' ${teamScope})                      AS pending_review_oldest,
      (SELECT COUNT(*) FROM revenue_entries re JOIN teams t ON t.id = re.team_id WHERE re.status = 'submitted' AND re.submitted_at < ${overdueCutoff} ${teamScope}) AS overdue_review,
      (SELECT COUNT(*) FROM demo_day_applications WHERE status = 'submitted')                         AS pending_demo_day,
      (SELECT MIN(submitted_at) FROM demo_day_applications WHERE status = 'submitted')                AS pending_demo_day_oldest,
      (SELECT COUNT(*) FROM access_requests WHERE status = 'pending')                                 AS pending_access_req,
      (SELECT MIN(created_at) FROM access_requests WHERE status = 'pending')                          AS pending_access_req_oldest
  `);

  // Demo-eligible: per-team verified-revenue sum >= threshold AND team is active.
  // Start from active teams (LEFT JOIN aggregated revenue) so that active
  // teams with no revenue_entries rows are still considered with a 0-sum —
  // matches the old `for (team of activeTeams) { sum ?? 0 }` loop exactly,
  // including the edge case where threshold is configured to 0.
  const demoEligibleP = db.execute<{ count: string }>(sql`
    SELECT COUNT(*) AS count
    FROM teams t
    LEFT JOIN (
      SELECT team_id, SUM(verified_amount) AS total
      FROM revenue_entries
      WHERE status = 'verified'
      GROUP BY team_id
    ) rev_by_team ON rev_by_team.team_id = t.id
    WHERE t.status = 'active'
      ${teamScope}
      AND COALESCE(rev_by_team.total, 0) >= COALESCE(
        (SELECT demo_eligibility_threshold FROM programme_config LIMIT 1),
        200000
      )
  `);

  // Top campuses with verified revenue + team counts, joined and grouped in one
  // statement. Ordered by revenue, top 5.
  const topCampusesP = db.execute<{
    id: number;
    name: string;
    city: string;
    state: string;
    coordinator_id: string | null;
    created_at: string;
    updated_at: string;
    total_teams: string;
    active_teams: string;
    total_revenue: string;
  }>(sql`
    SELECT
      c.id, c.name, c.city, c.state, c.coordinator_id, c.created_at, c.updated_at,
      COALESCE(team_stats.total_teams,  0) AS total_teams,
      COALESCE(team_stats.active_teams, 0) AS active_teams,
      COALESCE(rev_stats.total_revenue, 0) AS total_revenue
    FROM campuses c
    LEFT JOIN (
      SELECT t.campus_id,
             COUNT(*) AS total_teams,
             COUNT(*) FILTER (WHERE
               EXISTS (SELECT 1 FROM weekly_journals wj WHERE wj.team_id = t.id)
               OR EXISTS (SELECT 1 FROM revenue_entries re WHERE re.team_id = t.id AND re.status = 'verified')
               OR EXISTS (SELECT 1 FROM projects p WHERE p.team_id = t.id)
             ) AS active_teams
      FROM teams t
      GROUP BY t.campus_id
    ) team_stats ON team_stats.campus_id = c.id
    LEFT JOIN (
      SELECT t.campus_id, SUM(r.verified_amount) AS total_revenue
      FROM revenue_entries r
      JOIN teams t ON t.id = r.team_id
      WHERE r.status = 'verified'
      GROUP BY t.campus_id
    ) rev_stats ON rev_stats.campus_id = c.id
    ORDER BY total_revenue DESC NULLS LAST, c.id ASC
    LIMIT 5
  `);

  // Recent audit log with actor name resolved by LEFT JOIN (was 10 N+1 lookups).
  const recentActivityP = db.execute<{
    id: number;
    actor_id: string;
    action: string;
    target_type: string;
    target_id: number | null;
    details: string | null;
    created_at: string;
    actor_first_name: string | null;
    actor_last_name: string | null;
    actor_exists: boolean;
  }>(sql`
    SELECT al.id, al.actor_id, al.action, al.target_type, al.target_id,
           al.details, al.created_at,
           u.first_name             AS actor_first_name,
           u.last_name              AS actor_last_name,
           (u.id IS NOT NULL)       AS actor_exists
    FROM audit_log al
    LEFT JOIN users u ON u.id = al.actor_id
    ORDER BY al.created_at DESC
    LIMIT 10
  `);

  const [countersR, demoEligibleR, topCampusesR, recentActivityR] =
    await Promise.all([
      countersP,
      demoEligibleP,
      topCampusesP,
      recentActivityP,
    ]);

  const counters = (
    countersR as unknown as {
      rows: typeof countersR extends { rows: infer R } ? R : never;
    }
  ).rows[0];
  const demoEligibleRows = (
    demoEligibleR as unknown as { rows: { count: string }[] }
  ).rows;
  const topCampusesRows = (
    topCampusesR as unknown as {
      rows: Array<{
        id: number;
        name: string;
        city: string;
        state: string;
        coordinator_id: string | null;
        created_at: string;
        updated_at: string;
        total_teams: string;
        active_teams: string;
        total_revenue: string;
      }>;
    }
  ).rows;
  const recentActivityRows = (
    recentActivityR as unknown as {
      rows: Array<{
        id: number;
        actor_id: string;
        action: string;
        target_type: string;
        target_id: number | null;
        details: string | null;
        created_at: string;
        actor_first_name: string | null;
        actor_last_name: string | null;
        actor_exists: boolean;
      }>;
    }
  ).rows;

  res.json({
    totalVerifiedRevenue: Number(counters.total_revenue ?? 0),
    totalPendingRevenue: Number(counters.total_pending_revenue ?? 0),
    totalRejectedRevenue: Number(counters.total_rejected_revenue ?? 0),
    totalOrderBook: Number(counters.total_ob ?? 0),
    activeTeams: Number(counters.active_teams ?? 0),
    pendingTeams: Number(counters.pending_teams ?? 0),
    pendingTeamsOldestAt: toIso(counters.pending_teams_oldest),
    demoEligibleTeams: Number(demoEligibleRows[0]?.count ?? 0),
    pendingReviewCount: Number(counters.pending_review ?? 0),
    overdueReviewCount: Number(counters.overdue_review ?? 0),
    pendingReviewOldestAt: toIso(counters.pending_review_oldest),
    pendingDemoDayCount: Number(counters.pending_demo_day ?? 0),
    pendingDemoDayOldestAt: toIso(counters.pending_demo_day_oldest),
    pendingAccessRequestCount: Number(counters.pending_access_req ?? 0),
    pendingAccessRequestOldestAt: toIso(counters.pending_access_req_oldest),
    totalCampuses: Number(counters.total_campuses ?? 0),
    topCampuses: topCampusesRows.map((c) => ({
      id: Number(c.id),
      name: c.name,
      city: c.city,
      state: c.state,
      coordinatorId: c.coordinator_id,
      createdAt: toIso(c.created_at),
      updatedAt: toIso(c.updated_at),
      coordinatorName: null as string | null,
      totalTeams: Number(c.total_teams ?? 0),
      activeTeams: Number(c.active_teams ?? 0),
      totalRevenue: Number(c.total_revenue ?? 0),
    })),
    recentActivity: recentActivityRows.map((r) => ({
      id: Number(r.id),
      actorId: r.actor_id,
      action: r.action,
      targetType: r.target_type,
      targetId: r.target_id,
      details: r.details,
      createdAt: toIso(r.created_at),
      // Match prior behavior exactly: when the actor row exists we returned
      // `${firstName} ${lastName}` even if both names were null (yielding the
      // literal string "null null"); only fall back to "System" when the row
      // is missing entirely.
      actorName: r.actor_exists
        ? `${r.actor_first_name} ${r.actor_last_name}`
        : "System",
    })),
  });
});

// =============================================================================
// GET /admin/campus-leaderboard  (admin only)
//
// The dashboard's "Top Campuses" card shows only the top 5. This returns the
// FULL ranked list of every campus by verified revenue (same aggregation, no
// LIMIT) for the dedicated Campus Leaderboard page.
// =============================================================================
router.get("/admin/campus-leaderboard", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  if (req.user.role !== "admin") {
    res.status(403).json({ error: "Admin access required" });
    return;
  }

  const rowsR = await db.execute<{
    id: number;
    name: string;
    city: string;
    state: string;
    total_teams: string;
    active_teams: string;
    total_revenue: string;
  }>(sql`
    SELECT
      c.id, c.name, c.city, c.state,
      COALESCE(team_stats.total_teams,  0) AS total_teams,
      COALESCE(team_stats.active_teams, 0) AS active_teams,
      COALESCE(rev_stats.total_revenue, 0) AS total_revenue
    FROM campuses c
    LEFT JOIN (
      SELECT t.campus_id,
             COUNT(*) AS total_teams,
             COUNT(*) FILTER (WHERE
               EXISTS (SELECT 1 FROM weekly_journals wj WHERE wj.team_id = t.id)
               OR EXISTS (SELECT 1 FROM revenue_entries re WHERE re.team_id = t.id AND re.status = 'verified')
               OR EXISTS (SELECT 1 FROM projects p WHERE p.team_id = t.id)
             ) AS active_teams
      FROM teams t
      GROUP BY t.campus_id
    ) team_stats ON team_stats.campus_id = c.id
    LEFT JOIN (
      SELECT t.campus_id, SUM(r.verified_amount) AS total_revenue
      FROM revenue_entries r
      JOIN teams t ON t.id = r.team_id
      WHERE r.status = 'verified'
      GROUP BY t.campus_id
    ) rev_stats ON rev_stats.campus_id = c.id
    ORDER BY total_revenue DESC NULLS LAST, c.id ASC
  `);

  const rows = (
    rowsR as unknown as {
      rows: Array<{
        id: number;
        name: string;
        city: string;
        state: string;
        total_teams: string;
        active_teams: string;
        total_revenue: string;
      }>;
    }
  ).rows;

  res.json({
    campuses: rows.map((c, i) => ({
      rank: i + 1,
      id: Number(c.id),
      name: c.name,
      city: c.city,
      state: c.state,
      totalTeams: Number(c.total_teams ?? 0),
      activeTeams: Number(c.active_teams ?? 0),
      totalRevenue: Number(c.total_revenue ?? 0),
    })),
  });
});

// =============================================================================
// GET /dashboard/team-summary  (used by Student dashboard)
//
// Previously ~17 strictly-sequential queries (team membership, team, campus,
// config, revenue, order book, project count, pending submissions, milestones,
// announcements, member count, plus an N+1 over announcement authors).
// This rewrite is:
//   1. One JOIN query that resolves membership + team + campus + config +
//      member count in a single round-trip. Returns null-team response if the
//      user is not on a team.
//   2. Three queries run in parallel: team stats (revenue + order book +
//      active projects + pending submissions in one statement), milestones,
//      and announcements with author name JOINed.
// Response shape is byte-identical to the old implementation.
// =============================================================================
router.get("/dashboard/team-summary", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const userId = req.user.id;

  const teamCtxResult = await db.execute<{
    team_id: number;
    team_name: string;
    tagline: string | null;
    team_status: string;
    photo_url: string | null;
    invite_code: string | null;
    rejection_reason: string | null;
    coordinator_comment: string | null;
    is_featured: boolean;
    is_hidden: boolean;
    campus_id: number;
    leader_id: string | null;
    created_at: string;
    updated_at: string;
    campus_name: string | null;
    threshold: number;
    member_count: string;
  }>(sql`
    SELECT
      t.id                  AS team_id,
      t.name                AS team_name,
      t.tagline             AS tagline,
      t.status              AS team_status,
      t.photo_url           AS photo_url,
      t.invite_code         AS invite_code,
      t.rejection_reason    AS rejection_reason,
      t.coordinator_comment AS coordinator_comment,
      t.is_featured         AS is_featured,
      t.is_hidden           AS is_hidden,
      t.campus_id           AS campus_id,
      t.leader_id           AS leader_id,
      t.created_at          AS created_at,
      t.updated_at          AS updated_at,
      c.name                AS campus_name,
      COALESCE(
        (SELECT demo_eligibility_threshold FROM programme_config LIMIT 1),
        200000
      )                    AS threshold,
      (SELECT COUNT(*) FROM team_members WHERE team_id = t.id) AS member_count
    FROM team_members tm
    JOIN teams t      ON t.id = tm.team_id
    LEFT JOIN campuses c ON c.id = t.campus_id
    WHERE tm.user_id = ${userId}
    LIMIT 1
  `);
  const teamCtx = (
    teamCtxResult as unknown as {
      rows: Array<{
        team_id: number;
        team_name: string;
        tagline: string | null;
        team_status: string;
        photo_url: string | null;
        invite_code: string | null;
        rejection_reason: string | null;
        coordinator_comment: string | null;
        is_featured: boolean;
        is_hidden: boolean;
        campus_id: number;
        leader_id: string | null;
        created_at: string;
        updated_at: string;
        campus_name: string | null;
        threshold: number;
        member_count: string;
      }>;
    }
  ).rows[0];

  if (!teamCtx) {
    res.json({
      team: null,
      totalRevenue: 0,
      totalOrderBook: 0,
      nationalRank: null,
      campusRank: null,
      activeProjects: 0,
      pendingSubmissions: 0,
      demoEligible: false,
      recentMilestones: [],
      announcements: [],
    });
    return;
  }

  const teamId = Number(teamCtx.team_id);
  const campusId = Number(teamCtx.campus_id);
  const threshold = Number(teamCtx.threshold ?? 200000);

  const statsP = db.execute<{
    revenue: string;
    orderbook: string;
    active_projects: string;
    pending_subs: string;
  }>(sql`
    SELECT
      (SELECT COALESCE(SUM(verified_amount), 0) FROM revenue_entries
        WHERE team_id = ${teamId} AND status = 'verified')                AS revenue,
      (SELECT COALESCE(SUM(verified_amount), 0) FROM order_book_entries
        WHERE team_id = ${teamId} AND status = 'verified')                AS orderbook,
      (SELECT COUNT(*) FROM projects
        WHERE team_id = ${teamId} AND status = 'active')                  AS active_projects,
      (SELECT COUNT(*) FROM revenue_entries
        WHERE team_id = ${teamId} AND status IN ('draft', 'submitted'))   AS pending_subs
  `);

  // National + campus rank for this team. Uses the same ordering as the
  // /leaderboard endpoint (featured first, then verified revenue desc, then
  // team id asc) and the same eligibility filter (active + non-hidden).
  // Computed in one round-trip via window functions over the full leaderboard
  // population, then we read just the row for this team. If the team is not
  // active or is hidden, it won't be in the ranked set and both ranks will
  // be null — which the response shape already permits.
  const ranksP = db.execute<{
    national_rank: string;
    campus_rank: string;
  }>(sql`
    SELECT national_rank, campus_rank FROM (
      SELECT
        t.id,
        ROW_NUMBER() OVER (
          ORDER BY t.is_featured DESC,
                   COALESCE(rev.total, 0) DESC,
                   t.id ASC
        ) AS national_rank,
        ROW_NUMBER() OVER (
          PARTITION BY t.campus_id
          ORDER BY t.is_featured DESC,
                   COALESCE(rev.total, 0) DESC,
                   t.id ASC
        ) AS campus_rank
      FROM teams t
      LEFT JOIN (
        SELECT team_id, SUM(verified_amount) AS total
        FROM revenue_entries
        WHERE status = 'verified'
        GROUP BY team_id
      ) rev ON rev.team_id = t.id
      WHERE t.status = 'active'
        AND t.is_hidden = FALSE
    ) ranked
    WHERE id = ${teamId}
  `);

  const milestonesP = db.execute<{
    id: number;
    team_id: number;
    type: string;
    title: string;
    description: string | null;
    date: string;
    image_url: string | null;
    link_url: string | null;
    is_pinned: boolean;
    created_at: string;
  }>(sql`
    SELECT id, team_id, type, title, description, date, image_url, link_url,
           is_pinned, created_at
    FROM milestones
    WHERE team_id = ${teamId}
    ORDER BY date DESC
    LIMIT 5
  `);

  const announcementsP = db.execute<{
    id: number;
    author_id: string;
    target: string;
    campus_id: number | null;
    team_id: number | null;
    title: string;
    body: string;
    created_at: string;
    author_first_name: string | null;
    author_last_name: string | null;
    author_exists: boolean;
  }>(sql`
    SELECT a.id, a.author_id, a.target, a.campus_id, a.team_id,
           a.title, a.body, a.created_at,
           u.first_name        AS author_first_name,
           u.last_name         AS author_last_name,
           (u.id IS NOT NULL)  AS author_exists
    FROM announcements a
    LEFT JOIN users u ON u.id = a.author_id
    WHERE a.target = 'all'
       OR (a.target = 'campus' AND a.campus_id = ${campusId})
       OR (a.target = 'team'   AND a.team_id   = ${teamId})
    ORDER BY a.created_at DESC, a.id ASC
    LIMIT 5
  `);

  const [statsR, ranksR, milestonesR, announcementsR] = await Promise.all([
    statsP,
    ranksP,
    milestonesP,
    announcementsP,
  ]);

  const stats = (
    statsR as unknown as {
      rows: Array<{
        revenue: string;
        orderbook: string;
        active_projects: string;
        pending_subs: string;
      }>;
    }
  ).rows[0];
  const ranksRow = (
    ranksR as unknown as {
      rows: Array<{
        national_rank: string;
        campus_rank: string;
      }>;
    }
  ).rows[0];
  const nationalRank = ranksRow ? Number(ranksRow.national_rank) : null;
  const campusRank = ranksRow ? Number(ranksRow.campus_rank) : null;
  const milestoneRows = (
    milestonesR as unknown as {
      rows: Array<{
        id: number;
        team_id: number;
        type: string;
        title: string;
        description: string | null;
        date: string;
        image_url: string | null;
        link_url: string | null;
        is_pinned: boolean;
        created_at: string;
      }>;
    }
  ).rows;
  const announcementRows = (
    announcementsR as unknown as {
      rows: Array<{
        id: number;
        author_id: string;
        target: string;
        campus_id: number | null;
        team_id: number | null;
        title: string;
        body: string;
        created_at: string;
        author_first_name: string | null;
        author_last_name: string | null;
        author_exists: boolean;
      }>;
    }
  ).rows;

  const totalRevenue = Number(stats?.revenue ?? 0);
  const totalOrderBook = Number(stats?.orderbook ?? 0);
  const activeProjects = Number(stats?.active_projects ?? 0);
  const pendingSubmissions = Number(stats?.pending_subs ?? 0);

  res.json({
    team: {
      id: teamId,
      name: teamCtx.team_name,
      tagline: teamCtx.tagline,
      status: teamCtx.team_status,
      photoUrl: teamCtx.photo_url,
      inviteCode: teamCtx.invite_code,
      rejectionReason: teamCtx.rejection_reason,
      coordinatorComment: teamCtx.coordinator_comment,
      isFeatured: teamCtx.is_featured,
      isHidden: teamCtx.is_hidden,
      campusId,
      leaderId: teamCtx.leader_id,
      createdAt: toIso(teamCtx.created_at),
      updatedAt: toIso(teamCtx.updated_at),
      campusName: teamCtx.campus_name ?? "",
      leaderName: "",
      memberCount: Number(teamCtx.member_count ?? 0),
      projectCount: activeProjects,
      totalRevenue,
      totalOrderBook,
      nationalRank,
    },
    totalRevenue,
    totalOrderBook,
    nationalRank,
    campusRank,
    activeProjects,
    pendingSubmissions,
    demoEligible: totalRevenue >= threshold,
    recentMilestones: milestoneRows.map((m) => ({
      id: Number(m.id),
      teamId: Number(m.team_id),
      type: m.type,
      title: m.title,
      description: m.description,
      date: toIso(m.date),
      imageUrl: m.image_url,
      linkUrl: m.link_url,
      isPinned: m.is_pinned,
      createdAt: toIso(m.created_at),
    })),
    announcements: announcementRows.map((a) => ({
      id: Number(a.id),
      authorId: a.author_id,
      target: a.target,
      campusId: a.campus_id,
      teamId: a.team_id,
      title: a.title,
      body: a.body,
      createdAt: toIso(a.created_at),
      // Match prior behavior: when the author row exists we returned
      // `${firstName} ${lastName}` (which produced the literal "null null"
      // when both names were null); fall back to "Admin" only when the row
      // itself is missing.
      authorName: a.author_exists
        ? `${a.author_first_name} ${a.author_last_name}`
        : "Admin",
    })),
  });
});

export default router;
