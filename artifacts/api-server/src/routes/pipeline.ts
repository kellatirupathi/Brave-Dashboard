/**
 * Season 2 pipeline stages 3-5 — project, payments, composed BRD.
 *
 * ISOLATION CONTRACT
 * - Only this file and lib/{lead-pipeline,brd-composer,link-check}.ts touch the
 *   Season 2 pipeline tables.
 * - Deleting the feature means removing `router.use(pipelineRouter)` in
 *   routes/index.ts plus its import.
 * - Season 1 projects are unaffected: they carry `lead_id = NULL`, and every
 *   handler here refuses to operate on such a row.
 *
 * Gate B is enforced at creation (converted lead only). Gate C is evaluated by
 * the composer, so the checklist the student sees is the check that blocks.
 */
import { Router, type IRouter, type Request, type Response } from "express";
import { z } from "zod";
import { and, asc, eq, sql } from "drizzle-orm";
import {
  db,
  leadsTable,
  revenueEntriesTable,
  paymentScheduleTable,
  paymentsTable,
  projectPhasesTable,
  projectsTable,
  teamMembersTable,
} from "@workspace/db";
import { resolveSeason } from "../lib/season";
import {
  requireWritableSeason,
  requireLeadPipelineSeason,
} from "../middlewares/seasonGuard";
import { requireTeamLeader } from "../lib/auth";
import { composeBrd, renderBrdText } from "../lib/brd-composer";
import { blockingLinkFailures, checkLinks } from "../lib/link-check";
import { computeRecognition } from "../lib/trust-score";
import { areGatesEnforced } from "../lib/pipeline-gates";
import {
  allowLeadsAction,
  allowLeadsSubmit,
} from "../lib/leads-control";
import { logger } from "../lib/logger";

const router: IRouter = Router();

// EVERY endpoint below belongs to the Season 2 pipeline. Mounted here rather
// than tagged per-route so a new endpoint added later cannot forget it —
// the guard is a property of the router, not of each handler.
router.use(requireLeadPipelineSeason());

const DATE = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD");
const OptionalUrl = z.string().trim().url().max(2000).optional().or(z.literal(""));

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

async function getMyTeamId(userId: string): Promise<number | null> {
  const [m] = await db
    .select({ teamId: teamMembersTable.teamId })
    .from(teamMembersTable)
    .where(eq(teamMembersTable.userId, userId))
    .limit(1);
  return m?.teamId ?? null;
}

/**
 * Load a Season 2 pipeline project the caller is allowed to touch.
 * Refuses Season 1 projects outright — they have no trail to work from.
 */
async function loadPipelineProject(
  req: Request,
  res: Response,
  projectId: number,
): Promise<typeof projectsTable.$inferSelect | null> {
  const [project] = await db
    .select()
    .from(projectsTable)
    .where(eq(projectsTable.id, projectId))
    .limit(1);
  if (!project) {
    res.status(404).json({ error: "Project not found" });
    return null;
  }
  if (project.leadId == null) {
    res.status(400).json({
      error:
        "This is a Season 1 project. Its BRD was uploaded as a file and is not composed from a lead trail.",
      code: "NOT_A_PIPELINE_PROJECT",
    });
    return null;
  }
  const isStaff =
    req.user?.role === "admin" || req.user?.role === "coordinator";
  if (!isStaff) {
    const myTeam = await getMyTeamId(req.user!.id);
    if (myTeam !== project.teamId) {
      res.status(403).json({ error: "Not your team's project" });
      return null;
    }
  }
  return project;
}

async function ensureProjectNotSubmitted(
  res: Response,
  projectId: number,
): Promise<boolean> {
  const [entry] = await db
    .select({ id: revenueEntriesTable.id, status: revenueEntriesTable.status })
    .from(revenueEntriesTable)
    .where(eq(revenueEntriesTable.projectId, projectId))
    .limit(1);
  if (!entry || entry.status === "draft") return true;
  res.status(409).json({
    error:
      "This project has already been submitted for review. Its project, phases and payments are now frozen.",
    code: "PROJECT_ALREADY_SUBMITTED",
    entryId: entry.id,
  });
  return false;
}

async function refreshProjectContractValue(projectId: number): Promise<void> {
  await db
    .update(projectsTable)
    .set({
      totalContractValue: sql<number>`(
        SELECT COALESCE(SUM(amount), 0)::int
        FROM payment_schedule
        WHERE project_id = ${projectId}
      )`,
    })
    .where(eq(projectsTable.id, projectId));
}

// ── Stage 3: open the project (17 fields, 10 mandatory) ────────────────────

const PhaseInput = z.object({
  name: z.string().trim().min(1).max(200),
  deliverables: z.string().trim().max(2000).optional(),
  startDate: DATE.optional(),
  endDate: DATE.optional(),
  amount: z.number().int().min(0).max(100_000_000),
  dueDate: DATE.optional(),
  revenueType: z.enum(["one_time", "recurring"]).default("one_time"),
});

