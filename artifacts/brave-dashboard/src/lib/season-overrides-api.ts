// Per-user season overrides — admin API client (additive, isolated).
//
// Hand-written rather than generated, matching the other super-admin-only
// surfaces. Deleting the feature means deleting this file and its one card.
import { customFetch } from "@workspace/api-client-react";

export type SeasonOverrideUser = {
  userId: string;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  niatId: string | null;
  role: string;
  campusName: string | null;
  seasonOverrideId: number | null;
};

export type SeasonOverrideRow = SeasonOverrideUser & {
  seasonSlug: string | null;
  seasonName: string | null;
};

export const seasonOverrideKeys = {
  list: () => ["season-overrides"] as const,
  search: (q: string) => ["season-overrides", "search", q] as const,
};

/** Everyone currently pinned to a season. */
export function listSeasonOverrides(): Promise<{
  overrides: SeasonOverrideRow[];
}> {
  return customFetch("/api/admin/season-overrides", { method: "GET" });
}

/** Find a student to pin. Needs at least two characters. */
export function searchStudents(q: string): Promise<{
  users: SeasonOverrideUser[];
}> {
  return customFetch(
    `/api/admin/season-overrides/search?q=${encodeURIComponent(q)}`,
    { method: "GET" },
  );
}

/** Pin a student to a season, or pass null to return them to the live one. */
export function setSeasonOverride(
  userId: string,
  seasonId: number | null,
): Promise<{ userId: string; seasonOverrideId: number | null }> {
  return customFetch(`/api/admin/season-overrides/${userId}`, {
    method: "PUT",
    body: JSON.stringify({ seasonId }),
  });
}

/** "Ada Lovelace" from the parts, falling back to whatever identifies them. */
export function displayName(u: {
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  niatId: string | null;
}): string {
  const name = `${u.firstName ?? ""} ${u.lastName ?? ""}`.trim();
  return name || u.email || u.niatId || "Unnamed student";
}
