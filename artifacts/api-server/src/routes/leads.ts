/**
 * Season 2 lead pipeline — capture, trail, stages (additive, isolated).
 *
 * ISOLATION CONTRACT
 * - Nothing outside this file and lib/lead-pipeline.ts reads these tables.
 * - Deleting the feature means removing the single `router.use(leadsRouter)`
 *   line in routes/index.ts plus its import.
 * - Season 1 code paths are untouched: leads simply do not exist there.
 *
 * WHY THE GATES LIVE IN lib/lead-pipeline.ts
 * The same rules are read by the BRD composer and the reviewer's queue. A gate
 * implemented twice is a gate that eventually disagrees with itself, so the
 * handlers here call the shared evaluator rather than re-deriving anything.
 */
import { Router, type IRouter, type Request, type Response } from "express";
import { z } from "zod";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import {
  db,
  leadsTable,
  leadInteractionsTable,
  projectsTable,
  paymentsTable,
  teamMembersTable,
} from "@workspace/db";
import { resolveSeason } from "../lib/season";
import { requireWritableSeason } from "../middlewares/seasonGuard";
import { logger } from "../lib/logger";
import {
  buildPipelineStatus,
  computeTrailStrength,
  evaluateGateA,
  findDuplicateClientTeams,
  isRelatedPartySource,
  refreshLeadDerivedState,
  stageRequiresGateA,
  trailBand,
  upsertClientRegistry,
} from "../lib/lead-pipeline";

const router: IRouter = Router();

// ── shared helpers ──────────────────────────────────────────────────────────

async function getMyTeamId(userId: string): Promise<number | null> {
  const [m] = await db
    .select({ teamId: teamMembersTable.teamId })
    .from(teamMembersTable)
    .where(eq(teamMembersTable.userId, userId))
    .limit(1);
  return m?.teamId ?? null;
}

/**
 * Resolve the team whose pipeline this request may touch.
 *
 * ANY team member may capture leads and log interactions — this is field work,
 * and restricting it to the leader would mean the person standing in the shop
 * cannot record the meeting. Staff may read any team by passing ?teamId.
 */
async function resolveTeamScope(
  req: Request,
  res: Response,
): Promise<{ teamId: number; isStaff: boolean } | null> {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return null;
  }
  const isStaff = req.user.role === "admin" || req.user.role === "coordinator";
  const requested = Number(req.query["teamId"]);
  if (isStaff && Number.isInteger(requested) && requested > 0) {
    return { teamId: requested, isStaff };
  }
  const teamId = await getMyTeamId(req.user.id);
  if (teamId == null) {
    res.status(400).json({ error: "You are not on a team" });
    return null;
  }
  return { teamId, isStaff };
}

const DATE = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD");

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

// ── Stage 1: capture the lead (17 fields, 9 mandatory) ─────────────────────

const CaptureBody = z
  .object({
    source: z.enum(["walk_in", "online", "referral", "known_contact"]),
    referrerName: z.string().trim().max(200).optional(),
    relationshipNote: z.string().trim().max(1000).optional(),
    businessName: z.string().trim().min(1).max(200),
    ownerName: z.string().trim().min(1).max(200),
    phone: z.string().trim().min(6).max(30),
    altPhone: z.string().trim().max(30).optional(),
    businessCategory: z.enum([
      "retail",
      "food_beverage",
      "clinic",
      "salon",
      "education",
      "services",
      "manufacturing",
      "other",
    ]),
    city: z.string().trim().min(1).max(120),
    areaLocality: z.string().trim().max(200).optional(),
    geoLat: z.string().trim().max(40).optional(),
    geoLng: z.string().trim().max(40).optional(),
    firstMeetingDate: DATE,
    meetingMode: z.enum(["in_person", "phone", "video", "whatsapp"]),
    conversationNote: z.string().trim().min(1).max(4000),
    painPoint: z.string().trim().max(4000).optional(),
    estimatedValue: z.number().int().min(0).max(100_000_000).optional(),
    evidence: z.array(z.string().url().max(2000)).max(10).optional(),
  })
  // The conditional fields are required by the SOURCE, which is why this is a
  // refinement rather than two optional columns the UI is trusted to fill.
  .refine((v) => v.source !== "referral" || !!v.referrerName?.trim(), {
    message: "Tell us who referred this client.",
    path: ["referrerName"],
  })
  .refine((v) => v.source !== "known_contact" || !!v.relationshipNote?.trim(), {
    message: "Describe your relationship to this client.",
    path: ["relationshipNote"],
  });

