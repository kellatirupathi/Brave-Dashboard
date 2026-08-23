// Trust score fetchers, hand-written (bypasses Orval codegen), matching the
// convention in leaderboard-api.ts and leads-api.ts.
import { customFetch } from "@workspace/api-client-react";

export type TrustTier = "watch" | "bronze" | "silver" | "gold";

export type TrustEvent = {
  id: number;
  kind: string;
  /** Server-supplied, so the UI never has to map a kind it does not know. */
  label: string;
  /** The points AS AWARDED — an older event keeps the value it carried. */
  points: number;
  reason: string | null;
  refType: string | null;
  refId: number | null;
  createdAt: string;
};

export type TrustSummary = {
  score: number;
  tier: TrustTier;
  tierLabel: string;
  tierMeaning: string;
  eventCount: number;
  teamId: number;
  seasonId: number;
  events: TrustEvent[];
};

export type TrustRule = {
  kind: string;
  points: number;
  label: string;
  rationale: string;
};

export type TrustRules = {
  rules: TrustRule[];
  tiers: Array<{
    tier: TrustTier;
    label: string;
    floor: number;
    meaning: string;
  }>;
  /** Listed separately: its floor is -Infinity, which does not survive JSON. */
  watch: { tier: "watch"; label: string; floor: null; meaning: string };
};

export function getTrustSummary(teamId?: number): Promise<TrustSummary> {
  const qs = teamId != null ? `?teamId=${teamId}` : "";
  return customFetch<TrustSummary>(`/api/trust/summary${qs}`, {
    method: "GET",
  });
}

export function getTrustRules(): Promise<TrustRules> {
  return customFetch<TrustRules>("/api/trust/rules", { method: "GET" });
}

export function adjustTrust(body: {
  teamId: number;
  points: number;
  reason: string;
}): Promise<TrustSummary> {
  return customFetch("/api/trust/adjust", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export const trustKeys = {
  summary: (seasonId: number | null, teamId?: number) =>
    ["trust-summary", seasonId, teamId ?? "me"] as const,
  // Rules are static, so they are not season-partitioned.
  rules: () => ["trust-rules"] as const,
};
