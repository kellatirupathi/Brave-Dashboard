/**
 * Evaluation — SLA clocks, conflict of interest, and the six automated signals.
 *
 * DESIGN
 * - Signals are computed ONCE, at assignment, and stored on the assignment row.
 *   The evaluator's view and any later audit must see the same numbers; a signal
 *   that shifts underneath a decision makes the decision unreviewable.
 * - Signals INFORM, they never decide. Each carries a severity so the review
 *   pane can order attention, but none of them approves or rejects anything.
 *   An automated "concern" on a legitimate submission must cost the team
 *   nothing beyond a closer look.
 * - Two SLA clocks, because the five decision states describe two different
 *   kinds of waiting. See effectiveDueAt().
 *
 * OPEN DECISION (flagged, not invented away): the SLA window and the audit
 * sampling rate have not been signed off. Both are single constants here.
 */
import { and, eq, ne, sql } from "drizzle-orm";
import {
  db,
  leadInteractionsTable,
  leadsTable,
  paymentsTable,
  projectsTable,
  revenueEntriesTable,
  reviewAssignmentsTable,
  teamMembersTable,
  teamsTable,
  usersTable,
} from "@workspace/db";
import { evaluateGateA, normalisePhone } from "./lead-pipeline";
import { getTrustSummary, type TrustSummary } from "./trust-score";
import { logger } from "./logger";

/** Hours an evaluator has to decide, from assignment. Awaiting sign-off. */
export const SLA_HOURS = 72;

/** Share of APPROVED submissions independently re-checked. Awaiting sign-off. */
export const AUDIT_SAMPLE_RATE = 0.05;

// ── SLA ─────────────────────────────────────────────────────────────────────

export type SlaState = {
  dueAt: string | null;
  /** dueAt shifted by accumulated pause. This is the real deadline. */
  effectiveDueAt: string | null;
  /** True while the clock is stopped (changes_requested only). */
  paused: boolean;
  pausedSeconds: number;
  /** Negative once overdue. Null when there is no deadline. */
  remainingMinutes: number | null;
  overdue: boolean;
};

/**
 * Which decision states stop the clock.
 *
 * `changes_requested` pauses: the programme is waiting on the STUDENT, and
 * charging an evaluator for a student's response time would be wrong.
 *
 * `hold` deliberately does NOT pause: a hold means we are waiting on ourselves
 * — a second opinion, a coordinator call — and that delay is ours to own. If
 * hold paused the clock it would become a way to make any submission
 * indefinitely un-late, which is exactly what an SLA exists to prevent.
 */
export function pausesClock(decision: string): boolean {
  return decision === "changes_requested";
}

export function computeSla(row: {
  slaDueAt: Date | null;
  clockPausedAt: Date | null;
  pausedSeconds: number;
  decidedAt: Date | null;
}): SlaState {
  const paused = row.clockPausedAt != null;

  // Include the currently-running pause, otherwise a submission sitting in
  // changes_requested would appear to be sliding towards overdue.
  const livePause = paused
    ? Math.max(0, Math.round((Date.now() - row.clockPausedAt!.getTime()) / 1000))
    : 0;
  const pausedSeconds = row.pausedSeconds + livePause;

  if (!row.slaDueAt) {
    return {
      dueAt: null,
      effectiveDueAt: null,
      paused,
      pausedSeconds,
      remainingMinutes: null,
      overdue: false,
    };
  }

  const effective = new Date(row.slaDueAt.getTime() + pausedSeconds * 1000);
  // A decided assignment is measured against when it was decided, not now —
  // otherwise every closed review drifts into "overdue" forever.
  const reference = row.decidedAt ?? new Date();
  const remainingMinutes = Math.round(
    (effective.getTime() - reference.getTime()) / 60000,
  );

  return {
    dueAt: row.slaDueAt.toISOString(),
    effectiveDueAt: effective.toISOString(),
    paused,
    pausedSeconds,
    remainingMinutes,
    overdue: remainingMinutes < 0,
  };
}

export function slaDueFromNow(hours: number = SLA_HOURS): Date {
  return new Date(Date.now() + hours * 3_600_000);
}

// ── Conflict of interest ────────────────────────────────────────────────────

export type ConflictCheck = {
  eligible: boolean;
  /** Every reason, not just the first — a reviewer of the rules wants all of them. */
  reasons: string[];
};

