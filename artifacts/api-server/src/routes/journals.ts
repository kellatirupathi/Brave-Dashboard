import { Router, type IRouter } from "express";
import { eq, and, desc, sql, gte, asc } from "drizzle-orm";
import {
  db,
  weeklyJournalsTable,
  teamMembersTable,
  teamsTable,
  usersTable,
  campusesTable,
  programmeWeeksTable,
  auditLogTable,
} from "@workspace/db";
import { z } from "zod/v4";
import { getAllowPastWeekEdits } from "./programme-weeks";

const router: IRouter = Router();

const SubmitJournalBody = z.object({
  weekId: z.number().int().positive().optional(),
  whatWeDid: z.string().min(5).max(2000),
  blockers: z.string().max(2000).optional(),
  nextWeekPlan: z.string().max(2000).optional(),
});

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

// Pick the "current" programme week: the open week whose date range contains
// today. If none contains today, fall back to the most recent open week.
async function getCurrentOpenWeek(): Promise<{
  id: number;
  weekNumber: number;
  startDate: string;
  endDate: string;
} | null> {
  const today = todayIso();
  const open = await db
    .select({
      id: programmeWeeksTable.id,
      weekNumber: programmeWeeksTable.weekNumber,
      startDate: programmeWeeksTable.startDate,
      endDate: programmeWeeksTable.endDate,
    })
    .from(programmeWeeksTable)
    .where(eq(programmeWeeksTable.isOpen, true))
    .orderBy(asc(programmeWeeksTable.weekNumber));
  if (open.length === 0) return null;
  const containsToday =
    open.find((w) => w.startDate <= today && today <= w.endDate) ?? null;
  if (containsToday) return containsToday;
  return open[open.length - 1] ?? null;
}

async function getOpenWeekById(weekId: number): Promise<{
  id: number;
  weekNumber: number;
  startDate: string;
  endDate: string;
  isOpen: boolean;
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
  const currentWeek = await getCurrentOpenWeek();

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
    .where(eq(weeklyJournalsTable.teamId, teamId))
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
  const currentWeek = await getCurrentOpenWeek();
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
    .where(eq(weeklyJournalsTable.teamId, teamId))
    .orderBy(desc(weeklyJournalsTable.weekStartDate));
  res.json(rows);
});

// Student (any team member): submit / upsert a journal for the team.
// Body may include `weekId` to target a specific open week. If omitted,
// defaults to the current open week.
router.post("/journals", async (req, res): Promise<void> => {
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
    const cur = await getCurrentOpenWeek();
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
      weekStartDate: targetWeek.startDate,
      weekEndDate: targetWeek.endDate,
      whatWeDid: parsed.data.whatWeDid,
      blockers: parsed.data.blockers ?? null,
      nextWeekPlan: parsed.data.nextWeekPlan ?? null,
      submittedBy: req.user.id,
    })
    .onConflictDoUpdate({
      target: [weeklyJournalsTable.teamId, weeklyJournalsTable.weekStartDate],
      set: {
        whatWeDid: parsed.data.whatWeDid,
        blockers: parsed.data.blockers ?? null,
        nextWeekPlan: parsed.data.nextWeekPlan ?? null,
        submittedBy: req.user.id,
        submittedAt: new Date(),
      },
    })
    .returning();
  res.status(201).json(created);
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

  const conditions =
    campusFilter != null ? [eq(teamsTable.campusId, campusFilter)] : [];

  const rows = await db
    .select({
      id: weeklyJournalsTable.id,
      teamId: weeklyJournalsTable.teamId,
      weekStartDate: weeklyJournalsTable.weekStartDate,
      weekEndDate: weeklyJournalsTable.weekEndDate,
      whatWeDid: weeklyJournalsTable.whatWeDid,
      blockers: weeklyJournalsTable.blockers,
      nextWeekPlan: weeklyJournalsTable.nextWeekPlan,
      submittedBy: weeklyJournalsTable.submittedBy,
      submittedAt: weeklyJournalsTable.submittedAt,
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
    .where(gte(weeklyJournalsTable.submittedAt, twelveWeeksAgo));

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
      .where(eq(programmeWeeksTable.startDate, journal.weekStartDate))
      .limit(1);
    const isOpen = week?.isOpen ?? false;
    if (!isOpen) {
      const allow = await getAllowPastWeekEdits();
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
  const allowPastWeekEdits = await getAllowPastWeekEdits();
  res.json({
    role,
    canCreate: role === "student",
    canUpdate: role === "admin" || role === "coordinator" || role === "student",
    canDelete: role === "admin" || role === "coordinator" || role === "student",
    allowPastWeekEdits,
  });
});

router.patch("/journals/:id", async (req, res): Promise<void> => {
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
  if (Object.keys(update).length === 0) {
    res.status(400).json({ error: "No fields to update" });
    return;
  }

  const [updated] = await db
    .update(weeklyJournalsTable)
    .set(update)
    .where(eq(weeklyJournalsTable.id, id))
    .returning();

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

router.delete("/journals/:id", async (req, res): Promise<void> => {
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

export default router;
