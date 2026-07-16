// Frontend helpers for BRAVE Finale Submissions (student page + admin list +
// admin config). Hand-written (bypasses Orval codegen), same pattern as the
// other *-api.ts helpers.
import { customFetch } from "@workspace/api-client-react";

export type FinaleSubmissionItem = {
  id: number;
  fileUrl: string;
  fileName: string | null;
  category: string | null;
  remarks: string | null;
  driveUrl: string | null;
  createdAt: string;
  submitterName: string;
};

// Everything the student page renders, in one call.
export type FinaleMe = {
  // Admin master switch for the whole feature.
  enabled: boolean;
  // Verified-revenue bar this team must clear to use the page.
  threshold: number;
  verifiedRevenue: number;
  eligible: boolean;
  // Only the team leader may upload; members get the page read-only.
  isLeader?: boolean;
  canUpload: boolean;
  // Whether the caller may edit/delete their team's decks (leader, unlocked).
  canManage?: boolean;
  // Admin-authored right-hand content.
  content: string;
  // When locked, the upload form is replaced by the banner below.
  locked: boolean;
  lockMessage: string;
  teamName: string | null;
  items: FinaleSubmissionItem[];
};

export function getFinaleMe(): Promise<FinaleMe> {
  return customFetch<FinaleMe>("/api/finale/me", { method: "GET" });
}

export function createFinaleSubmission(input: {
  fileUrl: string;
  fileName?: string;
  category?: string;
  remarks?: string;
}): Promise<{ ok: boolean; id: number | null }> {
  return customFetch<{ ok: boolean; id: number | null }>(
    "/api/finale/submission",
    { method: "POST", body: JSON.stringify(input) },
  );
}

// Edit a deck. Omit fileUrl to keep the current file and change only remarks.
// Used by BOTH the student page (leader) and the admin list — the server
// resolves permission from the caller's role.
export function updateFinaleSubmission(
  id: number,
  input: {
    fileUrl?: string;
    fileName?: string;
    category?: string | null;
    remarks?: string | null;
  },
): Promise<{ ok: boolean; id: number }> {
  return customFetch<{ ok: boolean; id: number }>(
    `/api/finale/submission/${id}`,
    { method: "PUT", body: JSON.stringify(input) },
  );
}

export function deleteFinaleSubmission(
  id: number,
): Promise<{ ok: boolean; id: number }> {
  return customFetch<{ ok: boolean; id: number }>(
    `/api/finale/submission/${id}`,
    { method: "DELETE" },
  );
}

// ── Admin list ─────────────────────────────────────────────────────────────

export type FinaleSort = "newest" | "oldest" | "team_asc" | "team_desc";

// One row per team — its latest deck, plus how many it has submitted.
export type FinaleAdminRow = {
  id: number;
  teamId: number;
  teamName: string;
  campusName: string;
  leaderName: string;
  leaderEmail: string;
  fileUrl: string;
  fileName: string | null;
  category: string | null;
  remarks: string | null;
  driveUrl: string | null;
  createdAt: string;
  totalSubmissions: number;
  verifiedRevenue: number;
};

export type FinaleAdminList = {
  items: FinaleAdminRow[];
  totalCount: number;
  page: number;
  pageSize: number;
  pageCount: number;
};

export type FinaleListParams = {
  search?: string;
  from?: string;
  to?: string;
  sort?: FinaleSort;
  page?: number;
  pageSize?: number;
};

function toQuery(params: FinaleListParams): string {
  const q = new URLSearchParams();
  if (params.search) q.set("search", params.search);
  if (params.from) q.set("from", params.from);
  if (params.to) q.set("to", params.to);
  if (params.sort) q.set("sort", params.sort);
  if (params.page) q.set("page", String(params.page));
  if (params.pageSize) q.set("pageSize", String(params.pageSize));
  return q.toString();
}

export function listFinaleSubmissions(
  params: FinaleListParams,
): Promise<FinaleAdminList> {
  return customFetch<FinaleAdminList>(
    `/api/admin/finale/submissions?${toQuery(params)}`,
    { method: "GET" },
  );
}

export function listTeamFinaleSubmissions(
  teamId: number,
): Promise<{ items: FinaleSubmissionItem[] }> {
  return customFetch<{ items: FinaleSubmissionItem[] }>(
    `/api/admin/finale/submissions/team/${teamId}`,
    { method: "GET" },
  );
}

// The export is a file download, so it bypasses customFetch.
export function finaleExportUrl(params: FinaleListParams): string {
  return `/api/admin/finale/submissions/export.csv?${toQuery(params)}`;
}

// ── Admin config ───────────────────────────────────────────────────────────

export type FinaleConfig = {
  finaleMenuEnabled: boolean;
  finaleMinVerifiedRevenue: number;
  finaleSubmissionsLocked: boolean;
  finaleLockMessage: string;
  finaleContent: string;
};

export function getFinaleConfig(): Promise<FinaleConfig> {
  return customFetch<FinaleConfig>("/api/admin/finale-config", {
    method: "GET",
  });
}

export function saveFinaleConfig(
  input: Partial<FinaleConfig>,
): Promise<FinaleConfig> {
  return customFetch<FinaleConfig>("/api/admin/finale-config", {
    method: "PUT",
    body: JSON.stringify(input),
  });
}
