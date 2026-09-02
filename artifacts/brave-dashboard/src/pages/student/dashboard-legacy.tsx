// Student dashboard — the season boundary.
//
// Two dashboards exist because two cohorts do. Season 1 is finished: its
// numbers are settled and its screens are read back for reference, so it keeps
// the UI it ran with. Season 2 is live and gets the new design.
//
//   1.0 (and anything earlier)  →  dashboard-season1.tsx   frozen
//   2.0 (and later)             →  dashboard-season2.tsx   current
//
// Split at the PAGE boundary rather than with branches inside one component,
// mirroring pages/admin/dashboard.tsx. Only one of the two ever mounts, so
// neither pays for the other's queries, and a change to the live design cannot
// reach back and alter how a finished season reads.
//
// This file keeps its name because App.tsx imports it as the student's
// "previous Demo Day dashboard" — the other half of the admin's
// gritMilesDashboardEnabled toggle, which is independent of the season.
import { Spinner } from "@/components/ui/spinner";
import { useSeason } from "@/lib/season-context";
import TeamDashboardSeason1 from "./dashboard-season1";
import TeamDashboardSeason2 from "./dashboard-season2";

export default function TeamDashboard() {
  const { viewingId, viewing, isLoading } = useSeason();

  // Wait for the season before choosing. Rendering a dashboard and swapping it
  // a beat later would flash the wrong cohort's design at the student.
  if (isLoading || viewingId == null || !viewing) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  // Anything that is not Season 1 gets the current design, so a future 3.0
  // inherits it rather than silently falling back to the frozen one.
  return viewing.slug === "1.0" ? (
    <TeamDashboardSeason1 />
  ) : (
    <TeamDashboardSeason2 />
  );
}
