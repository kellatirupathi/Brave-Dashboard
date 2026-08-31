/**
 * Typed data hooks.
 *
 * Every endpoint here was read off the Express routers rather than guessed, so
 * the app speaks the same contract as the website. Response types are declared
 * with optional fields throughout: a phone on a train loses connectivity
 * mid-flight and a partial payload must render a quiet empty state, never a
 * red screen.
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from './api';

/* ── Types ────────────────────────────────────────────────────────── */

export type ProgressSummary = {
  weekId?: number | null;
  weekNumber?: number | null;
  weekStart?: string;
  weekEnd?: string;
  submittedThisWeek?: boolean;
  totalWeeks?: number | null;
  submittedWeeks?: number[] | null;
};

export type MyTeam = {
  id?: number;
  name?: string;
  tagline?: string | null;
  campusName?: string | null;
  status?: string | null;
  verifiedRevenue?: number | null;
  orderBookValue?: number | null;
  nationalRank?: number | null;
  campusRank?: number | null;
  trustTier?: string | null;
  trustScore?: number | null;
  members?: Array<{
    id?: string;
    firstName?: string | null;
    lastName?: string | null;
    role?: string | null;
  }> | null;
};

export type JournalEntry = {
  id?: number;
  weekId?: number | null;
  weekNumber?: number | null;
  weekStart?: string | null;
  weekEnd?: string | null;
  content?: string | null;
  submittedAt?: string | null;
};

export type OpenWeek = {
  id?: number;
  weekNumber?: number;
  startDate?: string;
  endDate?: string;
};

export type Lead = {
  id?: number;
  clientName?: string | null;
  businessName?: string | null;
  status?: string | null;
  contactPerson?: string | null;
  interactionCount?: number | null;
  trailStrength?: string | null;
  createdAt?: string | null;
};

export type LeaderboardRow = {
  teamId?: number;
  teamName?: string | null;
  campusName?: string | null;
  verifiedRevenue?: number | null;
  overallRevenue?: number | null;
  orderBookValue?: number | null;
  projectCount?: number | null;
  rank?: number | null;
  qualified?: boolean | null;
};

export type AppNotification = {
  id?: number;
  title?: string | null;
  body?: string | null;
  message?: string | null;
  read?: boolean | null;
  isRead?: boolean | null;
  createdAt?: string | null;
};

export type Season = {
  id: number;
  name?: string | null;
  isActive?: boolean | null;
};

/* ── Cache policy ─────────────────────────────────────────────────── */

/**
 * A minute of staleness.
 *
 * On a phone this matters more than on the web: tab switches remount screens
 * constantly, and refetching on every switch would burn a student's mobile data
 * and make navigation feel laggy. Anything genuinely fresh is a pull away.
 */
const STALE = 60_000;

/* ── Hooks ────────────────────────────────────────────────────────── */

export function useProgressSummary() {
  return useQuery({
    queryKey: ['progress-summary'],
    queryFn: () => api.get<ProgressSummary>('/api/progress-summary'),
    staleTime: STALE,
  });
}

export function useMyTeam() {
  return useQuery({
    queryKey: ['team-my'],
    queryFn: () => api.get<MyTeam>('/api/teams/my'),
    staleTime: STALE,
  });
}

export function useCurrentWeek() {
  return useQuery({
    queryKey: ['journal-current-week'],
    queryFn: () => api.get<OpenWeek | null>('/api/journals/current-week'),
    staleTime: STALE,
  });
}

export function useMyJournals() {
  return useQuery({
    queryKey: ['journals-mine'],
    queryFn: () => api.get<JournalEntry[]>('/api/journals/mine'),
    staleTime: STALE,
  });
}

export function useSubmitJournal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { weekId: number; content: string }) =>
      api.post<JournalEntry>('/api/journals', body),
    onSuccess: () => {
      // The dashboard's week tracker and the journal list both describe the
      // same fact, so they must be invalidated together or the two halves of
      // the app disagree about whether this week is done.
      void qc.invalidateQueries({ queryKey: ['journals-mine'] });
      void qc.invalidateQueries({ queryKey: ['progress-summary'] });
    },
  });
}

export function useLeads() {
  return useQuery({
    queryKey: ['leads'],
    queryFn: () => api.get<Lead[]>('/api/leads'),
    staleTime: STALE,
  });
}

export function useLead(id: number | undefined) {
  return useQuery({
    queryKey: ['lead', id],
    queryFn: () => api.get<Lead>(`/api/leads/${id}`),
    enabled: id != null,
    staleTime: STALE,
  });
}

export function useLeaderboard(scope: 'national' | 'campus' | 'overall') {
  return useQuery({
    queryKey: ['leaderboard', scope],
    queryFn: () =>
      api.get<LeaderboardRow[] | { rows?: LeaderboardRow[] }>(
        `/api/leaderboard?scope=${scope}`,
      ),
    staleTime: STALE,
  });
}

export function useNotifications() {
  return useQuery({
    queryKey: ['notifications'],
    queryFn: () => api.get<AppNotification[]>('/api/notifications'),
    staleTime: 30_000,
  });
}

export function useMarkAllRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<void>('/api/notifications/read-all'),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }),
  });
}

export function useSeasons() {
  return useQuery({
    queryKey: ['seasons'],
    queryFn: () =>
      api.get<{ seasons?: Season[]; viewing?: number } | Season[]>('/api/seasons'),
    staleTime: 5 * 60_000,
  });
}

/* ── Shape helpers ────────────────────────────────────────────────── */

/**
 * Several endpoints answer either a bare array or `{ rows: [...] }` depending
 * on how old the route is. Normalising once here keeps that inconsistency out
 * of every screen.
 */
export function asArray<T>(data: unknown, key = 'rows'): T[] {
  if (Array.isArray(data)) return data as T[];
  if (data && typeof data === 'object') {
    const inner = (data as Record<string, unknown>)[key];
    if (Array.isArray(inner)) return inner as T[];
  }
  return [];
}
