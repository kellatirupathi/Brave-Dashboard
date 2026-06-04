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
