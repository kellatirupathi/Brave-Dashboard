// Per-season reads for the admin team detail page (additive, isolated).
//
// WHY THIS EXISTS
// The generated hooks always send the season currently being VIEWED, which is
// right everywhere else. The team page needs something they cannot express: an
// "All" view that shows Season 1 and Season 2 together, and the ability to look
// at one season while viewing the other.
//
// Rather than regenerate the client, these fetchers use the `?season=` query
// param the resolver already honours (header → query → session → active). Same
// endpoints, same shapes — only the season is chosen explicitly.
//
// Deleting this file means reverting team-detail.tsx to the generated hooks.
import { customFetch } from "@workspace/api-client-react";

/** Which season's rows a team page is showing. */
export type SeasonView = number | "all";

export type TeamProject = {
  id: number;
  title: string;
  status: string;
  description?: string | null;
  seasonId?: number | null;
  adminNotes?: string | null;
};

export type TeamEntry = {
  id: number;
  projectId: number | null;
  clientName?: string | null;
  amount?: number | null;
  verifiedAmount?: number | null;
  status: string;
  seasonId?: number | null;
  paymentDate?: string | null;
  submittedAt?: string | null;
  rejectionReason?: string | null;
  brdUrl?: string | null;
};

/**
 * Season ids to request for a view. "all" fans out over every season and the
 * caller merges — there is no single endpoint that returns every season at
 * once, and adding one would mean widening the API for a single screen.
 */
function seasonsFor(view: SeasonView, all: number[]): number[] {
  return view === "all" ? all : [view];
}

function qs(path: string, season: number, params: Record<string, string | number>) {
  const sp = new URLSearchParams({ season: String(season) });
  for (const [k, v] of Object.entries(params)) sp.set(k, String(v));
  return `${path}?${sp.toString()}`;
}

function seasonHeaders(season: number) {
  return { "x-brave-season": String(season) };
}

/** Merge several seasons' results, de-duplicated on row id. */
function mergeById<T extends { id: number }>(lists: T[][]): T[] {
  const seen = new Map<number, T>();
  for (const list of lists) for (const row of list) seen.set(row.id, row);
  return [...seen.values()];
}

export async function fetchTeamProjects(
  teamId: number,
  view: SeasonView,
  allSeasons: number[],
): Promise<TeamProject[]> {
  const results = await Promise.all(
    seasonsFor(view, allSeasons).map((s) =>
      // /api/projects is paginated and returns { items }, unlike the two
      // entry endpoints which return a bare array. pageSize is generous
      // because a team's projects are counted in tens, not thousands.
      customFetch<{ items: TeamProject[] }>(
        qs("/api/projects", s, { teamId, pageSize: 200 }),
        { headers: seasonHeaders(s) },
      )
        .then((r) => r.items ?? [])
        // One season failing must not blank the whole page.
        .catch(() => [] as TeamProject[]),
    ),
  );
  return mergeById(results);
}

export async function fetchTeamRevenue(
  teamId: number,
  view: SeasonView,
  allSeasons: number[],
): Promise<TeamEntry[]> {
  const results = await Promise.all(
    seasonsFor(view, allSeasons).map((s) =>
      customFetch<TeamEntry[]>(
        qs("/api/revenue-entries", s, { teamId }),
        { headers: seasonHeaders(s) },
      ).catch(() => [] as TeamEntry[]),
    ),
  );
  return mergeById(results);
}

export async function fetchTeamOrderBook(
  teamId: number,
  view: SeasonView,
  allSeasons: number[],
): Promise<TeamEntry[]> {
  const results = await Promise.all(
    seasonsFor(view, allSeasons).map((s) =>
      customFetch<TeamEntry[]>(
        qs("/api/order-book-entries", s, { teamId }),
        { headers: seasonHeaders(s) },
      ).catch(() => [] as TeamEntry[]),
    ),
  );
  return mergeById(results);
}

export const teamSeasonKeys = {
  projects: (teamId: number, view: SeasonView) =>
    ["team-projects", teamId, view] as const,
  revenue: (teamId: number, view: SeasonView) =>
    ["team-revenue", teamId, view] as const,
  orderBook: (teamId: number, view: SeasonView) =>
    ["team-orderbook", teamId, view] as const,
};
