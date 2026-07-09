// Frontend API helper for the admin Teams Directory "name uniqueness" column.
// Hand-written (bypasses Orval codegen), same pattern as terms-api /
// grit-config-api. Fetches every duplicated team name (same normalised name
// used by more than one team across all campuses) with the colliding teams and
// their rosters, so the directory can flag Duplicate/Unique and show a detail
// modal. Read-only.
import { customFetch } from "@workspace/api-client-react";

export type DuplicateTeamMember = {
  name: string;
  niatId: string | null;
  isLeader: boolean;
};

export type DuplicateTeam = {
  id: number;
  name: string;
  campusName: string;
  members: DuplicateTeamMember[];
};

export type DuplicateNameGroup = {
  nameKey: string;
  teams: DuplicateTeam[];
};

export type TeamNameDuplicatesResponse = {
  groups: DuplicateNameGroup[];
};

// Must match the backend normalisation in admin-teams.ts (trim, lower-case,
// collapse inner whitespace) so the frontend can map a row's name to its group.
export function normaliseTeamName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

export function fetchTeamNameDuplicates(): Promise<TeamNameDuplicatesResponse> {
  return customFetch<TeamNameDuplicatesResponse>(
    "/api/admin/teams/name-duplicates",
  );
}
