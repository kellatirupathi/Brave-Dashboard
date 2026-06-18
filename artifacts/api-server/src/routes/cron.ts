/**
 * Internal cron endpoint — invoked by cron-job.org once daily at 9 AM IST.
 * Protected by a shared-secret header so random traffic can't trigger sends.
 *
 *   POST /internal/cron/reminders
 *   Header: X-Cron-Secret: <CRON_SECRET env var>
 *
 * Reminder logic (week-scoped — one Day-5 and one Day-7 per team per week max):
 *
 *   1. Find current open programme week (where today is between startDate and
 *      endDate). If no current week, exit early — nothing to remind about.
 *   2. For each active team:
 *        a. Has the team submitted a journal for THIS current week?
 *           → Yes: skip the team entirely.
 *        b. Compute dayOfWeek = today - week.startDate + 1 (1..7).
 *        c. If dayOfWeek >= 7 AND no silence_7d log for this team+week:
 *              → in-app + email + coordinator notification (per admin toggles)
 *        d. Else if dayOfWeek >= 5 AND no silence_5d log for this team+week:
 *              → in-app notification only (per admin toggle)
 *   3. Every send is logged to reminder_log with weekStartDate so a team
 *      member never receives the same reminder twice in the same week.
 *
 * When the next programme week opens, dedup is automatically scoped to the
 * new weekStartDate so the cycle restarts naturally — no manual reset needed.
 */
import { Router, type IRouter, type Request, type Response } from "express";
import { eq, and, sql } from "drizzle-orm";
import {
  db,
  teamsTable,
  teamMembersTable,
  usersTable,
  weeklyJournalsTable,
  notificationsTable,
  reminderLogTable,
  campusesTable,
  programmeWeeksTable,
} from "@workspace/db";
import { sendEmail, getAppUrl } from "../lib/email/brevo";
import { logger } from "../lib/logger";
import { autoOpenDueWeeks, getReminderSettings } from "./programme-weeks";

const router: IRouter = Router();

const SILENCE_5D_DAYS = 5;
const SILENCE_7D_DAYS = 7;

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function dateOnly(s: string | null | undefined): string {
  return (s ?? "").slice(0, 10);
}

function daysBetween(fromIso: string, toIso: string): number {
  const a = new Date(fromIso + "T00:00:00Z").getTime();
  const b = new Date(toIso + "T00:00:00Z").getTime();
  return Math.round((b - a) / (1000 * 60 * 60 * 24));
}

async function findCurrentProgrammeWeek(): Promise<{
  id: number;
  weekNumber: number;
  startDate: string;
  endDate: string;
} | null> {
  const today = todayIso();
  const [week] = await db
    .select({
      id: programmeWeeksTable.id,
      weekNumber: programmeWeeksTable.weekNumber,
      startDate: programmeWeeksTable.startDate,
      endDate: programmeWeeksTable.endDate,
    })
    .from(programmeWeeksTable)
    .where(
      and(
        sql`${programmeWeeksTable.startDate} <= ${today}`,
        sql`${programmeWeeksTable.endDate} >= ${today}`,
      ),
    )
    .orderBy(sql`${programmeWeeksTable.startDate} desc`)
    .limit(1);
  if (!week) return null;
  return {
    id: week.id,
    weekNumber: week.weekNumber,
    startDate: dateOnly(week.startDate),
    endDate: dateOnly(week.endDate),
  };
}

async function teamSubmittedForWeek(
  teamId: number,
  weekStartDate: string,
): Promise<boolean> {
  const [row] = await db
    .select({ id: weeklyJournalsTable.id })
    .from(weeklyJournalsTable)
    .where(
      and(
        eq(weeklyJournalsTable.teamId, teamId),
        eq(weeklyJournalsTable.weekStartDate, weekStartDate),
      ),
    )
    .limit(1);
  return !!row;
}

async function alreadySentForWeek(
  teamId: number,
  userId: string,
  reminderType: "silence_5d" | "silence_7d",
  weekStartDate: string,
): Promise<boolean> {
  const [row] = await db
    .select({ count: sql<number>`count(*)` })
    .from(reminderLogTable)
    .where(
      and(
        eq(reminderLogTable.teamId, teamId),
        eq(reminderLogTable.userId, userId),
        eq(reminderLogTable.reminderType, reminderType),
        eq(reminderLogTable.weekStartDate, weekStartDate),
      ),
    );
  return Number(row?.count ?? 0) > 0;
}

