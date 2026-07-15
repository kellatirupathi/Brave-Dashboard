// Frontend helpers for the leaderboard display config — hide-rank-for-students
// + banner image. Hand-written (bypasses Orval codegen), same pattern as the
// other *-api.ts helpers.
import { customFetch } from "@workspace/api-client-react";

export type LeaderboardConfig = {
  hideRankForStudents: boolean;
  imageUrl: string | null;
};

export function getLeaderboardConfig(): Promise<LeaderboardConfig> {
  return customFetch<LeaderboardConfig>("/api/leaderboard-config", {
    method: "GET",
  });
}

export function saveLeaderboardConfig(input: {
  hideRankForStudents?: boolean;
  imageUrl?: string | null;
}): Promise<LeaderboardConfig> {
  return customFetch<LeaderboardConfig>("/api/admin/leaderboard-config", {
    method: "PUT",
    body: JSON.stringify(input),
  });
}
