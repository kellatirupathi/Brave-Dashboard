/**
 * Lead nudge / escalation / dormancy sweep.
 *
 *   POST /internal/cron/lead-nudges   Header: X-Cron-Secret
 *
 * The Season 2 pipeline's failure mode is not fraud, it is silence: a student
 * captures a lead, never goes back, and nobody notices until submission week.
 * This sweep makes silence visible on a fixed ladder, measured from the last
 * logged interaction (or the first meeting, if none has been logged yet):
 *
 *   10 days  -> nudge the team
 *   21 days  -> escalate to the campus coordinators
 *   30 days  -> mark the lead dormant
 *
 * ISOLATION: additive and season-scoped. Only leads in the ACTIVE season are
 * touched, and only when that season still accepts project writes — an
 * archived Season 1 must never generate notifications. Nothing outside the
 * leads table is written except notification rows.
 *
 * IDEMPOTENCY: `last_nudge_level` records the highest rung already sent, so a
 * daily schedule (or a cron-job.org retry) never re-notifies the same lead.
 * Logging a fresh interaction resets it to 0, so a lead that goes quiet a
 * second time is nudged a second time.
 */
import { Router, type IRouter, type Request, type Response } from "express";
import { and, eq, inArray, sql } from "drizzle-orm";
import {
  db,
  leadsTable,
  teamMembersTable,
  teamsTable,
  usersTable,
} from "@workspace/db";
import { createNotification } from "../lib/notifications";
import { logger } from "../lib/logger";
import { getActiveSeasonId, isSeasonWritable } from "../lib/season";
import { tryAcquireCronLock } from "../lib/cron-lock";

const router: IRouter = Router();

const LOCK = "cron:lead-nudges";

/** Rungs of the ladder, evaluated strictest-first. */
const DORMANT_DAYS = 30;
const ESCALATE_DAYS = 21;
const NUDGE_DAYS = 10;

/**
 * Stages still "in play". A converted lead has become a project, a lost lead is
 * closed, and a dormant one has already been through the whole ladder — none of
 * them needs nudging.
 */
const ACTIVE_STAGES = ["new", "qualified", "proposal_sent"] as const;

function verifyCronSecret(req: Request, res: Response): boolean {
  const expected = process.env.CRON_SECRET;
  if (!expected) {
    logger.error("[cron-lead-nudges] CRON_SECRET not configured");
    res.status(500).json({ error: "CRON_SECRET not configured" });
    return false;
  }
  if (req.header("x-cron-secret") !== expected) {
    res.status(403).json({ error: "Invalid cron secret" });
    return false;
  }
  return true;
}

type Candidate = {
  id: number;
  teamId: number;
  businessName: string;
  ownerName: string;
  lastNudgeLevel: number;
  silentDays: number;
};

/**
 * Days of silence per active lead, computed in SQL so the whole ladder costs
 * one query rather than one per lead. COALESCE means a lead with no
 * interactions yet is measured from its first meeting — which is exactly the
 * lead most likely to have been captured and then abandoned.
 */
async function loadCandidates(seasonId: number): Promise<Candidate[]> {
  const rows = await db
    .select({
      id: leadsTable.id,
      teamId: leadsTable.teamId,
      businessName: leadsTable.businessName,
      ownerName: leadsTable.ownerName,
      lastNudgeLevel: leadsTable.lastNudgeLevel,
      silentDays: sql<number>`GREATEST(0, (CURRENT_DATE - COALESCE(
        ${leadsTable.lastContactAt}::date,
        ${leadsTable.firstMeetingDate}::date
      )))::int`,
    })
    .from(leadsTable)
    .where(
      and(
        eq(leadsTable.seasonId, seasonId),
        inArray(leadsTable.stage, [...ACTIVE_STAGES]),
      ),
    );
  return rows.filter((r) => r.silentDays >= NUDGE_DAYS);
}

/** Every member of the team, so the nudge is not only the leader's problem. */
async function teamMemberIds(teamId: number): Promise<string[]> {
  const rows = await db
    .select({ userId: teamMembersTable.userId })
    .from(teamMembersTable)
    .where(eq(teamMembersTable.teamId, teamId));
  return rows.map((r) => r.userId);
}

