import { Router, type IRouter } from "express";
import { and, asc, eq } from "drizzle-orm";
import {
  db,
  programmeWeeksTable,
  programmeConfigTable,
  usersTable,
} from "@workspace/db";
import { z } from "zod/v4";
import { requireAdminPage } from "../lib/require-admin-page";
import {
  getActiveSeasonId,
  getConfig,
  resolveSeason,
} from "../lib/season";
import {
  EMAIL_CATEGORIES,
  getEmailControls,
  invalidateEmailControlsCache,
} from "../lib/email/email-controls";

/**
 * Helper used by Module 5 cron and the heatmap manual-remind endpoint to
 * decide whether a given channel is enabled for the reminder service.
 * Returns all three flags from a season’s programme_config row,
 * defaulting to enabled when no row exists yet.
 *
 * - notificationsEnabled: in-app notifications to *students*
 * - emailsEnabled:        Brevo emails to *students*
 * - coordinatorNotificationsEnabled: in-app pings to coordinators (day-7 only)
 */
// `seasonId` omitted means the ACTIVE season, which is what the reminder crons
// want. Request handlers should pass `await resolveSeason(req)`.
export async function getReminderSettings(seasonId?: number): Promise<{
  notificationsEnabled: boolean;
  emailsEnabled: boolean;
  coordinatorNotificationsEnabled: boolean;
}> {
  const season = seasonId ?? (await getActiveSeasonId());
  const [config] = await db
    .select({
      notificationsEnabled: programmeConfigTable.reminderNotificationsEnabled,
      emailsEnabled: programmeConfigTable.reminderEmailsEnabled,
      coordinatorNotificationsEnabled:
        programmeConfigTable.coordinatorNotificationsEnabled,
    })
    .from(programmeConfigTable)
    .where(eq(programmeConfigTable.seasonId, season))
    .limit(1);
  return {
    notificationsEnabled: config?.notificationsEnabled ?? true,
    emailsEnabled: config?.emailsEnabled ?? true,
    coordinatorNotificationsEnabled:
      config?.coordinatorNotificationsEnabled ?? true,
  };
}

/**
 * Returns whether students are allowed to edit/delete past-week journals.
 * Defaults to false (read-only past weeks for students) when no config row.
 */
export async function getAllowPastWeekEdits(
  seasonId?: number,
): Promise<boolean> {
  const season = seasonId ?? (await getActiveSeasonId());
  const [config] = await db
    .select({ allow: programmeConfigTable.allowPastWeekEdits })
    .from(programmeConfigTable)
    .where(eq(programmeConfigTable.seasonId, season))
    .limit(1);
  return config?.allow ?? false;
}

const router: IRouter = Router();

