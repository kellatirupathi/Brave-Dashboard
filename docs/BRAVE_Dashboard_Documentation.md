# BRAVE Program Dashboard — Complete Application Documentation

**Production URL:** https://dashboard.brave.niatindia.com
**Programme:** NIAT BRAVE — a 3-month entrepreneurship programme for NIAT students
**Audience:** Students, Campus Coordinators, Programme Admins

---

## 1. What This Application Is

The BRAVE Dashboard is the operational system-of-record for the BRAVE entrepreneurship programme run across NIAT campuses in India. During the programme, students form teams, ship real projects, log real revenue, and compete on a national leaderboard. The dashboard supports the full lifecycle:

1. **Onboarding** — students sign in via the existing NIAT Forms identity (forms-gamma.earlywave.in / ccbp.in), so no new password is created.
2. **Team formation** — students create or join teams of 2–6 members within their campus.
3. **Coordinator approval** — every campus has at least one coordinator who reviews and approves teams.
4. **Project & revenue tracking** — teams add projects, log order book entries, and submit verified revenue.
5. **Verification & milestones** — admins verify revenue submissions; the system awards milestones and updates the leaderboard.
6. **Demo Day** — top performers apply for and participate in the final pitch event.

The platform is built as a pnpm monorepo with three artifacts:
- **`api-server`** — Express + TypeScript backend (REST API, sessions, OIDC, file uploads)
- **`brave-dashboard`** — React + Vite + Wouter frontend (the actual user-facing app)
- **`mockup-sandbox`** — internal-only component preview tool (not part of production)

Shared libraries live in `lib/` (most importantly `lib/db` with the Drizzle schema for PostgreSQL).

---

## 2. The Three Roles at a Glance

| Role | Who they are | Scope | What they primarily do |
|---|---|---|---|
| **Student** | A NIAT student enrolled in the BRAVE programme | One campus, one team | Form/join a team, run projects, log revenue, qualify for Demo Day |
| **Coordinator** | A faculty member assigned to one campus | One campus | Review and approve teams, monitor campus progress, broadcast announcements |
| **Admin** | NIAT central programme staff | All campuses (global) | Manage users/roster, verify revenue, configure programme, run audits, manage Demo Day |

A user's role is stored in `users.role` (`student | coordinator | admin`) and is the single switch that drives both API authorization and frontend navigation.

---

## 3. How Users Sign In (Authentication)

There are three ways to land in the dashboard. In production, only **A** is in active use.

### A. Forms SSO (production — primary)

Students click "Login with Forms" on `forms.ccbp.in/mid/brave-dashboard`. The Forms backend then drives a server-to-server handshake with our dashboard before redirecting the browser:

```
1. Forms browser  →  forms.ccbp.in/mid/brave-dashboard
2. Forms server   →  POST https://dashboard.brave.niatindia.com/api/auth/generate-token
                     Headers: Content-Type: application/json
                              x-api-key: <FORMS_API_KEY>
                     Body:    { "user_id": "<forms-user-uuid>" }
3. Our server checks the WHITELIST GATE:
   - Is this user_id in the `users` table?         → yes, allow
   - Is it in the bootstrap admin list?            → yes, allow
   - Is it on the `roster` table (whitelisted)?    → yes, allow + auto-create user row
   - Otherwise                                     → return 403 "user is not whitelisted"
4. If allowed, we mint a one-time auth_token and return it.
5. Forms redirects browser → dashboard.brave.niatindia.com/?token=<auth_token>
6. Browser POSTs the token to /api/auth/validate-token, server consumes it, sets the
   httpOnly `sid` session cookie, and the user is logged in.
7. Frontend calls GET /api/auth/user to load the AuthUser object (role, campus, team).
```

If Forms gets a non-200 from step 2, it surfaces a generic `502 / "Unable to fetch authentication token from the client backend"` to the user — this is Forms' wording for "your dashboard rejected this user" and is the most common confusing error.

### B. Replit OIDC (used internally)

`GET /api/login` initiates a standard OIDC PKCE flow with Replit, and `GET /api/callback` handles the response. This path upserts the user into our DB and starts the session. It's the same mechanism the bootstrap admin (Divyansh) uses to access the production dashboard for the first time.

### C. Dev login (development only)

`GET /api/auth/dev-login` and the `/dev/login` page allow signing in instantly as any seeded `@brave.seed` user. These routes are gated behind a runtime check and **not exposed in production**.

