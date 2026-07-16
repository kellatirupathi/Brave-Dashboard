import { useGetTeamDashboardSummary } from "@workspace/api-client-react";
import { useQuery } from "@tanstack/react-query";
import { getProgressSummary } from "@/lib/progress-api";
import {
  getStudentGritConfig,
  computeGritProgress,
  DEFAULT_GRIT_LEVELS,
} from "@/lib/grit-config-api";
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
  ChevronRight,
  Award,
  Wallet,
  ArrowUpRight,
  Target,
  Lock,
} from "lucide-react";
import { NotificationsBell } from "@/components/notifications-bell";
import { HelpMenu } from "@/components/help-menu";
import { PinnedAnnouncementBanner } from "@/components/pinned-announcement-banner";
import { SubmitAsapBanner } from "@/components/projects-lock-banner";
import { getLeaderboardConfig } from "@/lib/leaderboard-config-api";
import { DEFAULT_BANNER_CONTENT } from "@/components/leaderboard-banner-templates";
import { SupportBanner } from "@/components/support-banner";
import { AutoIntroVideo } from "@/components/intro-video-dialog";
import { TeamNameDuplicatePopup } from "@/components/team-name-duplicate-popup";
import { JournalWeekTracker } from "@/components/journal-week-tracker";
import { ProgramCountdown } from "@/components/program-countdown";
import { InstagramLink } from "@/components/instagram-link";

// ── Design system helpers ───────────────────────────────────────────────────
// Flat, enterprise SaaS surfaces. One confident focal point (the GRIT ring),
// everything else calm and precisely aligned.
const PANEL = "rounded-2xl border bg-card";

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
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

// Circular progress ring (SVG, no deps). Track + animated primary arc, with a
// centred slot for the headline number.
function RadialProgress({
  value,
  size = 208,
  stroke = 16,
  children,
}: {
  value: number;
  size?: number;
  stroke?: number;
  children: React.ReactNode;
}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(100, value));
  const offset = c * (1 - pct / 100);
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className="-rotate-90"
      >
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="currentColor"
          strokeWidth={stroke}
          className="text-muted"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="currentColor"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={offset}
          className="text-primary transition-all duration-700 ease-out"
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center px-4 text-center">
        {children}
      </div>
    </div>
  );
}

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