// Add `n` whole days (UTC) to a YYYY-MM-DD string.
function addDays(yyyymmdd: string, n: number): string {
  const dateOnly = (yyyymmdd ?? "").slice(0, 10);
  const [y, m, d] = dateOnly.split("-").map(Number);
  const dt = new Date(Date.UTC(y, (m ?? 1) - 1, d ?? 1));
  dt.setUTCDate(dt.getUTCDate() + n);
  return dt.toISOString().slice(0, 10);
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Regenerate `programme_weeks` rows from the current programme_config dates.
 * Strict 7-day chunks anchored to programme_config.startDate.
 *
 * Behavior:
 * - If a week with the same weekNumber already exists AND has manualOverride=true,
 *   we KEEP its existing isOpen value (admin's choice is sticky).
 * - Otherwise we recompute isOpen = (startDate <= today).
 * - Removes any weeks that no longer fit between the new start and end dates.
 */
export async function regenerateProgrammeWeeks(seasonId?: number): Promise<{
  created: number;
  updated: number;
  removed: number;
  total: number;
}> {
  // SCOPED TO ONE SEASON, and that is load-bearing. Week numbers repeat across
  // seasons, so an unscoped run would match Season 1's "week 1" against
  // Season 2's dates and then DELETE every Season 1 week whose number falls
  // outside Season 2's range (S1 ran 14 weeks, S2 runs 12). That would orphan
  // Season 1 journals. Every read, write and delete below is filtered.
  const season = seasonId ?? (await getActiveSeasonId());
  const [config] = await db
    .select()
    .from(programmeConfigTable)
    .where(eq(programmeConfigTable.seasonId, season))
    .limit(1);
  if (!config) {
    return { created: 0, updated: 0, removed: 0, total: 0 };
  }
  const start = (config.startDate ?? "").slice(0, 10);
  const end = (config.endDate ?? "").slice(0, 10);
  if (!start || !end) {
    return { created: 0, updated: 0, removed: 0, total: 0 };
  }

  const existing = await db
    .select()
    .from(programmeWeeksTable)
    .where(eq(programmeWeeksTable.seasonId, season));
  const existingByNum = new Map(existing.map((w) => [w.weekNumber, w]));
  const today = todayIso();

  // Build the desired set of weeks (strict 7-day chunks).
  // Week 1 = [start, start+6]. Week 2 = [start+7, start+13]. ...continue
  // while the week's startDate <= end.
  const desired: Array<{
    weekNumber: number;
    startDate: string;
    endDate: string;
  }> = [];
  let weekNumber = 1;
  let cursor = start;
  // Safety cap to avoid infinite loops on bad config data.
  while (cursor <= end && weekNumber <= 60) {
    const weekEnd = addDays(cursor, 6);
    desired.push({ weekNumber, startDate: cursor, endDate: weekEnd });
    cursor = addDays(cursor, 7);
    weekNumber += 1;
  }

  let created = 0;
  let updated = 0;

  for (const w of desired) {
    const prior = existingByNum.get(w.weekNumber);
    if (!prior) {
      await db.insert(programmeWeeksTable).values({
        seasonId: season,
        weekNumber: w.weekNumber,
        startDate: w.startDate,
        endDate: w.endDate,
        isOpen: w.startDate <= today,
        manualOverride: false,
      });
      created += 1;
    } else {
      const newIsOpen = prior.manualOverride
        ? prior.isOpen
        : w.startDate <= today;
      const needsUpdate =
        prior.startDate !== w.startDate ||
        prior.endDate !== w.endDate ||
        prior.isOpen !== newIsOpen;
      if (needsUpdate) {
        await db
          .update(programmeWeeksTable)
          .set({
            startDate: w.startDate,
            endDate: w.endDate,
            isOpen: newIsOpen,
          })
          .where(eq(programmeWeeksTable.id, prior.id));
        updated += 1;
      }
    }
  }

  // Remove weeks beyond the new range.
  const desiredNumbers = new Set(desired.map((d) => d.weekNumber));
  let removed = 0;
  for (const e of existing) {
    if (!desiredNumbers.has(e.weekNumber)) {
      await db
        .delete(programmeWeeksTable)
        .where(eq(programmeWeeksTable.id, e.id));
      removed += 1;
    }
  }
  return { created, updated, removed, total: desired.length };
}

/**
 * Auto-open weeks whose startDate has arrived. Admin's manual overrides
 * are respected (skipped). Returns count of weeks flipped.
 */
// Scoped to one season (default: the active one) so an archived season's weeks
// are never re-opened by the scheduler.
export async function autoOpenDueWeeks(seasonId?: number): Promise<number> {
  const today = todayIso();
  const season = seasonId ?? (await getActiveSeasonId());
  const all = await db
    .select()
    .from(programmeWeeksTable)
    .where(
      and(
        eq(programmeWeeksTable.seasonId, season),
        eq(programmeWeeksTable.manualOverride, false),
      ),
    );
  let flipped = 0;
  for (const w of all) {
    const shouldBeOpen = w.startDate <= today;
    if (shouldBeOpen && !w.isOpen) {
      await db
        .update(programmeWeeksTable)
        .set({ isOpen: true })
        .where(eq(programmeWeeksTable.id, w.id));
      flipped += 1;
    }
  }
  return flipped;
}

// ----------------- HTTP routes -----------------

// Admin: list all weeks (regenerates first if empty so admin always sees something).
router.get("/admin/programme-weeks", async (req, res): Promise<void> => {
  if (!req.isAuthenticated() || req.user.role !== "admin") {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  const existing = await db
    .select()
    .from(programmeWeeksTable)
    .orderBy(asc(programmeWeeksTable.weekNumber));
  if (existing.length === 0) {
    await regenerateProgrammeWeeks();
    const fresh = await db
      .select()
      .from(programmeWeeksTable)
      .orderBy(asc(programmeWeeksTable.weekNumber));
    res.json(fresh);
    return;
  }
  res.json(existing);
});

// Admin: rebuild from current programme_config (call after editing start/end).
router.post(
  "/admin/programme-weeks/regenerate",
  requireAdminPage("/admin/journals", "edit"),
  async (req, res): Promise<void> => {
    if (!req.isAuthenticated() || req.user.role !== "admin") {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
    const result = await regenerateProgrammeWeeks();
    res.json(result);
  },
);

const ToggleBody = z.object({
  isOpen: z.boolean(),
});

// Admin: flip a single week's toggle (sets manualOverride=true so cron won't undo it).
router.patch(
  "/admin/programme-weeks/:id",
  requireAdminPage("/admin/journals", "edit"),
  async (req, res): Promise<void> => {
    if (!req.isAuthenticated() || req.user.role !== "admin") {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }
    const parsed = ToggleBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const [updated] = await db
      .update(programmeWeeksTable)
      .set({ isOpen: parsed.data.isOpen, manualOverride: true })
      .where(eq(programmeWeeksTable.id, id))
      .returning();
    if (!updated) {
      res.status(404).json({ error: "Week not found" });
      return;
    }
    res.json(updated);
  },
);

// Admin: clear manual override on a week (cron resumes auto-control).
router.post(
  "/admin/programme-weeks/:id/clear-override",
  requireAdminPage("/admin/journals", "edit"),
  async (req, res): Promise<void> => {
    if (!req.isAuthenticated() || req.user.role !== "admin") {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }
    const today = todayIso();
    const [existing] = await db
      .select()
      .from(programmeWeeksTable)
      .where(eq(programmeWeeksTable.id, id))
      .limit(1);
    if (!existing) {
      res.status(404).json({ error: "Week not found" });
      return;
    }
    const naturalIsOpen = existing.startDate <= today;
    const [updated] = await db
      .update(programmeWeeksTable)
      .set({ manualOverride: false, isOpen: naturalIsOpen })
      .where(eq(programmeWeeksTable.id, id))
      .returning();
    res.json(updated);
  },
);

// Admin: reminder service settings (master toggles for in-app + email).
router.get("/admin/reminder-settings", async (req, res): Promise<void> => {
  if (!req.isAuthenticated() || req.user.role !== "admin") {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  const settings = await getReminderSettings();
  const allowPastWeekEdits = await getAllowPastWeekEdits();
  const emailControls = await getEmailControls();
  const callerIsSuperAdmin = await isCallerSuperAdmin(req.user.id);
  res.json({ ...settings, allowPastWeekEdits, emailControls, callerIsSuperAdmin });
});

async function isCallerSuperAdmin(userId: string): Promise<boolean> {
  const [row] = await db
    .select({ isSuperAdmin: usersTable.isSuperAdmin })
    .from(usersTable)
    .where(eq(usersTable.id, userId))
    .limit(1);
  return row?.isSuperAdmin === true;
}

const ReminderSettingsBody = z.object({
  notificationsEnabled: z.boolean().optional(),
  emailsEnabled: z.boolean().optional(),
  coordinatorNotificationsEnabled: z.boolean().optional(),
  allowPastWeekEdits: z.boolean().optional(),
  // Partial map of per-category email kill switches. Super admins only.
  emailControls: z
    .partialRecord(z.enum(EMAIL_CATEGORIES), z.boolean())
    .optional(),
});

router.patch(
  "/admin/reminder-settings",
  requireAdminPage("/admin/journals", "edit"),
  async (req, res): Promise<void> => {
    if (!req.isAuthenticated() || req.user.role !== "admin") {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
    const parsed = ReminderSettingsBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    if (
      parsed.data.notificationsEnabled === undefined &&
      parsed.data.emailsEnabled === undefined &&
      parsed.data.coordinatorNotificationsEnabled === undefined &&
      parsed.data.allowPastWeekEdits === undefined &&
      (parsed.data.emailControls === undefined ||
        Object.keys(parsed.data.emailControls).length === 0)
    ) {
      res.status(400).json({ error: "Provide at least one toggle" });
      return;
    }

    // Email kill switches are super-admin only.
    const callerIsSuperAdmin = await isCallerSuperAdmin(req.user.id);
    if (
      parsed.data.emailControls !== undefined &&
      Object.keys(parsed.data.emailControls).length > 0 &&
      !callerIsSuperAdmin
    ) {
      res
        .status(403)
        .json({ error: "Only super admins can change email controls" });
      return;
    }

    // Reminders, journal-edit permission and the email kill switches are
    // OPERATIONAL settings for the season that is actually running — the crons
    // that consume them have no viewer. So this page always reads and writes the
    // ACTIVE season's row, never the one the admin happens to be browsing.
    // getEmailControls() reads the same row for the same reason.
    const configs = [await getConfig(await getActiveSeasonId())];

    const update: Partial<typeof programmeConfigTable.$inferInsert> = {};
    if (parsed.data.notificationsEnabled !== undefined) {
      update.reminderNotificationsEnabled = parsed.data.notificationsEnabled;
    }
    if (parsed.data.emailsEnabled !== undefined) {
      update.reminderEmailsEnabled = parsed.data.emailsEnabled;
    }
    if (parsed.data.coordinatorNotificationsEnabled !== undefined) {
      update.coordinatorNotificationsEnabled =
        parsed.data.coordinatorNotificationsEnabled;
    }
    if (parsed.data.allowPastWeekEdits !== undefined) {
      update.allowPastWeekEdits = parsed.data.allowPastWeekEdits;
    }
    if (
      parsed.data.emailControls !== undefined &&
      Object.keys(parsed.data.emailControls).length > 0
    ) {
      // Merge into the stored map so unrelated keys are preserved.
      const existing =
        configs[0].emailControls &&
        typeof configs[0].emailControls === "object" &&
        !Array.isArray(configs[0].emailControls)
          ? (configs[0].emailControls as Record<string, boolean>)
          : {};
      update.emailControls = { ...existing, ...parsed.data.emailControls };
    }

    await db
      .update(programmeConfigTable)
      .set(update)
      .where(eq(programmeConfigTable.id, configs[0].id));
    invalidateEmailControlsCache();

    const settings = await getReminderSettings();
    const allowPastWeekEdits = await getAllowPastWeekEdits();
    const emailControls = await getEmailControls();
    res.json({
      ...settings,
      allowPastWeekEdits,
      emailControls,
      callerIsSuperAdmin,
    });
  },
);

// Student-facing: list of weeks that are currently open for journal submission.
router.get("/journals/open-weeks", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const rows = await db
    .select({
      id: programmeWeeksTable.id,
      weekNumber: programmeWeeksTable.weekNumber,
      startDate: programmeWeeksTable.startDate,
      endDate: programmeWeeksTable.endDate,
    })
    .from(programmeWeeksTable)
    .where(eq(programmeWeeksTable.isOpen, true))
    .orderBy(asc(programmeWeeksTable.weekNumber));
  res.json(rows);
});

export default router;