### Session mechanics

- After login, every request carries the `sid` cookie (or `Authorization: Bearer <sid>` for mobile).
- The `authMiddleware` resolves the session row in the `sessions` table and attaches `req.user`.
- If the session has an OIDC refresh token and is expired, the middleware refreshes silently.
- Logging out (`GET /api/logout`) clears the session and redirects through OIDC's end-session endpoint.

---

## 4. The Whitelist Gate (Why Logins Fail)

Before a user can enter the dashboard, they must be one of the following:

1. **Bootstrap admin** — hard-coded UID list in `artifacts/api-server/src/bootstrap-admins.ts` (currently just Divyansh: `853cac17-6251-4d40-8ccf-1ec1bce6e949`).
2. **Already in `users` table** — once a user has logged in once and been provisioned, their row stays there.
3. **On the `roster` table** with `is_whitelisted = true` and a valid `campus_id` — this is how brand-new students are pre-approved before they ever log in. The roster is the source of truth for "who is allowed in."

**If none of those are true, the user is rejected with HTTP 403 and Forms shows the 502 error page.** Provisioning the roster (via `/admin/roster` upload) is a hard prerequisite for any student to be able to log in.

---

## 5. Organisational Structure

### Campus
- The primary unit of organisation. 19 canonical campuses are seeded (e.g. NIAT Bangalore, etc.).
- Each campus has at least one **coordinator** assigned (`campuses.coordinator_id`).
- Every student and team belongs to exactly **one campus** (`users.campus_id`, `teams.campus_id`).
- Students can only see and join teams within their own campus.

### Roster
- A whitelist that maps a Forms `user_id` to a campus, NIAT ID, batch/section, name, and email.
- Imported in bulk from XLSX or CSV by admins via `/admin/roster`.
- A roster row with no matching campus or no `campus_id` is treated as not whitelisted and the user cannot log in until the row is fixed.

### Team
- 2–6 students, all from the same campus, with one **leader**.
- States (`teams.status`): `pending` → `active` (after coordinator approval) | `rejected` | `changes_requested`.
- A student can be on **at most one team** at a time (DB-enforced via unique constraint on `team_members.user_id`).
- Each team gets a unique 8-character `invite_code` for fast joining.

### Project
- Belongs to a team. Has order book entries (instant) and revenue entries (require admin verification).
- Verified revenue rolls up into the campus and national leaderboards and unlocks milestones.

---

## 6. Frontend Page Map (with Role Access)

The frontend uses `wouter` for routing. Access is enforced by the `ProtectedRoute` wrapper in `App.tsx` plus inline role checks. The root path `/` is a smart redirect that sends each role to their own home.

### 6.1 Public / Authentication pages

| Path | Purpose | Who sees it |
|---|---|---|
| `/login` | Entry point; "Login with Forms" button | Anyone not signed in |
| `/not-on-roster` | Friendly "you're not whitelisted yet" page with an access-request form | Authenticated user without a roster match |
| `/dev/login` | Bypass login for seeded test users | Dev environment only |

### 6.2 Student pages

Default landing depends on team membership: if the student is on an active team they go to `/`; if not, they go to `/get-started`.

| Path | Page | What it does |
|---|---|---|
| `/` | Dashboard | Overview of team progress, total revenue, recent projects, milestones |
| `/get-started` | Get Started | Onboarding for students with no team — three options: create a team, join by code, browse teams |
| `/team` | My Team | Manage current team: members, invite by name, accept join requests, milestones, leave team |
| `/projects` | Projects List | All of my team's projects, with the ability to create a new one |
| `/projects/:id` | Project Detail | Single project view: order book entries, revenue entries, submit revenue for verification |
| `/leaderboard` | Leaderboard | National + campus rankings by verified revenue |
| `/browse-teams` | Browse Teams | Other teams in my campus accepting members; submit a join request |
| `/join` | Join by Code | Enter an 8-character invite code to join a team instantly |
| `/invitations` | My Invitations | Pending invitations sent to me by other teams; accept or decline |
| `/demo-day` | Demo Day | Eligibility status, application form, event info |
| `/notifications` | Notifications | Personal feed of team and system events |

### 6.3 Coordinator pages

Coordinators see only their assigned campus.

