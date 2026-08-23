import { Router, type IRouter } from "express";
import { eq, and, desc, sql, gte, asc, inArray } from "drizzle-orm";
import {
  db,
  weeklyJournalsTable,
  teamMembersTable,
  teamsTable,
  usersTable,
  campusesTable,
  programmeWeeksTable,
  auditLogTable,
  notificationsTable,
} from "@workspace/db";
import { z } from "zod/v4";
import { getAllowPastWeekEdits } from "./programme-weeks";
import {
  scheduleJournalAnalysis,
  runJournalAnalysisNow,
} from "../lib/ai/journal-scheduler";
import { requireAdminPage } from "../lib/require-admin-page";
import { isSeasonWritable, resolveSeason } from "../lib/season";
import { requireWritableSeason } from "../middlewares/seasonGuard";

const router: IRouter = Router();

const counterField = z.number().int().min(0).max(100000).optional();

// Optional images attached to a journal entry (object-storage URLs). Bounded so
// a journal can't carry an unreasonable number of attachments.
const imagesField = z.array(z.string().url().max(2000)).max(10).optional();

const SubmitJournalBody = z.object({
  weekId: z.number().int().positive().optional(),
  whatWeDid: z.string().min(5).max(2000),
  blockers: z.string().max(2000).optional(),
  nextWeekPlan: z.string().max(2000).optional(),
  clientsVisited: counterField,
  activeConversations: counterField,
  projectsStarted: counterField,
  projectsClosed: counterField,
  images: imagesField,
});

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

// Pick the "current" programme week: the open week whose date range contains
// today. If none contains today, fall back to the most recent open week.
// `seasonId` is REQUIRED, deliberately. Week numbers repeat across seasons and
// an archived season can still hold an open week, so an unscoped lookup could
// hand a Season 1 week to a Season 2 journal.
async function getCurrentOpenWeek(seasonId: number): Promise<{
  id: number;
  weekNumber: number;
  startDate: string;
  endDate: string;
  seasonId: number;
} | null> {
  const today = todayIso();
  const open = await db
    .select({
      id: programmeWeeksTable.id,
      weekNumber: programmeWeeksTable.weekNumber,
      startDate: programmeWeeksTable.startDate,
      endDate: programmeWeeksTable.endDate,
      seasonId: programmeWeeksTable.seasonId,
    })
    .from(programmeWeeksTable)
    .where(
      and(
        eq(programmeWeeksTable.seasonId, seasonId),
        eq(programmeWeeksTable.isOpen, true),
      ),
    )
    .orderBy(asc(programmeWeeksTable.weekNumber));
  if (open.length === 0) return null;
  const containsToday =
    open.find((w) => w.startDate <= today && today <= w.endDate) ?? null;
  if (containsToday) return containsToday;
  return open[open.length - 1] ?? null;
}

// Looked up by primary key, so it is inherently unambiguous across seasons.
// `seasonId` is surfaced so callers can stamp the journal they create with the
// season the week actually belongs to.
async function getOpenWeekById(weekId: number): Promise<{
  id: number;
  weekNumber: number;
  startDate: string;
  endDate: string;
  isOpen: boolean;
  seasonId: number;
} | null> {
  const [w] = await db
    .select()
    .from(programmeWeeksTable)
    .where(eq(programmeWeeksTable.id, weekId))
    .limit(1);
  return w ?? null;
}

async function getMyTeamId(userId: string): Promise<number | null> {
  const [membership] = await db
    .select({ teamId: teamMembersTable.teamId })
    .from(teamMembersTable)
    .where(eq(teamMembersTable.userId, userId))
    .limit(1);
  return membership?.teamId ?? null;
}

// Student dashboard widget data: current open-week journal status + streak
// (consecutive prior programme weeks where the team submitted).
router.get("/progress-summary", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const teamId = await getMyTeamId(req.user.id);
  const currentWeek = await getCurrentOpenWeek(await resolveSeason(req));

  // Stable fallback shape when there's no team or no programme weeks yet.
  const fallbackWeek = {
    weekId: currentWeek?.id ?? null,
    weekNumber: currentWeek?.weekNumber ?? null,
    weekStart: currentWeek?.startDate ?? todayIso(),
    weekEnd: currentWeek?.endDate ?? todayIso(),
    submittedThisWeek: false,
    lastJournalAt: null as string | null,
    lastJournalWeekStart: null as string | null,
  };

  if (teamId == null) {
    res.json({
      teamId: null,
      streak: 0,
      totalJournals: 0,
      lastJournalAt: null,
      journal: fallbackWeek,
    });
    return;
  }

  const allJournals = await db
    .select({
      weekStartDate: weeklyJournalsTable.weekStartDate,
      submittedAt: weeklyJournalsTable.submittedAt,
    })
    .from(weeklyJournalsTable)
    .where(
      and(
        eq(weeklyJournalsTable.teamId, teamId),
        eq(weeklyJournalsTable.seasonId, await resolveSeason(req)),
      ),
    )
    .orderBy(desc(weeklyJournalsTable.weekStartDate));

  const submittedWeekStarts = new Set(allJournals.map((j) => j.weekStartDate));
  const submittedThisWeek = currentWeek
    ? submittedWeekStarts.has(currentWeek.startDate)
    : false;
  const latest = allJournals[0] ?? null;

  // Journal streak — walk backwards through programme_weeks (week_number
  // descending starting from current), counting consecutive submitted weeks.
  let streak = 0;
  if (currentWeek) {
    const allWeeks = await db
      .select({
        weekNumber: programmeWeeksTable.weekNumber,
        startDate: programmeWeeksTable.startDate,
      })
      .from(programmeWeeksTable)
      // Same season as the current week, so a streak never spans seasons.
      .where(eq(programmeWeeksTable.seasonId, currentWeek.seasonId))
      .orderBy(desc(programmeWeeksTable.weekNumber));
    let startIdx = allWeeks.findIndex(
      (w) => w.weekNumber === currentWeek.weekNumber,
    );
    if (startIdx < 0) startIdx = 0;
    // If current week wasn't submitted, anchor the streak at the prior week.
    if (!submittedThisWeek) startIdx += 1;
    for (let i = startIdx; i < allWeeks.length; i++) {
      if (submittedWeekStarts.has(allWeeks[i].startDate)) streak += 1;
      else break;
    }
  }

  res.json({
    teamId,
    streak,
    totalJournals: allJournals.length,
    lastJournalAt: latest?.submittedAt ?? null,
    journal: {
      ...fallbackWeek,
      submittedThisWeek,
      lastJournalAt: latest?.submittedAt ?? null,
      lastJournalWeekStart: latest?.weekStartDate ?? null,
    },
  });
});

