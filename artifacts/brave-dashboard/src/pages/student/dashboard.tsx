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
} from "lucide-react";
import { NotificationsBell } from "@/components/notifications-bell";
import { HelpMenu } from "@/components/help-menu";
import { PinnedAnnouncementBanner } from "@/components/pinned-announcement-banner";
import { SupportBanner } from "@/components/support-banner";
import { AutoIntroVideo } from "@/components/intro-video-dialog";
import { JournalWeekTracker } from "@/components/journal-week-tracker";

// ── Design system helpers ───────────────────────────────────────────────────
// Flat, enterprise SaaS surfaces (border + card bg, no shadows/gradients).
const PANEL = "rounded-xl border bg-card";

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

export default function TeamDashboard() {
  const { data: summary, isLoading } = useGetTeamDashboardSummary();
  // Journal status (current-week submission + pending count source).
  const { data: progress } = useQuery({
    queryKey: ["progress-summary"],
    queryFn: getProgressSummary,
  });
  // GRIT Miles ladder (admin-configurable).
  const { data: gritConfig } = useQuery({
    queryKey: ["student-grit-config"],
    queryFn: getStudentGritConfig,
  });

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

  // Progress toward the *next* level only (for the Next-Milestone bar).
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

  // ── Performance Overview KPI cards (Demo Day "to goal" card removed) ──────
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
      value: `#${summary.nationalRank || "—"}`,
      sub: "All campuses",
      icon: Trophy,
      href: "/leaderboard",
      accent: "text-amber-600 bg-amber-50",
    },
    {
      label: "Campus rank",
      value: `#${summary.campusRank || "—"}`,
      sub: summary.team?.campusName || "Your campus",
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

        {/* ===================== HEADER ===================== */}
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <Link
            href="/team"
            className="block rounded-md -mx-2 px-2 py-1 hover-elevate active-elevate-2 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-ring shrink-0"
            data-testid="link-team-header"
          >
            <h1 className="text-3xl font-bold tracking-tight text-foreground">
              {summary.team?.name || "Your Team"}
            </h1>
            <p className="text-muted-foreground">
              {summary.team?.tagline || "No tagline set"}
            </p>
          </Link>

          {/* Week-wise journal tracker — between team name and the right actions */}
          <div className="min-w-0 flex-1 lg:px-4">
            <JournalWeekTracker />
          </div>

          <div className="flex items-center gap-3 shrink-0 self-start justify-end">
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

        {/* ============ MAIN WORKSPACE (left flow + right GRIT rail) ============ */}
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
                    {progress?.journal?.weekStart && progress?.journal?.weekEnd
                      ? `${progress.journal.weekStart} → ${progress.journal.weekEnd}`
                      : "Submit a short 3-field journal to stay on track."}
                  </p>
                </div>

                {/* Next milestone progress */}
                <div>
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
                    className="mt-2 h-1.5"
                  />
                  <p className="mt-1.5 text-xs text-muted-foreground">
                    {grit.nextLevel
                      ? `${formatINR(grit.revenueToNext)} more required to unlock ${grit.nextLevel.miles} GRIT Miles`
                      : "All GRIT levels unlocked 🎉"}
                  </p>
                </div>

                {/* Miles unlocked */}
                <div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="flex items-center gap-2 text-muted-foreground">
                      <Award className="h-4 w-4" /> Miles unlocked
                    </span>
                    <span className="text-sm font-semibold tabular-nums">
                      {grit.milesUnlocked.toLocaleString("en-IN")}
                    </span>
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">
                    {grit.currentLevel > 0
                      ? `You're at Level ${grit.currentLevel}.`
                      : "Reach Level 1 to start earning GRIT Miles."}
                  </p>
                </div>

                {/* Pending submissions */}
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
              </div>
            </section>

            {/* SECTION 3 — GRIT MILES LADDER */}
            <section className={cn(PANEL, "p-5")}>
              <div className="flex items-center justify-between">
                <SectionLabel>GRIT Miles ladder</SectionLabel>
                <Link
                  href="/demo-day"
                  className="text-xs font-medium text-primary hover:underline"
                >
                  GRIT Miles
                </Link>
              </div>

              <div className="mt-4">
                <div className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-2 text-muted-foreground">
                    <Award className="h-4 w-4" /> Verified revenue
                  </span>
                  <span className="font-semibold tabular-nums">
                    {formatINR(summary.totalRevenue)}
                  </span>
                </div>
                <div className="relative mt-4">
                  <Progress value={ladderPercent} className="h-2" />
                  <div className="mt-2 flex justify-between">
                    {levels.map((l) => {
                      const reached = summary.totalRevenue >= l.revenueTarget;
                      return (
                        <div
                          key={l.level}
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

              {/* Snapshot metrics — verified revenue, order book, level, miles */}
              <div className="mt-5 grid grid-cols-2 gap-px overflow-hidden rounded-lg border bg-border sm:grid-cols-4">
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
                      value:
                        grit.currentLevel > 0 ? `L${grit.currentLevel}` : "—",
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

            {/* Support banner — kept within the left column only */}
            <SupportBanner />
          </div>

          {/* ---------- RIGHT: GRIT Miles rail ---------- */}
          <aside className="space-y-4 lg:sticky lg:top-4 self-start">
            {/* GRIT Miles summary */}
            <section className={cn(PANEL, "p-5")}>
              <SectionLabel>GRIT Miles</SectionLabel>
              <div className="mt-4 flex items-center gap-4">
                <span className="grid h-14 w-14 shrink-0 place-items-center rounded-full bg-amber-100 text-amber-600">
                  <Award className="h-6 w-6" />
                </span>
                <div>
                  <div
                    className="text-3xl font-bold tabular-nums leading-none"
                    data-testid="rail-grit-miles"
                  >
                    {grit.milesUnlocked.toLocaleString("en-IN")}
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    Miles unlocked
                    {grit.currentLevel > 0
                      ? ` · Level ${grit.currentLevel}`
                      : ""}
                  </div>
                </div>
              </div>
              <div className="mt-4">
                <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                  <span>
                    {grit.nextLevel
                      ? `Next: Level ${grit.nextLevel.level}`
                      : "Top level reached"}
                  </span>
                  {grit.nextLevel && (
                    <span className="tabular-nums">
                      {grit.nextLevel.miles} mi
                    </span>
                  )}
                </div>
                <Progress
                  value={nextMilestonePercent}
                  className="mt-1.5 h-1.5"
                />
              </div>
              <p className="mt-3 text-xs text-muted-foreground">
                {grit.nextLevel
                  ? `${formatINR(grit.revenueToNext)} more required to unlock ${grit.nextLevel.miles} GRIT Miles.`
                  : "You've unlocked every GRIT Miles reward 🎉"}
              </p>
              <Link
                href="/demo-day"
                className="mt-4 flex items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition-colors hover:bg-muted/40"
                data-testid="rail-grit-cta"
              >
                View GRIT Miles
                <ChevronRight className="h-4 w-4" />
              </Link>
            </section>

            {/* This week's journal CTA */}
            <section className={cn(PANEL, "p-5")}>
              <div className="flex items-center justify-between">
                <SectionLabel>This week's journal</SectionLabel>
                <Badge className={TONE_BADGE[journalTone]}>
                  {journalLabel}
                </Badge>
              </div>
              <Link
                href="/journal"
                className={cn(
                  "mt-4 flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
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
          </aside>
        </div>
      </div>
    </>
  );
}
