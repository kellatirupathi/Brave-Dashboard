/**
 * Evaluation routes — assignment, the five-state decision, appeals, audit.
 *
 * ISOLATION: additive. Deleting the feature means removing
 * `router.use(reviewRouter)` in routes/index.ts plus its import.
 *
 * IMPORTANT — this layer does NOT change revenue_entries.status.
 *
 * An evaluator's decision is recorded on the assignment as a recommendation.
 * The money is still verified or rejected through the EXISTING coordinator
 * endpoints in financials.ts, untouched. Two reasons:
 *   1. It keeps every existing screen, export and milestone trigger working
 *      exactly as before — this feature cannot break Season 1 accounting.
 *   2. It keeps the two judgements distinguishable in the record: what the
 *      evaluator concluded, and what was actually booked. Collapsing them would
 *      destroy the very audit trail Phase 7 exists to create.
 */
import { Router, type IRouter, type Request, type Response } from "express";
import { z } from "zod";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import {
  db,
  revenueEntriesTable,
  reviewAppealsTable,
  reviewAssignmentsTable,
  reviewAuditSamplesTable,
  teamMembersTable,
  teamsTable,
  usersTable,
} from "@workspace/db";
import { resolveSeason } from "../lib/season";
import {
  checkConflict,
  computeSignals,
  computeSla,
  eligibleEvaluators,
  pausesClock,
  shouldAudit,
  slaDueFromNow,
} from "../lib/evaluation";
import { getTrustSummary } from "../lib/trust-score";
import { logger } from "../lib/logger";

const router: IRouter = Router();

const OPEN_DECISIONS = ["pending", "hold", "changes_requested"] as const;

function isStaff(req: Request): boolean {
  return req.user?.role === "admin" || req.user?.role === "coordinator";
}

/** An evaluator is any user with the flag — the flag composes with their role. */
async function isEvaluator(userId: string): Promise<boolean> {
  const [u] = await db
    .select({ f: usersTable.isEvaluator })
    .from(usersTable)
    .where(eq(usersTable.id, userId))
    .limit(1);
  return !!u?.f;
}

// ── The evaluator's own queue ───────────────────────────────────────────────

router.get(
  "/review/queue",
  async (req: Request, res: Response): Promise<void> => {
    if (!req.isAuthenticated()) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    if (!(await isEvaluator(req.user.id)) && !isStaff(req)) {
      res.status(403).json({ error: "Evaluators only" });
      return;
    }
    const season = await resolveSeason(req);

    const rows = await db
      .select({
        a: reviewAssignmentsTable,
        teamName: teamsTable.name,
        clientName: revenueEntriesTable.clientName,
        amount: revenueEntriesTable.amount,
        entryStatus: revenueEntriesTable.status,
      })
      .from(reviewAssignmentsTable)
      .leftJoin(teamsTable, eq(teamsTable.id, reviewAssignmentsTable.teamId))
      .leftJoin(
        revenueEntriesTable,
        eq(revenueEntriesTable.id, reviewAssignmentsTable.revenueEntryId),
      )
      .where(
        and(
          eq(reviewAssignmentsTable.seasonId, season),
          eq(reviewAssignmentsTable.evaluatorId, req.user.id),
          inArray(reviewAssignmentsTable.decision, [...OPEN_DECISIONS]),
        ),
      );

    // Ordered by how little time is left. A paused clock sorts last, because
    // nothing is expected of the evaluator while the student is responding.
    const items = rows
      .map((r) => ({
        ...r.a,
        teamName: r.teamName,
        clientName: r.clientName,
        amount: r.amount,
        entryStatus: r.entryStatus,
        sla: computeSla(r.a),
      }))
      .sort((x, y) => {
        if (x.sla.paused !== y.sla.paused) return x.sla.paused ? 1 : -1;
        return (
          (x.sla.remainingMinutes ?? Infinity) -
          (y.sla.remainingMinutes ?? Infinity)
        );
      });

    res.json(items);
  },
);

// ── The review pane ────────────────────────────────────────────────────────

