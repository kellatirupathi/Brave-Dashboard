/**
 * Trust score — read the ledger, and the coordinator's manual adjustment.
 *
 * ISOLATION: additive. Deleting the feature means removing
 * `router.use(trustRouter)` in routes/index.ts plus its import.
 *
 * The published rules table is returned alongside the score on purpose. A team
 * must be able to account for its own number from the same response that gives
 * it the number — a score you cannot explain reads as arbitrary, and teams stop
 * trying to influence it.
 */
import { Router, type IRouter, type Request, type Response } from "express";
import { z } from "zod";
import { and, desc, eq } from "drizzle-orm";
import { db, trustScoreEventsTable, teamMembersTable } from "@workspace/db";
import { resolveSeason } from "../lib/season";
import {
  TIER_FLOOR,
  TIER_LABEL,
  TIER_MEANING,
  TRUST_RULES,
  awardTrust,
  getTrustSummary,
} from "../lib/trust-score";
import { logger } from "../lib/logger";

const router: IRouter = Router();

async function getMyTeamId(userId: string): Promise<number | null> {
  const [m] = await db
    .select({ teamId: teamMembersTable.teamId })
    .from(teamMembersTable)
    .where(eq(teamMembersTable.userId, userId))
    .limit(1);
  return m?.teamId ?? null;
}

/**
 * Resolve which team's ledger the caller may read. Staff may pass ?teamId;
 * a student always gets their own, whatever they pass.
 */
async function resolveTeamId(req: Request): Promise<number | null> {
  const isStaff =
    req.user?.role === "admin" || req.user?.role === "coordinator";
  const requested = Number(req.query["teamId"]);
  if (isStaff && Number.isInteger(requested) && requested > 0) return requested;
  return req.user ? getMyTeamId(req.user.id) : null;
}

/** The published rules table. Static — safe to fetch once and cache client-side. */
router.get("/trust/rules", (_req: Request, res: Response): void => {
  res.json({
    rules: Object.entries(TRUST_RULES).map(([kind, r]) => ({
      kind,
      points: r.points,
      label: r.label,
      rationale: r.rationale,
    })),
    tiers: (["bronze", "silver", "gold"] as const).map((t) => ({
      tier: t,
      label: TIER_LABEL[t],
      floor: TIER_FLOOR[t],
      meaning: TIER_MEANING[t],
    })),
    // Watch is listed separately because its floor is -Infinity, which does not
    // survive JSON. It is "below bronze", not a number.
    watch: {
      tier: "watch",
      label: TIER_LABEL.watch,
      floor: null,
      meaning: TIER_MEANING.watch,
    },
  });
});

router.get(
  "/trust/summary",
  async (req: Request, res: Response): Promise<void> => {
    if (!req.isAuthenticated()) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    const teamId = await resolveTeamId(req);
    if (teamId == null) {
      res.status(400).json({ error: "You are not on a team" });
      return;
    }
    const season = await resolveSeason(req);

    const summary = await getTrustSummary(teamId, season);
    const events = await db
      .select()
      .from(trustScoreEventsTable)
      .where(
        and(
          eq(trustScoreEventsTable.teamId, teamId),
          eq(trustScoreEventsTable.seasonId, season),
        ),
      )
      .orderBy(desc(trustScoreEventsTable.createdAt));

    res.json({
      ...summary,
      teamId,
      seasonId: season,
      // Every event carries its own label, so the UI never has to map a kind it
      // does not recognise — and an event awarded under an older point value
      // still displays the points it actually carried.
      events: events.map((e) => ({
        id: e.id,
        kind: e.kind,
        label: TRUST_RULES[e.kind]?.label ?? e.kind,
        points: e.points,
        reason: e.reason,
        refType: e.refType,
        refId: e.refId,
        createdAt: e.createdAt,
      })),
    });
  },
);

const AdjustBody = z.object({
  teamId: z.number().int().positive(),
  points: z
    .number()
    .int()
    .refine((n) => n !== 0, "An adjustment of zero would say nothing.")
    .refine((n) => Math.abs(n) <= 100, "Keep an adjustment within ±100."),
  reason: z.string().trim().min(10, "Explain the adjustment in a sentence."),
});

/**
 * Coordinator manual adjustment — the escape hatch for a decision no rule
 * covers. Deliberately NOT deduplicated: two separate judgements about the same
 * team are two legitimate events, so no refType/refId is passed.
 */
router.post(
  "/trust/adjust",
  async (req: Request, res: Response): Promise<void> => {
    if (!req.isAuthenticated()) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    const role = req.user.role;
    if (role !== "admin" && role !== "coordinator") {
      res.status(403).json({ error: "Coordinators and admins only" });
      return;
    }
    const parsed = AdjustBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const season = await resolveSeason(req);
    try {
      await awardTrust({
        teamId: parsed.data.teamId,
        seasonId: season,
        kind: "manual_adjustment",
        points: parsed.data.points,
        reason: parsed.data.reason,
        createdBy: req.user.id,
      });
      const summary = await getTrustSummary(parsed.data.teamId, season);
      res.status(201).json(summary);
    } catch (err) {
      logger.error({ err }, "[trust] adjustment failed");
      res.status(500).json({ error: "Could not record the adjustment." });
    }
  },
);

export default router;
