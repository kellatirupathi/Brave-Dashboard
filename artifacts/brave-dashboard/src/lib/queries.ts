import type { QueryClient, QueryKey } from "@tanstack/react-query";
import {
  getGetCurrentAuthUserQueryKey,
  getGetMyTeamQueryKey,
  getGetTeamQueryKey,
  getListMyInvitationsQueryKey,
  getListTeamInvitationsQueryKey,
  getListTeamJoinRequestsQueryKey,
  getListTeamLeaveRequestsQueryKey,
  getGetDashboardSummaryQueryKey,
  getGetTeamDashboardSummaryQueryKey,
  getListNotificationsQueryKey,
  getListProjectsQueryKey,
  getGetLeaderboardQueryKey,
  getSearchCampusStudentsQueryKey,
  getBrowseCampusTeamsQueryKey,
} from "@workspace/api-client-react";

export const MEMBERSHIP_QUERY_KEYS: ReadonlyArray<QueryKey> = [
  ["auth", "user"],
  ["my-team"],
  ["team-members"],
  ["invitations", "mine"],
  ["join-requests", "mine"],
  ["leave-requests", "mine"],
  ["dashboard"],
  ["notifications"],
  ["projects"],
  ["leaderboard"],
];

export function membershipQueryKeysForTeam(teamId: number | null | undefined): ReadonlyArray<QueryKey> {
  if (teamId == null) return MEMBERSHIP_QUERY_KEYS;
  return [...MEMBERSHIP_QUERY_KEYS, ["team", teamId]];
}

export function invalidateMembershipQueries(
  queryClient: QueryClient,
  opts?: { teamId?: number | null },
): void {
  const teamId = opts?.teamId ?? null;

  for (const key of membershipQueryKeysForTeam(teamId)) {
    queryClient.invalidateQueries({ queryKey: key });
  }

  const generated: QueryKey[] = [
    getGetCurrentAuthUserQueryKey(),
    getGetMyTeamQueryKey(),
    getListMyInvitationsQueryKey(),
    getGetDashboardSummaryQueryKey(),
    getGetTeamDashboardSummaryQueryKey(),
    getListNotificationsQueryKey(),
    getListProjectsQueryKey(),
    getGetLeaderboardQueryKey(),
    getBrowseCampusTeamsQueryKey(),
  ];
  if (teamId != null) {
    generated.push(getGetTeamQueryKey(teamId));
    generated.push(getListTeamInvitationsQueryKey(teamId));
    generated.push(getListTeamJoinRequestsQueryKey(teamId));
    generated.push(getListTeamLeaveRequestsQueryKey(teamId));
  }
  for (const key of generated) {
    queryClient.invalidateQueries({ queryKey: key });
  }

  // Student-search results render an "Invited" badge for already-invited
  // entries — invalidate the search root so the badge updates after a new
  // invite without forcing a re-render of the search input value.
  // Orval keys start with the path; passing just the path acts as a prefix
  // match so every cached `q=...` variant is invalidated.
  const searchKey = getSearchCampusStudentsQueryKey({ q: "" });
  queryClient.invalidateQueries({ queryKey: [searchKey[0]] });
}
