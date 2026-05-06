# Progress Enforcement — Modules 2, 4, 5 + Dashboard Widgets

This guide walks you through deploying the three new progress-enforcement
modules and the student dashboard widgets on Replit. **No existing feature
has been modified** — every change is additive.

> **Module 1 (Submission Timestamp Tracker) was scoped out.** The weekly
> journal already provides a tamper-proof submission timestamp at the team
> level, and the parallel activity log added complexity without proportional
> value.

## What was added (high level)

| Module | New tables | New API routes | New pages |
|--------|------------|----------------|-----------|
| 2 — Weekly Progress Journal | `weekly_journals` | `GET /api/journals/current-week`, `GET /api/journals/mine`, `POST /api/journals`, `GET /api/admin/journals`, `GET /api/admin/journals/coverage`, `GET /api/progress-summary` | `/journal`, `/coordinator/journals`, `/admin/journals` |
| 4 — Activity Heatmap | _(none — read view over journals)_ | `GET /api/heatmap`, `POST /api/heatmap/remind` | `/coordinator/heatmap`, `/admin/heatmap` |
| 5 — Auto Reminder Service | `reminder_log` | _(none — runs as a script)_ | _(none)_ |
| Dashboard Widgets | _(none — read view)_ | reuses `GET /api/progress-summary` | adds 3-card row to existing `/` student dashboard |

## Files changed / created

### Newly created (10 files)
```
artifacts/api-server/src/routes/journals.ts                     NEW (Module 2 + progress-summary endpoint)
artifacts/api-server/src/routes/heatmap.ts                      NEW (Module 4)
artifacts/api-server/src/cron-reminders.ts                      NEW (Module 5)
artifacts/brave-dashboard/src/lib/progress-api.ts               NEW (frontend fetch helpers)
artifacts/brave-dashboard/src/pages/student/journal.tsx         NEW (Module 2 student page)
artifacts/brave-dashboard/src/pages/admin/journals.tsx          NEW (Module 2 admin page)
artifacts/brave-dashboard/src/pages/admin/heatmap.tsx           NEW (Module 4 admin page)
artifacts/brave-dashboard/src/pages/coordinator/journals.tsx    NEW (re-exports admin/journals — campus-scoped at API)
artifacts/brave-dashboard/src/pages/coordinator/heatmap.tsx     NEW (re-exports admin/heatmap — campus-scoped at API)
artifacts/brave-dashboard/src/components/progress-widgets.tsx   NEW (Tier-1 dashboard widgets row)
docs/PROGRESS_ENFORCEMENT_DEPLOYMENT.md                         NEW (this file)
```

### Modified (only additive insertions — no existing logic changed)
```
lib/db/src/schema/brave.ts                              appended 2 new tables (weekly_journals, reminder_log) + 2 new enums (reminder_type, reminder_channel) at end of file
artifacts/api-server/src/routes/index.ts                added 2 new router.use() lines + 2 new imports
artifacts/api-server/package.json                       added "cron-reminders" script entry
artifacts/brave-dashboard/src/App.tsx                   added new page imports + new <Route> entries
artifacts/brave-dashboard/src/components/sidebar.tsx    added nav links: Weekly Journal (student), Heatmap + Journals (coordinator + admin)
artifacts/brave-dashboard/src/pages/student/dashboard.tsx added <ProgressWidgets /> row near the top
```

That's it. To roll back, you'd delete the 10 new files and revert the small
additions in those 6 modified files — and the portal would behave exactly
as it did before.

## Replit deployment steps

### Step 1 — Pull / paste the new code onto Replit
Either:
- Push to your existing Git remote, then click **Pull** in Replit's Git tab, **or**
- Copy/paste each new file via Replit's file explorer (paths above).

After pulling, run:
```bash
pnpm install
```

### Step 2 — Push the new tables to Postgres
The schema changes add **2 new tables** and **2 new enums**. Apply them with:
```bash
pnpm --filter @workspace/db run push
```
Drizzle will detect the new objects and offer to create them. None of the
existing tables are altered — no data migration is needed.

### Step 3 — Restart the API server
On Replit, restart the API deployment so the new routes are mounted:
- `/api/journals/...`
- `/api/admin/journals/...`
- `/api/progress-summary`
- `/api/heatmap`
- `/api/heatmap/remind`

### Step 4 — Rebuild the frontend
```bash
pnpm --filter @workspace/brave-dashboard run build
```

You should now see new sidebar links:
- **Student**: "Weekly Journal"
- **Coordinator**: "Heatmap", "Journals"
- **Admin**: "Heatmap", "Journals"

