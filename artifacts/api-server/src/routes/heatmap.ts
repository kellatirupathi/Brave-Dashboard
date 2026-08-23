import { Router, type IRouter } from "express";
import { eq, and, gte, asc, isNull, inArray, sql } from "drizzle-orm";
import {
  db,
  teamsTable,
  campusesTable,
  usersTable,
  teamMembersTable,
  weeklyJournalsTable,
  notificationsTable,
  reminderLogTable,
  programmeWeeksTable,
} from "@workspace/db";
import { z } from "zod/v4";
import { getReminderSettings } from "./programme-weeks";
import { resolveSeason } from "../lib/season";
import { sendEmail, getAppUrl } from "../lib/email/brevo";
import {
  renderJournalStatusReminderEmail,
  journalStatusNotificationCopy,
  type TeamReminderStatus,
} from "../lib/email/templates/journal-status-reminder";
import { logger } from "../lib/logger";
import { requireAdminPage } from "../lib/require-admin-page";

const router: IRouter = Router();

function daysBetween(a: Date, b: Date): number {
  return Math.floor((b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24));
}

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

// Derive a team's reminder status from its all-time journal history, using the
// SAME thresholds as the heatmap grid (GET /heatmap): never submitted → never
// logged; last journal > 14d → silent; > 7d → inconsistent; otherwise active.
function teamReminderStatus(
  totalJournals: number,
  lastJournal: Date | null,
  now: Date,
): TeamReminderStatus {
  if (totalJournals === 0 || !lastJournal) return "never_logged";
  const days = daysBetween(lastJournal, now);
  if (days > 14) return "silent";
  if (days > 7) return "inconsistent";
  return "active";
}

// Gap between individual reminder emails in the background blast. Emails are
// sent ONE AT A TIME (never thousands at once) so we never exceed the SES send
// rate or hammer the provider on a large cohort.
const EMAIL_THROTTLE_MS = 150;

// Guards against two overlapping bulk sends. The email blast runs in the
// background for minutes on a large cohort; a second click while it's running
// would otherwise double-send. Held until the background email loop finishes.
let bulkReminderInFlight = false;

// Strip any timestamp suffix that might leak into config-stored dates.
function dateOnly(s: string | null | undefined): string {
  return (s ?? "").slice(0, 10);
}

