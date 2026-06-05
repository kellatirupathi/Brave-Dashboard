---
name: Super Admin + per-page admin permissions
description: How the additive super-admin / per-page admin permission layer works, and its deliberate scope boundaries.
---

# Super Admin + per-page admin permissions

A super admin is the existing `admin` role plus `users.is_super_admin = true` — there is
NO 4th enum role. Per-page permissions live in `users.admin_permissions` (jsonb, nullable).

## Default-allow is load-bearing
A `null` / absent `admin_permissions` map means FULL access (same as before the feature).
Every existing admin therefore keeps full access with zero migration. Never treat null as
"deny" anywhere — backend (`canAccessPage`/`normalizeAdminPermissions`) and frontend
(`isHidden`/`canAccess`) both resolve null → allow. Permission semantics: `hidden` overrides
everything; `edit`/`delete` require `view`; a super admin is never restricted.

## Enforcement scope (IMPORTANT — current limitation)
Gating is **UI-level only**: sidebar nav filtering + `ProtectedRoute` route-blocking in the
frontend. The existing admin API routes in `routes/admin.ts` still authorize by
`role === "admin"` alone and do NOT call `canAccessPage`. A restricted admin can still hit
those endpoints directly. Full server-side per-route enforcement was intentionally left out
of the original scope (live prod, 7500 students; getting default-allow wrong across dozens of
routes risks locking admins out). If asked to "make permissions actually enforced", that means
adding `canAccessPage` guards to each admin route — a separate, larger, riskier change.
**Why:** the agreed task delivered the management UI + endpoints + UI gating, not route guards.

## Don't leak the new columns
The two new columns must be exposed ONLY via `/admin/access/me` and `/admin/permissions/:id`.
They are deliberately absent from auth serialization (generated AuthUser Zod strips them) AND
must be stripped from general user-listing responses in `routes/admin.ts` (the `...safe`
spreads destructure out `isSuperAdmin`/`adminPermissions` alongside `passwordHash`).

## Bootstrap can never lock out
`bootstrap-superadmins.ts` runs on every startup and idempotently promotes configured emails
(`SUPER_ADMIN_EMAILS` + bootstrap admins + the first super admin) via `inArray` — it only
promotes, never demotes. Plus `PUT /admin/permissions/:id` forbids self-demotion. So even if
super admins demote each other, a restart re-promotes the configured first super admin.
