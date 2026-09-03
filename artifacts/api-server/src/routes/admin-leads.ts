/**
 * Admin Leads oversight (additive, isolated, READ-ONLY).
 *
 * One table for the whole Season 2 pipeline: every lead from every team, with
 * the derived state an admin needs to track it end to end — interaction trail,
 * Gate A, the project it turned into, the money received, and where the BRD
 * stands (not started → ready → submitted → verified / rejected).
 *
 * ISOLATION CONTRACT
 * - Nothing here writes. The student pipeline (leads.ts / pipeline.ts) and the
 *   review queue are untouched; this only reads what they produced.
 * - The gates are NOT re-implemented. Gate A comes from evaluateGateA(); the
 *   per-lead Gate C shown in the table is the cheap column-level version of the
 *   checklist in brd-composer.ts, and the detail view calls composeBrd() for
 *   the authoritative one.
 * - Deleting this file means removing the single `router.use(adminLeadsRouter)`
 *   line in routes/index.ts plus its import.
 *
 * WHY THE LIST IS FILTERED IN JS
 * Most filters (BRD status, Gate A, trail band) are derived from aggregates
 * across four tables. Pushing them into SQL would mean re-deriving the gates
 * in a second language. Leads are season-scoped and a season's whole set is
 * small enough to hold in memory (thousands, not millions), so we load once,
 * derive once, then filter / sort / page the derived rows.
 */
import { Router, type IRouter, type Request, type Response } from "express";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import {
  db,
  campusesTable,
  leadInteractionsTable,
  leadsTable,
  paymentScheduleTable,
  paymentsTable,
  projectPhasesTable,
  projectsTable,
  revenueEntriesTable,
  teamMembersTable,
  teamsTable,
  usersTable,
} from "@workspace/db";
import { resolveSeason } from "../lib/season";
import { SEASON_2_MIN } from "../middlewares/seasonGuard";
import { requireAdminPage } from "../lib/require-admin-page";
import {
  GATE_A_MIN_INTERACTIONS,
  GATE_A_MIN_SPAN_DAYS,
  findDuplicateClientTeams,
  trailBand,
  trailMeetsSubmissionBar,
  type TrailBand,
} from "../lib/lead-pipeline";
import { composeBrd } from "../lib/brd-composer";
import { logger } from "../lib/logger";

const router: IRouter = Router();

const PAGE_KEY = "/admin/leads";

// ── Derived vocabulary ──────────────────────────────────────────────────────

/**
 * Where the BRD stands for this lead. Ordered: each value is "further along"
 * than the one before it, which is what the sort and the stat tiles rely on.
 */
export const BRD_STATUSES = [
  "no_project",
  "awaiting_payment",
  "in_progress",
  "ready",
  "submitted",
  "verified",
  "rejected",
  "revoked",
] as const;
export type BrdStatus = (typeof BRD_STATUSES)[number];

const BRD_STATUS_LABEL: Record<BrdStatus, string> = {
  no_project: "No project yet",
  awaiting_payment: "Awaiting payment",
  in_progress: "In progress",
  ready: "Ready to submit",
  submitted: "Submitted",
  verified: "Verified",
  rejected: "Rejected",
  revoked: "Revoked",
};

type GateA = {
  passed: boolean;
  interactionCount: number;
  spanDays: number;
  reasons: string[];
};

