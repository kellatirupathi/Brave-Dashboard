// Season 2 pipeline fetchers, hand-written (bypasses Orval codegen).
//
// Follows the same convention as leaderboard-api.ts: new Season 2 surface is
// written by hand rather than added to lib/api-spec/openapi.yaml, so no codegen
// round-trip can disturb the ~106 existing generated hooks.
//
// Every request goes through customFetch, which injects the season header — so
// these calls are automatically scoped to whichever season the user is viewing.
import { customFetch } from "@workspace/api-client-react";

// ── Stage vocabulary ────────────────────────────────────────────────────────
// Mirrors the `lead_stage` Postgres enum exactly. Getting this wrong is a
// runtime-only failure, so the mapping to labels lives here and nowhere else.
export const LEAD_STAGES = [
  "new",
  "qualified",
  "proposal_sent",
  "converted",
  "lost",
  "dormant",
] as const;
export type LeadStage = (typeof LEAD_STAGES)[number];

export const STAGE_LABEL: Record<LeadStage, string> = {
  new: "New",
  qualified: "Qualified",
  proposal_sent: "Proposal sent",
  converted: "Converted",
  lost: "Lost",
  dormant: "Dormant",
};

/** Stages that still need work from the team. */
export const OPEN_STAGES: LeadStage[] = ["new", "qualified", "proposal_sent"];

export type TrailBand = "strong" | "moderate" | "weak";

export type Lead = {
  id: number;
  teamId: number;
  seasonId: number;
  source: string;
  referrerName: string | null;
  relationshipNote: string | null;
  businessName: string;
  ownerName: string;
  phone: string;
  altPhone: string | null;
  businessCategory: string;
  city: string;
  areaLocality: string | null;
  geoLat: string | null;
  geoLng: string | null;
  firstMeetingDate: string;
  meetingMode: string;
  conversationNote: string;
  painPoint: string | null;
  estimatedValue: number | null;
  evidence: unknown;
  stage: LeadStage;
  isRelatedParty: boolean;
  trailStrength: number;
  lastContactAt: string | null;
  nextActionDate: string | null;
  createdBy: string;
  createdAt: string;
};

export type LeadInteraction = {
  id: number;
  leadId: number;
  interactionDate: string;
  interactionType: string;
  summary: string;
  outcome: string;
  objectionNote: string | null;
  attachments: string[] | null;
  stageChange: LeadStage | null;
  loggedAt: string;
  loggedBy: string;
};

export type GateStatus = {
  passed: boolean;
  reasons: string[];
};

/** Row shape from GET /leads — the base lead plus board-rendering extras. */
export type LeadListRow = Lead & {
  interactionCount: number;
  interactionsWithEvidence: number;
  lastInteractionDate: string | null;
  /** Null when nothing has been logged yet. */
  silentDays: number | null;
  needsFollowUp: boolean;
  trailBand: TrailBand;
};

export type LeadDetail = {
  lead: Lead;
  /** Newest first. */
  interactions: LeadInteraction[];
  gateA: GateStatus;
  trailStrength: number;
  trailBand: TrailBand;
  canConvert: boolean;
};

export type StepState = "complete" | "current" | "blocked" | "locked";

/**
 * The 5-step stepper. Computed server-side so the UI cannot disagree with the
 * gates that actually govern the buttons.
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
};

// ── Leads ───────────────────────────────────────────────────────────────────

export function listLeads(params?: {
  stage?: LeadStage;
  teamId?: number;
}): Promise<LeadListRow[]> {
  const q = new URLSearchParams();
  if (params?.stage) q.set("stage", params.stage);
  if (params?.teamId != null) q.set("teamId", String(params.teamId));
  const qs = q.toString();
  return customFetch<LeadListRow[]>(`/api/leads${qs ? `?${qs}` : ""}`, {
    method: "GET",
  });
}

export function getLead(id: number): Promise<LeadDetail> {
  return customFetch<LeadDetail>(`/api/leads/${id}`, { method: "GET" });
}

export type CreateLeadBody = {
  source: string;
  referrerName?: string;
  relationshipNote?: string;
  businessName: string;
  ownerName: string;
  phone: string;
  altPhone?: string;
  businessCategory: string;
  city: string;
  areaLocality?: string;
  geoLat?: string;
  geoLng?: string;
  firstMeetingDate: string;
  meetingMode: string;
  conversationNote: string;
  painPoint?: string;
  estimatedValue?: number;
  evidence?: string[];
};

/**
 * `duplicateClientTeams` is non-empty when another team has already logged this
 * phone number. It is a signal for the student, NOT a refusal — two teams
 * genuinely can approach the same shop, and the fraud console decides.
 */