const CreateProjectBody = z.object({
  leadId: z.number().int().positive(),
  title: z.string().trim().min(1).max(200),
  serviceCategory: z.string().trim().min(1).max(120),
  problemStatement: z.string().trim().min(1).max(4000),
  solutionDescription: z.string().trim().min(1).max(4000),
  techStack: z.array(z.string().trim().max(60)).max(30).optional(),
  liveProductUrl: OptionalUrl,
  demoVideoUrl: OptionalUrl,
  sourceCodeUrl: OptionalUrl,
  prototypeUrl: OptionalUrl,
  demoCredentials: z.string().trim().max(500).optional(),
  revenueType: z.enum(["one_time", "recurring"]),
  recurringFrequency: z.enum(["monthly", "quarterly", "annual"]).optional(),
  agreementDoc: z.string().trim().max(2000).optional(),
  // Answer to "can anyone with this link view it?" — only asked for a link.
  agreementAccessConfirmed: z.boolean().optional(),
  // Phase-wise plan AND phase-wise payment in one shape, because a phase
  // without money and money without a phase were the two commonest Season 1
  // gaps. Minimum 2 phases is a hard requirement.
  phases: z.array(PhaseInput).min(2).max(12),
});

router.post(
  "/pipeline/projects",
  requireWritableSeason("project"),
  async (req: Request, res: Response): Promise<void> => {
    if (!req.isAuthenticated()) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    const parsed = CreateProjectBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const d = parsed.data;

    if (d.revenueType === "recurring" && !d.recurringFrequency) {
      res
        .status(400)
        .json({ error: "Tell us how often the recurring payment arrives." });
      return;
    }

    const [lead] = await db
      .select()
      .from(leadsTable)
      .where(eq(leadsTable.id, d.leadId))
      .limit(1);
    if (!lead) {
      res.status(404).json({ error: "Lead not found" });
      return;
    }
    if (
      !(await allowLeadsAction(
        req,
        res,
        lead.seasonId,
        "projects",
        "add",
      ))
    )
      return;
    if (!(await requireTeamLeader(req, res, lead.teamId))) return;

    // ── GATE B ────────────────────────────────────────────────────────────
    // A project descends from a CONVERTED lead. While the gates are ENFORCED
    // that is a hard rule. In advisory mode the project is allowed, and the
    // lead is moved to Converted as a side effect — a project starting IS the
    // client saying yes, and leaving the lead on "New" would make every
    // downstream view lie about it.
    const gatesEnforced = await areGatesEnforced(lead.seasonId);
    if (lead.stage !== "converted") {
      if (gatesEnforced) {
        res.status(409).json({
          error:
            "This lead is not converted yet. Work the lead until the client says yes, then convert it.",
          code: "GATE_B_NOT_MET",
          stage: lead.stage,
        });
        return;
      }
      await db
        .update(leadsTable)
        .set({ stage: "converted" })
        .where(eq(leadsTable.id, lead.id));
    }

    // One project per lead — otherwise the same relationship could be claimed
    // twice over.
    const [existing] = await db
      .select({ id: projectsTable.id })
      .from(projectsTable)
      .where(eq(projectsTable.leadId, d.leadId))
      .limit(1);
    if (existing) {
      res.status(409).json({
        error: "This lead already has a project.",
        code: "LEAD_ALREADY_HAS_PROJECT",
        projectId: existing.id,
      });
      return;
    }

    // Links are validated before the row is written, so a broken one never
    // reaches a reviewer. A timeout is NOT blocking — see lib/link-check.ts.
    const linkVerdicts = await checkLinks({
      liveProductUrl: d.liveProductUrl,
      demoVideoUrl: d.demoVideoUrl,
      sourceCodeUrl: d.sourceCodeUrl,
      prototypeUrl: d.prototypeUrl,
    });
    const blocking = blockingLinkFailures(linkVerdicts);
    if (blocking.length > 0) {
      res.status(400).json({
        error: "One or more links cannot be opened.",
        code: "LINK_UNREACHABLE",
        links: linkVerdicts,
      });
      return;
    }

    const season = await resolveSeason(req);
    const totalContractValue = d.phases.reduce((n, p) => n + p.amount, 0);

    try {
      const projectId = await db.transaction(async (tx) => {
        const [project] = await tx
          .insert(projectsTable)
          .values({
            teamId: lead.teamId,
            seasonId: season,
            title: d.title,
            // The legacy column is NOT NULL; the pipeline's richer fields live
            // alongside it, so mirror the solution text to keep both valid.
            description: d.solutionDescription,
            createdBy: req.user!.id,
            leadId: d.leadId,
            serviceCategory: d.serviceCategory,
            problemStatement: d.problemStatement,
            solutionDescription: d.solutionDescription,
            techStack: d.techStack ?? null,
            liveProductUrl: d.liveProductUrl || null,
            demoVideoUrl: d.demoVideoUrl || null,
            sourceCodeUrl: d.sourceCodeUrl || null,
            prototypeUrl: d.prototypeUrl || null,
            demoCredentials: d.demoCredentials ?? null,
            revenueType: d.revenueType,
            recurringFrequency: d.recurringFrequency ?? null,
            totalContractValue,
            agreementDoc: d.agreementDoc ?? null,
            agreementAccessConfirmed: d.agreementAccessConfirmed ?? null,
          })
          .returning();
        if (!project) throw new Error("project insert returned nothing");

        // Phases and their scheduled payments are written together, so a
        // schedule row can never reference a phase that does not exist.
        for (const [i, ph] of d.phases.entries()) {
          const [phase] = await tx
            .insert(projectPhasesTable)
            .values({
              projectId: project.id,
              sortOrder: i,
              name: ph.name,
              deliverables: ph.deliverables ?? null,
              startDate: ph.startDate ?? null,
              endDate: ph.endDate ?? null,
            })
            .returning();
          if (!phase) throw new Error("phase insert returned nothing");
          await tx.insert(paymentScheduleTable).values({
            projectId: project.id,
            phaseId: phase.id,
            amount: ph.amount,
            dueDate: ph.dueDate ?? null,
            revenueType: ph.revenueType,
          });
        }
        return project.id;
      });

      res.status(201).json({ projectId, links: linkVerdicts });
    } catch (err) {
      logger.error({ err }, "[pipeline] project creation failed");
      res.status(500).json({ error: "Could not create the project." });
    }
  },
);

