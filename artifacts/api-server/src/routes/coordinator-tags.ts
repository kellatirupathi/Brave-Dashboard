/**
 * Coordinator Tags — admin-managed functional tags for campus-coordinator
 * accounts (e.g. "Success Coach", "COS", "COS/PM/PMA/BOA").
 *
 * Additive + isolated (hand-written, bypasses Orval codegen like the other
 * `*-api.ts`/route pairs). Two concerns:
 *   1. The catalog of tags — CRUD from the Config page.
 *   2. Per-coordinator assignments (many-to-many) — set from the Users page.
 *
 * All endpoints are admin-only. Catalog writes are gated behind the
 * `/admin/config` page permission; assignment writes behind `/admin/users`.
 */
import { Router, type IRouter, type Request, type Response } from "express";
import { z } from "zod";
import { and, asc, eq, inArray } from "drizzle-orm";
import {
  db,
  coordinatorTagsTable,
  userCoordinatorTagsTable,
  usersTable,
} from "@workspace/db";
import { requireAdminPage } from "../lib/require-admin-page";

const router: IRouter = Router();

function isAdmin(req: Request): boolean {
  return req.isAuthenticated() && req.user.role === "admin";
}

const NameBody = z.object({
  name: z.string().trim().min(1).max(80),
});

const AssignBody = z.object({
  tagIds: z.array(z.number().int().positive()).max(50),
});

// ---------- Catalog ----------

// List every tag in the catalog (name ascending). Used by both the Config
// management card and the Users assignment modal / column.
router.get(
  "/admin/coordinator-tags",
  async (req: Request, res: Response): Promise<void> => {
    if (!isAdmin(req)) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
    const tags = await db
      .select()
      .from(coordinatorTagsTable)
      .orderBy(asc(coordinatorTagsTable.name));
    res.json({ items: tags });
  },
);

// Create a new tag. Duplicate names (case-insensitive) are rejected.
router.post(
  "/admin/coordinator-tags",
  requireAdminPage("/admin/config", "edit"),
  async (req: Request, res: Response): Promise<void> => {
    if (!isAdmin(req)) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
    const parsed = NameBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const name = parsed.data.name;
    const [existing] = await db
      .select({ id: coordinatorTagsTable.id })
      .from(coordinatorTagsTable)
      .where(eq(coordinatorTagsTable.name, name));
    if (existing) {
      res.status(409).json({ error: "A tag with this name already exists." });
      return;
    }
    const [created] = await db
      .insert(coordinatorTagsTable)
      .values({ name })
      .returning();
    res.status(201).json(created);
  },
);

// Rename a tag.
router.patch(
  "/admin/coordinator-tags/:id",
  requireAdminPage("/admin/config", "edit"),
  async (req: Request, res: Response): Promise<void> => {
    if (!isAdmin(req)) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }
    const parsed = NameBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const name = parsed.data.name;
    const [clash] = await db
      .select({ id: coordinatorTagsTable.id })
      .from(coordinatorTagsTable)
      .where(eq(coordinatorTagsTable.name, name));
    if (clash && clash.id !== id) {
      res.status(409).json({ error: "A tag with this name already exists." });
      return;
    }
    const [updated] = await db
      .update(coordinatorTagsTable)
      .set({ name })
      .where(eq(coordinatorTagsTable.id, id))
      .returning();
    if (!updated) {
      res.status(404).json({ error: "Tag not found" });
      return;
    }
    res.json(updated);
  },
);

// Delete a tag. Assignments referencing it are removed via ON DELETE CASCADE.
router.delete(
  "/admin/coordinator-tags/:id",
  requireAdminPage("/admin/config", "delete"),
  async (req: Request, res: Response): Promise<void> => {
    if (!isAdmin(req)) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }
    const [deleted] = await db
      .delete(coordinatorTagsTable)
      .where(eq(coordinatorTagsTable.id, id))
      .returning();
    if (!deleted) {
      res.status(404).json({ error: "Tag not found" });
      return;
    }
    res.json({ ok: true });
  },
);

// ---------- Assignments ----------

// All coordinator→tag assignments, shaped as a map keyed by userId so the
// Users page can render the Tag column without an N+1 fetch. Only coordinators
// can hold tags, so the result set stays small.
router.get(
  "/admin/coordinator-tags/assignments",
  async (req: Request, res: Response): Promise<void> => {
    if (!isAdmin(req)) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
    const rows = await db
      .select({
        userId: userCoordinatorTagsTable.userId,
        tagId: coordinatorTagsTable.id,
        tagName: coordinatorTagsTable.name,
      })
      .from(userCoordinatorTagsTable)
      .innerJoin(
        coordinatorTagsTable,
        eq(userCoordinatorTagsTable.tagId, coordinatorTagsTable.id),
      )
      .orderBy(asc(coordinatorTagsTable.name));

    const byUser: Record<string, { id: number; name: string }[]> = {};
    for (const r of rows) {
      (byUser[r.userId] ??= []).push({ id: r.tagId, name: r.tagName });
    }
    res.json({ assignments: byUser });
  },
);

// The tag ids currently assigned to one user — used to preselect the
// assignment modal.
router.get(
  "/admin/users/:userId/coordinator-tags",
  async (req: Request, res: Response): Promise<void> => {
    if (!isAdmin(req)) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
    const userId = String(req.params.userId);
    const rows = await db
      .select({ tagId: userCoordinatorTagsTable.tagId })
      .from(userCoordinatorTagsTable)
      .where(eq(userCoordinatorTagsTable.userId, userId));
    res.json({ tagIds: rows.map((r) => r.tagId) });
  },
);

// Replace the full set of tags for a coordinator. Idempotent — sends the
// complete desired list, we diff against what's stored. Rejects non-coordinator
// targets and unknown tag ids.
router.put(
  "/admin/users/:userId/coordinator-tags",
  requireAdminPage("/admin/users", "edit"),
  async (req: Request, res: Response): Promise<void> => {
    if (!isAdmin(req)) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
    const userId = String(req.params.userId);
    const parsed = AssignBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const tagIds = Array.from(new Set(parsed.data.tagIds));

    const [target] = await db
      .select({ id: usersTable.id, role: usersTable.role })
      .from(usersTable)
      .where(eq(usersTable.id, userId));
    if (!target) {
      res.status(404).json({ error: "User not found" });
      return;
    }
    if (target.role !== "coordinator") {
      res
        .status(400)
        .json({ error: "Tags can only be assigned to campus coordinators." });
      return;
    }

    // Validate every requested tag id exists in the catalog.
    if (tagIds.length > 0) {
      const known = await db
        .select({ id: coordinatorTagsTable.id })
        .from(coordinatorTagsTable)
        .where(inArray(coordinatorTagsTable.id, tagIds));
      if (known.length !== tagIds.length) {
        res.status(400).json({ error: "One or more tag ids are invalid." });
        return;
      }
    }

    // Replace the set atomically: clear existing, then insert the new set.
    await db.transaction(async (tx) => {
      await tx
        .delete(userCoordinatorTagsTable)
        .where(eq(userCoordinatorTagsTable.userId, userId));
      if (tagIds.length > 0) {
        await tx
          .insert(userCoordinatorTagsTable)
          .values(tagIds.map((tagId) => ({ userId, tagId })))
          .onConflictDoNothing();
      }
    });

    res.json({ ok: true, tagIds });
  },
);

export default router;
