// Season 1 / Season 2 coexistence — the single source of truth for which
// season the dashboard is currently showing.
//
// Additive and isolated: nothing renders differently until a component reads
// `useSeason()`. Deleting this file means removing <SeasonProvider> from
// App.tsx and the components that call the hook.
//
// HOW THE SEASON REACHES THE API
// The provider registers a getter with the generated API client, which then
// attaches `x-brave-season` to EVERY request. That is why no individual hook or
// endpoint needed changing on the frontend — one registration covers them all.
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { setSeasonGetter } from "@workspace/api-client-react";
import { useAuth } from "@workspace/replit-auth-web";
import {
  getSeasons,
  selectSeason,
  isSeasonWritable as seasonWritable,
  type Season,
} from "./seasons-api";
import {
  findSeasonBySlug,
  parseCanonicalSeasonPath,
  replaceCanonicalSeasonSlug,
} from "./season-routing";

export const SEASONS_QUERY_KEY = ["seasons"] as const;

type SeasonContextValue = {
  seasons: Season[];
  /** The season being viewed. Null only while the first fetch is in flight. */
  viewingId: number | null;
  viewing: Season | undefined;
  /** The live season, i.e. the one new activity is written against. */
  active: Season | undefined;
  /** True when the viewed season is a closed archive. */
  isArchive: boolean;
  isLoading: boolean;
  /** Switch seasons. Updates immediately, then persists to the session. */
  switchTo: (seasonId: number) => void;
  /** Mirrors the server-side guard for a given capability. */
  canWrite: (capability?: "journal" | "revenue" | "project") => boolean;
};

/**
 * Per-device memory of the season a viewer last chose.
 *
 * Deliberately localStorage rather than sessionStorage: an admin who closes the
 * tab and comes back tomorrow expects the season they were working in, not the
 * live one. Every read and write is guarded — private mode and blocked storage
 * both throw on access, and neither should stop the dashboard rendering.
 */
const SEASON_STORAGE_KEY = "brave.viewingSeasonId";
const ROUTER_BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

function currentRouteLocation(): string {
  const full =
    window.location.pathname + window.location.search + window.location.hash;
  if (!ROUTER_BASE) return full;
  if (full === ROUTER_BASE) return "/";
  return full.startsWith(ROUTER_BASE + "/")
    ? full.slice(ROUTER_BASE.length)
    : full;
}

function routeBrowserUrl(route: string): string {
  return `${ROUTER_BASE}${route === "/" ? "/" : route}`;
}

function readStoredSeason(): number | null {
  try {
    const raw = localStorage.getItem(SEASON_STORAGE_KEY);
    if (!raw) return null;
    const n = Number(raw);
    return Number.isInteger(n) && n > 0 ? n : null;
  } catch {
    return null;
  }
}

function writeStoredSeason(seasonId: number): void {
  try {
    localStorage.setItem(SEASON_STORAGE_KEY, String(seasonId));
  } catch {
    /* storage unavailable; the session still remembers it server-side */
  }
}

const SeasonContext = createContext<SeasonContextValue | null>(null);

