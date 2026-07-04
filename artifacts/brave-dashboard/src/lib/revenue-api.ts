// Frontend API helper for revoking a verified revenue entry.
// Hand-written (bypasses Orval codegen), same pattern as terms-api /
// grit-config-api / coordinator-tags-api. Used by the student project detail
// page so a team leader can revoke a previously verified revenue entry.
//
// Revoking does NOT delete the entry — it stays visible on the project (shown
// struck-through) but its amount stops counting toward the team's verified
// revenue, the leaderboard and Demo Day. The matching backend route
// (POST /api/revenue-entries/:id/revoke) and the OpenAPI `revokeRevenueEntry`
// operation already exist; if the Orval client is ever regenerated, switch
// this call site to the generated hook and delete this helper.
import { customFetch } from "@workspace/api-client-react";

export function revokeRevenueEntry(id: number): Promise<unknown> {
  return customFetch<unknown>(`/api/revenue-entries/${id}/revoke`, {
    method: "POST",
  });
}
