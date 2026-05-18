// Resources route — reading list of project/solution docs.
//
// - GET  /resources           public, no auth (used by landing page preview
//                             AND by the student/admin resources pages).
//                             Enriched with author name + role so students
//                             can see who shared a peer resource.
// - POST /resources           any authenticated user — students can share
//                             their own guides; admins curate official docs.
// - PATCH /resources/:id      admins can edit any; non-admins can edit only
//                             resources they created.
// - DELETE /resources/:id     same ownership rules as PATCH.
//
// Validation via local zod schema (api-zod is auto-generated from the OpenAPI
// spec; new endpoint stays inside the route until the spec is regenerated).

import { Router, type IRouter } from "express";
import { eq, desc, sql } from "drizzle-orm";
import { z } from "zod";
import {
  db,
  resourcesTable,
  programmeConfigTable,
  usersTable,
} from "@workspace/db";

const router: IRouter = Router();

// Only http(s) URLs are allowed for docUrl — student-shared resources are
// clickable for everyone, so we must reject `javascript:`, `data:`, and other
// scripty schemes that would otherwise pass `z.string().url()`.
const HttpUrl = z
  .string()
  .trim()
  .max(1000)
  .url("Doc URL must be a valid URL")
  .refine(
    (v) => {
      try {
        const proto = new URL(v).protocol;
        return proto === "http:" || proto === "https:";
      } catch {
        return false;
      }
    },
    { message: "Doc URL must start with http:// or https://" },
  );

const CreateResourceBody = z.object({
  title: z.string().trim().min(1, "Title is required").max(200),
  description: z.string().trim().min(1, "Description is required").max(2000),
  docUrl: HttpUrl,
});

const UpdateResourceBody = CreateResourceBody.partial();

// Resource list. The marketing landing page calls this unauthenticated to
// preview a few entries — but now that any student can publish a resource,
// we must NOT expose peer-shared content (or any author identity) to the
// public internet. So:
//   - Unauthenticated callers: only admin-curated rows, with author fields
//     stripped (no name, no role, no createdById).
//   - Authenticated callers: full list, enriched with author info so the UI
//     can distinguish peer-shared resources from admin-curated ones.
// Sorted newest first in both cases.
router.get("/resources", async (req, res): Promise<void> => {
  const rows = await db
    .select({
      id: resourcesTable.id,
      title: resourcesTable.title,
      description: resourcesTable.description,
      docUrl: resourcesTable.docUrl,
      createdById: resourcesTable.createdById,
      createdAt: resourcesTable.createdAt,
      updatedAt: resourcesTable.updatedAt,
      authorName: sql<
        string | null
      >`nullif(trim(coalesce(${usersTable.firstName}, '') || ' ' || coalesce(${usersTable.lastName}, '')), '')`,
      authorRole: usersTable.role,
    })
    .from(resourcesTable)
    .leftJoin(usersTable, eq(usersTable.id, resourcesTable.createdById))
    .orderBy(desc(resourcesTable.createdAt));

  if (!req.isAuthenticated()) {
    const sanitized = rows
      .filter((r) => r.authorRole === "admin")
      .map((r) => ({
        id: r.id,
        title: r.title,
        description: r.description,
        docUrl: r.docUrl,
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
      }));
    res.json(sanitized);
    return;
  }
  res.json(rows);
});

// Create — any authenticated user (student / coordinator / admin).
router.post("/resources", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
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

// Update — admin can edit any; non-admins can edit only resources they
// created themselves.
router.patch("/resources/:id", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
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
  const [existing] = await db
    .select()
    .from(resourcesTable)
    .where(eq(resourcesTable.id, id))
    .limit(1);
  if (!existing) {
    res.status(404).json({ error: "Resource not found" });
    return;
  }
  if (req.user.role !== "admin" && existing.createdById !== req.user.id) {
    res
      .status(403)
      .json({ error: "You can only edit resources you created." });
    return;
  }
  const [updated] = await db
    .update(resourcesTable)
    .set(updates)
    .where(eq(resourcesTable.id, id))
    .returning();
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

// Delete — admin can delete any; non-admins can delete only resources they
// created themselves.
router.delete("/resources/:id", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const [existing] = await db
    .select()
    .from(resourcesTable)
    .where(eq(resourcesTable.id, id))
    .limit(1);
  if (!existing) {
    res.status(404).json({ error: "Resource not found" });
    return;
  }
  if (req.user.role !== "admin" && existing.createdById !== req.user.id) {
    res
      .status(403)
      .json({ error: "You can only delete resources you created." });
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