export function createLead(body: CreateLeadBody): Promise<{
  lead: Lead;
  duplicateClientTeams: Array<{ teamId: number; teamName: string }>;
  relatedParty: boolean;
}> {
  return customFetch("/api/leads", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export type LogInteractionBody = {
  interactionDate: string;
  interactionType: string;
  summary: string;
  outcome: string;
  objectionNote?: string;
  nextActionDate?: string;
  attachments?: string[];
  stageChange?: LeadStage;
};

/**
 * Log an interaction. `stageRefused` comes back populated when a bundled stage
 * move failed its gate — the interaction is still saved, so the student never
 * loses what they typed.
 */
export function logInteraction(
  leadId: number,
  body: LogInteractionBody,
): Promise<{
  interaction: LeadInteraction;
  trailStrength: number;
  trailBand: TrailBand;
  gateA: GateStatus;
  stageApplied: LeadStage | null;
  stageRefused: { reasons: string[] } | null;
}> {
  return customFetch(`/api/leads/${leadId}/interactions`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function moveStage(
  leadId: number,
  stage: LeadStage,
): Promise<{ stage: LeadStage }> {
  return customFetch(`/api/leads/${leadId}/stage`, {
    method: "PATCH",
    body: JSON.stringify({ stage }),
  });
}

export function getPipelineStatus(): Promise<PipelineStatus> {
  return customFetch<PipelineStatus>("/api/pipeline/status", { method: "GET" });
}

// ── Projects, payments, BRD ─────────────────────────────────────────────────

export type PipelineProjectRow = {
  id: number;
  title: string;
  leadId: number | null;
  serviceCategory: string | null;
  totalContractValue: number | null;
  revenueType: string | null;
  createdAt: string;
  received: number;
};

export function listPipelineProjects(): Promise<PipelineProjectRow[]> {
  return customFetch<PipelineProjectRow[]>("/api/pipeline/projects", {
    method: "GET",
  });
}

export type PhaseInput = {
  name: string;
  deliverables?: string;
  startDate?: string;
  endDate?: string;
  amount: number;
  dueDate?: string;
  revenueType: "one_time" | "recurring";
};

export type CreatePipelineProjectBody = {
  leadId: number;
  title: string;
  serviceCategory: string;
  problemStatement: string;
  solutionDescription: string;
  techStack?: string[];
  liveProductUrl?: string;
  demoVideoUrl?: string;
  sourceCodeUrl?: string;
  prototypeUrl?: string;
  demoCredentials?: string;
  revenueType: "one_time" | "recurring";
  recurringFrequency?: "monthly" | "quarterly" | "annual";
  agreementDoc?: string;
  phases: PhaseInput[];
};

export function createPipelineProject(
  body: CreatePipelineProjectBody,
): Promise<{ projectId: number }> {
  return customFetch("/api/pipeline/projects", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export type ProjectPhase = {
  id: number;
  projectId: number;
  sortOrder: number;
  name: string;
  deliverables: string | null;
  startDate: string | null;
  endDate: string | null;
};

export type ScheduleRow = {
  id: number;
  phaseId: number;
  amount: number;
  dueDate: string | null;
  revenueType: string;
};

export type PaymentRow = {
  id: number;
  phaseId: number;
  amountReceived: number;
  paymentDate: string;
  paymentMode: string;
  transactionRef: string | null;
  clientConfirmed: boolean | null;
};

export function getPipelineProject(id: number): Promise<{
  project: PipelineProjectRow & { problemStatement: string | null };
  phases: ProjectPhase[];
  schedule: ScheduleRow[];
  payments: PaymentRow[];
}> {
  return customFetch(`/api/pipeline/projects/${id}`, { method: "GET" });
}

export type RecordPaymentBody = {
  phaseId: number;
  amountReceived: number;
  paymentDate: string;
  paymentMode: "upi" | "bank_transfer" | "cash" | "cheque";
  transactionRef?: string;
  paymentProof: string;
  invoiceDoc: string;
  deliveryProof?: string[];
};

export function recordPayment(
  projectId: number,
  body: RecordPaymentBody,
): Promise<PaymentRow> {
  return customFetch(`/api/pipeline/projects/${projectId}/payments`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export type ChecklistItem = {
  key: string;
  label: string;
  passed: boolean;
  detail?: string;
};

export type ComposedBrd = {
  project: {
    id: number;
    title: string;
    serviceCategory: string | null;
    teamName: string;
    seasonId: number;
    totalContractValue: number | null;
    revenueType: string | null;
    recurringFrequency: string | null;
  };
  client: {
    businessName: string;
    ownerName: string;
    phone: string;
    category: string;
    city: string;
    areaLocality: string | null;
  };
  relationship: {
    source: string;
    isRelatedParty: boolean;
    referrerName: string | null;
    relationshipNote: string | null;
    firstMeetingDate: string;
    meetingMode: string;
    geoCaptured: boolean;
  };
  problemStatement: string | null;
  solutionDescription: string | null;
  techStack: unknown;
  links: Record<string, string | null>;
  interactionTrail: Array<{
    date: string;
    type: string;
    summary: string;
    outcome: string;
    hasAttachment: boolean;
    loggedAfterHours: number | null;
  }>;
  phases: Array<{
    name: string;
    deliverables: string | null;
    scheduled: number;
    received: number;
  }>;
  payments: Array<{
    phaseName: string;
    amount: number;
    date: string;
    mode: string;
    transactionRef: string | null;
    hasProof: boolean;
    hasInvoice: boolean;
    clientConfirmed: boolean | null;
  }>;
  systemAssessment: {
    trailStrength: number;
    trailBand: TrailBand;
    gateA: GateStatus;
    isRelatedParty: boolean;
    claimedAmount: number;
    receivedAmount: number;
    composedAt: string;
  };
  gateC: {
    passed: boolean;
    items: ChecklistItem[];
    remaining: number;
  };
};

export function getBrd(projectId: number): Promise<ComposedBrd> {
  return customFetch<ComposedBrd>(`/api/pipeline/projects/${projectId}/brd`, {
    method: "GET",
  });
}

export function submitProject(
  projectId: number,
): Promise<{ entryId: number; amount: number }> {
  return customFetch(`/api/pipeline/projects/${projectId}/submit`, {
    method: "POST",
  });
}

// ── Structured errors ───────────────────────────────────────────────────────

/**
 * Read the JSON body of a failed request.
 *
 * customFetch throws an ApiError whose `.message` is only a formatted string
 * ("HTTP 409 Conflict: ..."); the machine-readable body — `code`, `items`,
 * `links` — lives on `.data`. Every gate refusal in this feature is expressed
 * there, so the UI reads it from here rather than parsing the message.
 */
export function apiErrorData<T = Record<string, unknown>>(
  err: unknown,
): T | null {
  if (err && typeof err === "object" && "data" in err) {
    const data = (err as { data: unknown }).data;
    if (data && typeof data === "object") return data as T;
  }
  return null;
}

// ── Query keys ──────────────────────────────────────────────────────────────
// seasonId participates in every key: the season travels as a header, so
// without it two seasons would share one cache entry.

export const leadKeys = {
  list: (seasonId: number | null, stage?: LeadStage) =>
    ["leads", seasonId, stage ?? "all"] as const,
  detail: (seasonId: number | null, id: number) =>
    ["lead", seasonId, id] as const,
  status: (seasonId: number | null) => ["pipeline-status", seasonId] as const,
  projects: (seasonId: number | null) =>
    ["pipeline-projects", seasonId] as const,
  project: (seasonId: number | null, id: number) =>
    ["pipeline-project", seasonId, id] as const,
  brd: (seasonId: number | null, id: number) =>
    ["pipeline-brd", seasonId, id] as const,
};
