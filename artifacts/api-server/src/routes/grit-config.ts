/**
 * GRIT Miles config + journal-edit deadline + escalation toggle.
 *
 * Additive + isolated (hand-written, bypasses Orval codegen) so it can be read
 * by students (the GRIT ladder) without round-tripping the generated programme
 * config. Levels/deadline/escalation are stored on the per-season
 * programme_config row (added columns) and surfaced/edited here.
 */
import { Router, type IRouter, type Request, type Response } from "express";
import { z } from "zod";
import { db, programmeConfigTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAdminPage } from "../lib/require-admin-page";
import {
  getActiveConfig,
  getActiveSeasonId,
  getConfig,
  resolveSeason,
} from "../lib/season";

const router: IRouter = Router();

export type GritLevel = {
  level: number;
  revenueTarget: number;
  miles: number;
  reward?: string;
};

// The ladder shipped by default. Used when programme_config.gritLevels is null.
export const DEFAULT_GRIT_LEVELS: GritLevel[] = [
  { level: 1, revenueTarget: 25000, miles: 100 },
  { level: 2, revenueTarget: 50000, miles: 150 },
  { level: 3, revenueTarget: 100000, miles: 250 },
  { level: 4, revenueTarget: 200000, miles: 500 },
  { level: 5, revenueTarget: 400000, miles: 1000 },
];

const GritLevelSchema = z.object({
  level: z.number().int().positive(),
  revenueTarget: z.number().int().nonnegative(),
  miles: z.number().int().nonnegative(),
  reward: z.string().max(120).optional(),
});

const UpdateBody = z.object({
  levels: z.array(GritLevelSchema).min(1).max(20).optional(),
  journalEditDeadline: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .optional(),
  escalationEnabled: z.boolean().optional(),
  gritMilesMenuEnabled: z.boolean().optional(),
  gritMilesDashboardEnabled: z.boolean().optional(),
  demoDayMenuEnabled: z.boolean().optional(),
});

// Season-aware read of the programme_config row, created on first access.
//
// Omitting `seasonId` means the ACTIVE season. That is correct for background
// work, but a request handler should pass `await resolveSeason(req)` so that an
// admin viewing Season 1 edits Season 1's settings rather than the live
// season's. Before seasons existed this read an unqualified `.limit(1)`, which
// becomes nondeterministic as soon as a second season's row exists.
async function getConfigRow(seasonId?: number) {
  return seasonId == null ? getActiveConfig() : getConfig(seasonId);
}

export function resolveLevels(raw: unknown): GritLevel[] {
  if (!Array.isArray(raw) || raw.length === 0) return DEFAULT_GRIT_LEVELS;
  const parsed = z.array(GritLevelSchema).safeParse(raw);
  if (!parsed.success) return DEFAULT_GRIT_LEVELS;
  return [...parsed.data].sort((a, b) => a.revenueTarget - b.revenueTarget);
}

// Load the configured GRIT ladder (normalised to defaults when unset) from a
// season’s programme_config row. Shared by the admin dashboard GRIT cards and
// the teams export so both derive miles from the exact same ladder the student
// UI uses. Never throws — falls back to DEFAULT_GRIT_LEVELS on any error.
// `seasonId` omitted means the active season. Callers that have a request
// should pass `await resolveSeason(req)` so the ladder shown matches the season
// the user is looking at.
export async function readGritLevels(
  seasonId?: number,
): Promise<GritLevel[]> {
  try {
    const season = seasonId ?? (await getActiveSeasonId());
    const [row] = await db
      .select({ gritLevels: programmeConfigTable.gritLevels })
      .from(programmeConfigTable)
      .where(eq(programmeConfigTable.seasonId, season))
      .limit(1);
    return resolveLevels(row?.gritLevels);
  } catch {
    return DEFAULT_GRIT_LEVELS;
  }
}

