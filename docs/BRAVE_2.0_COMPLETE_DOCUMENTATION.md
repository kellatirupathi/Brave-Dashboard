# BRAVE 2.0 — Complete System Documentation

**Programme:** BRAVE (NIAT entrepreneurship programme)
**Season:** 2.0 (slug `2.0`)
**Scale:** ~7,500 students across 19 campuses
**Live at:** `dashboard.brave.niatindia.com`
**Document generated:** 8 September 2026
**Source of truth:** the code in this repository, read directly. Every claim below was verified against a file; paths are given so any statement can be checked.

---

## Table of contents

1. [What BRAVE 2.0 is](#1-what-brave-20-is)
2. [The one-sentence model](#2-the-one-sentence-model)
3. [Architecture](#3-architecture)
4. [Seasons — how 1.0 and 2.0 coexist](#4-seasons--how-10-and-20-coexist)
5. [Identity, roles and access](#5-identity-roles-and-access)
5b. [The student surface](#5b-the-student-surface--what-a-season-2-student-sees)
6. [Getting in: the access gate](#6-getting-in-the-access-gate)
7. [Teams and membership](#7-teams-and-membership)
8. [The Lead Pipeline — the heart of 2.0](#8-the-lead-pipeline--the-heart-of-20)
9. [The BRD and Gate C](#9-the-brd-and-gate-c)
10. [Review Queue — how revenue gets verified](#10-review-queue--how-revenue-gets-verified)
11. [Weekly Journal](#11-weekly-journal)
12. [GRIT Miles](#12-grit-miles)
13. [Leaderboard](#13-leaderboard)
14. [Demo Day, Finale and People's Choice](#14-demo-day-finale-and-peoples-choice)
15. [Ticket Support](#15-ticket-support)
16. [Every email the system sends](#16-every-email-the-system-sends)
17. [In-app notifications and announcements](#17-in-app-notifications-and-announcements)
18. [WhatsApp broadcasts](#18-whatsapp-broadcasts)
19. [Scheduled jobs (cron)](#19-scheduled-jobs-cron)
20. [AI features](#20-ai-features)
21. [The admin surface](#21-the-admin-surface)
22. [The Config page](#22-the-config-page)
23. [Permissions model](#23-permissions-model)
24. [Data model](#24-data-model)
25. [Mobile app](#25-mobile-app)
26. [Operations and deployment](#26-operations-and-deployment)
27. [Built but not live](#27-built-but-not-live)
27b. [Cross-cutting design principles](#27b-cross-cutting-design-principles)
28. [Glossary](#28-glossary)

---

## 1. What BRAVE 2.0 is

BRAVE is an entrepreneurship programme. Students form teams, find real local businesses as clients, deliver real paid work, and are measured on **verified revenue** — money that actually arrived and that a reviewer has confirmed.

BRAVE 2.0 is the second season of that programme, and it is a different product from 1.0 rather than a new coat of paint.

**The essential difference:**

| | Season 1.0 | Season 2.0 |
|---|---|---|
| Unit of work | A **Project**, created directly | A **Lead**, which may become a project |
| Evidence | Attached at the end | Accumulated as a dated trail from first contact |
| Revenue entry | Typed in, then verified | Derived from recorded payments against phases |
| The audited artefact | Uploaded BRD document | **Composed BRD** built from the record itself |
| Client relationship | Implicit | Explicit: interactions, outcomes, objections, next actions |

In 1.0 a student could do the work and then write it up. In 2.0 the write-up *is* the work record — you cannot produce a BRD at the end, because the BRD is assembled from what you logged along the way.

That single change is what most of this document describes.

---

## 2. The one-sentence model

> A **team** captures a **lead**, logs dated **interactions** with it, converts it into a **project** with delivery **phases**, records **payments** against those phases, and submits the automatically **composed BRD** for review — and only revenue a reviewer verifies counts anywhere in the programme.

Everything else — journals, GRIT Miles, the leaderboard, Demo Day — hangs off that spine.

---

## 3. Architecture

A **pnpm workspace monorepo**.

```
Brave-Dashboard/
├── artifacts/
│   ├── api-server/        Express 5 + TypeScript API
│   ├── brave-dashboard/   React 19 + Vite SPA
│   └── brave-mobile/      React Native shell (outside the workspace)
├── lib/
│   ├── db/                Drizzle schema — single source of truth
│   ├── api-zod/           Shared validation schemas
│   ├── api-client-react/  Orval-generated typed client + hooks
│   └── integrations/
└── docs/
```

**Stack**

| Layer | Technology |
|---|---|
| Frontend | React 19, Vite 7, Wouter (routing), TanStack Query 5, Tailwind 4, Radix UI |
| Backend | Express 5, TypeScript, Pino logging |
| Database | PostgreSQL via Drizzle ORM (`pg` driver) |
| Email | **Amazon SES** (SESv2) |
| AI | Google **Gemini 2.5 Flash Lite** |
| Storage | Object storage behind `/objects/<uuid>` |
| Hosting | Replit |

> **Naming trap.** The email module is `artifacts/api-server/src/lib/email/brevo.ts`, but it does **not** use Brevo — it was migrated to Amazon SES and only the filename survives, deliberately, so the ~31 call sites did not all have to change. The file says so at the top.

**Request path:** the SPA calls `/api/*`; `app.ts:148` mounts one router at `/api`, and `routes/index.ts` composes ~60 feature routers under it. Rate limiters sit in front (`app.ts:141-144`).

---

## 4. Seasons — how 1.0 and 2.0 coexist

Both seasons are live in the same database and the same deployment at the same time. Season 1 is a readable archive; Season 2 is where new work happens.

### The `seasons` table (`lib/db/src/schema/brave.ts:2169`)

| Field | Meaning |
|---|---|
| `slug` | The public identity — `"1.0"`, `"2.0"`. **Never infer the version from the numeric `id`.** |
| `isActive` | Exactly one season. New activity is written against it. |
| `isStaffDefault` | Where staff land by default — independent of the student-active season. |
| `isReadOnly` | Blocks student writes for that season. |
| `allowJournalWrites` (and siblings) | Per-capability archive overrides, all default `false`. |
| `weekCount` | Programme length in weeks, default 12. |

### How a season is resolved (`lib/season.ts:118`)

`resolveSeason(req)` is the **sole authority**. Its order:

1. **Student season override** — a per-user pin. Authoritative; beats everything below, so a pinned student cannot escape via a stale URL or header. Staff are never pinned.
2. `x-brave-season` header
3. `?season=` query parameter (keeps staff links shareable)
4. The session's remembered choice
5. The staff default (admins/coordinators only)
6. The active season

An unknown season id is **ignored, not rejected**, so a stale client can never 400 its way out of the dashboard.

### Canonical URLs

Authenticated URLs carry role and slug: `/student/season/2.0/dashboard`, `/admin/season/2.0/queue`. The URL-selected slug wins over stored defaults and is resolved through the season catalogue.

### The season-split pattern

Where 1.0 and 2.0 genuinely differ, the split is at the **page boundary**, not with conditionals inside a shared component:

- `dashboard-season1.tsx` / `dashboard-season2.tsx`, with `dashboard-legacy.tsx` as the boundary
- `grit-miles-season1.tsx` / `grit-miles-season2.tsx`
- `leaderboard-season1.tsx` / `leaderboard-season2.tsx`

This exists so that changing 2.0 cannot break 1.0's frozen history. Season 1's pages are not maintained — they are preserved.

---

## 5. Identity, roles and access

**Roles** (`user_role` enum): `student`, `coordinator`, `admin`.
A **super admin** is `role = admin` plus `is_super_admin = true`.

**Provisioning** (`provisioned_via`): `roster`, `csv_import`, `manual`, `auto_forms_sso`.

> **Critical:** user and roster **email is not unique**. Key every user-scoped query on `userId` / `formsUserId` — never on email. Several students legitimately share an address.

---

## 5b. The student surface — what a Season 2 student sees

The sidebar is the map of the student experience. With a team, in order:

| Entry | Route | Shown when |
|---|---|---|
| Dashboard | `/` | always |
| Weekly Journal | `/journal` | always |
| **Leads** | `/leads` | **Season 2+** (Season 1 shows *Projects* instead) |
| Leaderboard | `/leaderboard` | always |
| GRIT Miles | `/grit-miles` | always (content gated by toggles) |
| Demo Day | `/demo-day` | `demoDayMenuEnabled` |
| Finale Submissions | `/finale` | feature enabled **and** team qualifies |
| My Team | `/team` | always |
| Past Seasons | `/past-seasons` | only when an earlier season holds something |
| Resources | `/resources-library` | admin-enabled |
| Ticket Support | `/tickets` | menu enabled **and** view-or-add permitted |
| Guidebook | `/guidebook` | always — **opens in a new tab** |

Without a team, the student sees only **Get started**, **Leaderboard**, **Resources** and **Guidebook**.

Nothing toggleable renders until every visibility flag has resolved, because *"guessing a default either flashes an item in and then yanks it away, or hides one the student should have."*

### The Season 1 / Season 2 switch

```ts
const usesLeadPipeline = !!viewing && viewing.slug !== "1.0";
```

Season 1 keeps **Projects**; Season 2 and anything after it gets **Leads**. Keyed on the slug, never the numeric id.

### Archive padlocks

Nav entries declare what they write (`journal`, `revenue`, `project`). When the viewed season is a read-only archive and that capability has not been re-opened, a padlock appears next to the entry. It is **deliberately not a disabled link**: *"the page still opens, it just cannot be written to, and the server enforces that independently."*

### Past Seasons

Appears only once an earlier season actually holds journals or projects — *"a first-term student would otherwise get a link to an empty page."*

Its design is deliberate: *"There are **no edit controls, no submit buttons and no week tracker — not disabled ones, absent ones** — and the whole surface is a shade quieter than the live pages. Someone who cannot find a way to edit will not try; that works better than a warning nobody reads."*

### The dashboard

`dashboard-season2.tsx` owns the queries and derived figures and renders almost no markup. Two layouts — mobile and desktop — receive **identical props**, *"so a number can never read one way on a phone and another on a laptop."*

Constants: Demo Day threshold ₹2,00,000; streak tiers 3, 5, 8, 12.

The performance-snapshot season filter is component state on purpose: *"a reload returns to the student's own season, so nobody is left looking at last season's figures believing they are this season's."*

> ⚠️ **Maintenance note in the code:** the `useSeason` / `useState` / `useQuery` trio **must stay above the early returns**. React counts hooks per render, and a hook that only runs once data has arrived produces **React error #310**, which crashes the whole dashboard. This has happened once already.

---

## 6. Getting in: the access gate

A student cannot simply sign up. The **roster whitelist** is the real gate.

### What "on the roster" means

`computeIsOnRoster(userId, email)` — a whitelisted roster row must match **any** of:
- `roster.email == user.email`
- `roster.studentId == userId`
- `roster.studentId == users.formsUserId`

This matching must stay identical to `buildAuthUser` in `routes/auth.ts`: one decides what the gate *shows*, the other what the app *lets you do*.

### The gate

While the gate renders, the student **cannot reach any other page**. It shows a frozen, non-interactive sidebar preview (`pointer-events-none`, `aria-hidden`) so they can see what they are waiting for.

| Request status | Screen |
|---|---|
| none | The access-request form |
| `pending` | "Request Under Review" — *reviewed within 24–48 hours* |
| `rejected` | "Access Not Approved", showing the admin's notes |
| `approved` | "Access Approved" + auto-polling spinner |

**Auto-handover:** once approved, the client refreshes immediately and then **every 4 seconds** until `isOnRoster` flips true, at which point the gate stops rendering. A manual *"Taking too long? Reload"* button is the fallback.

### The form

`fullName` (required) · `email` (required in UI, **optional server-side** — it is only a contact address; identity is bound to `req.user.id`) · `niatId` (optional) · `mobileNumber` (required) · `sectionName` (required) · `campusId` (required, validated against `campuses`).

Synthetic SSO emails (`sso_<uuid>@forms.local`) are never prefilled.

### Endpoints

- `GET /api/access-requests/me` → `{ request, isOnRoster }`. Matched **strictly by userId, never email**, because email is not unique.
- **Self-healing:** if status is `approved` but `isOnRoster` is false, it re-runs `provisionApprovedAccessRequest` in a transaction and recomputes. Idempotent — this is what stops a student being trapped in the gate after approval.
- `POST /api/access-requests` → **409** *"You already have access."* if already on roster. **One request per user**: an existing row of any status is returned with 200 rather than duplicated.

### Terms & Conditions

Current version `2026-v1`. A blocking, **non-dismissible** modal — no close button, no Escape, no click-outside — shown only to students who have not accepted. **Three checkboxes, all required** before Accept enables. Links to the NIAT terms, the CCBP privacy policy, and a code of conduct (currently pointing at the terms page, as no dedicated page exists yet).

Accepting stamps `termsAcceptedAt` and `termsVersion`; re-accepting simply re-stamps.

### The full path

Log in → `isOnRoster` false → gate → fill form → `pending` → admin approves → provisioning writes a roster row → poll flips `isOnRoster` → student lands on `/get-started` to form a team.

---

## 7. Teams and membership

A student with **no team** sees only: Get started, Leaderboard, Resources (if enabled), Guidebook.

### Team size

`DEFAULT_TEAM_MEMBER_LIMIT = 5`, but the live value is read from `programme_config.teamMemberLimit` for the active season. **Season 1 allowed 5; Season 2 allows 4.**

Full message: `"Team is full (N/L members)"`.

### Creating a team — self-service

Students may only create at their own campus. Rejected if already on a team. Profile fields captured at creation (`fullName` split into first/last, `email`, `niatId`) are **only written where currently missing** — never overwriting existing data — with pre-flight 409s on duplicate email or NIAT ID. The creator becomes the leader and a unique invite code is generated.

### Joining by code

1. Code is normalised server-side (`.trim().toUpperCase()`)
2. 404 on no match
3. **Campus backfill from roster** when the user has no campus, persisted to the user row
4. 403 if no campus, or *"This team belongs to a different campus"*
5. 400 if already on a team
6. **409 if a membership request is already pending** — requests never stack
7. Pre-flight capacity check, re-checked at approval as the source of truth

Response is **200 `{status:"applied"}`** or **202 `{status:"pending_approval"}`**.

### Browse and search

**Browse** is scoped to the user's campus and excludes hidden teams. The response **strips** `inviteCode`, `coordinatorComment` and `rejectionReason`.

**Student search** requires ≥2 characters, searches roster name and NIAT ID within campus, limit 25, and **excludes students already on a team**.

### The approval gate — what actually needs an admin

This is more nuanced than "everything needs approval."

Five request types: `join_by_code`, `invite_accept`, `join_request_approve`, `leave`, `leader_remove`.

The rule (`shouldGateMembershipChange`):

```
if (!isRemovalType(type)) return false;   // every JOIN is self-service
return teamHasVerifiedRevenue(teamId);    // leave/remove gated only if verified revenue exists
```

| Action | Needs admin approval? |
|---|---|
| Join by code / accept invite / approve join request | **No** — applied immediately |
| Leave or remove, team has **no** verified revenue | **No** — applied immediately |
| Leave or remove, team **has** verified revenue | **Yes** |

The revenue check is **deliberately not season-scoped**: *"A team that earned verified revenue in Season 1 must still be protected when a member tries to leave during Season 2."*

Auto-approved rows are stamped `approved` with `decidedById: null` and the note *"Auto-approved — no admin approval required."*, and audited as `membership_request_auto_approved`.

If auto-apply fails an invariant (team full, already on a team), the pending row is **deleted** so no stray pending row is left behind.

Gated requests notify **every admin**, linking to `/admin/team-requests`. Notification failure never fails the student's request.

A one-time startup sweep auto-approves any currently-pending request that would not be gated under the current rule.

---

## 8. The Lead Pipeline — the heart of 2.0

Files: `routes/leads.ts`, `routes/pipeline.ts`, `lib/lead-pipeline.ts`, `pages/student/leads/*`.

### 8.0 Two structural guarantees

**Season isolation is a property of the router, not of each handler.** Both routers mount `requireLeadPipelineSeason()` as router-level middleware, so *"a new endpoint added later cannot forget it."* A Season 1 request gets **409 `SEASON_NOT_SUPPORTED`** — *"The lead pipeline is part of Season 2. Switch to Season 2 to use it."* On error it **fails open**.

**Gates live in `lib/`, not in handlers**, because *"the same rules are read by the BRD composer and the reviewer's queue. A gate implemented twice is a gate that eventually disagrees with itself."*

### 8.1 Who may act

| Action | Who |
|---|---|
| Capture leads, log interactions | **Any team member** — *"restricting it to the leader would mean the person standing in the shop cannot record the meeting"* |
| Projects, phases, payments, submit | **Team leader only** (`requireTeamLeader`) |
| Read any team's pipeline | Staff, via `?teamId` |

### 8.2 Stage 1 — Capture the lead

**17 fields, 9 mandatory.**

| Field | Type | Required |
|---|---|---|
| `source` | `walk_in` · `online` · `referral` · `known_contact` | yes |
| `referrerName` | max 200 | if `referral` |
| `relationshipNote` | max 1000 | if `known_contact` |
| `businessName`, `ownerName` | 1-200 | yes |
| `phone` | 6-30 | yes |
| `altPhone` | max 30 | |
| `businessCategory` | `retail` · `food_beverage` · `clinic` · `salon` · `education` · `services` · `manufacturing` · `other` | yes |
| `city` | 1-120 | yes |
| `areaLocality` | max 200 | |
| `geoLat` / `geoLng` | max 40 | |
| `firstMeetingDate` | `YYYY-MM-DD` | yes |
| `meetingMode` | `in_person` · `phone` · `video` · `whatsapp` | yes |
| `conversationNote` | 1-4000 | yes |
| `painPoint` | max 4000 | |
| `estimatedValue` | 0-100,000,000 | |
| `evidence` | max 10 URLs | |

The two conditional requirements are **schema refinements**, not optional columns the UI is trusted to fill.

**`firstMeetingDate` cannot be in the future** — *"it anchors the whole trail, and Gate A's span is measured from it."*

**`isRelatedParty` is derived, not client-supplied** — true for `referral` and `known_contact`. *"A student cannot opt out of the flag."*

**Client registry:** each lead upserts a programme-wide one-row-per-business registry keyed on a **normalised phone** (digits only; strips a leading `91` from 12-digit numbers and a leading `0` from 11-digit ones, so `+91 98490 12345`, `098490 12345` and `9849012345` all collide). Duplicate detection returns other teams holding the same phone — **informational only, never a block**, because *"two teams genuinely can approach the same shop."*

**Deleting a lead** that has a project → 409 `LEAD_HAS_PROJECT`.

### 8.3 Stage 2 — The dated interaction trail

**8 fields, 4 mandatory.**

| Field | Type | Required |
|---|---|---|
| `interactionDate` | `YYYY-MM-DD` | yes |
| `interactionType` | `call` · `whatsapp` · `email` · `site_visit` · `demo` · `proposal_sent` · `negotiation` · `payment_discussion` | yes |
| `summary` | 1-4000 | yes |
| `outcome` | `positive` · `neutral` · `objection` · `no_response` | yes |
| `objectionNote` | max 2000 | if outcome is `objection` |
| `nextActionDate` | `YYYY-MM-DD` | |
| `attachments` | max 10 | |
| `stageChange` | a lead stage | |

Validations: cannot be future-dated; **cannot predate `firstMeetingDate`**; an objection must say what it was.

`lastContactAt` derives from the latest interaction **date**, not `loggedAt` — *"silence is measured from when the student last actually spoke to the client."* Logging a fresh interaction resets `lastNudgeLevel` to 0, so a lead that goes quiet twice is nudged twice.

**Lead stages:** `new` · `qualified` · `proposal_sent` · `converted` · `lost` · `dormant`.
Write schemas accept only the first five — **`dormant` is set solely by the cron**, never by a student.

### 8.4 The three gates

#### GATE A — advisory only, never blocks

```
GATE_A_MIN_INTERACTIONS = 3
GATE_A_MIN_SPAN_DAYS    = 7
```

Counts **distinct interaction dates**, not rows — *"five messages on one afternoon do not look like five days of work."*

**Gate A blocks nothing.** `GET /leads/:id` returns a hard-coded `canConvert: true`, with the reasoning: *"A student who closes a client on the first visit has done the work, not skipped it — the trail is evidence for the reviewer, not a turnstile."* `stageRefused` is permanently `null`, kept in the response shape only so existing clients keep parsing it.

It feeds the admin Leads page, the stepper caption, and the BRD's system assessment.

Stepper label: *"3 dated interactions spanning 7+ days"*.

#### GATE B — the only gate the mode changes

**Rule:** a project may only descend from a lead in stage `converted`.

| Mode | Behaviour |
|---|---|
| **Enforced** | 409 `GATE_B_NOT_MET` — *"This lead is not converted yet. Work the lead until the client says yes, then convert it."* |
| **Advisory** (default) | Project allowed, and **the lead is auto-moved to `converted`** — *"a project starting IS the client saying yes, and leaving the lead on 'New' would make every downstream view lie about it."* |

Enforced regardless of mode: **one project per lead** (409 `LEAD_ALREADY_HAS_PROJECT`), *"otherwise the same relationship could be claimed twice over."*

#### GATE C — the five items

Five **equally weighted** items, defined in `brd-composer.ts`:

| # | Key | Passes when | Message on failure |
|---|---|---|---|
| 1 | `interaction` | at least 1 interaction | "Record at least one client interaction." |
| 2 | `work` | title **and** serviceCategory **and** problemStatement **and** solutionDescription | "Complete the project title, service, problem and solution." |
| 3 | `proof` | any of live product / demo video / source code / prototype | "Add a live product, demo video, source code or prototype link." |
| 4 | `phases` | at least 1 phase | "Add the delivery phases." |
| 5 | `payment` | at least 1 recorded payment | "Record at least one received payment." |

Score = completed x 20, so 0 / 20 / 40 / 60 / 80 / 100.

**Gate C always applies — it is NOT subject to advisory/enforced**, *"so the UI and server cannot disagree."* Failure returns 409 `LEAD_PROGRESS_INCOMPLETE` listing only the failing items.

> **Three places replicate this list and must stay in step:** the composer (the authority), `progressItems` on `GET /leads/:id`, and a raw SQL projection for the board. The code warns: *"If that checklist changes, this must change with it, or a card will invite a student to submit something the server then refuses."*

**Deliberately not gates:** interaction volume, elapsed days, trail-strength bands.

### 8.5 Gate modes — advisory vs enforced

Stored per season on `programme_config.pipeline_gates_enforced`, cached 30 seconds.

**Default and fallback is ADVISORY.** On any config read error it returns `false` — *"a config read failure must never turn into 'the student is blocked'."*

| | Advisory (default) | Enforced |
|---|---|---|
| Gate A | never blocks | never blocks |
| Gate B | allowed; lead auto-converted | **409** |
| Gate C | blocks | blocks |
| Stepper | `open` | `blocked` / `locked` |

`PUT /admin/pipeline/gates` requires Config edit permission **and** admin role, and is audit-logged.

### 8.6 Stage 3 — Open the project

**17 fields, 10 mandatory.** Leader only.

Beyond the work fields: `techStack` (max 30), the four proof URLs, `demoCredentials`, `revenueType` (`one_time` / `recurring`, with `recurringFrequency` required when recurring), `agreementDoc` and `agreementAccessConfirmed`.

**Phases: minimum 2, maximum 12.** Each carries `name`, `deliverables`, `startDate`, `endDate`, `amount`, `dueDate`, `revenueType`.

> *"Phase-wise plan AND phase-wise payment in one shape, because a phase without money and money without a phase were the two commonest Season 1 gaps."*

**Links are checked before the row is written** — a blocking failure returns 400 `LINK_UNREACHABLE`. A timeout is **not** treated as blocking.

Phases and their payment-schedule rows are written **in one transaction**, *"so a schedule row can never reference a phase that does not exist."*

**Guards:** deleting below 2 phases gives 409 `MINIMUM_PHASES_REQUIRED`; deleting a phase that has payments gives 409 `PHASE_HAS_PAYMENTS`; deleting a project that has payments gives 409 `PROJECT_HAS_PAYMENTS`.

**Freeze on submit:** once a `revenue_entries` row exists with a status other than `draft`, every project/phase/payment mutation returns 409 `PROJECT_ALREADY_SUBMITTED`.

Season 1 projects are refused everywhere with 400 `NOT_A_PIPELINE_PROJECT`.

### 8.7 Stage 4 — Deliver and log payment

**9 fields, 6 mandatory.** Leader only.

| Field | Required |
|---|---|
| `phaseId`, `amountReceived` (min **1**), `paymentDate`, `paymentMode`, `paymentProof` | yes |
| `transactionRef` | yes, **unless cash** |
| `deliveryProof` | max 10 |

**Why cash is exempt rather than forbidden:** the reference is *"what makes the duplicate-UTR check possible."*

Validations:
- The phase must belong to this project
- Cannot be future-dated
- **Cannot predate `firstMeetingDate`** — *"Money cannot arrive before the relationship started. This is a cheap check that catches a whole class of fabricated timelines."*
- A duplicate `transactionRef` (partial unique index, PG error `23505`) gives **409 `DUPLICATE_TRANSACTION_REF`**

**`clientConfirmed` is not settable by students** — it is written by the automated satisfaction call. A confirmed payment can be neither edited (409 `PAYMENT_CONFIRMED`) nor deleted.

---

## 9. The BRD and Gate C

### The headline decision

> *"**THERE IS NO BRD FORM IN SEASON 2.** The document is assembled from what was already recorded at stages 1-4 and shown to the student to confirm. That is the single change that removes the largest fabrication surface in Season 1: a BRD can no longer contain anything that was not logged as it happened."*

`composeBrd(projectId)` returns `null` for any project without a `leadId` — a Season 1 project has no trail.

### What the document contains

| Block | Contents |
|---|---|
| `project` | id, title, serviceCategory, teamName, seasonId, totalContractValue, revenueType, recurringFrequency |
| `client` | businessName, ownerName, phone, category, city, areaLocality |
| `relationship` | source, **isRelatedParty**, referrerName, relationshipNote, firstMeetingDate, meetingMode, geo coordinates and **`geoMapUrl`** |
| `links` | live product, demo video, source code, prototype, demo credentials |
| `clientEvidence` | capture evidence (shopfront photo, visiting card) |
| `attachmentTypes` | a `path -> contentType` map |
| `interactionTrail` | every interaction, plus **`loggedAfterHours`** |
| `phases` | with `scheduledAmount`, `receivedAmount` and a derived status |
| `payments` | with the actual proof and invoice URLs |
| `systemAssessment` | Gate A status, isRelatedParty, claimedAmount, receivedAmount, composedAt |
| `gateC` | the five-item checklist |

**Three details worth understanding:**

**`geoMapUrl`** turns a coordinate pair into an openable Google Maps link — *"A coordinate pair a reviewer cannot open is not evidence they can check."*

**`loggedAfterHours`** is the gap between when an interaction happened and when it was typed. *"A large gap is the backdating signal a reviewer looks for."*

**`attachmentTypes`** exists because uploads are stored as `/objects/<uuid>` **with no file extension**, so *"nothing downstream can tell a photo from a PDF by looking at the path."* It is resolved in one query from `uploaded_files`, and it is what makes payment proofs and meet proofs render as pictures rather than links.

Payment proof and invoice URLs are embedded because *"a reviewer reading the BRD should not have to leave it to see what a payment claim rests on."*

Phase status is derived: `received` when the received amount meets the scheduled one, else `due` when a due date exists, else `pending`.

### Submitting

Leader only. Order: compose, then **Gate C**, then the re-submit guard, then amount derivation, then price recognition, then write.

**Submission does not create a parallel queue.** It writes a normal `revenue_entries` row, so every existing coordinator screen, verifier action, leaderboard total and export keeps working untouched. The only difference is that `brd_url` is NULL and the composed document lives in `brd_composed` / `brd_text`.

**The amount is the sum of payments RECEIVED, never the contract value** — *"an unpaid contract is not revenue, and letting the two diverge here is how Season 1 ended up with inflated totals."*

**Price recognition** applies the category cap and the recurring multiplier into separate columns (`recognisedAmount`, `weightedAmount`). The claimed `amount` is **never rewritten** — the audit trail depends on it. The response carries a `capNote` **only when the cap actually bit**, *"so the student is told WHY their figure was trimmed rather than just seeing a smaller number."*

**The snapshot is frozen at submission** — *"a reviewer must see what was submitted, not a document that keeps changing underneath them."*

AI analysis is **scheduled, never awaited**: *"a slow Gemini call must not hold the submit response, and a failed audit must still leave a reviewable entry."*

### The 5-step stepper

| Step | Label |
|---|---|
| 1 | Capture the lead |
| 2 | Work the lead |
| 3 | Open the project |
| 4 | Deliver and log payment |
| 5 | BRD ready |

States: `complete` · `current` · `blocked` · `locked` · `open`. In advisory mode nothing is ever `blocked` or `locked` — an undone step is simply `open`.

### Leads Control — the season permission matrix

Five sections — **leads, projects, phases, payments, interactions** — each with `add` / `edit` / `delete`, plus an independent `submitForReview`.

**Defaults: `add: true`, `edit: false`, `delete: false`.**

The master lock message: *"Lead submissions are temporarily paused. You can view your leads and projects, but you cannot make changes or submit for review right now."*

Every mutating handler calls `allowLeadsAction(...)`. **Only admins bypass these. Coordinators do not.**

---

## 10. Review Queue — how revenue gets verified

**Admin → Review Queue.** Three tabs: **Pending review**, **Approved**, **Rejected**.

> Note: `routes/review.ts` is a *different* system (evaluator assignments, appeals, audits). The Review Queue lives in `routes/financials.ts`.

### The three actions

| Action | Permission | Detail |
|---|---|---|
| **Verify** | `/admin/queue` + `approve` | Accepts a `verifiedAmount` and `adminNotes`; emails the team; audit-logged as `verify_revenue_entry` |
| **Reject** | `/admin/queue` + `reject` | `adminNotes` becomes the reason shown to the student and sent in the email |
| **Unverify** | `/admin/queue` + `edit` | Read and transition happen **under a row lock inside a transaction**, so concurrent unverify requests cannot both succeed — *"only the first should win; the second must see the new 'submitted' state and return 409"* |

Bulk selection is available. The **overdue cutoff is 48 hours**, shared with the overdue-notification cron.

Student-side lifecycle actions (`submit`, `revoke`) are wrapped in `requireWritableSeason("revenue")`.

### Rejection reasons

An admin-managed catalogue with full CRUD (labels 3–500 chars), seeded **only when the table is empty**. The two defaults:

1. *"Kindly submit the BRD in the required format"*
2. *"Please attach conversation screenshots, working links, a phase-wise payment plan, client details, and testimonials"*

They appear as tap-to-insert chips in the reject dialog.

### The AI BRD audit

**Automatic:** analysis is scheduled **5 minutes** after submission. In-flight timers are tracked so a student re-submitting inside the window does not double-schedule, and the timer is `unref()`'d so it never keeps the event loop alive. If the server restarts first, a startup sweep picks the entry up.

**Manual "Analyse now" / Re-analyse:** admin-only, bypasses the 5-minute delay. It rejects with 400 only when there is **neither** a PDF **nor** a composed BRD — because *"Season 1 attaches a PDF; Season 2 composes the document from logged records and has no file."*

### Verified revenue is the currency

Nothing counts until verified: not the leaderboard, not GRIT Miles, not Demo Day eligibility, not Finale eligibility.

---

## 11. Weekly Journal

### Fields

| Field | Type | Required |
|---|---|---|
| `whatWeDid` | **5–2000 chars** | yes |
| `blockers` | max 2000 | |
| `nextWeekPlan` | max 2000 | |
| `clientsVisited`, `activeConversations`, `projectsStarted`, `projectsClosed` | 0–100,000 | default 0 |
| `images` | max 10 URLs | |

### The week model

`getCurrentOpenWeek(seasonId)` picks the open week containing today, else falls back to **the last open week**. `seasonId` is **required deliberately**: *"Week numbers repeat across seasons and an archived season can still hold an open week, so an unscoped lookup could hand a Season 1 week to a Season 2 journal."*

A journal belongs to **the season its week belongs to**.

### Submission

**Upsert — one journal per (team, week).** Re-submitting updates in place and re-stamps `submittedAt` / `submittedBy` / `submittedByRole`.

- An explicitly named week that is **not open** → 403 *"This week is closed for submissions"*
- No open week at all → 400 *"No open programme weeks. Ask an admin to open the current week."*
- Fires AI analysis fire-and-forget; re-submitting re-schedules; no-ops without an API key

### The submission lock

Season-scoped and **operational, not archival**. `getJournalSubmissionsLockError` returns null for **non-students** — staff corrections remain available while students are view-only.

Default message: *"Weekly Journal submissions are temporarily paused. You can still view your previous journals, but you cannot add, edit, or delete entries right now."*

### Who may edit what

| Role | Rule |
|---|---|
| **Admin** | Always allowed |
| **Coordinator** | Own campus only; 403 *"Cross-campus access not allowed"* otherwise |
| **Student** | Must be on the journal's team; if the week is **closed**, requires the admin toggle `allowPastWeekEdits`, else 403 *"Past-week journals are read-only. Ask an admin to enable past-week edits."* |

The journal's **own season** governs this — not the currently viewed one.

`GET /journals/permissions` returns exactly what the UI may show, because *"the frontend hides buttons off this, so the two must agree or a student sees a button that 409s."*

Admin coverage assumes a 12-week programme.

---

## 12. GRIT Miles

### The ladder

| Level | Verified revenue | Miles | Subtitle |
|---|---|---|---|
| 1 | ₹25,000 | 100 | The First Step |
| 2 | ₹50,000 | 150 | Build Momentum |
| 3 | ₹1,00,000 | 250 | Raise Your Standard |
| 4 | ₹2,00,000 | 500 | Scale With Purpose |
| 5 | ₹4,00,000 | 1000 | Impact at Scale |

Admin-configurable per season, 1–20 levels, each with an optional `reward` label. The resolver **always sorts ascending by revenue target** and falls back to the defaults on null, empty or unparseable config — it never throws.

### Two different meanings of "miles"

This trips people up, so it is worth stating plainly:

| Context | Semantics |
|---|---|
| **What the student sees** | **Cumulative** — `milesUnlocked` sums every cleared level |
| **Admin dashboard and exports** | **Highest milestone** — the `miles` of the top cleared level, explicitly *not* a sum |

`currentLevel = 0` means no level reached. `revenueToNext` is 0 when every level is unlocked.

### Visibility toggles

Three independent flags, all default `false` (= the previous Demo Day experience):
- `gritMilesMenuEnabled` — the sidebar entry
- `gritMilesDashboardEnabled` — the dashboard widget
- `demoDayMenuEnabled` — the Demo Day entry

### The page

Presentation only — every number comes from verified revenue and the admin-configured ladder. One horizontal hero plus a compact row per level, *"so all five levels read as a journey on one screen rather than as five large cards."* Each level shows an **Unlocked** or **Locked** pill — a state label, not a button; nothing is clickable. Count-up animations respect `prefers-reduced-motion`.

> ⚠️ **Known drift:** the client-side fallback ladder has **different** values for levels 4 and 5 (400 and 500 miles) from the server (500 and 1000), despite a comment claiming it mirrors the server. This only bites while the config request is in flight or has failed. Documented and left unreconciled.

---

## 13. Leaderboard

### Three views

`national` · `campus` · `overall`. Coordinators default to `campus`; everyone else to `national`.

### The ranking figure

```sql
SUM(COALESCE(weighted_amount, verified_amount)) WHERE status = 'verified'
```

This is the **ranking** figure, not the accounting one. `weighted_amount` carries the category cap and the recurring multiplier; it is NULL on every Season 1 row, which falls straight through to `verified_amount` and so *"ranks exactly as it did before Phase 6 existed."* It deliberately stops at `verified_amount` — adding an amount fallback *"would start counting it and would move Season 1 totals."*

Order: featured first, then total descending, then team id.

### The "Overall" (lifetime) view

A straight sum with **no season predicate**, plus a per-season breakdown so the table can show Season 1 / Season 2 / Overall columns.

Its correctness rests on one fact: *"Teams are IDENTICAL across seasons (same team rows, same membership), so a lifetime roll-up is a straight sum with no season predicate at all... That is only true because of the 'same teams' decision; had teams re-formed, this would require mapping lineages."*

### Ranks are locked before search

Two-phase, and this matters:

1. Rank is assigned to **all** teams in order — *"this is the true national/campus rank, computed BEFORE any search filter"*
2. The search filter is applied **afterwards**, *"so a team's displayed rank reflects its real standing in the full leaderboard (not its position within the filtered subset)"*

Search matches team name, campus name, or any member's name, email or NIAT ID.

### Rank hiding

`hideRankForStudents` hides medals and rank numbers from **students only** — *"Admins & coordinators always see rank."* The dashboard shows a *"revealing soon"* note with the configured reveal time instead.

**Hidden teams** are excluded for everyone except admins.

### Banner

`bannerSource` is `image` or `template`; templates are `broadcast` · `podium` · `spotlight` · `ribbon`, with editable eyebrow, title, subtitle, time text and two chips.

---

## 14. Demo Day, Finale and People's Choice

**Demo Day** — the verified-revenue threshold is `demoEligibilityThreshold`, defaulting to **₹2,00,000**. Applications open while `demoDayApplicationsOpen` is true and before the deadline. Statuses: `draft` · `submitted` · `shortlisted` · `rejected`.

**Finale** — gated on `finaleMinVerifiedRevenue`. The menu appears only when the feature is enabled **and** the team qualifies. Has its own lock, message and content block.

**People's Choice Award** — `pcaVotingEnabled` with `pcaMinVerifiedRevenue` to vote. Vote-confirmation emails skip synthetic accounts (`@forms.local`, `sso_` prefixes).

---

## 15. Ticket Support

Students raise support tickets; staff triage them. Season-scoped throughout.

**Student side** (`/tickets`): raise a ticket, see status and the reply inline once answered.

**Staff side** (`/admin/tickets`): three tabs — **Active**, **Closed**, **My tickets** (everything the admin holds, open or already closed). Search, category filter, date range. Assign to self, hand over to another staff member, or answer-and-close with a rich-text reply.

**Categories and sub-categories** — two dependent pickers, both required:

| Category | Sub-categories |
|---|---|
| Leads & Clients | Can't add/edit a lead · stage wrong · duplicate or wrongly-flagged · interactions/meet proofs won't save · marked dormant by mistake |
| Projects & BRD | Can't create/edit project · BRD won't submit · missing items blocking submission · BRD rejected, need help · phases won't save |
| Revenue & Payments | Payment not showing · revenue rejected, need clarification · verified amount wrong · proof won't upload · client disputed |
| Team & Membership | Can't join/create team · add/remove stuck · leave request pending · wrong team or campus · leader change |
| Journal, GRIT & Leaderboard | Journal won't submit · window closed · GRIT count wrong · rank or revenue wrong · Demo Day/Finale issue |
| Account & Technical | Can't log in · page error · upload fails · mobile app issue · wrong season · **Something else** |

*"Something else"* sits at the bottom of the last category rather than being its own top-level bucket, so most tickets arrive genuinely routed.

**Ticket ids** are UUIDs, displayed as an 8-character reference (e.g. `#A3F91C02`).

**Resolutions are rich text**, sanitised server-side by an allow-list (`lib/sanitize-html.ts`) before storage — so what reaches a student's browser and their inbox is already safe.

**Admin controls** (Config → Leads Control → Ticket Support):
- *Show Ticket Support to students* — **off by default**; the feature ships dark
- Student permissions: **Raise tickets** ✅ · **See their tickets** ✅ · **Edit a raised ticket** ☐ · **Delete a raised ticket** ☐

Edit and delete are off by default because a ticket records what was asked and what was answered; letting a student rewrite it would change the history a reply was written against.

---

## 16. Every email the system sends

All email goes through `sendEmail()` in `lib/email/brevo.ts` — **Amazon SES (SESv2)**, despite the filename.

- **Sender:** `BRAVE Dashboard <brave.niat@nxtwave.in>` (`EMAIL_FROM`; region `AWS_REGION`, default `ap-south-1`)
- **App URL in links:** `getAppUrl()`, default `https://dashboard.brave.niatindia.com`
- **Templates:** 12 files in `lib/email/templates/`

### 16.1 The kill-switch mechanism

Every `sendEmail` call is **tagged with a category**. Super admins toggle them in **Config → Notifications & Reminders**, stored as a jsonb map in `programme_config.email_controls`.

Four properties matter:

| Property | Detail |
|---|---|
| **Default ON** | A missing key means enabled — `out[key] = stored[key] !== false` |
| **Fail-open, twice** | If the toggle check throws, the email still sends ("fall through and send"); if the config read fails, it defaults to ON |
| **Silent skip** | A disabled category logs and returns `false` — it never throws, so the caller's main flow (verifying revenue, approving a request) always completes |
| **Never throws** | Missing AWS credentials, no valid recipient, or an SES error all resolve `false` and log |

Controls always read from the **active season**, because `sendEmail` has no request to resolve a season from. Cached for **30 seconds**; editing the toggles invalidates the cache immediately.

**Uncategorised emails always send** — the admin test email is deliberately untagged so it can never be silenced.

### 16.2 The 15 categories

`overdueReminders` · `journalReminders` · `journalEscalations` · `revenueVerified` · `revenueRejected` · `announcementEmails` · `submissionAccess` · `accessRequestDecision` · `teamNameDuplicate` · `finaleReview` · `heatmapNudges` · `teamMembership` · `pcaVotes` · `ticketCreated` · `ticketResolved`

### 16.3 Every email, with its trigger and subject

**Revenue**

| Trigger | Recipients | Category | Subject |
|---|---|---|---|
| Revenue entry **verified** | Team leader + all members, deduped, **capped at 50** (SES limit) | `revenueVerified` | `Revenue verified: ₹X for <team>` |
| Revenue entry **rejected** | Same, capped 50 | `revenueRejected` | `Revenue entry needs changes: <team>` |

**Access and membership**

| Trigger | Recipients | Category | Subject |
|---|---|---|---|
| Access request approved | Applicant | `accessRequestDecision` | `You're in — your BRAVE Dashboard access is approved` |
| Access request rejected | Applicant | `accessRequestDecision` | `Update on your BRAVE Dashboard access request` |
| Membership approved (join) | The joining student | `teamMembership` | `You've joined <team> on BRAVE` |
| Leave approved | The departing student | `teamMembership` | `You've left <team>` |
| Leader removal approved | The removed student | `teamMembership` | `You've been removed from <team>` |
| Membership rejected | The requesting actor | `teamMembership` | `Your request was not approved — <team>` |
| Add-flow rejected (target ≠ actor) | The would-be joiner | `teamMembership` | `Your request to join <team> was not approved` |
| Duplicate team name flagged | Leader + members of each **losing** team, capped 50 | `teamNameDuplicate` | `Quick action needed: your team name "<name>" is already taken` |

**Submissions and events**

| Trigger | Recipients | Category | Subject |
|---|---|---|---|
| Submissions **enabled** for a team | Team members, capped 50 | `submissionAccess` | `Submissions are open for <team> 🎉` |
| Submissions **disabled** | Team members | `submissionAccess` | `Submissions are paused for <team>` |
| Submission request rejected | Team members, capped 50 | `submissionAccess` | `Update on your submission request — <team>` |
| Finale deck verified | Team members, capped 50 | `finaleReview` | `Your BRAVE Finale deck is verified 🎉 — <team>` |
| Finale deck rejected | Team members | `finaleReview` | `Update on your BRAVE Finale submission — <team>` |
| PCA voting opens | Members of each team, capped 50 | `pcaVotes` | `Voting is open — BRAVE People's Choice Award 🏆` |
| Student casts a PCA vote | The voter (skips synthetic `@forms.local` / `sso_` accounts) | `pcaVotes` | `Your vote has been recorded ✅` |
| Announcement published with email fan-out | All students with a valid email, **batched with a delay** | `announcementEmails` | `BRAVE Announcement: <title>` |

**Support tickets**

| Trigger | Recipients | Category | Subject |
|---|---|---|---|
| Student raises a ticket | The raiser | `ticketCreated` | `We've got your ticket (ABC12345) — <subject>` |
| Staff answer and close | `createdBy` | `ticketResolved` | `Your ticket (ABC12345) has been answered — <subject>` |

The resolution email is **multipart HTML + plain text**: the HTML carries the sanitised rich-text reply in a quoted block, and the plain-text alternative is generated from that same HTML by `richTextToPlain()`, so the two halves can never disagree. Ticket-created mail is best-effort — a mail failure must not lose the ticket the student just wrote.

**Nudges (admin-triggered)**

| Trigger | Recipients | Category | Subject |
|---|---|---|---|
| Heatmap nudge | Individual students, **one at a time with a gap** so no recipient sees another | `heatmapNudges` | Four variants by streak: `🔥 <team> is on a roll — keep it going!` · `<team> — keep your progress streak alive` · `<team>, it's been a while — let's get back on track` · `🚀 <team>, your BRAVE journey starts now` |
| Never-logged-in nudge | Students who have never logged in, sent individually | `heatmapNudges` | `[BRAVE] Log in to your BRAVE Dashboard` |

**Automated (cron)**

| Trigger | Recipients | Category | Subject |
|---|---|---|---|
| Journal Day-7 reminder (Day-5 is **in-app only**) | Team members | `journalReminders` | `[BRAVE] Week N is about to close — your story's still missing` |
| Overdue review digest | Active `overdue_notification_subscribers` | `overdueReminders` | `BRAVE: N overdue review items` |
| Campus escalation (Success Coach / COS) | Coordinators tagged for that level | `journalEscalations` | `[BRAVE] <Level> — <campus> journals pending (Week N)` |
| Admin-level escalation | Admin notification subscribers | `journalEscalations` | `[BRAVE] Journal report — Week N (start → end)` |
| Friday weekly report | Admin notification subscribers | `journalEscalations` | `[BRAVE] Weekly journal report — Week N` |

**Admin test email** — `POST /admin/test-email`, sent to any address the admin types. Templates: `revenue_verified`, `revenue_rejected`, `plain`. Subject is `[TEST] <rendered subject>` or `BRAVE — SES test email`, body prefixed *"(This is a test email triggered from the admin Config page.)"*. **Deliberately uncategorised** so it always sends; returns **502** if `sendEmail` returns false, which makes it a genuine SES health check.

## 17. In-app notifications and announcements

Separate from email.

**Notifications** — three student endpoints only: list, mark one read, mark all read. Writes go through `createNotification(userId, title, body, type, link)`.

Observed types: `reminder`, `lead_nudge`, `membership_request`, `membership_approved`, `team_member_joined`, `leave_approved`, `team_member_removed`, `membership_rejected`.

**Announcements** — staff-authored, targeted `all` / `campus` / `team`, with per-user dismissal tracking and a pinned variant. Optionally fanned out by email in batches with a delay. Creation never blocks on mail: `sendEmail` *"no-ops cleanly if SES is unconfigured."*

**Overdue-digest subscribers** — a separately managed list (`overdue_notification_subscribers`, filtered to active) that receives the overdue cron and the admin rung of the journal escalation.

**Pop-ups** — admin-managed modals students must acknowledge.

---

## 18. WhatsApp broadcasts

Via **Karix**. The client *"mirrors the contract of `sendEmail()` on purpose"* — it never throws.

**Super-admin only.** The check re-reads `isSuperAdmin` from the database and 403s otherwise, gating template create/update/delete and **send**. Read and preview routes are not super-admin gated.

**Hard cap: 2,000 recipients per broadcast.**

The flow is deliberately two-step:

1. **Preview** — validates the selection, resolves the audience, and returns the recipient count so the admin sees who they are about to reach
2. **Send** — carries `confirmedCount`, a confirm-what-you-saw guard against the audience shifting between preview and send. Supports **`dryRun`**. Bindings are validated against the template, and recipients without a normalised phone are filtered out

Merge fields depend on audience — `{{teamName}}` is not offered for a coordinator broadcast, since coordinators have no team.

> **API contract:** Karix uses a non-standard `Authentication:` header (not `Authorization:`), and the real status must be read from the **response body**, not the HTTP status code.

---

## 19. Scheduled jobs (cron)

Triggered externally by **cron-job.org**, whose job timeout is ~30 seconds — so most jobs **respond 202 immediately and run fire-and-forget**.

Every `/internal/cron/*` route is guarded by a shared secret header **`X-Cron-Secret`**. If `CRON_SECRET` is unset the route returns **500** rather than running.

### 19.1 Advisory locking

Multi-instance safety uses **PostgreSQL advisory locks** (`lib/cron-lock.ts`), not in-process booleans. The previous guards were per-process module flags, which are useless on an autoscale deployment where a cron-job.org **retry can land on a different instance**.

- `lockKey(name)` — stable 31-bit positive hash
- `tryAcquireCronLock(name)` takes a **dedicated pooled connection** and runs `SELECT pg_try_advisory_lock($1)`; returns `null` if already held
- `release()` runs `pg_advisory_unlock` and returns the connection; idempotent via a `released` flag
- The handler holds the lock across the whole run in `try/finally` — **never** on response `finish`/`close`, because a client disconnect would free the lock mid-run

Lock names: `cron:reminders`, `cron:backup-supabase`, `cron:journal-escalation`, `cron:lead-nudges`, `cron:trust-awards`.

> ⚠️ **`cron-overdue-notifications.ts` is the only cron route with no advisory lock.** Since it fans out to every active subscriber, a cron-job.org retry could double-send the digest. Worth fixing.

### 19.2 The jobs

**A. Journal reminders** — `POST /internal/cron/reminders`, **daily 9 AM IST**.
Finds the current open programme week, skips teams that already submitted, then computes the day of week:
- **Day ≥ 7** (no `silence_7d` log) → in-app + **email** + coordinator notification
- **Day ≥ 5** (no `silence_5d` log) → **in-app only**

Every send is written to `reminder_log` keyed by `weekStartDate`, so deduplication restarts naturally each new week — no manual reset needed. Also auto-opens due programme weeks.

**B. Journal escalation** — `POST /internal/cron/journal-escalation`.
Chain after the **Tuesday EOD** deadline, each rung at 6 PM:

| Weekday (IST) | Escalates to |
|---|---|
| Wednesday | Success Coach |
| Thursday | COS |
| Friday | Admin |

`levelForToday()` resolves the weekday in **Asia/Kolkata**, explicitly not server UTC — a job scheduled late in the IST evening would otherwise land on the next UTC day and resolve the wrong rung. Coordinators are found by tag (`Success Coach`, `COS`). Each email carries a **unique login-gated report link**, and every send is logged so re-runs never double-send. The lock exists specifically because admin rows have `campusId = NULL`, which the unique constraint cannot deduplicate.

**C. Weekly journal report** — `POST /internal/cron/weekly-journal-report`.
Friday full-week grid plus campus summary, emailed as a link to admin notification subscribers.

**D. Overdue notifications** — `POST /internal/cron/overdue-notifications`.
Daily digest of review-queue items waiting **more than 48 hours** — the same cutoff the Review Queue itself uses. Emails active subscribers in batches of **10** with a 1-second pause.

**E. Lead nudges and dormancy** — `POST /internal/cron/lead-nudges`.
The framing in the code: *"The Season 2 pipeline's failure mode is not fraud, it is silence."*

Measured from the last logged interaction, or the first meeting if there is none:

| Silence | Action |
|---|---|
| **10 days** | Nudge the team |
| **21 days** | Escalate to campus coordinators |
| **30 days** | Mark the lead `dormant` |

Season-scoped: only active-season leads, and only while that season still accepts project writes — *"an archived Season 1 must never generate notifications."* Idempotent via `last_nudge_level`, which records the highest rung sent; **logging a fresh interaction resets it to 0**, so a lead that goes quiet twice is nudged twice. Silent days are computed in one SQL query with `COALESCE`, not one query per lead. Escalation resolves to campus coordinators only, or nobody — *"a misrouted escalation trains people to ignore escalations."*

**F. Trust awards** — `POST /internal/cron/trust-awards`. **Not mounted** — see §27.
Sweeps for signals that *"are not events anybody triggers — they are facts that become true as time passes"*: `journal_streak` (4 consecutive **programme weeks**, not raw dates), `geo_verified` (lead captured at client premises), `phase_delivered_on_time` (phase fully paid by its due date; phases with no due date are excluded). Every award carries refType/refId so a partial unique index makes re-runs idempotent. The `link_dead` re-check is deliberately excluded — it needs outbound HTTP per project.

**G. Supabase backup** — `POST /api/internal/cron/backup-supabase`.
**Pure Node**, no `pg_dump`/`psql` binaries, so it works in Replit's deploy image. **Data-only sync** — Supabase must already have the schema, created once via `pnpm --filter @workspace/scripts run backup-supabase`. Runs in a single transaction with **deferred FK constraints**, so a partial failure rolls back — *"no more 'wiped but not restored' disasters."* Paginates source reads at **1,000 rows per page** so memory doesn't spike on large tables. The source database is touched **read-only (SELECT only)**; only `public` schema tables in the destination are truncated and re-inserted.

> **Note:** `src/cron-reminders.ts` duplicates the journal-reminder logic but is **not mounted** — it is a standalone CLI fallback, runnable as `tsx src/cron-reminders.ts`. Only `routes/cron.ts` serves the live endpoint.

## 20. AI features

Provider: **Google Gemini 2.5 Flash Lite**. The key comes from `GEMINI_API_KEY`; an empty string is treated as unset, and every AI path no-ops without it.

Files uploaded to Gemini are retained by Google for roughly 48 hours. The MIME type is a parameter rather than baked in, because *"Season 1 sends one PDF; Season 2 has no PDF and sends the payment proofs and meet-proof photos as images."*

### BRD audit

| Season | Module | Input |
|---|---|---|
| 1 | `analyse-brd.ts` | The uploaded BRD PDF |
| 2 | `analyse-pipeline-brd.ts` | The **composed** BRD, plus up to **8 images** ordered payment proofs → meet proofs → interaction attachments |

**Uniqueness is parsed from the same response** as the main audit — deliberately one API call, not two. If parsing fails it falls back to `ruleBasedUniqueness()`.

Uniqueness compares against **all approved BRDs**, prefiltered by amount and date. There is no PDF re-upload and no separate LLM pass.

> ⚠️ **Known asymmetry:** the Season 1 duplicate corpus filters on `isNotNull(brdUrl)`, so it cannot see Season 2 entries. Season 2 sees both.

Results land in `brd_analysis_history`, surfaced at Admin → Review Queue → *View all analysis* and the Detailed Analysis page.

### Journal analysis

Summarises each journal, assigns a **blocker priority** (which staff can override manually), and flags **reel-worthy** entries with a generated script and reason — feeding Admin → Reels Scripts.

### Chatbot

A student Q&A widget with **two swappable providers**: **Cerebras** and **Cloudflare Workers AI**. Both return `null` on any transport failure. The active provider is cached for 30 seconds, and switching it in Config invalidates the cache immediately.

The knowledge base is **bundled at build time** via esbuild's text loader, *"so the runtime cwd does not matter and the file cannot silently go missing in `dist/`."*

The response parser is unusually defensive, and the comment explains why: the 8B model *"reliably gets the JSON structure right but frequently garbles the key name — emitting `.answer`, `>$answer`, `];answer`, or even an unrelated key."* So it accepts **any key containing "answer"**, falling back to the first string-valued property that is not the suggestions list.

Chat turns are persisted fire-and-forget for Admin → Chatbot History, never blocking the reply.

### Google Drive BRD migration

Admin-only, **manual**, triggered from Config → Integrations — deliberately never wired into cron or bootstrap.

Idempotent by construction: an entry counts as migrated iff `brd_drive_file_id` is set, and a run picks rows that have a BRD URL and no file id — never-migrated **or** previously-failed. So *"re-clicking retries failures and leaves successes untouched."* Capped at **200 per click** *"so one request can't run unbounded for hours."*

### Object storage

Uploads are two-step: the client sends **metadata only** and receives a presigned URL, then uploads directly to it. The original filename, size and content type are persisted alongside the generated path *"so downstream viewers/downloads can use the real name instead of the random UUID"* — and this is what `attachmentTypes` reads in the BRD composer.

Public objects are served from a dedicated path with **no authentication or ACL checks**; everything else resolves the owning team from the columns where document URLs are stored.

---

## 21. The admin surface

31 registered pages (the registry that governs permissions), plus a few sub-routes.

| Page | What it does |
|---|---|
| Dashboard | Programme-wide overview |
| **Review Queue** | Verify / reject revenue — the core staff loop |
| Team Requests | Approve gated membership changes |
| Teams | All teams; drill into one |
| **Leads** | Season 2 pipeline oversight — every lead, every team |
| Projects | All projects |
| Roster | The student whitelist |
| Leaderboard / Campus Leaderboard | Standings |
| Heatmap | Team activity grid; coverage and funnel tabs; nudge sending |
| Journals | Weekly journals, per team |
| Demo Day / Demo Day Submissions | Applications and shortlist |
| Finale Submissions | Finale review |
| People's Choice Votes | PCA tally |
| Campuses | The 19 campuses |
| Users | Accounts and per-user permissions |
| New User Requests | The access gate |
| Announcements / Popups | Messaging |
| Submission Requests | Exemptions and access |
| Notifications | Overdue-digest subscribers |
| Feedback | Student feedback |
| Audit Log | Who did what, plus a Pages Log |
| Campus Insights | Per-campus analysis |
| Chatbot History | Logged conversations |
| Journal Reports | Campus-wise reports and saved links |
| Reels Scripts | AI-flagged reel-worthy journals |
| Resources | Curated reading list |
| Config | Everything in §22 |
| **Ticket Support** | The staff ticket queue |

Journal Reports, Reels Scripts and Campus Leaderboard were reachable long before they were registered here — *"so a super admin had no way to restrict them"* — and were added to close that gap.

---

## 22. The Config page

Season-scoped. Each section has an internal `id` and a public `slug`, kept deliberately separate because *"a slug is a public address and must stay stable even if the internal id is refactored."*

The **URL is the source of truth** for the open section; an unknown slug falls back to the default rather than an empty pane, and the address bar is rewritten with `replace` so that *"Back should leave Config, not step through corrections to it."*

| Slug | Label | Controls |
|---|---|---|
| `seasons` | Seasons | Season records and lifecycle |
| `season-overrides` | Season Overrides | Per-user season pins |
| `programme-schedule` | Programme Schedule | Programme calendar |
| `programme-weeks` | Programme Weeks | Week numbers and dates — the unit reminders and streaks key off |
| `grit-miles` | GRIT Miles | The ladder, journal edit deadline, escalation toggle, menu flags |
| `user-stats` | User Stats | Stat tiles shown to users |
| `leads-control` | **Leads Control** | **Season 2 only.** The CRUD matrix, master lock — **and the Ticket Support card** |
| `notifications` | Notifications & Reminders | **The 15 email kill switches**, reminder toggles, and the SES **test-email** form |
| `student-content` | Student Content | Student-facing content |
| `teams-submissions` | Teams Submissions | Per-team submission access; team member limit |
| `finale-submissions` | Finale Submissions | The Finale window |
| `peoples-choice-award` | People's Choice Award | PCA voting window |
| `review-queue` | Review Queue | Queue config, including the rejection-reason catalogue |
| `teams-coordinators` | Teams & Coordinators | Team and coordinator settings |
| `whatsapp` | WhatsApp | Broadcast templates and audiences *(super admin)* |
| `integrations` | Integrations | Chatbot provider selector; Google Drive BRD migration |
| `developer-tools` | Developer Tools | **Conditional** — demo-data reseed |

---

## 23. Permissions model

### Super admin
`role = admin` **and** `is_super_admin = true`. Never restricted; sees Seasons, Season Overrides, WhatsApp and the email kill switches.

### Per-page permissions
Six actions: `view`, `edit`, `delete`, `approve`, `reject`, `export`, plus a `hidden` flag.

**Default-ALLOW** is the governing principle. An admin whose `adminPermissions` is `null` — which is every existing admin — has full access to every page. A missing field reads as allowed. This is what makes new pages and new actions safe to add: nobody loses access on deploy.

**Action implication:** every action implies `view`. `approve` and `reject` additionally require `edit`, so `edit + reject:false` means *"may approve, may not reject."*

### Enforcement
`requireAdminPage(pageKey, action)` middleware is the real boundary. It:
- Only ever **adds** restrictions for `role = admin` — it never grants
- Passes non-admins straight through to the route's own checks
- Re-reads the authoritative user row (session doesn't carry `adminPermissions`)
- **Fails open on transient errors**, so a DB blip cannot lock out a legitimate admin

---

## 24. Data model

**60 tables**, one file: `lib/db/src/schema/brave.ts`.

### Principal tables

| Domain | Tables |
|---|---|
| Identity | `users`, `roster`, `campuses`, `auth_tokens`, `access_requests` |
| Teams | `teams`, `team_members`, `team_invitations`, `team_join_requests`, `team_leave_requests`, `membership_requests` |
| Pipeline (2.0) | `leads`, `lead_interactions`, `project_phases`, `payment_schedule`, `payments`, `client_registry` |
| Delivery | `projects`, `order_book_entries`, `revenue_entries`, `milestones` |
| Journals | `weekly_journals`, `programme_weeks`, `journal_report_links`, `journal_escalation_log` |
| Events | `demo_day_applications`, `demo_day_submissions`, `finale_submissions`, `pca_votes` |
| Messaging | `notifications`, `announcements`, `announcement_dismissals`, `popup_templates`, `popup_acknowledgements`, `reminder_log` |
| Support | `support_tickets` |
| AI | `brd_analysis_history`, `reel_scripts`, `chatbot_history` |
| Governance | `audit_log`, `page_views`, `seasons`, `programme_config`, `rejection_reasons` |
| Evaluation | `trust_score_events`, `review_assignments`, `review_appeals`, `review_audit_samples` *(see §27)* |
| Integrations | `whatsapp_templates`, `whatsapp_sends`, `uploaded_files` |

### Schema rollout — read this before changing the schema

**Production never runs `drizzle-kit push`.** The `lib/db/migrations/` SQL files are legacy and not drizzle-driven.

A schema change production needs requires **three edits**:

1. The Drizzle schema in `lib/db/src/schema/brave.ts`
2. An **idempotent bootstrap** in `artifacts/api-server/src/index.ts` — `CREATE TABLE IF NOT EXISTS`, `ADD COLUMN IF NOT EXISTS`, or for enums a `DO $$ ... EXCEPTION WHEN duplicate_object THEN NULL; END $$` guard
3. The consuming code

Miss step 2 and the feature works locally and 500s in production.

**Postgres enums can be extended but not narrowed.** `ALTER TYPE ... ADD VALUE IF NOT EXISTS` adds; removing a value needs a table rewrite. This is why superseded ticket categories are retained.

### Other schema conventions

- **Legacy seasonless rows:** a `NULL` season means **Season 1 only** — never a cross-season wildcard, and never rewrite historical rows.
- **Timestamp comparisons:** never `eq()` a `timestamptz` against a JS `Date` snapshot (microseconds vs milliseconds). Use a ±1 ms epoch compare, or the guard discards every result.
- **Dead column:** `leads.trail_strength` still exists in the bootstrap DDL but is never read or written — trail strength was removed as a feature.

---

## 25. Mobile app

A **Capacitor** shell keeping the dashboard in its main WebView. Forms SSO runs in-app and returns via an Android deep link.

- **The APK is a thin shell** — a web fix reaches users through a Replit deploy, not a new APK.
- Student pages get compact mobile density; the app bar is the sole screen title. Desktop layout is unchanged.
- Product tours are **separate per-user states** for mobile and desktop. *Finish* and *Close* both permanently suppress that platform's tour.
- `/get-app` and the programme QR are **public**; all other stored documents stay authenticated.
- Android back navigates back rather than closing the app.
- Metrics report **"Ever opened the app"** — never installs. Historic page views without a platform remain *unknown*.

---

## 26. Operations and deployment

**Hosting:** Replit. Changes reach students only via **Publish**.

**Build:**
```bash
pnpm build     # typecheck (libs → artifacts) then per-package build
```

> **Windows:** the dashboard build needs `PORT` and `BASE_PATH` set, and must run under **PowerShell** — Git Bash mangles `BASE_PATH`.

**Line endings:** the repo is **CRLF**. Scripted edits must read with `newline=""`, normalise to `\n`, patch, then convert back.

**Audit logging:** `logAudit(actorId, action, targetType, targetId?, details?)` — positional, with a numeric `targetId`.

**Rate limiting:** separate limiters for `/api/auth`, `/api/dev`, `/api/admin` and general `/api`.

---

## 27. Built but not live

Honest accounting of what exists in the codebase but does **not** run in production:

### Trust ledger — schema and logic exist, not mounted

`trust_score_events` is a full append-only ledger, idempotent on `(season, team, kind, ref)`, with earn/lose event kinds (`revenue_verified`, `client_confirmed`, `journal_streak`, `geo_verified`, `phase_delivered_on_time`, `client_disputed`, `duplicate_client`, `amount_overstated`, `evidence_missing`, `link_dead`, `backdated_trail`, `manual_adjustment`) and tiers `watch` / `bronze` / `silver` / `gold`.

**`trustRouter` is not mounted in `routes/index.ts`.** `/api/trust/*` returns 404, even though `lib/trust-api.ts` on the client has helpers for it. `cron-trust-awards.ts` is likewise unmounted.

**The Bronze/Silver/Gold trust tiers were deliberately removed from the student experience** and must not be reinstated — the student-facing Leads score is completion progress only.

### Phase 7 evaluation — mounted, no UI

`reviewRouter` **is** mounted, and `review_assignments`, `review_appeals` and `review_audit_samples` exist with a five-state decision model (`pending`, `hold`, `changes_requested`, `approved`, `rejected`) and appeals (`open`, `upheld`, `declined`, `withdrawn`). No frontend page calls it.

### Support tickets — shipped dark

Fully built and deployed, but `ticketsMenuEnabled` defaults to `false`. Students see nothing until an admin turns it on. The table is created by the idempotent bootstrap on server start.

---

## 27b. Cross-cutting design principles

These recur throughout the codebase and explain many otherwise-surprising decisions.

### Fail-open, consistently

The season guard, gate mode, GRIT levels, client registry, content-type lookup, email controls and admin permission middleware **all fail open**. A config read failure must never turn into "the student is blocked" or "the admin is locked out". The one deliberate exception is Gate C, which always blocks, because the UI and server must not disagree about whether something is submittable.

### Isolation contracts

Several features carry an explicit promise in their header comment: the feature can be deleted by removing a single `router.use(...)` line plus its import. This holds for the lead pipeline, pipeline gates, WhatsApp, tickets, season overrides and the student archive.

### Derive, never trust the client

`isRelatedParty` is computed from the source. `clientConfirmed` is written only by the satisfaction call. The submitted amount is summed from recorded payments, never taken from the contract value. Season and author on a ticket come from the session.

### Store what was assessed

A submitted BRD is a frozen snapshot. Trust-ledger points are stored as awarded rather than re-derived. A client-confirmed payment cannot be edited. A phase with payments cannot be deleted. The claimed amount is never rewritten by price recognition.

### Make backdating visible rather than impossible

`interactionDate` and `loggedAt` are stored separately, and the BRD surfaces `loggedAfterHours` — the gap between the two — because *"a large gap is the backdating signal a reviewer looks for."* The system does not forbid late logging; it shows it.

### One definition, one place

Gates live in `lib/`, not in handlers, because *"a gate implemented twice is a gate that eventually disagrees with itself."* The same reasoning drives the shared BRD renderer used by both the student preview and the admin queue, and the single ticket-category tree shared by the picker, the filter and the labels.

Where duplication is unavoidable for performance — Gate C's five items appear in three places, one of them raw SQL — the code carries an explicit warning to keep them in step.

### Season 1 is preserved, not maintained

Separate pages per season, and every pipeline handler refuses rows without a `leadId`. Changing 2.0 must not be able to alter how a finished season reads.

---

## 28. Glossary

| Term | Meaning |
|---|---|
| **BRD** | Business Requirement Document — in 2.0, composed from the record, not uploaded |
| **Gate A / B / C** | Progression checkpoints; Gate C is the five-item BRD submission checklist |
| **Verified revenue** | Money confirmed by a reviewer. The only number that counts |
| **Order book** | Agreed but not yet received |
| **Lead** | A prospective client business |
| **Trail** | The dated sequence of interactions with a lead |
| **Dormant** | System-set after 30 days of silence |
| **GRIT Miles** | Points earned by crossing verified-revenue levels |
| **Season override** | A per-user pin to a specific season |
| **Master lock** | The season switch blocking every student pipeline mutation |
| **Composed BRD** | The document assembled by `brd-composer.ts` |
| **Super admin** | `admin` + `is_super_admin`; never restricted |
| **Advisory / Enforced** | Whether pipeline gates warn or block |

---

## Appendix: file map

| Concern | File |
|---|---|
| Schema (all 60 tables) | `lib/db/src/schema/brave.ts` |
| Season resolution | `artifacts/api-server/src/lib/season.ts` |
| Router composition | `artifacts/api-server/src/routes/index.ts` |
| Schema bootstrap | `artifacts/api-server/src/index.ts` |
| BRD composition + Gate C | `artifacts/api-server/src/lib/brd-composer.ts` |
| Lead pipeline | `artifacts/api-server/src/routes/leads.ts`, `pipeline.ts` |
| Leads permissions | `artifacts/api-server/src/lib/leads-control.ts` |
| Admin permissions | `artifacts/api-server/src/lib/admin-permissions.ts`, `require-admin-page.ts` |
| Email + kill switches | `artifacts/api-server/src/lib/email/brevo.ts`, `email-controls.ts` |
| Cron locking | `artifacts/api-server/src/lib/cron-lock.ts` |
| AI | `artifacts/api-server/src/lib/ai/` |
| Tickets | `artifacts/api-server/src/routes/tickets.ts`, `lib/tickets-control.ts`, `lib/sanitize-html.ts` |
| Ticket categories | `artifacts/brave-dashboard/src/lib/ticket-categories.ts` |
| Shared BRD renderer | `artifacts/brave-dashboard/src/components/brd-document.tsx` |
| Engineering memory | `.agents/memory/` — **read this first** |

---

*Compiled by reading the source. Where a feature exists in code but is not reachable by users, it is listed in §27 rather than described as working.*
