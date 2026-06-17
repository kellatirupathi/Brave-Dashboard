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
      path: normalizePath(rawPath),
      rawPath,
    });
  } catch (err) {
    // Best-effort — a tracking failure must never surface to the user.
    logger.debug({ err }, "[page-views] failed to record");
  }
  res.json({ ok: true });
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