/**
 * May this evaluator review this team?
 *
 * Checked when the assignment is CREATED, never at decision time — by then the
 * evaluator has already read the submission, and an undo is not possible.
 */
export async function checkConflict(
  evaluatorId: string,
  teamId: number,
): Promise<ConflictCheck> {
  const reasons: string[] = [];

  const [evaluator] = await db
    .select({
      id: usersTable.id,
      campusId: usersTable.campusId,
      isEvaluator: usersTable.isEvaluator,
      isActive: usersTable.isActive,
    })
    .from(usersTable)
    .where(eq(usersTable.id, evaluatorId))
    .limit(1);

  if (!evaluator) return { eligible: false, reasons: ["No such user."] };
  if (!evaluator.isEvaluator) reasons.push("Not marked as an evaluator.");
  if (!evaluator.isActive) reasons.push("Account is inactive.");

  const [team] = await db
    .select({ id: teamsTable.id, campusId: teamsTable.campusId })
    .from(teamsTable)
    .where(eq(teamsTable.id, teamId))
    .limit(1);
  if (!team) return { eligible: false, reasons: ["No such team."] };

  // Same campus is the single most likely real conflict: shared coaches, shared
  // classrooms, people who know each other.
  if (evaluator.campusId != null && evaluator.campusId === team.campusId) {
    reasons.push("Same campus as the team.");
  }

  // Membership of ANY team, not just this one, is checked below; membership of
  // this team is disqualifying outright.
  const [member] = await db
    .select({ userId: teamMembersTable.userId })
    .from(teamMembersTable)
    .where(
      and(
        eq(teamMembersTable.teamId, teamId),
        eq(teamMembersTable.userId, evaluatorId),
      ),
    )
    .limit(1);
  if (member) reasons.push("Is a member of this team.");

  return { eligible: reasons.length === 0, reasons };
}

/**
 * Evaluators who may take this team's work, least-loaded first.
 *
 * Load counts only OPEN assignments — a fair queue is about who is busy now,
 * not who has done the most over the season.
 */
export async function eligibleEvaluators(
  teamId: number,
  seasonId: number,
): Promise<Array<{ id: string; openCount: number }>> {
  const [team] = await db
    .select({ campusId: teamsTable.campusId })
    .from(teamsTable)
    .where(eq(teamsTable.id, teamId))
    .limit(1);
  if (!team) return [];

  const rows = await db
    .select({
      id: usersTable.id,
      openCount: sql<number>`(
        SELECT COUNT(*)::int FROM review_assignments ra
        WHERE ra.evaluator_id = ${usersTable.id}
          AND ra.season_id = ${seasonId}
          AND ra.decision IN ('pending', 'hold', 'changes_requested')
      )`,
    })
    .from(usersTable)
    .where(
      and(
        eq(usersTable.isEvaluator, true),
        eq(usersTable.isActive, true),
        // Cross-campus only. A NULL campus is treated as eligible: an
        // evaluator with no campus has no campus conflict.
        sql`(${usersTable.campusId} IS NULL OR ${usersTable.campusId} <> ${team.campusId})`,
        // Never a member of the team under review.
        sql`NOT EXISTS (
          SELECT 1 FROM team_members tm
          WHERE tm.team_id = ${teamId} AND tm.user_id = ${usersTable.id}
        )`,
      ),
    );

  return rows.sort((a, b) => a.openCount - b.openCount);
}

// ── The six signals ─────────────────────────────────────────────────────────

export type Severity = "ok" | "attention" | "concern";

export type Signal = {
  key: string;
  label: string;
  severity: Severity;
  /** One line an evaluator can act on. Never a bare number. */
  detail: string;
  /** Raw value, for the audit trail. */
  value?: number | string | boolean | null;
};

export type SignalSet = {
  signals: Signal[];
  /** Count of concerns, so a queue can be ordered without re-reading each one. */
  concerns: number;
  computedAt: string;
  /**
   * The team's trust standing at the time of assignment. Context, NOT a seventh
   * signal: it describes the team's history, not evidence about this
   * submission. Absent when it could not be read.
   */
  trust?: TrustSummary;
};

/** Hours after the fact beyond which a write-up looks reconstructed. */
const BACKDATE_HOURS = 72;