router.post(
  "/leads",
  requireWritableSeason(),
  async (req: Request, res: Response): Promise<void> => {
    const scope = await resolveTeamScope(req, res);
    if (!scope) return;
    const parsed = CaptureBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const d = parsed.data;

    // A first meeting cannot be in the future — it anchors the whole trail, and
    // Gate A's span is measured from it.
    if (d.firstMeetingDate > todayIso()) {
      res
        .status(400)
        .json({ error: "The first meeting date cannot be in the future." });
      return;
    }

    const season = await resolveSeason(req);
    const [lead] = await db
      .insert(leadsTable)
      .values({
        teamId: scope.teamId,
        seasonId: season,
        source: d.source,
        referrerName: d.referrerName ?? null,
        relationshipNote: d.relationshipNote ?? null,
        businessName: d.businessName,
        ownerName: d.ownerName,
        phone: d.phone,
        altPhone: d.altPhone ?? null,
        businessCategory: d.businessCategory,
        city: d.city,
        areaLocality: d.areaLocality ?? null,
        geoLat: d.geoLat ?? null,
        geoLng: d.geoLng ?? null,
        firstMeetingDate: d.firstMeetingDate,
        meetingMode: d.meetingMode,
        conversationNote: d.conversationNote,
        painPoint: d.painPoint ?? null,
        estimatedValue: d.estimatedValue ?? null,
        evidence: d.evidence ?? null,
        // Derived, not client-supplied — a student cannot opt out of the flag.
        isRelatedParty: isRelatedPartySource(d.source),
        createdBy: req.user!.id,
      })
      .returning();

    if (!lead) {
      res.status(500).json({ error: "Could not create the lead." });
      return;
    }

    // Programme-wide client record. Best-effort by design.
    await upsertClientRegistry(lead);

    // Informational only. A duplicate is a review signal, never a block — two
    // teams genuinely can approach the same shop.
    const duplicateTeams = await findDuplicateClientTeams(
      lead.phone,
      scope.teamId,
      season,
    );

    res.status(201).json({
      lead,
      duplicateClientTeams: duplicateTeams,
      relatedParty: lead.isRelatedParty,
    });
  },
);

// ── list + detail ───────────────────────────────────────────────────────────

router.get("/leads", async (req: Request, res: Response): Promise<void> => {
  const scope = await resolveTeamScope(req, res);
  if (!scope) return;
  const season = await resolveSeason(req);

  const rows = await db
    .select()
    .from(leadsTable)
    .where(
      and(eq(leadsTable.teamId, scope.teamId), eq(leadsTable.seasonId, season)),
    )
    .orderBy(desc(leadsTable.createdAt));

  // Interaction counts in one grouped query rather than N+1 over the board.
  const counts = await db
    .select({
      leadId: leadInteractionsTable.leadId,
      n: sql<number>`count(*)::int`,
      lastDate: sql<string | null>`max(${leadInteractionsTable.interactionDate})`,
      withEvidence: sql<number>`count(*) filter (where ${leadInteractionsTable.attachments} is not null)::int`,
    })
    .from(leadInteractionsTable)
    .where(
      and(
        eq(leadInteractionsTable.teamId, scope.teamId),
        eq(leadInteractionsTable.seasonId, season),
      ),
    )
    .groupBy(leadInteractionsTable.leadId);
  const byLead = new Map(counts.map((c) => [c.leadId, c]));

  const today = todayIso();
  res.json(
    rows.map((l) => {
      const c = byLead.get(l.id);
      const lastDate = c?.lastDate ?? null;
      const silentDays = lastDate
        ? Math.round(
            (Date.parse(`${today}T00:00:00Z`) -
              Date.parse(`${lastDate}T00:00:00Z`)) /
              86_400_000,
          )
        : null;
      return {
        ...l,
        interactionCount: c?.n ?? 0,
        interactionsWithEvidence: c?.withEvidence ?? 0,
        lastInteractionDate: lastDate,
        // Surfaced so the board can colour the card without recomputing the
        // 10 / 21 / 30-day thresholds the crons use.
        silentDays,
        needsFollowUp: silentDays != null && silentDays >= 10,
        trailBand: trailBand(l.trailStrength),
      };
    }),
  );
});

