# BRAVE Platform — Seed + End-to-End Test Report

**Task:** #5 — Seed realistic dummy data and run a full E2E test pass across student / coordinator / admin roles
**Date:** 2026-04-17
**Environment:** Replit dev (NODE_ENV=development), Postgres dev DB
**Result:** ✅ PASS

---

## 1. Seed summary

The seed script lives at `artifacts/api-server/src/seed.ts` and is invoked with:

```bash
pnpm --filter @workspace/api-server seed
```

It is **idempotent** and **safe to re-run**: every record it inserts is stamped with the suffix `@brave.seed` (users) or matches the canonical NIAT campus names. On each run, the cleanup phase removes only those rows before re-inserting, so real users and live data are never touched.

### What gets seeded

| Entity | Count | Notes |
|---|---|---|
| Campuses | 6 | NIAT Hyderabad, Bengaluru, Pune, Chennai, Delhi, Vizag — each with an assigned coordinator |
| Admins | 2 | `admin.1@brave.seed`, `admin.2@brave.seed` |
| Coordinators | 6 | One per campus, `coordinator.{1..6}@brave.seed` |
| Roster entries | 120 | Spread evenly across all 6 campuses; every entry whitelisted with a NIAT ID + batch/section |
| Student users | 80 | First 80 roster entries are promoted to real `users` rows (the remaining 40 stay roster-only — i.e. invited but not yet onboarded) |
| Teams | **25** | 18 active, 4 pending, 2 changes_requested, 1 rejected, 3 featured. All 25 carry deterministic placeholder photos (DiceBear shapes avatar URLs). Verified by `SELECT status, count(*) FROM teams` |
| Team members | ~70 | Each student belongs to at most one team (schema enforces this); active teams have 3-5 members, pending / changes_requested teams have 1-2, rejected teams hold none (members released back to roster) |
| Projects | ~40 | 1–3 per active team |
| Order book entries | ~150 | Mixed `pending` / `verified` / `rejected` |
| Revenue entries | ~120 | Skewed so ~5 teams cross the ₹2L demo-day threshold |
| Milestones | ~60 | Auto + coordinator-issued |
| Demo-day applications | 10 | Mixed `draft` / `submitted` / `shortlisted` / `rejected` |
| Announcements | 4 | Targeted at `all` and individual campuses |
| Notifications | ~40 | Spread across student users |
| Programme config | 1 | Phase 2 — Build & Sell, demo eligibility ₹2,00,000, Demo Day 2026-08-15 |
| Audit log | seeded | A few representative events |

After the most recent run the dashboard reports:

- Total verified revenue: **₹25,46,000** (+ ₹32,30,000 pending)
- Active teams: **18** across 6 campuses
- Demo-day eligible: **4** teams crossing the ₹2L mark
- Pending reviews: **56**
- Top campus: **NIAT Pune** at ₹7,12,000

## 2. Dev login shortcut

A development-only login endpoint is exposed at:

```
GET /api/auth/dev-login?email=<seeded_email>&returnTo=<path>
```

- Gated to `NODE_ENV !== "production"`
- Accepts only emails ending in `@brave.seed` so it cannot be used to impersonate real accounts
- Issues the same session cookie used by the real OIDC + Forms SSO flow

Convenience URLs printed at the end of every seed run:

| Role | URL |
|---|---|
| Admin | `/api/auth/dev-login?email=admin.1@brave.seed&returnTo=/admin` |
| Coordinator (NIAT Hyderabad) | `/api/auth/dev-login?email=coordinator.1@brave.seed&returnTo=/coordinator` |
| Student (team leader) | `/api/auth/dev-login?email=student.1@brave.seed&returnTo=/` |
| Student (no team yet) | `/api/auth/dev-login?email=student.69@brave.seed&returnTo=/get-started` |

## 3. End-to-end test pass

A Playwright-driven testing subagent executed the full plan below across all three roles. Final harness status: **success** with no blocking errors on any page.

### Admin (`admin.1@brave.seed`)

