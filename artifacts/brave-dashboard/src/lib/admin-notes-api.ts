// Frontend helpers for admin free-form notes on a team and its projects.
// Hand-written (bypasses Orval codegen), same pattern as the other *-api.ts
// helpers. Admin-only; surfaced on the admin team-detail page.
import { customFetch } from "@workspace/api-client-react";

export function saveTeamAdminNotes(
  teamId: number,
  adminNotes: string,
): Promise<{ id: number; adminNotes: string | null }> {
  return customFetch<{ id: number; adminNotes: string | null }>(
    `/api/admin/teams/${teamId}/notes`,
    { method: "PUT", body: JSON.stringify({ adminNotes }) },
  );
}

export function saveProjectAdminNotes(
  projectId: number,
  adminNotes: string,
): Promise<{ id: number; adminNotes: string | null }> {
  return customFetch<{ id: number; adminNotes: string | null }>(
    `/api/admin/projects/${projectId}/notes`,
    { method: "PUT", body: JSON.stringify({ adminNotes }) },
  );
}