router.get(
  "/review/assignments/:id",
  async (req: Request, res: Response): Promise<void> => {
    if (!req.isAuthenticated()) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    const id = Number(req.params["id"]);
    if (!Number.isInteger(id) || id <= 0) {
      res.status(400).json({ error: "Invalid assignment id" });
      return;
    }
    const [a] = await db
      .select()
      .from(reviewAssignmentsTable)
      .where(eq(reviewAssignmentsTable.id, id))
      .limit(1);
    if (!a) {
      res.status(404).json({ error: "Assignment not found" });
      return;
    }
    if (a.evaluatorId !== req.user.id && !isStaff(req)) {
      res.status(403).json({ error: "Not your assignment" });
      return;
    }

    const [entry] = await db
      .select()
      .from(revenueEntriesTable)
      .where(eq(revenueEntriesTable.id, a.revenueEntryId))
      .limit(1);

    res.json({
      assignment: a,
      sla: computeSla(a),
      // The signals stored AT ASSIGNMENT, never recomputed — the evaluator and
      // any later auditor must be looking at the same numbers.
      signals: a.signals,
      entry,
      // The composed BRD is the document under review. Season 1 entries have
      // brdUrl instead; both are returned so one pane can render either.
      brd: entry?.brdComposed ?? null,
      brdUrl: entry?.brdUrl ?? null,
      trust: await getTrustSummary(a.teamId, a.seasonId),
    });
  },
);

// ── Assignment ─────────────────────────────────────────────────────────────

const AssignBody = z.object({
  revenueEntryId: z.number().int().positive(),
  /** Omit to let the server pick the least-loaded eligible evaluator. */
  evaluatorId: z.string().trim().min(1).optional(),
  slaHours: z.number().int().min(1).max(720).optional(),
});

router.post(
  "/admin/review/assign",
  async (req: Request, res: Response): Promise<void> => {
    if (!req.isAuthenticated()) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    if (!isStaff(req)) {
      res.status(403).json({ error: "Coordinators and admins only" });
      return;
    }
    const parsed = AssignBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const season = await resolveSeason(req);

    const [entry] = await db
      .select()
      .from(revenueEntriesTable)
      .where(eq(revenueEntriesTable.id, parsed.data.revenueEntryId))
      .limit(1);
    if (!entry) {
      res.status(404).json({ error: "Submission not found" });
      return;
    }

    let evaluatorId = parsed.data.evaluatorId;
    if (!evaluatorId) {
      const pool = await eligibleEvaluators(entry.teamId, season);
      // Skip anyone already holding this submission, so a re-assign moves it on
      // rather than colliding with the existing row.
      const taken = new Set(
        (
          await db
            .select({ e: reviewAssignmentsTable.evaluatorId })
            .from(reviewAssignmentsTable)
            .where(eq(reviewAssignmentsTable.revenueEntryId, entry.id))
        ).map((r) => r.e),
      );
      evaluatorId = pool.find((p) => !taken.has(p.id))?.id;
      if (!evaluatorId) {
        res.status(409).json({
          error:
            "No eligible evaluator is available for this team. Every evaluator is either on the same campus, on the team, or already assigned.",
          code: "NO_ELIGIBLE_EVALUATOR",
        });
        return;
      }
    }

    // Conflict is checked HERE, at creation — never at decision time, by which
    // point the evaluator has already read the submission.
    const conflict = await checkConflict(evaluatorId, entry.teamId);
    if (!conflict.eligible) {
      res.status(409).json({
        error: "That evaluator cannot review this team.",
        code: "CONFLICT_OF_INTEREST",
        reasons: conflict.reasons,
      });
      return;
    }

    const signals = await computeSignals(entry.id);

    try {
      const [created] = await db
        .insert(reviewAssignmentsTable)
        .values({
          seasonId: season,
          revenueEntryId: entry.id,
          teamId: entry.teamId,
          evaluatorId,
          slaDueAt: slaDueFromNow(parsed.data.slaHours),
          signals,
        })
        .returning();
      res.status(201).json({ ...created, sla: computeSla(created!) });
    } catch (err) {
      if ((err as { code?: string })?.code === "23505") {
        res.status(409).json({
          error: "That evaluator already has this submission.",
          code: "ALREADY_ASSIGNED",
        });
        return;
      }
      logger.error({ err }, "[review] assign failed");
      res.status(500).json({ error: "Could not create the assignment." });
    }
  },
);

// ── The decision ───────────────────────────────────────────────────────────

const DecisionBody = z.object({
  decision: z.enum([
    "pending",
    "hold",
    "changes_requested",
    "approved",
    "rejected",
  ]),
  note: z.string().trim().max(4000).optional(),
});

const TERMINAL = ["approved", "rejected"] as const;

