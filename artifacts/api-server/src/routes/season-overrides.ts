/**
 * Per-user season overrides (additive, isolated).
 *
 * A season override pins ONE named user to ONE season, overriding the globally
 * live one. It exists so a season can be piloted with a handful of students
 * while the rest of the programme carries on untouched.
 *
 * WHAT THIS DOES NOT CHANGE. `seasons.is_active` still decides the season for
 * everyone without an override — which is very nearly everyone — so flipping
 * the live season still moves the whole programme exactly as it did before.
 * The override is a rung added below the staff default and above the active
 * season in `resolveSeason()`; nothing above it moved.
 *
 * Super admin only, mirroring admin-permissions.ts: deciding which season a
 * student sits in is a programme-level decision, not a per-page one.
 *
 * Deleting the feature means removing the single `router.use(...)` line in
 * routes/index.ts plus its import, and dropping the column.
 */
import { Router, type IRouter, type Request, type Response } from "express";
import { and, eq, isNotNull, sql } from "drizzle-orm";
import { db, usersTable, seasonsTable, campusesTable } from "@workspace/db";
import { z } from "zod";
import { isSuperAdmin } from "../lib/admin-permissions";
import { invalidateSeasonOverrideCache } from "../lib/season";
import { logAudit } from "../lib/audit";
import { logger } from "../lib/logger";

const router: IRouter = Router();

/**
 * Every endpoint here is super-admin only. Returns the caller row when allowed
 * and null when it has already answered, so handlers read as a single guard.
 */
async function requireSuperAdmin(
  req: Request,
  res: Response,
): Promise<{ id: string } | null> {
  if (!req.isAuthenticated || !req.isAuthenticated() || !req.user) {
    res.status(401).json({ error: "Unauthorized" });
    return null;
  }
  const [caller] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.id, req.user.id));
  if (!isSuperAdmin(caller)) {
    res.status(403).json({ error: "Forbidden" });
    return null;
  }
  return { id: req.user.id };
}

/**
 * GET /api/admin/season-overrides
 *
 * Everyone currently pinned. Deliberately only the pinned rows: the point of
 * the page is to answer "who is not following the live season", and listing
 * 7,500 unpinned users alongside them would bury the answer.
 */
router.get(
  "/admin/season-overrides",
  async (req: Request, res: Response): Promise<void> => {
    if (!(await requireSuperAdmin(req, res))) return;

    const rows = await db
      .select({
        userId: usersTable.id,
        firstName: usersTable.firstName,
        lastName: usersTable.lastName,
        email: usersTable.email,
        niatId: usersTable.niatId,
        role: usersTable.role,
        campusName: campusesTable.name,
        seasonOverrideId: usersTable.seasonOverrideId,
        seasonSlug: seasonsTable.slug,
        seasonName: seasonsTable.name,
      })
      .from(usersTable)
      .leftJoin(seasonsTable, eq(seasonsTable.id, usersTable.seasonOverrideId))
      .leftJoin(campusesTable, eq(campusesTable.id, usersTable.campusId))
      .where(isNotNull(usersTable.seasonOverrideId));

    res.json({ overrides: rows });
  },
);

/**
 * GET /api/admin/season-overrides/search?q=…
 *
 * Find a user to pin. Matches name, email or NIAT id, and returns the current
 * override so the admin can see at a glance who is already pinned.
 */
router.get(
  "/admin/season-overrides/search",
  async (req: Request, res: Response): Promise<void> => {
    if (!(await requireSuperAdmin(req, res))) return;

    const q = String(req.query["q"] ?? "").trim();
    if (q.length < 2) {
      res.json({ users: [] });
      return;
    }

    const like = `%${q.toLowerCase()}%`;
    const rows = await db
      .select({
        userId: usersTable.id,
        firstName: usersTable.firstName,
        lastName: usersTable.lastName,
        email: usersTable.email,
        niatId: usersTable.niatId,
        role: usersTable.role,
        campusName: campusesTable.name,
        seasonOverrideId: usersTable.seasonOverrideId,
      })
      .from(usersTable)
      .leftJoin(campusesTable, eq(campusesTable.id, usersTable.campusId))
      .where(
        and(
          eq(usersTable.role, "student"),
          // Cheap match across the three ways staff refer to a student.
          // Enough for a lookup box; this is not a reporting query.
          sql`(
            lower(coalesce(${usersTable.firstName}, '') || ' ' || coalesce(${usersTable.lastName}, '')) LIKE ${like}
            OR lower(coalesce(${usersTable.email}, '')) LIKE ${like}
            OR lower(coalesce(${usersTable.niatId}, '')) LIKE ${like}
          )`,
        ),
      )
      .limit(20);

    res.json({ users: rows });
  },
);

const SetOverrideBody = z.object({
  // null clears the pin and returns the user to the live season.
  seasonId: z.number().int().positive().nullable(),
});

/**
 * PUT /api/admin/season-overrides/:userId
 *
 * Pin one user to a season, or clear their pin with `seasonId: null`.
 */
router.put(
  "/admin/season-overrides/:userId",
  async (req: Request, res: Response): Promise<void> => {
    const caller = await requireSuperAdmin(req, res);
    if (!caller) return;

    const parsed = SetOverrideBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const { seasonId } = parsed.data;

    const userId = String(req.params["userId"] ?? "");
    const [target] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.id, userId))
      .limit(1);
    if (!target) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    // Pinning staff would fight the staff default, which already lets them
    // move between seasons freely. Refuse rather than create two competing
    // rules for the same person.
    if (target.role !== "student") {
      res.status(400).json({
        error:
          "Only students can be pinned to a season. Admins and coordinators already choose their own.",
      });
      return;
    }

    if (seasonId != null) {
      const [season] = await db
        .select({ id: seasonsTable.id })
        .from(seasonsTable)
        .where(eq(seasonsTable.id, seasonId))
        .limit(1);
      if (!season) {
        res.status(400).json({ error: "That season does not exist." });
        return;
      }
    }

    await db
      .update(usersTable)
      .set({ seasonOverrideId: seasonId })
      .where(eq(usersTable.id, userId));

    // The resolver caches per user, so the change must be published or the
    // student keeps their old season for up to the cache window.
    invalidateSeasonOverrideCache(userId);

    try {
      await logAudit(
        caller.id,
        seasonId == null ? "clear_season_override" : "set_season_override",
        "user",
        undefined,
        JSON.stringify({ userId, seasonId }),
      );
    } catch (err) {
      // An audit hiccup must not undo a change that already succeeded.
      logger.warn({ err, userId }, "[season-override] audit write failed");
    }

    res.json({ userId, seasonOverrideId: seasonId });
  },
);

export default router;
