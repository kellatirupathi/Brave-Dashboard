import { Router, type IRouter } from "express";
import { eq, asc } from "drizzle-orm";
import { db, programmeWeeksTable, programmeConfigTable } from "@workspace/db";
import { z } from "zod/v4";
import { requireAdminPage } from "../lib/require-admin-page";

/**
 * Helper used by Module 5 cron and the heatmap manual-remind endpoint to
 * decide whether a given channel is enabled for the reminder service.
 * Returns all three flags from the singleton programme_config row,
 * defaulting to enabled when no row exists yet.
 *
 * - notificationsEnabled: in-app notifications to *students*
 * - emailsEnabled:        Brevo emails to *students*
 * - coordinatorNotificationsEnabled: in-app pings to coordinators (day-7 only)
 */
export async function getReminderSettings(): Promise<{
  notificationsEnabled: boolean;
  emailsEnabled: boolean;
  coordinatorNotificationsEnabled: boolean;
}> {
  const [config] = await db
    .select({
      notificationsEnabled: programmeConfigTable.reminderNotificationsEnabled,
      emailsEnabled: programmeConfigTable.reminderEmailsEnabled,
      coordinatorNotificationsEnabled:
        programmeConfigTable.coordinatorNotificationsEnabled,
    })
    .from(programmeConfigTable)
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
export async function getAllowPastWeekEdits(): Promise<boolean> {
  const [config] = await db
    .select({ allow: programmeConfigTable.allowPastWeekEdits })
    .from(programmeConfigTable)
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
export async function regenerateProgrammeWeeks(): Promise<{
  created: number;
  updated: number;
  removed: number;
  total: number;
}> {
  const [config] = await db.select().from(programmeConfigTable).limit(1);
  if (!config) {
    return { created: 0, updated: 0, removed: 0, total: 0 };
  }
  const start = (config.startDate ?? "").slice(0, 10);
  const end = (config.endDate ?? "").slice(0, 10);
  if (!start || !end) {
    return { created: 0, updated: 0, removed: 0, total: 0 };
  }

  const existing = await db.select().from(programmeWeeksTable);
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
export async function autoOpenDueWeeks(): Promise<number> {
  const today = todayIso();
  const all = await db
    .select()
    .from(programmeWeeksTable)
    .where(eq(programmeWeeksTable.manualOverride, false));
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
  res.json({ ...settings, allowPastWeekEdits });
});

const ReminderSettingsBody = z.object({
  notificationsEnabled: z.boolean().optional(),
  emailsEnabled: z.boolean().optional(),
  coordinatorNotificationsEnabled: z.boolean().optional(),
  allowPastWeekEdits: z.boolean().optional(),
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
      parsed.data.allowPastWeekEdits === undefined
    ) {
      res.status(400).json({ error: "Provide at least one toggle" });
      return;
    }

    // Ensure a programme_config row exists.
    let configs = await db.select().from(programmeConfigTable).limit(1);
    if (configs.length === 0) {
      const [created] = await db
        .insert(programmeConfigTable)
        .values({})
        .returning();
      configs = [created];
    }

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

    await db
      .update(programmeConfigTable)
      .set(update)
      .where(eq(programmeConfigTable.id, configs[0].id));

    const settings = await getReminderSettings();
    const allowPastWeekEdits = await getAllowPastWeekEdits();
    res.json({ ...settings, allowPastWeekEdits });
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
