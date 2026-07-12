// Frontend helpers for the team-name uniqueness feature. Hand-written (bypasses
// Orval codegen), same pattern as progress-api / coordinator-tags-api.
//
//   - notifyTeamNameDuplicates: admin Config action — flags the losing teams in
//     every duplicate-name group and emails their leaders + members.
//   - getMyTeamNameFlag: student — is my team flagged to rename?
//   - checkTeamNameAvailability: live "is this name already taken?" check for
//     the student rename UI.
import { customFetch } from "@workspace/api-client-react";

export type NotifyDuplicatesResult = {
  duplicateGroups: number;
  teamsFlagged: number;
  emailsSent: number;
};

export function notifyTeamNameDuplicates(): Promise<NotifyDuplicatesResult> {
  return customFetch<NotifyDuplicatesResult>(
    "/api/admin/teams/notify-name-duplicates",
    { method: "POST" },
  );
}

export type MyTeamNameFlag = {
  flagged: boolean;
  teamId?: number;
  teamName?: string;
  isLeader?: boolean;
};

export function getMyTeamNameFlag(): Promise<MyTeamNameFlag> {
  return customFetch<MyTeamNameFlag>("/api/teams/my/name-flag");
}

export type TeamNameAvailability = {
  taken: boolean;
  count: number;
};

export function checkTeamNameAvailability(
  name: string,
  excludeTeamId?: number,
): Promise<TeamNameAvailability> {
  const params = new URLSearchParams({ name });
  if (excludeTeamId != null) params.set("excludeTeamId", String(excludeTeamId));
  return customFetch<TeamNameAvailability>(
    `/api/teams/name-availability?${params.toString()}`,
  );
}
