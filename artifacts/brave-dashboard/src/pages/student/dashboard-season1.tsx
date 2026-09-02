// Student dashboard — SEASON 1 (frozen).
//
// This is the dashboard exactly as it stood before the Season 2 redesign,
// preserved rather than migrated. Season 1 is a closed cohort: its teams have
// finished, its numbers are settled, and its screens are read back for
// reference. Restyling a finished season would change how past results LOOK
// without changing what they ARE, which is the one thing an archive must not
// do.
//
// So the split is at the page boundary, mirroring pages/admin/dashboard.tsx:
// Season 1 renders this file, Season 2 renders dashboard-season2.tsx, and
// neither mounts the other — no duplicate queries.
//
// TREAT AS FROZEN. Changes belong in the Season 2 files unless a genuine bug
// is being fixed here.
import { useGetTeamDashboardSummary } from "@workspace/api-client-react";
import { useQuery } from "@tanstack/react-query";
import { getProgressSummary } from "@/lib/progress-api";
import { formatINR } from "@/lib/format";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import { Link } from "wouter";
import { cn } from "@/lib/utils";
import {
  Trophy,
  Building2,
  Briefcase,
  CheckCircle,
  AlertCircle,
  BookOpenCheck,
  Flame,
  Target,
  TrendingUp,
  Wallet,
  ArrowUpRight,
  Lock,
} from "lucide-react";
import { NotificationsBell } from "@/components/notifications-bell";
import { HelpMenu } from "@/components/help-menu";
import { JournalWeekTracker } from "@/components/journal-week-tracker";
import { PinnedAnnouncementBanner } from "@/components/pinned-announcement-banner";
import { SubmitAsapBanner } from "@/components/projects-lock-banner";
import { getLeaderboardConfig } from "@/lib/leaderboard-config-api";
import { DEFAULT_BANNER_CONTENT } from "@/components/leaderboard-banner-templates";
import { SupportBanner } from "@/components/support-banner";
import { AutoIntroVideo } from "@/components/intro-video-dialog";
import { ProgramCountdown } from "@/components/program-countdown";
import { InstagramLink } from "@/components/instagram-link";

// ── Design system helpers ───────────────────────────────────────────────────
// Flat, enterprise SaaS surfaces (border + card bg, no shadows/gradients).
const PANEL = "rounded-xl border bg-card";

// Demo Day verified-revenue goal + the auto-milestone markers along the way.
const DEMO_DAY_THRESHOLD = 200000;
const REVENUE_MILESTONES = [50000, 100000, 200000];

// Streak badge tiers — used to compute progress toward the next milestone.
const STREAK_TIERS = [3, 5, 8, 12];

// Level-1 workspace section label.
function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
      {children}
    </h2>
  );
}

type Tone = "good" | "warn" | "bad" | "muted";
const TONE_BADGE: Record<Tone, string> = {
  good: "bg-emerald-100 text-emerald-700 hover:bg-emerald-100",
  warn: "bg-amber-100 text-amber-700 hover:bg-amber-100",
  bad: "bg-red-100 text-red-700 hover:bg-red-100",
  muted: "bg-muted text-muted-foreground hover:bg-muted",
};
const TONE_DOT: Record<Tone, string> = {
  good: "bg-emerald-500",
  warn: "bg-amber-500",
  bad: "bg-red-500",
  muted: "bg-muted-foreground/40",
};

// Shown in place of a rank number while the admin hides ranks from students.
// Keeps the KPI card the same size — just a small "revealing soon" line.
function RankHiddenValue() {
  return (
    <span
      className="inline-flex items-center gap-1.5 text-base font-semibold text-muted-foreground"
      data-testid="kpi-rank-hidden"
    >
      <Lock className="h-4 w-4" />
      Revealing soon
    </span>
  );
}

