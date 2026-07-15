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
