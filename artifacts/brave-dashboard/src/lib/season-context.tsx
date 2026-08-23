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

const SeasonContext = createContext<SeasonContextValue | null>(null);

export function SeasonProvider({ children }: { children: ReactNode }) {
  const { isAuthenticated } = useAuth();
  const queryClient = useQueryClient();

  // Local override so switching feels instant. Until the user switches, the
  // server's answer (`viewing`) governs — it already accounts for the season
  // remembered on their session.
  const [override, setOverride] = useState<number | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: SEASONS_QUERY_KEY,
    queryFn: getSeasons,
    enabled: !!isAuthenticated,
    staleTime: 60_000,
  });

  const viewingId = override ?? data?.viewing ?? null;

  // The API client reads this synchronously on every request, so it must be a
  // ref rather than state — a stale closure here would send the previous
  // season for one render's worth of requests.
  const viewingRef = useRef<number | null>(viewingId);
  viewingRef.current = viewingId;

  useEffect(() => {
    setSeasonGetter(() => viewingRef.current);
    return () => setSeasonGetter(null);
  }, []);

  const switchTo = useCallback(
    (seasonId: number) => {
      if (seasonId === viewingRef.current) return;
      // Point the API client at the new season BEFORE invalidating, so every
      // refetch below already carries the new header.
      setOverride(seasonId);
      viewingRef.current = seasonId;
      // Every season-scoped figure on screen is now wrong — drop the whole
      // cache rather than trying to enumerate which keys were affected.
      void queryClient.invalidateQueries();
      // Persistence is best-effort: the switch has already taken effect, and a
      // failure here only means it won't survive a refresh.
      void selectSeason(seasonId).catch(() => undefined);
    },
    [queryClient],
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
      isLoading,
      switchTo,
      canWrite: (capability) => seasonWritable(viewing, capability),
    };
  }, [data, viewingId, isLoading, switchTo]);

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