// Student: fetch the current open week's journal status for their team.
router.get("/journals/current-week", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const teamId = await getMyTeamId(req.user.id);
  if (!teamId) {
    res.status(400).json({ error: "You are not on a team" });
    return;
  }
  const currentWeek = await getCurrentOpenWeek(await resolveSeason(req));
  if (!currentWeek) {
    res.json({
      weekId: null,
      weekNumber: null,
      weekStartDate: null,
      weekEndDate: null,
      submitted: false,
      journal: null,
    });
    return;
  }
  const [journal] = await db
    .select()
    .from(weeklyJournalsTable)
    .where(
      and(
        eq(weeklyJournalsTable.teamId, teamId),
        eq(weeklyJournalsTable.weekStartDate, currentWeek.startDate),
      ),
    )
    .limit(1);
  res.json({
    weekId: currentWeek.id,
    weekNumber: currentWeek.weekNumber,
    weekStartDate: currentWeek.startDate,
    weekEndDate: currentWeek.endDate,
    submitted: !!journal,
    journal: journal ?? null,
  });
});

// Student: fetch existing journal for a specific open week (for editing).
router.get("/journals/by-week/:weekId", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const teamId = await getMyTeamId(req.user.id);
  if (!teamId) {
    res.status(400).json({ error: "You are not on a team" });
    return;
  }
  const weekId = Number(req.params.weekId);
  if (!Number.isFinite(weekId)) {
    res.status(400).json({ error: "Invalid weekId" });
    return;
  }
  // DELIBERATELY UNSCOPED, and safe: the week row itself carries a season, and
  // weekly_journals has unique(team_id, week_start_date), so team + that week's
  // start date identifies exactly one journal. Adding a season predicate here
  // would be redundant, not safer.
  const week = await getOpenWeekById(weekId);
  if (!week) {
    res.status(404).json({ error: "Week not found" });
    return;
  }
  const [journal] = await db
    .select()
    .from(weeklyJournalsTable)
    .where(
      and(
        eq(weeklyJournalsTable.teamId, teamId),
        eq(weeklyJournalsTable.weekStartDate, week.startDate),
      ),
    )
    .limit(1);
  res.json({
    weekId: week.id,
    weekNumber: week.weekNumber,
    weekStartDate: week.startDate,
    weekEndDate: week.endDate,
    isOpen: week.isOpen,
    submitted: !!journal,
    journal: journal ?? null,
  });
});

// Student: list this team's past journals.
router.get("/journals/mine", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const teamId = await getMyTeamId(req.user.id);
  if (!teamId) {
    res.json([]);
    return;
  }
  const rows = await db
    .select()
    .from(weeklyJournalsTable)
    .where(
      and(
        eq(weeklyJournalsTable.teamId, teamId),
        eq(weeklyJournalsTable.seasonId, await resolveSeason(req)),
      ),
    )
    .orderBy(desc(weeklyJournalsTable.weekStartDate));
  res.json(rows);
});

// Student: week-by-week completion tracker for the dashboard. Returns EVERY
// programme week (not just open ones) with whether this team submitted, plus
// which week is current — so the dashboard can render Week 1 → N circles.
router.get("/journals/week-tracker", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const teamId = await getMyTeamId(req.user.id);
  const weeks = await db
    .select({
      id: programmeWeeksTable.id,
      weekNumber: programmeWeeksTable.weekNumber,
      startDate: programmeWeeksTable.startDate,
      endDate: programmeWeeksTable.endDate,
      isOpen: programmeWeeksTable.isOpen,
    })
    .from(programmeWeeksTable)
    .where(eq(programmeWeeksTable.seasonId, await resolveSeason(req)))
    .orderBy(asc(programmeWeeksTable.weekNumber));

  const submitted = new Set<string>();
  if (teamId) {
    const rows = await db
      .select({ weekStartDate: weeklyJournalsTable.weekStartDate })
      .from(weeklyJournalsTable)
      .where(eq(weeklyJournalsTable.teamId, teamId));
    for (const r of rows) submitted.add(r.weekStartDate);
  }

  const current = await getCurrentOpenWeek(await resolveSeason(req));
  const items = weeks.map((w) => ({
    weekId: w.id,
    weekNumber: w.weekNumber,
    startDate: w.startDate,
    endDate: w.endDate,
    isOpen: w.isOpen,
    isCurrent: current?.id === w.id,
    submitted: submitted.has(w.startDate),
  }));
  res.json({ currentWeekId: current?.id ?? null, weeks: items });
});

