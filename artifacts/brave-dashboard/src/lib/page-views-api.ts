// Frontend API helpers for page-view tracking + the admin Pages Log tab.
// Bypasses Orval/OpenAPI codegen on purpose — isolated additive feature, same
// pattern as progress-api.ts / journals-ai-api.ts / chatbot-history-api.ts.
import { customFetch } from "@workspace/api-client-react";
import { isNativeApp } from "./native-auth";

// Best-effort: record a page view. Never throws — a tracking failure must
// never affect the user's navigation.
export function recordPageView(path: string): Promise<void> {
  return customFetch<{ ok: true }>("/api/page-views", {
    method: "POST",
    body: JSON.stringify({
      path,
      platform: isNativeApp() ? "app" : "web",
    }),
  })
    .then(() => undefined)
    .catch(() => undefined);
}

export type PageViewSummaryRow = {
  path: string;
  count: number;
  uniqueVisitors: number;
  lastVisitedAt: string | null;
};

// Admin: most-visited pages aggregated by normalized route, sorted desc.
export function getPageViewSummary(): Promise<PageViewSummaryRow[]> {
  return customFetch<PageViewSummaryRow[]>("/api/admin/page-views/summary");
}

export type UserStatsPathRow = {
  path: string;
  totalViews: number;
  appViews: number;
  webViews: number;
};

export type UserStats = {
  days: 7 | 30 | 90;
  appUsers: number;
  webUsers: number;
  appShare: number;
  everOpenedApp: number;
  perPath: UserStatsPathRow[];
  trackingSince: string | null;
};

export function getUserStats(days: 7 | 30 | 90): Promise<UserStats> {
  return customFetch<UserStats>(`/api/admin/user-stats?days=${days}`);
}
