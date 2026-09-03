# BRAVE Programme Dashboard

The platform that runs **BRAVE**, NIAT's entrepreneurship programme. Student teams
find real small-business clients, do paid work for them, and are graded on
evidence rather than on claims. This repository holds everything that makes that
possible: the API, the web dashboard, the installable Android app, the shared
libraries, and the in-app documentation.

- **Production:** <https://dashboard.brave.niatindia.com>
- **Android app:** `/get-app` on the production host
- **Hosting:** Replit (a "Publish" is what makes committed code live — see
  [Deployment](#deployment))

---

## Contents

- [What the programme actually does](#what-the-programme-actually-does)
- [The two seasons](#the-two-seasons)
- [Roles](#roles)
- [The Season 2 lead pipeline](#the-season-2-lead-pipeline)
- [Scores in the system](#scores-in-the-system)
- [Repository layout](#repository-layout)
- [Tech stack](#tech-stack)
- [Authentication](#authentication)
- [The Android app](#the-android-app)
- [In-app documentation](#in-app-documentation)
- [Getting started](#getting-started)
- [Environment variables](#environment-variables)
- [Command reference](#command-reference)
- [Database and schema changes](#database-and-schema-changes)
- [Deployment](#deployment)
- [Windows notes](#windows-notes)
- [Where to read next](#where-to-read-next)

---

## What the programme actually does

A small team of students runs a consultancy for one term. The maximum team
size is configured per season — Season 1 allowed 5 members, Season 2 allows 4
(`getTeamMemberLimit()`).

1. They **capture a lead** — a real local business, recorded on the spot with
   the owner's name, phone, category, GPS location and what was said at the
   first meeting.
2. They **log interactions** as the relationship develops. Each entry is dated,
   can carry an attachment, and records an outcome.
3. When the client agrees, the lead is **converted** and becomes a **project**.
4. The project is planned in **phases**, each with an amount and a due date, and
   every rupee received is recorded as a **payment** with proof attached.
5. From all of that the system **composes a BRD** (Business Requirements
   Document) automatically. Students never write one — it is assembled from what
   they logged, which is the point: the document cannot say more than the record
   supports.
6. A coordinator **reviews and verifies** the revenue. Verified revenue is what
   counts for the leaderboard and for GRIT Miles.

Everything else in the product — the trust ledger, the weekly journal, the
nudges, the admin oversight pages — exists to make step 6 possible without a
human reading every row.

---

## The two seasons

**This is the single most important thing to understand before changing
anything.** Season 1 and Season 2 are different products living in one codebase,
and they run concurrently.

| | Season 1.0 | Season 2.0 |
|---|---|---|
| Core loop | Projects → Order Book → Revenue entries | Leads → interactions → Project → phases → payments → BRD |
| The BRD | students wrote and uploaded a PDF | composed automatically from logged data |
| Progress | Demo Day threshold | GRIT Miles ladder |
| Delivery | website only | website, installable PWA, Android app |

A season is resolved per request from the **`x-brave-season`** header, and the
frontend uses **canonical season URLs** — `/student/season/2.0/leads`. A page
reached without a season in the path is redirected to the canonical one.
`resolveSeason()` in `artifacts/api-server/src/lib/season.ts` is the only
authority on which season a request belongs to; never infer it any other way.

Season-1 records that predate the season column are handled explicitly — see
`.agents/memory/legacy-seasonless-records.md`.

---

## Roles

| Role | What they do |
|---|---|
| **Student** | Runs their team's work: leads, projects, payments, weekly journal |
| **Coordinator** | Verifies revenue, reviews submissions, escalates blockers, oversees assigned campuses |
| **Admin** | Programme configuration, teams and roster, oversight across every team, permissions |

A **super admin** is an admin listed in `SUPER_ADMIN_EMAILS`, and can change
things ordinary admins cannot.

Within a team there is a further distinction that matters:

- **Team leader** — runs the entire Leads pipeline. Capturing clients, logging
  interactions, converting, projects, phases, payments and submitting for
  review are all leader-only.
- **Team member** — full read access to everything the team has recorded, and
  writes the weekly journal, but makes no changes in Leads.

That rule is enforced in one place, `isLeadsWriter()` in
`artifacts/api-server/src/lib/leads-control.ts`, which every write route in
`routes/leads.ts` and `routes/pipeline.ts` already passes through via
`allowLeadsAction()` / `allowLeadsSubmit()`. Add a new pipeline write route and
it inherits the rule automatically — do not re-implement the check.

---

## The Season 2 lead pipeline

The domain logic lives in `artifacts/api-server/src/lib/lead-pipeline.ts` and
`artifacts/api-server/src/lib/brd-composer.ts`. It is deliberately kept out of
the route handlers so the composer, the review queue and the student's own view
all evaluate the same rules with the same code.

### Stages

```
new → qualified → proposal_sent → converted → (project) → submitted → verified
                                                                    ↘ rejected
```

### Gates

| Gate | Rule | Where it applies |
|---|---|---|
| **A** | *Advisory only.* Measures how well documented a lead is (3+ dated interactions spanning 7+ days). **Blocks nothing.** | reported on the admin Leads page and in the BRD |
| **B** | A project can only start from a converted lead | "Open the project" |
| **C** | A five-item completion checklist, all of which must pass | "Submit for review" |

**Gate A does not block conversion.** A student who closes a client on the first
visit has done the work, not skipped it, so "Client said yes" is available from
the moment a lead is captured. The trail is evidence for the reviewer, not a
turnstile. Nothing in the student UI mentions the requirement.

Gate C is the only real bar, and `composeBrd()` is its single definition. Five
equally weighted items, all of which must pass before a project can be
submitted:

| Item | Passes when |
|---|---|
| `interaction` | at least one interaction is recorded |
| `work` | service category, problem, solution and revenue type are filled |
| `proof` | the project has proof it exists |
| `phases` | at least one phase is defined |
| `payment` | at least one payment is recorded |

Interaction *volume*, elapsed days and trail bands are deliberately **not**
gates. Read the `items` array in `brd-composer.ts` for the current list rather
than trusting any other document, including this one.

Gate B can be switched between **advisory** and **enforced** by an admin
(Config → Pipeline gates); `areGatesEnforced()` caches that for 30 seconds and
fails open to advisory. Gate C always blocks — `POST /pipeline/projects/:id/submit`
returns 409 while any of the five items is outstanding.

### Anti-fraud signals

The pipeline assumes some teams will try to fake revenue, and is built to make
that visible rather than to make it impossible:

- **Distinct dates, not row counts.** Five WhatsApp messages logged on one
  afternoon count as one day of contact.
- **Client registry.** Every business is registered against a normalised phone
  number, so the same shop claimed by two teams collides.
- **GPS capture** at the client's premises.
- **Recognition caps.** A category can cap how much of a claim counts, so an
  inflated invoice does not inflate the leaderboard.
- **Satisfaction calls** write back to the registry — the client confirming or
  denying a payment is the strongest evidence in the system.

---

## Scores in the system

Four separate numbers that are easy to confuse:

| Score | Scope | Source |
|---|---|---|
| **Trail strength** (0–100) | one lead | cadence, span, attachments, outcomes — `computeTrailStrength()` |
| **Trust standing** | one team | append-only ledger of verified events — `lib/trust-score.ts` |
| **GRIT Miles** | one team | ladder driven by verified revenue and milestones |
| **Leaderboard** | one team | recognised, weighted revenue — `computeRecognition()` |

**Trail strength** is informational. It tells a reviewer how well documented a
client is; it blocks nothing.

**Trust standing** is the fraud check, and is deliberately built only from
events the team cannot write itself — a coordinator verifying revenue, a client
confirming a payment on a call. Negative events (a client denying a payment,
claiming more than the evidence supports, a trail written up long after the
dates claimed) are what make a team reviewable. The ledger is append-only and
awards are idempotent on `(season, team, kind, ref)`, so a cron re-run cannot
inflate a score.

---

## Repository layout

A pnpm workspace monorepo.

```
artifacts/
  api-server/        Express 5 API, all business logic, cron endpoints
  brave-dashboard/   React 19 + Vite SPA, plus the Capacitor Android shell
  brave-mobile/      React Native experiment — NOT the shipped app (see below)
  mockup-sandbox/    throwaway UI prototypes
lib/
  db/                Drizzle schema + client — the single source of truth
  api-spec/          shared route/response contracts
  api-zod/           shared validation schemas
  api-client-react/  typed fetch + TanStack Query helpers
  object-storage-web/ presigned-URL upload hook
  replit-auth-web/   auth helpers
scripts/             operational one-offs (Supabase backup, seeds)
.agents/memory/      the accurate, maintained design notes — read these first
```

> **`artifacts/brave-mobile` is a decoy.** It is an abandoned React Native
> attempt. The shipped Android app is the Capacitor shell inside
> `artifacts/brave-dashboard/android`. `brave-mobile` is excluded from the
> workspace because Metro cannot resolve pnpm's symlinks.

> **`replit.md` and `docs/` are stale.** They describe earlier versions of the
> product. Treat `.agents/memory/` and the code as authoritative.

---

## Tech stack

| Layer | Choice |
|---|---|
| Language | TypeScript 5.9, ESM throughout |
| Package manager | pnpm workspaces (npm and yarn are blocked by `preinstall`) |
| API | Express 5, Zod validation, pino logging |
| Database | PostgreSQL via Drizzle ORM |
| Frontend | React 19, Vite 7, Tailwind v4, wouter, TanStack Query, Radix, framer-motion |
| Mobile | Capacitor 8 (Android), plus a PWA via `vite-plugin-pwa` |
| Storage | presigned-URL object storage (two-step upload) |
| AI | Gemini and Cerebras for BRD analysis and the in-app chatbot |
| Messaging | Karix (WhatsApp), email |
| Tests | Vitest |

Shared dependency versions are pinned in the `catalog:` block of
`pnpm-workspace.yaml` — add a dependency there rather than per package, so the
API and the dashboard cannot drift apart.

---

## Authentication

Students and staff sign in through **NIAT Forms SSO** — mobile number plus OTP.
The flow is:

1. The dashboard redirects to Forms with a return URL.
2. Forms sends the user back with a single-use **`auth_token`** in the query.
3. The API exchanges that token and issues an **`sid`** session cookie.
4. The token is consumed immediately, so a copied URL is worthless.

`BOOTSTRAP_ADMIN_EMAILS` / `BOOTSTRAP_ADMIN_FORMS_IDS` grant the first admin
access on a fresh database. `FORMS_API_KEY` and `FORMS_LOGOUT_URL` configure the
integration. Non-unique emails are expected in the Forms directory — identity is
keyed on the Forms ID, not the email (see
`.agents/memory/identity-non-unique-email.md`).

---

## The Android app

The shipped APK is a **thin Capacitor shell** whose `server.url` points at the
live dashboard. It contains almost no application code — which means:

**A web fix reaches the app through a Replit publish, not a new APK.** Only
native concerns (permissions, plugins, the splash screen, `server.url` itself)
require rebuilding and redistributing the APK.

```bash
pnpm -C artifacts/brave-dashboard apk:debug     # debug build
pnpm -C artifacts/brave-dashboard apk:release   # release build
```

The APK served to students lives at
`artifacts/brave-dashboard/public/brave-app.apk` and is downloaded from
`/get-app`. `build:app` deletes any previously copied APK out of the Android
assets folder first — without that step the APK embeds a copy of itself and
roughly doubles in size.

The build is currently signed with a **debug key**, which is why Android shows a
Play Protect warning on install. Distributing through the Play Store requires an
upload key and a Play Console listing.

See `.agents/memory/android-release-builds.md` before touching the Android
build.

---

## In-app documentation

Six documentation pages are served from the app itself — three roles × two
seasons — replacing the Google Docs the programme used to link.

| Role | URL |
|---|---|
| Student | `/docs/student/1.0`, `/docs/student/2.0` |
| Coordinator | `/docs/coordinator_brave_guide/1.0`, `/docs/coordinator_brave_guide/2.0` |
| Admin | `/docs/admin_brave_guide/1.0`, `/docs/admin_brave_guide/2.0` |

**These pages are public — no authentication.** The staff slugs are
deliberately non-obvious so a student cannot guess their way into the
coordinator or admin guide. That is obfuscation, not a security boundary: never
put anything genuinely sensitive in them.

Content lives in `artifacts/brave-dashboard/src/pages/docs/content/`, one file
per role and season. When you change behaviour, change the matching guide in the
same commit — a guide that describes a rule the code no longer enforces is
worse than no guide.

---

## Getting started

**Prerequisites:** Node 20+, pnpm, a PostgreSQL database.

```bash
pnpm install
```

Create `.env` at the repository root with at least:

```bash
DATABASE_URL=postgres://user:pass@host:5432/brave
PORT=5000
BASE_PATH=/
BOOTSTRAP_ADMIN_EMAILS=you@example.com
```

Push the schema to your development database and start both halves:

```bash
pnpm -C lib/db push                    # dev databases only — see below
pnpm -C artifacts/api-server dev       # API on $PORT
pnpm -C artifacts/brave-dashboard dev  # Vite dev server
```

`PORT` and `BASE_PATH` are **required** by `vite.config.ts` and it throws
without them — a build that fails immediately with "PORT environment variable is
required" is this, not a code problem.

---

## Environment variables

### Required

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string |
| `PORT` | API port; also read by the Vite config |
| `BASE_PATH` | Base href for the built frontend (`/` in production) |

### Identity and access

| Variable | Purpose |
|---|---|
| `FORMS_API_KEY`, `FORMS_LOGOUT_URL` | NIAT Forms SSO |
| `ISSUER_URL` | OIDC issuer |
| `BOOTSTRAP_ADMIN_EMAILS`, `BOOTSTRAP_ADMIN_FORMS_IDS` | First-admin access on a fresh database |
| `SUPER_ADMIN_EMAILS` | Elevated admin privileges |

### Hosting and networking

| Variable | Purpose |
|---|---|
| `APP_URL`, `CANONICAL_HOST` | Absolute links, canonical-host redirects |
| `CORS_ALLOWED_ORIGINS`, `FRONTEND_ORIGINS` | CORS |
| `REPL_ID`, `REPLIT_DEV_DOMAIN` | Replit environment detection |
| `NODE_ENV`, `LOG_LEVEL` | Runtime mode and logging |
| `RATE_LIMIT_DISABLED`, `DISABLE_RATE_LIMIT` | Local development only |

### Storage

| Variable | Purpose |
|---|---|
| `PRIVATE_OBJECT_DIR`, `PUBLIC_OBJECT_SEARCH_PATHS` | Object storage roots |
| `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_REGION` | S3-compatible storage |
| `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_API_TOKEN` | Cloudflare |

### Integrations

| Variable | Purpose |
|---|---|
| `GEMINI_API_KEY`, `CEREBRAS_API_KEY` | BRD analysis, in-app chatbot |
| `KARIX_API_URL`, `KARIX_API_KEY`, `KARIX_SENDER_NUMBER` | WhatsApp |
| `EMAIL_FROM` | Outbound email |
| `GDRIVE_SERVICE_ACCOUNT_JSON`, `GDRIVE_BRD_FOLDER_ID`, `GDRIVE_FINALE_FOLDER_ID` | Google Drive exports |
| `CRON_SECRET` | Shared secret every cron endpoint requires |
| `SUPABASE_DB_URL`, `PROD_DATABASE_URL` | Backup and data-merge scripts |

The Karix WhatsApp API is non-standard in two ways that will waste your
afternoon: the auth header is `Authentication:` (not `Authorization:`), and the
real status code must be read from the response **body**, not the HTTP status.
Both are documented in the Karix client under
`artifacts/api-server/src/lib/whatsapp/`.

---

## Command reference

Run from the repository root.

| Command | What it does |
|---|---|
| `pnpm typecheck` | Type-checks the libraries, then every artifact |
| `pnpm build` | Type-checks, then builds everything |
| `pnpm -C artifacts/api-server dev` | Build and start the API |
| `pnpm -C artifacts/api-server test` | Vitest suite |
| `pnpm -C artifacts/api-server seed` | Seed data |
| `pnpm -C artifacts/brave-dashboard dev` | Vite dev server |
| `pnpm -C artifacts/brave-dashboard build` | Production frontend build |
| `pnpm -C artifacts/brave-dashboard apk:release` | Build the Android APK |
| `pnpm -C lib/db push` | Push the Drizzle schema — **development only** |
| `pnpm -C scripts backup-supabase` | Back up production to Supabase |

Cron endpoints are HTTP routes, not scheduled jobs in this repository. Each
requires `CRON_SECRET` and takes an advisory lock so two overlapping calls
cannot both run — see `.agents/memory/cron-locking.md`.

---

## Database and schema changes

`lib/db/src/schema/` is the single source of truth for the schema. Nothing else
may define a table.

**`drizzle-kit push` never runs against production.** There is no migration step
in the deploy. Instead, `artifacts/api-server/src/index.ts` runs an idempotent
bootstrap of `CREATE TABLE IF NOT EXISTS` / `ALTER TABLE ... ADD COLUMN IF NOT
EXISTS` statements at startup. **A new table or column must be added in three
places or production will break:**

1. the Drizzle schema in `lib/db/src/schema/`
2. the bootstrap block in `artifacts/api-server/src/index.ts`
3. the code that uses it

Add a column to the schema alone and every production query touching that table
fails the moment it deploys. This is the most common way to break this
application. See `.agents/memory/prod-schema-no-push.md` and
`.agents/memory/db-schema-rollout.md`.

Merging real data between environments has its own procedure —
`.agents/memory/production-data-merges.md`.

---

## Deployment

Hosted on Replit. **A commit is not a deploy.** Pushing to GitHub changes
nothing that students can see; someone must press **Publish** in the Replit
workspace for committed code to go live.

The Replit workspace is also a **second working copy with its own agent**, which
means it can commit changes of its own. When both this repository and the Replit
workspace have edited the same files, the Replit Git panel will report a
conflicted pull. Resolve it by completing the merge — checking out one side's
files without creating the merge commit leaves Git believing the branches are
still unmerged, and the same conflict reappears on the next pull.

---

## Windows notes

Development on Windows is supported, with three traps worth knowing.

- **Build from PowerShell, not Git Bash.** Git Bash rewrites a bare `/` in
  `BASE_PATH` into `C:/Program Files/Git/`, which silently produces a build
  whose asset URLs are `/Program Files/Git/assets/...`. If you must use Git
  Bash, set `MSYS_NO_PATHCONV=1`.
- **Native optional dependencies** for esbuild, rollup, Tailwind's oxide and
  lightningcss are pruned per platform in `pnpm-workspace.yaml`. A Vite build
  failing to load its own config is usually this: re-run `pnpm install` so the
  binaries for your platform are present.
- **Long paths.** The Android build exceeds the 260-character path limit if the
  repository sits deep in the filesystem. Keep it near the drive root.

Multi-line patch scripts must respect the repository's **CRLF** line endings.
A Python `str.replace()` written with `\n` will silently match nothing; read
with `newline=""`, normalise to `\n`, patch, then convert back.

---

## Where to read next

**`.agents/memory/` first.** It is the maintained record of why things are the
way they are, one file per decision — season resolution, admin permissions,
identity, cron locking, schema rollout, mobile session handling, the Karix
contract, the Android build, production data merges. It is short, current, and
will save you from re-deriving decisions that were already argued out.

Then read, in this order:

1. `lib/db/src/schema/` — the data model explains most of the product
2. `artifacts/api-server/src/lib/lead-pipeline.ts` — the Season 2 domain rules
3. `artifacts/api-server/src/lib/brd-composer.ts` — what a submission must satisfy
4. `artifacts/api-server/src/routes/index.ts` — every feature area, in one list
5. `artifacts/brave-dashboard/src/App.tsx` — routing, season gating, role layouts

Ignore `replit.md`, `docs/` and `artifacts/brave-mobile`. They are historical.
