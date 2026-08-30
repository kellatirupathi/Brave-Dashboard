/**
 * Trust score — published point values, tiers, and price recognition.
 *
 * DESIGN
 * - The score is the SUM of an append-only ledger (trust_score_events), never a
 *   stored mutable number. So it can always be explained line by line, and
 *   recomputing it is a query rather than a migration.
 * - The point values below are PUBLISHED: students see this exact table. A
 *   scoring system nobody can account for is worse than none, because it reads
 *   as arbitrary and teams stop trying to influence it.
 * - Events store the points AS AWARDED. Changing a value here affects future
 *   awards only; it never rewrites history.
 *
 * OPEN DECISION (flagged, not invented away): the manager has not signed off on
 * the specific numbers or the tier thresholds. They are set to a defensible
 * starting scale — small positives that accumulate through ordinary honest
 * work, larger negatives for proven misreporting — and are deliberately in one
 * place so a sign-off changes exactly one file.
 */
import { and, eq, sql } from "drizzle-orm";
import {
  db,
  pricingCategoriesTable,
  trustScoreEventsTable,
  type trustEventKindEnum,
  type trustTierEnum,
} from "@workspace/db";
import { logger } from "./logger";

export type TrustEventKind =
  (typeof trustEventKindEnum)["enumValues"][number];
export type TrustTier = (typeof trustTierEnum)["enumValues"][number];

export type TrustRule = {
  points: number;
  /** Shown to students in the published table. */
  label: string;
  /** Why it exists — the behaviour being encouraged or discouraged. */
  rationale: string;
};

/**
 * The published table.
 *
 * Positives are deliberately small and repeatable: a team that simply does the
 * work honestly climbs steadily. Negatives are larger because they represent a
 * proven finding, not a suspicion — nothing here is awarded on a hunch.
 */
export const TRUST_RULES: Record<TrustEventKind, TrustRule> = {
  revenue_verified: {
    points: 10,
    label: "Revenue verified by your coordinator",
    rationale: "The core honest outcome: money claimed, money confirmed.",
  },
  client_confirmed: {
    points: 15,
    label: "Client confirmed the payment on a call",
    rationale:
      "The strongest evidence there is, because it comes from outside the team.",
  },
  journal_streak: {
    points: 5,
    label: "Four weeks of journals with no gaps",
    rationale: "Consistency over time is hard to fake and easy to verify.",
  },
  trail_strong: {
    points: 5,
    label: "A lead reached a strong interaction trail",
    rationale: "Rewards working the client properly rather than rushing.",
  },
  geo_verified: {
    points: 3,
    label: "Location captured at the client's premises",
    rationale: "Cheap for an honest team, impossible to fake from a desk.",
  },
  phase_delivered_on_time: {
    points: 5,
    label: "A phase delivered by its agreed date",
    rationale: "The client's experience, not just the team's claim.",
  },

  client_disputed: {
    points: -40,
    label: "Client denied the payment",
    rationale:
      "The most serious finding available: the claim contradicts the client.",
  },
  duplicate_client: {
    points: -15,
    label: "Same client claimed by another team, resolved against you",
    rationale:
      "Only applied after a coordinator decides — an overlap alone is not a finding.",
  },
  amount_overstated: {
    points: -25,
    label: "Claimed more than the evidence supports",
    rationale: "Overstating is the failure the whole verification chain exists for.",
  },
  evidence_missing: {
    points: -10,
    label: "Proof asked for and not supplied",
    rationale: "Keeps the burden of proof on the claim, not the reviewer.",
  },
  link_dead: {
    points: -5,
    label: "A product link stopped working after submission",
    rationale:
      "Small, because it is usually carelessness rather than dishonesty.",
  },
  backdated_trail: {
    points: -20,
    label: "Interactions written up long after the dates claimed",
    rationale:
      "A whole trail logged in one sitting is the classic fabrication pattern.",
  },

  manual_adjustment: {
    points: 0,
    label: "Coordinator adjustment",
    rationale:
      "For a decision no rule covers. Points are entered by hand and a reason is required.",
  },
};