router.patch(
  "/review/assignments/:id/decision",
  async (req: Request, res: Response): Promise<void> => {
    if (!req.isAuthenticated()) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    const id = Number(req.params["id"]);
    if (!Number.isInteger(id) || id <= 0) {
      res.status(400).json({ error: "Invalid assignment id" });
      return;
    }
    const parsed = DecisionBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const { decision, note } = parsed.data;

    const [a] = await db
      .select()
      .from(reviewAssignmentsTable)
      .where(eq(reviewAssignmentsTable.id, id))
      .limit(1);
    if (!a) {
      res.status(404).json({ error: "Assignment not found" });
      return;
    }
    // Only the assigned evaluator decides. An admin can re-assign, but cannot
    // put words in an evaluator's mouth.
    if (a.evaluatorId !== req.user.id) {
      res.status(403).json({ error: "Not your assignment" });
      return;
    }
    if ((TERMINAL as readonly string[]).includes(a.decision)) {
      res.status(409).json({
        error: "This review is already closed. Raise an appeal to revisit it.",
        code: "ALREADY_DECIDED",
      });
      return;
    }

    // A decision the team has to act on, or that goes against them, must say
    // why — one delivered without a reason is neither reviewable nor fair.
    //
    // `approved` needs no note (nothing is being asked of anyone), and neither
    // does `pending`: moving back to pending is how an evaluator RESUMES after
    // the student has responded, and demanding a fresh justification to pick
    // work back up would be pure friction.
    const NEEDS_REASON = ["hold", "changes_requested", "rejected"];
    if (NEEDS_REASON.includes(decision) && !note?.trim()) {
      res.status(400).json({
        error:
          decision === "changes_requested"
            ? "Say what the team needs to supply."
            : "Give a reason for this decision.",
      });
      return;
    }

    // ── Clock handling ────────────────────────────────────────────────────
    // Entering changes_requested stops the clock; leaving it banks the elapsed
    // pause. hold does NOT stop the clock — see lib/evaluation.ts pausesClock().
    const now = new Date();
    const wasPaused = a.clockPausedAt != null;
    const willPause = pausesClock(decision);

    let pausedSeconds = a.pausedSeconds;
    let clockPausedAt: Date | null = a.clockPausedAt;
    if (wasPaused && !willPause) {
      pausedSeconds += Math.max(
        0,
        Math.round((now.getTime() - a.clockPausedAt!.getTime()) / 1000),
      );
      clockPausedAt = null;
    } else if (!wasPaused && willPause) {
      clockPausedAt = now;
    }

    const [updated] = await db
      .update(reviewAssignmentsTable)
      .set({
        decision,
        decisionNote: note ?? null,
        pausedSeconds,
        clockPausedAt,
        decidedAt: (TERMINAL as readonly string[]).includes(decision)
          ? now
          : null,
      })
      .where(eq(reviewAssignmentsTable.id, id))
      .returning();

    // Audit sampling on approval only. A rejection is already a close look;
    // it is the approvals that need independent checking.
    let sampled = false;
    if (decision === "approved") {
      try {
        const trust = await getTrustSummary(a.teamId, a.seasonId);
        if (shouldAudit(a.revenueEntryId, trust.tier)) {
          await db.insert(reviewAuditSamplesTable).values({
            seasonId: a.seasonId,
            assignmentId: a.id,
            revenueEntryId: a.revenueEntryId,
          });
          sampled = true;
        }
      } catch (err) {
        // 23505 = already sampled. Anything else must not fail the decision.
        if ((err as { code?: string })?.code !== "23505") {
          logger.error({ err, id }, "[review] audit sampling failed");
        }
      }
    }

    res.json({ ...updated, sla: computeSla(updated!), sampled });
  },
);

// ── Appeals ────────────────────────────────────────────────────────────────

const AppealBody = z.object({
  revenueEntryId: z.number().int().positive(),
  reason: z.string().trim().min(20, "Explain what you think was missed."),
  evidence: z.array(z.string().trim().max(2000)).max(10).optional(),
});