export function SeasonProvider({ children }: { children: ReactNode }) {
  const { isAuthenticated } = useAuth();
  const queryClient = useQueryClient();
  // Browser navigation can change only the slug. Keep that external state in
  // React so a back/forward navigation re-resolves the URL selection as well.
  const [location, setLocation] = useState(() =>
    typeof window === "undefined"
      ? ""
      : currentRouteLocation(),
  );

  useEffect(() => {
    const onLocationChange = () =>
      setLocation(currentRouteLocation());
    window.addEventListener("popstate", onLocationChange);
    return () => window.removeEventListener("popstate", onLocationChange);
  }, []);

  // Local override so switching feels instant, AND so the choice survives a
  // reload.
  //
  // The session already remembers the selection server-side, but that alone was
  // not enough: on a fresh load the very first /seasons request carries no
  // x-brave-season header, so `viewing` came back as the ACTIVE season and the
  // dashboard snapped to it before the session value was ever consulted. An
  // admin who chose 2.0 was put back on 1.0 every time they reopened the page.
  //
  // Seeding the override from localStorage fixes that: the getter below has a
  // value on the first render, so the first request already asks for the right
  // season. The session remains the source of truth across devices; this is a
  // per-device cache of the same answer.
  const [override, setOverride] = useState<number | null>(() =>
    readStoredSeason(),
  );
  const appliedSeasonRef = useRef<number | null>(override);
  const [appliedSeasonId, setAppliedSeasonId] = useState<number | null>(
    override,
  );

  const { data, isLoading } = useQuery({
    queryKey: SEASONS_QUERY_KEY,
    queryFn: getSeasons,
    enabled: !!isAuthenticated,
    staleTime: 60_000,
  });

  // A stored season that no longer exists (deleted, or a stale value from an
  // older deployment) must not strand the viewer on a season the server will
  // not serve. Once the list has loaded, an unknown override is discarded and
  // the server's answer takes over.
  const seasonList = data?.seasons ?? [];
  // The address bar is authoritative. Read it directly because this provider
  // also supplies the router's season-aware location adapter.
  const canonicalPath = parseCanonicalSeasonPath(location);
  const urlSeason = canonicalPath
    ? findSeasonBySlug(seasonList, canonicalPath.slug)
    : undefined;
  const overrideIsValid =
    override != null &&
    (seasonList.length === 0 || seasonList.some((s) => s.id === override));
  const viewingId =
    urlSeason?.id ??
    (overrideIsValid ? override : null) ??
    data?.viewing ??
    null;
  const isSynchronizing =
    viewingId != null && appliedSeasonId !== viewingId;

  // The API client reads this synchronously on every request, so it must be a
  // ref rather than state — a stale closure here would send the previous
  // season for one render's worth of requests.
  const viewingRef = useRef<number | null>(viewingId);
  viewingRef.current = viewingId;

  useEffect(() => {
    setSeasonGetter(() => viewingRef.current);
    return () => setSeasonGetter(null);
  }, []);

  useEffect(() => {
    if (viewingId == null || appliedSeasonRef.current === viewingId) return;

    // The URL-selected season must reach the synchronous API getter before any
    // page remounts. Dropping non-season-catalogue queries guarantees an old
    // season's cached response cannot flash while the new requests begin.
    viewingRef.current = viewingId;
    setOverride(viewingId);
    writeStoredSeason(viewingId);
    queryClient.removeQueries({
      predicate: (query) => query.queryKey[0] !== SEASONS_QUERY_KEY[0],
    });
    appliedSeasonRef.current = viewingId;
    setAppliedSeasonId(viewingId);
    void selectSeason(viewingId).catch(() => undefined);
  }, [queryClient, viewingId]);

  const switchTo = useCallback(
    (seasonId: number) => {
      if (seasonId === viewingRef.current) return;
      // Block the current page immediately. The URL change below is then
      // resolved by the synchronization effect, which updates the API getter
      // and clears stale queries before the page is allowed to render again.
      appliedSeasonRef.current = null;
      setAppliedSeasonId(null);
      viewingRef.current = seasonId;
      const selected = seasonList.find((season) => season.id === seasonId);
      if (selected && typeof window !== "undefined") {
        const next = replaceCanonicalSeasonSlug(
          currentRouteLocation(),
          selected.slug,
        );
        if (next !== currentRouteLocation()) {
          window.history.pushState(null, "", routeBrowserUrl(next));
          window.dispatchEvent(new PopStateEvent("popstate"));
        }
      }
    },
    [seasonList],
  );

  const value = useMemo<SeasonContextValue>(() => {
    const seasons = data?.seasons ?? [];
    const viewing = seasons.find((s) => s.id === viewingId);
    return {
      seasons,
      viewingId,
      viewing,
      active: seasons.find((s) => s.isActive),
      isArchive: !!viewing?.isReadOnly,
      isLoading: isLoading || isSynchronizing,
      switchTo,
      canWrite: (capability) => seasonWritable(viewing, capability),
    };
  }, [data, viewingId, isLoading, isSynchronizing, switchTo]);

  return (
    <SeasonContext.Provider value={value}>{children}</SeasonContext.Provider>
  );
}

/**
 * Read the current season. Safe to call outside the provider — it returns a
 * neutral "single season, writable" shape so any component that has not been
 * wired up yet behaves exactly as it did before seasons existed.
 */
export function useSeason(): SeasonContextValue {
  const ctx = useContext(SeasonContext);
  if (ctx) return ctx;
  return {
    seasons: [],
    viewingId: null,
    viewing: undefined,
    active: undefined,
    isArchive: false,
    isLoading: false,
    switchTo: () => undefined,
    canWrite: () => true,
  };
}
