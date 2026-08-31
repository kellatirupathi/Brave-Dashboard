/**
 * Journal reporting helpers — campus-wise submitted/not-submitted computation
 * for a programme week, plus resolution of escalation recipients (coordinators
 * carrying a given coordinator tag, e.g. "Success Coach" / "COS").
 *
 * Pure data helpers — no HTTP, no email. Shared by the Reports routes and the
 * escalation / weekly-report crons.
 */
import { and, asc, eq, inArray } from "drizzle-orm";
import { getActiveSeasonId } from "./season";
import {
  db,
  teamsTable,
  weeklyJournalsTable,
  campusesTable,
  usersTable,
  coordinatorTagsTable,
  userCoordinatorTagsTable,
  programmeWeeksTable,
} from "@workspace/db";

export type WeekRef = {
  id: number;
  weekNumber: number;
  startDate: string;
  endDate: string;
  // Carried so every downstream journal query derives its season from the week
  // rather than resolving one independently.
  seasonId: number;
};

export type CampusTeamStatus = {
  teamId: number;
  teamName: string;
  submitted: boolean;
  submittedByRole: string | null;
  submittedAt: Date | null;
};

export type CampusWeekReport = {
  campusId: number;
  campusName: string;
  totalTeams: number;
  submittedCount: number;
  notSubmittedCount: number;
  teams: CampusTeamStatus[];
};

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

// Resolve the week to report on: the open week containing today, else the most
// recent open week, else the latest programme week overall. Returns null when
// no programme weeks exist.
export async function resolveReportWeek(
  weekId?: number,
  /**
   * Season to report on. Defaults to the ACTIVE season so background callers
   * (the escalation cron) behave exactly as before; request handlers pass the
   * season being VIEWED, which is what makes the Reports page follow the
   * 1.0 / 2.0 switch instead of always showing the live season.
   */
  seasonId?: number,
): Promise<WeekRef | null> {
  if (weekId) {
    const [w] = await db
      .select({
        id: programmeWeeksTable.id,
        weekNumber: programmeWeeksTable.weekNumber,
        startDate: programmeWeeksTable.startDate,
        endDate: programmeWeeksTable.endDate,
        seasonId: programmeWeeksTable.seasonId,
      })
      .from(programmeWeeksTable)
      .where(
        seasonId == null
          ? eq(programmeWeeksTable.id, weekId)
          : and(
              eq(programmeWeeksTable.id, weekId),
              eq(programmeWeeksTable.seasonId, seasonId),
            ),
      );
    return w ?? null;
  }
  const today = todayIso();
  const weeks = await db
    .select({
      id: programmeWeeksTable.id,
      weekNumber: programmeWeeksTable.weekNumber,
      startDate: programmeWeeksTable.startDate,
      endDate: programmeWeeksTable.endDate,
      seasonId: programmeWeeksTable.seasonId,
      isOpen: programmeWeeksTable.isOpen,
    })
    .from(programmeWeeksTable)
    // Reports and escalations run for the season currently in progress.
    .where(
      eq(
        programmeWeeksTable.seasonId,
        seasonId ?? (await getActiveSeasonId()),
      ),
    )
    .orderBy(asc(programmeWeeksTable.weekNumber));
  if (weeks.length === 0) return null;
  const open = weeks.filter((w) => w.isOpen);
  const containing = open.find(
    (w) => w.startDate <= today && today <= w.endDate,
  );
  if (containing) return containing;
  if (open.length > 0) return open[open.length - 1];
  // The most recent week that has ALREADY ENDED. Reporting on a week that has
  // not happened yet is meaningless, and for the escalation cron it is actively
  // harmful: it would chase every team for a journal that is not due.
  const ended = weeks.filter((w) => w.endDate < today);
  if (ended.length > 0) return ended[ended.length - 1];
  // Nothing has started. Deliberately null rather than the last week of the
  // season — a season configured to run Sep-Nov and viewed in August was
  // resolving to its FINAL week, so the Reports page showed "Week 13" with
  // every team marked not-submitted, and the cron would have emailed all of
  // them about a deadline three months away. Both callers already treat null
  // as "nothing to report on".
  return null;
}