// Student (any team member): submit / upsert a journal for the team.
// Body may include `weekId` to target a specific open week. If omitted,
// defaults to the current open week.
router.post("/journals", requireWritableSeason("journal"), async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const teamId = await getMyTeamId(req.user.id);
  if (!teamId) {
    res.status(400).json({ error: "You are not on a team" });
    return;
  }
  const parsed = SubmitJournalBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  // Resolve target week — explicit weekId takes priority, otherwise current open week.
  let targetWeek: {
    id: number;
    weekNumber: number;
    startDate: string;
    endDate: string;
    isOpen: boolean;
    seasonId: number;
  } | null = null;
  if (parsed.data.weekId) {
    targetWeek = await getOpenWeekById(parsed.data.weekId);
    if (!targetWeek) {
      res.status(404).json({ error: "Week not found" });
      return;
    }
    if (!targetWeek.isOpen) {
      res.status(403).json({ error: "This week is closed for submissions" });
      return;
    }
  } else {
    const cur = await getCurrentOpenWeek(await resolveSeason(req));
    if (!cur) {
      res.status(400).json({
        error:
          "No open programme weeks. Ask an admin to open the current week.",
      });
      return;
    }
    targetWeek = { ...cur, isOpen: true };
  }

  // Upsert: one journal per (team, week). Uses the unique constraint we
  // added in the schema.
  const [created] = await db
    .insert(weeklyJournalsTable)
    .values({
      teamId,
      // The journal belongs to the season its WEEK belongs to.
      seasonId: targetWeek.seasonId,
      weekStartDate: targetWeek.startDate,
      weekEndDate: targetWeek.endDate,
      whatWeDid: parsed.data.whatWeDid,
      blockers: parsed.data.blockers ?? null,
      nextWeekPlan: parsed.data.nextWeekPlan ?? null,
      clientsVisited: parsed.data.clientsVisited ?? 0,
      activeConversations: parsed.data.activeConversations ?? 0,
      projectsStarted: parsed.data.projectsStarted ?? 0,
      projectsClosed: parsed.data.projectsClosed ?? 0,
      submittedBy: req.user.id,
      submittedByRole: req.user.role,
      images: parsed.data.images ?? null,
    })
    .onConflictDoUpdate({
      target: [weeklyJournalsTable.teamId, weeklyJournalsTable.weekStartDate],
      set: {
        whatWeDid: parsed.data.whatWeDid,
        blockers: parsed.data.blockers ?? null,
        nextWeekPlan: parsed.data.nextWeekPlan ?? null,
        clientsVisited: parsed.data.clientsVisited ?? 0,
        activeConversations: parsed.data.activeConversations ?? 0,
        projectsStarted: parsed.data.projectsStarted ?? 0,
        projectsClosed: parsed.data.projectsClosed ?? 0,
        submittedBy: req.user.id,
        submittedByRole: req.user.role,
        submittedAt: new Date(),
        images: parsed.data.images ?? null,
      },
    })
    .returning();
  // Fire-and-forget AI analysis of the submitted/updated journal (one merged
  // Gemini call covers both the analysis and the reel scan). Re-submitting
  // re-schedules so the analysis reflects the latest content. Never blocks the
  // response; no-ops without a Gemini key.
  if (created) {
    scheduleJournalAnalysis(created.id);
  }
  res.status(201).json(created);
});

// ── Coordinator journal management (fill on behalf + tracking) ─────────────

// Resolve the campus a coordinator/admin is acting on. Coordinators are pinned
// to their own campus; admins may pass ?campusId=. Returns null when an admin
// passes no campus (caller treats as "all campuses").
function resolveActingCampusId(
  req: import("express").Request,
  queryCampusId?: number,
): number | null {
  if (req.user?.role === "coordinator") return req.user.campusId ?? -1;
  return queryCampusId ?? null;
}

// GET /coordinator/journal-tracking?weekId=&campusId=
// Per-team submitted/not-submitted status for one programme week. Used by the
// coordinator "Journals Tracking" page (and bulk/broadcast target lists).
router.get("/coordinator/journal-tracking", async (req, res): Promise<void> => {
  if (
    !req.isAuthenticated() ||
    (req.user.role !== "coordinator" && req.user.role !== "admin")
  ) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  const weekIdRaw = req.query.weekId ? Number(req.query.weekId) : null;
  const campusIdRaw = req.query.campusId
    ? Number(req.query.campusId)
    : undefined;
  const campusId = resolveActingCampusId(req, campusIdRaw);

  const week =
    weekIdRaw && Number.isFinite(weekIdRaw)
      ? await getOpenWeekById(weekIdRaw)
      : await getCurrentOpenWeek(await resolveSeason(req));
  if (!week) {
    res.json({ week: null, teams: [] });
    return;
  }

  const teamConds = [eq(teamsTable.status, "active")];
  if (campusId != null) teamConds.push(eq(teamsTable.campusId, campusId));
  const teams = await db
    .select({
      teamId: teamsTable.id,
      teamName: teamsTable.name,
      campusId: teamsTable.campusId,
    })
    .from(teamsTable)
    .where(and(...teamConds))
    .orderBy(asc(teamsTable.name));

  const journals = await db
    .select({
      teamId: weeklyJournalsTable.teamId,
      id: weeklyJournalsTable.id,
      submittedByRole: weeklyJournalsTable.submittedByRole,
      submittedAt: weeklyJournalsTable.submittedAt,
    })
    .from(weeklyJournalsTable)
    .where(
      and(
        eq(weeklyJournalsTable.seasonId, week.seasonId),
        eq(weeklyJournalsTable.weekStartDate, week.startDate),
      ),
    );
  const byTeam = new Map(journals.map((j) => [j.teamId, j]));

  const rows = teams.map((t) => {
    const j = byTeam.get(t.teamId);
    return {
      teamId: t.teamId,
      teamName: t.teamName,
      campusId: t.campusId,
      submitted: !!j,
      journalId: j?.id ?? null,
      submittedByRole: j?.submittedByRole ?? null,
      submittedAt: j?.submittedAt ?? null,
    };
  });
  res.json({
    week: {
      weekId: week.id,
      weekNumber: week.weekNumber,
      startDate: week.startDate,
      endDate: week.endDate,
    },
    teams: rows,
    submittedCount: rows.filter((r) => r.submitted).length,
    totalTeams: rows.length,
  });
});

