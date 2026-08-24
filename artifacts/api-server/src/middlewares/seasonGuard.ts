/**
 * Season write guard (additive, isolated — Season 1 / Season 2 coexistence).
 *
 * Season 1 is a read-only archive. Rather than editing a hundred handlers, one
 * guard refuses student writes whose resolved season is closed.
 *
 * SCOPE AND POSTURE
 * - Only non-GET/HEAD/OPTIONS requests are considered. Reading the archive is
 *   always allowed; that is the entire point of keeping it.
 * - Admins and coordinators pass through. They need to be able to correct
 *   historical records, and the whole archive is visible to them anyway.
 * - A super admin can re-open one capability at a time via the allow* flags on
 *   the season row (Config -> Season 1 archive). Default is fully closed.
 * - FAILS OPEN. If the seasons table cannot be read we allow the write. A
 *   transient DB problem must never look like "the programme is closed".
 * - Returns 409 Conflict, not 403: the caller is authorised, the target is
 *   simply not accepting writes.
 *
 * NOT mounted globally. It is applied per-route in the student write paths so
 * that admin tooling, cron endpoints and auth are provably unaffected.
 */
import type { NextFunction, Request, Response } from "express";
import {
  isSeasonWritable,
  resolveSeason,
  type ArchiveCapability,
} from "../lib/season";
import { logger } from "../lib/logger";

const READ_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/** Roles allowed to write to a closed season. */
function bypassesArchive(req: Request): boolean {
  const role = req.user?.role;
  return role === "admin" || role === "coordinator";
}

const MESSAGE =
  "Season 1 is a read-only archive. You can view everything you did, but it can no longer be edited.";

/**
 * Shared decision. Returns true when the request may proceed. On false it has
 * already written the 409 response.
 *
 * Use this inside a handler that already does its own role checks:
 *
 *   if (!(await allowSeasonWrite(req, res, "journal"))) return;
 */
export async function allowSeasonWrite(
  req: Request,
  res: Response,
  capability?: ArchiveCapability,
): Promise<boolean> {
  if (READ_METHODS.has(req.method)) return true;
  if (bypassesArchive(req)) return true;

  try {
    const seasonId = await resolveSeason(req);
    if (await isSeasonWritable(seasonId, capability)) return true;

    logger.info(
      { seasonId, capability, path: req.path, userId: req.user?.id },
      "[season-guard] blocked write to archived season",
    );
    res.status(409).json({
      error: MESSAGE,
      code: "SEASON_READ_ONLY",
      seasonId,
      capability: capability ?? null,
    });
    return false;
  } catch (err) {
    // Fail open — never let an infrastructure error masquerade as a rule.
    logger.error({ err, path: req.path }, "[season-guard] check failed; allowing");
    return true;
  }
}

/**
 * Middleware form. Mount on a student write route:
 *
 *   router.post("/journals", requireWritableSeason("journal"), handler)
 */
export function requireWritableSeason(capability?: ArchiveCapability) {
  return async function seasonGuard(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    if (await allowSeasonWrite(req, res, capability)) next();
  };
}

/**
 * Refuse anything that belongs to the Season 2 lead pipeline when the request
 * is about an earlier season.
 *
 * WHY THIS EXISTS SEPARATELY FROM requireWritableSeason
 * That guard asks "is this season accepting writes?" — and Season 1 is, because
 * it is still the live season. This one asks a different question: "does this
 * FEATURE exist in this season at all?" The pipeline was introduced in Season
 * 2; Season 1 ran on free-form projects and has no leads, no gates and no
 * composed BRD. Without this, a Season 1 student who typed /leads could create
 * leads, interactions, projects and payments stamped season_id = 1 — rows in a
 * season whose UI can never show them.
 *
 * Hiding the sidebar entry is not a control. This is.
 *
 * FAILS OPEN, deliberately: if the season cannot be resolved we allow the
 * request rather than break the live pipeline over an infrastructure blip. The
 * data itself is still season-scoped either way.
 *
 * Applies to reads as well as writes — a Season 1 student has no business
 * listing Season 2 leads, and an empty list would imply the feature exists.
 */
export const SEASON_2_MIN = 2;

export function requireLeadPipelineSeason() {
  return async function leadPipelineGuard(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const seasonId = await resolveSeason(req);
      if (seasonId >= SEASON_2_MIN) {
        next();
        return;
      }
      logger.info(
        { seasonId, path: req.path, userId: req.user?.id },
        "[season-guard] blocked lead-pipeline access from an earlier season",
      );
      res.status(409).json({
        error:
          "The lead pipeline is part of Season 2. Switch to Season 2 to use it.",
        code: "SEASON_NOT_SUPPORTED",
        seasonId,
        requiredSeason: SEASON_2_MIN,
      });
    } catch (err) {
      logger.error(
        { err, path: req.path },
        "[season-guard] pipeline season check failed; allowing",
      );
      next();
    }
  };
}