// Resolve the week that the escalation / weekly-report crons should target: the
// most recent programme week that has ALREADY ENDED relative to today (greatest
// endDate strictly before today).
//
// Why this differs from resolveReportWeek: programme weeks run Wed→Tue and the
// journal deadline is Tuesday EOD. The escalation chain (Wed→Thu→Fri) and the
// weekly report run the days AFTER that deadline — by which point "today" sits
// inside the NEXT week, which has only just started and whose own journals are
// not due yet. resolveReportWeek() returns that current containing week, so the
// crons were chasing this week's not-yet-due journals instead of last week's.
// This helper instead reports on the week that just closed on Tuesday — exactly
// the journals the Wed/Thu/Fri escalation is meant to chase.
//
// Falls back to resolveReportWeek() when no week has ended yet (e.g. during the
// programme's very first week) so the crons still resolve a sensible week.
export async function resolvePreviousReportWeek(
  seasonId?: number,
): Promise<WeekRef | null> {
  const today = todayIso();
  const weeks = await db
    .select({
      id: programmeWeeksTable.id,
      weekNumber: programmeWeeksTable.weekNumber,
      startDate: programmeWeeksTable.startDate,
      endDate: programmeWeeksTable.endDate,
      seasonId: programmeWeeksTable.seasonId,
    })
    .from(programmeWeeksTable)
    // Reports and escalations run for the season currently in progress.
    .where(
      eq(
        programmeWeeksTable.seasonId,
        seasonId ?? (await getActiveSeasonId()),
      ),
    )
    .orderBy(asc(programmeWeeksTable.weekNumber));
  if (weeks.length === 0) return null;
  // Weeks are ordered by weekNumber (so by date too); the last one that ended
  // before today is the week that just closed.
  const ended = weeks.filter((w) => w.endDate < today);
  if (ended.length > 0) return ended[ended.length - 1];
  // Pass the season through: without it the fallback silently reported on the
  // ACTIVE season instead of the one asked for.
  return resolveReportWeek(undefined, seasonId);
}

// All programme weeks (for the report week filter / week grid).
export async function listAllWeeks(seasonId?: number): Promise<WeekRef[]> {
  return db
    .select({
      id: programmeWeeksTable.id,
      weekNumber: programmeWeeksTable.weekNumber,
      startDate: programmeWeeksTable.startDate,
      endDate: programmeWeeksTable.endDate,
      seasonId: programmeWeeksTable.seasonId,
    })
    .from(programmeWeeksTable)
    // Reports and escalations run for the season currently in progress.
    .where(
      eq(
        programmeWeeksTable.seasonId,
        seasonId ?? (await getActiveSeasonId()),
      ),
    )
    .orderBy(asc(programmeWeeksTable.weekNumber));
}

// Per-campus submitted/not-submitted breakdown for a single week. When
// campusId is provided, only that campus is returned.
export async function computeCampusWeekReports(
  week: WeekRef,
  campusId?: number,
): Promise<CampusWeekReport[]> {
  const campusConds = campusId ? [eq(campusesTable.id, campusId)] : [];
  const campuses = await db
    .select({ id: campusesTable.id, name: campusesTable.name })
    .from(campusesTable)
    .where(campusConds.length ? and(...campusConds) : undefined)
    .orderBy(asc(campusesTable.name));
  if (campuses.length === 0) return [];

  const campusIds = campuses.map((c) => c.id);
  const teamConds = [eq(teamsTable.status, "active")];
  if (campusId) teamConds.push(eq(teamsTable.campusId, campusId));
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

  const teamsByCampus = new Map<number, CampusTeamStatus[]>();
  for (const t of teams) {
    if (t.campusId == null || !campusIds.includes(t.campusId)) continue;
    const j = byTeam.get(t.teamId);
    const arr = teamsByCampus.get(t.campusId) ?? [];
    arr.push({
      teamId: t.teamId,
      teamName: t.teamName,
      submitted: !!j,
      submittedByRole: j?.submittedByRole ?? null,
      submittedAt: j?.submittedAt ?? null,
    });
    teamsByCampus.set(t.campusId, arr);
  }

  return campuses.map((c) => {
    const ts = teamsByCampus.get(c.id) ?? [];
    const submittedCount = ts.filter((t) => t.submitted).length;
    return {
      campusId: c.id,
      campusName: c.name,
      totalTeams: ts.length,
      submittedCount,
      notSubmittedCount: ts.length - submittedCount,
      teams: ts,
    };
  });
}