type LeadRow = {
  id: number;
  teamId: number;
  teamName: string;
  campusId: number | null;
  campusName: string | null;
  leaderName: string | null;
  source: string;
  isRelatedParty: boolean;
  referrerName: string | null;
  relationshipNote: string | null;
  businessName: string;
  ownerName: string;
  phone: string;
  altPhone: string | null;
  businessCategory: string;
  city: string;
  areaLocality: string | null;
  geoCaptured: boolean;
  firstMeetingDate: string;
  meetingMode: string;
  conversationNote: string;
  painPoint: string | null;
  estimatedValue: number | null;
  evidenceCount: number;
  stage: string;
  trailStrength: number;
  trailBand: TrailBand;
  interactionCount: number;
  interactionsWithEvidence: number;
  lastInteractionDate: string | null;
  lastLoggedAt: string | null;
  silentDays: number | null;
  needsFollowUp: boolean;
  nextActionDate: string | null;
  gateA: GateA;
  /** 1 captured · 2 working · 3 project · 4 paid · 5 BRD submitted */
  pipelineStep: number;
  project: {
    id: number;
    title: string;
    serviceCategory: string | null;
    revenueType: string | null;
    totalContractValue: number | null;
    phaseCount: number;
    createdAt: string;
  } | null;
  payments: {
    count: number;
    received: number;
    lastDate: string | null;
    clientConfirmed: number;
  };
  brdStatus: BrdStatus;
  brdStatusLabel: string;
  /** Column-level Gate C: how many checklist items still fail (0 = ready). */
  gateCRemaining: number | null;
  revenueEntry: {
    id: number;
    status: string;
    amount: number;
    verifiedAmount: number | null;
    recognisedAmount: number | null;
    weightedAmount: number | null;
    submittedAt: string | null;
    adminNotes: string | null;
  } | null;
  createdAt: string;
  updatedAt: string;
};

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function daysBetween(aIso: string, bIso: string): number {
  const a = Date.parse(`${aIso}T00:00:00Z`);
  const b = Date.parse(`${bIso}T00:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) return 0;
  return Math.round(Math.abs(b - a) / 86_400_000);
}

/**
 * Gate A from the grouped aggregate rather than the raw rows. Same rule as
 * evaluateGateA() — distinct DATES, not row count — expressed over
 * count(distinct) / min / max so one query covers every lead in the season.
 */
function gateAFromAggregate(
  distinctDates: number,
  minDate: string | null,
  maxDate: string | null,
): GateA {
  const spanDays = minDate && maxDate ? daysBetween(minDate, maxDate) : 0;
  const reasons: string[] = [];
  if (distinctDates < GATE_A_MIN_INTERACTIONS) {
    const need = GATE_A_MIN_INTERACTIONS - distinctDates;
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
    interactionCount: distinctDates,
    spanDays,
    reasons,
  };
}

function requireAdmin(req: Request, res: Response): boolean {
  if (!req.isAuthenticated() || req.user.role !== "admin") {
    res.status(403).json({ error: "Forbidden" });
    return false;
  }
  return true;
}

// ── The season-wide derived list ────────────────────────────────────────────

async function loadSeasonLeads(seasonId: number): Promise<LeadRow[]> {
  const leader = usersTable;
  const leads = await db
    .select({
      lead: leadsTable,
      teamName: teamsTable.name,
      campusId: teamsTable.campusId,
      campusName: campusesTable.name,
      leaderFirst: leader.firstName,
      leaderLast: leader.lastName,
    })
    .from(leadsTable)
    .innerJoin(teamsTable, eq(teamsTable.id, leadsTable.teamId))
    .leftJoin(campusesTable, eq(campusesTable.id, teamsTable.campusId))
    .leftJoin(leader, eq(leader.id, teamsTable.leaderId))
    .where(eq(leadsTable.seasonId, seasonId))
    .orderBy(desc(leadsTable.createdAt));

  if (leads.length === 0) return [];

  // Interaction aggregates, one row per lead.
  const interactionAgg = await db
    .select({
      leadId: leadInteractionsTable.leadId,
      n: sql<number>`count(*)::int`,
      distinctDates: sql<number>`count(distinct ${leadInteractionsTable.interactionDate})::int`,
      minDate: sql<string | null>`min(${leadInteractionsTable.interactionDate})`,
      maxDate: sql<string | null>`max(${leadInteractionsTable.interactionDate})`,
      // CASE, not AND: Postgres does not promise short-circuit evaluation, and
      // jsonb_array_length() throws on a non-array value.
      withEvidence: sql<number>`count(*) filter (where case when jsonb_typeof(${leadInteractionsTable.attachments}) = 'array' then jsonb_array_length(${leadInteractionsTable.attachments}) > 0 else false end)::int`,
      lastLoggedAt: sql<string | null>`max(${leadInteractionsTable.loggedAt})`,
    })
    .from(leadInteractionsTable)
    .where(eq(leadInteractionsTable.seasonId, seasonId))
    .groupBy(leadInteractionsTable.leadId);
  const interactionsByLead = new Map(interactionAgg.map((r) => [r.leadId, r]));

  // Projects descended from these leads (Gate B guarantees leadId is set).
  const leadIds = leads.map((l) => l.lead.id);
  const projects = await db
    .select({
      id: projectsTable.id,
      leadId: projectsTable.leadId,
      title: projectsTable.title,
      serviceCategory: projectsTable.serviceCategory,
      problemStatement: projectsTable.problemStatement,
      solutionDescription: projectsTable.solutionDescription,
      revenueType: projectsTable.revenueType,
      totalContractValue: projectsTable.totalContractValue,
      createdAt: projectsTable.createdAt,
    })
    .from(projectsTable)
    .where(
      and(
        eq(projectsTable.seasonId, seasonId),
        inArray(projectsTable.leadId, leadIds),
      ),
    )
    .orderBy(asc(projectsTable.createdAt));
  // Newest project per lead wins if a lead somehow has more than one.
  const projectByLead = new Map<number, (typeof projects)[number]>();
  for (const p of projects) if (p.leadId != null) projectByLead.set(p.leadId, p);
  const projectIds = projects.map((p) => p.id);

  const phaseAgg = projectIds.length
    ? await db
        .select({
          projectId: projectPhasesTable.projectId,
          n: sql<number>`count(*)::int`,
        })
        .from(projectPhasesTable)
        .where(inArray(projectPhasesTable.projectId, projectIds))
        .groupBy(projectPhasesTable.projectId)
    : [];
  const phasesByProject = new Map(phaseAgg.map((r) => [r.projectId, r.n]));

  const scheduleAgg = projectIds.length
    ? await db
        .select({
          projectId: paymentScheduleTable.projectId,
          phases: sql<number>`count(distinct ${paymentScheduleTable.phaseId})::int`,
        })
        .from(paymentScheduleTable)
        .where(inArray(paymentScheduleTable.projectId, projectIds))
        .groupBy(paymentScheduleTable.projectId)
    : [];
  const scheduledPhasesByProject = new Map(
    scheduleAgg.map((r) => [r.projectId, r.phases]),
  );

  const paymentAgg = projectIds.length
    ? await db
        .select({
          projectId: paymentsTable.projectId,
          n: sql<number>`count(*)::int`,
          received: sql<number>`coalesce(sum(${paymentsTable.amountReceived}), 0)::int`,
          lastDate: sql<string | null>`max(${paymentsTable.paymentDate})`,
          confirmed: sql<number>`count(*) filter (where ${paymentsTable.clientConfirmed})::int`,
        })
        .from(paymentsTable)
        .where(inArray(paymentsTable.projectId, projectIds))
        .groupBy(paymentsTable.projectId)
    : [];
  const paymentsByProject = new Map(paymentAgg.map((r) => [r.projectId, r]));

  const entries = projectIds.length
    ? await db
        .select({
          id: revenueEntriesTable.id,
          projectId: revenueEntriesTable.projectId,
          status: revenueEntriesTable.status,
          amount: revenueEntriesTable.amount,
          verifiedAmount: revenueEntriesTable.verifiedAmount,
          recognisedAmount: revenueEntriesTable.recognisedAmount,
          weightedAmount: revenueEntriesTable.weightedAmount,
          submittedAt: revenueEntriesTable.submittedAt,
          adminNotes: revenueEntriesTable.adminNotes,
        })
        .from(revenueEntriesTable)
        .where(inArray(revenueEntriesTable.projectId, projectIds))
        .orderBy(asc(revenueEntriesTable.id))
    : [];
  // Latest entry per project (pipeline.ts keeps one per project; be safe).
  const entryByProject = new Map<number, (typeof entries)[number]>();
  for (const e of entries) entryByProject.set(e.projectId, e);

  const today = todayIso();

  return leads.map(({ lead, teamName, campusId, campusName, leaderFirst, leaderLast }) => {
    const ia = interactionsByLead.get(lead.id);
    const lastDate = ia?.maxDate ?? null;
    const silentDays = lastDate ? daysBetween(today, lastDate) : null;
    const gateA = gateAFromAggregate(
      ia?.distinctDates ?? 0,
      ia?.minDate ?? null,
      ia?.maxDate ?? null,
    );

    const project = projectByLead.get(lead.id) ?? null;
    const pay = project ? paymentsByProject.get(project.id) : undefined;
    const payments = {
      count: pay?.n ?? 0,
      received: pay?.received ?? 0,
      lastDate: pay?.lastDate ?? null,
      clientConfirmed: pay?.confirmed ?? 0,
    };
    const entry = project ? (entryByProject.get(project.id) ?? null) : null;

    // Column-level Gate C. Mirrors the checklist in brd-composer.ts item for
    // item. Payment proof is mandatory at write time.
    let gateCRemaining: number | null = null;
    if (project) {
      const phaseCount = phasesByProject.get(project.id) ?? 0;
      const scheduled = scheduledPhasesByProject.get(project.id) ?? 0;
      const checks = [
        !!project.serviceCategory &&
          !!project.problemStatement &&
          !!project.solutionDescription &&
          !!project.revenueType,
        phaseCount >= 2,
        phaseCount > 0 && scheduled >= phaseCount,
        trailMeetsSubmissionBar(lead.trailStrength),
        gateA.passed,
        payments.count > 0,
        !lead.isRelatedParty ||
          !!lead.referrerName?.trim() ||
          !!lead.relationshipNote?.trim(),
      ];
      gateCRemaining = checks.filter((c) => !c).length;
    }

    let brdStatus: BrdStatus;
    if (entry && entry.status !== "draft") {
      brdStatus = entry.status as BrdStatus;
    } else if (!project) {
      brdStatus = "no_project";
    } else if (payments.count === 0) {
      brdStatus = "awaiting_payment";
    } else if (gateCRemaining === 0) {
      brdStatus = "ready";
    } else {
      brdStatus = "in_progress";
    }

    const pipelineStep =
      entry && entry.status !== "draft"
        ? 5
        : payments.count > 0
          ? 4
          : project
            ? 3
            : (ia?.n ?? 0) > 0
              ? 2
              : 1;

    const evidence = Array.isArray(lead.evidence) ? lead.evidence.length : 0;
    const leaderName =
      `${leaderFirst ?? ""} ${leaderLast ?? ""}`.trim() || null;

    return {
      id: lead.id,
      teamId: lead.teamId,
      teamName,
      campusId,
      campusName: campusName ?? null,
      leaderName,
      source: lead.source,
      isRelatedParty: lead.isRelatedParty,
      referrerName: lead.referrerName,
      relationshipNote: lead.relationshipNote,
      businessName: lead.businessName,
      ownerName: lead.ownerName,
      phone: lead.phone,
      altPhone: lead.altPhone,
      businessCategory: lead.businessCategory,
      city: lead.city,
      areaLocality: lead.areaLocality,
      geoCaptured: !!lead.geoLat && !!lead.geoLng,
      firstMeetingDate: lead.firstMeetingDate,
      meetingMode: lead.meetingMode,
      conversationNote: lead.conversationNote,
      painPoint: lead.painPoint,
      estimatedValue: lead.estimatedValue,
      evidenceCount: evidence,
      stage: lead.stage,
      trailStrength: lead.trailStrength,
      trailBand: trailBand(lead.trailStrength),
      interactionCount: ia?.n ?? 0,
      interactionsWithEvidence: ia?.withEvidence ?? 0,
      lastInteractionDate: lastDate,
      lastLoggedAt: ia?.lastLoggedAt
        ? new Date(ia.lastLoggedAt).toISOString()
        : null,
      silentDays,
      needsFollowUp:
        silentDays != null &&
        silentDays >= 10 &&
        ["new", "qualified", "proposal_sent"].includes(lead.stage),
      nextActionDate: lead.nextActionDate,
      gateA,
      pipelineStep,
      project: project
        ? {
            id: project.id,
            title: project.title,
            serviceCategory: project.serviceCategory,
            revenueType: project.revenueType,
            totalContractValue: project.totalContractValue,
            phaseCount: phasesByProject.get(project.id) ?? 0,
            createdAt: project.createdAt.toISOString(),
          }
        : null,
      payments,
      brdStatus,
      brdStatusLabel: BRD_STATUS_LABEL[brdStatus],
      gateCRemaining,
      revenueEntry: entry
        ? {
            id: entry.id,
            status: entry.status,
            amount: entry.amount,
            verifiedAmount: entry.verifiedAmount,
            recognisedAmount: entry.recognisedAmount,
            weightedAmount: entry.weightedAmount,
            submittedAt: entry.submittedAt
              ? entry.submittedAt.toISOString()
              : null,
            adminNotes: entry.adminNotes,
          }
        : null,
      createdAt: lead.createdAt.toISOString(),
      updatedAt: lead.updatedAt.toISOString(),
    };
  });
}

// ── Filtering / sorting ─────────────────────────────────────────────────────

type ListFilters = {
  search: string;
  campusId: number | null;
  teamId: number | null;
  stage: string | null;
  source: string | null;
  trail: string | null;
  brd: string | null;
  gateA: "passed" | "pending" | null;
  relatedParty: boolean | null;
  category: string | null;
  followUp: boolean | null;
};

function readFilters(q: Request["query"]): ListFilters {
  const str = (k: string): string | null => {
    const v = q[k];
    return typeof v === "string" && v.trim() !== "" && v !== "all"
      ? v.trim()
      : null;
  };
  const num = (k: string): number | null => {
    const v = str(k);
    if (v == null) return null;
    const n = Number(v);
    return Number.isInteger(n) && n > 0 ? n : null;
  };
  const bool = (k: string): boolean | null => {
    const v = str(k);
    if (v === "true") return true;
    if (v === "false") return false;
    return null;
  };
  const gate = str("gateA");
  return {
    search: str("search")?.toLowerCase() ?? "",
    campusId: num("campusId"),
    teamId: num("teamId"),
    stage: str("stage"),
    source: str("source"),
    trail: str("trail"),
    brd: str("brd"),
    gateA: gate === "passed" || gate === "pending" ? gate : null,
    relatedParty: bool("relatedParty"),
    category: str("category"),
    followUp: bool("followUp"),
  };
}

function applyFilters(rows: LeadRow[], f: ListFilters): LeadRow[] {
  return rows.filter((r) => {
    if (f.campusId != null && r.campusId !== f.campusId) return false;
    if (f.teamId != null && r.teamId !== f.teamId) return false;
    if (f.stage && r.stage !== f.stage) return false;
    if (f.source && r.source !== f.source) return false;
    if (f.trail && r.trailBand !== f.trail) return false;
    if (f.brd && r.brdStatus !== f.brd) return false;
    if (f.gateA === "passed" && !r.gateA.passed) return false;
    if (f.gateA === "pending" && r.gateA.passed) return false;
    if (f.relatedParty != null && r.isRelatedParty !== f.relatedParty)
      return false;
    if (f.category && r.businessCategory !== f.category) return false;
    if (f.followUp != null && r.needsFollowUp !== f.followUp) return false;
    if (f.search) {
      const hay = [
        r.businessName,
        r.ownerName,
        r.phone,
        r.altPhone ?? "",
        r.teamName,
        r.campusName ?? "",
        r.city,
        r.areaLocality ?? "",
        r.project?.title ?? "",
        r.leaderName ?? "",
      ]
        .join(" ")
        .toLowerCase();
      if (!hay.includes(f.search)) return false;
    }
    return true;
  });
}

const SORT_KEYS = [
  "client",
  "team",
  "campus",
  "stage",
  "trail",
  "interactions",
  "lastContact",
  "estimatedValue",
  "received",
  "brd",
  "step",
  "created",
] as const;
type SortKey = (typeof SORT_KEYS)[number];

const STAGE_ORDER: Record<string, number> = {
  new: 0,
  qualified: 1,
  proposal_sent: 2,
  converted: 3,
  dormant: 4,
  lost: 5,
};

function sortRows(rows: LeadRow[], key: SortKey, dir: "asc" | "desc"): LeadRow[] {
  const mul = dir === "asc" ? 1 : -1;
  const cmpStr = (a: string, b: string) => a.localeCompare(b) * mul;
  const cmpNum = (a: number, b: number) => (a - b) * mul;
  const sorted = [...rows];
  sorted.sort((a, b) => {
    switch (key) {
      case "client":
        return cmpStr(a.businessName, b.businessName);
      case "team":
        return cmpStr(a.teamName, b.teamName);
      case "campus":
        return cmpStr(a.campusName ?? "", b.campusName ?? "");
      case "stage":
        return cmpNum(STAGE_ORDER[a.stage] ?? 9, STAGE_ORDER[b.stage] ?? 9);
      case "trail":
        return cmpNum(a.trailStrength, b.trailStrength);
      case "interactions":
        return cmpNum(a.interactionCount, b.interactionCount);
      case "lastContact":
        return cmpStr(a.lastInteractionDate ?? "", b.lastInteractionDate ?? "");
      case "estimatedValue":
        return cmpNum(a.estimatedValue ?? 0, b.estimatedValue ?? 0);
      case "received":
        return cmpNum(a.payments.received, b.payments.received);
      case "brd":
        return cmpNum(
          BRD_STATUSES.indexOf(a.brdStatus),
          BRD_STATUSES.indexOf(b.brdStatus),
        );
      case "step":
        return cmpNum(a.pipelineStep, b.pipelineStep);
      case "created":
      default:
        return cmpStr(a.createdAt, b.createdAt);
    }
  });
  return sorted;
}

function summarise(rows: LeadRow[]) {
  const byStage: Record<string, number> = {};
  const byBrd: Record<string, number> = {};
  let gateAPassed = 0;
  let relatedParty = 0;
  let projects = 0;
  let withPayments = 0;
  let needsFollowUp = 0;
  let received = 0;
  let verified = 0;
  let estimated = 0;
  for (const r of rows) {
    byStage[r.stage] = (byStage[r.stage] ?? 0) + 1;
    byBrd[r.brdStatus] = (byBrd[r.brdStatus] ?? 0) + 1;
    if (r.gateA.passed) gateAPassed++;
    if (r.isRelatedParty) relatedParty++;
    if (r.project) projects++;
    if (r.payments.count > 0) withPayments++;
    if (r.needsFollowUp) needsFollowUp++;
    received += r.payments.received;
    estimated += r.estimatedValue ?? 0;
    if (r.revenueEntry?.status === "verified")
      verified += r.revenueEntry.verifiedAmount ?? 0;
  }
  return {
    total: rows.length,
    byStage,
    byBrd,
    gateAPassed,
    relatedParty,
    projects,
    withPayments,
    brdReady: byBrd["ready"] ?? 0,
    submitted: byBrd["submitted"] ?? 0,
    verified: byBrd["verified"] ?? 0,
    rejected: byBrd["rejected"] ?? 0,
    needsFollowUp,
    estimatedValue: estimated,
    receivedAmount: received,
    verifiedAmount: verified,
  };
}

// ── Routes ──────────────────────────────────────────────────────────────────

/**
 * GET /admin/leads
 * Paged, filtered, sorted table of every lead in the viewed season, plus a
 * summary over the FILTERED set (so the tiles answer "of what I'm looking at").
 */
router.get(
  "/admin/leads",
  requireAdminPage(PAGE_KEY, "view"),
  async (req: Request, res: Response): Promise<void> => {
    if (!requireAdmin(req, res)) return;
    const seasonId = await resolveSeason(req);

    const page = Math.max(1, Number(req.query["page"]) || 1);
    const pageSize = Math.min(
      1000,
      Math.max(10, Number(req.query["pageSize"]) || 100),
    );
    const sortByRaw = String(req.query["sortBy"] ?? "created");
    const sortBy: SortKey = (SORT_KEYS as readonly string[]).includes(sortByRaw)
      ? (sortByRaw as SortKey)
      : "created";
    const sortDir: "asc" | "desc" =
      req.query["sortDir"] === "asc" ? "asc" : "desc";

    if (seasonId < SEASON_2_MIN) {
      // The pipeline did not exist before Season 2; an empty table with the
      // flag lets the UI say so instead of implying nobody captured a lead.
      res.json({
        seasonId,
        seasonSupported: false,
        items: [],
        total: 0,
        page: 1,
        pageSize,
        summary: summarise([]),
      });
      return;
    }

    try {
      const all = await loadSeasonLeads(seasonId);
      const filtered = applyFilters(all, readFilters(req.query));
      const sorted = sortRows(filtered, sortBy, sortDir);
      const start = (page - 1) * pageSize;
      res.json({
        seasonId,
        seasonSupported: true,
        items: sorted.slice(start, start + pageSize),
        total: sorted.length,
        page,
        pageSize,
        sortBy,
        sortDir,
        summary: summarise(filtered),
        // Distinct filter options from the whole season, so a filter can be
        // picked even when the current filter set hides it.
        options: {
          teams: [...new Map(all.map((r) => [r.teamId, r.teamName])).entries()]
            .map(([id, name]) => ({ id, name }))
            .sort((a, b) => a.name.localeCompare(b.name)),
          categories: [...new Set(all.map((r) => r.businessCategory))].sort(),
        },
      });
    } catch (err) {
      logger.error({ err, seasonId }, "[admin-leads] list failed");
      res.status(500).json({ error: "Could not load leads." });
    }
  },
);

/**
 * GET /admin/leads/export.csv
 * The same filtered + sorted rows, every page, as a spreadsheet.
 */
router.get(
  "/admin/leads/export.csv",
  requireAdminPage(PAGE_KEY, "export"),
  async (req: Request, res: Response): Promise<void> => {
    if (!requireAdmin(req, res)) return;
    const seasonId = await resolveSeason(req);
    const sortByRaw = String(req.query["sortBy"] ?? "created");
    const sortBy: SortKey = (SORT_KEYS as readonly string[]).includes(sortByRaw)
      ? (sortByRaw as SortKey)
      : "created";
    const sortDir: "asc" | "desc" =
      req.query["sortDir"] === "asc" ? "asc" : "desc";

    try {
      const all =
        seasonId < SEASON_2_MIN ? [] : await loadSeasonLeads(seasonId);
      const rows = sortRows(applyFilters(all, readFilters(req.query)), sortBy, sortDir);

      const header = [
        "Lead ID",
        "Business",
        "Owner",
        "Phone",
        "Category",
        "City",
        "Area",
        "Team",
        "Campus",
        "Team leader",
        "Source",
        "Related party",
        "Stage",
        "Pipeline step",
        "Trail strength",
        "Trail band",
        "Interactions",
        "With evidence",
        "Last contact",
        "Silent days",
        "Gate A passed",
        "Gate A reasons",
        "First meeting",
        "Meeting mode",
        "Location captured",
        "Estimated value",
        "Project",
        "Service category",
        "Contract value",
        "Phases",
        "Payments",
        "Received",
        "Last payment",
        "Client confirmed payments",
        "Gate C items remaining",
        "BRD status",
        "Claimed",
        "Verified amount",
        "Submitted at",
        "Admin notes",
        "Captured at",
      ];
      const esc = (v: unknown): string => {
        if (v == null) return "";
        const s = String(v);
        return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
      };
      const lines = [header.map(esc).join(",")];
      for (const r of rows) {
        lines.push(
          [
            r.id,
            r.businessName,
            r.ownerName,
            r.phone,
            r.businessCategory,
            r.city,
            r.areaLocality,
            r.teamName,
            r.campusName,
            r.leaderName,
            r.source,
            r.isRelatedParty ? "yes" : "no",
            r.stage,
            r.pipelineStep,
            r.trailStrength,
            r.trailBand,
            r.interactionCount,
            r.interactionsWithEvidence,
            r.lastInteractionDate,
            r.silentDays,
            r.gateA.passed ? "yes" : "no",
            r.gateA.reasons.join(" "),
            r.firstMeetingDate,
            r.meetingMode,
            r.geoCaptured ? "yes" : "no",
            r.estimatedValue,
            r.project?.title,
            r.project?.serviceCategory,
            r.project?.totalContractValue,
            r.project?.phaseCount,
            r.payments.count,
            r.payments.received,
            r.payments.lastDate,
            r.payments.clientConfirmed,
            r.gateCRemaining,
            r.brdStatusLabel,
            r.revenueEntry?.amount,
            r.revenueEntry?.verifiedAmount,
            r.revenueEntry?.submittedAt,
            r.revenueEntry?.adminNotes,
            r.createdAt,
          ]
            .map(esc)
            .join(","),
        );
      }
      const filename = `brave-leads-season-${seasonId}-${todayIso()}.csv`;
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${filename}"`,
      );
      // BOM so Excel opens the ₹ and Indian names correctly.
      res.send("﻿" + lines.join("\r\n"));
    } catch (err) {
      logger.error({ err, seasonId }, "[admin-leads] export failed");
      res.status(500).json({ error: "Could not export leads." });
    }
  },
);

