/**
 * Module 5 — Automated Reminder Service (standalone CLI)
 *
 * Runs once and exits. Mirrors the logic in routes/cron.ts so this script
 * can be invoked as a fallback by `tsx src/cron-reminders.ts` from any
 * external scheduler that prefers running a script over hitting an HTTP
 * endpoint.
 *
 * Logic (week-scoped — one Day-5 and one Day-7 per team-member per week):
 *   1. Find current open programme week.
 *   2. For each active team:
 *      - Skip if the team already submitted the journal for this week.
 *      - On day 5+ of the week → in-app nudge (once per team-member-week).
 *      - On day 7+ of the week → in-app + email + coordinator (once each).
 *   3. Every send is recorded in reminder_log with weekStartDate so the
 *      same reminder never fires twice in the same week.
 */
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
import { sendEmail, getAppUrl } from "./lib/email/brevo";
import { logger } from "./lib/logger";
import {
  autoOpenDueWeeks,
  getReminderSettings,
} from "./routes/programme-weeks";

let _channelsCache: {
  notificationsEnabled: boolean;
  emailsEnabled: boolean;
  coordinatorNotificationsEnabled: boolean;
} = {
  notificationsEnabled: true,
  emailsEnabled: true,
  coordinatorNotificationsEnabled: true,
};

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

async function findCurrentProgrammeWeek() {
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
    )
      continue;

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

    if (_channelsCache.notificationsEnabled) {
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

    if (level === "7d" && m.email && _channelsCache.emailsEnabled) {
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
      if (!already && _channelsCache.coordinatorNotificationsEnabled) {
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

async function run(): Promise<void> {
  const start = Date.now();
  logger.info("[cron-reminders] starting");

  try {
    _channelsCache = await getReminderSettings();
    logger.info(
      { ..._channelsCache },
      "[cron-reminders] loaded channel toggles",
    );
  } catch (err) {
    logger.error(
      { err },
      "[cron-reminders] failed to load reminder settings — defaulting all ON",
    );
  }

  try {
    const flipped = await autoOpenDueWeeks();
    if (flipped > 0) {
      logger.info({ flipped }, "[cron-reminders] auto-opened programme weeks");
    }
  } catch (err) {
    logger.error({ err }, "[cron-reminders] autoOpenDueWeeks failed");
  }

  const currentWeek = await findCurrentProgrammeWeek();
  if (!currentWeek) {
    logger.info("[cron-reminders] no current programme week — exiting");
    return;
  }

  const dayOfWeek = daysBetween(currentWeek.startDate, todayIso()) + 1;
  logger.info(
    { weekNumber: currentWeek.weekNumber, dayOfWeek },
    "[cron-reminders] processing current programme week",
  );

  if (dayOfWeek < SILENCE_5D_DAYS) {
    logger.info(
      "[cron-reminders] day-of-week below threshold — nothing to send",
    );
    return;
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
      await pingTeam(team, "7d", currentWeek);
      pinged7d++;
    } else if (dayOfWeek >= SILENCE_5D_DAYS) {
      await pingTeam(team, "5d", currentWeek);
      pinged5d++;
    }
  }

  logger.info(
    {
      pinged5d,
      pinged7d,
      skippedSubmitted,
      weekNumber: currentWeek.weekNumber,
      dayOfWeek,
      durationMs: Date.now() - start,
    },
    "[cron-reminders] done",
  );
}

run()
  .then(() => process.exit(0))
  .catch((err) => {
    logger.error({ err }, "[cron-reminders] failed");
    process.exit(1);
  });
