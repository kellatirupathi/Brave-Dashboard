// Leaderboard — the season boundary.
//
// Two versions of this page exist because two cohorts do. Season 1 is
// finished: its revenue is settled and its rankings are read back for
// reference, so it keeps the UI it ran with. Season 2 is live and gets the
// redesigned ranking list.
//
//   1.0 (and anything earlier)  →  leaderboard-season1.tsx   frozen
//   2.0 (and later)             →  leaderboard-season2.tsx   current
//
// Split at the PAGE boundary rather than with branches inside one component,
// mirroring pages/student/dashboard-legacy.tsx. Only one ever mounts, so
// neither pays for the other's queries, and a change to the live design cannot
// reach back and alter how a finished season reads.
//
// This file keeps its name and its `headerExtra` prop because three routes
// import it: the student page, pages/coordinator/leaderboard.tsx, and
// pages/admin/leaderboard.tsx — which passes its CSV export button through.
import type { ReactNode } from "react";
import { Spinner } from "@/components/ui/spinner";
import { useSeason } from "@/lib/season-context";
import LeaderboardSeason1 from "./leaderboard-season1";
import LeaderboardSeason2 from "./leaderboard-season2";

export default function Leaderboard({
  headerExtra,
}: { headerExtra?: ReactNode } = {}) {
  const { viewingId, viewing, isLoading } = useSeason();

  // Wait for the season before choosing. Rendering one version and swapping it
  // a beat later would flash the wrong cohort's design at the reader.
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
    <LeaderboardSeason1 headerExtra={headerExtra} />
  ) : (
    <LeaderboardSeason2 headerExtra={headerExtra} />
  );
}