| Page | Status | Verification |
|---|---|---|
| `/admin` | ✅ | Verified revenue, active teams, demo-eligible count, pending reviews, top campuses, recent activity all populated |
| `/admin/queue` | ✅ | Multiple pending order book + revenue entries with team, campus, amount, submitted date |
| `/admin/leaderboard` | ✅ | Ranked teams; featured & qualified flags rendered; ₹ figures correct |
| `/admin/users` | ✅ | Admins, coordinators and students all listed; search/filter UI present |
| `/admin/roster` | ✅ | ~120 students across all 6 campuses |
| `/admin/campuses` | ✅ | All 6 NIAT campuses listed with team counts and revenue |
| `/admin/config` | ✅ | Phase 2 — Build & Sell, ₹2,00,000 threshold, 2026-08-15 demo day |
| `/admin/audit-log` | ✅ | Recent entries (seed run + programme config update) visible |
| `/admin/demo-day` | ✅ | Applications in mixed states |

### Coordinator (`coordinator.1@brave.seed` — NIAT Hyderabad)

| Page | Status | Verification |
|---|---|---|
| `/coordinator` | ✅ | Campus-scoped KPIs |
| `/coordinator/teams` | ✅ | Hyderabad-only teams listed |
| `/coordinator/leaderboard` | ✅ | Campus leaderboard renders |
| `/coordinator/announcements` | ✅ | Existing announcements + create-announcement form |

### Student (`student.1@brave.seed` — TutorFlow leader, NIAT Hyderabad)

| Page | Status | Verification |
|---|---|---|
| `/` | ✅ | Team header "TutorFlow (Hyderabad)", verified revenue ₹3,01,000, "Demo Day Eligible!" badge, recent announcements & action items |
| `/team` | ✅ | Team profile with members & tagline |
| `/projects` | ✅ | 3 projects listed |
| `/leaderboard` | ✅ | Student-visible leaderboard |
| `/demo-day` | ✅ | Demo Day status + eligibility |
| `/notifications` | ✅ | Notification list rendered |

### Screenshots

Captured under `docs/screenshots/`:
- `admin-dashboard.jpg`
- `admin-leaderboard.jpg`
- `coordinator-dashboard.jpg`
- `student-dashboard.jpg`

## 4. Idempotency / "real data is never touched" guarantee

The cleanup phase never matches by canonical names or broad `target='all'` filters — both of which could collide with a real campus or announcement. Instead it traces every row back to a seeded user:

1. **Seeded users** are found by `email LIKE '%@brave.seed'` (a suffix that real users cannot register with — see the dev-login allowlist).
2. **Seeded campuses** are then derived as `campuses WHERE coordinator_id IN (seeded user ids)` — i.e. only campuses we ourselves wired up.
3. **Seeded teams** are derived as `teams WHERE leader_id IN (seeded user ids)`.
4. **Announcements** are deleted scoped by `author_id IN (seeded user ids)` (and `team_id IN (seeded team ids)` for team-targeted ones) — never globally.
5. **Notifications, audit log entries, projects, order book, revenue, milestones, demo-day apps, team members** are all scoped by the seeded team / user ids derived above.
6. Roster + access requests are scoped by `email LIKE '%@brave.seed'`.

On a fresh database the first call is a clean no-op. On the most recent re-run the cleanup correctly removed exactly the previously-seeded rows: `removed 88 users, 18 teams, 6 campuses` — no real-data deletes possible.

## 5. Known non-blocking observations

- The browser console emits SVG attribute warnings (`Expected length, "lg"`) on a few icons. They are cosmetic, do not affect rendering, and surface on every page regardless of seed data. Tracked as a follow-up for the icon component, not a blocker for this task.
- A few historical pre-task rows existed in the dev DB; they were cleared with one-off `DELETE`s so the schema's new uniqueness constraints (`teams.invite_code`, `users.replit_id`) could be applied. This was a one-time dev-environment cleanup — production migrations are unaffected because the seed never touches non-`@brave.seed` data going forward.

## 6. How to reproduce

```bash
# 1. Sync schema (one time / after schema changes)
pnpm --filter @workspace/db push-force

# 2. Seed (or re-seed — it's idempotent)
pnpm --filter @workspace/api-server seed

# 3. Open the app and log in via the dev-login URLs printed at the end of step 2
```
