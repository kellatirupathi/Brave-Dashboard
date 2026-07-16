// Frontend helpers for per-team submission exemptions — teams allowed to add
// revenue/order-book entries while the global Projects Submissions Lock is on.
// Hand-written (bypasses Orval codegen), same pattern as the other *-api.ts.
import { customFetch } from "@workspace/api-client-react";

export type ExemptTeam = {
  teamId: number;
  teamName: string;
  campusName: string;
  enabledAt: string;
};

export type TeamSearchResult = {
  teamId: number;
  teamName: string;
  campusName: string;
  exempted: boolean;
};

export function listTeamExemptions(): Promise<{ items: ExemptTeam[] }> {
  return customFetch<{ items: ExemptTeam[] }>(
    "/api/admin/team-submission-exemptions",
    { method: "GET" },
  );
}

export function searchTeamsForExemption(
  q: string,
): Promise<{ items: TeamSearchResult[] }> {
  return customFetch<{ items: TeamSearchResult[] }>(
    `/api/admin/team-submission-exemptions/search?q=${encodeURIComponent(q)}`,
    { method: "GET" },
  );
}

export function getTeamExemption(
  teamId: number,
): Promise<{ teamId: number; exempted: boolean; enabledAt: string | null }> {
  return customFetch<{
    teamId: number;
    exempted: boolean;
    enabledAt: string | null;
  }>(`/api/admin/team-submission-exemptions/${teamId}`, { method: "GET" });
}

// Enable/disable one team (pass teamId) or many (pass teamIds).
export function setTeamExemptions(input: {
  teamId?: number;
  teamIds?: number[];
  enabled: boolean;
}): Promise<{ ok: boolean; count: number; enabled: boolean }> {
  return customFetch<{ ok: boolean; count: number; enabled: boolean }>(
    "/api/admin/team-submission-exemptions",
    { method: "PUT", body: JSON.stringify(input) },
  );
}

// ── "Request to submit" (student leader files, admin reviews) ──────────────

export type SubmissionRequest = {
  id: number;
  teamId: number;
  teamName: string;
  campusName: string;
  leaderName: string;
  purpose: string;
  status: "pending" | "approved" | "rejected";
  decisionNote: string;
  createdAt: string;
  exempted: boolean;
};

// Student (team leader): file a request. Idempotent per pending team.
export function createSubmissionRequest(
  purpose: string,
): Promise<{ ok: boolean; alreadyPending: boolean }> {
  return customFetch<{ ok: boolean; alreadyPending: boolean }>(
    "/api/submission-access-request",
    { method: "POST", body: JSON.stringify({ purpose }) },
  );
}

// Student: is there already a pending request for my team?
export function getMySubmissionRequest(): Promise<{
  pending: boolean;
  createdAt: string | null;
}> {
  return customFetch<{ pending: boolean; createdAt: string | null }>(
    "/api/submission-access-request/mine",
    { method: "GET" },
  );
}

// Admin: list open submission requests (pending + rejected).
export function listSubmissionRequests(): Promise<{
  items: SubmissionRequest[];
}> {
  return customFetch<{ items: SubmissionRequest[] }>(
    "/api/admin/submission-access-requests",
    { method: "GET" },
  );
}

// Admin: reject a request with a reason (emails the team).
export function rejectSubmissionRequest(
  id: number,
  reason: string,
): Promise<{ ok: boolean; id: number; status: string }> {
  return customFetch<{ ok: boolean; id: number; status: string }>(
    `/api/admin/submission-access-requests/${id}/reject`,
    { method: "PUT", body: JSON.stringify({ reason }) },
  );
}
