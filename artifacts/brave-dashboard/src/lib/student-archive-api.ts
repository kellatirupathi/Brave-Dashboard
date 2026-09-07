// Student history across seasons — read-only client (additive, isolated).
//
// Backs two things: the dashboard's performance-snapshot filter, and the Past
// Seasons page. Every call here is a GET; there is deliberately no writing
// counterpart, because Season 1 is a settled archive.
import { customFetch } from "@workspace/api-client-react";

/** A season id, or every season combined. */
export type SeasonScope = number | "all";

export type PerformanceFigures = {
  season: SeasonScope;
  verifiedRevenue: number;
  orderBook: number;
  /** Null when the team is inactive or hidden, so it is not ranked at all. */
  nationalRank: number | null;
  campusRank: number | null;
};

export type ArchiveSeason = {
  id: number;
  slug: string;
  name: string;
  journalCount: number;
  projectCount: number;
};

export type ArchiveJournal = {
  id: number;
  weekStartDate: string;
  weekEndDate: string;
  /** Null when the programme week row was later removed. */
  weekNumber: number | null;
  submittedAt: string | null;
  submittedByRole: string | null;
  whatWeDid: string | null;
  blockers: string | null;
  nextWeekPlan: string | null;
};

export type ArchiveProject = {
  id: number;
  title: string;
  status: string;
  serviceCategory: string | null;
  problemStatement: string | null;
  solutionDescription: string | null;
  createdAt: string;
  verifiedRevenue: number;
};

export const archiveKeys = {
  performance: (scope: SeasonScope) =>
    ["student-performance", String(scope)] as const,
  seasons: () => ["student-archive-seasons"] as const,
  journals: (seasonId: number) =>
    ["student-archive-journals", seasonId] as const,
  projects: (seasonId: number) =>
    ["student-archive-projects", seasonId] as const,
};

/** The four snapshot figures for one season, or all seasons combined. */
export function getPerformance(scope: SeasonScope): Promise<PerformanceFigures> {
  return customFetch(`/api/student/performance?season=${scope}`, {
    method: "GET",
  });
}

/** Seasons earlier than the caller's own, with what each holds. */
export function getArchiveSeasons(): Promise<{ seasons: ArchiveSeason[] }> {
  return customFetch("/api/student/archive/seasons", { method: "GET" });
}

export function getArchiveJournals(
  seasonId: number,
): Promise<{ journals: ArchiveJournal[] }> {
  return customFetch(`/api/student/archive/journals?season=${seasonId}`, {
    method: "GET",
  });
}

export function getArchiveProjects(
  seasonId: number,
): Promise<{ projects: ArchiveProject[] }> {
  return customFetch(`/api/student/archive/projects?season=${seasonId}`, {
    method: "GET",
  });
}