| Path | Page | What it does |
|---|---|---|
| `/coordinator` | Dashboard | Campus-wide stats: pending team count, active teams, top performers |
| `/coordinator/teams` | Teams | The approval workspace: review pending teams, approve / request changes / reject, leave comments |
| `/coordinator/leaderboard` | Leaderboard | Same leaderboard view but scoped to the campus |
| `/coordinator/announcements` | Announcements | Compose and broadcast messages to all students on the campus |

### 6.4 Admin pages

Admins see everything across all campuses.

| Path | Page | What it does |
|---|---|---|
| `/admin` | Dashboard | Programme-wide health: total revenue, user counts, campus breakdown, queue size |
| `/admin/queue` | Review Queue | Inbox of revenue entries awaiting verification — verify or reject with notes |
| `/admin/teams` | Teams (global) | Every team across every campus with filters and bulk actions |
| `/admin/teams/:id` | Team Detail | Deep-dive into a single team — members, projects, revenue history, audit trail (also reachable by coordinators and team members for their own team) |
| `/admin/leaderboard` | Leaderboard | National leaderboard with admin tooling (freeze, override) |
| `/admin/demo-day` | Demo Day | Manage applications, mark qualifiers, schedule the event |
| `/admin/users` | Users | Create/edit/delete users; bulk CSV import of admins, coordinators, and students |
| `/admin/roster` | Roster | The whitelist editor — bulk XLSX/CSV import, per-row edits, manage the access requests inbox |
| `/admin/campuses` | Campuses | List of 19 campuses with stats and coordinator assignments |
| `/admin/campuses/:id` | Campus Detail | Single-campus deep dive — teams, students, recent activity |
| `/admin/announcements` | Announcements | Global broadcast across all campuses |
| `/admin/config` | Config | Programme-wide settings: start/end dates, revenue thresholds, leaderboard freeze, Demo Day open/close |
| `/admin/audit-log` | Audit Log | Immutable record of consequential actions (approvals, role changes, deletions) |

### 6.5 Sidebar navigation per role

The sidebar component dynamically renders the right items per role.

**Student (on a team):** Dashboard · Projects · Leaderboard · My Team · Demo Day
**Student (no team):** Get started · Leaderboard
**Coordinator:** Dashboard · Teams · Leaderboard · Announcements
**Admin:** Dashboard · Review Queue · Teams · Leaderboard · Demo Day · Campuses · Users · Roster · Announcements · Config · Audit Log

---

## 7. Backend API Surface

All endpoints are under `/api`. Authorization is enforced on every route via the `authMiddleware` plus inline role checks. The full list is below; "Role" is the minimum role / context required.

### 7.1 Authentication & identity

| Method | Path | Role | Purpose |
|---|---|---|---|
| POST | `/api/auth/generate-token` | Public + API key | Forms SSO — mint a one-time token for a whitelisted user |
| POST | `/api/auth/validate-token` | Public | Browser exchanges the one-time token for a session cookie |
| GET | `/api/auth/user` | Public | Returns the current user (or null) |
| GET | `/api/login` | Public | Start Replit OIDC flow |
| GET | `/api/callback` | Public | OIDC callback; provisions user + starts session |
| GET | `/api/logout` | Authenticated | Clear session and OIDC sign-out |
| POST | `/api/access-request` | Public | Submit a request for dashboard access (used by `/not-on-roster`) |
| POST | `/api/mobile-auth/token-exchange` | Public | OIDC for mobile clients |

### 7.2 Teams & team flow

| Method | Path | Role | Purpose |
|---|---|---|---|
| GET | `/api/teams` | Authenticated | List teams (coordinators see their campus only) |
| POST | `/api/teams` | Student / Admin | Create a team (creator becomes leader) |
| GET | `/api/teams/browse` | Student | Joinable teams in my campus |
| GET | `/api/teams/my` | Authenticated | My team + projects |
| GET | `/api/teams/:id` | Authenticated | Team detail (invite code hidden from non-members) |
| PATCH | `/api/teams/:id` | Member / Admin | Edit team profile (tagline, photo) |
| POST | `/api/teams/:id/approve` | Coordinator / Admin | Approve a pending team |
| POST | `/api/teams/:id/reject` | Coordinator / Admin | Reject with reason |
| POST | `/api/teams/:id/members` | Admin | Force-add a member |
| DELETE | `/api/teams/:id/members/:userId` | Member / Admin | Leave team or remove a member |
| POST | `/api/teams/:id/transfer-leadership` | Leader / Admin | Move leadership to another member |
| POST | `/api/teams/join-by-code` | Student | Join via 8-char invite code |
| POST | `/api/teams/:id/invitations` | Member | Invite another student by name / NIAT ID |
| GET | `/api/invitations/my` | Student | My pending invitations |
| POST | `/api/invitations/:id/accept` | Student | Accept an invitation |
| POST | `/api/invitations/:id/decline` | Student | Decline an invitation |
| POST | `/api/teams/:id/join-requests` | Student | Request to join a specific team |
| POST | `/api/join-requests/:id/approve` | Member | Approve a join request |
| POST | `/api/join-requests/:id/decline` | Member | Decline a join request |

