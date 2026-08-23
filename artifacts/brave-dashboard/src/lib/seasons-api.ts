// Frontend helpers for Season 1 / Season 2 coexistence.
//
// Hand-written (bypasses Orval codegen), same pattern as the other *-api.ts
// helpers. Season 1 is a permanent read-only archive; Season 2 is the live
// season. Teams, students, roster and campuses are SHARED across both — only
// activity (journals, projects, revenue, leads) is season-scoped.
import { customFetch } from "@workspace/api-client-react";

export type Season = {
  id: number;
  name: string;
  /** Short badge label shown in the sidebar, e.g. "1.0" / "2.0". */
  slug: string;
  startDate: string | null;
  endDate: string | null;
  weekCount: number;
  /** Exactly one season is active; new activity is written against it. */
  isActive: boolean;
  /** When true, student writes are blocked unless an override below is on. */
  isReadOnly: boolean;
  allowJournalWrites: boolean;
  allowRevenueWrites: boolean;
  allowProjectWrites: boolean;
};

export type SeasonsResponse = {
  seasons: Season[];
  /** The season this viewer is currently looking at. */
  viewing: number;
};

export function getSeasons(): Promise<SeasonsResponse> {
  return customFetch<SeasonsResponse>("/api/seasons", { method: "GET" });
}

export function getActiveSeason(): Promise<Season | null> {
  return customFetch<Season | null>("/api/seasons/active", { method: "GET" });
}

/**
 * Remember the viewer's selection server-side so a refresh keeps it. The
 * `x-brave-season` header still governs each individual request, so the UI
 * should update its own state immediately and treat this as persistence
 * rather than as the source of truth.
 */
export function selectSeason(seasonId: number): Promise<{ viewing: number }> {
  return customFetch<{ viewing: number }>("/api/seasons/select", {
    method: "POST",
    body: JSON.stringify({ seasonId }),
  });
}

/** Admin: rename a season or adjust its dates. */
export function saveSeason(
  seasonId: number,
  input: {
    name?: string;
    startDate?: string | null;
    endDate?: string | null;
    weekCount?: number;
    // Super-admin only — these change what students can do.
    isActive?: boolean;
    isReadOnly?: boolean;
    allowJournalWrites?: boolean;
    allowRevenueWrites?: boolean;
    allowProjectWrites?: boolean;
  },
): Promise<Season> {
  return customFetch<Season>(`/api/admin/seasons/${seasonId}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

/**
 * True when this season accepts student writes. Mirrors the server-side guard
 * (`isSeasonWritable`) exactly, so the UI and the API can never disagree about
 * whether a button should be there.
 */
export function isSeasonWritable(
  season: Season | undefined,
  capability?: "journal" | "revenue" | "project",
): boolean {
  if (!season) return true; // fail open, matching the server
  if (!season.isReadOnly) return true;
  switch (capability) {
    case "journal":
      return season.allowJournalWrites;
    case "revenue":
      return season.allowRevenueWrites;
    case "project":
      return season.allowProjectWrites;
    default:
      return false;
  }
}