// ── Tiers ───────────────────────────────────────────────────────────────────
// Bands rather than a bare number, because a number invites teams to compare
// scores they cannot interpret. Everyone starts at Bronze, NOT at Watch: a new
// team has done nothing wrong, and opening on the punitive tier would be both
// unfair and demoralising.

export const TIER_FLOOR: Record<TrustTier, number> = {
  watch: Number.NEGATIVE_INFINITY,
  bronze: 0,
  silver: 40,
  gold: 90,
};

export const TIER_LABEL: Record<TrustTier, string> = {
  watch: "Watch",
  bronze: "Bronze",
  silver: "Silver",
  gold: "Gold",
};

export function tierForScore(score: number): TrustTier {
  if (score >= TIER_FLOOR.gold) return "gold";
  if (score >= TIER_FLOOR.silver) return "silver";
  if (score >= TIER_FLOOR.bronze) return "bronze";
  return "watch";
}

/** What each tier actually means for a team, in plain terms. */
export const TIER_MEANING: Record<TrustTier, string> = {
  gold: "Your submissions are sampled rather than fully re-checked.",
  silver: "Normal review.",
  bronze: "Normal review. Everyone starts here.",
  watch:
    "Every submission is checked in full, and a coordinator will talk to you.",
};

// ── Awarding ────────────────────────────────────────────────────────────────

/**
 * Append a trust event.
 *
 * Idempotent when `refType`/`refId` are supplied: the partial unique index on
 * (season, team, kind, ref) turns a repeat award into a database error, which
 * is swallowed here. That is what stops a cron re-running and inflating a
 * score. An award with no ref is NOT deduplicated, so callers doing repeatable
 * work must always pass one.
 */
export async function awardTrust(args: {
  teamId: number;
  seasonId: number;
  kind: TrustEventKind;
  refType?: string;
  refId?: number;
  /** Only for manual_adjustment; every other kind uses the published value. */
  points?: number;
  reason?: string;
  createdBy?: string;
}): Promise<boolean> {
  const { teamId, seasonId, kind } = args;

  if (kind === "manual_adjustment") {
    if (typeof args.points !== "number" || args.points === 0) {
      throw new Error("A manual adjustment needs a non-zero point value.");
    }
    if (!args.reason?.trim()) {
      throw new Error("A manual adjustment needs a reason.");
    }
  }

  const points =
    kind === "manual_adjustment"
      ? (args.points as number)
      : TRUST_RULES[kind].points;

  try {
    await db.insert(trustScoreEventsTable).values({
      teamId,
      seasonId,
      kind,
      points,
      reason: args.reason ?? null,
      refType: args.refType ?? null,
      refId: args.refId ?? null,
      createdBy: args.createdBy ?? null,
    });
    return true;
  } catch (err) {
    // 23505 = unique violation: this fact has already been scored. Not an
    // error condition — it is the dedup working.
    if ((err as { code?: string })?.code === "23505") return false;
    logger.error({ err, teamId, seasonId, kind }, "[trust] award failed");
    throw err;
  }
}

export type TrustSummary = {
  score: number;
  tier: TrustTier;
  tierLabel: string;
  tierMeaning: string;
  eventCount: number;
};

/** A team's current standing. Always derived, never read from a cache column. */
export async function getTrustSummary(
  teamId: number,
  seasonId: number,
): Promise<TrustSummary> {
  const [row] = await db
    .select({
      score: sql<number>`COALESCE(SUM(${trustScoreEventsTable.points}), 0)::int`,
      n: sql<number>`COUNT(*)::int`,
    })
    .from(trustScoreEventsTable)
    .where(
      and(
        eq(trustScoreEventsTable.teamId, teamId),
        eq(trustScoreEventsTable.seasonId, seasonId),
      ),
    );
  const score = row?.score ?? 0;
  const tier = tierForScore(score);
  return {
    score,
    tier,
    tierLabel: TIER_LABEL[tier],
    tierMeaning: TIER_MEANING[tier],
    eventCount: row?.n ?? 0,
  };
}

