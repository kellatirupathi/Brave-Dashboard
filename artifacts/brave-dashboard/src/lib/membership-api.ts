// Frontend API helpers for the admin approval gate on team membership changes.
// Hand-written (bypasses Orval/OpenAPI codegen) since these are new, isolated
// endpoints — same approach as progress-api.ts.
import { customFetch } from "@workspace/api-client-react";

export type MembershipRequestType =
  | "join_by_code"
  | "invite_accept"
  | "join_request_approve"
  | "leave"
  | "leader_remove";

export type MembershipRequestStatus = "pending" | "approved" | "rejected";

export type MembershipRequest = {
  id: number;
  type: MembershipRequestType;
  typeLabel: string;
  status: MembershipRequestStatus;
  teamId: number;
  teamName: string;
  campusId: number | null;
  campusName: string | null;
  targetUserId: string;
  targetName: string;
  targetEmail: string;
  actorUserId: string;
  actorName: string;
  reason: string | null;
  decisionNote: string | null;
  decidedById: string | null;
  decidedByName: string | null;
  decidedAt: string | null;
  createdAt: string | null;
};

// Student/leader: pending requests where the caller is the actor or target.
export function listMyMembershipRequests(): Promise<MembershipRequest[]> {
  return customFetch<MembershipRequest[]>("/api/membership-requests/mine");
}

// Admin: list requests by status ("pending" | "history" | "approved" |
// "rejected" | "all"). Defaults to pending.
export function listAdminMembershipRequests(
  status: "pending" | "history" | "approved" | "rejected" | "all" = "pending",
): Promise<MembershipRequest[]> {
  return customFetch<MembershipRequest[]>(
    `/api/admin/membership-requests?status=${status}`,
  );
}

export function approveMembershipRequest(
  id: number,
  note?: string,
): Promise<MembershipRequest> {
  return customFetch<MembershipRequest>(
    `/api/admin/membership-requests/${id}/approve`,
    {
      method: "POST",
      body: JSON.stringify(note && note.trim() ? { note: note.trim() } : {}),
    },
  );
}

export function rejectMembershipRequest(
  id: number,
  note?: string,
): Promise<MembershipRequest> {
  return customFetch<MembershipRequest>(
    `/api/admin/membership-requests/${id}/reject`,
    {
      method: "POST",
      body: JSON.stringify(note && note.trim() ? { note: note.trim() } : {}),
    },
  );
}
