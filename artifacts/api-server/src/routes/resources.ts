// Resources route — admin-curated reading list of project/solution docs.
//
// - GET  /resources           public, no auth (used by landing page preview
//                             AND by the student/admin resources pages)
// - POST /resources           admin only — create
// - PATCH /resources/:id      admin only — update
// - DELETE /resources/:id     admin only — delete
//
// Students view-only; admins full CRUD. Validation via local zod schema
// (api-zod is auto-generated from the OpenAPI spec; new endpoint stays
// inside the route until the spec is regenerated).

import { Router, type IRouter } from "express";
import { eq, desc } from "drizzle-orm";
import { z } from "zod";
import { db, resourcesTable, programmeConfigTable } from "@workspace/db";

const router: IRouter = Router();

const CreateResourceBody = z.object({
  title: z.string().trim().min(1, "Title is required").max(200),
  description: z.string().trim().min(1, "Description is required").max(2000),
  docUrl: z.string().trim().url("Doc URL must be a valid URL").max(1000),
});

const UpdateResourceBody = CreateResourceBody.partial();

// Public list — anyone can read. Sorted newest first.
router.get("/resources", async (_req, res): Promise<void> => {
  const rows = await db
    .select()
    .from(resourcesTable)
    .orderBy(desc(resourcesTable.createdAt));
  res.json(rows);
});

// Admin: create
router.post("/resources", async (req, res): Promise<void> => {
  if (!req.isAuthenticated() || req.user.role !== "admin") {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  const parsed = CreateResourceBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [created] = await db
    .insert(resourcesTable)
    .values({
      title: parsed.data.title,
      description: parsed.data.description,
      docUrl: parsed.data.docUrl,
      createdById: req.user.id,
    })
    .returning();
  res.status(201).json(created);
});

// Admin: update
router.patch("/resources/:id", async (req, res): Promise<void> => {
  if (!req.isAuthenticated() || req.user.role !== "admin") {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const parsed = UpdateResourceBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const updates = parsed.data;
  if (Object.keys(updates).length === 0) {
    res.status(400).json({ error: "No fields to update" });
    return;
  }
  const [updated] = await db
    .update(resourcesTable)
    .set(updates)
    .where(eq(resourcesTable.id, id))
    .returning();
  if (!updated) {
    res.status(404).json({ error: "Resource not found" });
    return;
  }
  res.json(updated);
});

// ---------------------------------------------------------------------------
// Resources visibility settings — controls whether students see the Resources
// sidebar entry + /resources-library route. Admin's /admin/resources is
// always available regardless of this flag.
// ---------------------------------------------------------------------------

// Helper: read the flag, creating a default config row on first use.
async function readResourcesVisibility(): Promise<boolean> {
  const rows = await db.select().from(programmeConfigTable).limit(1);
  if (rows.length === 0) {
    const [created] = await db
      .insert(programmeConfigTable)
      .values({})
      .returning();
    return created.resourcesEnabledForStudents;
  }
  return rows[0].resourcesEnabledForStudents;
}

// Public — anyone (including students) can ask "is the Resources area
// enabled for students right now?". Used by the sidebar to conditionally
// render the menu item and by the route guard.
router.get("/resources-settings", async (_req, res): Promise<void> => {
  const enabledForStudents = await readResourcesVisibility();
  res.json({ enabledForStudents });
});

// Admin — toggle the flag.
const ResourcesSettingsBody = z.object({
  enabledForStudents: z.boolean(),
});

router.patch("/admin/resources-settings", async (req, res): Promise<void> => {
  if (!req.isAuthenticated() || req.user.role !== "admin") {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  const parsed = ResourcesSettingsBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const rows = await db.select().from(programmeConfigTable).limit(1);
  if (rows.length === 0) {
    const [created] = await db
      .insert(programmeConfigTable)
      .values({
        resourcesEnabledForStudents: parsed.data.enabledForStudents,
      })
      .returning();
    res.json({
      enabledForStudents: created.resourcesEnabledForStudents,
    });
    return;
  }
  const [updated] = await db
    .update(programmeConfigTable)
    .set({ resourcesEnabledForStudents: parsed.data.enabledForStudents })
    .where(eq(programmeConfigTable.id, rows[0].id))
    .returning();
  res.json({ enabledForStudents: updated.resourcesEnabledForStudents });
});

// Admin: delete
router.delete("/resources/:id", async (req, res): Promise<void> => {
  if (!req.isAuthenticated() || req.user.role !== "admin") {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const [deleted] = await db
    .delete(resourcesTable)
    .where(eq(resourcesTable.id, id))
    .returning();
  if (!deleted) {
    res.status(404).json({ error: "Resource not found" });
    return;
  }
  res.json({ ok: true });
});

export default router;