// ── Price recognition ───────────────────────────────────────────────────────

/** Recurring work is weighted up: it is harder to win and worth more. */
export const RECURRING_MULTIPLIER = 1.5;

export type RecognitionResult = {
  /** What the team claimed. Never altered. */
  claimed: number;
  /** Claim after the category cap. */
  recognised: number;
  /** Recognised after the recurring multiplier — what the leaderboard counts. */
  weighted: number;
  categoryId: number | null;
  cap: number | null;
  /** Populated only when the cap actually bit, so the UI can explain it. */
  capNote: string | null;
};

/**
 * Apply the category cap and the recurring multiplier.
 *
 * The claim itself is never rewritten — `amount` remains the audit record, and
 * these are separate columns. A category with no cap set is uncapped, which is
 * the safe default for a catalogue nobody has filled in yet: the alternative
 * (defaulting to some invented ceiling) would silently trim honest claims.
 */
export async function computeRecognition(args: {
  claimed: number;
  seasonId: number;
  categoryName?: string | null;
  isRecurring: boolean;
}): Promise<RecognitionResult> {
  const { claimed, seasonId, isRecurring } = args;
  let categoryId: number | null = null;
  let cap: number | null = null;

  if (args.categoryName?.trim()) {
    const [cat] = await db
      .select({
        id: pricingCategoriesTable.id,
        cap: pricingCategoriesTable.recognitionCap,
      })
      .from(pricingCategoriesTable)
      .where(
        and(
          eq(pricingCategoriesTable.seasonId, seasonId),
          eq(pricingCategoriesTable.name, args.categoryName.trim()),
          eq(pricingCategoriesTable.isActive, true),
        ),
      )
      .limit(1);
    if (cat) {
      categoryId = cat.id;
      cap = cat.cap;
    }
  }

  const recognised = cap != null && claimed > cap ? cap : claimed;
  const weighted = isRecurring
    ? Math.round(recognised * RECURRING_MULTIPLIER)
    : recognised;

  return {
    claimed,
    recognised,
    weighted,
    categoryId,
    cap,
    capNote:
      recognised < claimed
        ? `This kind of work is recognised up to ₹${cap?.toLocaleString("en-IN")}. Your claim of ₹${claimed.toLocaleString("en-IN")} is recorded in full; ₹${recognised.toLocaleString("en-IN")} counts towards the leaderboard.`
        : null,
  };
}

/**
 * SQL for "the figure that counts" in a RANKING.
 *
 * CRITICAL - there are two shapes in this codebase and they are not
 * interchangeable. Most revenue sums (leaderboard, dashboard, campuses,
 * finale, demoday) sum `verified_amount` ALONE:
 *
 *     COALESCE(SUM(verified_amount), 0)
 *
 * A verified row whose verified_amount is somehow NULL therefore contributes
 * NOTHING today, because SUM ignores NULL. Adding an `amount` fallback would
 * make that row start counting and would MOVE SEASON 1 TOTALS - the exact
 * outcome the migration gate forbids. So this expression stops at
 * verified_amount, making it an exact drop-in.
 *
 * A Season 1 row has weighted_amount NULL and falls straight through, so its
 * total is bit-for-bit what it was before this phase existed.
 */
export const RANKING_AMOUNT_SQL = sql`COALESCE(weighted_amount, verified_amount)`;

/**
 * The variant for the MINORITY of sites that already coalesce down to the
 * claimed amount - `admin.ts` (list/export/team stats) and `admin-teams.ts`.
 * Use this ONLY where the existing expression was
 * `coalesce(verified_amount, amount)`; using it anywhere else changes totals.
 */
export const RANKING_AMOUNT_WITH_CLAIMED_SQL = sql`COALESCE(weighted_amount, verified_amount, amount)`;