router.get("/leads/:id", async (req: Request, res: Response): Promise<void> => {
  const scope = await resolveTeamScope(req, res);
  if (!scope) return;
  const id = Number(req.params["id"]);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ error: "Invalid lead id" });
    return;
  }

  const [lead] = await db
    .select()
    .from(leadsTable)
    .where(eq(leadsTable.id, id))
    .limit(1);
  if (!lead) {
    res.status(404).json({ error: "Lead not found" });
    return;
  }
  if (!scope.isStaff && lead.teamId !== scope.teamId) {
    res.status(403).json({ error: "Not your team's lead" });
    return;
  }

  const interactions = await db
    .select()
    .from(leadInteractionsTable)
    .where(eq(leadInteractionsTable.leadId, id))
    .orderBy(desc(leadInteractionsTable.interactionDate));

  const gateA = evaluateGateA(interactions);

  res.json({
    lead,
    // Newest first for display; the gate evaluator is order-independent.
    interactions,
    gateA,
    trailStrength: computeTrailStrength(interactions),
    trailBand: trailBand(lead.trailStrength),
    canConvert: gateA.passed,
  });
});

// ── Stage 2: work the lead (8 fields, 4 mandatory) ─────────────────────────

const InteractionBody = z.object({
  interactionDate: DATE,
  interactionType: z.enum([
    "call",
    "whatsapp",
    "email",
    "site_visit",
    "demo",
    "proposal_sent",
    "negotiation",
    "payment_discussion",
  ]),
  summary: z.string().trim().min(1).max(4000),
  outcome: z.enum(["positive", "neutral", "objection", "no_response"]),
  objectionNote: z.string().trim().max(2000).optional(),
  nextActionDate: DATE.optional(),
  attachments: z.array(z.string().url().max(2000)).max(10).optional(),
  stageChange: z
    .enum(["new", "qualified", "proposal_sent", "converted", "lost"])
    .optional(),
});

router.post(
  "/leads/:id/interactions",
  requireWritableSeason(),
  async (req: Request, res: Response): Promise<void> => {
    const scope = await resolveTeamScope(req, res);
    if (!scope) return;
    const id = Number(req.params["id"]);
    if (!Number.isInteger(id) || id <= 0) {
      res.status(400).json({ error: "Invalid lead id" });
      return;
    }
    const parsed = InteractionBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const d = parsed.data;

    const [lead] = await db
      .select()
      .from(leadsTable)
      .where(eq(leadsTable.id, id))
      .limit(1);
    if (!lead) {
      res.status(404).json({ error: "Lead not found" });
      return;
    }
    if (!scope.isStaff && lead.teamId !== scope.teamId) {
      res.status(403).json({ error: "Not your team's lead" });
      return;
    }

    if (d.interactionDate > todayIso()) {
      res
        .status(400)
        .json({ error: "An interaction cannot be dated in the future." });
      return;
    }
    if (d.interactionDate < lead.firstMeetingDate) {
      res.status(400).json({
        error: `An interaction cannot predate the first meeting (${lead.firstMeetingDate}).`,
      });
      return;
    }
    if (d.outcome === "objection" && !d.objectionNote?.trim()) {
      res
        .status(400)
        .json({ error: "Tell us what the objection was." });
      return;
    }

    // A stage move bundled with the interaction is still subject to Gate A —
    // evaluated AFTER this entry is counted, since it may be the one that
    // satisfies the gate.
    const [created] = await db
      .insert(leadInteractionsTable)
      .values({
        leadId: id,
        teamId: lead.teamId,
        seasonId: lead.seasonId,
        interactionDate: d.interactionDate,
        interactionType: d.interactionType,
        summary: d.summary,
        outcome: d.outcome,
        objectionNote: d.objectionNote ?? null,
        nextActionDate: d.nextActionDate ?? null,
        attachments: d.attachments ?? null,
        stageChange: d.stageChange ?? null,
        loggedBy: req.user!.id,
      })
      .returning();

    const strength = await refreshLeadDerivedState(id);

    const interactions = await db
      .select()
      .from(leadInteractionsTable)
      .where(eq(leadInteractionsTable.leadId, id))
      .orderBy(asc(leadInteractionsTable.interactionDate));
    const gateA = evaluateGateA(interactions);

    let stageApplied: string | null = null;
    let stageRefused: string[] | null = null;
    if (d.stageChange) {
      if (stageRequiresGateA(d.stageChange) && !gateA.passed) {
        // The interaction is kept — it is real work. Only the stage move is
        // refused, and we say exactly what is missing.
        stageRefused = gateA.reasons;
      } else {
        await db
          .update(leadsTable)
          .set({ stage: d.stageChange })
          .where(eq(leadsTable.id, id));
        stageApplied = d.stageChange;
      }
    }

    if (d.nextActionDate) {
      await db
        .update(leadsTable)
        .set({ nextActionDate: d.nextActionDate })
        .where(eq(leadsTable.id, id));
    }

    res.status(201).json({
      interaction: created,
      trailStrength: strength,
      trailBand: trailBand(strength),
      gateA,
      stageApplied,
      stageRefused,
    });
  },
);