/**
 * GET /admin/leads/:id
 * Everything about one lead: the full trail, the team, the project with its
 * phases and payments, the revenue entry, and the authoritative composed BRD
 * (with the real Gate C checklist) when a project exists.
 */
router.get(
  "/admin/leads/:id",
  requireAdminPage(PAGE_KEY, "view"),
  async (req: Request, res: Response): Promise<void> => {
    if (!requireAdmin(req, res)) return;
    const id = Number(req.params["id"]);
    if (!Number.isInteger(id) || id <= 0) {
      res.status(400).json({ error: "Invalid lead id" });
      return;
    }

    try {
      const [lead] = await db
        .select()
        .from(leadsTable)
        .where(eq(leadsTable.id, id))
        .limit(1);
      if (!lead) {
        res.status(404).json({ error: "Lead not found" });
        return;
      }

      // Reuse the season-wide derivation for this one row so the detail can
      // never disagree with the table it was opened from.
      const derived = (await loadSeasonLeads(lead.seasonId)).find(
        (r) => r.id === id,
      );
      if (!derived) {
        res.status(404).json({ error: "Lead not found" });
        return;
      }

      const [team] = await db
        .select({
          id: teamsTable.id,
          name: teamsTable.name,
          campusId: teamsTable.campusId,
          leaderId: teamsTable.leaderId,
          campusName: campusesTable.name,
        })
        .from(teamsTable)
        .leftJoin(campusesTable, eq(campusesTable.id, teamsTable.campusId))
        .where(eq(teamsTable.id, lead.teamId))
        .limit(1);

      const members = await db
        .select({
          userId: teamMembersTable.userId,
          firstName: usersTable.firstName,
          lastName: usersTable.lastName,
          niatId: usersTable.niatId,
          email: usersTable.email,
        })
        .from(teamMembersTable)
        .leftJoin(usersTable, eq(usersTable.id, teamMembersTable.userId))
        .where(eq(teamMembersTable.teamId, lead.teamId));

      const interactions = await db
        .select()
        .from(leadInteractionsTable)
        .where(eq(leadInteractionsTable.leadId, id))
        .orderBy(
          asc(leadInteractionsTable.interactionDate),
          asc(leadInteractionsTable.id),
        );

      let project: Record<string, unknown> | null = null;
      let brd: Awaited<ReturnType<typeof composeBrd>> = null;
      if (derived.project) {
        const [p] = await db
          .select()
          .from(projectsTable)
          .where(eq(projectsTable.id, derived.project.id))
          .limit(1);
        const phases = await db
          .select()
          .from(projectPhasesTable)
          .where(eq(projectPhasesTable.projectId, derived.project.id))
          .orderBy(asc(projectPhasesTable.sortOrder));
        const schedule = await db
          .select()
          .from(paymentScheduleTable)
          .where(eq(paymentScheduleTable.projectId, derived.project.id));
        const payments = await db
          .select()
          .from(paymentsTable)
          .where(eq(paymentsTable.projectId, derived.project.id))
          .orderBy(asc(paymentsTable.paymentDate), asc(paymentsTable.id));
        const phaseName = new Map(phases.map((ph) => [ph.id, ph.name]));
        project = p
          ? {
              ...p,
              // adminNotes is admin-only and this IS the admin surface.
              phases: phases.map((ph) => {
                const sch = schedule.find((s) => s.phaseId === ph.id);
                const received = payments
                  .filter((pay) => pay.phaseId === ph.id)
                  .reduce((n, pay) => n + pay.amountReceived, 0);
                return {
                  ...ph,
                  scheduledAmount: sch?.amount ?? null,
                  dueDate: sch?.dueDate ?? null,
                  scheduledRevenueType: sch?.revenueType ?? null,
                  receivedAmount: received,
                };
              }),
              payments: payments.map((pay) => ({
                ...pay,
                phaseName: phaseName.get(pay.phaseId) ?? `Phase ${pay.phaseId}`,
              })),
            }
          : null;
        try {
          brd = await composeBrd(derived.project.id);
        } catch (err) {
          logger.warn(
            { err, projectId: derived.project.id },
            "[admin-leads] composeBrd failed; detail served without it",
          );
        }
      }

      let revenueEntry: Record<string, unknown> | null = null;
      if (derived.revenueEntry) {
        const [e] = await db
          .select({
            id: revenueEntriesTable.id,
            status: revenueEntriesTable.status,
            amount: revenueEntriesTable.amount,
            verifiedAmount: revenueEntriesTable.verifiedAmount,
            recognisedAmount: revenueEntriesTable.recognisedAmount,
            weightedAmount: revenueEntriesTable.weightedAmount,
            paymentDate: revenueEntriesTable.paymentDate,
            submittedAt: revenueEntriesTable.submittedAt,
            adminNotes: revenueEntriesTable.adminNotes,
            brdText: revenueEntriesTable.brdText,
            brdScore: revenueEntriesTable.brdScore,
          })
          .from(revenueEntriesTable)
          .where(eq(revenueEntriesTable.id, derived.revenueEntry.id))
          .limit(1);
        revenueEntry = e ?? null;
      }

      const duplicateTeamIds = await findDuplicateClientTeams(
        lead.phone,
        lead.teamId,
        lead.seasonId,
      );
      const duplicateTeams = duplicateTeamIds.length
        ? await db
            .select({
              id: teamsTable.id,
              name: teamsTable.name,
              campusName: campusesTable.name,
            })
            .from(teamsTable)
            .leftJoin(campusesTable, eq(campusesTable.id, teamsTable.campusId))
            .where(inArray(teamsTable.id, duplicateTeamIds))
        : [];

      res.json({
        lead: derived,
        raw: {
          evidence: lead.evidence,
          geoLat: lead.geoLat,
          geoLng: lead.geoLng,
          lastNudgeLevel: lead.lastNudgeLevel,
          lastNudgeAt: lead.lastNudgeAt,
          createdBy: lead.createdBy,
        },
        team: team
          ? {
              ...team,
              members: members
                .map((m) => ({
                  userId: m.userId,
                  name: `${m.firstName ?? ""} ${m.lastName ?? ""}`.trim(),
                  niatId: m.niatId ?? null,
                  email: m.email ?? null,
                  isLeader: m.userId === team.leaderId,
                }))
                .sort((a, b) =>
                  a.isLeader === b.isLeader ? 0 : a.isLeader ? -1 : 1,
                ),
            }
          : null,
        interactions,
        project,
        revenueEntry,
        brd,
        duplicateTeams,
      });
    } catch (err) {
      logger.error({ err, leadId: id }, "[admin-leads] detail failed");
      res.status(500).json({ error: "Could not load this lead." });
    }
  },
);

export default router;
