import { Router, type IRouter } from "express";
import { eq, and, gte, asc, sql } from "drizzle-orm";
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

const router: IRouter = Router();

function daysBetween(a: Date, b: Date): number {
  return Math.floor((b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24));
}

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
    .where(gte(weeklyJournalsTable.submittedAt, earliest));

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
router.post("/heatmap/remind", async (req, res): Promise<void> => {
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
});

const RemindBulkBody = z.object({
  teamIds: z.array(z.number().int().positive()).min(1).max(2000),
});

// Bulk reminder — send the same in-app notification to every team in the
// list. Used by the heatmap's "Send reminder to N teams" button when
// admin/coordinator filters the table and wants to ping the filtered set.
router.post("/heatmap/remind-bulk", async (req, res): Promise<void> => {
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

  const { notificationsEnabled } = await getReminderSettings();
  if (!notificationsEnabled) {
    res.status(409).json({
      error:
        "In-app notifications are disabled by admin in /admin/config. Enable the toggle to send reminders.",
    });
    return;
  }

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

  let sentToTeams = 0;
  let sentToUsers = 0;
  for (const team of allowed) {
    const members = await db
      .select({ userId: teamMembersTable.userId })
      .from(teamMembersTable)
      .where(eq(teamMembersTable.teamId, team.id));
    if (members.length === 0) continue;

    for (const m of members) {
      await db.insert(notificationsTable).values({
        userId: m.userId,
        title: "Update needed",
        body: `Your coordinator has flagged ${team.name} as needing an update. Please submit your weekly journal.`,
        type: "reminder",
        link: "/journal",
      });
      await db.insert(reminderLogTable).values({
        teamId: team.id,
        userId: m.userId,
        reminderType: "silence_7d",
        channel: "notification",
      });
      sentToUsers += 1;
    }
    sentToTeams += 1;
  }

  res.json({
    ok: true,
    sentToTeams,
    sentToUsers,
    skippedTeams: parsed.data.teamIds.length - sentToTeams,
  });
});

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
          uniqueJournalEntries: 0,
        },
        funnel: [
          { key: "registered", label: "Registered students", count: 0 },
          { key: "logged_in", label: "Logged in", count: 0 },
          { key: "journal", label: "Submitted a journal", count: 0 },
          { key: "client", label: "Visited a client", count: 0 },
          { key: "conversation", label: "Active conversation", count: 0 },
          { key: "started", label: "Started a project", count: 0 },
          { key: "closed", label: "Closed a project", count: 0 },
        ],
        engagement: { dau: 0, wau: 0 },
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

  // Counters: total students, ever-logged-in, unique journal entries.
  const countersP = db.execute<{
    total_students: string;
    logged_in_ever: string;
    unique_journals: string;
  }>(sql`
    SELECT
      (SELECT COUNT(*) FROM users u WHERE u.role = 'student' ${campusClause})                                      AS total_students,
      (SELECT COUNT(*) FROM users u WHERE u.role = 'student' AND u.last_seen_at IS NOT NULL ${campusClause})        AS logged_in_ever,
      (SELECT COUNT(*) FROM weekly_journals j
        ${
          campusFilter != null
            ? sql`JOIN teams t ON t.id = j.team_id WHERE t.campus_id = ${campusFilter}`
            : sql``
        })                                                                                                          AS unique_journals
  `);

  // Programme funnel — TRUE nested stages. Each stage requires the student to
  // satisfy that stage AND every prior stage, so the counts decrease
  // monotonically (a real conversion funnel, never a non-monotonic blip).
  // Team journal counters are summed per team, then attributed to each member
  // (one team per user). LEFT JOIN team_members so team-less students still
  // count as "registered" at the top of the funnel.
  const funnelP = db.execute<{
    registered: string;
    logged_in: string;
    submitted_journal: string;
    visited_client: string;
    active_conversation: string;
    started_project: string;
    closed_project: string;
  }>(sql`
    WITH team_totals AS (
      SELECT
        j.team_id,
        COUNT(*)                    AS journals,
        SUM(j.clients_visited)      AS clients,
        SUM(j.active_conversations) AS conversations,
        SUM(j.projects_started)     AS started,
        SUM(j.projects_closed)      AS closed
      FROM weekly_journals j
      GROUP BY j.team_id
    ),
    student_totals AS (
      SELECT
        u.id AS user_id,
        (u.last_seen_at IS NOT NULL)        AS logged_in,
        COALESCE(SUM(tt.journals), 0)       AS journals,
        COALESCE(SUM(tt.clients), 0)        AS clients,
        COALESCE(SUM(tt.conversations), 0)  AS conversations,
        COALESCE(SUM(tt.started), 0)        AS started,
        COALESCE(SUM(tt.closed), 0)         AS closed
      FROM users u
      LEFT JOIN team_members tm ON tm.user_id = u.id
      LEFT JOIN team_totals tt ON tt.team_id = tm.team_id
      WHERE u.role = 'student' ${campusClause}
      GROUP BY u.id, u.last_seen_at
    ),
    staged AS (
      SELECT
        logged_in,
        (logged_in AND journals >= 1)                                                                          AS s_journal,
        (logged_in AND journals >= 1 AND clients >= 1)                                                         AS s_client,
        (logged_in AND journals >= 1 AND clients >= 1 AND conversations >= 1)                                  AS s_conversation,
        (logged_in AND journals >= 1 AND clients >= 1 AND conversations >= 1 AND started >= 1)                 AS s_started,
        (logged_in AND journals >= 1 AND clients >= 1 AND conversations >= 1 AND started >= 1 AND closed >= 1) AS s_closed
      FROM student_totals
    )
    SELECT
      COUNT(*)                               AS registered,
      COUNT(*) FILTER (WHERE logged_in)      AS logged_in,
      COUNT(*) FILTER (WHERE s_journal)      AS submitted_journal,
      COUNT(*) FILTER (WHERE s_client)       AS visited_client,
      COUNT(*) FILTER (WHERE s_conversation) AS active_conversation,
      COUNT(*) FILTER (WHERE s_started)      AS started_project,
      COUNT(*) FILTER (WHERE s_closed)       AS closed_project
    FROM staged
  `);

  // DAU / WAU based on last_seen_at, scoped to students.
  const now = new Date();
  const dauCutoff = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const wauCutoff = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const engagementP = db.execute<{ dau: string; wau: string }>(sql`
    SELECT
      COUNT(*) FILTER (WHERE u.last_seen_at >= ${dauCutoff}) AS dau,
      COUNT(*) FILTER (WHERE u.last_seen_at >= ${wauCutoff}) AS wau
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
      uniqueJournalEntries: Number(c?.unique_journals ?? 0),
    },
    // Ordered top→bottom. Each stage is a strict subset of the one above,
    // so counts are monotonically non-increasing — the frontend renders this
    // directly as a tapering funnel with step-to-step conversion.
    funnel: [
      {
        key: "registered",
        label: "Registered students",
        count: Number(f?.registered ?? 0),
      },
      {
        key: "logged_in",
        label: "Logged in",
        count: Number(f?.logged_in ?? 0),
      },
      {
        key: "journal",
        label: "Submitted a journal",
        count: Number(f?.submitted_journal ?? 0),
      },
      {
        key: "client",
        label: "Visited a client",
        count: Number(f?.visited_client ?? 0),
      },
      {
        key: "conversation",
        label: "Active conversation",
        count: Number(f?.active_conversation ?? 0),
      },
      {
        key: "started",
        label: "Started a project",
        count: Number(f?.started_project ?? 0),
      },
      {
        key: "closed",
        label: "Closed a project",
        count: Number(f?.closed_project ?? 0),
      },
    ],
    engagement: {
      dau: Number(e?.dau ?? 0),
      wau: Number(e?.wau ?? 0),
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
