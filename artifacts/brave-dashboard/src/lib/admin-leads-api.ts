// Admin Leads oversight fetchers, hand-written (bypasses Orval codegen), in
// the same convention as leads-api.ts. Every request goes through customFetch
// so the viewed-season header is attached automatically.
import { customFetch } from "@workspace/api-client-react";
import type { LeadStage, TrailBand } from "./leads-api";

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

export const BRD_STATUS_LABEL: Record<BrdStatus, string> = {
  no_project: "No project yet",
  awaiting_payment: "Awaiting payment",
  in_progress: "In progress",
  ready: "Ready to submit",
  submitted: "Submitted",
  verified: "Verified",
  rejected: "Rejected",
  revoked: "Revoked",
};

export const LEAD_SOURCES = [
  "walk_in",
  "online",
  "referral",
  "known_contact",
] as const;
export const SOURCE_LABEL: Record<(typeof LEAD_SOURCES)[number], string> = {
  walk_in: "Walk-in",
  online: "Found online",
  referral: "Referral",
  known_contact: "Known contact",
};

export const PIPELINE_STEP_LABEL: Record<number, string> = {
  1: "Captured",
  2: "Working the lead",
  3: "Project open",
  4: "Payment logged",
  5: "BRD submitted",
};

export type AdminLeadGateA = {
  passed: boolean;
  interactionCount: number;
  spanDays: number;
  reasons: string[];
};

export type AdminLeadRow = {
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
  stage: LeadStage;
  trailStrength: number;
  trailBand: TrailBand;
  interactionCount: number;
  interactionsWithEvidence: number;
  lastInteractionDate: string | null;
  lastLoggedAt: string | null;
  silentDays: number | null;
  needsFollowUp: boolean;
  nextActionDate: string | null;
  gateA: AdminLeadGateA;
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

export type AdminLeadsSummary = {
  total: number;
  byStage: Record<string, number>;
  byBrd: Record<string, number>;
  gateAPassed: number;
  relatedParty: number;
  projects: number;
  withPayments: number;
  brdReady: number;
  submitted: number;
  verified: number;
  rejected: number;
  needsFollowUp: number;
  estimatedValue: number;
  receivedAmount: number;
  verifiedAmount: number;
};

export type AdminLeadsResponse = {
  seasonId: number;
  seasonSupported: boolean;
  items: AdminLeadRow[];
  total: number;
  page: number;
  pageSize: number;
  sortBy?: string;
  sortDir?: "asc" | "desc";
  summary: AdminLeadsSummary;
  options?: {
    teams: { id: number; name: string }[];
    categories: string[];
  };
};

export type AdminLeadsSortKey =
  | "client"
  | "team"
  | "campus"
  | "stage"
  | "trail"
  | "interactions"
  | "lastContact"
  | "estimatedValue"
  | "received"
  | "brd"
  | "step"
  | "created";

export type AdminLeadsQuery = {
  search?: string;
  campusId?: number;
  teamId?: number;
  stage?: string;
  source?: string;
  trail?: string;
  brd?: string;
  gateA?: "passed" | "pending";
  relatedParty?: boolean;
  category?: string;
  followUp?: boolean;
  sortBy?: AdminLeadsSortKey;
  sortDir?: "asc" | "desc";
  page?: number;
  pageSize?: number;
};

export function adminLeadsQueryString(q: AdminLeadsQuery): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(q)) {
    if (v === undefined || v === null || v === "" || v === "all") continue;
    p.set(k, String(v));
  }
  const s = p.toString();
  return s ? `?${s}` : "";
}

export function listAdminLeads(q: AdminLeadsQuery): Promise<AdminLeadsResponse> {
  return customFetch<AdminLeadsResponse>(
    `/api/admin/leads${adminLeadsQueryString(q)}`,
    { method: "GET" },
  );
}

export type AdminLeadInteraction = {
  id: number;
  leadId: number;
  interactionDate: string;
  interactionType: string;
  summary: string;
  outcome: string;
  objectionNote: string | null;
  nextActionDate: string | null;
  attachments: string[] | null;
  stageChange: LeadStage | null;
  loggedAt: string;
  loggedBy: string;
};

export type AdminLeadPhase = {
  id: number;
  name: string;
  deliverables: string | null;
  startDate: string | null;
  endDate: string | null;
  scheduledAmount: number | null;
  dueDate: string | null;
  receivedAmount: number;
};

export type AdminLeadPayment = {
  id: number;
  phaseId: number;
  phaseName: string;
  amountReceived: number;
  paymentDate: string;
  paymentMode: string;
  transactionRef: string | null;
  paymentProof: string;
  invoiceDoc: string | null;
  deliveryProof: unknown;
  clientConfirmed: boolean;
  clientConfirmedAt: string | null;
};

export type AdminLeadProject = {
  id: number;
  title: string;
  description: string;
  status: string;
  serviceCategory: string | null;
  problemStatement: string | null;
  solutionDescription: string | null;
  techStack: unknown;
  liveProductUrl: string | null;
  demoVideoUrl: string | null;
  sourceCodeUrl: string | null;
  prototypeUrl: string | null;
  demoCredentials: string | null;
  revenueType: string | null;
  recurringFrequency: string | null;
  totalContractValue: number | null;
  agreementDoc: string | null;
  adminNotes: string | null;
  createdAt: string;
  phases: AdminLeadPhase[];
  payments: AdminLeadPayment[];
};

export type ComposedBrdChecklistItem = {
  key: string;
  label: string;
  passed: boolean;
  detail?: string;
};

export type ComposedBrd = {
  gateC: {
    passed: boolean;
    items: ComposedBrdChecklistItem[];
    remaining: number;
  };
  systemAssessment: {
    trailStrength: number;
    trailBand: string;
    isRelatedParty: boolean;
    claimedAmount: number;
    receivedAmount: number;
    composedAt: string;
  };
  interactionTrail: Array<{
    date: string;
    type: string;
    summary: string;
    outcome: string;
    hasAttachment: boolean;
    loggedAfterHours: number | null;
  }>;
};

export type AdminLeadDetail = {
  lead: AdminLeadRow;
  raw: {
    evidence: unknown;
    geoLat: string | null;
    geoLng: string | null;
    lastNudgeLevel: number;
    lastNudgeAt: string | null;
    createdBy: string;
  };
  team: {
    id: number;
    name: string;
    campusId: number | null;
    campusName: string | null;
    members: {
      userId: string;
      name: string;
      niatId: string | null;
      email: string | null;
      isLeader: boolean;
    }[];
  } | null;
  interactions: AdminLeadInteraction[];
  project: AdminLeadProject | null;
  revenueEntry: {
    id: number;
    status: string;
    amount: number;
    verifiedAmount: number | null;
    recognisedAmount: number | null;
    weightedAmount: number | null;
    paymentDate: string;
    submittedAt: string | null;
    adminNotes: string | null;
    brdText: string | null;
    brdScore: number | null;
  } | null;
  brd: ComposedBrd | null;
  duplicateTeams: { id: number; name: string; campusName: string | null }[];
};

export function getAdminLead(id: number): Promise<AdminLeadDetail> {
  return customFetch<AdminLeadDetail>(`/api/admin/leads/${id}`, {
    method: "GET",
  });
}

export const adminLeadKeys = {
  list: (seasonId: number | null, q: AdminLeadsQuery) =>
    ["admin-leads", seasonId, q] as const,
  detail: (seasonId: number | null, id: number | null) =>
    ["admin-leads", "detail", seasonId, id] as const,
};
