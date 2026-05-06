// Frontend API helpers for the new progress-enforcement modules.
// These bypass Orval/OpenAPI codegen on purpose: they're isolated new
// features and we don't want to touch the existing `lib/api-spec` flow.
import { customFetch } from "@workspace/api-client-react";

// ---------- Module 2: Weekly Journals ----------
export type WeeklyJournal = {
  id: number;
  teamId: number;
  weekStartDate: string;
  weekEndDate: string;
  whatWeDid: string;
  blockers: string | null;
  nextWeekPlan: string | null;
  submittedBy: string;
  submittedAt: string;
};

export type JournalStatus = {
  weekId: number | null;
  weekNumber: number | null;
  weekStartDate: string | null;
  weekEndDate: string | null;
  submitted: boolean;
  journal: WeeklyJournal | null;
};

export type JournalForWeek = {
  weekId: number;
  weekNumber: number;
  weekStartDate: string;
  weekEndDate: string;
  isOpen: boolean;
  submitted: boolean;
  journal: WeeklyJournal | null;
};

export function getJournalStatus(): Promise<JournalStatus> {
  return customFetch<JournalStatus>("/api/journals/current-week");
}

export function getJournalForWeek(weekId: number): Promise<JournalForWeek> {
  return customFetch<JournalForWeek>(`/api/journals/by-week/${weekId}`);
}

export function listMyJournals(): Promise<WeeklyJournal[]> {
  return customFetch<WeeklyJournal[]>("/api/journals/mine");
}