// ── stage change on its own ─────────────────────────────────────────────────

const StageBody = z.object({
  stage: z.enum(["new", "qualified", "proposal_sent", "converted", "lost"]),
});

router.patch(
  "/leads/:id/stage",
  requireWritableSeason(),
  async (req: Request, res: Response): Promise<void> => {
    const scope = await resolveTeamScope(req, res);
    if (!scope) return;
    const id = Number(req.params["id"]);
    if (!Number.isInteger(id) || id <= 0) {
      res.status(400).json({ error: "Invalid lead id" });
      return;
    }
    const parsed = StageBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }

    const [lead] = await db
      .select()
      .from(leadsTable)
      .where(eq(leadsTable.id, id))
      .limit(1);
    if (!lead) {
      res.status(404).json({ error: "Lead not found" });
      return;
    }
    if (!scope.isStaff && lead.teamId !== scope.teamId) {
      res.status(403).json({ error: "Not your team's lead" });
      return;
    }

    // GATE A, enforced server-side. The UI disables the button too, but this is
    // the check that actually holds — the whole fraud model rests on it.
    if (stageRequiresGateA(parsed.data.stage)) {
      const interactions = await db
        .select()
        .from(leadInteractionsTable)
        .where(eq(leadInteractionsTable.leadId, id));
      const gateA = evaluateGateA(interactions);
      if (!gateA.passed) {
        res.status(409).json({
          error: "This lead is not ready to move forward yet.",
          code: "GATE_A_NOT_MET",
          gateA,
        });
        return;
      }
    }

    const [updated] = await db
      .update(leadsTable)
      .set({ stage: parsed.data.stage })
      .where(eq(leadsTable.id, id))
      .returning();
    res.json(updated);
  },
);

// ── the 5-step stepper ──────────────────────────────────────────────────────

router.get(
  "/pipeline/status",
  async (req: Request, res: Response): Promise<void> => {
    const scope = await resolveTeamScope(req, res);
    if (!scope) return;
    const season = await resolveSeason(req);

    try {
      const leads = await db
        .select({
          id: leadsTable.id,
          stage: leadsTable.stage,
          lastContactAt: leadsTable.lastContactAt,
          trailStrength: leadsTable.trailStrength,
        })
        .from(leadsTable)
        .where(
          and(
            eq(leadsTable.teamId, scope.teamId),
            eq(leadsTable.seasonId, season),
          ),
        );

      const [projCount] = await db
        .select({ n: sql<number>`count(*)::int` })
        .from(projectsTable)
        .where(
          and(
            eq(projectsTable.teamId, scope.teamId),
            eq(projectsTable.seasonId, season),
            sql`${projectsTable.leadId} IS NOT NULL`,
          ),
        );

      const [payCount] = await db
        .select({ n: sql<number>`count(*)::int` })
        .from(paymentsTable)
        .where(
          and(
            eq(paymentsTable.teamId, scope.teamId),
            eq(paymentsTable.seasonId, season),
          ),
        );

      const cutoff = Date.now() - 10 * 86_400_000;
      res.json(
        buildPipelineStatus({
          leadCount: leads.length,
          needsFollowUp: leads.filter(
            (l) => l.lastContactAt && l.lastContactAt.getTime() < cutoff,
          ).length,
          anyGateAPassed: leads.some((l) => l.trailStrength >= 45),
          convertedCount: leads.filter((l) => l.stage === "converted").length,
          projectCount: Number(projCount?.n ?? 0),
          paymentCount: Number(payCount?.n ?? 0),
          brdReadyCount: 0,
        }),
      );
    } catch (err) {
      logger.error({ err }, "[leads] pipeline status failed");
      res.status(500).json({ error: "Could not load pipeline status" });
    }
  },
);

export default router;
