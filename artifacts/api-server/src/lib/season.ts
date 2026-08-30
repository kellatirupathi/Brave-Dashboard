/**
 * Season resolution (additive, isolated — Season 1 / Season 2 coexistence).
 *
 * A season is a single run of the BRAVE programme. Season 1 (id 1) is the
 * completed read-only archive; Season 2 (id 2) is the live season.
 *
 * IDENTITY DATA IS SHARED, NOT SCOPED. users, roster, campuses, teams,
 * team_members and invite codes serve both seasons — the same teams carry
 * forward and nobody re-registers. Only *activity* (journals, projects,
 * order book, revenue, milestones, Demo Day, Finale, PCA, leads) carries a
 * season_id.
 *
 * DESIGN NOTES
 * - Never thread a season parameter through every function. Call
 *   `resolveSeason(req)` at the top of a handler and pass the number down.
 * - Every scoped column is `NOT NULL DEFAULT 1`, so an insert path that has
 *   not been updated yet still writes a valid Season 1 row instead of
 *   throwing. The default is the safety net, not the intended behaviour.
 * - Every read here FAILS SAFE. If the seasons table cannot be read we reuse
 *   the last known good value, and only fall back to Season 1 when we have
 *   never had one. Callers never see an exception from this module.
 */
import { and, eq } from "drizzle-orm";
import type { Request } from "express";
import {
  db,
  programmeConfigTable,
  seasonsTable,
  SEASON_1_ID,
  SEASON_2_ID,
  type ProgrammeConfig,
  type Season,
} from "@workspace/db";
import { logger } from "./logger";

export { SEASON_1_ID, SEASON_2_ID };

/** Header the dashboard sends on every request to say which season it is viewing. */
export const SEASON_HEADER = "x-brave-season";
/** Query-param fallback, for links that need to be shareable. */
export const SEASON_QUERY_PARAM = "season";

const CACHE_TTL_MS = 30_000;

let cache: { at: number; seasons: Season[] } | null = null;
// Survives cache expiry AND read failures, so a transient DB blip cannot flip
// every request over to the archive.
let lastKnownActiveId: number | null = null;

/** Drop the cache. Call after any write that changes a season row. */
export function invalidateSeasonCache(): void {
  cache = null;
}

/**
 * All seasons, newest id last. Returns an empty array (never throws) if the
 * table cannot be read — callers treat that as "fall back".
 */
export async function listSeasons(): Promise<Season[]> {
  const now = Date.now();
  if (cache && now - cache.at < CACHE_TTL_MS) return cache.seasons;
  try {
    const rows = await db.select().from(seasonsTable).orderBy(seasonsTable.id);
    cache = { at: now, seasons: rows };
    const active = rows.find((r) => r.isActive);
    if (active) lastKnownActiveId = active.id;
    return rows;
  } catch (err) {
    logger.error({ err }, "[season] failed to read seasons table");
    return cache?.seasons ?? [];
  }
}

/** The single season flagged is_active, or null if unreadable / unseeded. */
export async function getActiveSeason(): Promise<Season | null> {
  const rows = await listSeasons();
  return rows.find((r) => r.isActive) ?? null;
}

/**
 * Id of the active season. Order of preference:
 *   1. the row flagged is_active
 *   2. the last value we successfully read this process
 *   3. Season 1 — matches the column DEFAULT, so nothing is ever orphaned
 */
export async function getActiveSeasonId(): Promise<number> {
  const active = await getActiveSeason();
  if (active) return active.id;
  if (lastKnownActiveId != null) return lastKnownActiveId;
  return SEASON_1_ID;
}

export async function getSeasonById(id: number): Promise<Season | null> {
  const rows = await listSeasons();
  return rows.find((r) => r.id === id) ?? null;
}

function parseSeasonId(raw: unknown): number | null {
  if (typeof raw !== "string" || raw.trim() === "") return null;
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : null;
}

/**
 * Which season is this request about? In precedence order:
 *
 *   1. the `x-brave-season` header      — what the dashboard is showing now
 *   2. a `?season=` query param         — so links stay shareable
 *   3. the session's remembered choice  — survives a refresh
 *   4. the active season                — the default for everyone else
 *
 * An id that does not exist is ignored rather than rejected, so a stale client
 * can never 400 its way out of the dashboard.
 */