router.get("/heatmap", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const role = req.user.role;
  if (role !== "admin" && role !== "coordinator") {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const weeksBack = Math.min(Math.max(Number(req.query.weeksBack) || 8, 1), 24);

  let campusFilter: number | null = null;
  if (role === "coordinator") {
    const [me] = await db
      .select({ campusId: usersTable.campusId })
      .from(usersTable)
      .where(eq(usersTable.id, req.user.id))
      .limit(1);
    if (!me?.campusId) {
      res.json({ weeks: [], teams: [] });
      return;
    }
    campusFilter = me.campusId;
  } else if (req.query.campusId) {
    const cid = Number(req.query.campusId);
    if (!Number.isNaN(cid)) campusFilter = cid;
  }

  // Build the list of week-start dates from the admin-managed programme_weeks
  // table. Heatmap columns must match the dates used when journals are
  // submitted (which are anchored to the programme start date, not calendar
  // Mondays). We pick the most recent `weeksBack` weeks ending at the week
  // containing today, so the rightmost column is always "current or latest".
  const todayIso = new Date().toISOString().slice(0, 10);
  const allProgrammeWeeks = await db
    .select({
      startDate: programmeWeeksTable.startDate,
      endDate: programmeWeeksTable.endDate,
    })
    .from(programmeWeeksTable)
    .orderBy(asc(programmeWeeksTable.startDate));

  // Find the week containing today (or most recent past week if today is
  // outside the programme).
  let anchorIdx = allProgrammeWeeks.findIndex(
    (w) => dateOnly(w.startDate) <= todayIso && todayIso <= dateOnly(w.endDate),
  );
  if (anchorIdx < 0) {
    // Today is outside the programme — anchor to the latest week that
    // started on or before today, otherwise the very last week.
    for (let i = allProgrammeWeeks.length - 1; i >= 0; i--) {
      if (dateOnly(allProgrammeWeeks[i].startDate) <= todayIso) {
        anchorIdx = i;
        break;
      }
    }
    if (anchorIdx < 0) anchorIdx = allProgrammeWeeks.length - 1;
  }

  const startIdx = Math.max(0, anchorIdx - weeksBack + 1);
  const endIdx = anchorIdx;
  const weekStarts: string[] = allProgrammeWeeks
    .slice(startIdx, endIdx + 1)
    .map((w) => dateOnly(w.startDate));

  // If there are no programme weeks at all, fall back to empty heatmap.
  if (weekStarts.length === 0) {
    res.json({ weeks: [], teams: [] });
    return;
  }
  const earliest = new Date(weekStarts[0] + "T00:00:00Z");

  // Pull active teams in scope.
  const teamConditions = [eq(teamsTable.status, "active" as const)];
  if (campusFilter != null)
    teamConditions.push(eq(teamsTable.campusId, campusFilter));
  const teams = await db
    .select({
      teamId: teamsTable.id,
      teamName: teamsTable.name,
      campusId: teamsTable.campusId,
      campusName: campusesTable.name,
    })
    .from(teamsTable)
    .leftJoin(campusesTable, eq(campusesTable.id, teamsTable.campusId))
    .where(and(...teamConditions));

  if (teams.length === 0) {
    res.json({ weeks: weekStarts, teams: [] });
    return;
  }

  // Pull journals in window.
  const journals = await db
    .select({
      teamId: weeklyJournalsTable.teamId,
      weekStartDate: weeklyJournalsTable.weekStartDate,
      submittedAt: weeklyJournalsTable.submittedAt,
    })
    .from(weeklyJournalsTable)
    .where(
      and(
        eq(weeklyJournalsTable.seasonId, await resolveSeason(req)),
        gte(weeklyJournalsTable.submittedAt, earliest),
      ),
    );

  type Bucket = { hasJournal: boolean };
  const grid = new Map<number, Map<string, Bucket>>();
  const lastJournalByTeam = new Map<number, Date>();
  const totalJournalByTeam = new Map<number, number>();

  for (const j of journals) {
    const teamMap = grid.get(j.teamId) ?? new Map<string, Bucket>();
    const bucket = teamMap.get(j.weekStartDate) ?? { hasJournal: false };
    bucket.hasJournal = true;
    teamMap.set(j.weekStartDate, bucket);
    grid.set(j.teamId, teamMap);
    const last = lastJournalByTeam.get(j.teamId);
    const ts = new Date(j.submittedAt);
    if (!last || ts.getTime() > last.getTime())
      lastJournalByTeam.set(j.teamId, ts);
    totalJournalByTeam.set(
      j.teamId,
      (totalJournalByTeam.get(j.teamId) ?? 0) + 1,
    );
  }

  const now = new Date();

  const teamRows = teams.map((t) => {
    const teamMap = grid.get(t.teamId) ?? new Map<string, Bucket>();
    const weeks = weekStarts.map((w) => ({
      weekStartDate: w,
      hasJournal: teamMap.get(w)?.hasJournal ?? false,
    }));
    const lastJournal = lastJournalByTeam.get(t.teamId) ?? null;
    const totalJournals = totalJournalByTeam.get(t.teamId) ?? 0;

    let status: "active" | "inconsistent" | "silent" | "never_logged" =
      "never_logged";
    if (totalJournals === 0) {
      status = "never_logged";
    } else if (lastJournal && daysBetween(lastJournal, now) > 14) {
      status = "silent";
    } else if (lastJournal && daysBetween(lastJournal, now) > 7) {
      status = "inconsistent";
    } else {
      status = "active";
    }

    return {
      teamId: t.teamId,
      teamName: t.teamName,
      campusId: t.campusId,
      campusName: t.campusName,
      daysSinceLastJournal: lastJournal ? daysBetween(lastJournal, now) : null,
      totalJournals,
      weeks,
      status,
    };
  });

  // Sort: never_logged + silent first (most attention needed)
  const order: Record<string, number> = {
    never_logged: 0,
    silent: 1,
    inconsistent: 2,
    active: 3,
  };
  teamRows.sort((a, b) => {
    const oa = order[a.status] ?? 99;
    const ob = order[b.status] ?? 99;
    if (oa !== ob) return oa - ob;
    return a.teamName.localeCompare(b.teamName);
  });

  res.json({ weeks: weekStarts, teams: teamRows });
});

const RemindBody = z.object({
  teamId: z.number().int().positive(),
});

