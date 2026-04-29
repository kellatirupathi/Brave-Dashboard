import { eq, sql } from "drizzle-orm";
import { db, orderBookEntriesTable } from "@workspace/db";

/**
 * Distinct client count for a project, computed across ALL order book entries
 * (any status — submitted, verified, etc.). This intentionally does NOT
 * filter by status: a "client" should count once the team logs them in the
 * order book, regardless of admin verification status.
 */
export async function getProjectClientCount(projectId: number): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(distinct ${orderBookEntriesTable.clientName})::int` })
    .from(orderBookEntriesTable)
    .where(eq(orderBookEntriesTable.projectId, projectId));
  return Number(row?.count ?? 0);
}