export async function resolveSeason(req: Request): Promise<number> {
  const requested =
    parseSeasonId(req.headers[SEASON_HEADER]) ??
    parseSeasonId(req.query?.[SEASON_QUERY_PARAM]) ??
    (typeof req.viewingSeasonId === "number" ? req.viewingSeasonId : null);

  if (requested != null) {
    const rows = await listSeasons();
    // When the table is unreadable we cannot validate — honour the request
    // rather than silently redirecting the user to a different season.
    if (rows.length === 0 || rows.some((r) => r.id === requested)) {
      return requested;
    }
    logger.warn({ requested }, "[season] unknown season requested; using active");
  }
  return getActiveSeasonId();
}

/**
 * True when this season is a closed archive AND the relevant per-capability
 * override is off. Used by the write guard.
 *
 * FAILS OPEN: an unreadable season row must never block a student from
 * working, so an unknown season is treated as writable.
 */
export type ArchiveCapability = "journal" | "revenue" | "project";

export async function isSeasonWritable(
  seasonId: number,
  capability?: ArchiveCapability,
): Promise<boolean> {
  const season = await getSeasonById(seasonId);
  if (!season) return true; // fail open
  if (!season.isReadOnly) return true;
  switch (capability) {
    case "journal":
      return season.allowJournalWrites;
    case "revenue":
      return season.allowRevenueWrites;
    case "project":
      return season.allowProjectWrites;
    default:
      return false;
  }
}

// ── programme_config, per season ───────────────────────────────────────────
//
// programme_config used to be a singleton read as `.limit(1)`. It now holds
// one row per season, keyed by the UNIQUE(season_id) constraint. This helper
// replaces every one of those reads; it creates the row on first access so a
// freshly seeded season behaves exactly like the old get-or-create did.

export async function getConfig(seasonId: number): Promise<ProgrammeConfig> {
  try {
    const existing = await db
      .select()
      .from(programmeConfigTable)
      .where(eq(programmeConfigTable.seasonId, seasonId))
      .limit(1);
    if (existing.length > 0 && existing[0]) return existing[0];

    const [created] = await db
      .insert(programmeConfigTable)
      .values({ seasonId })
      .onConflictDoNothing({ target: programmeConfigTable.seasonId })
      .returning();
    if (created) return created;

    // Lost the insert race — read the winner.
    const [row] = await db
      .select()
      .from(programmeConfigTable)
      .where(eq(programmeConfigTable.seasonId, seasonId))
      .limit(1);
    if (row) return row;
  } catch (err) {
    // Transition window: bootstrap runs AFTER app.listen(), so on the very
    // first boot with seasons a request can land before season_id exists on
    // programme_config. Rather than 500, fall back to the pre-seasons read —
    // the single row that is already there IS Season 1's. Also covers a
    // missing unique index, which would make ON CONFLICT throw.
    logger.warn(
      { err, seasonId },
      "[season] scoped programme_config read failed; falling back to unscoped",
    );
  }

  const [legacy] = await db.select().from(programmeConfigTable).limit(1);
  if (legacy) return legacy;

  throw new Error(`programme_config unavailable for season ${seasonId}`);
}

/** Convenience: config for whichever season this request is about. */
export async function getConfigForRequest(
  req: Request,
): Promise<ProgrammeConfig> {
  return getConfig(await resolveSeason(req));
}

/**
 * Config for the currently active season. For background work — crons, AI
 * schedulers, boot-time sweeps — that has no request to resolve a season from.
 *
 * Do NOT use this in a request handler: an admin viewing Season 1 must edit
 * Season 1's settings, not the live season's. Use `getConfigForRequest` there.
 */
export async function getActiveConfig(): Promise<ProgrammeConfig> {
  return getConfig(await getActiveSeasonId());
}

/**
 * Narrow a Drizzle where-clause to one season. Kept as a helper so the intent
 * reads the same at every call site.
 *
 *   .where(scopedTo(revenueEntriesTable.seasonId, season, eq(...)))
 */
export function scopedTo(
  column: Parameters<typeof eq>[0],
  seasonId: number,
  ...rest: Parameters<typeof and>
) {
  return and(eq(column, seasonId), ...rest);
}