/**
 * Compute all six. Never throws: a signal that cannot be computed is reported
 * as unknown rather than failing the assignment, because an evaluator with five
 * signals is still far better off than one with none.
 */
export async function computeSignals(
  revenueEntryId: number,
): Promise<SignalSet> {
  const signals: Signal[] = [];
  const add = (s: Signal): void => void signals.push(s);

  try {
    const [entry] = await db
      .select()
      .from(revenueEntriesTable)
      .where(eq(revenueEntriesTable.id, revenueEntryId))
      .limit(1);
    if (!entry) {
      return { signals: [], concerns: 0, computedAt: new Date().toISOString() };
    }

    const [project] = await db
      .select()
      .from(projectsTable)
      .where(eq(projectsTable.id, entry.projectId))
      .limit(1);
    const lead =
      project?.leadId != null
        ? (
            await db
              .select()
              .from(leadsTable)
              .where(eq(leadsTable.id, project.leadId))
              .limit(1)
          )[0]
        : undefined;

    // ── 1. Interaction trail ────────────────────────────────────────────
    if (lead) {
      const interactions = await db
        .select()
        .from(leadInteractionsTable)
        .where(eq(leadInteractionsTable.leadId, lead.id));
      const gateA = evaluateGateA(interactions);
      add({
        key: "trail",
        label: "Interaction trail",
        // Read straight off the trail: enough dated contact spread over enough
        // days, or not. The old 0-100 score said the same thing through a
        // rubric nobody could see.
        severity: gateA.passed
          ? "ok"
          : interactions.length > 0
            ? "attention"
            : "concern",
        detail: gateA.passed
          ? `${interactions.length} interactions over ${gateA.spanDays} days.`
          : `${interactions.length} interactions over ${gateA.spanDays} days. ${gateA.reasons.join(" ")}`.trim(),
        value: gateA.interactionCount,
      });

      // ── 2. Backdating ─────────────────────────────────────────────────
      // The gap between when something happened and when it was written up. A
      // whole trail logged in one sitting is the classic fabrication pattern.
      let worstGap = 0;
      for (const i of interactions) {
        if (!i.loggedAt || !i.interactionDate) continue;
        const gap =
          (i.loggedAt.getTime() - Date.parse(`${i.interactionDate}T00:00:00Z`)) /
          3_600_000;
        if (gap > worstGap) worstGap = gap;
      }
      const days = Math.round(worstGap / 24);
      add({
        key: "backdating",
        label: "Write-up timing",
        severity:
          worstGap <= BACKDATE_HOURS
            ? "ok"
            : worstGap <= BACKDATE_HOURS * 3
              ? "attention"
              : "concern",
        detail:
          worstGap <= BACKDATE_HOURS
            ? "Interactions were logged close to when they happened."
            : `One interaction was written up about ${days} day${days === 1 ? "" : "s"} after the date claimed.`,
        value: Math.round(worstGap),
      });

      // ── 3. Duplicate client ───────────────────────────────────────────
      const phone = normalisePhone(lead.phone);
      const dupes = await db
        .select({
          teamId: leadsTable.teamId,
          teamName: teamsTable.name,
        })
        .from(leadsTable)
        .leftJoin(teamsTable, eq(teamsTable.id, leadsTable.teamId))
        .where(
          and(
            eq(leadsTable.seasonId, lead.seasonId),
            ne(leadsTable.teamId, lead.teamId),
            sql`regexp_replace(${leadsTable.phone}, '\\D', '', 'g') LIKE ${"%" + phone}`,
          ),
        );
      add({
        key: "duplicate_client",
        label: "Client claimed elsewhere",
        // Attention, never concern: two teams genuinely can approach the same
        // shop. This is a prompt to look, not a finding.
        severity: dupes.length > 0 ? "attention" : "ok",
        detail:
          dupes.length > 0
            ? `Also logged by ${dupes.map((d) => d.teamName ?? `team ${d.teamId}`).join(", ")}. Check whose evidence is stronger.`
            : "No other team has logged this client.",
        value: dupes.length,
      });

      // ── 4. Related party ──────────────────────────────────────────────
      add({
        key: "related_party",
        label: "Relationship to client",
        severity: lead.isRelatedParty ? "attention" : "ok",
        detail: lead.isRelatedParty
          ? `Known contact — ${lead.relationshipNote ?? lead.referrerName ?? "prior relationship"}. Allowed; check the evidence more closely.`
          : "No prior relationship declared.",
        value: lead.isRelatedParty,
      });
    }

    // ── 5. Payment evidence ─────────────────────────────────────────────
    const payments = project
      ? await db
          .select()
          .from(paymentsTable)
          .where(eq(paymentsTable.projectId, project.id))
      : [];
    const missingProof = payments.filter((p) => !p.paymentProof).length;
    const cashOnly = payments.filter((p) => p.paymentMode === "cash").length;
    add({
      key: "payment_evidence",
      label: "Payment evidence",
      severity:
        missingProof > 0
          ? "concern"
          : // All-cash is not wrongdoing, but it is the one mode with no
            // independent bank record, so it warrants a look.
            payments.length > 0 && cashOnly === payments.length
            ? "attention"
            : "ok",
      detail:
        missingProof > 0
          ? `${missingProof} payment${missingProof === 1 ? "" : "s"} missing payment proof.`
          : payments.length === 0
            ? "No payments recorded."
            : cashOnly === payments.length
              ? `All ${payments.length} payments are cash, so there is no bank record to check against.`
              : `${payments.length} payments, all with proof.`,
      value: missingProof,
    });

    // ── 6. Client confirmation ──────────────────────────────────────────
    const disputed = payments.filter((p) => p.clientConfirmed === false).length;
    const confirmed = payments.filter((p) => p.clientConfirmed === true).length;
    add({
      key: "client_confirmation",
      label: "Client confirmation",
      severity: disputed > 0 ? "concern" : confirmed > 0 ? "ok" : "attention",
      detail:
        disputed > 0
          ? `The client denied ${disputed} payment${disputed === 1 ? "" : "s"}.`
          : confirmed > 0
            ? `The client confirmed ${confirmed} payment${confirmed === 1 ? "" : "s"} on a call.`
            : "No confirmation call has happened yet.",
      value: disputed > 0 ? -disputed : confirmed,
    });

    // Trust standing is context rather than a seventh signal — it is the team's
    // history, not evidence about this submission.
    const trust = await getTrustSummary(entry.teamId, entry.seasonId);
    return {
      signals,
      concerns: signals.filter((s) => s.severity === "concern").length,
      computedAt: new Date().toISOString(),
      trust,
    };
  } catch (err) {
    logger.error({ err, revenueEntryId }, "[evaluation] signal computation failed");
    return {
      signals,
      concerns: signals.filter((s) => s.severity === "concern").length,
      computedAt: new Date().toISOString(),
    };
  }
}

