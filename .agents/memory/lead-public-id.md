---
name: Lead public id
description: Why leads carry a UUID public_id alongside the serial primary key, and how lead URLs must be built.
---

Leads are addressed in URLs by `leads.public_id` (uuid), never by the serial
`leads.id`. The serial column remains the primary key — `projects.lead_id` and
`lead_interactions.lead_id` reference it, and production has no migration
pipeline that could rewrite those — so the UUID is an additive second
identifier, not a replacement.

**Why:** `/leads/6` is enumerable. A student could walk the id range and probe
other teams' leads; the 403 that answers still confirms which ids exist.

**How to apply:**
- Build student-facing lead links with `leadRef(lead)` from `lib/leads-api.ts`,
  which returns `publicId ?? String(id)`. Never interpolate `lead.id` into a URL.
- Resolve the `:id` route segment with `resolveLeadRef()` from
  `lib/lead-pipeline.ts`. It accepts the UUID *and* the legacy serial id, so
  existing bookmarks and already-sent WhatsApp nudge links keep working. It
  returns null for both malformed and unknown references — answer 404 for both,
  never a 400 that distinguishes them.
- Anything that writes a foreign key (`createPipelineProject`, matching
  `projects.leadId`) needs the numeric `lead.id`, not the ref. Read it off the
  fetched lead rather than the URL.
- The column is nullable by design so the bootstrap could backfill without a
  NOT NULL table rewrite. Treat a null as "fall back to the numeric id".
- Prod gets the column from the idempotent bootstrap in api-server `index.ts`
  (add column → backfill nulls → unique index), because prod never runs
  `drizzle-kit push` — see [[prod-schema-no-push]].

The admin console (`routes/admin-leads.ts`) still addresses leads numerically.
That is deliberate: it is staff-only and not reachable by enumeration from a
student session.
