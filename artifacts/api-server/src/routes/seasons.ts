/**
 * Seasons (additive, isolated — bypasses Orval codegen).
 *
 * Two concerns, deliberately in one file because they share the same table:
 *
 *   1. Season switching for every role. The dashboard reads the list, shows the
 *      1.0 / 2.0 badge, and remembers which one the viewer selected.
 *   2. The Season 1 archive controls. Marking a season read-only, activating a
 *      season, and the three per-capability write overrides.
 *
 * ISOLATION CONTRACT
 * - Nothing else imports from this file. Deleting it means removing the single
 *   `router.use(seasonsRouter)` line in routes/index.ts.
 * - Reads are open to any authenticated user; every write is admin-only, and
 *   the flags that change what students can do are SUPER-admin only.
 * - Every write is audit-logged and invalidates the season cache so the guard
 *   and resolver see the change immediately rather than up to 30s later.
 */
import { Router, type IRouter, type Request, type Response } from "express";
import { z } from "zod";
import { asc, eq, sql } from "drizzle-orm";
import {
  db,
  programmeConfigTable,
  programmeWeeksTable,
  seasonsTable,
  usersTable,
} from "@workspace/db";
import { invalidateSeasonCache, resolveSeason } from "../lib/season";
import {
  getSessionId,
  getSession,
  updateSession,
} from "../lib/auth";
import { logAudit } from "../lib/audit";
import { logger } from "../lib/logger";

const router: IRouter = Router();

/** Shape sent to the dashboard. Deliberately excludes nothing — no secrets here. */
/**
 * What ACTUALLY governs a season, as opposed to what its own row happens to
 * hold.
 *
 * Season dates live in two places, which is the root of a confusing bug:
 * `seasons.start_date` is set once at seeding and edited from the Seasons card,
 * while `programme_config.start_date` is what Config -> Programme Schedule
 * edits AND what programme weeks are generated from. An admin who set up
 * Season 2 through Programme Schedule therefore saw its weeks generate
 * correctly while the Seasons card still read "— → — · 12 weeks", because the
 * season row had never been touched.
 *
 * Rather than keep two copies in sync — which fails the first time someone
 * edits one and not the other — the card now shows the derived truth.
 */
type SeasonEffective = {
  effectiveStartDate: string | null;
  effectiveEndDate: string | null;
  actualWeekCount: number;
};

async function effectiveBySeason(): Promise<Map<number, SeasonEffective>> {
  const map = new Map<number, SeasonEffective>();
  try {
    const cfgs = await db
      .select({
        seasonId: programmeConfigTable.seasonId,
        startDate: programmeConfigTable.startDate,
        endDate: programmeConfigTable.endDate,
      })
      .from(programmeConfigTable);
    for (const c of cfgs) {
      map.set(c.seasonId, {
        effectiveStartDate: c.startDate ?? null,
        effectiveEndDate: c.endDate ?? null,
        actualWeekCount: 0,
      });
    }
    const weeks = await db
      .select({
        seasonId: programmeWeeksTable.seasonId,
        n: sql<number>`count(*)::int`,
      })
      .from(programmeWeeksTable)
      .groupBy(programmeWeeksTable.seasonId);
    for (const w of weeks) {
      const entry = map.get(w.seasonId) ?? {
        effectiveStartDate: null,
        effectiveEndDate: null,
        actualWeekCount: 0,
      };
      entry.actualWeekCount = Number(w.n ?? 0);
      map.set(w.seasonId, entry);
    }
  } catch (err) {
    // Fail soft: the card falls back to the season row's own values, which is
    // exactly the behaviour before this existed.
    logger.error({ err }, "[seasons] could not derive effective season dates");
  }
  return map;
}

function serialize(
  row: typeof seasonsTable.$inferSelect,
  effective?: SeasonEffective,
) {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    startDate: row.startDate,
    endDate: row.endDate,
    weekCount: row.weekCount,
    // Derived — what the programme actually runs on. Falls back to the row's
    // own values so a season with no config row still renders.
    effectiveStartDate: effective?.effectiveStartDate ?? row.startDate,
    effectiveEndDate: effective?.effectiveEndDate ?? row.endDate,
    actualWeekCount: effective?.actualWeekCount ?? 0,
    isActive: row.isActive,
    isStaffDefault: row.isStaffDefault,
    isReadOnly: row.isReadOnly,
    allowJournalWrites: row.allowJournalWrites,
    allowRevenueWrites: row.allowRevenueWrites,
    allowProjectWrites: row.allowProjectWrites,
  };
}

async function isCallerSuperAdmin(userId: string): Promise<boolean> {
  const [row] = await db
    .select({ isSuperAdmin: usersTable.isSuperAdmin })
    .from(usersTable)
    .where(eq(usersTable.id, userId))
    .limit(1);
  return !!row?.isSuperAdmin;
}

// ── Reads: any authenticated user ────────────────────────────────────────

