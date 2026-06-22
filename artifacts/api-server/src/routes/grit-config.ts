/**
 * GRIT Miles config + journal-edit deadline + escalation toggle.
 *
 * Additive + isolated (hand-written, bypasses Orval codegen) so it can be read
 * by students (the GRIT ladder) without round-tripping the generated programme
 * config. Levels/deadline/escalation are stored on the singleton
 * programme_config row (added columns) and surfaced/edited here.
 */
import { Router, type IRouter, type Request, type Response } from "express";
import { z } from "zod";
import { db, programmeConfigTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAdminPage } from "../lib/require-admin-page";

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
});

// Read/seed the singleton row, normalising the GRIT ladder to defaults when
// unset so callers never have to special-case null.
async function getConfigRow() {
  let [row] = await db.select().from(programmeConfigTable).limit(1);
  if (!row) {
    [row] = await db.insert(programmeConfigTable).values({}).returning();
  }
  return row;
}

function resolveLevels(raw: unknown): GritLevel[] {
  if (!Array.isArray(raw) || raw.length === 0) return DEFAULT_GRIT_LEVELS;
  const parsed = z.array(GritLevelSchema).safeParse(raw);
  if (!parsed.success) return DEFAULT_GRIT_LEVELS;
  return [...parsed.data].sort((a, b) => a.revenueTarget - b.revenueTarget);
}

// Student-readable: the ladder + edit deadline only (no escalation internals).
router.get(
  "/grit-config",
  async (req: Request, res: Response): Promise<void> => {
    if (!req.isAuthenticated()) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    const row = await getConfigRow();
    res.json({
      levels: resolveLevels(row.gritLevels),
      journalEditDeadline: row.journalEditDeadline ?? null,
      gritMilesMenuEnabled: row.gritMilesMenuEnabled,
      gritMilesDashboardEnabled: row.gritMilesDashboardEnabled,
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
    const row = await getConfigRow();
    res.json({
      levels: resolveLevels(row.gritLevels),
      journalEditDeadline: row.journalEditDeadline ?? null,
      escalationEnabled: row.escalationEnabled,
      gritMilesMenuEnabled: row.gritMilesMenuEnabled,
      gritMilesDashboardEnabled: row.gritMilesDashboardEnabled,
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
    const row = await getConfigRow();
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
    });
  },
);

export default router;
