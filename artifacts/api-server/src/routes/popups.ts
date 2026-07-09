import { Router, type IRouter } from "express";
import { eq, and, desc, asc, sql, notInArray } from "drizzle-orm";
import {
  db,
  popupTemplatesTable,
  popupAcknowledgementsTable,
} from "@workspace/db";
import { logAudit } from "../lib/audit";

const router: IRouter = Router();

// Admin-managed student pop-ups. Admins CRUD templates from the Config page;
// enabled templates are shown to students one at a time until each student
// acknowledges them. Entirely separate from the Terms & Conditions gate.

function requireAdmin(
  req: Parameters<Parameters<typeof router.get>[1]>[0],
  res: Parameters<Parameters<typeof router.get>[1]>[1],
): boolean {
  if (!req.isAuthenticated || !req.isAuthenticated() || !req.user) {
    res.status(401).json({ error: "Unauthorized" });
    return false;
  }
  if (req.user.role !== "admin") {
    res.status(403).json({ error: "Forbidden" });
    return false;
  }
  return true;
}

// ---------- Admin CRUD ----------

// List all templates (with acknowledgement counts) for the admin Config page.
router.get("/admin/popups", async (req, res): Promise<void> => {
  if (!requireAdmin(req, res)) return;
  const templates = await db
    .select()
    .from(popupTemplatesTable)
    .orderBy(desc(popupTemplatesTable.createdAt));
  const counts = await db
    .select({
      popupId: popupAcknowledgementsTable.popupId,
      count: sql<number>`count(*)::int`,
    })
    .from(popupAcknowledgementsTable)
    .groupBy(popupAcknowledgementsTable.popupId);
  const countByPopup = new Map<number, number>();
  for (const c of counts) countByPopup.set(c.popupId, c.count);
  res.json(
    templates.map((t) => ({
      ...t,
      acknowledgedCount: countByPopup.get(t.id) ?? 0,
    })),
  );
});

router.post("/admin/popups", async (req, res): Promise<void> => {
  if (!requireAdmin(req, res)) return;
  const body = req.body ?? {};
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const message = typeof body.message === "string" ? body.message.trim() : "";
  if (!name) {
    res.status(400).json({ error: "A popup name is required." });
    return;
  }
  if (!message) {
    res.status(400).json({ error: "A popup message is required." });
    return;
  }
  const [created] = await db
    .insert(popupTemplatesTable)
    .values({
      name,
      message,
      requireCheckbox: body.requireCheckbox === true,
      checkboxLabel:
        typeof body.checkboxLabel === "string" && body.checkboxLabel.trim()
          ? body.checkboxLabel.trim()
          : null,
      enabled: body.enabled === true,
    })
    .returning();
  await logAudit(
    req.user!.id,
    "create_popup_template",
    "popup_template",
    created.id,
    `Created popup "${name}"`,
  );
  res.status(201).json(created);
});

router.patch("/admin/popups/:id", async (req, res): Promise<void> => {
  if (!requireAdmin(req, res)) return;
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const body = req.body ?? {};
  const updates: Record<string, unknown> = {};
  if (typeof body.name === "string") {
    const n = body.name.trim();
    if (!n) {
      res.status(400).json({ error: "A popup name is required." });
      return;
    }
    updates.name = n;
  }
  if (typeof body.message === "string") {
    const m = body.message.trim();
    if (!m) {
      res.status(400).json({ error: "A popup message is required." });
      return;
    }
    updates.message = m;
  }
  if (typeof body.requireCheckbox === "boolean")
    updates.requireCheckbox = body.requireCheckbox;
  if (typeof body.enabled === "boolean") updates.enabled = body.enabled;
  if (body.checkboxLabel === null) updates.checkboxLabel = null;
  else if (typeof body.checkboxLabel === "string")
    updates.checkboxLabel = body.checkboxLabel.trim() || null;
  if (Object.keys(updates).length === 0) {
    res.status(400).json({ error: "No changes provided." });
    return;
  }
  const [updated] = await db
    .update(popupTemplatesTable)
    .set(updates as Partial<typeof popupTemplatesTable.$inferInsert>)
    .where(eq(popupTemplatesTable.id, id))
    .returning();
  if (!updated) {
    res.status(404).json({ error: "Popup not found" });
    return;
  }
  await logAudit(
    req.user!.id,
    "update_popup_template",
    "popup_template",
    id,
    `Updated popup "${updated.name}"`,
  );
  res.json(updated);
});

router.delete("/admin/popups/:id", async (req, res): Promise<void> => {
  if (!requireAdmin(req, res)) return;
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const [existing] = await db
    .select()
    .from(popupTemplatesTable)
    .where(eq(popupTemplatesTable.id, id));
  if (!existing) {
    res.status(404).json({ error: "Popup not found" });
    return;
  }
  await db.transaction(async (tx) => {
    await tx
      .delete(popupAcknowledgementsTable)
      .where(eq(popupAcknowledgementsTable.popupId, id));
    await tx.delete(popupTemplatesTable).where(eq(popupTemplatesTable.id, id));
  });
  await logAudit(
    req.user!.id,
    "delete_popup_template",
    "popup_template",
    id,
    `Deleted popup "${existing.name}"`,
  );
  res.status(204).end();
});

// ---------- Student-facing ----------

// Enabled popups this student has NOT yet acknowledged, oldest first. The
// client shows them one at a time (confirm one → the next appears). Only
// students receive popups.
router.get("/popups/pending", async (req, res): Promise<void> => {
  if (!req.isAuthenticated || !req.isAuthenticated() || !req.user) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  if (req.user.role !== "student") {
    res.json([]);
    return;
  }
  const acked = await db
    .select({ popupId: popupAcknowledgementsTable.popupId })
    .from(popupAcknowledgementsTable)
    .where(eq(popupAcknowledgementsTable.userId, req.user.id));
  const ackedIds = acked.map((a) => a.popupId);
  const whereClause =
    ackedIds.length > 0
      ? and(
          eq(popupTemplatesTable.enabled, true),
          notInArray(popupTemplatesTable.id, ackedIds),
        )
      : eq(popupTemplatesTable.enabled, true);
  const pending = await db
    .select({
      id: popupTemplatesTable.id,
      name: popupTemplatesTable.name,
      message: popupTemplatesTable.message,
      requireCheckbox: popupTemplatesTable.requireCheckbox,
      checkboxLabel: popupTemplatesTable.checkboxLabel,
    })
    .from(popupTemplatesTable)
    .where(whereClause)
    .orderBy(asc(popupTemplatesTable.createdAt));
  res.json(pending);
});

// Record a student's acknowledgement of a popup. Idempotent: a repeat confirm
// (unique popup_id + user_id) is a no-op success.
router.post("/popups/:id/ack", async (req, res): Promise<void> => {
  if (!req.isAuthenticated || !req.isAuthenticated() || !req.user) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const [popup] = await db
    .select({ id: popupTemplatesTable.id })
    .from(popupTemplatesTable)
    .where(eq(popupTemplatesTable.id, id));
  if (!popup) {
    res.status(404).json({ error: "Popup not found" });
    return;
  }
  await db
    .insert(popupAcknowledgementsTable)
    .values({ popupId: id, userId: req.user.id })
    .onConflictDoNothing();
  res.json({ ok: true });
});

export default router;
