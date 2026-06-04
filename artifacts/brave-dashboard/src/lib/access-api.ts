// Frontend API helpers for the New-User Access Request gate + admin review.
// Hand-written (bypasses Orval/OpenAPI codegen) since these are new, isolated
// endpoints — same approach as membership-api.ts.
import { customFetch } from "@workspace/api-client-react";

export type AccessRequestStatus = "pending" | "approved" | "rejected";

export type AccessRequest = {
  id: number;
  userId: string | null;
  fullName: string;
  email: string;
  niatId: string | null;
  campusId: number | null;
  campusName: string;
  mobileNumber: string | null;
  sectionName: string | null;
  batch: string | null;
  status: AccessRequestStatus;
  notes: string | null;
  decidedBy: string | null;
  decidedAt: string | null;
  createdAt: string;
};

export type MyAccessRequest = {
  request: AccessRequest | null;
  isOnRoster: boolean;
};

export type CampusOption = { id: number; name: string };

// Note: email is intentionally omitted — the server binds it to the
// authenticated account so a caller cannot request access for another identity.
export type SubmitAccessRequestInput = {
  fullName: string;
  campusId: number;
  mobileNumber: string;
  sectionName: string;
  niatId?: string;
};

// Student: the caller's own access-request status.
export function getMyAccessRequest(): Promise<MyAccessRequest> {
  return customFetch<MyAccessRequest>("/api/access-requests/me");
}

// Student: submit a new-user access request.
export function submitAccessRequest(
  input: SubmitAccessRequestInput,
): Promise<AccessRequest> {
  return customFetch<AccessRequest>("/api/access-requests", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

// Any authenticated user: campuses for the access-request form dropdown.
export function listCampusOptions(): Promise<CampusOption[]> {
  return customFetch<CampusOption[]>("/api/campuses");
}

export type AccessRequestStatusFilter =
  | "all"
  | "pending"
  | "approved"
  | "rejected";

// Admin: list access requests, optionally filtered by status + free-text search.
export function listAdminAccessRequests(
  status: AccessRequestStatusFilter = "all",
  search = "",
): Promise<AccessRequest[]> {
  const params = new URLSearchParams();
  if (status && status !== "all") params.set("status", status);
  if (search.trim()) params.set("search", search.trim());
  const qs = params.toString();
  return customFetch<AccessRequest[]>(
    `/api/admin/access-requests${qs ? `?${qs}` : ""}`,
  );
}

// Admin: a single access request.
export function getAdminAccessRequest(id: number): Promise<AccessRequest> {
  return customFetch<AccessRequest>(`/api/admin/access-requests/${id}`);
}

// Admin: approve — provisions roster + user (idempotent).
export function approveAccessRequest(id: number): Promise<AccessRequest> {
  return customFetch<AccessRequest>(`/api/admin/access-requests/${id}/approve`, {
    method: "POST",
    body: JSON.stringify({}),
  });
}

// Admin: reject — re-freezes access (un-whitelists roster) if previously granted.
export function rejectAccessRequest(id: number): Promise<AccessRequest> {
  return customFetch<AccessRequest>(`/api/admin/access-requests/${id}/reject`, {
    method: "POST",
    body: JSON.stringify({}),
  });
}

// Admin: download all access requests as CSV.
export async function downloadAccessRequestsCsv(): Promise<void> {
  const res = await fetch("/api/admin/access-requests/export.csv", {
    credentials: "include",
  });
  if (!res.ok) throw new Error("Failed to export CSV");
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `brave-new-users-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