/**
 * Every season, plus which one this viewer is currently looking at. The
 * dashboard uses `viewing` to render the badge and the switcher chip without a
 * second round-trip.
 */
router.get("/seasons", async (req: Request, res: Response): Promise<void> => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const rows = await db.select().from(seasonsTable).orderBy(asc(seasonsTable.id));
  const effective = await effectiveBySeason();
  res.json({
    seasons: rows.map((r) => serialize(r, effective.get(r.id))),
    viewing: await resolveSeason(req),
  });
});

router.get(
  "/seasons/active",
  async (req: Request, res: Response): Promise<void> => {
    if (!req.isAuthenticated()) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    const [row] = await db
      .select()
      .from(seasonsTable)
      .where(eq(seasonsTable.isActive, true))
      .limit(1);
    res.json(row ? serialize(row) : null);
  },
);

const SelectBody = z.object({ seasonId: z.number().int().positive() });

/**
 * Remember which season this viewer selected, so a page refresh keeps it.
 * Stored on the session row rather than a cookie so it cannot be tampered with
 * client-side. The `x-brave-season` header still overrides it per request.
 */
router.post(
  "/seasons/select",
  async (req: Request, res: Response): Promise<void> => {
    if (!req.isAuthenticated()) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    const parsed = SelectBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid seasonId" });
      return;
    }
    const [season] = await db
      .select({ id: seasonsTable.id })
      .from(seasonsTable)
      .where(eq(seasonsTable.id, parsed.data.seasonId))
      .limit(1);
    if (!season) {
      res.status(404).json({ error: "Unknown season" });
      return;
    }

    const sid = getSessionId(req);
    if (!sid) {
      res.status(401).json({ error: "No session" });
      return;
    }
    const session = await getSession(sid);
    if (!session) {
      res.status(401).json({ error: "No session" });
      return;
    }
    await updateSession(sid, {
      ...session,
      viewingSeasonId: parsed.data.seasonId,
    });
    res.json({ viewing: parsed.data.seasonId });
  },
);


// ── Readiness ────────────────────────────────────────────────────────────
//
// A season with no programme weeks is not usable: a student opening Weekly
// Journal has nothing to submit against. That is exactly what happened the
// first time Season 2 was activated, so the check below runs BEFORE an
// activation is allowed rather than being left to the admin to remember.

export type ReadinessCheck = {
  key: "dates" | "weeks" | "config";
  label: string;
  ok: boolean;
  detail: string;
};

/**
 * Is this season set up enough to be made live?
 *
 * Read-only and side-effect free — the Seasons card calls it to render a
 * checklist, and the activation handler calls the same function so the two can
 * never disagree about what "ready" means.
 */
async function checkReadiness(seasonId: number): Promise<ReadinessCheck[]> {
  const checks: ReadinessCheck[] = [];

  const [cfg] = await db
    .select({
      startDate: programmeConfigTable.startDate,
      endDate: programmeConfigTable.endDate,
    })
    .from(programmeConfigTable)
    .where(eq(programmeConfigTable.seasonId, seasonId))
    .limit(1);

  checks.push({
    key: "config",
    label: "Programme settings exist",
    ok: !!cfg,
    detail: cfg
      ? "This season has its own settings row."
      : "No settings row — restart the server to create one.",
  });

  const start = cfg?.startDate ?? "";
  const end = cfg?.endDate ?? "";
  // A season whose dates still sit in the past is almost certainly showing the
  // seeded defaults rather than dates anyone chose.
  const datesLookSet = !!start && !!end && end > start;
  checks.push({
    key: "dates",
    label: "Start and end dates set",
    ok: datesLookSet,
    detail: datesLookSet
      ? `${start} to ${end}`
      : "Set them in Config -> Programme Schedule while viewing this season.",
  });

  const weeks = await db
    .select({ id: programmeWeeksTable.id })
    .from(programmeWeeksTable)
    .where(eq(programmeWeeksTable.seasonId, seasonId));

  checks.push({
    key: "weeks",
    label: "Programme weeks generated",
    ok: weeks.length > 0,
    detail:
      weeks.length > 0
        ? `${weeks.length} week${weeks.length === 1 ? "" : "s"}.`
        : "None yet. Use Regenerate from dates in Config -> Programme Weeks.",
  });

  return checks;
}

/**
 * Readiness for one season. Any authenticated admin may read it; it exposes
 * nothing a season row does not already.
 */
