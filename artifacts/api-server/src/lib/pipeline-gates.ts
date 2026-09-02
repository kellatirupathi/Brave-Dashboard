/**
 * Season 2 pipeline gate mode (additive, isolated).
 *
 * Gates A, B and C are ALWAYS evaluated and reported. This module answers one
 * question for the handlers that used to refuse on them: do they block right
 * now, or are they advisory?
 *
 * Stored per season on programme_config.pipeline_gates_enforced. Default and
 * fallback is ADVISORY (false): a config read failure must never turn into
 * "the student is blocked", the same fail-open posture as the season guard.
 */
import { eq } from "drizzle-orm";
import { db, programmeConfigTable } from "@workspace/db";
import { logger } from "./logger";

const CACHE_TTL_MS = 30_000;
const cache = new Map<number, { at: number; enforced: boolean }>();

/** Drop the cache for a season (or all). Call after any write to the flag. */
export function invalidatePipelineGatesCache(seasonId?: number): void {
  if (seasonId == null) cache.clear();
  else cache.delete(seasonId);
}

/** Whether the gates block in `seasonId`. Never throws; advisory on error. */
export async function areGatesEnforced(seasonId: number): Promise<boolean> {
  const hit = cache.get(seasonId);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.enforced;
  try {
    const [row] = await db
      .select({ enforced: programmeConfigTable.pipelineGatesEnforced })
      .from(programmeConfigTable)
      .where(eq(programmeConfigTable.seasonId, seasonId))
      .limit(1);
    const enforced = row?.enforced ?? false;
    cache.set(seasonId, { at: Date.now(), enforced });
    return enforced;
  } catch (err) {
    logger.error({ err, seasonId }, "[pipeline-gates] read failed; advisory");
    return false;
  }
}