const UpdateProjectBody = z
  .object({
    title: z.string().trim().min(1).max(200).optional(),
    serviceCategory: z.string().trim().min(1).max(120).optional(),
    problemStatement: z.string().trim().min(1).max(4000).optional(),
    solutionDescription: z.string().trim().min(1).max(4000).optional(),
    techStack: z.array(z.string().trim().max(60)).max(30).nullable().optional(),
    liveProductUrl: z.string().trim().url().max(2000).nullable().optional(),
    demoVideoUrl: z.string().trim().url().max(2000).nullable().optional(),
    sourceCodeUrl: z.string().trim().url().max(2000).nullable().optional(),
    prototypeUrl: z.string().trim().url().max(2000).nullable().optional(),
    demoCredentials: z.string().trim().max(500).nullable().optional(),
    agreementDoc: z.string().trim().max(2000).nullable().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, "No changes provided");

router.patch(
  "/pipeline/projects/:id",
  requireWritableSeason("project"),
  async (req: Request, res: Response): Promise<void> => {
    if (!req.isAuthenticated()) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    const id = Number(req.params["id"]);
    if (!Number.isInteger(id) || id <= 0) {
      res.status(400).json({ error: "Invalid project id" });
      return;
    }
    const parsed = UpdateProjectBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const project = await loadPipelineProject(req, res, id);
    if (!project) return;
    if (!(await requireTeamLeader(req, res, project.teamId))) return;
    if (
      !(await allowLeadsAction(
        req,
        res,
        project.seasonId,
        "projects",
        "edit",
      ))
    )
      return;
    if (!(await ensureProjectNotSubmitted(res, id))) return;

    const candidateLinks = {
      liveProductUrl:
        parsed.data.liveProductUrl === undefined
          ? project.liveProductUrl
          : parsed.data.liveProductUrl,
      demoVideoUrl:
        parsed.data.demoVideoUrl === undefined
          ? project.demoVideoUrl
          : parsed.data.demoVideoUrl,
      sourceCodeUrl:
        parsed.data.sourceCodeUrl === undefined
          ? project.sourceCodeUrl
          : parsed.data.sourceCodeUrl,
      prototypeUrl:
        parsed.data.prototypeUrl === undefined
          ? project.prototypeUrl
          : parsed.data.prototypeUrl,
    };
    const linkVerdicts = await checkLinks(candidateLinks);
    const blocking = blockingLinkFailures(linkVerdicts);
    if (blocking.length > 0) {
      res.status(400).json({
        error: "One or more links cannot be opened.",
        code: "LINK_UNREACHABLE",
        links: linkVerdicts,
      });
      return;
    }
    const patch = { ...parsed.data } as Record<string, unknown>;
    if (parsed.data.solutionDescription !== undefined) {
      patch.description = parsed.data.solutionDescription;
    }
    const [updated] = await db
      .update(projectsTable)
      .set(patch)
      .where(eq(projectsTable.id, id))
      .returning();
    res.json(updated);
  },
);

router.delete(
  "/pipeline/projects/:id",
  requireWritableSeason("project"),
  async (req: Request, res: Response): Promise<void> => {
    if (!req.isAuthenticated()) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    const id = Number(req.params["id"]);
    if (!Number.isInteger(id) || id <= 0) {
      res.status(400).json({ error: "Invalid project id" });
      return;
    }
    const project = await loadPipelineProject(req, res, id);
    if (!project) return;
    if (!(await requireTeamLeader(req, res, project.teamId))) return;
    if (
      !(await allowLeadsAction(
        req,
        res,
        project.seasonId,
        "projects",
        "delete",
      ))
    )
      return;
    if (!(await ensureProjectNotSubmitted(res, id))) return;
    const [payment] = await db
      .select({ id: paymentsTable.id })
      .from(paymentsTable)
      .where(eq(paymentsTable.projectId, id))
      .limit(1);
    if (payment) {
      res.status(409).json({
        error:
          "This project has recorded payments. Delete those payments before deleting the project.",
        code: "PROJECT_HAS_PAYMENTS",
      });
      return;
    }
    await db.transaction(async (tx) => {
      await tx
        .delete(paymentScheduleTable)
        .where(eq(paymentScheduleTable.projectId, id));
      await tx
        .delete(projectPhasesTable)
        .where(eq(projectPhasesTable.projectId, id));
      await tx.delete(projectsTable).where(eq(projectsTable.id, id));
    });
    res.status(204).end();
  },
);

// ── project detail ──────────────────────────────────────────────────────────

router.get(
  "/pipeline/projects/:id",
  async (req: Request, res: Response): Promise<void> => {
    if (!req.isAuthenticated()) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    const id = Number(req.params["id"]);
    if (!Number.isInteger(id) || id <= 0) {
      res.status(400).json({ error: "Invalid project id" });
      return;
    }
    const project = await loadPipelineProject(req, res, id);
    if (!project) return;

    const phases = await db
      .select()
      .from(projectPhasesTable)
      .where(eq(projectPhasesTable.projectId, id))
      .orderBy(asc(projectPhasesTable.sortOrder));
    const schedule = await db
      .select()
      .from(paymentScheduleTable)
      .where(eq(paymentScheduleTable.projectId, id));
    const payments = await db
      .select()
      .from(paymentsTable)
      .where(eq(paymentsTable.projectId, id))
      .orderBy(asc(paymentsTable.paymentDate));

    res.json({ project, phases, schedule, payments });
  },
);

router.post(
  "/pipeline/projects/:id/phases",
  requireWritableSeason("project"),
  async (req: Request, res: Response): Promise<void> => {
    if (!req.isAuthenticated()) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    const id = Number(req.params["id"]);
    if (!Number.isInteger(id) || id <= 0) {
      res.status(400).json({ error: "Invalid project id" });
      return;
    }
    const parsed = PhaseInput.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const project = await loadPipelineProject(req, res, id);
    if (!project) return;
    if (!(await requireTeamLeader(req, res, project.teamId))) return;
    if (
      !(await allowLeadsAction(
        req,
        res,
        project.seasonId,
        "phases",
        "add",
      ))
    )
      return;
    if (!(await ensureProjectNotSubmitted(res, id))) return;
    const existing = await db
      .select({ id: projectPhasesTable.id })
      .from(projectPhasesTable)
      .where(eq(projectPhasesTable.projectId, id));
    if (existing.length >= 12) {
      res.status(409).json({ error: "A project can have at most 12 phases." });
      return;
    }
    const d = parsed.data;
    const created = await db.transaction(async (tx) => {
      const [phase] = await tx
        .insert(projectPhasesTable)
        .values({
          projectId: id,
          sortOrder: existing.length,
          name: d.name,
          deliverables: d.deliverables ?? null,
          startDate: d.startDate ?? null,
          endDate: d.endDate ?? null,
        })
        .returning();
      if (!phase) throw new Error("phase insert returned nothing");
      const [schedule] = await tx
        .insert(paymentScheduleTable)
        .values({
          projectId: id,
          phaseId: phase.id,
          amount: d.amount,
          dueDate: d.dueDate ?? null,
          revenueType: d.revenueType,
        })
        .returning();
      return { phase, schedule };
    });
    await refreshProjectContractValue(id);
    res.status(201).json(created);
  },
);

router.patch(
  "/pipeline/projects/:id/phases/:phaseId",
  requireWritableSeason("project"),
  async (req: Request, res: Response): Promise<void> => {
    if (!req.isAuthenticated()) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    const id = Number(req.params["id"]);
    const phaseId = Number(req.params["phaseId"]);
    if (
      !Number.isInteger(id) ||
      id <= 0 ||
      !Number.isInteger(phaseId) ||
      phaseId <= 0
    ) {
      res.status(400).json({ error: "Invalid phase id" });
      return;
    }
    const parsed = PhaseInput.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const project = await loadPipelineProject(req, res, id);
    if (!project) return;
    if (!(await requireTeamLeader(req, res, project.teamId))) return;
    if (
      !(await allowLeadsAction(
        req,
        res,
        project.seasonId,
        "phases",
        "edit",
      ))
    )
      return;
    if (!(await ensureProjectNotSubmitted(res, id))) return;
    const [phase] = await db
      .select({ id: projectPhasesTable.id })
      .from(projectPhasesTable)
      .where(
        and(
          eq(projectPhasesTable.id, phaseId),
          eq(projectPhasesTable.projectId, id),
        ),
      )
      .limit(1);
    if (!phase) {
      res.status(404).json({ error: "Phase not found" });
      return;
    }
    const d = parsed.data;
    const updated = await db.transaction(async (tx) => {
      const [updatedPhase] = await tx
        .update(projectPhasesTable)
        .set({
          name: d.name,
          deliverables: d.deliverables ?? null,
          startDate: d.startDate ?? null,
          endDate: d.endDate ?? null,
        })
        .where(eq(projectPhasesTable.id, phaseId))
        .returning();
      const [updatedSchedule] = await tx
        .update(paymentScheduleTable)
        .set({
          amount: d.amount,
          dueDate: d.dueDate ?? null,
          revenueType: d.revenueType,
        })
        .where(
          and(
            eq(paymentScheduleTable.projectId, id),
            eq(paymentScheduleTable.phaseId, phaseId),
          ),
        )
        .returning();
      return { phase: updatedPhase, schedule: updatedSchedule };
    });
    await refreshProjectContractValue(id);
    res.json(updated);
  },
);

router.delete(
  "/pipeline/projects/:id/phases/:phaseId",
  requireWritableSeason("project"),
  async (req: Request, res: Response): Promise<void> => {
    if (!req.isAuthenticated()) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    const id = Number(req.params["id"]);
    const phaseId = Number(req.params["phaseId"]);
    if (
      !Number.isInteger(id) ||
      id <= 0 ||
      !Number.isInteger(phaseId) ||
      phaseId <= 0
    ) {
      res.status(400).json({ error: "Invalid phase id" });
      return;
    }
    const project = await loadPipelineProject(req, res, id);
    if (!project) return;
    if (!(await requireTeamLeader(req, res, project.teamId))) return;
    if (
      !(await allowLeadsAction(
        req,
        res,
        project.seasonId,
        "phases",
        "delete",
      ))
    )
      return;
    if (!(await ensureProjectNotSubmitted(res, id))) return;
    const phases = await db
      .select({ id: projectPhasesTable.id })
      .from(projectPhasesTable)
      .where(eq(projectPhasesTable.projectId, id));
    if (!phases.some((p) => p.id === phaseId)) {
      res.status(404).json({ error: "Phase not found" });
      return;
    }
    if (phases.length <= 2) {
      res.status(409).json({
        error: "A project must keep at least two phases.",
        code: "MINIMUM_PHASES_REQUIRED",
      });
      return;
    }
    const [payment] = await db
      .select({ id: paymentsTable.id })
      .from(paymentsTable)
      .where(eq(paymentsTable.phaseId, phaseId))
      .limit(1);
    if (payment) {
      res.status(409).json({
        error:
          "This phase has recorded payments and cannot be deleted. Move or remove the payments first.",
        code: "PHASE_HAS_PAYMENTS",
      });
      return;
    }
    await db.transaction(async (tx) => {
      await tx
        .delete(paymentScheduleTable)
        .where(
          and(
            eq(paymentScheduleTable.projectId, id),
            eq(paymentScheduleTable.phaseId, phaseId),
          ),
        );
      await tx
        .delete(projectPhasesTable)
        .where(eq(projectPhasesTable.id, phaseId));
    });
    await refreshProjectContractValue(id);
    res.status(204).end();
  },
);

// ── Stage 4: deliver & log payment (9 fields, 6 mandatory) ─────────────────

const PaymentBody = z.object({
  phaseId: z.number().int().positive(),
  amountReceived: z.number().int().min(1).max(100_000_000),
  paymentDate: DATE,
  paymentMode: z.enum(["upi", "bank_transfer", "cash", "cheque"]),
  transactionRef: z.string().trim().max(120).optional(),
  paymentProof: z.string().trim().min(1).max(2000),
  invoiceDoc: z.string().trim().min(1).max(2000),
  deliveryProof: z.array(z.string().trim().max(2000)).max(10).optional(),
});

router.post(
  "/pipeline/projects/:id/payments",
  requireWritableSeason("revenue"),
  async (req: Request, res: Response): Promise<void> => {
    if (!req.isAuthenticated()) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    const id = Number(req.params["id"]);
    if (!Number.isInteger(id) || id <= 0) {
      res.status(400).json({ error: "Invalid project id" });
      return;
    }
    const parsed = PaymentBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const d = parsed.data;

    const project = await loadPipelineProject(req, res, id);
    if (!project) return;
    if (!(await requireTeamLeader(req, res, project.teamId))) return;
    if (
      !(await allowLeadsAction(
        req,
        res,
        project.seasonId,
        "payments",
        "add",
      ))
    )
      return;
    if (!(await ensureProjectNotSubmitted(res, id))) return;

    // Anything but cash must carry a reference — that is what makes the
    // duplicate-UTR check possible. Cash is exempt rather than forbidden,
    // because a legitimate cash payment must still be recordable.
    if (d.paymentMode !== "cash" && !d.transactionRef?.trim()) {
      res.status(400).json({
        error:
          "Add the UTR or reference number. Only cash payments can be recorded without one.",
      });
      return;
    }

    // The payment must belong to a phase of THIS project.
    const [phase] = await db
      .select({ id: projectPhasesTable.id })
      .from(projectPhasesTable)
      .where(
        and(
          eq(projectPhasesTable.id, d.phaseId),
          eq(projectPhasesTable.projectId, id),
        ),
      )
      .limit(1);
    if (!phase) {
      res.status(400).json({ error: "That phase is not part of this project." });
      return;
    }

    if (d.paymentDate > todayIso()) {
      res
        .status(400)
        .json({ error: "A payment cannot be dated in the future." });
      return;
    }

    // Money cannot arrive before the relationship started. This is a cheap
    // check that catches a whole class of fabricated timelines.
    const [lead] = await db
      .select({ firstMeetingDate: leadsTable.firstMeetingDate })
      .from(leadsTable)
      .where(eq(leadsTable.id, project.leadId!))
      .limit(1);
    if (lead && d.paymentDate < lead.firstMeetingDate) {
      res.status(400).json({
        error: `A payment cannot predate the first client meeting (${lead.firstMeetingDate}).`,
      });
      return;
    }

    try {
      const [created] = await db
        .insert(paymentsTable)
        .values({
          projectId: id,
          phaseId: d.phaseId,
          teamId: project.teamId,
          seasonId: project.seasonId,
          amountReceived: d.amountReceived,
          paymentDate: d.paymentDate,
          paymentMode: d.paymentMode,
          transactionRef: d.transactionRef?.trim() || null,
          paymentProof: d.paymentProof,
          invoiceDoc: d.invoiceDoc,
          deliveryProof: d.deliveryProof ?? null,
          recordedBy: req.user!.id,
          // clientConfirmed is deliberately NOT settable here — it is written
          // by the automated satisfaction call, never by the student.
        })
        .returning();
      res.status(201).json(created);
    } catch (err) {
      // The partial unique index on transaction_ref surfaces here.
      const code = (err as { code?: string })?.code;
      if (code === "23505") {
        res.status(409).json({
          error:
            "That transaction reference has already been recorded. Check the number, or contact your coordinator if it is genuinely a different payment.",
          code: "DUPLICATE_TRANSACTION_REF",
        });
        return;
      }
      logger.error({ err }, "[pipeline] payment insert failed");
      res.status(500).json({ error: "Could not record the payment." });
    }
  },
);

router.patch(
  "/pipeline/projects/:id/payments/:paymentId",
  requireWritableSeason("revenue"),
  async (req: Request, res: Response): Promise<void> => {
    if (!req.isAuthenticated()) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    const id = Number(req.params["id"]);
    const paymentId = Number(req.params["paymentId"]);
    if (
      !Number.isInteger(id) ||
      id <= 0 ||
      !Number.isInteger(paymentId) ||
      paymentId <= 0
    ) {
      res.status(400).json({ error: "Invalid payment id" });
      return;
    }
    const parsed = PaymentBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const project = await loadPipelineProject(req, res, id);
    if (!project) return;
    if (!(await requireTeamLeader(req, res, project.teamId))) return;
    if (
      !(await allowLeadsAction(
        req,
        res,
        project.seasonId,
        "payments",
        "edit",
      ))
    )
      return;
    if (!(await ensureProjectNotSubmitted(res, id))) return;
    const [payment] = await db
      .select()
      .from(paymentsTable)
      .where(
        and(eq(paymentsTable.id, paymentId), eq(paymentsTable.projectId, id)),
      )
      .limit(1);
    if (!payment) {
      res.status(404).json({ error: "Payment not found" });
      return;
    }
    if (payment.clientConfirmed) {
      res.status(409).json({
        error:
          "A client-confirmed payment cannot be edited. Ask an administrator to correct it.",
        code: "PAYMENT_CONFIRMED",
      });
      return;
    }
    const d = parsed.data;
    if (d.paymentMode !== "cash" && !d.transactionRef?.trim()) {
      res.status(400).json({
        error:
          "Add the UTR or reference number. Only cash payments can be recorded without one.",
      });
      return;
    }
    const [phase] = await db
      .select({ id: projectPhasesTable.id })
      .from(projectPhasesTable)
      .where(
        and(
          eq(projectPhasesTable.id, d.phaseId),
          eq(projectPhasesTable.projectId, id),
        ),
      )
      .limit(1);
    if (!phase) {
      res.status(400).json({ error: "That phase is not part of this project." });
      return;
    }
    if (d.paymentDate > todayIso()) {
      res
        .status(400)
        .json({ error: "A payment cannot be dated in the future." });
      return;
    }
    const [lead] = await db
      .select({ firstMeetingDate: leadsTable.firstMeetingDate })
      .from(leadsTable)
      .where(eq(leadsTable.id, project.leadId!))
      .limit(1);
    if (lead && d.paymentDate < lead.firstMeetingDate) {
      res.status(400).json({
        error: `A payment cannot predate the first client meeting (${lead.firstMeetingDate}).`,
      });
      return;
    }
    try {
      const [updated] = await db
        .update(paymentsTable)
        .set({
          phaseId: d.phaseId,
          amountReceived: d.amountReceived,
          paymentDate: d.paymentDate,
          paymentMode: d.paymentMode,
          transactionRef: d.transactionRef?.trim() || null,
          paymentProof: d.paymentProof,
          invoiceDoc: d.invoiceDoc,
          deliveryProof: d.deliveryProof ?? null,
        })
        .where(eq(paymentsTable.id, paymentId))
        .returning();
      res.json(updated);
    } catch (err) {
      if ((err as { code?: string })?.code === "23505") {
        res.status(409).json({
          error: "That transaction reference has already been recorded.",
          code: "DUPLICATE_TRANSACTION_REF",
        });
        return;
      }
      logger.error({ err }, "[pipeline] payment update failed");
      res.status(500).json({ error: "Could not update the payment." });
    }
  },
);

router.delete(
  "/pipeline/projects/:id/payments/:paymentId",
  requireWritableSeason("revenue"),
  async (req: Request, res: Response): Promise<void> => {
    if (!req.isAuthenticated()) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    const id = Number(req.params["id"]);
    const paymentId = Number(req.params["paymentId"]);
    if (
      !Number.isInteger(id) ||
      id <= 0 ||
      !Number.isInteger(paymentId) ||
      paymentId <= 0
    ) {
      res.status(400).json({ error: "Invalid payment id" });
      return;
    }
    const project = await loadPipelineProject(req, res, id);
    if (!project) return;
    if (!(await requireTeamLeader(req, res, project.teamId))) return;
    if (
      !(await allowLeadsAction(
        req,
        res,
        project.seasonId,
        "payments",
        "delete",
      ))
    )
      return;
    if (!(await ensureProjectNotSubmitted(res, id))) return;
    const [payment] = await db
      .select()
      .from(paymentsTable)
      .where(
        and(eq(paymentsTable.id, paymentId), eq(paymentsTable.projectId, id)),
      )
      .limit(1);
    if (!payment) {
      res.status(404).json({ error: "Payment not found" });
      return;
    }
    if (payment.clientConfirmed) {
      res.status(409).json({
        error:
          "A client-confirmed payment cannot be deleted. Ask an administrator to correct it.",
        code: "PAYMENT_CONFIRMED",
      });
      return;
    }
    await db.delete(paymentsTable).where(eq(paymentsTable.id, paymentId));
    res.status(204).end();
  },
);

// ── Stage 5: the composed BRD + Gate C ─────────────────────────────────────

router.get(
  "/pipeline/projects/:id/brd",
  async (req: Request, res: Response): Promise<void> => {
    if (!req.isAuthenticated()) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    const id = Number(req.params["id"]);
    if (!Number.isInteger(id) || id <= 0) {
      res.status(400).json({ error: "Invalid project id" });
      return;
    }
    const project = await loadPipelineProject(req, res, id);
    if (!project) return;

    const brd = await composeBrd(id);
    if (!brd) {
      res.status(404).json({ error: "Nothing to compose yet." });
      return;
    }
    res.json(brd);
  },
);

/** Per-team pipeline counts used by the stepper's steps 3-5. */
router.get(
  "/pipeline/projects",
  async (req: Request, res: Response): Promise<void> => {
    if (!req.isAuthenticated()) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    const isStaff = req.user.role === "admin" || req.user.role === "coordinator";
    const requested = Number(req.query["teamId"]);
    const teamId =
      isStaff && Number.isInteger(requested) && requested > 0
        ? requested
        : await getMyTeamId(req.user.id);
    if (teamId == null) {
      res.status(400).json({ error: "You are not on a team" });
      return;
    }
    const season = await resolveSeason(req);

    const rows = await db
      .select({
        id: projectsTable.id,
        title: projectsTable.title,
        leadId: projectsTable.leadId,
        serviceCategory: projectsTable.serviceCategory,
        totalContractValue: projectsTable.totalContractValue,
        revenueType: projectsTable.revenueType,
        createdAt: projectsTable.createdAt,
        received: sql<number>`(
          SELECT COALESCE(SUM(p.amount_received), 0)::int
          FROM payments p WHERE p.project_id = ${projectsTable.id}
        )`,
      })
      .from(projectsTable)
      .where(
        and(
          eq(projectsTable.teamId, teamId),
          eq(projectsTable.seasonId, season),
          // Pipeline projects only — a Season 1 project has no lead.
          sql`${projectsTable.leadId} IS NOT NULL`,
        ),
      )
      .orderBy(asc(projectsTable.createdAt));

    res.json(rows);
  },
);

// ── Stage 5: submit for review ─────────────────────────────────────────────

/**
 * Gate C. The submission does NOT create a parallel review queue — it writes a
 * normal `revenue_entries` row, so every existing coordinator screen, verifier
 * action, leaderboard total and export keeps working untouched. The only
 * difference is that brd_url is NULL and the composed BRD lives in
 * brd_composed / brd_text instead.
 *
 * The snapshot is deliberately frozen at submission: a reviewer must see what
 * was submitted, not a document that keeps changing underneath them.
 */
router.post(
  "/pipeline/projects/:id/submit",
  requireWritableSeason("revenue"),
  async (req: Request, res: Response): Promise<void> => {
    if (!req.isAuthenticated()) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    const id = Number(req.params["id"]);
    if (!Number.isInteger(id) || id <= 0) {
      res.status(400).json({ error: "Invalid project id" });
      return;
    }
    const project = await loadPipelineProject(req, res, id);
    if (!project) return;
    if (!(await requireTeamLeader(req, res, project.teamId))) return;
    if (!(await allowLeadsSubmit(req, res, project.seasonId))) return;

    const brd = await composeBrd(id);
    if (!brd) {
      res.status(400).json({ error: "Nothing to submit yet." });
      return;
    }

    // ── GATE C ────────────────────────────────────────────────────────────
    // The checklist the student sees IS the check that blocks, because both
    // come from composeBrd(). There is no second, stricter server-side list to
    // be surprised by. Blocks only while the gates are ENFORCED; in advisory
    // mode the submission goes through with the failing items recorded in the
    // composed BRD, where reviewers see them.
    if (!brd.gateC.passed && (await areGatesEnforced(project.seasonId))) {
      res.status(409).json({
        error: "Some things are still missing.",
        code: "GATE_C_NOT_MET",
        remaining: brd.gateC.remaining,
        items: brd.gateC.items.filter((i) => !i.passed),
      });
      return;
    }

    // Re-submitting must not create a second claim for the same project.
    const [existing] = await db
      .select({
        id: revenueEntriesTable.id,
        status: revenueEntriesTable.status,
      })
      .from(revenueEntriesTable)
      .where(eq(revenueEntriesTable.projectId, id))
      .limit(1);
    if (existing && existing.status !== "draft") {
      res.status(409).json({
        error: `This project has already been submitted (status: ${existing.status}).`,
        code: "ALREADY_SUBMITTED",
        entryId: existing.id,
      });
      return;
    }

    // The claim is the money actually RECEIVED, never the contract value — an
    // unpaid contract is not revenue, and letting the two diverge here is how
    // Season 1 ended up with inflated totals.
    const amount = brd.payments.reduce((n, p) => n + p.amount, 0);
    const latestPaymentDate = brd.payments
      .map((p) => p.date)
      .sort()
      .pop();
    if (!amount || !latestPaymentDate) {
      res.status(400).json({ error: "No payments have been recorded yet." });
      return;
    }

    // Price recognition. `amount` above stays the CLAIMED figure and is never
    // rewritten - the audit trail depends on it. The cap and the recurring
    // multiplier land in separate columns, so a Season 1 row (both NULL) still
    // reads back through the same COALESCE chain it always did.
    const recognition = await computeRecognition({
      claimed: amount,
      seasonId: project.seasonId,
      categoryName: project.serviceCategory,
      isRecurring: project.revenueType === "recurring",
    });

    try {
      const values = {
        projectId: id,
        teamId: project.teamId,
        seasonId: project.seasonId,
        clientName: brd.client.businessName,
        amount,
        paymentDate: latestPaymentDate,
        status: "submitted" as const,
        enteredBy: "student" as const,
        submittedAt: new Date(),
        brdComposed: brd,
        brdText: renderBrdText(brd),
        recognisedAmount: recognition.recognised,
        weightedAmount: recognition.weighted,
        pricingCategoryId: recognition.categoryId,
      };
      const entry = existing
        ? (
            await db
              .update(revenueEntriesTable)
              .set(values)
              .where(eq(revenueEntriesTable.id, existing.id))
              .returning()
          )[0]
        : (await db.insert(revenueEntriesTable).values(values).returning())[0];

      res.status(201).json({
        entryId: entry?.id,
        amount,
        recognised: recognition.recognised,
        weighted: recognition.weighted,
        // Non-null only when the cap actually bit, so the student is told WHY
        // their figure was trimmed rather than just seeing a smaller number.
        capNote: recognition.capNote,
      });
    } catch (err) {
      logger.error({ err, projectId: id }, "[pipeline] submit failed");
      res.status(500).json({ error: "Could not submit for review." });
    }
  },
);

export default router;
