/**
 * Revenue rejection reasons catalog (additive, isolated — bypasses Orval
 * codegen). Admins manage the list from the Config page; the review-queue
 * reject dialogs read it to render tap-to-insert reason chips. Seeded at
 * server bootstrap with the two previously hardcoded reasons.
 */
import { Router, type IRouter, type Request, type Response } from "express";
import { z } from "zod";
import { db, rejectionReasonsTable } from "@workspace/db";
import { asc, eq, sql } from "drizzle-orm";
import { requireAdminPage } from "../lib/require-admin-page";
import { logAudit } from "../lib/audit";

const router: IRouter = Router();

// The reasons that used to be hardcoded in the queue page. Inserted once at
// bootstrap when the table is empty; after that the catalog is fully
// admin-managed (deleting them does NOT bring them back).
export const DEFAULT_REJECTION_REASONS = [
  "Kindly submit the BRD in the required format",
  "Please attach conversation screenshots, working links, a phase-wise payment plan, client details, and testimonials",
];

let seeded = false;

export async function bootstrapRejectionReasons(): Promise<void> {
  if (seeded) return;
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)` })
    .from(rejectionReasonsTable);
  if (Number(count) === 0) {
    await db.insert(rejectionReasonsTable).values(
      DEFAULT_REJECTION_REASONS.map((label, i) => ({
        label,
        sortOrder: i,
      })),
    );
  }
  seeded = true;
}

const CreateBody = z.object({ label: z.string().trim().min(3).max(500) });
const UpdateBody = z.object({ label: z.string().trim().min(3).max(500) });

// List — readable by any admin (the review queue needs it with view access).
router.get(
  "/admin/rejection-reasons",
  async (req: Request, res: Response): Promise<void> => {
    if (!req.isAuthenticated() || req.user.role !== "admin") {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
    const reasons = await db
      .select()
      .from(rejectionReasonsTable)
      .orderBy(
        asc(rejectionReasonsTable.sortOrder),
        asc(rejectionReasonsTable.id),
      );
    res.json({ items: reasons });
  },
);

router.post(
  "/admin/rejection-reasons",
  requireAdminPage("/admin/config", "edit"),
  async (req: Request, res: Response): Promise<void> => {
    if (!req.isAuthenticated() || req.user.role !== "admin") {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
    const parsed = CreateBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const [{ max }] = await db
      .select({ max: sql<number>`coalesce(max(sort_order), -1)` })
      .from(rejectionReasonsTable);
    const [reason] = await db
      .insert(rejectionReasonsTable)
      .values({ label: parsed.data.label, sortOrder: Number(max) + 1 })
      .returning();
    await logAudit(
      req.user.id,
      "create_rejection_reason",
      "rejection_reason",
      reason.id,
      reason.label,
    );
    res.status(201).json(reason);
  },
);

router.patch(
  "/admin/rejection-reasons/:id",
  requireAdminPage("/admin/config", "edit"),
  async (req: Request, res: Response): Promise<void> => {
    if (!req.isAuthenticated() || req.user.role !== "admin") {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      res.status(400).json({ error: "Invalid reason id" });
      return;
    }
    const parsed = UpdateBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const [reason] = await db
      .update(rejectionReasonsTable)
      .set({ label: parsed.data.label })
      .where(eq(rejectionReasonsTable.id, id))
      .returning();
    if (!reason) {
      res.status(404).json({ error: "Reason not found" });
      return;
    }
    await logAudit(
      req.user.id,
      "update_rejection_reason",
      "rejection_reason",
      id,
      reason.label,
    );
    res.json(reason);
  },
);

router.delete(
  "/admin/rejection-reasons/:id",
  requireAdminPage("/admin/config", "edit"),
  async (req: Request, res: Response): Promise<void> => {
    if (!req.isAuthenticated() || req.user.role !== "admin") {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      res.status(400).json({ error: "Invalid reason id" });
      return;
    }
    const [deleted] = await db
      .delete(rejectionReasonsTable)
      .where(eq(rejectionReasonsTable.id, id))
      .returning();
    if (!deleted) {
      res.status(404).json({ error: "Reason not found" });
      return;
    }
    await logAudit(
      req.user.id,
      "delete_rejection_reason",
      "rejection_reason",
      id,
      deleted.label,
    );
    res.status(204).end();
  },
);

export default router;
