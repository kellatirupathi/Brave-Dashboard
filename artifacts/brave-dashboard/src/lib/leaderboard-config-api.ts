// Frontend helpers for the leaderboard display config — hide-rank-for-students
// + banner (image URL OR a built-in editable template). Hand-written (bypasses
// Orval codegen), same pattern as the other *-api.ts helpers.
import { customFetch } from "@workspace/api-client-react";
import type {
  LeaderboardBannerTemplate,
  LeaderboardBannerContent,
} from "@/components/leaderboard-banner-templates";

export type LeaderboardConfig = {
  hideRankForStudents: boolean;
  imageUrl: string | null;
  bannerSource: "image" | "template";
  bannerTemplate: LeaderboardBannerTemplate;
  bannerContent: LeaderboardBannerContent | null;
};

export function getLeaderboardConfig(): Promise<LeaderboardConfig> {
  return customFetch<LeaderboardConfig>("/api/leaderboard-config", {
    method: "GET",
  });
}

export function saveLeaderboardConfig(input: {
  hideRankForStudents?: boolean;
  imageUrl?: string | null;
  bannerSource?: "image" | "template";
  bannerTemplate?: LeaderboardBannerTemplate;
  bannerContent?: LeaderboardBannerContent | null;
}): Promise<LeaderboardConfig> {
  return customFetch<LeaderboardConfig>("/api/admin/leaderboard-config", {
    method: "PUT",
    body: JSON.stringify(input),
  });
}