// POST /coordinator/journals — coordinator/admin fills a journal on behalf of
// a team. Accepts an explicit `teamId`. Coordinators may only act on teams in
// their own campus. Stamps submittedByRole = the actor's role.
const CoordinatorJournalBody = z.object({
  teamId: z.number().int().positive(),
  weekId: z.number().int().positive().optional(),
  whatWeDid: z.string().min(1).max(2000),
  blockers: z.string().max(2000).optional(),
  nextWeekPlan: z.string().max(2000).optional(),
  clientsVisited: counterField,
  activeConversations: counterField,
  projectsStarted: counterField,
  projectsClosed: counterField,
});

router.post("/coordinator/journals", async (req, res): Promise<void> => {
  if (
    !req.isAuthenticated() ||
    (req.user.role !== "coordinator" && req.user.role !== "admin")
  ) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  const parsed = CoordinatorJournalBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { teamId } = parsed.data;

  const [team] = await db
    .select({ id: teamsTable.id, campusId: teamsTable.campusId })
    .from(teamsTable)
    .where(eq(teamsTable.id, teamId));
  if (!team) {
    res.status(404).json({ error: "Team not found" });
    return;
  }
  if (req.user.role === "coordinator" && team.campusId !== req.user.campusId) {
    res.status(403).json({ error: "This team is not in your campus." });
    return;
  }

  const week = parsed.data.weekId
    ? await getOpenWeekById(parsed.data.weekId)
    : await getCurrentOpenWeek(await resolveSeason(req));
  if (!week) {
    res.status(400).json({ error: "No programme week to file against." });
    return;
  }

  const [created] = await db
    .insert(weeklyJournalsTable)
    .values({
      teamId,
      seasonId: week.seasonId,
      weekStartDate: week.startDate,
      weekEndDate: week.endDate,
      whatWeDid: parsed.data.whatWeDid,
      blockers: parsed.data.blockers ?? null,
      nextWeekPlan: parsed.data.nextWeekPlan ?? null,
      clientsVisited: parsed.data.clientsVisited ?? 0,
      activeConversations: parsed.data.activeConversations ?? 0,
      projectsStarted: parsed.data.projectsStarted ?? 0,
      projectsClosed: parsed.data.projectsClosed ?? 0,
      submittedBy: req.user.id,
      submittedByRole: req.user.role,
    })
    .onConflictDoUpdate({
      target: [weeklyJournalsTable.teamId, weeklyJournalsTable.weekStartDate],
      set: {
        whatWeDid: parsed.data.whatWeDid,
        blockers: parsed.data.blockers ?? null,
        nextWeekPlan: parsed.data.nextWeekPlan ?? null,
        clientsVisited: parsed.data.clientsVisited ?? 0,
        activeConversations: parsed.data.activeConversations ?? 0,
        projectsStarted: parsed.data.projectsStarted ?? 0,
        projectsClosed: parsed.data.projectsClosed ?? 0,
        submittedBy: req.user.id,
        submittedByRole: req.user.role,
        submittedAt: new Date(),
      },
    })
    .returning();
  if (created) {
    scheduleJournalAnalysis(created.id);
  }
  res.status(201).json(created);
});

// Filter a requested set of team ids down to those the actor may act on:
// admins → all requested; coordinators → only teams in their own campus.
async function scopeTeamIdsForActor(
  req: import("express").Request,
  teamIds: number[],
): Promise<number[]> {
  if (teamIds.length === 0) return [];
  const rows = await db
    .select({ id: teamsTable.id, campusId: teamsTable.campusId })
    .from(teamsTable)
    .where(inArray(teamsTable.id, teamIds));
  if (req.user?.role === "coordinator") {
    const campusId = req.user.campusId ?? -1;
    return rows.filter((r) => r.campusId === campusId).map((r) => r.id);
  }
  return rows.map((r) => r.id);
}

// POST /coordinator/journals/bulk — file ONE common journal update across many
// teams at once (exams / events / holidays). Upserts the same content for each
// allowed team for the target week.
const BulkJournalBody = z.object({
  teamIds: z.array(z.number().int().positive()).min(1).max(2000),
  weekId: z.number().int().positive().optional(),
  whatWeDid: z.string().min(1).max(2000),
  blockers: z.string().max(2000).optional(),
  nextWeekPlan: z.string().max(2000).optional(),
});

