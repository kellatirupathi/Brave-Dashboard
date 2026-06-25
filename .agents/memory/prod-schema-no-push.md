---
name: Prod applies no schema via push
description: How DB schema/index changes reach the production database, since deploy never runs drizzle-kit push
---

# Production never runs `drizzle-kit push`

`drizzle-kit push` only runs in DEV (via `scripts/post-merge.sh` after a task
merge). The production deploy's postBuild only does `pnpm store prune`. So a new
index / column / constraint added to `lib/db/src/schema` will exist in dev but
**will not be applied to the prod database automatically**.

**Why:** prod has no migration-file pipeline and the deploy does not call push.

**How to apply:** when prod needs a schema artifact (e.g. a new UNIQUE INDEX
that an `onConflictDoNothing({target})` depends on), add an idempotent bootstrap
step in `artifacts/api-server/src/index.ts` `runBootstrap()` that runs the
`CREATE ... IF NOT EXISTS` (and any needed data cleanup) on startup, wrapped in
try/catch. Keep the same artifact in the Drizzle schema too — otherwise the next
dev `push` will drop the bootstrap-created object. Bootstrap runs AFTER
`app.listen()`, so don't rely on it being done before the first request.
