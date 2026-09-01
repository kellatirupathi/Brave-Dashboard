// Student dashboard — data and orchestration.
//
// This file owns the QUERIES and the DERIVED FIGURES; it renders almost no
// markup of its own. The two layouts that do are:
//
//   dashboard-mobile.tsx   below `md`
//   dashboard-desktop.tsx  `md` and up
//
// They receive identical props, so a number can never read one way on a phone
// and another on a laptop — the failure mode that made the previous single
// responsive tree hard to change safely.
import { useState } from "react";
import { useAuth } from "@workspace/replit-auth-web";
import { useGetTeamDashboardSummary } from "@workspace/api-client-react";
import { useQuery } from "@tanstack/react-query";
import { getProgressSummary } from "@/lib/progress-api";
import { Spinner } from "@/components/ui/spinner";
import { getLeaderboardConfig } from "@/lib/leaderboard-config-api";
import { DEFAULT_BANNER_CONTENT } from "@/components/leaderboard-banner-templates";
import { AutoIntroVideo } from "@/components/intro-video-dialog";
import { useProgrammeCountdown } from "@/components/program-countdown";
import { FeedbackDialog } from "@/components/feedback-dialog";
import { MobileDashboard } from "./dashboard-mobile";
import { DesktopDashboard } from "./dashboard-desktop";

// Demo Day verified-revenue goal.
const DEMO_DAY_THRESHOLD = 200000;

// Streak badge tiers — used to compute progress toward the next milestone.
const STREAK_TIERS = [3, 5, 8, 12];

type Tone = "good" | "warn" | "bad" | "muted";

export default function TeamDashboard() {
  const { user } = useAuth();
  const { data: summary, isLoading } = useGetTeamDashboardSummary();
  // Declared here rather than inside either layout so the hook order is
  // identical on both and cannot shift when the breakpoint changes which tree
  // renders.
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const countdown = useProgrammeCountdown();
  // Same data source the journal widgets already used — reused here so the
  // journal status / streak / consistency features are preserved.
  const { data: progress } = useQuery({
    queryKey: ["progress-summary"],
    queryFn: getProgressSummary,
  });
  // While the admin hides rank from students, the rank metrics must not leak
  // it — they show a "revealing soon" note with the reveal time instead.
  const { data: lbConfig } = useQuery({
    queryKey: ["leaderboard-config"],
    queryFn: getLeaderboardConfig,
    staleTime: 60_000,
  });
  const rankHidden = lbConfig?.hideRankForStudents ?? false;
  const revealText =
    lbConfig?.bannerContent?.timeText?.trim() ||
    DEFAULT_BANNER_CONTENT.timeText;

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  if (!summary) {
    return <div>Failed to load dashboard</div>;
  }

  const progressPercent = Math.min(
    (summary.totalRevenue / DEMO_DAY_THRESHOLD) * 100,
    100,
  );

  const submittedThisWeek = !!progress?.journal?.submittedThisWeek;
  const streak = progress?.streak ?? 0;
  const totalJournals = progress?.totalJournals ?? 0;

  const journalTone: Tone = submittedThisWeek
    ? "good"
    : progress?.lastJournalAt
      ? "warn"
      : "bad";
  const journalLabel = submittedThisWeek
    ? "Submitted"
    : progress?.lastJournalAt
      ? "Pending"
      : "Not started";

  const pending = summary.pendingSubmissions ?? 0;

  // Next streak milestone (for the "X to next badge" progress).
  const nextTier = STREAK_TIERS.find((t) => t > streak) ?? null;
  const tierFloor = [...STREAK_TIERS].reverse().find((t) => t <= streak) ?? 0;
  const tierProgress =
    nextTier != null
      ? ((streak - tierFloor) / (nextTier - tierFloor)) * 100
      : 100;

  /** The one set of figures both layouts render. */
  const shared = {
    firstName: user?.firstName ?? "",
    teamName: summary.team?.name || "Your Team",
    tagline: summary.team?.tagline || "No tagline set",
    campusName: summary.team?.campusName || "Your campus",
    verifiedRevenue: summary.totalRevenue,
    orderBook: summary.totalOrderBook,
    nationalRank: summary.nationalRank,
    campusRank: summary.campusRank,
    rankHidden,
    revealText,
    progressPercent,
    demoDayThreshold: DEMO_DAY_THRESHOLD,
    journalTone,
    journalLabel,
    submittedThisWeek,
    weekNumber: progress?.journal?.weekNumber,
    pending,
    totalJournals,
    streak,
    nextTier,
    tierProgress,
    daysLeft: countdown.daysLeft,
    endLabel: countdown.endLabel,
    programmeEnded: countdown.ended,
    onFeedback: () => setFeedbackOpen(true),
  };

  return (
    <>
      <AutoIntroVideo />

      {/* Only one of these is ever mounted, so the single dialog below serves
          whichever is on screen. */}
      <div className="md:hidden">
        <MobileDashboard {...shared} />
      </div>
      <div className="hidden md:block">
        <DesktopDashboard {...shared} demoEligible={!!summary.demoEligible} />
      </div>

      <FeedbackDialog open={feedbackOpen} onOpenChange={setFeedbackOpen} />
    </>
  );
}
