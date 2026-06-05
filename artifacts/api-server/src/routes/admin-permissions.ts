// Super Admin / per-page admin permission endpoints. Hand-written (bypasses
// Orval codegen) — additive, isolated. The new `users.is_super_admin` and
// `users.admin_permissions` columns are exposed ONLY through these endpoints
// (deliberately NOT added to the auth-user serialization, which is validated by
// a generated Zod schema that would strip them).
import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, usersTable } from "@workspace/db";
import { z } from "zod";
import {
  ADMIN_PAGES,
  isSuperAdmin,
  normalizeAdminPermissions,
  sanitizeForStorage,
} from "../lib/admin-permissions";
import { logAudit } from "../lib/audit";

const router: IRouter = Router();

const pagePermissionSchema = z
  .object({
    view: z.boolean().optional(),
    edit: z.boolean().optional(),
    delete: z.boolean().optional(),
    hidden: z.boolean().optional(),
  })
  .passthrough();

const updateBodySchema = z.object({
  isSuperAdmin: z.boolean().optional(),
  permissions: z.record(z.string(), pagePermissionSchema).optional(),
});

// GET /api/admin/access/me — any admin (incl. super admin). Returns the
// caller's own resolved permissions. Re-reads the authoritative row from the
// DB rather than trusting the session shape.
router.get("/admin/access/me", async (req, res): Promise<void> => {
  if (!req.isAuthenticated || !req.isAuthenticated() || !req.user) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const [me] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.id, req.user.id));
  if (!me || me.role !== "admin") {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  res.json({
    isSuperAdmin: isSuperAdmin(me),
    permissions: normalizeAdminPermissions(me.adminPermissions),
    pages: ADMIN_PAGES,
  });
});

// GET /api/admin/permissions/:userId — SUPER ADMIN ONLY.
router.get("/admin/permissions/:userId", async (req, res): Promise<void> => {
  if (!req.isAuthenticated || !req.isAuthenticated() || !req.user) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const [caller] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.id, req.user.id));
  if (!isSuperAdmin(caller)) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  const [target] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.id, req.params.userId));
  if (!target) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  res.json({
    userId: target.id,
    email: target.email,
    role: target.role,
    isSuperAdmin: isSuperAdmin(target),
    permissions: normalizeAdminPermissions(target.adminPermissions),
    pages: ADMIN_PAGES,
  });
});

// PUT /api/admin/permissions/:userId — SUPER ADMIN ONLY. Only valid for users
// whose role is "admin". Always persists the per-page map when provided (even
// while promoting to super admin) so un-checking "super admin" later restores
// the exact previous permissions.
router.put("/admin/permissions/:userId", async (req, res): Promise<void> => {
  if (!req.isAuthenticated || !req.isAuthenticated() || !req.user) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const actorId = req.user.id;
  const [caller] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.id, actorId));
  if (!isSuperAdmin(caller)) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const parsed = updateBodySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request body" });
    return;
  }

  const [target] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.id, req.params.userId));
  if (!target) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  if (target.role !== "admin") {
    res
      .status(400)
      .json({ error: "Permissions can only be set for admin users." });
    return;
  }

  // Lockout guard: a super admin may not strip their own super-admin status.
  // (Demoting other super admins is allowed; bootstrap re-promotes the
  // configured first super admin on every startup, so the program can never be
  // permanently locked out of super-admin management.)
  if (target.id === actorId && parsed.data.isSuperAdmin === false) {
    res.status(400).json({
      error: "You cannot remove your own super-admin status.",
    });
    return;
  }

  const updates: {
    isSuperAdmin?: boolean;
    adminPermissions?: ReturnType<typeof sanitizeForStorage>;
  } = {};
  if (typeof parsed.data.isSuperAdmin === "boolean") {
    updates.isSuperAdmin = parsed.data.isSuperAdmin;
  }
  if (parsed.data.permissions !== undefined) {
    updates.adminPermissions = sanitizeForStorage(parsed.data.permissions);
  }

  if (Object.keys(updates).length === 0) {
    res.json({
      userId: target.id,
      email: target.email,
      role: target.role,
      isSuperAdmin: isSuperAdmin(target),
      permissions: normalizeAdminPermissions(target.adminPermissions),
      pages: ADMIN_PAGES,
    });
    return;
  }

  const [updated] = await db
    .update(usersTable)
    .set(updates)
    .where(eq(usersTable.id, target.id))
    .returning();

  // Best-effort audit log.
  try {
    await logAudit(
      actorId,
      "admin.permissions.update",
      "user",
      undefined,
      JSON.stringify({
        targetUserId: target.id,
        targetEmail: target.email,
        isSuperAdmin: updated.isSuperAdmin,
        changedSuperAdmin: typeof parsed.data.isSuperAdmin === "boolean",
        changedPermissions: parsed.data.permissions !== undefined,
      }),
    );
  } catch {
    // ignore audit failures
  }

  res.json({
    userId: updated.id,
    email: updated.email,
    role: updated.role,
    isSuperAdmin: isSuperAdmin(updated),
    permissions: normalizeAdminPermissions(updated.adminPermissions),
    pages: ADMIN_PAGES,
  });
});

export default router;