// Active coordinators in a campus who carry a given coordinator tag (by name).
// Used to resolve Success Coach / COS escalation recipients.
export async function resolveCampusTagRecipients(
  campusId: number,
  tagName: string,
): Promise<Array<{ email: string; firstName: string | null }>> {
  const rows = await db
    .select({
      email: usersTable.email,
      firstName: usersTable.firstName,
    })
    .from(usersTable)
    .innerJoin(
      userCoordinatorTagsTable,
      eq(userCoordinatorTagsTable.userId, usersTable.id),
    )
    .innerJoin(
      coordinatorTagsTable,
      eq(coordinatorTagsTable.id, userCoordinatorTagsTable.tagId),
    )
    .where(
      and(
        eq(usersTable.role, "coordinator"),
        eq(usersTable.campusId, campusId),
        eq(usersTable.isActive, true),
        eq(coordinatorTagsTable.name, tagName),
      ),
    );
  // Drop synthetic placeholder addresses that would bounce.
  return rows.filter(
    (r) =>
      r.email &&
      r.email.includes("@") &&
      !r.email.toLowerCase().endsWith("@forms.local"),
  );
}

// Week-by-week submission grid for every active team (weekly admin report).
export async function computeWeekGrid(seasonId?: number): Promise<{
  weeks: WeekRef[];
  rows: Array<{
    teamId: number;
    teamName: string;
    campusName: string | null;
    perWeek: boolean[];
    filled: number;
    pending: number;
  }>;
}> {
  const resolvedSeasonId = seasonId ?? (await getActiveSeasonId());
  const weeks = await listAllWeeks(resolvedSeasonId);
  const teams = await db
    .select({
      teamId: teamsTable.id,
      teamName: teamsTable.name,
      campusName: campusesTable.name,
    })
    .from(teamsTable)
    .leftJoin(campusesTable, eq(campusesTable.id, teamsTable.campusId))
    .where(eq(teamsTable.status, "active"))
    .orderBy(asc(teamsTable.name));

  const teamIds = teams.map((t) => t.teamId);
  const journals =
    teamIds.length > 0
      ? await db
          .select({
            teamId: weeklyJournalsTable.teamId,
            weekStartDate: weeklyJournalsTable.weekStartDate,
          })
          .from(weeklyJournalsTable)
          .where(
            and(
              eq(
                weeklyJournalsTable.seasonId,
                resolvedSeasonId,
              ),
              inArray(weeklyJournalsTable.teamId, teamIds),
            ),
          )
      : [];
  const submitted = new Set(
    journals.map((j) => `${j.teamId}|${j.weekStartDate}`),
  );

  const rows = teams.map((t) => {
    const perWeek = weeks.map((w) =>
      submitted.has(`${t.teamId}|${w.startDate}`),
    );
    const filled = perWeek.filter(Boolean).length;
    return {
      teamId: t.teamId,
      teamName: t.teamName,
      campusName: t.campusName ?? null,
      perWeek,
      filled,
      pending: perWeek.length - filled,
    };
  });
  return { weeks, rows };
}
