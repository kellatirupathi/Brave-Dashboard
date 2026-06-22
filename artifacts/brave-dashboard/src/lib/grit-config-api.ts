// Frontend API helpers for GRIT Miles config + journal-edit deadline +
// escalation toggle. Hand-written (bypasses Orval codegen), same pattern as
// progress-api / coordinator-tags-api.
import { customFetch } from "@workspace/api-client-react";

export type GritLevel = {
  level: number;
  revenueTarget: number;
  miles: number;
  reward?: string;
};

export type StudentGritConfig = {
  levels: GritLevel[];
  journalEditDeadline: string | null;
  // Demo Day → GRIT Miles version toggles (admin-controlled, default false =
  // previous Demo Day experience). gritMilesMenuEnabled drives the student
  // sidebar label + the /demo-day page; gritMilesDashboardEnabled drives the
  // student home dashboard UI. Independent of each other.
  gritMilesMenuEnabled: boolean;
  gritMilesDashboardEnabled: boolean;
};

export type AdminGritConfig = StudentGritConfig & {
  escalationEnabled: boolean;
};

// Fallback used only while the request is in flight or if it fails — mirrors
// the server's DEFAULT_GRIT_LEVELS so the UI always has a sane ladder.
export const DEFAULT_GRIT_LEVELS: GritLevel[] = [
  { level: 1, revenueTarget: 25000, miles: 100 },
  { level: 2, revenueTarget: 50000, miles: 150 },
  { level: 3, revenueTarget: 100000, miles: 250 },
  { level: 4, revenueTarget: 200000, miles: 500 },
  { level: 5, revenueTarget: 400000, miles: 1000 },
];

export function getStudentGritConfig(): Promise<StudentGritConfig> {
  return customFetch<StudentGritConfig>("/api/grit-config");
}

export function getAdminGritConfig(): Promise<AdminGritConfig> {
  return customFetch<AdminGritConfig>("/api/admin/grit-config");
}

export function updateAdminGritConfig(
  body: Partial<{
    levels: GritLevel[];
    journalEditDeadline: string | null;
    escalationEnabled: boolean;
    gritMilesMenuEnabled: boolean;
    gritMilesDashboardEnabled: boolean;
  }>,
): Promise<AdminGritConfig> {
  return customFetch<AdminGritConfig>("/api/admin/grit-config", {
    method: "PUT",
    body: JSON.stringify(body),
  });
}

// ── Derived helpers (shared by student dashboard + demo-day page) ──────────

export type GritProgress = {
  currentRevenue: number;
  currentLevel: number; // 0 = no level reached yet
  milesUnlocked: number;
  nextLevel: GritLevel | null;
  revenueToNext: number; // 0 when all levels unlocked
};

// Compute current level / miles / next target from verified revenue.
export function computeGritProgress(
  revenue: number,
  levels: GritLevel[],
): GritProgress {
  const sorted = [...levels].sort((a, b) => a.revenueTarget - b.revenueTarget);
  let currentLevel = 0;
  let milesUnlocked = 0;
  for (const lvl of sorted) {
    if (revenue >= lvl.revenueTarget) {
      currentLevel = lvl.level;
      milesUnlocked += lvl.miles;
    }
  }
  const nextLevel = sorted.find((l) => revenue < l.revenueTarget) ?? null;
  const revenueToNext = nextLevel
    ? Math.max(0, nextLevel.revenueTarget - revenue)
    : 0;
  return {
    currentRevenue: revenue,
    currentLevel,
    milesUnlocked,
    nextLevel,
    revenueToNext,
  };
}