// Manual reminder sent from the heatmap by a coordinator/admin to a team.
// In-app notification only — does not duplicate cron emails.
router.post(
  "/heatmap/remind",
  requireAdminPage("/admin/heatmap", "edit"),
  async (req, res): Promise<void> => {
    if (!req.isAuthenticated()) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    if (req.user.role !== "admin" && req.user.role !== "coordinator") {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
    const parsed = RemindBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const teamId = parsed.data.teamId;

    // Coordinators can only ping teams in their own campus.
    const [team] = await db
      .select({ campusId: teamsTable.campusId, name: teamsTable.name })
      .from(teamsTable)
      .where(eq(teamsTable.id, teamId))
      .limit(1);
    if (!team) {
      res.status(404).json({ error: "Team not found" });
      return;
    }
    if (req.user.role === "coordinator") {
      const [me] = await db
        .select({ campusId: usersTable.campusId })
        .from(usersTable)
        .where(eq(usersTable.id, req.user.id))
        .limit(1);
      if (!me?.campusId || me.campusId !== team.campusId) {
        res.status(403).json({ error: "Cross-campus reminder not allowed" });
        return;
      }
    }

    // Respect the admin's master toggle for in-app notifications.
    const { notificationsEnabled } = await getReminderSettings();
    if (!notificationsEnabled) {
      res.status(409).json({
        error:
          "In-app notifications are disabled by admin in /admin/config. Enable the toggle to send reminders.",
      });
      return;
    }

    const members = await db
      .select({ userId: teamMembersTable.userId })
      .from(teamMembersTable)
      .where(eq(teamMembersTable.teamId, teamId));

    for (const m of members) {
      await db.insert(notificationsTable).values({
        userId: m.userId,
        title: "Update needed",
        body: `Your coordinator has flagged ${team.name} as silent. Please submit your weekly journal.`,
        type: "reminder",
        link: "/journal",
      });
      await db.insert(reminderLogTable).values({
        teamId,
        userId: m.userId,
        reminderType: "silence_7d",
        channel: "notification",
      });
    }

    res.json({ ok: true });
  },
);

const RemindBulkBody = z.object({
  teamIds: z.array(z.number().int().positive()).min(1).max(2000),
});

// Bulk reminder — send the same in-app notification to every team in the
// list. Used by the heatmap's "Send reminder to N teams" button when
// admin/coordinator filters the table and wants to ping the filtered set.
router.post(
  "/heatmap/remind-bulk",
  requireAdminPage("/admin/heatmap", "edit"),
  async (req, res): Promise<void> => {
    if (!req.isAuthenticated()) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    if (req.user.role !== "admin" && req.user.role !== "coordinator") {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
    const parsed = RemindBulkBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }

    // Refuse to start a second blast while one is still emailing in the
    // background (a large cohort takes minutes) — prevents double-sends.
    if (bulkReminderInFlight) {
      res.status(409).json({
        error:
          "A bulk reminder is already being sent. Please wait for it to finish before sending another.",
      });
      return;
    }

    // Status-based reminders use BOTH channels: an in-app notification and an
    // email, each matched to the team's status. Require at least one channel on.
    const { notificationsEnabled, emailsEnabled } = await getReminderSettings();
    if (!notificationsEnabled && !emailsEnabled) {
      res.status(409).json({
        error:
          "Both in-app notifications and emails are disabled by admin in /admin/config. Enable at least one to send reminders.",
      });
      return;
    }

    bulkReminderInFlight = true;
    let backgroundOwnsRelease = false;
    try {
      // Resolve coordinator's campus once so we can scope their bulk send.
      let coordinatorCampusId: number | null = null;
      if (req.user.role === "coordinator") {
        const [me] = await db
          .select({ campusId: usersTable.campusId })
          .from(usersTable)
          .where(eq(usersTable.id, req.user.id))
          .limit(1);
        if (!me?.campusId) {
          res.status(403).json({ error: "Coordinator has no campus" });
          return;
        }
        coordinatorCampusId = me.campusId;
      }

      // Fetch all teams in the request, plus their campus + name.
      const teams = await db
        .select({
          id: teamsTable.id,
          campusId: teamsTable.campusId,
          name: teamsTable.name,
        })
        .from(teamsTable);
      const requested = new Set(parsed.data.teamIds);
      const allowed = teams.filter((t) => {
        if (!requested.has(t.id)) return false;
        if (coordinatorCampusId != null && t.campusId !== coordinatorCampusId) {
          return false;
        }
        return true;
      });
      const allowedIds = allowed.map((t) => t.id);
      const nameByTeam = new Map(allowed.map((t) => [t.id, t.name]));

      if (allowedIds.length === 0) {
        res.json({
          ok: true,
          sentToTeams: 0,
          sentToUsers: 0,
          skippedTeams: parsed.data.teamIds.length,
        });
        return;
      }

      // Compute each team's status from its all-time journal history (same
      // thresholds as the heatmap grid), in one grouped query — no N+1.
      const now = new Date();
      const agg = await db
        .select({
          teamId: weeklyJournalsTable.teamId,
          total: sql<number>`count(*)`,
          last: sql<string | null>`max(${weeklyJournalsTable.submittedAt})`,
        })
        .from(weeklyJournalsTable)
        .where(
          and(
            eq(weeklyJournalsTable.seasonId, await resolveSeason(req)),
            inArray(weeklyJournalsTable.teamId, allowedIds),
          ),
        )
        .groupBy(weeklyJournalsTable.teamId);
      const statusByTeam = new Map<number, TeamReminderStatus>();
      const aggByTeam = new Map<number, { total: number; last: Date | null }>();
      for (const a of agg) {
        aggByTeam.set(a.teamId, {
          total: Number(a.total ?? 0),
          last: a.last ? new Date(a.last) : null,
        });
      }
      for (const t of allowed) {
        const ag = aggByTeam.get(t.id) ?? { total: 0, last: null };
        statusByTeam.set(t.id, teamReminderStatus(ag.total, ag.last, now));
      }

      // All members of the allowed teams, with the data needed for both channels.
      const memberRows = await db
        .select({
          teamId: teamMembersTable.teamId,
          userId: teamMembersTable.userId,
          email: usersTable.email,
          firstName: usersTable.firstName,
        })
        .from(teamMembersTable)
        .leftJoin(usersTable, eq(usersTable.id, teamMembersTable.userId))
        .where(inArray(teamMembersTable.teamId, allowedIds));

      // Build the in-app notification rows + the per-member email jobs, each
      // carrying its team's status so the right template is used.
      type EmailJob = {
        email: string;
        firstName: string | null;
        teamId: number;
        userId: string;
        teamName: string;
        status: TeamReminderStatus;
      };
      const notifRows: Array<typeof notificationsTable.$inferInsert> = [];
      const logRows: Array<typeof reminderLogTable.$inferInsert> = [];
      const emailJobs: EmailJob[] = [];
      const teamsWithMembers = new Set<number>();

      for (const m of memberRows) {
        teamsWithMembers.add(m.teamId);
        const status = statusByTeam.get(m.teamId) ?? "never_logged";
        const teamName = nameByTeam.get(m.teamId) ?? `Team #${m.teamId}`;
        if (notificationsEnabled) {
          const copy = journalStatusNotificationCopy(status, teamName);
          notifRows.push({
            userId: m.userId,
            title: copy.title,
            body: copy.body,
            type: "reminder",
            link: "/journal",
          });
          logRows.push({
            teamId: m.teamId,
            userId: m.userId,
            reminderType: "journal_due",
            channel: "notification",
          });
        }
        // Skip synthetic placeholder addresses (sso_*@forms.local) — they would
        // bounce at SES and hurt sender reputation. These users still get the
        // in-app notification above.
        if (
          emailsEnabled &&
          m.email &&
          m.email.includes("@") &&
          !m.email.toLowerCase().endsWith("@forms.local")
        ) {
          emailJobs.push({
            email: m.email,
            firstName: m.firstName,
            teamId: m.teamId,
            userId: m.userId,
            teamName,
            status,
          });
        }
      }

      // In-app notifications + their audit rows — chunked batch inserts so a
      // few thousand rows don't blow the parameter limit or run row-by-row.
      for (const c of chunk(notifRows, 500)) {
        await db.insert(notificationsTable).values(c);
      }
      for (const c of chunk(logRows, 500)) {
        await db.insert(reminderLogTable).values(c);
      }

      const sentToTeams = teamsWithMembers.size;
      const sentToUsers = memberRows.length;
      res.json({
        ok: true,
        sentToTeams,
        sentToUsers,
        skippedTeams: parsed.data.teamIds.length - sentToTeams,
      });

      // Emails go out ONE AT A TIME in the background (never all at once), each
      // recipient addressed individually, with a small gap between sends so we
      // stay under the provider's rate limit on a large cohort. The in-flight
      // guard is held until this loop finishes.
      if (emailsEnabled && emailJobs.length > 0) {
        backgroundOwnsRelease = true;
        const appUrl = getAppUrl();
        void (async () => {
          let emailed = 0;
          for (const job of emailJobs) {
            const tmpl = renderJournalStatusReminderEmail({
              status: job.status,
              recipientName: job.firstName,
              teamName: job.teamName,
              appUrl,
            });
            const ok = await sendEmail({ category: "heatmapNudges",
              to: { email: job.email, name: job.firstName || undefined },
              subject: tmpl.subject,
              text: tmpl.text,
            });
            if (ok) {
              emailed += 1;
              try {
                await db.insert(reminderLogTable).values({
                  teamId: job.teamId,
                  userId: job.userId,
                  reminderType: "journal_due",
                  channel: "email",
                });
              } catch {
                // best-effort audit row; never block the blast
              }
            }
            await sleep(EMAIL_THROTTLE_MS);
          }
          logger.info(
            { queued: emailJobs.length, emailed },
            "[heatmap] status-based reminder email blast complete",
          );
        })()
          .catch((err) =>
            logger.error(
              { err },
              "[heatmap] status reminder email blast failed",
            ),
          )
          .finally(() => {
            bulkReminderInFlight = false;
          });
      }
    } catch (err) {
      logger.error({ err }, "[heatmap] remind-bulk failed");
      if (!res.headersSent) {
        res.status(500).json({ error: "Failed to send reminders" });
      }
    } finally {
      if (!backgroundOwnsRelease) bulkReminderInFlight = false;
    }
  },
);

const RemindNeverLoggedBody = z.object({
  campusId: z.number().int().positive().optional(),
});

// Remind students who have NEVER logged in (last_seen_at IS NULL). Sends BOTH
// an in-app notification AND an email to each targeted student, scoped to the
// admin's chosen campus (or the coordinator's own campus). Notifications are
// written synchronously; emails are dispatched in the background so a large
// cohort doesn't block the HTTP response.
router.post(
  "/heatmap/remind-never-logged-in",
  requireAdminPage("/admin/heatmap", "edit"),
  async (req, res): Promise<void> => {
    if (!req.isAuthenticated()) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    const role = req.user.role;
    if (role !== "admin" && role !== "coordinator") {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
    const parsed = RemindNeverLoggedBody.safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }

    // Resolve campus scope — coordinators are locked to their own campus.
    let campusFilter: number | null = null;
    if (role === "coordinator") {
      const [me] = await db
        .select({ campusId: usersTable.campusId })
        .from(usersTable)
        .where(eq(usersTable.id, req.user.id))
        .limit(1);
      if (!me?.campusId) {
        res.status(403).json({ error: "Coordinator has no campus" });
        return;
      }
      campusFilter = me.campusId;
    } else if (parsed.data.campusId != null) {
      campusFilter = parsed.data.campusId;
    }

    const { notificationsEnabled, emailsEnabled } = await getReminderSettings();
    if (!notificationsEnabled && !emailsEnabled) {
      res.status(409).json({
        error:
          "Both in-app notifications and emails are disabled by admin in /admin/config. Enable at least one to send reminders.",
      });
      return;
    }

    // Target = students who have never been seen, within scope.
    const conditions = [
      eq(usersTable.role, "student" as const),
      isNull(usersTable.lastSeenAt),
    ];
    if (campusFilter != null) {
      conditions.push(eq(usersTable.campusId, campusFilter));
    }
    const targets = await db
      .select({
        id: usersTable.id,
        email: usersTable.email,
        firstName: usersTable.firstName,
      })
      .from(usersTable)
      .where(and(...conditions));

    if (targets.length === 0) {
      res.json({ ok: true, targeted: 0, notified: 0, emailQueued: 0 });
      return;
    }

    // In-app notifications — one batched insert.
    let notified = 0;
    if (notificationsEnabled) {
      await db.insert(notificationsTable).values(
        targets.map((s) => ({
          userId: s.id,
          title: "Log in to the BRAVE Dashboard",
          body: "You haven't logged in yet. Please log in to get started with the BRAVE programme and submit your weekly journal.",
          type: "reminder" as const,
          link: "/journal",
        })),
      );
      notified = targets.length;
    }

    // Emails — sent individually (never disclosing recipients to each other)
    // in the background, so a cohort of hundreds doesn't time out the request.
    const emailTargets = emailsEnabled
      ? targets.filter((s) => s.email && s.email.includes("@"))
      : [];
    if (emailTargets.length > 0) {
      const appUrl = getAppUrl();
      void (async () => {
        let emailed = 0;
        for (const s of emailTargets) {
          const ok = await sendEmail({ category: "heatmapNudges",
            to: { email: s.email, name: s.firstName || undefined },
            subject: "[BRAVE] Log in to your BRAVE Dashboard",
            text: `Hi ${s.firstName || "there"},\n\nWe noticed you haven't logged in to the BRAVE Dashboard yet. Please log in to get started with the programme and submit your weekly journal.\n\nLog in here: ${appUrl}\n\n— BRAVE Dashboard`,
          });
          if (ok) emailed += 1;
        }
        logger.info(
          { targeted: emailTargets.length, emailed, campusFilter },
          "[heatmap] never-logged-in email blast complete",
        );
      })().catch((err) =>
        logger.error({ err }, "[heatmap] never-logged-in email blast failed"),
      );
    }

    res.json({
      ok: true,
      targeted: targets.length,
      notified,
      emailQueued: emailTargets.length,
    });
  },
);

// =============================================================================
// GET /heatmap/analytics
//
// Programme funnel + engagement card data for the heatmap page.
// Admin: programme-wide (or scoped to ?campusId=). Coordinator: auto-scoped
// to their own campus.
//
// Funnel "students with >1 X" counts each student once, summing their
// contribution across all journals their team submitted (joining via
// team_members). DAU/WAU come from users.last_seen_at, bumped on every
// authenticated request (throttled to 5-min granularity).
//
// Five parallel queries — no N+1.
// =============================================================================
router.get("/heatmap/analytics", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const role = req.user.role;
  if (role !== "admin" && role !== "coordinator") {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  let campusFilter: number | null = null;
  if (role === "coordinator") {
    const [me] = await db
      .select({ campusId: usersTable.campusId })
      .from(usersTable)
      .where(eq(usersTable.id, req.user.id))
      .limit(1);
    if (!me?.campusId) {
      res.json({
        totals: {
          totalStudents: 0,
          loggedInEver: 0,
          studentsJoinedTeams: 0,
          uniqueJournalEntries: 0,
        },
        funnel: [
          { key: "registered_teams", label: "Registered teams", count: 0 },
          { key: "teams_logged_in", label: "Teams logged in", count: 0 },
          { key: "students_logged_in", label: "Students logged in", count: 0 },
          {
            key: "students_joined_teams",
            label: "Students joined teams",
            count: 0,
          },
          {
            key: "never_logged_in_students",
            label: "Never logged-in students",
            count: 0,
          },
          { key: "submitted_journal", label: "Submitted journal", count: 0 },
          { key: "visited_client", label: "Visited client", count: 0 },
          {
            key: "active_conversation",
            label: "Active conversation",
            count: 0,
          },
          { key: "started_project", label: "Projects started", count: 0 },
          { key: "closed_project", label: "Projects complete", count: 0 },
        ],
        engagement: { dau: 0, wau: 0, mau: 0 },
      });
      return;
    }
    campusFilter = me.campusId;
  } else if (req.query.campusId) {
    const cid = Number(req.query.campusId);
    if (!Number.isNaN(cid)) campusFilter = cid;
  }

  const campusClause =
    campusFilter != null ? sql`AND u.campus_id = ${campusFilter}` : sql``;
  const campusClauseTeams =
    campusFilter != null ? sql`AND t.campus_id = ${campusFilter}` : sql``;
  // Journal metrics below are per season — an archived season's journals must
  // not inflate the live season's engagement figures.
  const season = await resolveSeason(req);

  // Date-range filter for the programme funnel. Defaults to "today" (server
  // local) when no range is supplied. The "Registered teams" baseline ignores
  // this range; every other stage is scoped to activity within
  // [rangeStart, rangeEnd]. `from`/`to` accept date-only (YYYY-MM-DD, snapped
  // to start/end of that calendar day) or full ISO timestamps.
  const nowTs = new Date();
  const parseBoundary = (raw: unknown, endOfDay: boolean): Date | null => {
    if (typeof raw !== "string" || raw.trim() === "") return null;
    const s = raw.trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
      return new Date(`${s}T${endOfDay ? "23:59:59.999" : "00:00:00.000"}`);
    }
    const d = new Date(s);
    return Number.isNaN(d.getTime()) ? null : d;
  };
  // "All time" mode (?range=all) drops the date scoping entirely so every
  // stage counts activity since the beginning. Otherwise fall back to the
  // from/to bounds, defaulting to "today" when neither is supplied.
  const allTime = req.query.range === "all";
  let rangeStart = allTime ? new Date(0) : parseBoundary(req.query.from, false);
  let rangeEnd = allTime ? nowTs : parseBoundary(req.query.to, true);
  if (!rangeStart) {
    rangeStart = new Date(
      nowTs.getFullYear(),
      nowTs.getMonth(),
      nowTs.getDate(),
      0,
      0,
      0,
      0,
    );
  }
  if (!rangeEnd) rangeEnd = nowTs;

  // Counters: total students, ever-logged-in, unique journal entries.
  const countersP = db.execute<{
    total_students: string;
    logged_in_ever: string;
    students_joined_teams: string;
    unique_journals: string;
  }>(sql`
    SELECT
      (SELECT COUNT(*) FROM users u WHERE u.role = 'student' ${campusClause})                                      AS total_students,
      (SELECT COUNT(*) FROM users u WHERE u.role = 'student' AND u.last_seen_at IS NOT NULL ${campusClause})        AS logged_in_ever,
      (SELECT COUNT(*) FROM users u
         JOIN team_members tm ON tm.user_id = u.id
        WHERE u.role = 'student' ${campusClause})                                                                  AS students_joined_teams,
      (SELECT COUNT(*) FROM weekly_journals j
        ${
          campusFilter != null
            ? sql`JOIN teams t ON t.id = j.team_id
                   WHERE j.season_id = ${season} AND t.campus_id = ${campusFilter}`
            : sql`WHERE j.season_id = ${season}`
        })                                                                                                          AS unique_journals
  `);

  // Programme funnel — TRUE nested stages. Each stage requires the student to
  // satisfy that stage AND every prior stage, so the counts decrease
  // monotonically (a real conversion funnel, never a non-monotonic blip).
  // Team journal counters are summed per team, then attributed to each member
  // (one team per user). LEFT JOIN team_members so team-less students still
  // count as "registered" at the top of the funnel.
  const funnelP = db.execute<{
    registered_teams: string;
    teams_logged_in: string;
    students_logged_in: string;
    students_joined_teams: string;
    never_logged_in_students: string;
    submitted_journal: string;
    visited_client: string;
    active_conversation: string;
    started_project: string;
    closed_project: string;
  }>(sql`
    WITH range_journals AS (
      SELECT
        j.team_id,
        j.clients_visited,
        j.active_conversations,
        j.projects_started,
        j.projects_closed
      FROM weekly_journals j
      JOIN teams t ON t.id = j.team_id
      WHERE j.submitted_at >= ${rangeStart}
        AND j.submitted_at <= ${rangeEnd}
        AND j.season_id = ${season}
        ${campusClauseTeams}
    ),
    team_journal AS (
      SELECT
        team_id,
        BOOL_OR(TRUE)                      AS submitted,
        BOOL_OR(clients_visited >= 1)      AS visited,
        BOOL_OR(active_conversations >= 1) AS conversation,
        BOOL_OR(projects_started >= 1)     AS started,
        BOOL_OR(projects_closed >= 1)      AS closed
      FROM range_journals
      GROUP BY team_id
    )
    SELECT
      (SELECT COUNT(*) FROM teams t WHERE TRUE ${campusClauseTeams})                AS registered_teams,
      (SELECT COUNT(DISTINCT tm.team_id)
         FROM team_members tm
         JOIN users u ON u.id = tm.user_id
         JOIN teams t ON t.id = tm.team_id
        WHERE u.last_seen_at IS NOT NULL
          AND u.last_seen_at >= ${rangeStart}
          AND u.last_seen_at <= ${rangeEnd}
          ${campusClauseTeams})                                                    AS teams_logged_in,
      (SELECT COUNT(*)
         FROM users u
        WHERE u.role = 'student'
          AND u.last_seen_at IS NOT NULL
          AND u.last_seen_at >= ${rangeStart}
          AND u.last_seen_at <= ${rangeEnd}
          ${campusClause})                                                         AS students_logged_in,
      (SELECT COUNT(DISTINCT u.id)
         FROM users u
         JOIN team_members tm ON tm.user_id = u.id
        WHERE u.role = 'student'
          AND tm.joined_at >= ${rangeStart}
          AND tm.joined_at <= ${rangeEnd}
          ${campusClause})                                                         AS students_joined_teams,
      (SELECT COUNT(*)
         FROM users u
        WHERE u.role = 'student'
          AND u.last_seen_at IS NULL
          ${campusClause})                                                         AS never_logged_in_students,
      (SELECT COUNT(*) FROM team_journal WHERE submitted)    AS submitted_journal,
      (SELECT COUNT(*) FROM team_journal WHERE visited)      AS visited_client,
      (SELECT COUNT(*) FROM team_journal WHERE conversation) AS active_conversation,
      (SELECT COUNT(*) FROM team_journal WHERE started)      AS started_project,
      (SELECT COUNT(*) FROM team_journal WHERE closed)       AS closed_project
  `);

  // DAU / WAU based on last_seen_at, scoped to students.
  const now = new Date();
  const dauCutoff = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const wauCutoff = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const mauCutoff = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const engagementP = db.execute<{ dau: string; wau: string; mau: string }>(sql`
    SELECT
      COUNT(*) FILTER (WHERE u.last_seen_at >= ${dauCutoff}) AS dau,
      COUNT(*) FILTER (WHERE u.last_seen_at >= ${wauCutoff}) AS wau,
      COUNT(*) FILTER (WHERE u.last_seen_at >= ${mauCutoff}) AS mau
    FROM users u
    WHERE u.role = 'student' ${campusClause}
  `);

  const [counters, funnel, engagement] = await Promise.all([
    countersP,
    funnelP,
    engagementP,
  ]);

  const c = counters.rows[0];
  const f = funnel.rows[0];
  const e = engagement.rows[0];

  res.json({
    totals: {
      totalStudents: Number(c?.total_students ?? 0),
      loggedInEver: Number(c?.logged_in_ever ?? 0),
      studentsJoinedTeams: Number(c?.students_joined_teams ?? 0),
      uniqueJournalEntries: Number(c?.unique_journals ?? 0),
    },
    // Team-level programme funnel. "Registered teams" is the baseline (NOT
    // date-filtered); every other stage is scoped to the requested date range.
    // The single "Students logged in" row is a student-level count by design.
    // Stages are independent metrics (not strictly nested), so the frontend
    // renders count · % of top · step-to-step % directly from these counts.
    funnel: [
      {
        key: "registered_teams",
        label: "Registered teams",
        count: Number(f?.registered_teams ?? 0),
      },
      {
        key: "teams_logged_in",
        label: "Teams logged in",
        count: Number(f?.teams_logged_in ?? 0),
      },
      {
        key: "students_logged_in",
        label: "Students logged in",
        count: Number(f?.students_logged_in ?? 0),
      },
      {
        key: "students_joined_teams",
        label: "Students joined teams",
        count: Number(f?.students_joined_teams ?? 0),
      },
      {
        key: "never_logged_in_students",
        label: "Never logged-in students",
        count: Number(f?.never_logged_in_students ?? 0),
      },
      {
        key: "submitted_journal",
        label: "Submitted journal",
        count: Number(f?.submitted_journal ?? 0),
      },
      {
        key: "visited_client",
        label: "Visited client",
        count: Number(f?.visited_client ?? 0),
      },
      {
        key: "active_conversation",
        label: "Active conversation",
        count: Number(f?.active_conversation ?? 0),
      },
      {
        key: "started_project",
        label: "Projects started",
        count: Number(f?.started_project ?? 0),
      },
      {
        key: "closed_project",
        label: "Projects complete",
        count: Number(f?.closed_project ?? 0),
      },
    ],
    engagement: {
      dau: Number(e?.dau ?? 0),
      wau: Number(e?.wau ?? 0),
      mau: Number(e?.mau ?? 0),
    },
  });
});

