import { db, coordinatorTagsTable } from "@workspace/db";
import { sql } from "drizzle-orm";
import { logger } from "./lib/logger";

// The default coordinator tags that ship with the platform. Seeded ONLY when
// the catalog is completely empty, so an admin who later edits/deletes them
// won't have their changes resurrected on the next deploy.
export const DEFAULT_COORDINATOR_TAGS = [
  "Success Coach",
  "COS",
  "COS/PM/PMA/BOA",
] as const;

// Idempotent: inserts the default tags only if the table has no rows. The
// per-name ON CONFLICT DO NOTHING is a belt-and-braces guard against a race
// where two boots run at once. Safe to call on every startup.
export async function bootstrapCoordinatorTags(): Promise<void> {
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(coordinatorTagsTable);
  if (count > 0) return;

  await db
    .insert(coordinatorTagsTable)
    .values(DEFAULT_COORDINATOR_TAGS.map((name) => ({ name })))
    .onConflictDoNothing({ target: coordinatorTagsTable.name });

  logger.info(
    { tags: DEFAULT_COORDINATOR_TAGS },
    "Seeded default coordinator tags",
  );
}
