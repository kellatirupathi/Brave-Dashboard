/**
 * Season-scoped Weekly Journal submissions lock.
 *
 * Admins configure one lock + student-facing message per season. Students may
 * continue reading existing journals while locked, but all create/update/delete
 * operations are denied server-side. Staff corrections remain available.
 */
import { Router, type IRouter, type Request, type Response } from "express";
import { z } from "zod";
import { db, programmeConfigTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { getConfig, resolveSeason } from "../lib/season";
import { requireAdminPage } from "../lib/require-admin-page";
import { logAudit } from "../lib/audit";

const router: IRouter = Router();

export const DEFAULT_JOURNAL_LOCK_MESSAGE =
  "Weekly Journal submissions are temporarily paused. You can still view your previous journals, but you cannot add, edit, or delete entries right now.";

const UpdateBody = z.object({
  locked: z.boolean(),
  message: z.string().max(1000).nullable(),
});

function serialize(row: typeof programmeConfigTable.$inferSelect) {
  return {
    locked: row.journalSubmissionsLocked,
    message:
      (row.journalSubmissionsLockMessage ?? "").trim() ||
      DEFAULT_JOURNAL_LOCK_MESSAGE,
    seasonId: row.seasonId,
  };
}

export async function getJournalSubmissionsLockError(
  req: Request,
): Promise<string | null> {
  if (req.user?.role !== "student") return null;
  const row = await getConfig(await resolveSeason(req));
  if (!row.journalSubmissionsLocked) return null;
  return (
    (row.journalSubmissionsLockMessage ?? "").trim() ||
    DEFAULT_JOURNAL_LOCK_MESSAGE
  );
}

router.get(
  "/journal-submissions-lock",
  async (req: Request, res: Response): Promise<void> => {
    if (!req.isAuthenticated()) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    const row = await getConfig(await resolveSeason(req));
    res.json(serialize(row));
  },
);

router.put(
  "/admin/journal-submissions-lock",
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

    const row = await getConfig(await resolveSeason(req));
    const trimmed = (parsed.data.message ?? "").trim();
    const [updated] = await db
      .update(programmeConfigTable)
      .set({
        journalSubmissionsLocked: parsed.data.locked,
        journalSubmissionsLockMessage: trimmed || null,
      })
      .where(eq(programmeConfigTable.id, row.id))
      .returning();

    await logAudit(
      req.user.id,
      "update_journal_submissions_lock",
      "programme_config",
      row.id,
      parsed.data.locked
        ? "locked weekly journal submissions"
        : "unlocked weekly journal submissions",
    );
    res.json(serialize(updated));
  },
);

export default router;