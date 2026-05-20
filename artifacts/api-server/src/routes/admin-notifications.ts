// Admin: manage the email subscriber list for the daily "overdue review queue"
// digest. Only admins can read or mutate this list. Additive — no changes to
// existing notification flows.
import { Router, type IRouter } from "express";
import { eq, desc } from "drizzle-orm";
import { z } from "zod/v4";
import {
  db,
  overdueNotificationSubscribersTable,
} from "@workspace/db";

const router: IRouter = Router();

const CreateSubscriberBody = z.object({
  email: z.string().email().max(320),
  name: z.string().max(200).optional(),
  isActive: z.boolean().optional(),
});

const UpdateSubscriberBody = z.object({
  email: z.string().email().max(320).optional(),
  name: z.string().max(200).nullable().optional(),
  isActive: z.boolean().optional(),
});

function isAdmin(
  req: Parameters<Parameters<typeof router.get>[1]>[0],
): boolean {
  return req.isAuthenticated() && req.user.role === "admin";
}

router.get(
  "/admin/notification-subscribers",
  async (req, res): Promise<void> => {
    if (!isAdmin(req)) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
    const rows = await db
      .select()
      .from(overdueNotificationSubscribersTable)
      .orderBy(desc(overdueNotificationSubscribersTable.createdAt));
    res.json(rows);
  },
);

router.post(
  "/admin/notification-subscribers",
  async (req, res): Promise<void> => {
    if (!isAdmin(req)) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
    const parsed = CreateSubscriberBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const normalizedEmail = parsed.data.email.trim().toLowerCase();
    const [existing] = await db
      .select()
      .from(overdueNotificationSubscribersTable)
      .where(eq(overdueNotificationSubscribersTable.email, normalizedEmail))
      .limit(1);
    if (existing) {
      res
        .status(409)
        .json({ error: "A subscriber with that email already exists" });
      return;
    }
    const [created] = await db
      .insert(overdueNotificationSubscribersTable)
      .values({
        email: normalizedEmail,
        name: parsed.data.name ?? null,
        isActive: parsed.data.isActive ?? true,
        createdById: req.user!.id,
      })
      .returning();
    res.status(201).json(created);
  },
);

router.patch(
  "/admin/notification-subscribers/:id",
  async (req, res): Promise<void> => {
    if (!isAdmin(req)) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }
    const parsed = UpdateSubscriberBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const update: Partial<typeof overdueNotificationSubscribersTable.$inferInsert> =
      {};
    if (parsed.data.email !== undefined)
      update.email = parsed.data.email.trim().toLowerCase();
    if (parsed.data.name !== undefined) update.name = parsed.data.name;
    if (parsed.data.isActive !== undefined)
      update.isActive = parsed.data.isActive;
    if (Object.keys(update).length === 0) {
      res.status(400).json({ error: "No fields to update" });
      return;
    }
    const [updated] = await db
      .update(overdueNotificationSubscribersTable)
      .set(update)
      .where(eq(overdueNotificationSubscribersTable.id, id))
      .returning();
    if (!updated) {
      res.status(404).json({ error: "Subscriber not found" });
      return;
    }
    res.json(updated);
  },
);

router.delete(
  "/admin/notification-subscribers/:id",
  async (req, res): Promise<void> => {
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
      .delete(overdueNotificationSubscribersTable)
      .where(eq(overdueNotificationSubscribersTable.id, id))
      .returning();
    if (!deleted) {
      res.status(404).json({ error: "Subscriber not found" });
      return;
    }
    res.json({ ok: true, id });
  },
);

export default router;
