// Frontend helpers for the People's Choice Award vote (student banner + vote
// page, admin results/votes pages, admin config). Hand-written — bypasses
// Orval codegen, same pattern as the other *-api.ts helpers.
import { customFetch } from "@workspace/api-client-react";

export type PcaCandidate = {
  id: number;
  name: string;
  campusName: string | null;
};

// Drives both the global banner and the vote page.
export type PcaMe = {
  // Admin master switch.
  enabled: boolean;
  // This person's team clears the revenue bar, so they may vote.
  eligible: boolean;
  hasVoted: boolean;
  threshold?: number;
  // Candidates, with the caller's OWN team already removed by the server.
  teams: PcaCandidate[];
};

export function getPcaMe(): Promise<PcaMe> {
  return customFetch<PcaMe>("/api/pca/me", { method: "GET" });
}

export function castPcaVote(input: {
  votedTeamId: number;
  comments?: string;
}): Promise<{ ok: boolean }> {
  return customFetch<{ ok: boolean }>("/api/pca/vote", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

// ── Admin ──────────────────────────────────────────────────────────────────

export type PcaResultRow = {
  teamId: number;
  teamName: string;
  campusName: string;
  votes: number;
};

export function getPcaResults(): Promise<{
  items: PcaResultRow[];
  totalVotes: number;
}> {
  return customFetch<{ items: PcaResultRow[]; totalVotes: number }>(
    "/api/admin/pca/results",
    { method: "GET" },
  );
}

export type PcaVoteRow = {
  id: number;
  voterName: string;
  voterEmail: string;
  voterRole: "leader" | "member";
  voterTeamId: number;
  voterTeamName: string;
  votedTeamId: number;
  votedTeamName: string;
  campusName: string;
  comments: string | null;
  createdAt: string;
};

export type PcaVoteFilters = {
  role?: string;
  from?: string;
  to?: string;
};

function toQuery(f: PcaVoteFilters): string {
  const q = new URLSearchParams();
  if (f.role && f.role !== "all") q.set("role", f.role);
  if (f.from) q.set("from", f.from);
  if (f.to) q.set("to", f.to);
  return q.toString();
}

export function listPcaVotes(
  f: PcaVoteFilters,
): Promise<{ items: PcaVoteRow[]; totalCount: number }> {
  return customFetch<{ items: PcaVoteRow[]; totalCount: number }>(
    `/api/admin/pca/votes?${toQuery(f)}`,
    { method: "GET" },
  );
}

export function updatePcaVote(
  id: number,
  input: { votedTeamId?: number; comments?: string | null },
): Promise<{ ok: boolean }> {
  return customFetch<{ ok: boolean }>(`/api/admin/pca/votes/${id}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export function deletePcaVote(id: number): Promise<{ ok: boolean }> {
  return customFetch<{ ok: boolean }>(`/api/admin/pca/votes/${id}`, {
    method: "DELETE",
  });
}

// A file download, so it bypasses customFetch.
export function pcaExportUrl(f: PcaVoteFilters): string {
  return `/api/admin/pca/votes/export.csv?${toQuery(f)}`;
}

// ── Admin config ───────────────────────────────────────────────────────────

export type PcaConfig = {
  pcaVotingEnabled: boolean;
  pcaMinVerifiedRevenue: number;
};

export function getPcaConfig(): Promise<PcaConfig> {
  return customFetch<PcaConfig>("/api/admin/pca-config", { method: "GET" });
}

export function savePcaConfig(input: Partial<PcaConfig>): Promise<PcaConfig> {
  return customFetch<PcaConfig>("/api/admin/pca-config", {
    method: "PUT",
    body: JSON.stringify(input),
  });
}
