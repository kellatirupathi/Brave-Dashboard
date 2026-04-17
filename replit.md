# BRAVE Program Dashboard

## Overview

Full-stack web platform for NIAT's 3-month BRAVE entrepreneurship programme. Serves 7,500 student entrepreneurs across 19-20 campuses with a 3-role system: Students/Teams, Campus Coordinators, and NIAT Admins.

pnpm workspace monorepo using TypeScript. Each package manages its own dependencies.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)
- **Frontend**: React + Vite + Tailwind CSS + shadcn/ui
- **Auth**: Replit OIDC (openid-client)
- **Storage**: Google Cloud Object Storage

## Artifacts

- **brave-dashboard** (`/`): Frontend React app
- **api-server** (`/api`): Express API server (port 8080)

## Key Commands

- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- `pnpm --filter @workspace/api-server run dev` — run API server locally

## Workspace Packages

- `lib/api-spec` — OpenAPI spec + Orval codegen config
- `lib/api-zod` — Generated Zod schemas (from codegen)
- `lib/api-client-react` — Generated React Query hooks (from codegen)
- `lib/db` — Drizzle ORM schema + client
- `lib/replit-auth-web` — Frontend auth hook (useAuth)
- `lib/object-storage-web` — Frontend file upload utilities
- `artifacts/api-server` — Express API server
- `artifacts/brave-dashboard` — React Vite frontend

## DB Schema (lib/db/src/schema/)

### brave.ts — All BRAVE tables:
- `campuses` — 19-20 NIAT campuses
- `users` — All users (students/coordinators/admins) with role enum
- `roster` — Whitelist of enrolled students
- `teams` — Student teams with status (pending/active/rejected/changes_requested) + unique `inviteCode` (BRAVE-XXXXX)
- `teamMembers` — Team membership (unique per user)
- `teamInvitations` — Outgoing invites from team members to specific students (status: pending/accepted/declined/cancelled)
- `teamJoinRequests` — Incoming join requests from students to teams (status: pending/approved/declined/cancelled)
- `teamLeaveRequests` — Member-initiated leave requests requiring leader approval (status: pending/approved/declined)
- `projects` — Business projects per team
- `orderBookEntries` — Order book entries (draft→submitted→verified/rejected)
- `revenueEntries` — Revenue received entries with payment proof
- `milestones` — Team journey timeline (auto + manual)
- `demoDayApplications` — Demo Day pitch applications
- `notifications` — Per-user notifications
- `announcements` — Broadcast announcements (all/campus/team targets)
- `programmeConfig` — Global settings (Demo Day threshold ₹2L, dates, etc.)
- `auditLog` — Admin action log

### auth.ts — Replit auth:
- `sessions` — Session storage for OIDC

## API Routes (artifacts/api-server/src/routes/)

- `health.ts` — GET /health
- `auth.ts` — OIDC login/callback/logout + /auth/user
- `storage.ts` — File upload URL generation
- `campuses.ts` — CRUD for campuses
- `teams.ts` — Team registration, approval workflow, member management (legacy POST/DELETE /teams/:id/members are admin-only)
- `team-flow.ts` — Browse same-campus teams, search students, join-by-code, invitations, join-requests, leave-requests. All membership mutations enforce strict same-campus equality and auto-cancel other pending pendings on accept
- `projects.ts` — Project CRUD
- `financials.ts` — Order book + revenue entry CRUD with submit/verify/reject
- `leaderboard.ts` — National/campus leaderboard ranked by verified revenue
- `dashboard.ts` — Role-specific dashboard summary data
- `milestones.ts` — Team milestone timeline
- `demoday.ts` — Demo Day application management
- `notifications.ts` — User notifications
- `announcements.ts` — Announcements broadcast
- `admin.ts` — Admin: users, config, audit log, roster, review queue

## Frontend Pages (artifacts/brave-dashboard/src/pages/)

### Student:
- `/` — Team dashboard (revenue progress, Demo Day threshold)
- `/projects` — Project list
- `/projects/:id` — Project detail with order book + revenue entries
- `/leaderboard` — National leaderboard
- `/get-started` — Hub for students without a team: pending invitations callout, create team, browse same-campus teams (request to join), join by invite code
- `/team` — Team profile + members + invite code + invitations + join requests + leave requests + milestone timeline
- `/demo-day` — Demo Day application
- `/notifications` — Notifications

### Coordinator:
- `/coordinator` — Campus dashboard
- `/coordinator/teams` — Team approval workflow
- `/coordinator/leaderboard` — Campus leaderboard
- `/coordinator/announcements` — Post announcements

### Admin:
- `/admin` — National dashboard with stats
- `/admin/queue` — Revenue/order book review queue
- `/admin/teams` — Team directory
- `/admin/leaderboard` — National leaderboard with admin controls
- `/admin/demo-day` — Demo Day applications management
- `/admin/users` — User management
- `/admin/campuses` — Campus management
- `/admin/config` — Programme config (threshold, dates, Demo Day toggle)
- `/admin/roster` — Student whitelist
- `/admin/audit-log` — Action audit trail
- `/admin/announcements` — Post announcements

## Business Logic

- **Revenue verification**: Only `verified_amount` from `revenue_entries` with `status='verified'` counts for leaderboard ranking and Demo Day eligibility
- **Demo Day threshold**: Configurable (default ₹2,00,000), stored in `programme_config`
- **Auto milestones**: Triggered on team approval, first project, first verified entry, ₹50K/₹1L/threshold revenue milestones
- **Indian currency format**: All amounts in ₹ with lakh notation (₹1,00,000)
- **Codegen pitfall**: `lib/api-zod/src/index.ts` must only export `./generated/api` and `AuthUser` — never re-export `./generated/types` (causes duplicate export errors)

## First-Time Setup

To create the first admin user, set role to 'admin' manually in the database after logging in via Replit Auth.