export function submitJournal(body: {
  weekId?: number;
  whatWeDid: string;
  blockers?: string;
  nextWeekPlan?: string;
}): Promise<WeeklyJournal> {
  return customFetch<WeeklyJournal>("/api/journals", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function updateJournal(
  id: number,
  body: {
    whatWeDid?: string;
    blockers?: string | null;
    nextWeekPlan?: string | null;
  },
): Promise<WeeklyJournal> {
  return customFetch<WeeklyJournal>(`/api/journals/${id}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

export function deleteJournal(id: number): Promise<{ ok: true; id: number }> {
  return customFetch<{ ok: true; id: number }>(`/api/journals/${id}`, {
    method: "DELETE",
  });
}

export type JournalPermissions = {
  role: "student" | "coordinator" | "admin";
  canCreate: boolean;
  canUpdate: boolean;
  canDelete: boolean;
  allowPastWeekEdits: boolean;
};

export function getJournalPermissions(): Promise<JournalPermissions> {
  return customFetch<JournalPermissions>("/api/journals/permissions");
}

// Programme weeks (admin + student-facing read)
export type ProgrammeWeek = {
  id: number;
  weekNumber: number;
  startDate: string;
  endDate: string;
  isOpen: boolean;
  manualOverride: boolean;
  createdAt?: string;
  updatedAt?: string;
};

export type OpenWeek = {
  id: number;
  weekNumber: number;
  startDate: string;
  endDate: string;
};

export function listOpenWeeks(): Promise<OpenWeek[]> {
  return customFetch<OpenWeek[]>("/api/journals/open-weeks");
}

export function listAdminProgrammeWeeks(): Promise<ProgrammeWeek[]> {
  return customFetch<ProgrammeWeek[]>("/api/admin/programme-weeks");
}

export function regenerateProgrammeWeeks(): Promise<{
  created: number;
  updated: number;
  removed: number;
  total: number;
}> {
  return customFetch("/api/admin/programme-weeks/regenerate", {
    method: "POST",
  });
}

export function toggleProgrammeWeek(
  id: number,
  isOpen: boolean,
): Promise<ProgrammeWeek> {
  return customFetch<ProgrammeWeek>(`/api/admin/programme-weeks/${id}`, {
    method: "PATCH",
    body: JSON.stringify({ isOpen }),
  });
}

export function clearProgrammeWeekOverride(id: number): Promise<ProgrammeWeek> {
  return customFetch<ProgrammeWeek>(
    `/api/admin/programme-weeks/${id}/clear-override`,
    { method: "POST" },
  );
}

// Admin reminder settings — separate toggles for student channels and
// coordinator notifications.
export type ReminderSettings = {
  notificationsEnabled: boolean;
  emailsEnabled: boolean;
  coordinatorNotificationsEnabled: boolean;
  allowPastWeekEdits: boolean;
};

export function getReminderSettings(): Promise<ReminderSettings> {
  return customFetch<ReminderSettings>("/api/admin/reminder-settings");
}

export function updateReminderSettings(
  body: Partial<ReminderSettings>,
): Promise<ReminderSettings> {
  return customFetch<ReminderSettings>("/api/admin/reminder-settings", {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

export type JournalRow = WeeklyJournal & {
  teamName: string | null;
  campusName: string | null;
  submittedByName: string | null;
};

export function listAdminJournals(filter?: {
  campusId?: number;
}): Promise<JournalRow[]> {
  const qs = filter?.campusId ? `?campusId=${filter.campusId}` : "";
  return customFetch<JournalRow[]>(`/api/admin/journals${qs}`);
}

export type JournalCoverageRow = {
  teamId: number;
  teamName: string;
  campusId: number | null;
  campusName: string | null;
  totalWeeks: number;
  submittedWeeks: number;
  missedWeeks: number;
  lastSubmittedWeek: string | null;
};

export function getJournalCoverage(): Promise<JournalCoverageRow[]> {
  return customFetch<JournalCoverageRow[]>("/api/admin/journals/coverage");
}

// ---------- Module 4: Activity Heatmap (journal-only) ----------
export type HeatmapTeamWeek = {
  weekStartDate: string;
  hasJournal: boolean;
};

export type HeatmapTeamRow = {
  teamId: number;
  teamName: string;
  campusId: number | null;
  campusName: string | null;
  daysSinceLastJournal: number | null;
  totalJournals: number;
  weeks: HeatmapTeamWeek[];
  status: "active" | "inconsistent" | "silent" | "never_logged";
};

export type HeatmapResponse = {
  weeks: string[];
  teams: HeatmapTeamRow[];
};

export function getHeatmap(filter?: {
  campusId?: number;
  weeksBack?: number;
}): Promise<HeatmapResponse> {
  const params = new URLSearchParams();
  if (filter?.campusId) params.set("campusId", String(filter.campusId));
  if (filter?.weeksBack) params.set("weeksBack", String(filter.weeksBack));
  const qs = params.toString();
  return customFetch<HeatmapResponse>(`/api/heatmap${qs ? `?${qs}` : ""}`);
}

export function sendHeatmapReminder(teamId: number): Promise<{ ok: true }> {
  return customFetch<{ ok: true }>(`/api/heatmap/remind`, {
    method: "POST",
    body: JSON.stringify({ teamId }),
  });
}

export type BulkRemindResponse = {
  ok: true;
  sentToTeams: number;
  sentToUsers: number;
  skippedTeams: number;
};

export function sendBulkHeatmapReminders(
  teamIds: number[],
): Promise<BulkRemindResponse> {
  return customFetch<BulkRemindResponse>(`/api/heatmap/remind-bulk`, {
    method: "POST",
    body: JSON.stringify({ teamIds }),
  });
}

export type CampusOption = {
  id: number;
  name: string;
  city?: string | null;
  state?: string | null;
};

export function listCampusesForFilter(): Promise<CampusOption[]> {
  return customFetch<CampusOption[]>("/api/campuses");
}

// ---------- Student dashboard widgets ----------
export type ProgressSummary = {
  teamId: number | null;
  streak: number;
  totalJournals: number;
  lastJournalAt: string | null;
  journal: {
    weekId: number | null;
    weekNumber: number | null;
    weekStart: string;
    weekEnd: string;
    submittedThisWeek: boolean;
    lastJournalAt: string | null;
    lastJournalWeekStart: string | null;
  };
};

export function getProgressSummary(): Promise<ProgressSummary> {
  return customFetch<ProgressSummary>("/api/progress-summary");
}
