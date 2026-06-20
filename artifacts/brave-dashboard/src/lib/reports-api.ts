// Frontend API helpers for the admin journal Reports page + report viewer.
// Hand-written (bypasses Orval codegen), same pattern as progress-api.
import { customFetch } from "@workspace/api-client-react";

export type ReportWeek = {
  id: number;
  weekNumber: number;
  startDate: string;
  endDate: string;
};

export type CampusSummaryRow = {
  campusId: number;
  campusName: string;
  totalTeams: number;
  submittedTeams: number;
  notSubmittedTeams: number;
  mailedSuccessCoach: boolean;
  mailedCos: boolean;
  mailedAdmin: boolean;
};

export type CampusSummary = {
  week: {
    weekId: number;
    weekNumber: number;
    startDate: string;
    endDate: string;
  } | null;
  weekId?: string;
  weeksCount?: number;
  rows: CampusSummaryRow[];
};

export type CampusDrilldownTeam = {
  teamId: number;
  teamName: string;
  submitted: boolean;
  submittedByRole: string | null;
  submittedAt: string | null;
};

export type CampusDrilldown = {
  week: {
    weekId: number;
    weekNumber: number;
    startDate: string;
    endDate: string;
  } | null;
  campus: {
    campusId: number;
    campusName: string;
    totalTeams: number;
    submittedCount: number;
    notSubmittedCount: number;
    teams: CampusDrilldownTeam[];
  } | null;
};

export type ReportLink = {
  id: number;
  token: string;
  scope: string;
  kind: string;
  campusId: number | null;
  campusName: string | null;
  weekId: number | null;
  weekLabel: string | null;
  title: string;
  payload: unknown;
  createdAt: string;
};

export function getReportWeeks(): Promise<ReportWeek[]> {
  return customFetch<{ weeks: ReportWeek[] }>("/api/admin/reports/weeks").then(
    (r) => r.weeks,
  );
}

export function getCampusSummary(
  weekId?: number | "all",
): Promise<CampusSummary> {
  const qs = weekId != null ? `?weekId=${weekId}` : "";
  return customFetch<CampusSummary>(`/api/admin/reports/campus-summary${qs}`);
}

export function getCampusDrilldown(
  campusId: number,
  weekId?: number | "all",
): Promise<CampusDrilldown> {
  const qs = weekId != null && weekId !== "all" ? `?weekId=${weekId}` : "";
  return customFetch<CampusDrilldown>(
    `/api/admin/reports/campus/${campusId}${qs}`,
  );
}

export function getReportLinks(): Promise<ReportLink[]> {
  return customFetch<{ links: ReportLink[] }>("/api/admin/reports/links").then(
    (r) => r.links,
  );
}

export function getReportByToken(
  token: string,
): Promise<{ report: ReportLink }> {
  return customFetch<{ report: ReportLink }>(
    `/api/reports/view/${encodeURIComponent(token)}`,
  );
}

// Download a campus CSV (cookie-authenticated fetch → blob → save).
export async function downloadCampusCsv(
  campusId: number,
  weekId?: number | "all",
): Promise<void> {
  const qs = weekId != null && weekId !== "all" ? `?weekId=${weekId}` : "";
  const res = await fetch(`/api/admin/reports/campus/${campusId}/export${qs}`, {
    credentials: "include",
  });
  if (!res.ok) throw new Error(`Export failed (${res.status})`);
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `journal-report-campus-${campusId}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