router.post("/coordinator/journals/bulk", async (req, res): Promise<void> => {
  if (
    !req.isAuthenticated() ||
    (req.user.role !== "coordinator" && req.user.role !== "admin")
  ) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  const parsed = BulkJournalBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const allowed = await scopeTeamIdsForActor(
    req,
    Array.from(new Set(parsed.data.teamIds)),
  );
  if (allowed.length === 0) {
    res.status(400).json({ error: "No teams you can update were selected." });
    return;
  }
  const week = parsed.data.weekId
    ? await getOpenWeekById(parsed.data.weekId)
    : await getCurrentOpenWeek(await resolveSeason(req));
  if (!week) {
    res.status(400).json({ error: "No programme week to file against." });
    return;
  }

  const values = allowed.map((teamId) => ({
    teamId,
    seasonId: week.seasonId,
    weekStartDate: week.startDate,
    weekEndDate: week.endDate,
    whatWeDid: parsed.data.whatWeDid,
    blockers: parsed.data.blockers ?? null,
    nextWeekPlan: parsed.data.nextWeekPlan ?? null,
    submittedBy: req.user.id,
    submittedByRole: req.user.role,
  }));
  const inserted = await db
    .insert(weeklyJournalsTable)
    .values(values)
    .onConflictDoUpdate({
      target: [weeklyJournalsTable.teamId, weeklyJournalsTable.weekStartDate],
      set: {
        whatWeDid: parsed.data.whatWeDid,
        blockers: parsed.data.blockers ?? null,
        nextWeekPlan: parsed.data.nextWeekPlan ?? null,
        submittedBy: req.user.id,
        submittedByRole: req.user.role,
        submittedAt: new Date(),
      },
    })
    .returning({ id: weeklyJournalsTable.id });
  for (const row of inserted) {
    scheduleJournalAnalysis(row.id);
  }
  res.json({ ok: true, filled: inserted.length });
});

// POST /coordinator/broadcast — send a common in-app message to the members of
// many teams at once (journal reminder / revenue push / event / exam notice).
const BroadcastBody = z.object({
  teamIds: z.array(z.number().int().positive()).min(1).max(2000),
  title: z.string().min(1).max(160),
  message: z.string().min(1).max(2000),
});

router.post("/coordinator/broadcast", async (req, res): Promise<void> => {
  if (
    !req.isAuthenticated() ||
    (req.user.role !== "coordinator" && req.user.role !== "admin")
  ) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  const parsed = BroadcastBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const allowed = await scopeTeamIdsForActor(
    req,
    Array.from(new Set(parsed.data.teamIds)),
  );
  if (allowed.length === 0) {
    res.status(400).json({ error: "No teams you can message were selected." });
    return;
  }
  const members = await db
    .select({
      userId: teamMembersTable.userId,
      teamId: teamMembersTable.teamId,
    })
    .from(teamMembersTable)
    .where(inArray(teamMembersTable.teamId, allowed));
  if (members.length === 0) {
    res.json({ ok: true, notifiedUsers: 0, notifiedTeams: 0 });
    return;
  }
  const rows = members.map((m) => ({
    userId: m.userId,
    title: parsed.data.title,
    body: parsed.data.message,
    type: "announcement",
    link: "/journal",
  }));
  // Chunked inserts to stay under the bound-parameter limit on large campuses.
  for (let i = 0; i < rows.length; i += 500) {
    await db.insert(notificationsTable).values(rows.slice(i, i + 500));
  }
  res.json({
    ok: true,
    notifiedUsers: members.length,
    notifiedTeams: new Set(members.map((m) => m.teamId)).size,
  });
});

// Coordinator/admin: list all journals (coordinators scoped to their campus).
router.get("/admin/journals", async (req, res): Promise<void> => {
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
      res.json([]);
      return;
    }
    campusFilter = me.campusId;
  } else if (req.query.campusId) {
    const cid = Number(req.query.campusId);
    if (!Number.isNaN(cid)) campusFilter = cid;
  }

  // Scoped to the season being viewed. Without this the admin dashboard showed
  // Season 1's journals under the 2.0 badge, with no way to tell them apart.
  const season = await resolveSeason(req);
  const conditions = [eq(weeklyJournalsTable.seasonId, season)];
  if (campusFilter != null) {
    conditions.push(eq(teamsTable.campusId, campusFilter));
  }

  const rows = await db
    .select({
      id: weeklyJournalsTable.id,
      teamId: weeklyJournalsTable.teamId,
      weekStartDate: weeklyJournalsTable.weekStartDate,
      weekEndDate: weeklyJournalsTable.weekEndDate,
      whatWeDid: weeklyJournalsTable.whatWeDid,
      blockers: weeklyJournalsTable.blockers,
      nextWeekPlan: weeklyJournalsTable.nextWeekPlan,
      clientsVisited: weeklyJournalsTable.clientsVisited,
      activeConversations: weeklyJournalsTable.activeConversations,
      projectsStarted: weeklyJournalsTable.projectsStarted,
      projectsClosed: weeklyJournalsTable.projectsClosed,
      submittedBy: weeklyJournalsTable.submittedBy,
      submittedByRole: weeklyJournalsTable.submittedByRole,
      submittedAt: weeklyJournalsTable.submittedAt,
      // AI journal analysis (additive — null until analysed).
      aiAnalysis: weeklyJournalsTable.aiAnalysis,
      aiAnalysedAt: weeklyJournalsTable.aiAnalysedAt,
      blockerPriority: weeklyJournalsTable.blockerPriority,
      blockerPriorityManual: weeklyJournalsTable.blockerPriorityManual,
      blockerStatus: weeklyJournalsTable.blockerStatus,
      blockerNote: weeklyJournalsTable.blockerNote,
      blockerUpdatedAt: weeklyJournalsTable.blockerUpdatedAt,
      // Optional student-attached images + per-journal reel scan (additive).
      images: weeklyJournalsTable.images,
      reelWorthy: weeklyJournalsTable.reelWorthy,
      reelBucket: weeklyJournalsTable.reelBucket,
      reelScript: weeklyJournalsTable.reelScript,
      reelReason: weeklyJournalsTable.reelReason,
      reelAnalysedAt: weeklyJournalsTable.reelAnalysedAt,
      teamName: teamsTable.name,
      campusName: campusesTable.name,
      submittedByName: sql<string>`coalesce(${usersTable.firstName}, '') || ' ' || coalesce(${usersTable.lastName}, '')`,
    })
    .from(weeklyJournalsTable)
    .leftJoin(teamsTable, eq(teamsTable.id, weeklyJournalsTable.teamId))
    .leftJoin(campusesTable, eq(campusesTable.id, teamsTable.campusId))
    .leftJoin(usersTable, eq(usersTable.id, weeklyJournalsTable.submittedBy))
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(
      desc(weeklyJournalsTable.weekStartDate),
      desc(weeklyJournalsTable.submittedAt),
    );

  res.json(rows);
});

