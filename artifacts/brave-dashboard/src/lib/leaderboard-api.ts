// Leaderboard fetcher, hand-written (bypasses Orval codegen) so it can pass
// the `lifetime` flag that powers the "Overall" tab.
//
// The generated `useGetLeaderboard` hook cannot carry that flag — its query
// params come from the OpenAPI spec, whose `view` enum is national|campus|top10.
// Rather than a spec edit plus a codegen round-trip, Overall is an orthogonal
// modifier on the existing views, matching how the other *-api.ts helpers here
// extend the generated client.
import { customFetch } from "@workspace/api-client-react";

export type LeaderboardEntry = {
  teamId: number;
  teamName: string;
  campusName: string;
  campusId: number;
  tagline: string | null;
  photoUrl: string | null;
  totalRevenue: number;
  totalOrderBook: number;
  activeProjects: number;
  clientCount: number;
  lastPaymentDate: string | null;
  isDemoEligible: boolean;
  isFeatured: boolean;
  isHidden: boolean;
  rank: number;
  // Present only on the Overall (lifetime) view.
  lifetime?: true;
  /** Verified revenue keyed by season id, e.g. `{ 1: 420000, 2: 840000 }`. */
  revenueBySeason?: Record<number, number>;
};

export type LeaderboardQuery = {
  view: "national" | "campus";
  campusId?: number | undefined;
  search?: string | undefined;
  /**
   * Overall view — combine every season into one ranking. Teams are identical
   * across seasons, so this is a straight sum with no lineage rule needed.
   */
  lifetime?: boolean;
};

export function getLeaderboard(q: LeaderboardQuery): Promise<LeaderboardEntry[]> {
  const params = new URLSearchParams();
  params.set("view", q.view);
  if (q.campusId != null) params.set("campusId", String(q.campusId));
  if (q.search) params.set("search", q.search);
  if (q.lifetime) params.set("lifetime", "true");
  return customFetch<LeaderboardEntry[]>(
    `/api/leaderboard?${params.toString()}`,
    { method: "GET" },
  );
}

/**
 * Stable react-query key.
 *
 * `seasonId` is part of the key even though the season travels as a request
 * header: without it, two seasons share a cache entry and switching would show
 * the previous season's rows until a refetch landed. Switching also invalidates
 * the whole cache, but partitioning here means correctness does not depend on
 * that happening.
 */
export function leaderboardQueryKey(
  q: LeaderboardQuery,
  seasonId: number | null,
) {
  return [
    "leaderboard",
    seasonId,
    q.view,
    q.campusId ?? null,
    q.search ?? "",
    !!q.lifetime,
  ] as const;
}