// ── Audit sampling ──────────────────────────────────────────────────────────

/**
 * Should this approved submission be independently re-checked?
 *
 * Deterministic on the entry id rather than random, so the same submission
 * always gives the same answer — a re-run of the sweep must not be able to
 * sample something it previously skipped, and vice versa. Gold-tier teams are
 * sampled at a lower rate, which is what the tier promises.
 */
export function shouldAudit(
  revenueEntryId: number,
  tier: string,
  rate: number = AUDIT_SAMPLE_RATE,
): boolean {
  const effective = tier === "gold" ? rate / 2 : tier === "watch" ? 1 : rate;
  if (effective >= 1) return true;
  // A cheap deterministic hash. Not cryptographic — it only needs to spread
  // ids evenly and stay stable across runs.
  const h = ((revenueEntryId * 2654435761) % 4294967296) / 4294967296;
  return h < effective;
}

/** Assignments whose effective deadline has passed and are still undecided. */
export async function overdueAssignments(seasonId: number): Promise<
  Array<{ id: number; evaluatorId: string; teamId: number; overdueBy: number }>
> {
  const rows = await db
    .select()
    .from(reviewAssignmentsTable)
    .where(
      and(
        eq(reviewAssignmentsTable.seasonId, seasonId),
        sql`${reviewAssignmentsTable.decision} IN ('pending', 'hold')`,
      ),
    );
  const out: Array<{
    id: number;
    evaluatorId: string;
    teamId: number;
    overdueBy: number;
  }> = [];
  for (const r of rows) {
    const sla = computeSla(r);
    if (sla.overdue && sla.remainingMinutes != null) {
      out.push({
        id: r.id,
        evaluatorId: r.evaluatorId,
        teamId: r.teamId,
        overdueBy: -sla.remainingMinutes,
      });
    }
  }
  return out;
}
