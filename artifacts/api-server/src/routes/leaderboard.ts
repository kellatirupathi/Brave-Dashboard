import { Router, type IRouter } from "express";
import { sql } from "drizzle-orm";
import { db, programmeConfigTable } from "@workspace/db";
import { GetLeaderboardQueryParams } from "@workspace/api-zod";

const router: IRouter = Router();

type LeaderboardRow = {
  team_id: number;
  team_name: string;
  campus_name: string | null;
  campus_id: number;
  tagline: string | null;
  photo_url: string | null;
  total_revenue: string | null;
  total_order_book: string | null;
  active_projects: string | null;
  last_payment_date: string | null;
  is_featured: boolean;
  is_hidden: boolean;
};

router.get("/leaderboard", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const queryParams = GetLeaderboardQueryParams.safeParse(req.query);
  if (!queryParams.success) {
    res.status(400).json({ error: queryParams.error.message });
    return;
  }
  const { view, campusId, search } = queryParams.data;
  // Note: `period` is parsed by the schema but intentionally not applied here
  // — preserving existing behavior. Same for `clientCount` (always 0 below).

  const [config] = await db
    .select({ threshold: programmeConfigTable.demoEligibilityThreshold })
    .from(programmeConfigTable)
    .limit(1);
  const threshold = config?.threshold ?? 200000;

  let effectiveCampusId = campusId;
  if (view === "campus" && !campusId && req.user.campusId) {
    effectiveCampusId = req.user.campusId;
  }

  const isAdmin = req.user.role === "admin";
  // For top10 we slice in SQL; for other views we still want the full ranked
  // list (existing API contract), produced in a single round-trip.
  const limitClause = view === "top10" ? sql`LIMIT 10` : sql``;
  const campusFilter = effectiveCampusId
    ? sql`AND t.campus_id = ${effectiveCampusId}`
    : sql``;
  // Hidden teams are excluded for everyone except admins.
  const hiddenFilter = isAdmin ? sql`` : sql`AND t.is_hidden = FALSE`;

  // Search matches: team name, campus name, OR any team-member's full name /
  // email / NIAT id (looked up first on `users.niat_id`, then via roster by
  // email, then via roster by forms_user_id — same fallback the previous JS
  // code used). All folded into the same query as an EXISTS subquery so we
  // avoid extra round-trips.
  const searchFilter = search
    ? sql`AND (
        LOWER(t.name) LIKE ${"%" + search.toLowerCase() + "%"}
        OR LOWER(COALESCE(c.name, '')) LIKE ${"%" + search.toLowerCase() + "%"}
        OR EXISTS (
          SELECT 1
          FROM team_members tm
          JOIN users u ON u.id = tm.user_id
          LEFT JOIN roster r_email ON r_email.email = u.email
          LEFT JOIN roster r_forms ON r_forms.student_id = u.forms_user_id
          WHERE tm.team_id = t.id
            AND LOWER(
              COALESCE(u.first_name, '') || ' ' ||
              COALESCE(u.last_name,  '') || ' ' ||
              COALESCE(u.email,      '') || ' ' ||
              COALESCE(u.niat_id, COALESCE(r_email.niat_id, r_forms.niat_id), '')
            ) LIKE ${"%" + search.toLowerCase() + "%"}
        )
      )`
    : sql``;

  const result = await db.execute<LeaderboardRow>(sql`
    SELECT
      t.id          AS team_id,
      t.name        AS team_name,
      c.name        AS campus_name,
      t.campus_id   AS campus_id,
      t.tagline     AS tagline,
      t.photo_url   AS photo_url,
      COALESCE(rev.total, 0)        AS total_revenue,
      COALESCE(ob.total,  0)        AS total_order_book,
      COALESCE(p.active_count, 0)   AS active_projects,
      rev.last_payment_date         AS last_payment_date,
      t.is_featured                 AS is_featured,
      t.is_hidden                   AS is_hidden
    FROM teams t
    LEFT JOIN campuses c ON c.id = t.campus_id
    LEFT JOIN (
      SELECT team_id,
             SUM(verified_amount) AS total,
             MAX(payment_date)    AS last_payment_date
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
      ${hiddenFilter}
      ${campusFilter}
      ${searchFilter}
    ORDER BY
      t.is_featured DESC,
      COALESCE(rev.total, 0) DESC,
      t.id ASC
    ${limitClause}
  `);

  // drizzle's execute returns a node-pg result; rows are on .rows.
  const rows = (result as unknown as { rows: LeaderboardRow[] }).rows;

  const final = rows.map((r, idx) => {
    const totalRevenue = Number(r.total_revenue ?? 0);
    return {
      teamId: Number(r.team_id),
      teamName: r.team_name,
      campusName: r.campus_name ?? "",
      campusId: Number(r.campus_id),
      tagline: r.tagline ?? null,
      photoUrl: r.photo_url ?? null,
      totalRevenue,
      totalOrderBook: Number(r.total_order_book ?? 0),
      activeProjects: Number(r.active_projects ?? 0),
      clientCount: 0,
      lastPaymentDate: r.last_payment_date ?? null,
      isDemoEligible: totalRevenue >= threshold,
      isFeatured: r.is_featured,
      isHidden: r.is_hidden,
      rank: idx + 1,
    };
  });

  res.json(final);
});

export default router;