router.post(
  "/review/appeals",
  async (req: Request, res: Response): Promise<void> => {
    if (!req.isAuthenticated()) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    const parsed = AppealBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const season = await resolveSeason(req);

    const [entry] = await db
      .select()
      .from(revenueEntriesTable)
      .where(eq(revenueEntriesTable.id, parsed.data.revenueEntryId))
      .limit(1);
    if (!entry) {
      res.status(404).json({ error: "Submission not found" });
      return;
    }

    // Only the team's own members may appeal for it.
    const [member] = await db
      .select({ u: teamMembersTable.userId })
      .from(teamMembersTable)
      .where(
        and(
          eq(teamMembersTable.teamId, entry.teamId),
          eq(teamMembersTable.userId, req.user.id),
        ),
      )
      .limit(1);
    if (!member && !isStaff(req)) {
      res.status(403).json({ error: "Not your team's submission" });
      return;
    }

    // The most recent closed assignment is what is being appealed.
    const [assignment] = await db
      .select({ id: reviewAssignmentsTable.id })
      .from(reviewAssignmentsTable)
      .where(
        and(
          eq(reviewAssignmentsTable.revenueEntryId, entry.id),
          inArray(reviewAssignmentsTable.decision, [...TERMINAL]),
        ),
      )
      .orderBy(desc(reviewAssignmentsTable.decidedAt))
      .limit(1);

    try {
      const [created] = await db
        .insert(reviewAppealsTable)
        .values({
          seasonId: season,
          revenueEntryId: entry.id,
          teamId: entry.teamId,
          assignmentId: assignment?.id ?? null,
          reason: parsed.data.reason,
          evidence: parsed.data.evidence ?? null,
          raisedBy: req.user.id,
        })
        .returning();
      res.status(201).json(created);
    } catch (err) {
      // The partial unique index on open appeals surfaces here.
      if ((err as { code?: string })?.code === "23505") {
        res.status(409).json({
          error:
            "You already have an open appeal on this submission. Wait for it to be decided.",
          code: "APPEAL_ALREADY_OPEN",
        });
        return;
      }
      logger.error({ err }, "[review] appeal failed");
      res.status(500).json({ error: "Could not raise the appeal." });
    }
  },
);

const AppealDecisionBody = z.object({
  status: z.enum(["upheld", "declined"]),
  outcomeNote: z.string().trim().min(10, "Explain the outcome."),
});

router.patch(
  "/admin/review/appeals/:id",
  async (req: Request, res: Response): Promise<void> => {
    if (!req.isAuthenticated()) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    if (!isStaff(req)) {
      res.status(403).json({ error: "Coordinators and admins only" });
      return;
    }
    const id = Number(req.params["id"]);
    if (!Number.isInteger(id) || id <= 0) {
      res.status(400).json({ error: "Invalid appeal id" });
      return;
    }
    const parsed = AppealDecisionBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }

    const [appeal] = await db
      .select()
      .from(reviewAppealsTable)
      .where(eq(reviewAppealsTable.id, id))
      .limit(1);
    if (!appeal) {
      res.status(404).json({ error: "Appeal not found" });
      return;
    }
    if (appeal.status !== "open") {
      res.status(409).json({ error: "This appeal is already closed." });
      return;
    }

    // An appeal must be decided by someone other than the original evaluator —
    // otherwise it is the same person marking their own work.
    if (appeal.assignmentId != null) {
      const [orig] = await db
        .select({ e: reviewAssignmentsTable.evaluatorId })
        .from(reviewAssignmentsTable)
        .where(eq(reviewAssignmentsTable.id, appeal.assignmentId))
        .limit(1);
      if (orig?.e === req.user.id) {
        res.status(409).json({
          error:
            "You made the original decision, so you cannot decide this appeal.",
          code: "SAME_EVALUATOR",
        });
        return;
      }
    }

    const [updated] = await db
      .update(reviewAppealsTable)
      .set({
        status: parsed.data.status,
        outcomeNote: parsed.data.outcomeNote,
        decidedBy: req.user.id,
        decidedAt: new Date(),
      })
      .where(eq(reviewAppealsTable.id, id))
      .returning();
    res.json(updated);
  },
);

router.get(
  "/admin/review/appeals",
  async (req: Request, res: Response): Promise<void> => {
    if (!req.isAuthenticated()) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    if (!isStaff(req)) {
      res.status(403).json({ error: "Coordinators and admins only" });
      return;
    }
    const season = await resolveSeason(req);
    const rows = await db
      .select({
        appeal: reviewAppealsTable,
        teamName: teamsTable.name,
      })
      .from(reviewAppealsTable)
      .leftJoin(teamsTable, eq(teamsTable.id, reviewAppealsTable.teamId))
      .where(eq(reviewAppealsTable.seasonId, season))
      .orderBy(desc(reviewAppealsTable.raisedAt));
    res.json(rows);
  },
);

// ── Audit queue ────────────────────────────────────────────────────────────

