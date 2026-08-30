import { sql, eq } from "drizzle-orm";
import { db, programmeConfigTable, teamMembersTable } from "@workspace/db";
import { getActiveSeasonId } from "./season";

const DEFAULT_TEAM_MEMBER_LIMIT = 5;

// Allow callers to pass either the top-level db handle or an in-flight
// PgTransaction. Only `select(...).from(...).limit(...)/where(...)` is used so
// we keep the parameter type loose to avoid coupling to specific Drizzle
// generic instantiations (NodePgDatabase vs PgTransaction).
type Querier = Pick<typeof db, "select">;

// Reads the ACTIVE season's limit, which is the correct semantics: teams carry
// forward across seasons unchanged, so whether a student may join right now is
// governed by the season currently running (Season 1 allowed 5, Season 2
// allows 4). Pass `seasonId` explicitly to check a specific season's limit.
export async function getTeamMemberLimit(
  querier: Querier = db,
  seasonId?: number,
): Promise<number> {
  const season = seasonId ?? (await getActiveSeasonId());
  const [cfg] = await querier
    .select({ limit: programmeConfigTable.teamMemberLimit })
    .from(programmeConfigTable)
    .where(eq(programmeConfigTable.seasonId, season))
    .limit(1);
  return cfg?.limit ?? DEFAULT_TEAM_MEMBER_LIMIT;
}

export async function getTeamMemberCount(teamId: number, querier: Querier = db): Promise<number> {
  const [row] = await querier
    .select({ count: sql<number>`count(*)::int` })
    .from(teamMembersTable)
    .where(eq(teamMembersTable.teamId, teamId));
  return Number(row?.count ?? 0);
}

export async function getTeamFullness(
  teamId: number,
  querier: Querier = db,
): Promise<{ count: number; limit: number; isFull: boolean }> {
  const [limit, count] = await Promise.all([
    getTeamMemberLimit(querier),
    getTeamMemberCount(teamId, querier),
  ]);
  return { count, limit, isFull: count >= limit };
}

export function teamFullMessage(count: number, limit: number): string {
  return `Team is full (${count}/${limit} members)`;
}
