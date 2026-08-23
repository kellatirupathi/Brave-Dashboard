/**
 * Seasons (additive, isolated — bypasses Orval codegen).
 *
 * Two concerns, deliberately in one file because they share the same table:
 *
 *   1. Season switching for every role. The dashboard reads the list, shows the
 *      1.0 / 2.0 badge, and remembers which one the viewer selected.
 *   2. The Season 1 archive controls. Marking a season read-only, activating a
 *      season, and the three per-capability write overrides.
 *
 * ISOLATION CONTRACT
 * - Nothing else imports from this file. Deleting it means removing the single
 *   `router.use(seasonsRouter)` line in routes/index.ts.
 * - Reads are open to any authenticated user; every write is admin-only, and
 *   the flags that change what students can do are SUPER-admin only.
 * - Every write is audit-logged and invalidates the season cache so the guard
 *   and resolver see the change immediately rather than up to 30s later.
 */
import { Router, type IRouter, type Request, type Response } from "express";
import { z } from "zod";
import { asc, eq } from "drizzle-orm";
import { db, seasonsTable, usersTable } from "@workspace/db";
import { invalidateSeasonCache, resolveSeason } from "../lib/season";
import {
  getSessionId,
  getSession,
  updateSession,
} from "../lib/auth";
import { logAudit } from "../lib/audit";
import { logger } from "../lib/logger";

const router: IRouter = Router();

/** Shape sent to the dashboard. Deliberately excludes nothing — no secrets here. */
function serialize(row: typeof seasonsTable.$inferSelect) {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    startDate: row.startDate,
    endDate: row.endDate,
    weekCount: row.weekCount,
    isActive: row.isActive,
    isReadOnly: row.isReadOnly,
    allowJournalWrites: row.allowJournalWrites,
    allowRevenueWrites: row.allowRevenueWrites,
    allowProjectWrites: row.allowProjectWrites,
  };
}

async function isCallerSuperAdmin(userId: string): Promise<boolean> {
  const [row] = await db
    .select({ isSuperAdmin: usersTable.isSuperAdmin })
    .from(usersTable)
    .where(eq(usersTable.id, userId))
    .limit(1);
  return !!row?.isSuperAdmin;
}

// ── Reads: any authenticated user ────────────────────────────────────────

/**
 * Every season, plus which one this viewer is currently looking at. The
 * dashboard uses `viewing` to render the badge and the switcher chip without a
 * second round-trip.
 */
router.get("/seasons", async (req: Request, res: Response): Promise<void> => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const rows = await db.select().from(seasonsTable).orderBy(asc(seasonsTable.id));
  res.json({
    seasons: rows.map(serialize),
    viewing: await resolveSeason(req),
  });
});

router.get(
  "/seasons/active",
  async (req: Request, res: Response): Promise<void> => {
    if (!req.isAuthenticated()) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    const [row] = await db
      .select()
      .from(seasonsTable)
      .where(eq(seasonsTable.isActive, true))
      .limit(1);
    res.json(row ? serialize(row) : null);
  },
);

const SelectBody = z.object({ seasonId: z.number().int().positive() });

/**
 * Remember which season this viewer selected, so a page refresh keeps it.
 * Stored on the session row rather than a cookie so it cannot be tampered with
 * client-side. The `x-brave-season` header still overrides it per request.
 */
router.post(
  "/seasons/select",
  async (req: Request, res: Response): Promise<void> => {
    if (!req.isAuthenticated()) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    const parsed = SelectBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid seasonId" });
      return;
    }
    const [season] = await db
      .select({ id: seasonsTable.id })
      .from(seasonsTable)
      .where(eq(seasonsTable.id, parsed.data.seasonId))
      .limit(1);
    if (!season) {
      res.status(404).json({ error: "Unknown season" });
      return;
    }

    const sid = getSessionId(req);
    if (!sid) {
      res.status(401).json({ error: "No session" });
      return;
    }
    const session = await getSession(sid);
    if (!session) {
      res.status(401).json({ error: "No session" });
      return;
    }
    await updateSession(sid, {
      ...session,
      viewingSeasonId: parsed.data.seasonId,
    });
    res.json({ viewing: parsed.data.seasonId });
  },
);

// ── Writes: admin only, and the student-facing flags super-admin only ────

const UpdateBody = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  startDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .optional(),
  endDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .optional(),
  weekCount: z.number().int().min(1).max(60).optional(),
  isActive: z.boolean().optional(),
  isReadOnly: z.boolean().optional(),
  allowJournalWrites: z.boolean().optional(),
  allowRevenueWrites: z.boolean().optional(),
  allowProjectWrites: z.boolean().optional(),
});

/**
 * Fields that change what STUDENTS can do, so they are super-admin only:
 * flipping the archive open or closed, and the three write overrides.
 * Renaming a season or adjusting its dates stays with any admin.
 */
const SUPER_ADMIN_ONLY = [
  "isActive",
  "isReadOnly",
  "allowJournalWrites",
  "allowRevenueWrites",
  "allowProjectWrites",
] as const;

router.patch(
  "/admin/seasons/:id",
  async (req: Request, res: Response): Promise<void> => {
    if (!req.isAuthenticated() || req.user.role !== "admin") {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
    const id = Number(req.params["id"]);
    if (!Number.isInteger(id) || id <= 0) {
      res.status(400).json({ error: "Invalid season id" });
      return;
    }
    const parsed = UpdateBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const patch = parsed.data;
    if (Object.keys(patch).length === 0) {
      res.status(400).json({ error: "No fields to update" });
      return;
    }

    const touchesStudentBehaviour = SUPER_ADMIN_ONLY.some(
      (k) => patch[k] !== undefined,
    );
    if (touchesStudentBehaviour && !(await isCallerSuperAdmin(req.user.id))) {
      res.status(403).json({
        error:
          "Only super admins can open or close a season, or change its write overrides.",
      });
      return;
    }

    const [existing] = await db
      .select()
      .from(seasonsTable)
      .where(eq(seasonsTable.id, id))
      .limit(1);
    if (!existing) {
      res.status(404).json({ error: "Season not found" });
      return;
    }

    // Exactly one season is active. Activating one stands the others down in
    // the same transaction, so there is never a moment with two actives (which
    // would make getActiveSeasonId() nondeterministic) or zero.
    const [updated] = await db.transaction(async (tx) => {
      if (patch.isActive === true) {
        await tx
          .update(seasonsTable)
          .set({ isActive: false })
          .where(eq(seasonsTable.isActive, true));
      }
      return tx
        .update(seasonsTable)
        .set(patch)
        .where(eq(seasonsTable.id, id))
        .returning();
    });

    // The resolver and the write guard cache seasons for ~30s. Drop it now so
    // an admin closing Season 1 takes effect on the very next request rather
    // than up to half a minute later.
    invalidateSeasonCache();

    await logAudit(
      req.user.id,
      "update_season",
      "seasons",
      id,
      JSON.stringify(patch),
    );
    logger.info(
      { seasonId: id, patch, actorId: req.user.id },
      "[seasons] season updated",
    );

    res.json(updated ? serialize(updated) : null);
  },
);

export default router;
