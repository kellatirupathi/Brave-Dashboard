# BRAVE Programme Dashboard — Product Requirements Document

> **What BRAVE is, and how it works.**
>
> BRAVE is NIAT's entrepreneurship programme. Student teams find real small-business
> clients, do paid work for them, and are graded on **evidence rather than on claims**.
> This document describes the product as built: every role, every capability, every
> limitation, and the exact points where Season 1 and Season 2 diverge.

| | |
|---|---|
| **Scale** | ~7,500 students · 19 campuses |
| **Surface** | 89 pages · 60 API modules · 59 tables |
| **Status** | Season 1.0 archive · Season 2.0 live |
| **Source of truth** | The code, then `.agents/memory/` |
| **Production** | <https://dashboard.brave.niatindia.com> |

> **On accuracy.** This document was written by reading the codebase, not from
> memory. Where a fact could not be verified in code it was left out. The other
> documents in this folder (`BRAVE_Dashboard_Documentation.md` and the deployment
> notes) predate the Season 2 work and are **stale** — prefer this file and
> `.agents/memory/`.

---

## Contents

1. [Product summary](#1-product-summary)
2. [Roles and permissions](#2-roles-and-permissions)
3. [Season model](#3-season-model)
4. [Season 1 vs Season 2](#4-season-1-vs-season-2)
5. [The Season 2 pipeline](#5-the-season-2-pipeline)
6. [Scores and money](#6-scores-and-money)
7. [Anti-fraud](#7-anti-fraud)
8. [AI audit](#8-ai-audit)
9. [Feature inventory](#9-feature-inventory)
10. [Admin configuration](#10-admin-configuration)
11. [Automation and integrations](#11-automation-and-integrations)
12. [Platform and delivery](#12-platform-and-delivery)
13. [Limitations and known gaps](#13-limitations-and-known-gaps)
14. [Operational rules](#14-operational-rules)

---

## 1. Product summary

A small team of students runs a consultancy for one term. The product exists to make
one thing possible: **a coordinator verifying real revenue without reading every row
by hand.**

1. **Capture a real client.** A local business, recorded on the spot with the owner's
   name, phone, category, GPS location and what was said at the first meeting.
2. **Log the relationship as it develops.** Each interaction dated, carrying an outcome
   and optionally an attachment.
3. **Convert when the client agrees.** The lead becomes a project.
4. **Plan in phases, record every rupee.** Each phase carries an amount and a due date;
   each payment carries proof.
5. **The system composes the BRD.** Students never write one. It is assembled from what
   they logged — which is the point: *the document cannot say more than the record
   supports.*
6. **A coordinator verifies the revenue.** Verified revenue is what counts for the
   leaderboard and for GRIT Miles.

Everything else in the product — the trust ledger, the weekly journal, the nudges, the
admin oversight pages — exists to make step 6 possible at scale.

---

## 2. Roles and permissions

| Role | Scope | Core responsibility |
|---|---|---|
| **Student** | Own team only | Runs the team's work: leads, projects, payments, weekly journal |
| **Coordinator** | Assigned campuses | Verifies revenue, reviews submissions, escalates blockers |
| **Admin** | Programme-wide | Configuration, teams and roster, oversight, permissions |
| **Super admin** | Programme-wide | An admin with `is_super_admin`. Controls per-page admin permissions and kill switches. Never restricted. |

### Within a team

A distinction that matters more than the role itself:

- **Team leader** — runs the entire Leads pipeline. Capturing clients, logging
  interactions, converting, projects, phases, payments and submitting for review are all
  leader-only.
- **Team member** — full read access to everything the team recorded, and writes the
  weekly journal, but makes no changes in Leads.

Enforced in one place — `isLeadsWriter()` in `lib/leads-control.ts` — which every write
route passes through via `allowLeadsAction()` / `allowLeadsSubmit()`. A new pipeline
write route inherits the rule automatically.

### Per-page admin permissions

Super admins assign per-page rights across ~30 admin pages, with six actions per page:

| Action | Meaning |
|---|---|
| `view` | See the page at all |
| `edit` | Change records |
| `delete` | Remove records |
| `approve` | Clear a review decision |
| `reject` | Refuse one — split from `approve` so rejections can escalate |
| `export` | Download CSV/Excel, which hands over a page of data at once |

> ### ⚠️ Permission gating is UI-only — a real limitation
>
> Sidebar filtering and route blocking happen in the frontend. The admin API routes
> still authorize on `role === "admin"` alone and do **not** call `canAccessPage`, so a
> restricted admin can still reach those endpoints directly.
>
> This was a deliberate scope decision on a live system: `null` permissions mean *full
> access* (so every existing admin kept working with zero migration), and getting
> default-allow wrong across dozens of routes risks locking admins out. Making
> permissions genuinely enforced is a separate, larger change.

---

## 3. Season model

**The single most important thing to understand before changing anything.** Two seasons
run *concurrently* on one deployment.

- **Resolution.** Every request carries an `x-brave-season` header. `resolveSeason()` in
  `lib/season.ts` is the only authority; never infer a season any other way.
- **Canonical URLs.** The frontend uses `/student/season/2.0/leads`. A page reached
  without a season redirects to the canonical form.
- **Identity is shared, activity is scoped.** Users, roster, campuses, teams and invite
  codes serve both seasons — the same teams carry forward and nobody re-registers. Only
  journals, projects, order book, revenue, milestones, Demo Day, Finale, PCA and leads
  carry a `season_id`.
- **Fails safe.** Every scoped column is `NOT NULL DEFAULT 1`, and a failed read reuses
  the last known good season rather than throwing.
- **Staff default is independent.** The live student season and the season staff land on
  are separate settings, so reporting can move without changing what students use.

> **Legacy rows predate seasons.** Records with a null season are read as Season 1. Null
> is never a wildcard matching every season, and historical rows are not rewritten to add
> one.

---

## 4. Season 1 vs Season 2

### Programme model

| Dimension | Season 1.0 — archive | Season 2.0 — live |
|---|---|---|
| **Core loop** | Projects → Order Book → Revenue entries | Leads → interactions → Project → phases → payments → BRD |
| **The BRD** | Students wrote and **uploaded a PDF**. The document could claim anything. | **Composed by the server** from logged records. Cannot say more than the record supports. |
| **Progress measure** | Demo Day threshold — one revenue bar to clear | GRIT Miles ladder — admin-configurable levels, each with a reward |
| **Team size** | 5 members | 4 members |
| **Client record** | None. A client was a name typed on an entry. | Programme-wide **client registry** keyed on normalised phone |
| **Revenue recognition** | Claimed amount is the amount | Claimed, **recognised** and **weighted** stored separately; category caps and a recurring multiplier apply |

### Capabilities

| Capability | S1 | S2 | Note |
|---|:--:|:--:|---|
| Lead capture with GPS | — | ✅ | Location at the client's premises |
| Dated interaction trail | — | ✅ | With outcome and attachments |
| Voice dictation | — | ✅ | Web Speech API; hidden where unsupported |
| Meet-proof photos | — | ✅ | Camera or upload, images only, max 10 |
| Phased delivery + payments | — | ✅ | Per-phase amounts and due dates |
| Client registry | — | ✅ | Cross-team duplicate detection |
| Trust ledger | — | ✅ | Append-only, idempotent awards |
| WhatsApp messaging | — | ✅ | Karix; templates and send log |
| Android app / PWA | — | ✅ | Capacitor shell + installable PWA |
| AI BRD audit | ✅ | ✅ | Different inputs, same output shape |
| Duplicate-payment check | ✅ | ✅ | Reference-only rule, shared helpers |
| Weekly journal | ✅ | ✅ | Plus AI analysis and escalation chain |
| Leaderboard | ✅ | ✅ | National / campus / overall |
| Demo Day | ✅ | *legacy* | Superseded by GRIT Miles, toggle-gated |
| Finale & People's Choice | ✅ | ✅ | Submissions and voting |

### Where the UI forks

Three student pages split at the **page** boundary rather than with branches inside one
component. Only one version ever mounts, so neither pays for the other's queries, and a
change to the live design cannot alter how a finished season reads. Anything that is not
`1.0` gets the current design, so a future 3.0 inherits it.

| Route | Season 1 file | Season 2 file | Boundary |
|---|---|---|---|
| Dashboard | `dashboard-season1` | `dashboard-season2` | `dashboard-legacy` |
| GRIT Miles | `grit-miles-season1` | `grit-miles-season2` | `demo-day` |
| Leaderboard | `leaderboard-season1` | `leaderboard-season2` | `leaderboard` |

Each Season 1 file is marked `TREAT AS FROZEN`. Season 1 is a closed cohort: its revenue
is settled and its screens are read back for reference, so restyling it would change how
past results *look* without changing what they *are*.

---

## 5. The Season 2 pipeline

Domain logic lives in `lib/lead-pipeline.ts` and `lib/brd-composer.ts`, deliberately
outside the route handlers, so the composer, the review queue and the student's own view
evaluate the same rules with the same code.

### Stages

```
new → qualified → proposal_sent → converted → (project) → submitted → verified
                                                                    ↘ rejected
```

Lead sources: `walk_in`, `online`, `referral`, `known_contact`. The last two are
automatically flagged related-party. Meeting modes: `in_person`, `phone`, `video`,
`whatsapp`.

### The three gates

| Gate | Rule | Enforcement |
|---|---|---|
| **A** | 3+ dated interactions spanning 7+ days | **Advisory.** Blocks nothing. Reported to reviewers and in the BRD. |
| **B** | A project may only start from a converted lead | **Switchable.** Admin toggle; cached 30s; fails open to advisory. |
| **C** | Five-item completion checklist | **Always blocks.** Submit returns 409 while any item is outstanding. |

### Gate C — the only real bar

Five equally weighted items. `composeBrd()` is their single definition.

| Item | Passes when |
|---|---|
| `interaction` | At least one interaction is recorded |
| `work` | Service category, problem, solution and revenue type are filled |
| `proof` | The project has proof it exists |
| `phases` | At least one phase is defined |
| `payment` | At least one payment is recorded |

> **Why Gate A does not block conversion.** A student who closes a client on the first
> visit has done the work, not skipped it. So "Client said yes" is available from the
> moment a lead is captured. The trail is evidence for the reviewer, not a turnstile —
> and nothing in the student UI mentions the requirement.

> **Record protection after submission.** Submitted and frozen projects protect their
> project, phase and payment data. Client-confirmed payments cannot be edited or deleted,
> and a phase with recorded payments cannot be deleted — later review must be able to see
> the exact evidence assessed.

---

## 6. Scores and money

Three numbers that are easy to confuse, and how a claim becomes revenue.

| Score | Scope | Source | Blocks? |
|---|---|---|:--:|
| **Progress score** | One project | Gate C's five items, 20% each | ✅ |
| **Trust standing** | One team | Append-only ledger of verified events | — |
| **GRIT Miles** | One team | Ladder driven by verified revenue | — |
| **Leaderboard** | One team | Recognised, weighted revenue | — |

### How a claim becomes revenue

- **Claimed** is money *received*, summed from recorded payments — never the contract
  value. An unpaid contract is not revenue.
- **Recognised** applies the service category's cap, so an inflated invoice cannot
  inflate the leaderboard.
- **Weighted** applies the recurring multiplier.
- All three are stored in separate columns. The claimed figure is never rewritten — the
  audit trail depends on it.

### GRIT Miles

Not stored. Recalculated on every render as the sum of `miles` for every level whose
target the team's verified revenue has reached. Consequences worth knowing:

- The count moves only when a coordinator **verifies** revenue, not when a student
  submits.
- Editing the ladder changes every team's count **retroactively**, because nothing is
  grandfathered.

> **Trust standing is deliberately unwritable.** It is built only from events a team
> cannot create itself — a coordinator verifying revenue, a client confirming a payment
> on a call. Negative events (a client denying a payment, a trail written up long after
> the dates claimed) are what make a team reviewable. The ledger is append-only and
> awards are idempotent on `(season, team, kind, ref)`, so a cron re-run cannot inflate a
> score.

---

## 7. Anti-fraud

The pipeline assumes some teams will try to fake revenue, and is built to make that
**visible** rather than to make it impossible. Season 2 only.

- **Distinct dates, not row counts.** Five WhatsApp messages logged in one afternoon
  count as one day of contact.
- **Client registry collisions.** Every business registers against a normalised phone
  number, so the same shop claimed by two teams is visible. Normalisation strips the
  country code, so `+91 98490 12345` and `9849012345` collide.
- **GPS at the premises** — the one signal impossible to fake from a desk.
- **Recognition caps** per service category.
- **Backdating is visible.** The gap between when something happened and when it was
  written up is recorded and surfaced.
- **Satisfaction calls** write back to the registry — a client confirming or denying a
  payment is the strongest evidence in the system.
- **Duplicate-payment detection** across teams and seasons (section 8).

---

## 8. AI audit

Both seasons run an AI auditor on submission and write the same columns, so the review
queue renders either without knowing which season produced it. What differs is the input.

| Dimension | Season 1.0 | Season 2.0 |
|---|---|---|
| **Trigger** | Student uploads a BRD PDF | Student clicks Submit for Review — no file exists |
| **Sent to the model** | One PDF | Rendered BRD prose **plus evidence images** — payment proofs, meet proofs, interaction attachments (capped at 8, most decisive first) |
| **Model calls** | **Two.** The duplicate check needs the summary the first call extracted, so it makes a second text-only round-trip, batched at 400 candidates. | **One.** Approved summaries ride in the same prompt, so the model compares the reference it has just read. |
| **Score measures** | Proof genuineness *plus completeness* of eight written sections | Proof genuineness *plus corroboration*. Completeness is already guaranteed by Gate C. |
| **Duplicate corpus** | Verified entries **with a PDF** — composed entries are invisible to it | Verified entries from **either season** |
| **Timing** | Scheduled 5 minutes after submission | Identical — same scheduler |
| **Failure behaviour** | A failed batch falls back to a deterministic reference check | A missing or malformed block falls back the same way |

### Score bands

| Band | Meaning |
|---|---|
| 90–100 | Proof genuine; amount and date match; record corroborates |
| 70–89 | Genuine and broadly matching, with minor gaps |
| 45–69 | Proof exists but something material does not line up |
| 25–44 | Proof unreadable, ambiguous, or not evidencing the claim |
| 0–24 | No usable proof, dated before programme start, or fabricated |
| 8 / 100 | Uniqueness is binary — duplicate or unique, derived from the flag so score and verdict cannot contradict |

> **The uniqueness rule is deliberately narrow.** Only a shared **payment reference**
> (UTR, transaction id, cheque number, receipt number) makes a duplicate. The same amount
> and the same date are *not* a match — with thousands of students, identical round
> amounts on one day are ordinary coincidence. A matching payer or payee alone is not a
> duplicate either.

---

## 9. Feature inventory

### Student

| Feature | What it does | Season |
|---|---|---|
| Dashboard | Team identity, KPIs, journal state, GRIT progress, countdown | both |
| Leads | Capture, trail, convert; GPS, dictation, meet proofs, duplicate warning | S2 |
| Project & delivery | Define work, phases, payments with proof, BRD preview and download | S2 |
| Projects & Order Book | Project records and committed pipeline | S1 |
| Weekly Journal | Three-field weekly entry; AI-analysed; drives escalation | both |
| My Team | Four tabs: overview, members, milestones, settings. Invite code, membership requests | both |
| Leaderboard | National / My Campus / Overall; rank hideable by admin | both |
| GRIT Miles | Level ladder against verified revenue | S2 |
| Demo Day | Threshold, application and upload | S1 |
| Finale & PCA | Final submission and People's Choice voting | both |
| Resources & Guidebook | Admin-curated reading; in-app role documentation | both |
| Assistant | Cerebras-powered Q&A widget | both |
| Get the app | Public `/get-app` install page reachable by QR | S2 |

### Coordinator

| Feature | What it does |
|---|---|
| Review Queue | Verify or reject revenue, with the AI audit card and rejection reasons |
| Teams & Projects | Oversight scoped to assigned campuses |
| Journals & tracking | Weekly coverage, per-team detail |
| Heatmap | Campus-level activity, with bulk nudges |
| Leaderboard | Campus-scoped by default |
| Announcements | Publish to assigned campuses |

### Admin

| Area | Pages |
|---|---|
| **Oversight** | National Command Center, Review Queue, Leads, Projects, Teams, Team Requests, Campus Insights, Heatmap |
| **People** | Roster, Users, New-user access requests, Permissions, Coordinator tags |
| **Programme** | Config, Campuses, Programme weeks, Milestones, Announcements, Pop-ups, Resources |
| **Review & AI** | Detailed analysis, BRD Drive migration, Chatbot history, Reels scripts |
| **Events** | Demo Day, Demo Day submissions, Finale submissions, People's Choice votes |
| **Reporting** | Reports, Journals, Audit log, Feedback, Notifications, Pages log |

---

## 10. Admin configuration

What can be changed without a deploy.

### Leads controls — per season

Add, edit and delete are configured independently for five sections: `leads`, `projects`,
`phases`, `payments`, `interactions`. Submit-for-review is its own switch. Defaults are
**add allowed, edit and delete denied**.

A season-wide **master lock** blocks every student mutation including stage changes and
submission, and shows a configured message. Only admins bypass these controls —
coordinators do not.

### Other configuration

- **GRIT ladder** — levels, revenue targets, miles and reward text.
- **Rollout toggles** — `gritMilesMenuEnabled` and `gritMilesDashboardEnabled`,
  independent, both defaulting to the legacy Demo Day experience.
- **Pipeline gates** — Gate B advisory or enforced.
- **Pricing categories** — recognition caps per service category, per season.
- **Leaderboard** — banner image or template, and hide-rank-from-students.
- **Email kill switches** — 13 categories, super-admin only, fail-open, cached ~30s.
- **Rejection reasons** — the catalogue offered in the review queue.
- **Programme dates**, weeks, journal deadline, escalation on/off.
- **Team name uniqueness**, submission locks, pop-ups, intro video, QR asset.

### Email categories

```
overdueReminders · journalReminders · journalEscalations · revenueVerified
revenueRejected · announcementEmails · submissionAccess · accessRequestDecision
teamNameDuplicate · finaleReview · heatmapNudges · teamMembership · pcaVotes
```

Every transactional email must be tagged with a category. An untagged send bypasses the
kill switches entirely — only the admin test email is allowed to do that.

---

## 11. Automation and integrations

### Scheduled jobs

Cron endpoints are HTTP routes, not scheduled jobs in the repository. Each requires
`CRON_SECRET` and takes a Postgres advisory lock, so two overlapping calls cannot both
run — an in-process flag would not survive multiple instances.

| Endpoint | Purpose |
|---|---|
| `/internal/cron/reminders` | Journal and submission reminders |
| `/internal/cron/lead-nudges` | 10 / 21 / 30-day silent-lead ladder |
| `/internal/cron/trust-awards` | Idempotent trust-ledger awards |
| `/internal/cron/journal-escalation` | Escalation chain for missed journals |
| `/internal/cron/weekly-journal-report` | Campus-wise weekly report |
| `/internal/cron/overdue-notifications` | Overdue review alerts to subscribers |
| `/internal/cron/backup-supabase` | Mirror backup |

### External services

| Service | Used for | Note |
|---|---|---|
| Gemini | BRD audit, uniqueness, journal analysis | Absent key = silent no-op, never a failure |
| Cerebras | In-app chatbot | — |
| Karix | WhatsApp | Auth header is `Authentication:`; real status is in the body, not the HTTP code |
| NIAT Forms | SSO — mobile number + OTP | Identity keyed on Forms ID; email is *not* unique |
| Object storage | All uploads | Presigned two-step upload |
| Google Drive | BRD and Finale exports | Service account |
| Supabase | Backup mirror | — |

---

## 12. Platform and delivery

| Layer | Choice |
|---|---|
| Language | TypeScript 5.9, ESM throughout |
| Packages | pnpm workspaces — npm and yarn blocked by `preinstall` |
| API | Express 5, Zod validation, pino logging |
| Database | PostgreSQL via Drizzle — 59 tables |
| Frontend | React 19, Vite 7, Tailwind v4, wouter, TanStack Query, Radix |
| Mobile | Capacitor 8 (Android) + PWA |
| Hosting | Replit |
| Tests | Vitest — 36 tests |

### Authentication

Students and staff sign in through NIAT Forms SSO. The dashboard redirects to Forms;
Forms returns a single-use `auth_token`; the API exchanges it and issues an `sid` session
cookie. The token is consumed immediately, so a copied URL is worthless. In the Android
app, Forms opens in the in-app browser and returns via deep link, so the session cookie
lands in the dashboard's own cookie jar.

> ### ⚠️ The Android app is a thin shell
>
> Its `server.url` points at the live dashboard, so **a web fix reaches the app through a
> Replit publish, not a new APK.** Only native concerns — permissions, plugins, splash
> screen, the URL itself — require rebuilding and redistributing it.
>
> The build is currently signed with a debug key, which is why Android shows a Play
> Protect warning on install. Play Store distribution needs an upload key and a Console
> listing.

---

## 13. Limitations and known gaps

Stated plainly, because a PRD that lists only capabilities is a sales document. Each of
these is a candidate for the next round of work.

| Limitation | Impact | Deliberate? |
|---|---|---|
| **Admin permissions are UI-only** | A restricted admin can still call admin API routes directly | Scoped out |
| **S1 duplicate corpus excludes S2** | A Season 1 entry is never compared against Season 2 payments. The reverse works. | No — asymmetry |
| **S2 uniqueness is unbatched** | The whole approved corpus rides in one prompt. Fine at hundreds; revisit at thousands. | Yes |
| **GRIT fallback ladders disagree** | Client and server differ at Levels 4 and 5. Only reached if the config fetch fails. | Unresolved |
| **Dictation needs Web Speech** | Firefox has no support; the button is hidden there | Yes |
| **Docs pages are public** | Staff guide slugs are non-obvious, which is obfuscation, not a security boundary | Yes |
| **Test coverage is thin** | 36 tests against ~130k lines, concentrated on invite/join/roster and season resolution | No — gap |
| **App metrics cannot see installs** | Only "ever opened the app" is observable; installs and uninstalls are not | Yes |
| **No migration pipeline** | Schema reaches production through a startup bootstrap, not migrations | Yes |

### Candidate next steps

- Server-side enforcement of per-page admin permissions — **the largest open risk.**
- Widen the Season 1 duplicate corpus so the check is symmetric across seasons.
- Batch the Season 2 uniqueness corpus once verified BRDs pass roughly a thousand.
- Reconcile the GRIT fallback ladders once the intended reward values are settled.
- Extend test coverage to the pipeline gates and the BRD composer, which are the rules
  everything else depends on.

---

## 14. Operational rules

The rules that break production when ignored.

> ### 🔴 A schema change needs three edits, not one
>
> `drizzle-kit push` never runs against production and there is no migration step in the
> deploy. A new table or column must land in **the Drizzle schema**, *and* in the
> idempotent `CREATE … IF NOT EXISTS` bootstrap in `index.ts`, *and* in **the consuming
> code**. Schema-only is the most common way to break production — and the bootstrap
> artifact must stay in the schema too, or the next dev push drops it.

> ### 🔴 A commit is not a deploy
>
> Someone must press **Publish** in Replit for committed code to reach students. The
> Replit workspace is also a second working copy with its own agent, so it commits
> independently; a conflicted pull there must be resolved by completing the merge, not by
> checking out one side.

> ### Identity is keyed on Forms ID, never email
>
> `users.email` and `roster.email` are both non-unique — two accounts can share an
> address. Any user-scoped read must key on `userId` or `formsUserId`. Matching by email
> cross-links accounts and leaks data.

> ### Never compare a timestamptz to a JS Date
>
> Postgres stores microseconds; a JS `Date` carries milliseconds. A guarded
> `UPDATE … WHERE submitted_at = <snapshot>` silently matches nothing. Compare within
> 1ms. This once discarded 200 paid AI calls per sweep, every boot.

> ### Cron guards must be advisory locks
>
> An in-process boolean cannot stop a second instance on an autoscale deploy. Release in
> `finally`, never on response close — a client disconnect would free the lock while the
> work is still running.

---

*BRAVE Programme Dashboard · Season 1.0 archive · Season 2.0 live*
*Verified against the codebase, not from memory.*