// Coordinator/admin: per-team coverage rollup (how many of the last 12 weeks
// each team submitted a journal for).
router.get("/admin/journals/coverage", async (req, res): Promise<void> => {
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
      res.json([]);
      return;
    }
    campusFilter = me.campusId;
  }

  // Look back 12 weeks worth of journal data.
  const twelveWeeksAgo = new Date();
  twelveWeeksAgo.setDate(twelveWeeksAgo.getDate() - 12 * 7);

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
        gte(weeklyJournalsTable.submittedAt, twelveWeeksAgo),
      ),
    );

  const journalsByTeam = new Map<number, typeof journals>();
  for (const j of journals) {
    const arr = journalsByTeam.get(j.teamId) ?? [];
    arr.push(j);
    journalsByTeam.set(j.teamId, arr);
  }

  const totalWeeks = 12;
  const result = teams.map((t) => {
    const teamJournals = journalsByTeam.get(t.teamId) ?? [];
    const submittedWeeks = teamJournals.length;
    const lastSubmittedWeek =
      teamJournals
        .map((j) => j.weekStartDate)
        .sort()
        .pop() ?? null;
    return {
      teamId: t.teamId,
      teamName: t.teamName,
      campusId: t.campusId,
      campusName: t.campusName,
      totalWeeks,
      submittedWeeks,
      missedWeeks: Math.max(0, totalWeeks - submittedWeeks),
      lastSubmittedWeek,
    };
  });
  result.sort((a, b) => a.submittedWeeks - b.submittedWeeks);
  res.json(result);
});

// ----------------- Update / Delete a journal (CRUD) -----------------

const UpdateJournalBody = z.object({
  whatWeDid: z.string().min(5).max(2000).optional(),
  blockers: z.string().max(2000).nullable().optional(),
  nextWeekPlan: z.string().max(2000).nullable().optional(),
  clientsVisited: counterField,
  activeConversations: counterField,
  projectsStarted: counterField,
  projectsClosed: counterField,
  images: imagesField,
});

// Decide whether the actor is allowed to update/delete a given journal.
// Returns null if allowed, or an { status, error } pair if not.
async function authorizeJournalMutation(
  user: { id: string; role: string },
  journal: typeof weeklyJournalsTable.$inferSelect,
): Promise<null | { status: number; error: string }> {
  if (user.role === "admin") return null;

  if (user.role === "coordinator") {
    // Coordinator: any journal in their own campus.
    const [me] = await db
      .select({ campusId: usersTable.campusId })
      .from(usersTable)
      .where(eq(usersTable.id, user.id))
      .limit(1);
    if (!me?.campusId)
      return { status: 403, error: "Coordinator has no campus" };
    const [team] = await db
      .select({ campusId: teamsTable.campusId })
      .from(teamsTable)
      .where(eq(teamsTable.id, journal.teamId))
      .limit(1);
    if (!team || team.campusId !== me.campusId) {
      return { status: 403, error: "Cross-campus access not allowed" };
    }
    return null;
  }

  if (user.role === "student") {
    // Student must be on the journal's team.
    const teamId = await getMyTeamId(user.id);
    if (teamId !== journal.teamId) {
      return { status: 403, error: "Not your team's journal" };
    }
    // If the journal's week is closed (past), require admin toggle.
    const [week] = await db
      .select({ isOpen: programmeWeeksTable.isOpen })
      .from(programmeWeeksTable)
      .where(
        and(
          eq(programmeWeeksTable.seasonId, journal.seasonId),
          eq(programmeWeeksTable.startDate, journal.weekStartDate),
        ),
      )
      .limit(1);
    const isOpen = week?.isOpen ?? false;
    if (!isOpen) {
      // The journal's own season governs whether past-week edits are allowed.
      const allow = await getAllowPastWeekEdits(journal.seasonId);
      if (!allow) {
        return {
          status: 403,
          error:
            "Past-week journals are read-only. Ask an admin to enable past-week edits.",
        };
      }
    }
    return null;
  }

  return { status: 403, error: "Forbidden" };
}

// Permissions probe — the frontend calls this to decide which buttons to show.
router.get("/journals/permissions", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const role = req.user.role;
  const season = await resolveSeason(req);
  const allowPastWeekEdits = await getAllowPastWeekEdits(season);

  // Whether this season accepts journal writes at all. Admins and coordinators
  // bypass the archive (they correct historical records), so this only ever
  // narrows the student's answer — matching exactly what the server-side guard
  // on POST/PATCH/DELETE /journals will do. The frontend hides its add/edit
  // buttons off the back of this, so the two must agree or a student sees a
  // button that 409s.
  const writable =
    role === "admin" ||
    role === "coordinator" ||
    (await isSeasonWritable(season, "journal"));

  res.json({
    role,
    canCreate: role === "student" && writable,
    canUpdate:
      (role === "admin" || role === "coordinator" || role === "student") &&
      writable,
    canDelete:
      (role === "admin" || role === "coordinator" || role === "student") &&
      writable,
    allowPastWeekEdits,
    // Explicit so the UI can explain WHY the buttons are gone rather than just
    // rendering an empty toolbar.
    seasonId: season,
    seasonWritable: writable,
  });
});

