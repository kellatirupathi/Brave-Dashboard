/**
 * Time-based trust awards.
 *
 *   POST /internal/cron/trust-awards   Header: X-Cron-Secret
 *
 * Some trust signals are not events anybody triggers — they are facts that
 * become true as time passes. This sweep looks for them:
 *
 *   journal_streak           4 consecutive programme weeks with a journal
 *   trail_strong             a lead reached a strong interaction trail
 *   geo_verified             a lead was captured at the client's premises
 *   phase_delivered_on_time  a phase fully paid by its agreed due date
 *
 * ISOLATION: additive, season-scoped, and every award carries refType/refId so
 * the partial unique index makes re-runs idempotent. Nothing outside
 * trust_score_events is written.
 *
 * NOT INCLUDED: the link_dead re-check. It needs an outbound HTTP request per
 * submitted project, which belongs in its own sweep with its own rate limiting
 * rather than bolted onto a set of pure database queries.
 */
import { Router, type IRouter, type Request, type Response } from "express";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@workspace/db";
import { logger } from "../lib/logger";
import { getActiveSeasonId, isSeasonWritable } from "../lib/season";
import { tryAcquireCronLock } from "../lib/cron-lock";
import { awardTrust, type TrustEventKind } from "../lib/trust-score";

const router: IRouter = Router();

const LOCK = "cron:trust-awards";

/** Consecutive weeks of journals that earn the streak award. */
const STREAK_WEEKS = 4;
/** Trail strength that counts as "strong" — mirrors trailBand() in lead-pipeline. */
const STRONG_TRAIL = 70;

function verifyCronSecret(req: Request, res: Response): boolean {
  const expected = process.env.CRON_SECRET;
  if (!expected) {
    logger.error("[cron-trust-awards] CRON_SECRET not configured");
    res.status(500).json({ error: "CRON_SECRET not configured" });
    return false;
  }
  if (req.header("x-cron-secret") !== expected) {
    res.status(403).json({ error: "Invalid cron secret" });
    return false;
  }
  return true;
}

type Award = {
  teamId: number;
  kind: TrustEventKind;
  refType: string;
  refId: number;
  reason?: string;
};

/**
 * Journal streaks.
 *
 * Counted over PROGRAMME WEEKS rather than raw dates, because "consecutive"
 * only means anything relative to the weeks the programme actually opened — a
 * gap the programme itself never opened is not the team's fault.
 *
 * The ref is the closing week number, so a team on a six-week run earns the
 * award for the window ending at week 4, then week 5, then week 6.
 */
async function journalStreaks(seasonId: number): Promise<Award[]> {
  const rows = await db.execute<{ team_id: number; end_week: number }>(sql`
    WITH weeks AS (
      SELECT week_number, start_date
      FROM programme_weeks
      WHERE season_id = ${seasonId}
    ),
    filed AS (
      SELECT DISTINCT j.team_id, w.week_number
      FROM weekly_journals j
      JOIN weeks w ON w.start_date = j.week_start_date
      WHERE j.season_id = ${seasonId}
    ),
    -- Islands: consecutive week_numbers per team share (week_number - rank).
    grouped AS (
      SELECT team_id, week_number,
             week_number - ROW_NUMBER() OVER (
               PARTITION BY team_id ORDER BY week_number
             ) AS grp
      FROM filed
    ),
    runs AS (
      SELECT team_id, grp, MIN(week_number) AS lo, MAX(week_number) AS hi
      FROM grouped
      GROUP BY team_id, grp
    )
    -- Every closing week from the STREAK_WEEKS-th onwards earns one award.
    SELECT r.team_id, w AS end_week
    FROM runs r
    CROSS JOIN LATERAL generate_series(
      r.lo + ${STREAK_WEEKS} - 1, r.hi
    ) AS w
    WHERE r.hi - r.lo + 1 >= ${STREAK_WEEKS}
  `);
  return (rows as unknown as { rows: Array<{ team_id: number; end_week: number }> }).rows.map(
    (r) => ({
      teamId: r.team_id,
      kind: "journal_streak" as const,
      refType: "journal_streak_week",
      refId: r.end_week,
      reason: `${STREAK_WEEKS} weeks of journals with no gaps, to week ${r.end_week}.`,
    }),
  );
}