### 7.3 Projects & financials

| Method | Path | Role | Purpose |
|---|---|---|---|
| GET | `/api/projects` | Authenticated | List projects (students see their own team's) |
| POST | `/api/projects` | Member | Create a project |
| GET | `/api/projects/:id` | Authenticated | Project detail with financials |
| PATCH | `/api/projects/:id` | Member / Admin | Update status / details |
| GET | `/api/order-book-entries` | Authenticated | List order book entries |
| POST | `/api/order-book-entries` | Member | Add an order book entry (auto-verified) |
| GET | `/api/revenue-entries` | Authenticated | List revenue entries |
| POST | `/api/revenue-entries` | Member | Add revenue (requires BRD document upload) |
| POST | `/api/revenue-entries/:id/submit` | Member | Submit for admin verification |
| POST | `/api/revenue-entries/:id/verify` | Admin | Verify & award milestones |
| POST | `/api/revenue-entries/:id/reject` | Admin | Reject with notes |

### 7.4 Admin tooling

| Method | Path | Role | Purpose |
|---|---|---|---|
| GET | `/api/admin/review-queue` | Admin | Revenue entries awaiting verification |
| GET, POST, PATCH, DELETE | `/api/admin/users` (`/:id`) | Admin | Manage users; bulk CSV import |
| GET, POST, PATCH, DELETE | `/api/admin/roster` (`/:id`) | Admin | Manage the whitelist; bulk XLSX/CSV import |
| GET | `/api/admin/access-requests` | Admin | Inbox of access requests from `/not-on-roster` |
| PATCH | `/api/admin/access-requests/:id` | Admin | Approve / reject an access request |
| GET, PATCH | `/api/admin/programme-config` | Admin (PATCH) / Authenticated (GET) | Programme-wide settings |
| GET | `/api/admin/audit-log` | Admin | System audit trail |
| GET | `/api/admin/demo-day/applications` | Admin | All Demo Day applications |

### 7.5 Shared

| Method | Path | Role | Purpose |
|---|---|---|---|
| GET | `/api/dashboard/summary` | Coordinator / Admin | Stats for staff dashboards |
| GET | `/api/dashboard/team-summary` | Student | Stats for the student dashboard |
| GET | `/api/leaderboard` | Authenticated | National or campus rankings |
| GET | `/api/campuses` | Authenticated | Campus directory + stats |
| GET | `/api/milestones` | Authenticated | Team milestones |
| POST | `/api/notifications/:id/read` | Authenticated | Mark notification read |
| POST | `/api/storage/uploads/request-url` | Authenticated | Presigned URL for file upload |

---

## 8. Role × Page Access Matrix

| Page | Student | Coordinator | Admin |
|---|:---:|:---:|:---:|
| `/login`, `/not-on-roster` | ✓ | ✓ | ✓ |
| `/` (student dashboard) | ✓ | — | — |
| `/get-started` | ✓ (no team) | — | — |
| `/team` | ✓ (on a team) | — | — |
| `/projects`, `/projects/:id` | ✓ | — | view via `/admin` |
| `/leaderboard` | ✓ | — | — |
| `/browse-teams`, `/join`, `/invitations` | ✓ | — | — |
| `/demo-day` | ✓ | — | — |
| `/notifications` | ✓ | — | — |
| `/coordinator` | — | ✓ | — |
| `/coordinator/teams` | — | ✓ | — |
| `/coordinator/leaderboard` | — | ✓ | — |
| `/coordinator/announcements` | — | ✓ | — |
| `/admin/*` (all admin pages) | — | — | ✓ |
| `/admin/teams/:id` | own team only | own campus | ✓ |

Legend: ✓ = full access · — = blocked (redirected to their role's home) · "own X" = scoped read

---

## 9. End-to-End Flows by Role

### 9.1 Student journey

1. **First login** — clicks "Login with Forms" → completes Forms SSO → lands on `/` if on a team, else `/get-started`.
2. **Form a team** — from `/get-started`, picks one of:
   - **Create a team** — becomes leader of a new `pending` team.
   - **Join by code** — enters an 8-char code → instantly added as a member (still subject to coordinator approval at the team level).
   - **Browse teams** — sends a join request → existing member approves.
   - **Accept invitation** — from `/invitations`, accepts an invite sent by another team.
3. **Wait for coordinator approval** — until the team is `active`, it appears as pending and can't enter the leaderboard.
4. **Run the programme** — once active, creates projects on `/projects`, logs order book entries (instant) and revenue entries (require BRD upload + admin verify).
5. **Compete** — verified revenue updates the campus + national leaderboards in real time.
6. **Demo Day** — eligible teams apply on `/demo-day`; admins shortlist.

### 9.2 Coordinator journey

1. Lands on `/coordinator` — sees how many teams in their campus are pending review and which are leading on revenue.
2. Goes to `/coordinator/teams` — works the queue: approve, reject (with reason), or request changes.
3. Uses `/coordinator/leaderboard` to monitor campus performance.
4. Posts updates via `/coordinator/announcements` to keep their campus aligned.

### 9.3 Admin journey (one-time setup → daily ops)

**One-time per cohort:**
1. Go to `/admin/campuses` → ensure the 19 campuses are present and each has a coordinator assigned.
2. Go to `/admin/roster` → upload the master XLSX (Forms `user_id`, NIAT ID, name, email, campus name, batch/section). **This is what unblocks student logins** — until the roster is populated, every student SSO attempt returns 403.
3. Go to `/admin/users` → bulk-import coordinators and any additional admins via CSV.
4. Go to `/admin/config` → set programme start/end dates, revenue thresholds, Demo Day window.

**Daily ops:**
1. `/admin/queue` — verify or reject revenue submissions.
2. `/admin/teams` and `/admin/teams/:id` — investigate disputes or unstick teams.
3. `/admin/access-requests` (inside Roster) — approve users who self-served from `/not-on-roster`.
4. `/admin/audit-log` — periodic review of significant actions.
5. `/admin/announcements` — global communications.
6. `/admin/demo-day` — manage the final event lifecycle.

---

## 10. Tech Stack Summary

| Layer | Choice |
|---|---|
| Backend | Node.js + Express + TypeScript |
| ORM / DB | Drizzle ORM + PostgreSQL (Neon-compatible) |
| Frontend | React 18 + Vite + Wouter (router) + TanStack Query |
| UI kit | Tailwind CSS + shadcn/ui components |
| Auth | OpenID Connect (Replit) for staff; Forms SSO (one-time token) for students |
| File storage | Object storage (presigned uploads) for BRD docs and team photos |
| Sessions | Server-side rows in `sessions` table, `httpOnly sid` cookie, OIDC refresh-token rotation |
| Hosting | Replit Deployments — production at `dashboard.brave.niatindia.com` |

---

## 11. Common Operational Issues (Quick Reference)

| Symptom | What it actually means | Fix |
|---|---|---|
| Forms shows `502 / "Unable to fetch authentication token from the client backend"` | Our `/api/auth/generate-token` returned a non-200 (almost always a `403` because the user isn't on the roster) | Add the user to `/admin/roster` — provide their Forms `user_id`, NIAT ID, campus, name, email |
| Student logs in but lands on `/not-on-roster` | They authenticated to Forms but our roster has no row for them, and they're not a bootstrap admin | Same fix: add to roster, then they can re-attempt |
| Coordinator can't see a team | Team is on a different campus, or the coordinator isn't yet assigned to the campus (`campuses.coordinator_id` is null) | Set the coordinator on `/admin/campuses/:id` |
| Revenue not on leaderboard | Entry status is still `pending` or `submitted` — only `verified` rolls up | Admin verifies on `/admin/queue` |
| Bulk roster import "skipped N rows" | Each skipped row had an institute name that didn't exactly match one of the 19 canonical campuses, or was missing required columns | Fix the spreadsheet's institute column to match canonical names exactly, then re-upload |
