/**
 * Projects submissions lock (additive, isolated — bypasses Orval codegen).
 *
 * Admin Config toggle that stops students from adding order book entries,
 * adding revenue entries, or submitting revenue for verification (i.e. the
 * BRD-upload flows on the student Projects page). While locked, the student
 * Projects pages show the configured message in a banner. Admins are never
 * blocked. Stored on the singleton programme_config row (added columns).
 */
import { Router, type IRouter, type Request, type Response } from "express";
import { z } from "zod";
import { db, programmeConfigTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAdminPage } from "../lib/require-admin-page";
import { logAudit } from "../lib/audit";

const router: IRouter = Router();

export const DEFAULT_PROJECTS_LOCK_MESSAGE =
  "Submissions are temporarily paused. You cannot add order book entries or upload BRDs for revenue verification right now. Please check back later.";

const UpdateBody = z.object({
  locked: z.boolean().optional(),
  message: z.string().max(1000).nullable().optional(),
});

async function getConfigRow() {
  let [row] = await db.select().from(programmeConfigTable).limit(1);
  if (!row) {
    [row] = await db.insert(programmeConfigTable).values({}).returning();
  }
  return row;
}

function serialize(row: typeof programmeConfigTable.$inferSelect) {
  return {
    locked: row.projectSubmissionsLocked,
    message:
      (row.projectSubmissionsLockMessage ?? "").trim() ||
      DEFAULT_PROJECTS_LOCK_MESSAGE,
  };
}

/**
 * Returns the lock message when project submissions are locked for this
 * request's user, or null when the action may proceed. Admins bypass the lock.
 * Used by financials.ts to enforce the lock server-side.
 */
export async function getProjectSubmissionsLockError(
  req: Request,
): Promise<string | null> {
  if (req.user?.role === "admin") return null;
  const [row] = await db
    .select({
      locked: programmeConfigTable.projectSubmissionsLocked,
      message: programmeConfigTable.projectSubmissionsLockMessage,
    })
    .from(programmeConfigTable)
    .limit(1);
  if (!row?.locked) return null;
  return (row.message ?? "").trim() || DEFAULT_PROJECTS_LOCK_MESSAGE;
}

// Readable by any authenticated user — the student Projects pages use this to
// show the banner and disable the add/submit actions.
router.get(
  "/projects-lock",
  async (req: Request, res: Response): Promise<void> => {
    if (!req.isAuthenticated()) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    const row = await getConfigRow();
    res.json(serialize(row));
  },
);

router.put(
  "/admin/projects-lock",
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
    if (parsed.data.locked !== undefined) {
      patch.projectSubmissionsLocked = parsed.data.locked;
    }
    if (parsed.data.message !== undefined) {
      const trimmed = (parsed.data.message ?? "").trim();
      patch.projectSubmissionsLockMessage = trimmed || null;
    }
    const [updated] = await db
      .update(programmeConfigTable)
      .set(patch)
      .where(eq(programmeConfigTable.id, row.id))
      .returning();
    await logAudit(
      req.user.id,
      "update_projects_lock",
      "programme_config",
      row.id,
      updated.projectSubmissionsLocked
        ? "locked project submissions"
        : "unlocked project submissions",
    );
    res.json(serialize(updated));
  },
);

export default router;
