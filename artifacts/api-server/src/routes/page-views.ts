import { Router, type IRouter } from "express";
import { sql } from "drizzle-orm";
import { db, pageViewsTable } from "@workspace/db";
import { z } from "zod/v4";
import { logger } from "../lib/logger";

const router: IRouter = Router();

// Collapse dynamic path segments (numeric ids, UUIDs, BRAVE-XXXXX codes) to
// `:id` so the most-visited aggregation groups e.g. /admin/teams/12 and
// /admin/teams/34 together. Query/hash are dropped; length is capped.
function normalizePath(input: string): string {
  let path = (input || "").split("?")[0].split("#")[0].trim();
  if (path === "") return "/";
  if (!path.startsWith("/")) path = "/" + path;
  const uuid =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const out = path
    .split("/")
    .map((seg) => {
      if (seg === "") return seg;
      if (/^\d+$/.test(seg)) return ":id";
      if (uuid.test(seg)) return ":id";
      if (/^BRAVE-[A-Z0-9]+$/i.test(seg)) return ":code";
      return seg;
    })
    .join("/");
  const trimmed = out.length > 200 ? out.slice(0, 200) : out;
  return trimmed || "/";
}

const RecordBody = z.object({
  path: z.string().min(1).max(2000),
  // Optional for compatibility with older cached dashboard bundles.
  platform: z.enum(["app", "web"]).optional(),
});

// Any authenticated user records a page view on navigation. Fire-and-forget on
// the client; never blocks. Failures are swallowed (logged at debug).
router.post("/page-views", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const parsed = RecordBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid path" });
    return;
  }
  try {
    const rawPath = parsed.data.path.slice(0, 300);
    await db.insert(pageViewsTable).values({
      userId: req.user.id,
      role: req.user.role,
      platform: parsed.data.platform ?? null,
      path: normalizePath(rawPath),
      rawPath,
    });
  } catch (err) {
    // Best-effort — a tracking failure must never surface to the user.
    logger.debug({ err }, "[page-views] failed to record");
  }
  res.json({ ok: true });
});

const USER_STATS_DAYS = new Set([7, 30, 90]);

function parseStatsDays(raw: unknown): number {
  const value = Number(raw ?? 30);
  return Number.isInteger(value) && USER_STATS_DAYS.has(value) ? value : 30;
}

function numberValue(value: unknown): number {
  return typeof value === "number" ? value : Number(value ?? 0);
}

function isoDateValue(value: unknown): string | null {
  if (value == null) return null;
  const date = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

// Admin: app-vs-web usage telemetry for the User Stats Config section.
// Historical rows with platform = null are intentionally excluded from the
// dated app/web totals because their source is unknowable.
router.get("/admin/user-stats", async (req, res): Promise<void> => {
  if (!req.isAuthenticated() || req.user.role !== "admin") {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const days = parseStatsDays(req.query.days);

  try {
    const [totalsResult, pathResult] = await Promise.all([
      db.execute(sql`
        SELECT
          count(DISTINCT user_id) FILTER (WHERE platform = 'app')::int AS app_users,
          count(DISTINCT user_id) FILTER (WHERE platform = 'web')::int AS web_users,
          count(*) FILTER (WHERE platform = 'app')::int AS app_views,
          count(*) FILTER (WHERE platform = 'web')::int AS web_views,
          (
            SELECT count(DISTINCT user_id)::int
            FROM page_views
            WHERE platform = 'app'
          ) AS ever_opened_app,
          (
            SELECT min(created_at)
            FROM page_views
            WHERE platform IS NOT NULL
          ) AS tracking_since
        FROM page_views
        WHERE created_at >= now() - ${days} * interval '1 day'
      `),
      db.execute(sql`
        SELECT
          path,
          count(*)::int AS total_views,
          count(*) FILTER (WHERE platform = 'app')::int AS app_views,
          count(*) FILTER (WHERE platform = 'web')::int AS web_views
        FROM page_views
        WHERE created_at >= now() - ${days} * interval '1 day'
        GROUP BY path
        ORDER BY count(*) DESC
        LIMIT 500
      `),
    ]);

    const totals = (totalsResult.rows[0] ?? {}) as Record<string, unknown>;
    const appViews = numberValue(totals.app_views);
    const webViews = numberValue(totals.web_views);
    const knownViews = appViews + webViews;
    const perPath = pathResult.rows.map((row) => {
      const item = row as Record<string, unknown>;
      return {
        path: String(item.path ?? "/"),
        totalViews: numberValue(item.total_views),
        appViews: numberValue(item.app_views),
        webViews: numberValue(item.web_views),
      };
    });

    res.json({
      days,
      appUsers: numberValue(totals.app_users),
      webUsers: numberValue(totals.web_users),
      appShare:
        knownViews === 0 ? 0 : Number(((appViews / knownViews) * 100).toFixed(1)),
      everOpenedApp: numberValue(totals.ever_opened_app),
      perPath,
      trackingSince: isoDateValue(totals.tracking_since),
    });
  } catch (err) {
    logger.error({ err, days }, "[page-views] user stats query failed");
    res.status(500).json({ error: "Unable to load user stats" });
  }
});

// Admin: most-visited pages, aggregated by normalized path (top → bottom).
router.get("/admin/page-views/summary", async (req, res): Promise<void> => {
  if (!req.isAuthenticated() || req.user.role !== "admin") {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  try {
    const rows = await db
      .select({
        path: pageViewsTable.path,
        count: sql<number>`count(*)::int`,
        uniqueVisitors: sql<number>`count(distinct ${pageViewsTable.userId})::int`,
        lastVisitedAt: sql<string>`max(${pageViewsTable.createdAt})`,
      })
      .from(pageViewsTable)
      .groupBy(pageViewsTable.path)
      .orderBy(sql`count(*) desc`)
      .limit(500);
    res.json(rows);
  } catch (err) {
    logger.error({ err }, "[page-views] summary query failed");
    res.json([]);
  }
});

export default router;