export default function TeamDashboardSeason1() {
  const { data: summary, isLoading } = useGetTeamDashboardSummary();
  // Same data source the journal widgets already used — reused here so the
  // journal status / streak / consistency features are preserved.
  const { data: progress } = useQuery({
    queryKey: ["progress-summary"],
    queryFn: getProgressSummary,
  });
  // While the admin hides rank from students, the rank KPI cards must not leak
  // it — they show a small "revealing soon" note with the reveal time instead.
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
  const activeProjects = summary.activeProjects ?? 0;

  // Next streak milestone (for the "X to next badge" progress).
  const nextTier = STREAK_TIERS.find((t) => t > streak) ?? null;
  const tierFloor = [...STREAK_TIERS].reverse().find((t) => t <= streak) ?? 0;
  const tierProgress =
    nextTier != null
      ? ((streak - tierFloor) / (nextTier - tierFloor)) * 100
      : 100;

  // ── Section 1 — Performance Overview KPI cards ────────────────────────────
  const kpis: {
    label: string;
    value: React.ReactNode;
    sub: string;
    icon: React.ComponentType<{ className?: string }>;
    href: string;
    accent: string;
  }[] = [
    {
      label: "Verified revenue",
      value: formatINR(summary.totalRevenue),
      sub: "Counts toward Demo Day",
      icon: Wallet,
      href: "/demo-day",
      accent: "text-emerald-600 bg-emerald-50",
    },
    {
      label: "Order book",
      value: formatINR(summary.totalOrderBook),
      sub: "Committed pipeline",
      icon: Briefcase,
      href: "/projects",
      accent: "text-blue-600 bg-blue-50",
    },
    {
      label: "National rank",
      // While ranks are hidden from students, don't leak the rank here —
      // show a small "revealing soon" note with the admin's reveal time.
      value: rankHidden ? (
        <RankHiddenValue />
      ) : (
        `#${summary.nationalRank || "—"}`
      ),
      sub: rankHidden ? revealText : "All campuses",
      icon: Trophy,
      href: "/leaderboard",
      accent: "text-amber-600 bg-amber-50",
    },
    {
      label: "Campus rank",
      value: rankHidden ? <RankHiddenValue /> : `#${summary.campusRank || "—"}`,
      sub: rankHidden ? revealText : summary.team?.campusName || "Your campus",
      icon: Building2,
      href: "/leaderboard",
      accent: "text-violet-600 bg-violet-50",
    },
  ];

  return (
    <>
      <AutoIntroVideo />
      <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
        <PinnedAnnouncementBanner />
        <SubmitAsapBanner />

        {/* ===================== HEADER ===================== */}
        <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
          <Link
            href="/team"
            className="block rounded-md -mx-2 px-2 py-1 hover-elevate active-elevate-2 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            data-testid="link-team-header"
          >
            <h1 className="text-3xl font-bold tracking-tight text-foreground">
              {summary.team?.name || "Your Team"}
            </h1>
            <p className="text-muted-foreground">
              {summary.team?.tagline || "No tagline set"}
            </p>
          </Link>

          {/* Weekly Journal — top-middle tracker strip */}
          <div className="min-w-0 lg:px-6">
            <div className="mb-1.5 flex items-center justify-center gap-2">
              <span
                className={cn(
                  "h-1.5 w-1.5 rounded-full",
                  TONE_DOT[journalTone],
                )}
              />
              <SectionLabel>Weekly journal</SectionLabel>
              <Badge
                className={cn(
                  "text-[10px] leading-none",
                  TONE_BADGE[journalTone],
                )}
              >
                {journalLabel}
              </Badge>
            </div>
            <JournalWeekTracker />
          </div>

          <div className="flex items-center gap-3 self-stretch lg:self-auto justify-end">
            <HelpMenu inline />
            {summary.demoEligible && (
              <Badge
                variant="default"
                className="px-4 py-2 text-sm bg-green-500 hover:bg-green-600 border-none text-white shadow-sm"
              >
                <CheckCircle className="w-4 h-4 mr-2" />
                Demo Day Eligible!
              </Badge>
            )}
            <NotificationsBell />
          </div>
        </div>

        {/* ============ SECTION 1 — PERFORMANCE OVERVIEW ============ */}
        <section>
          <SectionLabel>Performance overview</SectionLabel>
          <div className="mt-3 grid grid-cols-2 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {kpis.map((k) => {
              const Icon = k.icon;
              return (
                <Link
                  key={k.label}
                  href={k.href}
                  className={cn(
                    PANEL,
                    "group p-4 transition-colors hover:bg-muted/30 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  )}
                  data-testid={`kpi-${k.label.toLowerCase().replace(/\s+/g, "-")}`}
                >
                  <div className="flex items-center justify-between">
                    <span
                      className={cn(
                        "grid h-9 w-9 place-items-center rounded-lg",
                        k.accent,
                      )}
                    >
                      <Icon className="h-4 w-4" />
                    </span>
                    <ArrowUpRight className="h-4 w-4 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
                  </div>
                  <div className="mt-3 text-2xl font-bold tabular-nums tracking-tight">
                    {k.value}
                  </div>
                  <div className="mt-0.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                    {k.label}
                  </div>
                  <div className="mt-1 truncate text-xs text-muted-foreground">
                    {k.sub}
                  </div>
                </Link>
              );
            })}
          </div>
        </section>

        {/* ============ MAIN WORKSPACE (left flow + right streak rail) ============ */}
        <div className="grid gap-6 lg:grid-cols-[1fr_320px] lg:items-start">
          {/* ---------- LEFT: primary workspace ---------- */}
          <div className="space-y-6 min-w-0">
            {/* SECTION 2 — PROGRESS CENTER */}
            <section className={cn(PANEL, "p-5")}>
              <div className="flex items-center justify-between">
                <SectionLabel>Progress center</SectionLabel>
                <Link
                  href="/journal"
                  className="text-xs font-medium text-primary hover:underline"
                >
                  Open journal
                </Link>
              </div>
              <div className="mt-4 grid gap-x-8 gap-y-5 sm:grid-cols-2">
                {/* Journal this week */}
                <div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="flex items-center gap-2 text-muted-foreground">
                      <BookOpenCheck className="h-4 w-4" /> Journal this week
                    </span>
                    <Badge className={TONE_BADGE[journalTone]}>
                      {journalLabel}
                    </Badge>
                  </div>
                  <Progress
                    value={submittedThisWeek ? 100 : 0}
                    className="mt-2 h-1.5"
                  />
                  <p className="mt-1.5 text-xs text-muted-foreground">
                    {progress?.journal?.weekNumber != null
                      ? `Week ${progress.journal.weekNumber}`
                      : "Submit a short 3-field journal to stay on track."}
                  </p>
                </div>

                {/* Demo Day readiness */}
                <div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="flex items-center gap-2 text-muted-foreground">
                      <Target className="h-4 w-4" /> Demo Day readiness
                    </span>
                    <span className="text-sm font-semibold tabular-nums">
                      {progressPercent.toFixed(0)}%
                    </span>
                  </div>
                  <Progress value={progressPercent} className="mt-2 h-1.5" />
                  <p className="mt-1.5 text-xs text-muted-foreground">
                    {formatINR(summary.totalRevenue)} of{" "}
                    {formatINR(DEMO_DAY_THRESHOLD)} verified
                  </p>
                </div>

                {/* Submission status */}
                <div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="flex items-center gap-2 text-muted-foreground">
                      <AlertCircle className="h-4 w-4" /> Pending submissions
                    </span>
                    <span className="text-sm font-semibold tabular-nums">
                      {pending}
                    </span>
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">
                    {pending > 0
                      ? "Awaiting admin review."
                      : "Nothing awaiting review."}
                  </p>
                </div>

                {/* Journals submitted */}
                <div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="flex items-center gap-2 text-muted-foreground">
                      <BookOpenCheck className="h-4 w-4" /> Journals submitted
                    </span>
                    <span className="text-sm font-semibold tabular-nums">
                      {totalJournals}
                    </span>
                  </div>
                </div>
              </div>
            </section>

            {/* SECTION 3 — PERFORMANCE ANALYTICS */}
            <section className={cn(PANEL, "p-5")}>
              <div className="flex items-center justify-between">
                <SectionLabel>Performance analytics</SectionLabel>
                <Link
                  href="/demo-day"
                  className="text-xs font-medium text-primary hover:underline"
                >
                  Demo Day
                </Link>
              </div>

              {/* Journey to Demo Day — milestone track on real verified revenue */}
              <div className="mt-4">
                <div className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-2 text-muted-foreground">
                    <TrendingUp className="h-4 w-4" /> Journey to Demo Day
                  </span>
                  <span className="font-semibold tabular-nums">
                    {formatINR(summary.totalRevenue)}
                  </span>
                </div>
                <div className="relative mt-4">
                  <Progress value={progressPercent} className="h-2" />
                  <div className="mt-2 flex justify-between">
                    {REVENUE_MILESTONES.map((m) => {
                      const reached = summary.totalRevenue >= m;
                      return (
                        <div
                          key={m}
                          className="flex flex-col items-center gap-1 text-center"
                        >
                          <span
                            className={cn(
                              "h-2 w-2 rounded-full",
                              reached
                                ? "bg-emerald-500"
                                : "bg-muted-foreground/30",
                            )}
                          />
                          <span
                            className={cn(
                              "text-[11px] tabular-nums",
                              reached
                                ? "font-semibold text-foreground"
                                : "text-muted-foreground",
                            )}
                          >
                            {formatINR(m)}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Achievement metrics — real figures, no fabricated trends */}
              <div className="mt-5 grid grid-cols-2 gap-px overflow-hidden rounded-lg border bg-border sm:grid-cols-3">
                {(
                  [
                    {
                      label: "Verified revenue",
                      value: formatINR(summary.totalRevenue),
                    },
                    {
                      label: "Order book",
                      value: formatINR(summary.totalOrderBook),
                    },
                    { label: "Best streak", value: `${streak} wk` },
                  ] as const
                ).map((m) => (
                  <div key={m.label} className="bg-card p-4">
                    <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
                      {m.label}
                    </div>
                    <div className="mt-1 text-lg font-bold tabular-nums">
                      {m.value}
                    </div>
                  </div>
                ))}
              </div>
            </section>

            {/* Support banner — kept within the left column only */}
            <SupportBanner />
          </div>

          {/* ---------- RIGHT: streak & rewards rail (Duolingo-style) ---------- */}
          <aside className="space-y-4 lg:sticky lg:top-4 self-start">
            {/* Programme end date + remaining-time countdown */}
            <ProgramCountdown />

            {/* Journal streak — the focal gamified element */}
            <section className={cn(PANEL, "p-5 text-center")}>
              <div className="flex items-center justify-center gap-2">
                <Flame
                  className={cn(
                    "h-5 w-5",
                    streak > 0
                      ? "fill-orange-400 text-orange-500"
                      : "text-muted-foreground",
                  )}
                />
                <SectionLabel>Journal streak</SectionLabel>
              </div>
              <div className="mt-3 flex items-end justify-center gap-2">
                <span
                  className={cn(
                    "text-6xl font-extrabold leading-none tabular-nums",
                    streak === 0
                      ? "text-muted-foreground"
                      : streak >= 4
                        ? "text-orange-500"
                        : "text-foreground",
                  )}
                  data-testid="rail-streak-count"
                >
                  {streak}
                </span>
                <span className="mb-1 text-sm text-muted-foreground">
                  week{streak === 1 ? "" : "s"}
                </span>
              </div>

              {/* Progress toward next streak milestone */}
              {nextTier != null ? (
                <div className="mt-4 text-left">
                  <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                    <span>Next badge</span>
                    <span className="tabular-nums">
                      {streak}/{nextTier} weeks
                    </span>
                  </div>
                  <Progress value={tierProgress} className="mt-1.5 h-1.5" />
                </div>
              ) : (
                <p className="mt-3 text-xs font-medium text-orange-600">
                  Top-tier streak — you're unstoppable 🔥
                </p>
              )}

              <p className="mt-4 text-xs text-muted-foreground">
                {streak === 0
                  ? "Submit this week's journal to start your streak."
                  : submittedThisWeek
                    ? "You're covered this week — keep it alive next week."
                    : "Submit before the week closes to keep your streak alive."}
              </p>
            </section>

            {/* Social — fills the right-rail gap */}
            <InstagramLink />
          </aside>
        </div>
      </div>
    </>
  );
}
