/**
 * Season 2 lead-pipeline domain logic (additive, isolated).
 *
 * The gates live here rather than in the route handlers so the BRD composer and
 * the review queue evaluate them with exactly the same code the student was
 * blocked by. A gate implemented twice is a gate that eventually disagrees with
 * itself.
 *
 *   Gate A  ADVISORY ONLY — never blocks a stage move. It measures how well
 *           documented a lead is (3+ dated interactions over 7+ days) for the
 *           admin Leads page and the BRD, nothing more.
 *   Gate B  converted lead -> project     enforced at project creation
 *   Gate C  project -> BRD submission     mandatory fields, phases and proof
 */
import { and, asc, eq, sql } from "drizzle-orm";
import {
  clientRegistryTable,
  db,
  leadInteractionsTable,
  leadsTable,
  type Lead,
  type LeadInteraction,
} from "@workspace/db";

// ── Gate A ──────────────────────────────────────────────────────────────────

/** Minimum dated interactions before a lead may leave the "new" stage. */
export const GATE_A_MIN_INTERACTIONS = 3;
/** Minimum span, in days, those interactions must cover. */
export const GATE_A_MIN_SPAN_DAYS = 7;

export type GateAStatus = {
  passed: boolean;
  interactionCount: number;
  spanDays: number;
  hasEvidence: boolean;
  /** Human-readable, shown verbatim to the student. */
  reasons: string[];
};