router.get(
  "/seasons/:id/readiness",
  async (req: Request, res: Response): Promise<void> => {
    if (!req.isAuthenticated() || req.user.role !== "admin") {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
    const id = Number(req.params["id"]);
    if (!Number.isInteger(id) || id <= 0) {
      res.status(400).json({ error: "Invalid season id" });
      return;
    }
    try {
      const checks = await checkReadiness(id);
      res.json({ seasonId: id, checks, ready: checks.every((c) => c.ok) });
    } catch (err) {
      logger.error({ err, seasonId: id }, "[seasons] readiness check failed");
      // Fail OPEN: a readiness check that errors must not make a season look
      // broken, and the activation guard has its own independent check.
      res.json({ seasonId: id, checks: [], ready: true });
    }
  },
);

// ── Writes: admin only, and the student-facing flags super-admin only ────

const UpdateBody = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  startDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .optional(),
  endDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .optional(),
  weekCount: z.number().int().min(1).max(60).optional(),
  isActive: z.boolean().optional(),
  isStaffDefault: z.boolean().optional(),
  isReadOnly: z.boolean().optional(),
  allowJournalWrites: z.boolean().optional(),
  allowRevenueWrites: z.boolean().optional(),
  allowProjectWrites: z.boolean().optional(),
  /** Bypass the readiness guard. Deliberately not part of SUPER_ADMIN_ONLY —
   *  it changes nothing on its own, it only skips a warning. */
  force: z.boolean().optional(),
});

/**
 * Fields that change what STUDENTS can do, so they are super-admin only:
 * flipping the archive open or closed, and the three write overrides.
 * Renaming a season or adjusting its dates stays with any admin.
 */
const SUPER_ADMIN_ONLY = [
  "isActive",
  "isStaffDefault",
  "isReadOnly",
  "allowJournalWrites",
  "allowRevenueWrites",
  "allowProjectWrites",
] as const;

router.patch(
  "/admin/seasons/:id",
  async (req: Request, res: Response): Promise<void> => {
    if (!req.isAuthenticated() || req.user.role !== "admin") {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
    const id = Number(req.params["id"]);
    if (!Number.isInteger(id) || id <= 0) {
      res.status(400).json({ error: "Invalid season id" });
      return;
    }
    const parsed = UpdateBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    // `force` is a request option, not a column — pulled out here so it is
    // never written to the seasons row.
    const { force: forceActivate, ...patch } = parsed.data;
    if (Object.keys(patch).length === 0) {
      res.status(400).json({ error: "No fields to update" });
      return;
    }

    const touchesStudentBehaviour = SUPER_ADMIN_ONLY.some(
      (k) => patch[k] !== undefined,
    );
    if (touchesStudentBehaviour && !(await isCallerSuperAdmin(req.user.id))) {
      res.status(403).json({
        error:
          "Only super admins can open or close a season, or change its write overrides.",
      });
      return;
    }

    const [existing] = await db
      .select()
      .from(seasonsTable)
      .where(eq(seasonsTable.id, id))
      .limit(1);
    if (!existing) {
      res.status(404).json({ error: "Season not found" });
      return;
    }

    // ACTIVATION GUARD. Making a season live with no programme weeks leaves
    // every student unable to submit a journal, which is what happened the
    // first time Season 2 was switched on. Refuse rather than let it repeat.
    //
    // Only blocks ACTIVATION. Renaming, editing dates, or marking a season
    // read-only are all unaffected, and `force` is honoured for the rare case
    // where an admin genuinely knows better.
    if (patch.isActive === true && !forceActivate) {
      try {
        const checks = await checkReadiness(id);
        const failing = checks.filter((c) => !c.ok);
        if (failing.length > 0) {
          res.status(409).json({
            error: `${existing.name} is not ready to go live yet.`,
            code: "SEASON_NOT_READY",
            checks,
            failing: failing.map((c) => c.label),
          });
          return;
        }
      } catch (err) {
        // Fail OPEN — an infrastructure error must not block an admin from
        // running the programme.
        logger.error(
          { err, seasonId: id },
          "[seasons] readiness check errored; allowing activation",
        );
      }
    }

    // Exactly one season is active. Activating one stands the others down in
    // the same transaction, so there is never a moment with two actives (which
    // would make getActiveSeasonId() nondeterministic) or zero.
    const [updated] = await db.transaction(async (tx) => {
      if (patch.isActive === true) {
        await tx
          .update(seasonsTable)
          .set({ isActive: false })
          .where(eq(seasonsTable.isActive, true));
      }
      if (patch.isStaffDefault === true) {
        await tx
          .update(seasonsTable)
          .set({ isStaffDefault: false })
          .where(eq(seasonsTable.isStaffDefault, true));
      }
      return tx
        .update(seasonsTable)
        .set(patch)
        .where(eq(seasonsTable.id, id))
        .returning();
    });

    // The resolver and the write guard cache seasons for ~30s. Drop it now so
    // an admin closing Season 1 takes effect on the very next request rather
    // than up to half a minute later.
    invalidateSeasonCache();

    await logAudit(
      req.user.id,
      "update_season",
      "seasons",
      id,
      JSON.stringify(patch),
    );
    logger.info(
      { seasonId: id, patch, actorId: req.user.id },
      "[seasons] season updated",
    );

    res.json(updated ? serialize(updated) : null);
  },
);

export default router;
