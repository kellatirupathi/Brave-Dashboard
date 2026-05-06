/**
 * Module 5 — Automated Reminder Service
 *
 * Standalone script. Runs once and exits. Designed to be invoked by a
 * Replit scheduled deployment (or any external cron) at ~9:00 AM IST daily.
 *
 *   Run locally / on Replit: `tsx src/cron-reminders.ts`
 *
 * What it does (per run):
 *   1. For each active team, find the most recent weekly journal submission.
 *   2. If gap >= 5 days and no `silence_5d` reminder was sent in last 24h
 *      → send in-app notification to every team member.
 *   3. If gap >= 7 days and no `silence_7d` reminder was sent in last 24h
 *      → send in-app notification + Brevo email to every team member, plus
 *      notify the campus coordinator.
 *   4. Logs every send to `reminder_log` so reminders are not duplicated.
 *
 * Reuses existing infra only — does not modify any existing notifications,
 * emails, or other portal logic.
 */
import { eq, and, gte, sql } from "drizzle-orm";
import {
  db,
  teamsTable,
  teamMembersTable,
  usersTable,
  weeklyJournalsTable,
  notificationsTable,
  reminderLogTable,
  campusesTable,
} from "@workspace/db";
import { sendEmail, getAppUrl } from "./lib/email/brevo";
import { logger } from "./lib/logger";
import {
  autoOpenDueWeeks,
  getReminderSettings,
} from "./routes/programme-weeks";

// Module-level cache of the admin toggles, populated once per cron run.
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

function daysAgo(d: Date): number {
  return Math.floor((Date.now() - d.getTime()) / (1000 * 60 * 60 * 24));
}

async function alreadySentInLast24h(
  teamId: number,
  userId: string,
  reminderType: "silence_5d" | "silence_7d",
): Promise<boolean> {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const [row] = await db
    .select({ count: sql<number>`count(*)` })
    .from(reminderLogTable)
    .where(
      and(
        eq(reminderLogTable.teamId, teamId),
        eq(reminderLogTable.userId, userId),
        eq(reminderLogTable.reminderType, reminderType),
        gte(reminderLogTable.sentAt, since),
      ),
    );
  return Number(row?.count ?? 0) > 0;
}

async function logSent(
  teamId: number,
  userId: string,
  reminderType: "silence_5d" | "silence_7d",
  channel: "notification" | "email",
): Promise<void> {
  await db.insert(reminderLogTable).values({
    teamId,
    userId,
    reminderType,
    channel,
  });
}

async function pingTeam(
  team: { teamId: number; teamName: string; campusId: number | null },
  silentDays: number,
  level: "5d" | "7d",
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
    if (await alreadySentInLast24h(team.teamId, m.id, reminderType)) continue;

    const title =
      level === "5d"
        ? `${silentDays} days since your team's last journal`
        : `Action needed: ${silentDays} days inactive`;
    const body =
      level === "5d"
        ? `Team ${team.teamName} hasn't submitted a journal in ${silentDays} days. Add this week's update to stay on track.`
        : `Team ${team.teamName} has been silent for ${silentDays} days. Your coordinator has been notified.`;

    if (_channelsCache.notificationsEnabled) {
      await db.insert(notificationsTable).values({
        userId: m.id,
        title,
        body,
        type: "reminder",
        link: "/journal",
      });
      await logSent(team.teamId, m.id, reminderType, "notification");
    }

    if (level === "7d" && m.email && _channelsCache.emailsEnabled) {
      const ok = await sendEmail({
        to: { email: m.email, name: m.firstName ?? undefined },
        subject: `[BRAVE] ${title}`,
        text: `Hi ${m.firstName ?? "there"},\n\n${body}\n\nSubmit your weekly journal: ${appUrl}/journal\n\n— BRAVE Dashboard`,
      });
      if (ok) {
        await logSent(team.teamId, m.id, reminderType, "email");
      }
    }
  }

  // Coordinator ping at the 7d level — campus-scoped lookup.
  if (level === "7d" && team.campusId) {
    const [campus] = await db
      .select({ coordinatorId: campusesTable.coordinatorId })
      .from(campusesTable)
      .where(eq(campusesTable.id, team.campusId))
      .limit(1);
    if (campus?.coordinatorId) {
      const already = await alreadySentInLast24h(
        team.teamId,
        campus.coordinatorId,
        "silence_7d",
      );
      if (!already && _channelsCache.coordinatorNotificationsEnabled) {
        await db.insert(notificationsTable).values({
          userId: campus.coordinatorId,
          title: `Team ${team.teamName} is silent`,
          body: `${team.teamName} has not submitted a journal in ${silentDays} days. Consider reaching out.`,
          type: "reminder",
          link: "/coordinator/heatmap",
        });
        await logSent(
          team.teamId,
          campus.coordinatorId,
          "silence_7d",
          "notification",
        );
      }
    }
  }
}

async function run(): Promise<void> {
  const start = Date.now();
  logger.info("[cron-reminders] starting");

  // Step 0a — load admin toggles. Cron sends are gated per-channel so admin
  // can disable in-app notifications, emails, or both from /admin/config.
  try {
    _channelsCache = await getReminderSettings();
    logger.info(
      { ..._channelsCache },
      "[cron-reminders] loaded reminder channel toggles",
    );
  } catch (err) {
    logger.error(
      { err },
      "[cron-reminders] failed to load reminder settings — defaulting both ON",
    );
  }
  if (
    !_channelsCache.notificationsEnabled &&
    !_channelsCache.emailsEnabled &&
    !_channelsCache.coordinatorNotificationsEnabled
  ) {
    logger.info(
      "[cron-reminders] all channels disabled by admin — skipping send phase",
    );
  }

  // Step 0b — auto-open any programme weeks whose start date has arrived.
  // Admin manual overrides are respected (skipped) inside autoOpenDueWeeks.
  try {
    const flipped = await autoOpenDueWeeks();
    if (flipped > 0) {
      logger.info({ flipped }, "[cron-reminders] auto-opened programme weeks");
    }
  } catch (err) {
    logger.error({ err }, "[cron-reminders] autoOpenDueWeeks failed");
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

  for (const team of teams) {
    const [lastJournal] = await db
      .select({ submittedAt: weeklyJournalsTable.submittedAt })
      .from(weeklyJournalsTable)
      .where(eq(weeklyJournalsTable.teamId, team.teamId))
      .orderBy(sql`submitted_at desc`)
      .limit(1);

    if (!lastJournal?.submittedAt) {
      // Never submitted — surfaced via the heatmap UI, not silence cron.
      continue;
    }
    const silentDays = daysAgo(lastJournal.submittedAt);
    if (silentDays >= SILENCE_7D_DAYS) {
      await pingTeam(team, silentDays, "7d");
      pinged7d++;
    } else if (silentDays >= SILENCE_5D_DAYS) {
      await pingTeam(team, silentDays, "5d");
      pinged5d++;
    }
  }

  logger.info(
    { pinged5d, pinged7d, durationMs: Date.now() - start },
    "[cron-reminders] done",
  );
}

run()
  .then(() => process.exit(0))
  .catch((err) => {
    logger.error({ err }, "[cron-reminders] failed");
    process.exit(1);
  });