function daysBetween(aIso: string, bIso: string): number {
  const a = Date.parse(`${aIso}T00:00:00Z`);
  const b = Date.parse(`${bIso}T00:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) return 0;
  return Math.round(Math.abs(b - a) / 86_400_000);
}

/**
 * Evaluate Gate A from a lead's interaction rows.
 *
 * Reporting only — nothing refuses a stage move on this result. A student who
 * closes a client on the first visit is not cheating, so the pipeline no
 * longer holds them back; reviewers see the trail quality instead.
 * Deliberately counts DISTINCT DATES rather than rows, so five messages on one
 * afternoon do not look like five days of work.
 */
export function evaluateGateA(interactions: LeadInteraction[]): GateAStatus {
  const dates = [
    ...new Set(interactions.map((i) => i.interactionDate).filter(Boolean)),
  ].sort();

  const interactionCount = dates.length;
  const spanDays =
    dates.length >= 2 ? daysBetween(dates[0]!, dates[dates.length - 1]!) : 0;
  const hasEvidence = interactions.some(
    (i) => Array.isArray(i.attachments) && i.attachments.length > 0,
  );

  const reasons: string[] = [];
  if (interactionCount < GATE_A_MIN_INTERACTIONS) {
    const need = GATE_A_MIN_INTERACTIONS - interactionCount;
    reasons.push(
      `${need} more dated interaction${need === 1 ? "" : "s"} needed.`,
    );
  }
  if (spanDays < GATE_A_MIN_SPAN_DAYS) {
    const need = GATE_A_MIN_SPAN_DAYS - spanDays;
    reasons.push(
      `The trail must span ${GATE_A_MIN_SPAN_DAYS} days — ${need} more to go.`,
    );
  }

  return {
    passed: reasons.length === 0,
    interactionCount,
    spanDays,
    hasEvidence,
    reasons,
  };
}

// ── Derived lead state ──────────────────────────────────────────────────────

/** Referral and known-contact leads are related-party. */
export function isRelatedPartySource(source: string): boolean {
  return source === "referral" || source === "known_contact";
}

/**
 * Recompute and persist a lead's derived state after its trail changes.
 *
 * Only the silence clock now: the trail-strength score it used to write is
 * gone, and Gate A is evaluated from the interactions themselves wherever it
 * is needed rather than cached on the row.
 */
export async function refreshLeadDerivedState(leadId: number): Promise<void> {
  const interactions = await db
    .select()
    .from(leadInteractionsTable)
    .where(eq(leadInteractionsTable.leadId, leadId))
    .orderBy(asc(leadInteractionsTable.interactionDate));

  // Latest CONTACT date, not latest logged-at — silence is measured from when
  // the student last actually spoke to the client.
  const latestDate = interactions
    .map((i) => i.interactionDate)
    .filter(Boolean)
    .sort()
    .pop();

  await db
    .update(leadsTable)
    .set({
      ...(latestDate
        ? {
            lastContactAt: new Date(`${latestDate}T00:00:00Z`),
            // Fresh contact resets the nudge ladder, so a lead that goes quiet
            // again later is nudged again from rung one.
            lastNudgeLevel: 0,
          }
        : {}),
    })
    .where(eq(leadsTable.id, leadId));
}

// ── Client registry ─────────────────────────────────────────────────────────

/**
 * Digits only, with an Indian country code stripped, so "+91 98490 12345",
 * "098490 12345" and "9849012345" all collide as the same client. Without this
 * the cross-team duplicate-client signal would miss the obvious cases.
 */
export function normalisePhone(raw: string): string {
  const digits = (raw ?? "").replace(/\D+/g, "");
  if (digits.length === 12 && digits.startsWith("91")) return digits.slice(2);
  if (digits.length === 11 && digits.startsWith("0")) return digits.slice(1);
  return digits;
}

/**
 * Record this business in the programme-wide client registry. One row per real
 * SMB, keyed on the normalised phone — that row is what the satisfaction call
 * writes back to, and what the duplicate-client fraud signal reads.
 *
 * Never throws: a registry hiccup must not stop a student capturing a lead.
 */
export async function upsertClientRegistry(lead: {
  phone: string;
  businessName: string;
  ownerName?: string | null;
  businessCategory?: string | null;
  city?: string | null;
}): Promise<void> {
  const phoneNormalised = normalisePhone(lead.phone);
  if (!phoneNormalised) return;
  try {
    await db
      .insert(clientRegistryTable)
      .values({
        phoneNormalised,
        businessName: lead.businessName,
        ownerName: lead.ownerName ?? null,
        businessCategory:
          (lead.businessCategory as never | undefined) ?? undefined,
        city: lead.city ?? null,
      })
      // Existing row wins — it may already carry call verification and an NPS
      // score that a later lead capture must not overwrite.
      .onConflictDoNothing({ target: clientRegistryTable.phoneNormalised });
  } catch {
    // Intentionally silent; see doc comment.
  }
}

/**
 * Teams OTHER than this one that have logged the same client phone. The
 * cross-team duplicate-client fraud signal.
 */
export async function findDuplicateClientTeams(
  phone: string,
  excludeTeamId: number,
  seasonId: number,
): Promise<number[]> {
  const normalised = normalisePhone(phone);
  if (!normalised) return [];
  const rows = await db
    .select({ teamId: leadsTable.teamId })
    .from(leadsTable)
    .where(
      and(
        eq(leadsTable.seasonId, seasonId),
        sql`regexp_replace(${leadsTable.phone}, '\\D', '', 'g') LIKE ${"%" + normalised}`,
      ),
    );
  return [...new Set(rows.map((r) => r.teamId))].filter(
    (id) => id !== excludeTeamId,
  );
}

// ── Stepper ─────────────────────────────────────────────────────────────────

// "open" is the advisory-mode counterpart of blocked/locked: the step has not
// been done yet, but nothing stops the team from doing it.
export type StepState = "complete" | "current" | "blocked" | "locked" | "open";

/**
 * The 5-step pipeline state for a team, driving the stepper shown at the top of
 * every pipeline screen. Computed server-side so the UI cannot disagree with
 * the gates that actually govern the buttons.
 */
export type PipelineStatus = {
  steps: Array<{
    step: number;
    key: "capture" | "work" | "project" | "payment" | "brd";
    label: string;
    state: StepState;
    caption: string;
  }>;
  gates: {
    a: { passed: boolean; label: string };
    b: { passed: boolean; label: string };
    c: { passed: boolean; label: string };
  };
  /** False = advisory: the gates are shown but never refuse an action. */
  enforced: boolean;
};

export function buildPipelineStatus(input: {
  leadCount: number;
  needsFollowUp: number;
  anyGateAPassed: boolean;
  convertedCount: number;
  projectCount: number;
  paymentCount: number;
  brdReadyCount: number;
  /** Defaults to enforced so existing callers keep their behaviour. */
  enforced?: boolean;
}): PipelineStatus {
  const {
    leadCount,
    needsFollowUp,
    anyGateAPassed,
    convertedCount,
    projectCount,
    paymentCount,
    brdReadyCount,
  } = input;
  const enforced = input.enforced ?? true;

  const captured = leadCount > 0;
  const canProject = convertedCount > 0;
  const hasProject = projectCount > 0;
  const hasPayment = paymentCount > 0;

  // In advisory mode nothing is ever blocked or locked: an undone step is
  // simply open. The gate labels below still say what is recommended.
  const state = (
    done: boolean,
    current: boolean,
    blocked: boolean,
  ): StepState =>
    done
      ? "complete"
      : current
        ? "current"
        : !enforced
          ? "open"
          : blocked
            ? "blocked"
            : "locked";

  return {
    steps: [
      {
        step: 1,
        key: "capture",
        label: "Capture the lead",
        state: captured ? "complete" : "current",
        caption: captured
          ? `${leadCount} lead${leadCount === 1 ? "" : "s"} captured`
          : "Start by logging a client",
      },
      {
        step: 2,
        key: "work",
        label: "Work the lead",
        state: state(canProject, captured && !canProject, false),
        caption: needsFollowUp > 0
          ? `${needsFollowUp} need follow-up`
          : anyGateAPassed
            ? "Ready to convert"
            : "Build the trail",
      },
      {
        step: 3,
        key: "project",
        label: "Open the project",
        state: state(hasProject, canProject && !hasProject, !canProject),
        caption: canProject
          ? hasProject
            ? `${projectCount} project${projectCount === 1 ? "" : "s"}`
            : "Pick a converted lead"
          : enforced
            ? "Needs a converted lead"
            : "Recommended: convert the lead first",
      },
      {
        step: 4,
        key: "payment",
        label: "Deliver & log payment",
        state: state(hasPayment, hasProject && !hasPayment, !hasProject),
        caption: hasPayment
          ? `${paymentCount} payment${paymentCount === 1 ? "" : "s"} logged`
          : enforced
            ? "Locked"
            : hasProject
              ? "Log the first payment"
              : "Open a project first",
      },
      {
        step: 5,
        key: "brd",
        label: "BRD ready",
        state: state(brdReadyCount > 0, hasPayment, !hasPayment),
        caption: "Generated automatically",
      },
    ],
    gates: {
      a: {
        passed: anyGateAPassed,
        label: `${GATE_A_MIN_INTERACTIONS} dated interactions spanning ${GATE_A_MIN_SPAN_DAYS}+ days`,
      },
      b: {
        passed: canProject,
        label: "A project can only start from a Converted lead",
      },
      c: {
        passed: brdReadyCount > 0,
        label:
          "All mandatory fields, phases, a payment and proof the work exists",
      },
    },
    enforced,
  };
}

// ── lead references ─────────────────────────────────────────────────────────

/**
 * Matches a canonical UUID. Anything else is treated as a legacy numeric id, so
 * a malformed value falls through to the integer branch and fails there rather
 * than reaching the database as an invalid uuid literal (which Postgres rejects
 * with a 500 instead of the 400 the caller deserves).
 */
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: string): boolean {
  return UUID_RE.test(value);
}

/**
 * Resolves the `:id` segment of a lead URL to a row, accepting either the
 * public UUID (what the dashboard now emits) or the legacy serial id (what
 * existing links, bookmarks and already-sent WhatsApp nudges still carry).
 *
 * Returns null for both "malformed reference" and "no such lead" — callers
 * answer 404 either way, and distinguishing them would confirm to a caller
 * probing ids which numbers exist.
 */
export async function resolveLeadRef(ref: string): Promise<Lead | null> {
  if (isUuid(ref)) {
    const [lead] = await db
      .select()
      .from(leadsTable)
      .where(eq(leadsTable.publicId, ref))
      .limit(1);
    return lead ?? null;
  }
  const id = Number(ref);
  if (!Number.isInteger(id) || id <= 0) return null;
  const [lead] = await db
    .select()
    .from(leadsTable)
    .where(eq(leadsTable.id, id))
    .limit(1);
  return lead ?? null;
}

export type { Lead };
