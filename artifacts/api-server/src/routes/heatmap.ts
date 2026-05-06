import { Router, type IRouter } from "express";
import { eq, and, gte } from "drizzle-orm";
import {
  db,
  teamsTable,
  campusesTable,
  usersTable,
  teamMembersTable,
  weeklyJournalsTable,
  notificationsTable,
  reminderLogTable,
} from "@workspace/db";
import { z } from "zod/v4";
import { getReminderSettings } from "./programme-weeks";

const router: IRouter = Router();

function mondayUtc(d: Date): Date {
  const day = d.getUTCDay();
  const offset = day === 0 ? -6 : 1 - day;
  return new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + offset),
  );
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function daysBetween(a: Date, b: Date): number {
  return Math.floor((b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24));
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

  // Build the list of week-start dates (Monday UTC) in chronological order.
  const todayMonday = mondayUtc(new Date());
  const weekStarts: string[] = [];
  for (let i = weeksBack - 1; i >= 0; i--) {
    const d = new Date(todayMonday);
    d.setUTCDate(d.getUTCDate() - i * 7);
    weekStarts.push(isoDate(d));
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

export default router;