/** Leads whose trail reached the strong band, and leads captured on site. */
async function leadAwards(seasonId: number): Promise<Award[]> {
  const rows = await db.execute<{
    id: number;
    team_id: number;
    strong: boolean;
    geo: boolean;
  }>(sql`
    SELECT id, team_id,
           (trail_strength >= ${STRONG_TRAIL}) AS strong,
           (geo_lat IS NOT NULL AND geo_lng IS NOT NULL) AS geo
    FROM leads
    WHERE season_id = ${seasonId}
      AND (trail_strength >= ${STRONG_TRAIL}
           OR (geo_lat IS NOT NULL AND geo_lng IS NOT NULL))
  `);
  const out: Award[] = [];
  for (const r of (rows as unknown as {
    rows: Array<{ id: number; team_id: number; strong: boolean; geo: boolean }>;
  }).rows) {
    if (r.strong) {
      out.push({
        teamId: r.team_id,
        kind: "trail_strong",
        refType: "lead_trail",
        refId: r.id,
      });
    }
    if (r.geo) {
      out.push({
        teamId: r.team_id,
        kind: "geo_verified",
        refType: "lead_geo",
        refId: r.id,
      });
    }
  }
  return out;
}

/**
 * Phases fully paid by their due date.
 *
 * A phase with no due date cannot be late, so it is excluded rather than
 * counted as on time — awarding for a deadline nobody set would be meaningless.
 */
async function phasesOnTime(seasonId: number): Promise<Award[]> {
  const rows = await db.execute<{ phase_id: number; team_id: number }>(sql`
    SELECT ps.phase_id, pr.team_id
    FROM payment_schedule ps
    JOIN projects pr ON pr.id = ps.project_id
    WHERE pr.season_id = ${seasonId}
      AND ps.due_date IS NOT NULL
      AND (
        SELECT COALESCE(SUM(p.amount_received), 0)
        FROM payments p
        WHERE p.phase_id = ps.phase_id
          AND p.payment_date <= ps.due_date
      ) >= ps.amount
  `);
  return (rows as unknown as {
    rows: Array<{ phase_id: number; team_id: number }>;
  }).rows.map((r) => ({
    teamId: r.team_id,
    kind: "phase_delivered_on_time" as const,
    refType: "phase_on_time",
    refId: r.phase_id,
  }));
}

router.post(
  "/internal/cron/trust-awards",
  async (req: Request, res: Response): Promise<void> => {
    if (!verifyCronSecret(req, res)) return;

    const lock = await tryAcquireCronLock(LOCK);
    if (!lock) {
      res.json({ ok: true, skipped: "another run holds the lock" });
      return;
    }

    try {
      const seasonId = await getActiveSeasonId();

      // An archived season must not accrue new trust. Its standing is history.
      if (!(await isSeasonWritable(seasonId, "project"))) {
        res.json({
          ok: true,
          skipped: "active season does not accept pipeline writes",
          seasonId,
        });
        return;
      }

      const candidates: Award[] = [
        ...(await journalStreaks(seasonId)),
        ...(await leadAwards(seasonId)),
        ...(await phasesOnTime(seasonId)),
      ];

      let awarded = 0;
      let alreadyScored = 0;
      for (const c of candidates) {
        try {
          const fresh = await awardTrust({
            teamId: c.teamId,
            seasonId,
            kind: c.kind,
            refType: c.refType,
            refId: c.refId,
            ...(c.reason ? { reason: c.reason } : {}),
          });
          // `false` means the dedup index rejected it — the fact was already
          // scored on an earlier run. That is the expected steady state, not an
          // error, so it is counted separately rather than logged.
          if (fresh) awarded++;
          else alreadyScored++;
        } catch (err) {
          logger.error(
            { err, teamId: c.teamId, kind: c.kind },
            "[cron-trust-awards] award failed",
          );
        }
      }

      logger.info(
        { seasonId, examined: candidates.length, awarded, alreadyScored },
        "[cron-trust-awards] sweep complete",
      );
      res.json({
        ok: true,
        seasonId,
        examined: candidates.length,
        awarded,
        alreadyScored,
      });
    } catch (err) {
      logger.error({ err }, "[cron-trust-awards] sweep failed");
      res.status(500).json({ error: "Trust award sweep failed" });
    } finally {
      await lock.release();
    }
  },
);

export default router;
