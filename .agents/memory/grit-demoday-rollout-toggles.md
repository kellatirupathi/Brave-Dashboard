---
name: GRIT Miles vs Demo Day rollout toggles
description: How the student-facing Demo Day → GRIT Miles rollout is gated; two independent admin flags, legacy UIs preserved.
---

# GRIT Miles ↔ Demo Day rollout toggles

Students see EITHER the previous "Demo Day" experience OR the new "GRIT Miles"
experience, gated by **two independent admin flags** on the `programme_config`
singleton: `gritMilesMenuEnabled` and `gritMilesDashboardEnabled` (both boolean,
NOT NULL, **default false**).

- `gritMilesMenuEnabled` → sidebar label ("Demo Day"↔"GRIT Miles") AND which page
  `/demo-day` renders (legacy 3-level page vs new ladder page).
- `gritMilesDashboardEnabled` → which student home dashboard renders (legacy Demo
  Day dashboard vs new GRIT dashboard).

**Why default false:** rollout is manager-gated — nothing GRIT goes live until an
admin explicitly enables it. The frontend reads `gritConfig?.flag ?? false`, so it
also fails closed to the legacy Demo Day UI while loading or on fetch failure.

**How to apply:**
- The previous UIs are preserved as `pages/student/dashboard-legacy.tsx` and
  `pages/student/demo-day-legacy.tsx` (recovered from git history). Do NOT delete
  them while the toggles exist — they are the OFF branch. Keep them compiling
  against the current API.
- Frontend reads the flags via `useQuery({ queryKey: ["student-grit-config"] })`
  (shared cache key the student dashboard/demo-day pages already use; enabled only
  for role `student`). Reuse this key — don't create a parallel cache entry.
- Admin saves through `grit-config-card.tsx` invalidate `["student-grit-config"]`.
- `grit-config.ts` is **hand-written and bypasses Orval codegen** — add new fields
  to the zod `UpdateBody`, the student GET, and the admin GET/PUT by hand; no
  `pnpm codegen` step applies.
- After deploying, the **production** DB needs the same `drizzle-kit push` (build
  only typechecks, it does not migrate prod).

**Unrelated gotcha:** `sidebar.tsx` has 2 PRE-EXISTING typecheck errors
(`onOpenAutoFocus` on DropdownMenuContent; `isActive` on GroupFlyout) present at
HEAD. The app still builds because Vite uses esbuild (no typecheck). Not caused by
this feature.