The student dashboard (`/`) now shows a 3-card row at the top:
1. **Weekly Journal** — current week's status (green Submitted / amber Pending) + CTA
2. **Journal Streak** — consecutive weeks with a journal submitted (orange flame at 4+ weeks)
3. **Recent activity** — Last journal date + status badge

### Step 5 — Schedule the daily reminder cron (Module 5)

Schedule the reminder script in Replit **Deployments → Scheduled**:

1. **Schedule:** `0 9 * * *` (09:00 daily — adjust for IST as needed)
2. **Run command:**
   ```bash
   cd artifacts/api-server && pnpm run cron-reminders
   ```
3. **Environment**: same as the main API deployment — must include
   `DATABASE_URL`, `BREVO_API_KEY`, `BREVO_FROM_EMAIL`, `BREVO_FROM_NAME`,
   `APP_URL`.

Run the cron manually to test:
```bash
cd artifacts/api-server && pnpm run cron-reminders
```
Look for `[cron-reminders] done` in the logs.

If `BREVO_API_KEY` is missing, the script logs a warning and continues — only
in-app notifications go out (emails are skipped). This matches the existing
behavior of the rest of the portal.

## Required environment variables (no change to existing — these are reused)

| Variable | Used by | Required? |
|----------|---------|-----------|
| `DATABASE_URL` | All modules | Yes |
| `BREVO_API_KEY` | Module 5 (emails) | Optional — without it, only in-app notifications |
| `BREVO_FROM_EMAIL` | Module 5 | Optional, default `brave.niat@nxtwave.in` |
| `BREVO_FROM_NAME` | Module 5 | Optional, default `BRAVE Dashboard` |
| `APP_URL` | Module 5 | Optional, default `https://dashboard.brave.niatindia.com` |

## Verifying it works

### Module 2 — weekly journal
1. Sign in as a student on a team → click **Weekly Journal**.
2. Submit a 3-field journal → status flips to "Submitted".
3. Sign in as admin → **Journals** → entry appears in "Submitted" tab.
4. Switch to "Teams missing journals" tab → silent teams listed.

### Module 4 — heatmap
1. As coordinator or admin → click **Heatmap**.
2. Each row = one team, columns = last 8 weeks. Green check = journal
   submitted that week, gray cell = no journal.
3. Filter by "Silent" or "Never logged" to surface teams that need attention.
4. Click "Remind" → sends an in-app notification to all team members.

### Module 5 — cron
1. Run `cd artifacts/api-server && pnpm run cron-reminders` manually.
2. Check the `reminder_log` table — one row per (team × user × type × channel).
3. Check the `notifications` table for new "Update needed" rows.
4. If a team has been silent 7+ days, members on file with email get a Brevo
   email; coordinator gets a notification too.

### Dashboard widgets
1. Sign in as a student with a team → dashboard shows 3 widget cards above the
   existing revenue cards.
2. No journal yet this week → Card 1 is amber "Pending".
3. Submit a journal → Card 1 flips to green "Submitted" and the streak counter
   on Card 2 increments.
4. Card 3 shows "Last journal: This week" with a green status badge.

## Rollback plan

Everything is additive. To roll back fully:

1. Drop the 2 new tables and 2 new enums in Postgres:
   ```sql
   DROP TABLE IF EXISTS reminder_log;
   DROP TABLE IF EXISTS weekly_journals;
   DROP TYPE IF EXISTS reminder_channel;
   DROP TYPE IF EXISTS reminder_type;
   ```
2. Delete the 10 new files listed above.
3. Revert the small additions in `lib/db/src/schema/brave.ts`,
   `routes/index.ts`, `App.tsx`, `sidebar.tsx`, `package.json`, and
   `pages/student/dashboard.tsx`.
4. Restart the API + dashboard.

No existing data is affected.

## Manager-ready summary

- **Status:** built, ready to deploy. Not live until Steps 2 + 3 above.
- **Risk:** low. All changes are additive; no existing endpoints, tables, or
  pages are modified.
- **Effort to ship:** ~10 minutes once the code is on Replit (`pnpm install`,
  `db push`, restart API, restart dashboard, schedule cron).
- **Soft launch:** point one campus's coordinator at `/coordinator/heatmap` and
  the cron at a single campus first if you want a softer rollout. The student
  Weekly Journal page is reachable via the sidebar — temporarily comment out the
  student sidebar entry in `sidebar.tsx` to keep it hidden during pilot.