export default function TeamDashboard() {
  const { data: summary, isLoading } = useGetTeamDashboardSummary();
  const { data: progress, isError: progressError } = useQuery({
    queryKey: ["progress-summary"],
    queryFn: getProgressSummary,
  });
  const { data: gritConfig } = useQuery({
    queryKey: ["student-grit-config"],
    queryFn: getStudentGritConfig,
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

  const levels = gritConfig?.levels?.length
    ? gritConfig.levels
    : DEFAULT_GRIT_LEVELS;
  const grit = computeGritProgress(summary.totalRevenue, levels);
  const topTarget = levels[levels.length - 1]?.revenueTarget ?? 1;
  const ladderPercent = Math.min((summary.totalRevenue / topTarget) * 100, 100);

  const prevTarget =
    [...levels].filter((l) => summary.totalRevenue >= l.revenueTarget).pop()
      ?.revenueTarget ?? 0;
  const nextMilestonePercent = grit.nextLevel
    ? Math.min(
        ((summary.totalRevenue - prevTarget) /
          (grit.nextLevel.revenueTarget - prevTarget)) *
          100,
        100,
      )
    : 100;

  const submittedThisWeek = !!progress?.journal?.submittedThisWeek;
  // When the progress fetch fails, don't fall back to a false "Not started" —
  // surface a neutral "Unavailable" so a student isn't wrongly told they
  // haven't journaled.
  const journalTone: Tone = progressError
    ? "muted"
    : submittedThisWeek
      ? "good"
      : progress?.lastJournalAt
        ? "warn"
        : "bad";
  const journalLabel = progressError
    ? "Unavailable"
    : submittedThisWeek
      ? "Submitted"
      : progress?.lastJournalAt
        ? "Pending"
        : "Not started";

  const pending = summary.pendingSubmissions ?? 0;

  const teamName = summary.team?.name || "Your Team";
  const initials =
    teamName
      .split(/\s+/)
      .filter(Boolean)
      .map((w: string) => w[0])
      .slice(0, 2)
      .join("")
      .toUpperCase() || "T";

  // ── Performance Overview KPIs (unified neutral treatment, segmented bar) ───
  const kpis: {
    label: string;
    value: React.ReactNode;
    sub: string;
    icon: React.ComponentType<{ className?: string }>;
    href: string;
  }[] = [
    {
      label: "Verified revenue",
      value: formatINR(summary.totalRevenue),
      sub: "Counts toward Demo Day",
      icon: Wallet,
      href: "/demo-day",
    },
    {
      label: "Order book",
      value: formatINR(summary.totalOrderBook),
      sub: "Committed pipeline",
      icon: Briefcase,
      href: "/projects",
    },
    {
      label: "National rank",
      // While ranks are hidden from students, don't leak the rank here —
      // show a small "revealing soon" note with the admin's reveal time.
      value: rankHidden ? <RankHiddenValue /> : `#${summary.nationalRank || "—"}`,
      sub: rankHidden ? revealText : "All campuses",
      icon: Trophy,
      href: "/leaderboard",
    },
    {
      label: "Campus rank",
      value: rankHidden ? <RankHiddenValue /> : `#${summary.campusRank || "—"}`,
      sub: rankHidden
        ? revealText
        : summary.team?.campusName || "Your campus",
      icon: Building2,
      href: "/leaderboard",
    },
  ];

  return (
    <>
      <AutoIntroVideo />
      <TeamNameDuplicatePopup />
      <div className="space-y-5 animate-in fade-in slide-in-from-bottom-4 duration-500">
        <PinnedAnnouncementBanner />
        <SubmitAsapBanner />

        {/* ===================== COMMAND HEADER ===================== */}
        <header className={cn(PANEL, "overflow-hidden")}>
          <div className="grid gap-4 p-5 lg:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] lg:items-center">
            {/* Team identity */}
            <Link
              href="/team"
              className="group flex min-w-0 items-center gap-3.5 rounded-xl -m-1 p-1 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              data-testid="link-team-header"
            >
              <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-primary/10 text-base font-bold tracking-tight text-primary ring-1 ring-inset ring-primary/15">
                {initials}
              </span>
              <span className="min-w-0">
                <span className="flex items-center gap-1.5">
                  <h1 className="truncate text-xl font-bold tracking-tight text-foreground">
                    {teamName}
                  </h1>
                  <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
                </span>
                <p className="mt-0.5 flex items-center gap-1.5 truncate text-xs text-muted-foreground">
                  <Building2 className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">
                    {summary.team?.campusName || "Your campus"}
                  </span>
                  <span aria-hidden className="text-muted-foreground/40">
                    ·
                  </span>
                  <span className="truncate">
                    {summary.team?.tagline || "No tagline set"}
                  </span>
                </p>
              </span>
            </Link>

            {/* Weekly Journal — shared top-middle strip */}
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

            {/* Status + global actions */}
            <div className="flex shrink-0 items-center justify-start gap-2 lg:justify-end">
              {summary.demoEligible && (
                <Badge
                  variant="default"
                  className="gap-1.5 border-none bg-emerald-600 px-3 py-1.5 text-xs text-white hover:bg-emerald-600"
                >
                  <CheckCircle className="h-3.5 w-3.5" />
                  Demo Day Eligible
                </Badge>
              )}
              <HelpMenu inline />
              <NotificationsBell />
            </div>
          </div>
        </header>

        {/* ============ PERFORMANCE OVERVIEW — segmented stat bar ============ */}
        <section>
          <div className="mb-3 flex items-center justify-between">
            <SectionLabel>Performance overview</SectionLabel>
            <Link
              href="/leaderboard"
              className="text-xs font-medium text-muted-foreground hover:text-foreground"
            >
              View leaderboard
            </Link>
          </div>
          <div
            className={cn(
              PANEL,
              "grid grid-cols-2 gap-px overflow-hidden bg-border lg:grid-cols-4",
            )}
          >
            {kpis.map((k) => {
              const Icon = k.icon;
              return (
                <Link
                  key={k.label}
                  href={k.href}
                  className="group relative flex flex-col bg-card p-5 transition-colors hover:bg-muted/30 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                  data-testid={`kpi-${k.label.toLowerCase().replace(/\s+/g, "-")}`}
                >
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                      <Icon className="h-4 w-4" />
                      {k.label}
                    </span>
                    <ArrowUpRight className="h-4 w-4 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
                  </div>
                  <div className="mt-4 text-[1.7rem] font-bold leading-none tracking-tight tabular-nums">
                    {k.value}
                  </div>
                  <div className="mt-2 truncate text-xs text-muted-foreground/80">
                    {k.sub}
                  </div>
                </Link>
              );
            })}
          </div>
        </section>

        {/* ===================== GRIT MILES HERO ===================== */}
        <section className={cn(PANEL, "overflow-hidden")}>
          <div className="flex items-center justify-between px-6 pt-5">
            <div className="flex items-center gap-2">
              <Award className="h-4 w-4 text-primary" />
              <SectionLabel>GRIT Miles journey</SectionLabel>
            </div>
            <Link
              href="/demo-day"
              className="flex items-center gap-1 text-xs font-medium text-primary hover:underline"
              data-testid="rail-grit-cta"
            >
              View GRIT Miles
              <ChevronRight className="h-3.5 w-3.5" />
            </Link>
          </div>

          <div className="flex flex-col items-center gap-8 px-8 py-8 lg:flex-row lg:items-center lg:gap-14">
            {/* Radial focal point */}
            <div className="flex flex-col items-center gap-3">
              <RadialProgress value={nextMilestonePercent}>
                <div
                  className="text-5xl font-bold leading-none tabular-nums tracking-tight"
                  data-testid="rail-grit-miles"
                >
                  {grit.milesUnlocked.toLocaleString("en-IN")}
                </div>
                <div className="mt-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                  GRIT Miles
                </div>
              </RadialProgress>
              <Badge
                className={cn(
                  "gap-1.5",
                  grit.currentLevel > 0
                    ? "bg-amber-100 text-amber-700 hover:bg-amber-100"
                    : TONE_BADGE.muted,
                )}
              >
                {grit.currentLevel > 0
                  ? `Level ${grit.currentLevel} reached`
                  : "Reach Level 1 to start"}
              </Badge>
            </div>

            {/* Ladder rail + readouts */}
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-end justify-between gap-4">
                <div>
                  <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                    Verified revenue
                  </div>
                  <div className="mt-1 text-2xl font-bold tabular-nums tracking-tight">
                    {formatINR(summary.totalRevenue)}
                  </div>
                </div>
                <div className="flex items-center gap-2 rounded-lg border bg-muted/30 px-3 py-2">
                  <Target className="h-4 w-4 text-primary" />
                  <div className="text-xs">
                    {grit.nextLevel ? (
                      <>
                        <span className="font-semibold tabular-nums">
                          {formatINR(grit.revenueToNext)}
                        </span>
                        <span className="text-muted-foreground">
                          {" "}
                          to Level {grit.nextLevel.level}
                        </span>
                      </>
                    ) : (
                      <span className="font-semibold text-emerald-600">
                        All levels unlocked 🎉
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Horizontal ladder */}
              <div className="relative mt-8 px-3">
                <div className="absolute left-3 right-3 top-3.5 h-1.5 -translate-y-1/2 rounded-full bg-muted" />
                <div
                  className="absolute left-3 top-3.5 h-1.5 -translate-y-1/2 rounded-full bg-primary transition-all duration-700 ease-out"
                  style={{ width: `calc(${ladderPercent}% - 1.5rem)` }}
                />
                <div className="relative flex justify-between">
                  {levels.map((l) => {
                    const reached = summary.totalRevenue >= l.revenueTarget;
                    const isNext = grit.nextLevel?.level === l.level;
                    return (
                      <div
                        key={l.level}
                        className="flex flex-col items-center gap-2 text-center"
                      >
                        <span
                          className={cn(
                            "grid h-7 w-7 place-items-center rounded-full ring-4 ring-card transition-colors",
                            reached
                              ? "bg-primary"
                              : isNext
                                ? "bg-card outline outline-2 outline-primary"
                                : "bg-muted-foreground/25",
                          )}
                        >
                          {reached && (
                            <CheckCircle className="h-4 w-4 text-primary-foreground" />
                          )}
                          {!reached && !isNext && (
                            <Lock className="h-3 w-3 text-card" />
                          )}
                        </span>
                        <span
                          className={cn(
                            "text-[11px] tabular-nums",
                            reached
                              ? "font-semibold text-foreground"
                              : isNext
                                ? "font-semibold text-primary"
                                : "text-muted-foreground",
                          )}
                        >
                          {formatINR(l.revenueTarget)}
                        </span>
                        <span className="text-[10px] text-muted-foreground">
                          {l.miles} mi
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>

          {/* Snapshot metrics */}
          <div className="grid grid-cols-2 gap-px border-t bg-border sm:grid-cols-4">
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
                {
                  label: "Current level",
                  value: grit.currentLevel > 0 ? `L${grit.currentLevel}` : "—",
                },
                {
                  label: "Miles unlocked",
                  value: grit.milesUnlocked.toLocaleString("en-IN"),
                },
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

        {/* ============ WORKSPACE: progress center + action rail ============ */}
        <div className="grid gap-5 lg:grid-cols-[1fr_340px] lg:items-start">
          {/* Left column — progress center + support */}
          <div className="min-w-0 space-y-5">
            {/* Progress center */}
            <section className={cn(PANEL, "overflow-hidden")}>
              <div className="flex items-center justify-between px-5 py-4">
                <SectionLabel>Progress center</SectionLabel>
                <Link
                  href="/journal"
                  className="text-xs font-medium text-primary hover:underline"
                >
                  Open journal
                </Link>
              </div>
              <div className="grid grid-cols-1 gap-px border-t bg-border sm:grid-cols-2">
                {/* Journal this week */}
                <div className="bg-card p-5">
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
                    className="mt-3 h-1.5"
                  />
                  <p className="mt-2 text-xs text-muted-foreground">
                    {progress?.journal?.weekNumber != null
                      ? `Week ${progress.journal.weekNumber}`
                      : "Submit a short 3-field journal to stay on track."}
                  </p>
                </div>

                {/* Next milestone */}
                <div className="bg-card p-5">
                  <div className="flex items-center justify-between text-sm">
                    <span className="flex items-center gap-2 text-muted-foreground">
                      <Award className="h-4 w-4" /> Next milestone
                    </span>
                    <span className="text-sm font-semibold tabular-nums">
                      {grit.nextLevel
                        ? `Level ${grit.nextLevel.level}`
                        : "Maxed"}
                    </span>
                  </div>
                  <Progress
                    value={nextMilestonePercent}
                    className="mt-3 h-1.5"
                  />
                  <p className="mt-2 text-xs text-muted-foreground">
                    {grit.nextLevel
                      ? `${formatINR(grit.revenueToNext)} more required to unlock ${grit.nextLevel.miles} GRIT Miles`
                      : "All GRIT levels unlocked 🎉"}
                  </p>
                </div>

                {/* Miles unlocked */}
                <div className="bg-card p-5">
                  <div className="flex items-center justify-between text-sm">
                    <span className="flex items-center gap-2 text-muted-foreground">
                      <Award className="h-4 w-4" /> Miles unlocked
                    </span>
                    <span className="text-sm font-semibold tabular-nums">
                      {grit.milesUnlocked.toLocaleString("en-IN")}
                    </span>
                  </div>
                  <p className="mt-3 text-xs text-muted-foreground">
                    {grit.currentLevel > 0
                      ? `You're at Level ${grit.currentLevel}.`
                      : "Reach Level 1 to start earning GRIT Miles."}
                  </p>
                </div>

                {/* Pending submissions */}
                <div className="bg-card p-5">
                  <div className="flex items-center justify-between text-sm">
                    <span className="flex items-center gap-2 text-muted-foreground">
                      <AlertCircle className="h-4 w-4" /> Pending submissions
                    </span>
                    <span className="text-sm font-semibold tabular-nums">
                      {pending}
                    </span>
                  </div>
                  <p className="mt-3 text-xs text-muted-foreground">
                    {pending > 0
                      ? "Awaiting admin review."
                      : "Nothing awaiting review."}
                  </p>
                </div>
              </div>
            </section>

            {/* Email / support — moved to the left column */}
            <SupportBanner />
          </div>

          {/* Action rail */}
          <aside className="space-y-5 self-start lg:sticky lg:top-4">
            {/* Programme end date + remaining-time countdown */}
            <ProgramCountdown />

            {/* This week's journal — primary action */}
            <section className={cn(PANEL, "p-5")}>
              <div className="flex items-center justify-between">
                <SectionLabel>This week's journal</SectionLabel>
                <Badge className={TONE_BADGE[journalTone]}>
                  {journalLabel}
                </Badge>
              </div>
              <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
                {submittedThisWeek
                  ? "You're up to date for this week. Review or refine your entry anytime."
                  : "A quick 3-field entry keeps your team eligible for Demo Day."}
              </p>
              <Link
                href="/journal"
                className={cn(
                  "mt-4 flex items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors",
                  submittedThisWeek
                    ? "border hover:bg-muted/40"
                    : "bg-primary text-primary-foreground hover:bg-primary/90",
                )}
                data-testid="rail-journal-cta"
              >
                {submittedThisWeek ? "View / edit journal" : "Submit this week"}
                <ChevronRight className="h-4 w-4" />
              </Link>
            </section>

            {/* Next milestone summary */}
            <section className={cn(PANEL, "p-5")}>
              <SectionLabel>Next milestone</SectionLabel>
              <div className="mt-4 flex items-center gap-3">
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
                  <Target className="h-5 w-5" />
                </span>
                <div className="min-w-0">
                  <div className="text-sm font-semibold">
                    {grit.nextLevel
                      ? `Level ${grit.nextLevel.level} · ${grit.nextLevel.miles} mi`
                      : "Top level reached"}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {grit.nextLevel
                      ? `${formatINR(grit.revenueToNext)} to go`
                      : "Every reward unlocked 🎉"}
                  </div>
                </div>
              </div>
              <Progress value={nextMilestonePercent} className="mt-4 h-1.5" />
              <div className="mt-2 flex items-center justify-between text-[11px] text-muted-foreground">
                <span>{formatINR(prevTarget)}</span>
                <span className="tabular-nums">
                  {Math.round(nextMilestonePercent)}%
                </span>
                <span>
                  {grit.nextLevel
                    ? formatINR(grit.nextLevel.revenueTarget)
                    : formatINR(topTarget)}
                </span>
              </div>
            </section>

            {/* Social — fills the right-rail gap */}
            <InstagramLink />
          </aside>
        </div>
      </div>
    </>
  );
}
