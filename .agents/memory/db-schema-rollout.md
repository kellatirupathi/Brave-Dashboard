---
name: DB schema rollout (push, not migrate)
description: How schema changes reach dev/prod databases in this monorepo.
---

# DB schema rollout

Schema changes are applied with `pnpm --filter @workspace/db run push`
(`drizzle-kit push`). There is **no** `generate` or `migrate` script in
`lib/db/package.json` and **no** migrator call in the api-server.

The `lib/db/migrations/*.sql` files (and `migrations/meta`) are **legacy** —
they are not driven by drizzle-kit and are not applied at runtime. Do NOT add a
new SQL migration file expecting it to run; it won't.

**Why:** When adding a new table/enum, a code reviewer may flag "no migration
file exists." That is a false alarm for this repo — the correct action is to run
`push`, not to author a migration.

**How to apply:** After editing `lib/db/src/schema/*`, run the `push` command.
For production, the schema is reconciled via push as well (see replit.md note:
push is the documented command). If prod ever shows "column/relation does not
exist", run push against prod rather than hunting for a migration file.

## Deploy build can fail on schema the dev server never validated

The api-server dev workflow runs via **esbuild (no typecheck)**, so server/
frontend code can import `@workspace/db` tables/columns that were never added to
the schema and still run in dev. The deployer runs the full `pnpm run build`
(which typechecks every package), so these surface only as a publish failure.

**Why:** A feature's route + UI can be merged while its `lib/db` schema edit is
lost/never made. Symptom at deploy: `TS2305 Module '@workspace/db' has no
exported member 'XTable'` / `TSxxxx Property 'y' does not exist on ...`.

**How to apply:** When a publish/build fails, run `pnpm run build` (or
`pnpm run typecheck`) locally to reproduce. For missing `@workspace/db` members,
derive the exact shape from the consuming routes, add the table/column to
`brave.ts`, `pnpm run typecheck:libs`, then `push` to dev. **The prod DB still
needs the same push after deploy** — the build only typechecks + bundles; it
never touches the prod database, so new-table features 500 in prod until pushed.
Also expect unrelated pre-existing TS errors in the same build (handlers
returning a value on some paths only → TS7030; `req.user` not narrowed under
middleware-only guards → TS18048, use the established `req.user!` pattern; dead
props that never typechecked).