// The single highest ladder milestone (miles value) reached for a given
// verified-revenue amount — i.e. the `miles` of the top level whose
// revenueTarget is met, NOT a cumulative sum. Returns 0 when no level is
// reached. Used by the admin dashboard "GRIT Miles" card (highest milestone
// any team has unlocked program-wide).
export function computeMaxGritMilestone(
  revenue: number,
  levels: GritLevel[],
): number {
  let best = 0;
  for (const lvl of levels) {
    if (revenue >= lvl.revenueTarget && lvl.miles > best) best = lvl.miles;
  }
  return best;
}

// Student-readable: the ladder + edit deadline only (no escalation internals).
router.get(
  "/grit-config",
  async (req: Request, res: Response): Promise<void> => {
    if (!req.isAuthenticated()) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    const row = await getConfigRow(await resolveSeason(req));
    res.json({
      levels: resolveLevels(row.gritLevels),
      journalEditDeadline: row.journalEditDeadline ?? null,
      // Programme end date (from admin Config → End Date) so the student
      // dashboard can show the end date + remaining-time countdown. Config
      // dates can carry a timestamp suffix — slice to a clean YYYY-MM-DD.
      endDate: (row.endDate ?? "").slice(0, 10),
      gritMilesMenuEnabled: row.gritMilesMenuEnabled,
      gritMilesDashboardEnabled: row.gritMilesDashboardEnabled,
      demoDayMenuEnabled: row.demoDayMenuEnabled,
    });
  },
);

// Admin: full settings incl. escalation toggle.
router.get(
  "/admin/grit-config",
  async (req: Request, res: Response): Promise<void> => {
    if (!req.isAuthenticated() || req.user.role !== "admin") {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
    const row = await getConfigRow(await resolveSeason(req));
    res.json({
      levels: resolveLevels(row.gritLevels),
      journalEditDeadline: row.journalEditDeadline ?? null,
      escalationEnabled: row.escalationEnabled,
      gritMilesMenuEnabled: row.gritMilesMenuEnabled,
      gritMilesDashboardEnabled: row.gritMilesDashboardEnabled,
      demoDayMenuEnabled: row.demoDayMenuEnabled,
    });
  },
);

router.put(
  "/admin/grit-config",
  requireAdminPage("/admin/config", "edit"),
  async (req: Request, res: Response): Promise<void> => {
    if (!req.isAuthenticated() || req.user.role !== "admin") {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
    const parsed = UpdateBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const row = await getConfigRow(await resolveSeason(req));
    const patch: Record<string, unknown> = {};
    if (parsed.data.levels !== undefined) {
      patch.gritLevels = [...parsed.data.levels].sort(
        (a, b) => a.revenueTarget - b.revenueTarget,
      );
    }
    if (parsed.data.journalEditDeadline !== undefined) {
      patch.journalEditDeadline = parsed.data.journalEditDeadline;
    }
    if (parsed.data.escalationEnabled !== undefined) {
      patch.escalationEnabled = parsed.data.escalationEnabled;
    }
    if (parsed.data.gritMilesMenuEnabled !== undefined) {
      patch.gritMilesMenuEnabled = parsed.data.gritMilesMenuEnabled;
    }
    if (parsed.data.gritMilesDashboardEnabled !== undefined) {
      patch.gritMilesDashboardEnabled = parsed.data.gritMilesDashboardEnabled;
    }
    if (parsed.data.demoDayMenuEnabled !== undefined) {
      patch.demoDayMenuEnabled = parsed.data.demoDayMenuEnabled;
    }
    const [updated] = await db
      .update(programmeConfigTable)
      .set(patch)
      .where(eq(programmeConfigTable.id, row.id))
      .returning();
    res.json({
      levels: resolveLevels(updated.gritLevels),
      journalEditDeadline: updated.journalEditDeadline ?? null,
      escalationEnabled: updated.escalationEnabled,
      gritMilesMenuEnabled: updated.gritMilesMenuEnabled,
      gritMilesDashboardEnabled: updated.gritMilesDashboardEnabled,
      demoDayMenuEnabled: updated.demoDayMenuEnabled,
    });
  },
);

export default router;