router.patch("/journals/:id", requireWritableSeason("journal"), async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const parsed = UpdateJournalBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [existing] = await db
    .select()
    .from(weeklyJournalsTable)
    .where(eq(weeklyJournalsTable.id, id))
    .limit(1);
  if (!existing) {
    res.status(404).json({ error: "Journal not found" });
    return;
  }

  const denial = await authorizeJournalMutation(req.user, existing);
  if (denial) {
    res.status(denial.status).json({ error: denial.error });
    return;
  }

  const update: Partial<typeof weeklyJournalsTable.$inferInsert> = {};
  if (parsed.data.whatWeDid !== undefined)
    update.whatWeDid = parsed.data.whatWeDid;
  if (parsed.data.blockers !== undefined)
    update.blockers = parsed.data.blockers;
  if (parsed.data.nextWeekPlan !== undefined)
    update.nextWeekPlan = parsed.data.nextWeekPlan;
  if (parsed.data.clientsVisited !== undefined)
    update.clientsVisited = parsed.data.clientsVisited;
  if (parsed.data.activeConversations !== undefined)
    update.activeConversations = parsed.data.activeConversations;
  if (parsed.data.projectsStarted !== undefined)
    update.projectsStarted = parsed.data.projectsStarted;
  if (parsed.data.projectsClosed !== undefined)
    update.projectsClosed = parsed.data.projectsClosed;
  if (parsed.data.images !== undefined) update.images = parsed.data.images;
  if (Object.keys(update).length === 0) {
    res.status(400).json({ error: "No fields to update" });
    return;
  }

  const [updated] = await db
    .update(weeklyJournalsTable)
    .set(update)
    .where(eq(weeklyJournalsTable.id, id))
    .returning();

  // Content changed → re-run AI analysis so the formatted view + blocker triage
  // stay in sync with the edited text. Fire-and-forget; never blocks the edit.
  if (
    updated &&
    (parsed.data.whatWeDid !== undefined ||
      parsed.data.blockers !== undefined ||
      parsed.data.nextWeekPlan !== undefined)
  ) {
    // The merged analysis also re-decides reel-worthiness against the new text.
    scheduleJournalAnalysis(updated.id);
  }

  // Audit log for staff edits (not student self-edits).
  if (req.user.role === "admin" || req.user.role === "coordinator") {
    await db.insert(auditLogTable).values({
      actorId: req.user.id,
      action: "update_journal",
      targetType: "weekly_journal",
      targetId: id,
      details: JSON.stringify({
        before: {
          whatWeDid: existing.whatWeDid,
          blockers: existing.blockers,
          nextWeekPlan: existing.nextWeekPlan,
        },
        after: {
          whatWeDid: updated.whatWeDid,
          blockers: updated.blockers,
          nextWeekPlan: updated.nextWeekPlan,
        },
        teamId: existing.teamId,
        weekStartDate: existing.weekStartDate,
      }),
    });
  }

  res.json(updated);
});

router.delete("/journals/:id", requireWritableSeason("journal"), async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }

  const [existing] = await db
    .select()
    .from(weeklyJournalsTable)
    .where(eq(weeklyJournalsTable.id, id))
    .limit(1);
  if (!existing) {
    res.status(404).json({ error: "Journal not found" });
    return;
  }

  const denial = await authorizeJournalMutation(req.user, existing);
  if (denial) {
    res.status(denial.status).json({ error: denial.error });
    return;
  }

  await db.delete(weeklyJournalsTable).where(eq(weeklyJournalsTable.id, id));

  if (req.user.role === "admin" || req.user.role === "coordinator") {
    await db.insert(auditLogTable).values({
      actorId: req.user.id,
      action: "delete_journal",
      targetType: "weekly_journal",
      targetId: id,
      details: JSON.stringify({
        snapshot: {
          teamId: existing.teamId,
          weekStartDate: existing.weekStartDate,
          weekEndDate: existing.weekEndDate,
          whatWeDid: existing.whatWeDid,
          blockers: existing.blockers,
          nextWeekPlan: existing.nextWeekPlan,
          submittedBy: existing.submittedBy,
          submittedAt: existing.submittedAt,
        },
      }),
    });
  }

  res.json({ ok: true, id });
});

// ----------------- AI journal analysis (admin/coordinator) -----------------

// Run / re-run the Gemini auditor on ONE journal immediately. Used by the
// per-journal "Analyse" / "Re-analyse" buttons and driven sequentially by the
// "Analyse all" action on the frontend. Returns the refreshed AI fields.
router.post(
  "/admin/journals/:id/analyse",
  requireAdminPage("/admin/journals", "edit"),
  async (req, res): Promise<void> => {
    if (!req.isAuthenticated()) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    if (req.user.role !== "admin" && req.user.role !== "coordinator") {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }
    const [existing] = await db
      .select()
      .from(weeklyJournalsTable)
      .where(eq(weeklyJournalsTable.id, id))
      .limit(1);
    if (!existing) {
      res.status(404).json({ error: "Journal not found" });
      return;
    }
    // Coordinators may only analyse journals in their own campus.
    const denial = await authorizeJournalMutation(req.user, existing);
    if (denial) {
      res.status(denial.status).json({ error: denial.error });
      return;
    }

    const ok = await runJournalAnalysisNow(id);

    const [updated] = await db
      .select({
        id: weeklyJournalsTable.id,
        aiAnalysis: weeklyJournalsTable.aiAnalysis,
        aiAnalysedAt: weeklyJournalsTable.aiAnalysedAt,
        blockerPriority: weeklyJournalsTable.blockerPriority,
        blockerPriorityManual: weeklyJournalsTable.blockerPriorityManual,
        blockerStatus: weeklyJournalsTable.blockerStatus,
        blockerNote: weeklyJournalsTable.blockerNote,
        blockerUpdatedAt: weeklyJournalsTable.blockerUpdatedAt,
      })
      .from(weeklyJournalsTable)
      .where(eq(weeklyJournalsTable.id, id))
      .limit(1);

    if (!ok && !updated?.aiAnalysedAt) {
      res.status(502).json({
        error:
          "Analysis did not complete. Check that GEMINI_API_KEY is configured.",
        journal: updated ?? null,
      });
      return;
    }
    res.json({ ok, journal: updated ?? null });
  },
);

