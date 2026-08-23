import { Router, type IRouter } from "express";
import { eq, sql } from "drizzle-orm";
import { db, programmeConfigTable } from "@workspace/db";
import { resolveSeason } from "../lib/season";
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
  client_count: string | null;
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

  // "Overall" (lifetime) view — read straight off the raw query rather than
  // widening the generated `view` enum, which would mean a codegen round-trip
  // and a spec change. Additive: absent for every existing caller.
  //
  // Teams are IDENTICAL across seasons (same team rows, same membership), so a
  // lifetime roll-up is a straight sum with no season predicate at all — no
  // team-lineage rule is needed. That is only true because of the "same teams"
  // decision; had teams re-formed, this would require mapping lineages.
  const lifetime =
    req.query["lifetime"] === "true" || req.query["lifetime"] === "1";

  // Threshold belongs to the season being viewed, not the live one.
  const season = await resolveSeason(req);
  const [config] = await db
    .select({ threshold: programmeConfigTable.demoEligibilityThreshold })
    .from(programmeConfigTable)
    .where(eq(programmeConfigTable.seasonId, season))
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
  // Season predicates for the aggregate sub-selects below. National and
  // My Campus rank ONE season. When the "Overall" (lifetime) view is added,
  // these become empty fragments for that view only — teams are identical
  // across seasons, so an unfiltered roll-up is a straight sum.
  const seasonRev = lifetime ? sql`` : sql`AND season_id = ${season}`;
  const seasonOb = lifetime ? sql`` : sql`AND season_id = ${season}`;
  const seasonProj = lifetime ? sql`` : sql`AND season_id = ${season}`;
  const seasonObAll = lifetime ? sql`` : sql`WHERE season_id = ${season}`;

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
      COALESCE(cc.client_count, 0)  AS client_count,
      rev.last_payment_date         AS last_payment_date,
      t.is_featured                 AS is_featured,
      t.is_hidden                   AS is_hidden
    FROM teams t
    LEFT JOIN campuses c ON c.id = t.campus_id
    LEFT JOIN (
      -- RANKING figure, not the accounting figure. weighted_amount carries the
      -- category cap and the 1.5x recurring multiplier; it is NULL on every
      -- Season 1 row, which falls straight through to verified_amount and so
      -- ranks exactly as it did before Phase 6 existed.
      --
      -- Deliberately stops at verified_amount: this query has always summed
      -- that column alone, so a verified row with a NULL verified_amount
      -- contributes nothing. Adding an amount fallback would start counting
      -- it and would move Season 1 totals.
      SELECT team_id,
             SUM(COALESCE(weighted_amount, verified_amount)) AS total,
             MAX(payment_date)    AS last_payment_date
      FROM revenue_entries
      WHERE status = 'verified' ${seasonRev}
      GROUP BY team_id
    ) rev ON rev.team_id = t.id
    LEFT JOIN (
      SELECT team_id, SUM(verified_amount) AS total
      FROM order_book_entries
      WHERE status = 'verified' ${seasonOb}
      GROUP BY team_id
    ) ob ON ob.team_id = t.id
    LEFT JOIN (
      SELECT team_id, COUNT(*) AS active_count
      FROM projects
      WHERE status = 'active' ${seasonProj}
      GROUP BY team_id
    ) p ON p.team_id = t.id
    LEFT JOIN (
      SELECT team_id, COUNT(DISTINCT client_name) AS client_count
      FROM order_book_entries
      ${seasonObAll}
      GROUP BY team_id
    ) cc ON cc.team_id = t.id
    WHERE t.status = 'active'
      ${hiddenFilter}
      ${campusFilter}
    ORDER BY
      t.is_featured DESC,
      COALESCE(rev.total, 0) DESC,
      t.id ASC
    ${limitClause}
  `);

  // drizzle's execute returns a node-pg result; rows are on .rows.
  const rows = (result as unknown as { rows: LeaderboardRow[] }).rows;

  // On the lifetime view, fetch each team's verified revenue broken down BY
  // season so the table can show "Season 1 / Season 2 / Overall" columns. One
  // extra round-trip, and only on this view — the season-scoped views need
  // nothing extra. Keyed by team, so the join below is O(1) per row.
  const perSeasonByTeam = new Map<number, Record<number, number>>();
  if (lifetime && rows.length > 0) {
    const breakdown = await db.execute<{
      team_id: number;
      season_id: number;
      total: string | null;
    }>(sql`
      SELECT team_id, season_id,
             SUM(COALESCE(weighted_amount, verified_amount)) AS total
      FROM revenue_entries
      WHERE status = 'verified'
      GROUP BY team_id, season_id
    `);
    for (const b of (breakdown as unknown as { rows: Array<{
      team_id: number;
      season_id: number;
      total: string | null;
    }> }).rows) {
      const teamId = Number(b.team_id);
      const bucket = perSeasonByTeam.get(teamId) ?? {};
      bucket[Number(b.season_id)] = Number(b.total ?? 0);
      perSeasonByTeam.set(teamId, bucket);
    }
  }

  // 1. Assign rank to ALL teams in the ORDER BY position — this is the
  //    true national/campus rank, computed BEFORE any search filter.
  const ranked = rows.map((r, idx) => {
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
      clientCount: Number(r.client_count ?? 0),
      lastPaymentDate: r.last_payment_date ?? null,
      isDemoEligible: totalRevenue >= threshold,
      isFeatured: r.is_featured,
      isHidden: r.is_hidden,
      rank: idx + 1,
      // Present only on the lifetime view; absent (undefined) elsewhere so the
      // existing response shape is unchanged for every current caller.
      ...(lifetime
        ? {
            lifetime: true as const,
            revenueBySeason: perSeasonByTeam.get(Number(r.team_id)) ?? {},
          }
        : {}),
    };
  });

  // 2. Apply the search filter AFTER ranks are locked in, so a team's
  //    displayed rank reflects its real standing in the full leaderboard
  //    (not its position within the filtered subset).
  //    Match against team name, campus name, or any team member's name /
  //    email / NIAT id — same surfaces the SQL EXISTS used to cover.
  let final = ranked;
  if (search && search.trim().length > 0) {
    const q = search.trim().toLowerCase();

    // One round-trip to fetch member-search hits (team ids whose members
    // match the query). We can't do this in the original WHERE clause
    // anymore because we need rank to be assigned first.
    const memberHits = await db.execute<{ team_id: number }>(sql`
      SELECT DISTINCT tm.team_id
      FROM team_members tm
      JOIN users u ON u.id = tm.user_id
      LEFT JOIN roster r_email ON r_email.email = u.email
      LEFT JOIN roster r_forms ON r_forms.student_id = u.forms_user_id
      WHERE LOWER(
        COALESCE(u.first_name, '') || ' ' ||
        COALESCE(u.last_name,  '') || ' ' ||
        COALESCE(u.email,      '') || ' ' ||
        COALESCE(u.niat_id, COALESCE(r_email.niat_id, r_forms.niat_id), '')
      ) LIKE ${"%" + q + "%"}
    `);
    const memberHitIds = new Set(
      (memberHits as unknown as { rows: { team_id: number }[] }).rows.map((h) =>
        Number(h.team_id),
      ),
    );

    final = ranked.filter(
      (t) =>
        t.teamName.toLowerCase().includes(q) ||
        (t.campusName ?? "").toLowerCase().includes(q) ||
        memberHitIds.has(t.teamId),
    );
  }

  res.json(final);
});

export default router;