router.get(
  "/admin/review/audits",
  async (req: Request, res: Response): Promise<void> => {
    if (!req.isAuthenticated()) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    if (!isStaff(req)) {
      res.status(403).json({ error: "Coordinators and admins only" });
      return;
    }
    const season = await resolveSeason(req);
    const rows = await db
      .select()
      .from(reviewAuditSamplesTable)
      .where(eq(reviewAuditSamplesTable.seasonId, season))
      .orderBy(desc(reviewAuditSamplesTable.sampledAt));

    // Agreement rate measures the REVIEW PROCESS, not the students — it is the
    // number that says whether evaluation is working.
    const done = rows.filter((r) => r.agreed !== null);
    res.json({
      samples: rows,
      completed: done.length,
      agreementRate:
        done.length > 0
          ? Math.round(
              (done.filter((r) => r.agreed === true).length / done.length) * 100,
            )
          : null,
    });
  },
);

const AuditOutcomeBody = z.object({
  agreed: z.boolean(),
  note: z.string().trim().max(4000).optional(),
});

router.patch(
  "/admin/review/audits/:id",
  async (req: Request, res: Response): Promise<void> => {
    if (!req.isAuthenticated()) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    if (!isStaff(req)) {
      res.status(403).json({ error: "Coordinators and admins only" });
      return;
    }
    const id = Number(req.params["id"]);
    if (!Number.isInteger(id) || id <= 0) {
      res.status(400).json({ error: "Invalid audit id" });
      return;
    }
    const parsed = AuditOutcomeBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    // A disagreement must be explained — it is a finding about a colleague's
    // decision, and an unexplained one is not actionable.
    if (!parsed.data.agreed && !parsed.data.note?.trim()) {
      res.status(400).json({ error: "Say what you would have decided instead." });
      return;
    }

    const [updated] = await db
      .update(reviewAuditSamplesTable)
      .set({
        agreed: parsed.data.agreed,
        note: parsed.data.note ?? null,
        auditorId: req.user.id,
        completedAt: new Date(),
      })
      .where(eq(reviewAuditSamplesTable.id, id))
      .returning();
    if (!updated) {
      res.status(404).json({ error: "Audit sample not found" });
      return;
    }
    res.json(updated);
  },
);

// ── Evaluator roster (admin) ────────────────────────────────────────────────

router.get(
  "/admin/review/evaluators",
  async (req: Request, res: Response): Promise<void> => {
    if (!req.isAuthenticated() || req.user.role !== "admin") {
      res.status(403).json({ error: "Admins only" });
      return;
    }
    const season = await resolveSeason(req);
    const rows = await db
      .select({
        id: usersTable.id,
        firstName: usersTable.firstName,
        lastName: usersTable.lastName,
        email: usersTable.email,
        campusId: usersTable.campusId,
        isActive: usersTable.isActive,
        openCount: sql<number>`(
          SELECT COUNT(*)::int FROM review_assignments ra
          WHERE ra.evaluator_id = ${usersTable.id}
            AND ra.season_id = ${season}
            AND ra.decision IN ('pending', 'hold', 'changes_requested')
        )`,
      })
      .from(usersTable)
      .where(eq(usersTable.isEvaluator, true));
    res.json(rows);
  },
);

const EvaluatorFlagBody = z.object({ isEvaluator: z.boolean() });

router.patch(
  "/admin/review/evaluators/:userId",
  async (req: Request, res: Response): Promise<void> => {
    if (!req.isAuthenticated() || req.user.role !== "admin") {
      res.status(403).json({ error: "Admins only" });
      return;
    }
    const parsed = EvaluatorFlagBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const userId = String(req.params["userId"] ?? "");
    if (!userId) {
      res.status(400).json({ error: "Invalid user id" });
      return;
    }

    // Removing the flag must not orphan open work. Reassign first.
    if (!parsed.data.isEvaluator) {
      const [open] = await db
        .select({ n: sql<number>`count(*)::int` })
        .from(reviewAssignmentsTable)
        .where(
          and(
            eq(reviewAssignmentsTable.evaluatorId, userId),
            inArray(reviewAssignmentsTable.decision, [...OPEN_DECISIONS]),
          ),
        );
      if ((open?.n ?? 0) > 0) {
        res.status(409).json({
          error: `This evaluator still has ${open?.n} open review${open?.n === 1 ? "" : "s"}. Reassign them first.`,
          code: "HAS_OPEN_ASSIGNMENTS",
        });
        return;
      }
    }

    const [updated] = await db
      .update(usersTable)
      .set({ isEvaluator: parsed.data.isEvaluator })
      .where(eq(usersTable.id, userId))
      .returning({ id: usersTable.id, isEvaluator: usersTable.isEvaluator });
    if (!updated) {
      res.status(404).json({ error: "User not found" });
      return;
    }
    res.json(updated);
  },
);

export default router;