// Run / re-run the per-journal REEL SCAN on ONE journal immediately. Decides
// (using this team's previous journals as context) whether the entry is worthy
// of a reel and, if so, generates a script. Returns the refreshed reel fields.
router.post(
  "/admin/journals/:id/reel-scan",
  requireAdminPage("/admin/journals", "edit"),
  async (req, res): Promise<void> => {
    if (!req.isAuthenticated()) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    if (req.user.role !== "admin" && req.user.role !== "coordinator") {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }
    const [existing] = await db
      .select()
      .from(weeklyJournalsTable)
      .where(eq(weeklyJournalsTable.id, id))
      .limit(1);
    if (!existing) {
      res.status(404).json({ error: "Journal not found" });
      return;
    }
    // Coordinators may only scan journals in their own campus.
    const denial = await authorizeJournalMutation(req.user, existing);
    if (denial) {
      res.status(denial.status).json({ error: denial.error });
      return;
    }

    // Re-runs the merged analysis (one Gemini call covers analysis + reel scan).
    const ok = await runJournalAnalysisNow(id);

    const [updated] = await db
      .select({
        id: weeklyJournalsTable.id,
        reelWorthy: weeklyJournalsTable.reelWorthy,
        reelBucket: weeklyJournalsTable.reelBucket,
        reelScript: weeklyJournalsTable.reelScript,
        reelReason: weeklyJournalsTable.reelReason,
        reelAnalysedAt: weeklyJournalsTable.reelAnalysedAt,
      })
      .from(weeklyJournalsTable)
      .where(eq(weeklyJournalsTable.id, id))
      .limit(1);

    if (!ok && !updated?.reelAnalysedAt) {
      res.status(502).json({
        error:
          "Reel scan did not complete. Check that GEMINI_API_KEY is configured.",
        journal: updated ?? null,
      });
      return;
    }
    res.json({ ok, journal: updated ?? null });
  },
);

// Update blocker triage on a journal: priority (manual override of the AI's
// suggestion), status (open/assigned/resolved), and an optional admin note.
const BlockerTriageBody = z
  .object({
    priority: z.enum(["high", "medium", "low", "none"]).optional(),
    status: z.enum(["open", "assigned", "resolved"]).optional(),
    note: z.string().max(2000).nullable().optional(),
  })
  .refine(
    (b) =>
      b.priority !== undefined ||
      b.status !== undefined ||
      b.note !== undefined,
    { message: "No fields to update" },
  );

router.patch(
  "/admin/journals/:id/blocker",
  requireAdminPage("/admin/journals", "edit"),
  async (req, res): Promise<void> => {
    if (!req.isAuthenticated()) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    if (req.user.role !== "admin" && req.user.role !== "coordinator") {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }
    const parsed = BlockerTriageBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const [existing] = await db
      .select()
      .from(weeklyJournalsTable)
      .where(eq(weeklyJournalsTable.id, id))
      .limit(1);
    if (!existing) {
      res.status(404).json({ error: "Journal not found" });
      return;
    }
    const denial = await authorizeJournalMutation(req.user, existing);
    if (denial) {
      res.status(denial.status).json({ error: denial.error });
      return;
    }

    const update: Partial<typeof weeklyJournalsTable.$inferInsert> = {
      blockerUpdatedBy: req.user.id,
      blockerUpdatedAt: new Date(),
    };
    if (parsed.data.priority !== undefined) {
      update.blockerPriority = parsed.data.priority;
      // A manual priority pins the value so re-analysis won't overwrite it.
      update.blockerPriorityManual = true;
    }
    if (parsed.data.status !== undefined) {
      update.blockerStatus = parsed.data.status;
    }
    if (parsed.data.note !== undefined) {
      update.blockerNote = parsed.data.note;
    }

    const [updated] = await db
      .update(weeklyJournalsTable)
      .set(update)
      .where(eq(weeklyJournalsTable.id, id))
      .returning({
        id: weeklyJournalsTable.id,
        blockerPriority: weeklyJournalsTable.blockerPriority,
        blockerPriorityManual: weeklyJournalsTable.blockerPriorityManual,
        blockerStatus: weeklyJournalsTable.blockerStatus,
        blockerNote: weeklyJournalsTable.blockerNote,
        blockerUpdatedAt: weeklyJournalsTable.blockerUpdatedAt,
      });

    await db.insert(auditLogTable).values({
      actorId: req.user.id,
      action: "update_journal_blocker",
      targetType: "weekly_journal",
      targetId: id,
      details: JSON.stringify({
        teamId: existing.teamId,
        weekStartDate: existing.weekStartDate,
        before: {
          blockerPriority: existing.blockerPriority,
          blockerStatus: existing.blockerStatus,
          blockerNote: existing.blockerNote,
        },
        after: {
          blockerPriority: updated.blockerPriority,
          blockerStatus: updated.blockerStatus,
          blockerNote: updated.blockerNote,
        },
      }),
    });

    res.json(updated);
  },
);

export default router;