// =============================================================================
// GET /heatmap/students?campusId?&q?&offset?&limit?
//
// Per-student funnel rows for the table beneath the analytics cards.
// Same scoping rules as /heatmap/analytics. Paginated (default 50, max 200).
// =============================================================================
router.get("/heatmap/students", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const role = req.user.role;
  if (role !== "admin" && role !== "coordinator") {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  let campusFilter: number | null = null;
  if (role === "coordinator") {
    const [me] = await db
      .select({ campusId: usersTable.campusId })
      .from(usersTable)
      .where(eq(usersTable.id, req.user.id))
      .limit(1);
    if (!me?.campusId) {
      res.json({ rows: [], total: 0 });
      return;
    }
    campusFilter = me.campusId;
  } else if (req.query.campusId) {
    const cid = Number(req.query.campusId);
    if (!Number.isNaN(cid)) campusFilter = cid;
  }

  const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 200);
  const offset = Math.max(Number(req.query.offset) || 0, 0);
  const rawQ = typeof req.query.q === "string" ? req.query.q.trim() : "";
  const qPattern = rawQ ? `%${rawQ.toLowerCase()}%` : null;

  const campusClause =
    campusFilter != null ? sql`AND u.campus_id = ${campusFilter}` : sql``;
  const season = await resolveSeason(req);
  const searchClause = qPattern
    ? sql`AND (LOWER(u.first_name) LIKE ${qPattern}
              OR LOWER(u.last_name) LIKE ${qPattern}
              OR LOWER(u.email) LIKE ${qPattern}
              OR LOWER(COALESCE(u.niat_id, '')) LIKE ${qPattern})`
    : sql``;

  const rowsP = db.execute<{
    user_id: string;
    first_name: string;
    last_name: string;
    email: string;
    niat_id: string | null;
    campus_id: number | null;
    campus_name: string | null;
    team_id: number | null;
    team_name: string | null;
    last_seen_at: string | null;
    clients: string;
    conversations: string;
    started: string;
    closed: string;
  }>(sql`
    WITH team_totals AS (
      SELECT
        j.team_id,
        SUM(j.clients_visited)      AS clients,
        SUM(j.active_conversations) AS conversations,
        SUM(j.projects_started)     AS started,
        SUM(j.projects_closed)      AS closed
      FROM weekly_journals j
      WHERE j.season_id = ${season}
      GROUP BY j.team_id
    )
    SELECT
      u.id                                   AS user_id,
      u.first_name,
      u.last_name,
      u.email,
      u.niat_id,
      u.campus_id,
      c.name                                 AS campus_name,
      tm.team_id                             AS team_id,
      t.name                                 AS team_name,
      u.last_seen_at,
      COALESCE(tt.clients, 0)       AS clients,
      COALESCE(tt.conversations, 0) AS conversations,
      COALESCE(tt.started, 0)       AS started,
      COALESCE(tt.closed, 0)        AS closed
    FROM users u
    LEFT JOIN team_members tm ON tm.user_id = u.id
    LEFT JOIN teams t         ON t.id = tm.team_id
    LEFT JOIN team_totals tt  ON tt.team_id = tm.team_id
    LEFT JOIN campuses c      ON c.id = u.campus_id
    WHERE u.role = 'student'
      ${campusClause}
      ${searchClause}
    ORDER BY (COALESCE(tt.closed, 0) + COALESCE(tt.started, 0)
              + COALESCE(tt.conversations, 0) + COALESCE(tt.clients, 0)) DESC,
             u.first_name ASC
    LIMIT ${limit} OFFSET ${offset}
  `);

  const countP = db.execute<{ total: string }>(sql`
    SELECT COUNT(*) AS total
    FROM users u
    WHERE u.role = 'student'
      ${campusClause}
      ${searchClause}
  `);

  const [rowsResult, countResult] = await Promise.all([rowsP, countP]);

  res.json({
    total: Number(countResult.rows[0]?.total ?? 0),
    rows: rowsResult.rows.map((r) => ({
      userId: r.user_id,
      firstName: r.first_name,
      lastName: r.last_name,
      email: r.email,
      niatId: r.niat_id,
      campusId: r.campus_id,
      campusName: r.campus_name,
      teamId: r.team_id,
      teamName: r.team_name,
      lastSeenAt: r.last_seen_at,
      clientsVisited: Number(r.clients),
      activeConversations: Number(r.conversations),
      projectsStarted: Number(r.started),
      projectsClosed: Number(r.closed),
    })),
  });
});

export default router;