async function logSent(
  teamId: number,
  userId: string,
  reminderType: "silence_5d" | "silence_7d",
  channel: "notification" | "email",
  weekStartDate: string,
): Promise<void> {
  await db.insert(reminderLogTable).values({
    teamId,
    userId,
    reminderType,
    channel,
    weekStartDate,
  });
}

async function pingTeam(
  team: { teamId: number; teamName: string; campusId: number | null },
  level: "5d" | "7d",
  week: { startDate: string; weekNumber: number },
  channels: {
    notificationsEnabled: boolean;
    emailsEnabled: boolean;
    coordinatorNotificationsEnabled: boolean;
  },
): Promise<void> {
  const members = await db
    .select({
      id: usersTable.id,
      email: usersTable.email,
      firstName: usersTable.firstName,
    })
    .from(teamMembersTable)
    .leftJoin(usersTable, eq(usersTable.id, teamMembersTable.userId))
    .where(eq(teamMembersTable.teamId, team.teamId));

  const reminderType = level === "5d" ? "silence_5d" : "silence_7d";
  const appUrl = getAppUrl();

  for (const m of members) {
    if (!m.id) continue;
    if (
      await alreadySentForWeek(team.teamId, m.id, reminderType, week.startDate)
    ) {
      continue;
    }

    // Curiosity-led tone — frame the journal as a story still waiting to be
    // told, rather than a missed task. Day 5 is a gentle nudge; Day 7 adds
    // urgency (the window is closing) while staying warm.
    const title =
      level === "5d"
        ? `Week ${week.weekNumber}'s story is still untold ✨`
        : `Week ${week.weekNumber} is about to close — your story's still missing`;
    const body =
      level === "5d"
        ? `Team ${team.teamName}, what happened this week? Your Week ${week.weekNumber} story is still untold — share it before the week wraps.`
        : `Team ${team.teamName}, what did Week ${week.weekNumber} hold for you? Your story's still untold and the window closes soon — your coordinator is keen to hear it too. Take a moment to share this week's update.`;

    if (channels.notificationsEnabled) {
      await db.insert(notificationsTable).values({
        userId: m.id,
        title,
        body,
        type: "reminder",
        link: "/journal",
      });
      await logSent(
        team.teamId,
        m.id,
        reminderType,
        "notification",
        week.startDate,
      );
    }

    if (level === "7d" && m.email && channels.emailsEnabled) {
      const ok = await sendEmail({
        to: { email: m.email, name: m.firstName ?? undefined },
        subject: `[BRAVE] ${title}`,
        text: `Hi ${m.firstName ?? "there"},\n\n${body}\n\nSubmit your weekly journal: ${appUrl}/journal\n\n— BRAVE Dashboard`,
      });
      if (ok) {
        await logSent(team.teamId, m.id, reminderType, "email", week.startDate);
      }
    }
  }

  // Coordinator ping at the 7d level — campus-scoped lookup, dedup'd per week.
  if (level === "7d" && team.campusId) {
    const [campus] = await db
      .select({ coordinatorId: campusesTable.coordinatorId })
      .from(campusesTable)
      .where(eq(campusesTable.id, team.campusId))
      .limit(1);
    if (campus?.coordinatorId) {
      const already = await alreadySentForWeek(
        team.teamId,
        campus.coordinatorId,
        "silence_7d",
        week.startDate,
      );
      if (!already && channels.coordinatorNotificationsEnabled) {
        await db.insert(notificationsTable).values({
          userId: campus.coordinatorId,
          title: `Team ${team.teamName} missed Week ${week.weekNumber}`,
          body: `${team.teamName} has not submitted the Week ${week.weekNumber} journal. Consider reaching out.`,
          type: "reminder",
          link: "/coordinator/heatmap",
        });
        await logSent(
          team.teamId,
          campus.coordinatorId,
          "silence_7d",
          "notification",
          week.startDate,
        );
      }
    }
  }
}

