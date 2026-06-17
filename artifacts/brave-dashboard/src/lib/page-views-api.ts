// Frontend API helpers for page-view tracking + the admin Pages Log tab.
// Bypasses Orval/OpenAPI codegen on purpose — isolated additive feature, same
// pattern as progress-api.ts / journals-ai-api.ts / chatbot-history-api.ts.
import { customFetch } from "@workspace/api-client-react";

// Best-effort: record a page view. Never throws — a tracking failure must
// never affect the user's navigation.
export function recordPageView(path: string): Promise<void> {
  return customFetch<{ ok: true }>("/api/page-views", {
    method: "POST",
    body: JSON.stringify({ path }),
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
