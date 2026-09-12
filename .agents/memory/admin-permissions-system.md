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
`admin_permissions` must be exposed ONLY via `/admin/access/me` and `/admin/permissions/:id`.
Both columns are absent from auth serialization (generated AuthUser Zod strips them), and the
`...safe` spreads in `routes/admin.ts` destructure out `adminPermissions` alongside `passwordHash`.

Exception (Sep 2026): `GET /admin/users` returns `isSuperAdmin` as a plain boolean so the Users
table can show "Super Admin" as the role. That endpoint is admin-only, and the flag is a role
label rather than a capability map. The create and update responses still strip it. The sidebar
reads the signed-in user flag from `/admin/access/me`, not from auth serialization.
**Why:** super admins were shown as plain "Admin" everywhere, and the team asked for that fixed.

## Bootstrap can never lock out
`bootstrap-superadmins.ts` runs on every startup and idempotently promotes configured emails
(`SUPER_ADMIN_EMAILS` + bootstrap admins + the first super admin) via `inArray` — it only
promotes, never demotes. Plus `PUT /admin/permissions/:id` forbids self-demotion. So even if
super admins demote each other, a restart re-promotes the configured first super admin.