async function runReminders(): Promise<{
  flipped: number;
  pinged5d: number;
  pinged7d: number;
  skippedSubmitted: number;
  skippedNoCurrentWeek: boolean;
  currentWeekNumber: number | null;
  durationMs: number;
}> {
  const start = Date.now();

  let channels = {
    notificationsEnabled: true,
    emailsEnabled: true,
    coordinatorNotificationsEnabled: true,
  };
  try {
    channels = await getReminderSettings();
  } catch (err) {
    logger.error(
      { err },
      "[cron] failed to load reminder settings — defaulting all ON",
    );
  }

  let flipped = 0;
  try {
    flipped = await autoOpenDueWeeks();
  } catch (err) {
    logger.error({ err }, "[cron] autoOpenDueWeeks failed");
  }

  const currentWeek = await findCurrentProgrammeWeek();
  if (!currentWeek) {
    logger.info("[cron] no current programme week — skipping reminders");
    return {
      flipped,
      pinged5d: 0,
      pinged7d: 0,
      skippedSubmitted: 0,
      skippedNoCurrentWeek: true,
      currentWeekNumber: null,
      durationMs: Date.now() - start,
    };
  }

  const dayOfWeek = daysBetween(currentWeek.startDate, todayIso()) + 1;
  logger.info(
    { weekNumber: currentWeek.weekNumber, dayOfWeek },
    "[cron] processing current programme week",
  );

  // Below day-5 → no team can qualify yet, skip the team scan entirely.
  if (dayOfWeek < SILENCE_5D_DAYS) {
    return {
      flipped,
      pinged5d: 0,
      pinged7d: 0,
      skippedSubmitted: 0,
      skippedNoCurrentWeek: false,
      currentWeekNumber: currentWeek.weekNumber,
      durationMs: Date.now() - start,
    };
  }

  const teams = await db
    .select({
      teamId: teamsTable.id,
      teamName: teamsTable.name,
      campusId: teamsTable.campusId,
    })
    .from(teamsTable)
    .where(eq(teamsTable.status, "active" as const));

  let pinged5d = 0;
  let pinged7d = 0;
  let skippedSubmitted = 0;

  for (const team of teams) {
    if (await teamSubmittedForWeek(team.teamId, currentWeek.startDate)) {
      skippedSubmitted++;
      continue;
    }
    if (dayOfWeek >= SILENCE_7D_DAYS) {
      await pingTeam(team, "7d", currentWeek, channels);
      pinged7d++;
    } else if (dayOfWeek >= SILENCE_5D_DAYS) {
      await pingTeam(team, "5d", currentWeek, channels);
      pinged5d++;
    }
  }

  return {
    flipped,
    pinged5d,
    pinged7d,
    skippedSubmitted,
    skippedNoCurrentWeek: false,
    currentWeekNumber: currentWeek.weekNumber,
    durationMs: Date.now() - start,
  };
}

// Guards against overlapping runs: if cron-job.org retries while the
// previous invocation is still iterating teams + sending Brevo emails,
// we'd double-send. The dedup logic in reminder_log would catch most of
// it, but the second loop would still hammer the DB unnecessarily.
let reminderRunInFlight = false;

router.post("/internal/cron/reminders", async (req: Request, res: Response) => {
  const expected = process.env.CRON_SECRET;
  if (!expected) {
    logger.error("[cron] CRON_SECRET is not configured on the server");
    return res.status(500).json({ error: "cron not configured" });
  }
  const provided = req.header("x-cron-secret");
  if (provided !== expected) {
    logger.warn(
      { providedHeaderPresent: !!provided },
      "[cron] rejected request with bad secret",
    );
    return res.status(401).json({ error: "unauthorized" });
  }

  // If a previous invocation is still working, return immediately — don't
  // start a second concurrent run.
  if (reminderRunInFlight) {
    logger.warn(
      "[cron] reminders run already in flight — skipping this trigger",
    );
    return res.status(202).json({ ok: true, alreadyRunning: true });
  }

  // Fire-and-forget: respond *immediately* so cron-job.org never times
  // out, then run the heavy reminders job in the background. The handler
  // does N team iterations × M member iterations × 1 Brevo HTTP call per
  // 7-day email — easily >30s on busy days. cron-job.org's job timeout is
  // a transport-level cap, not a deadline for our actual work.
  reminderRunInFlight = true;
  res.status(202).json({ ok: true, queued: true });

  logger.info("[cron] reminders run starting (background)");
  runReminders()
    .then((result) => {
      logger.info(result, "[cron] reminders run done");
    })
    .catch((err) => {
      logger.error({ err }, "[cron] reminders run failed");
    })
    .finally(() => {
      reminderRunInFlight = false;
    });
});

export default router;
