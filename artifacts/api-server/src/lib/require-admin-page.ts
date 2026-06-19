// Express middleware that enforces the per-page admin permission map at the
// API layer — the real security boundary behind the Super Admin permissions
// UI. Until now `canAccessPage` was only mirrored on the frontend (button /
// sidebar / route hiding); this makes it authoritative on the server too.
//
// DESIGN — "restrict admins only, never grant":
//   • This middleware ONLY ever ADDS a restriction for `role === "admin"`
//     users based on their stored `admin_permissions` map.
//   • Non-admin roles (coordinator, student) and unauthenticated requests
//     fall straight through to the route's own existing checks — so attaching
//     it to an endpoint that is shared with coordinators/students is safe and
//     changes nothing for them.
//   • Default-allow is preserved: an admin with a null map, an unknown page
//     key, or a missing field keeps full access (see `canAccessPage`).
//   • Super admins always pass.
//
// `req.user` does NOT carry `adminPermissions` (it's stripped from the session
// serialization), so we re-read the authoritative row from the DB — same
// approach as `GET /api/admin/access/me`.
import type { Request, Response, NextFunction } from "express";
import { eq } from "drizzle-orm";
import { db, usersTable } from "@workspace/db";
import { canAccessPage, type PermissionAction } from "./admin-permissions";
import { logger } from "./logger";

export function requireAdminPage(pageKey: string, action: PermissionAction) {
  return async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      // Not logged in → let the route's own auth check produce the 401.
      if (!req.isAuthenticated || !req.isAuthenticated() || !req.user) {
        next();
        return;
      }
      // Only admins are governed by the per-page permission map. Other roles
      // pass through to the handler's existing role logic untouched.
      if (req.user.role !== "admin") {
        next();
        return;
      }
      const [me] = await db
        .select()
        .from(usersTable)
        .where(eq(usersTable.id, req.user.id));
      if (!me) {
        next();
        return;
      }
      if (!canAccessPage(me, pageKey, action)) {
        res.status(403).json({
          error: `You don't have permission to ${action} on this page.`,
        });
        return;
      }
      next();
    } catch (err) {
      // Fail-open ONLY for transient errors so a DB blip can't lock out a
      // legitimate admin — the route's own auth still runs after us.
      logger.error(
        { err, pageKey, action },
        "[require-admin-page] permission check failed — allowing through",
      );
      next();
    }
  };
}
