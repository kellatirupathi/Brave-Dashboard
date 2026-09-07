// Frontend helpers for the admin-managed revenue rejection reasons catalog.
// Hand-written (bypasses Orval codegen), same pattern as the other *-api.ts
// helpers. CRUD lives on the Config page; the review queue reads the list.
import { customFetch } from "@workspace/api-client-react";

/**
 * The one cache key for this catalogue.
 *
 * Both readers (the review queue's chips) and the writer (the Config card)
 * import it from here, so an edit in Config always invalidates exactly what
 * the queue is reading. Keeping two copies of the string in sync by hand is
 * what would let them drift.
 */
export const REJECTION_REASONS_QUERY_KEY = ["admin-rejection-reasons"] as const;

export type RejectionReason = {
  id: number;
  label: string;
  sortOrder: number;
};

export function listRejectionReasons(): Promise<{ items: RejectionReason[] }> {
  return customFetch<{ items: RejectionReason[] }>(
    "/api/admin/rejection-reasons",
    { method: "GET" },
  );
}

export function createRejectionReason(
  label: string,
): Promise<RejectionReason> {
  return customFetch<RejectionReason>("/api/admin/rejection-reasons", {
    method: "POST",
    body: JSON.stringify({ label }),
  });
}

export function updateRejectionReason(
  id: number,
  label: string,
): Promise<RejectionReason> {
  return customFetch<RejectionReason>(`/api/admin/rejection-reasons/${id}`, {
    method: "PATCH",
    body: JSON.stringify({ label }),
  });
}

export function deleteRejectionReason(id: number): Promise<void> {
  return customFetch<void>(`/api/admin/rejection-reasons/${id}`, {
    method: "DELETE",
  });
}