/**
 * Coordinators for the lead's campus. Resolves to nobody rather than blasting
 * every coordinator in the programme — a misrouted escalation trains people to
 * ignore escalations.
 */
async function campusCoordinatorIds(teamId: number): Promise<string[]> {
  const [team] = await db
    .select({ campusId: teamsTable.campusId })
    .from(teamsTable)
    .where(eq(teamsTable.id, teamId))
    .limit(1);
  if (!team) return [];
  const rows = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(
      and(
        eq(usersTable.role, "coordinator"),
        eq(usersTable.campusId, team.campusId),
        eq(usersTable.isActive, true),
      ),
    );
  return rows.map((r) => r.id);
}

router.post(
  "/internal/cron/lead-nudges",
  async (req: Request, res: Response): Promise<void> => {
    if (!verifyCronSecret(req, res)) return;

    const lock = await tryAcquireCronLock(LOCK);
    if (!lock) {
      res.json({ ok: true, skipped: "another run holds the lock" });
      return;
    }

    try {
      const seasonId = await getActiveSeasonId();

      // An archived season must stay silent. Nudging a Season 1 team about a
      // lead from last year would be noise at best.
      if (!(await isSeasonWritable(seasonId, "project"))) {
        res.json({
          ok: true,
          skipped: "active season does not accept pipeline writes",
          seasonId,
        });
        return;
      }

      const candidates = await loadCandidates(seasonId);
      let nudged = 0;
      let escalated = 0;
      let dormant = 0;

      for (const lead of candidates) {
        const label = `${lead.businessName} (${lead.ownerName})`;
        try {
          if (lead.silentDays >= DORMANT_DAYS) {
            // Dormant is a stage, not a deletion: the trail stays intact and
            // the student revives it by logging a fresh interaction.
            await db
              .update(leadsTable)
              .set({
                stage: "dormant",
                lastNudgeLevel: DORMANT_DAYS,
                lastNudgeAt: new Date(),
              })
              .where(eq(leadsTable.id, lead.id));
            for (const userId of await teamMemberIds(lead.teamId)) {
              await createNotification(
                userId,
                "Lead moved to dormant",
                `${label} has had no contact for ${lead.silentDays} days, so it is now dormant. Log a new interaction to bring it back.`,
                "lead_dormant",
                `/leads/${lead.id}`,
              );
            }
            dormant++;
            continue;
          }

          if (
            lead.silentDays >= ESCALATE_DAYS &&
            lead.lastNudgeLevel < ESCALATE_DAYS
          ) {
            for (const userId of await campusCoordinatorIds(lead.teamId)) {
              await createNotification(
                userId,
                "Lead going cold",
                `${label} has had no contact for ${lead.silentDays} days. The team may need a push.`,
                "lead_escalation",
                `/leads/${lead.id}`,
              );
            }
            await db
              .update(leadsTable)
              .set({ lastNudgeLevel: ESCALATE_DAYS, lastNudgeAt: new Date() })
              .where(eq(leadsTable.id, lead.id));
            escalated++;
            continue;
          }

          if (lead.lastNudgeLevel < NUDGE_DAYS) {
            for (const userId of await teamMemberIds(lead.teamId)) {
              await createNotification(
                userId,
                "Follow up on your lead",
                `You have not logged anything on ${label} for ${lead.silentDays} days. A quick call is usually enough to keep it alive.`,
                "lead_nudge",
                `/leads/${lead.id}`,
              );
            }
            await db
              .update(leadsTable)
              .set({ lastNudgeLevel: NUDGE_DAYS, lastNudgeAt: new Date() })
              .where(eq(leadsTable.id, lead.id));
            nudged++;
          }
        } catch (err) {
          // One bad lead must not abort the sweep.
          logger.error(
            { err, leadId: lead.id },
            "[cron-lead-nudges] lead failed",
          );
        }
      }

      logger.info(
        { seasonId, candidates: candidates.length, nudged, escalated, dormant },
        "[cron-lead-nudges] sweep complete",
      );
      res.json({
        ok: true,
        seasonId,
        examined: candidates.length,
        nudged,
        escalated,
        dormant,
      });
    } catch (err) {
      logger.error({ err }, "[cron-lead-nudges] sweep failed");
      res.status(500).json({ error: "Lead nudge sweep failed" });
    } finally {
      await lock.release();
    }
  },
);

export default router;
