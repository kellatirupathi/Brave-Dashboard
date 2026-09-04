// GRIT Miles — the season boundary.
//
// Two versions of this page exist because two cohorts do. Season 1 is
// finished: its verified revenue is settled and its levels are read back for
// reference, so it keeps the UI it ran with. Season 2 is live and gets the
// redesigned climb.
//
//   1.0 (and anything earlier)  →  grit-miles-season1.tsx   frozen
//   2.0 (and later)             →  grit-miles-season2.tsx   current
//
// Split at the PAGE boundary rather than with branches inside one component,
// mirroring pages/student/dashboard-legacy.tsx. Only one ever mounts, so
// neither pays for the other's queries, and a change to the live design cannot
// reach back and alter how a finished season reads.
//
// This file keeps its name because App.tsx imports it as GritMilesPage for the
// /grit-miles route.
import { Spinner } from "@/components/ui/spinner";
import { useSeason } from "@/lib/season-context";
import GritMilesSeason1 from "./grit-miles-season1";
import GritMilesSeason2 from "./grit-miles-season2";

export default function GritMiles() {
  const { viewingId, viewing, isLoading } = useSeason();

  // Wait for the season before choosing. Rendering one version and swapping it
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
  return viewing.slug === "1.0" ? <GritMilesSeason1 /> : <GritMilesSeason2 />;
}
