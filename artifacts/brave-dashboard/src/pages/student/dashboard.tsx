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
  Flag,
} from "lucide-react";
import { NotificationsBell } from "@/components/notifications-bell";
import { HelpMenu } from "@/components/help-menu";
import { PinnedAnnouncementBanner } from "@/components/pinned-announcement-banner";
import { SupportBanner } from "@/components/support-banner";
import { AutoIntroVideo } from "@/components/intro-video-dialog";
import { JournalWeekTracker } from "@/components/journal-week-tracker";

// ── Design system helpers ───────────────────────────────────────────────────
// Flat, enterprise SaaS surfaces (border + card bg, no shadows/gradients).
// Premium feel comes from precise spacing, typography and alignment — not color.
const PANEL = "rounded-xl border bg-card";

// Level-1 workspace section label.
function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
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
// Small status dot that mirrors the tone, used in the weekly-journal strip.
const TONE_DOT: Record<Tone, string> = {
  good: "bg-emerald-500",
  warn: "bg-amber-500",
  bad: "bg-red-500",
  muted: "bg-muted-foreground/40",
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

  // Team monogram (premium identity tile) — derived only, no data change.
  const teamName = summary.team?.name || "Your Team";
  const initials =
    teamName
      .split(/\s+/)
      .filter(Boolean)
      .map((w) => w[0])
      .slice(0, 2)
      .join("")
      .toUpperCase() || "T";

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
      <div className="space-y-5 animate-in fade-in slide-in-from-bottom-4 duration-500">
        <PinnedAnnouncementBanner />

        {/* ===================== COMMAND HEADER ===================== */}
        <header className={cn(PANEL, "overflow-hidden")}>
          <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
            {/* Team identity */}
            <Link
              href="/team"
              className="group flex min-w-0 items-center gap-4 rounded-lg -m-1 p-1 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              data-testid="link-team-header"
            >
              <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-primary/10 text-base font-bold tracking-tight text-primary ring-1 ring-inset ring-primary/15">
                {initials}
              </span>
              <span className="min-w-0">
                <span className="flex items-center gap-2">
                  <h1 className="truncate text-2xl font-bold tracking-tight text-foreground">
                    {teamName}
                  </h1>
                  <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
                </span>
                <p className="mt-0.5 flex items-center gap-2 truncate text-sm text-muted-foreground">
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

            {/* Status + global actions */}
            <div className="flex shrink-0 items-center gap-2 self-start sm:self-center">
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

          {/* Weekly journal timeline — full-width strip inside the header band */}
          <div className="border-t bg-muted/20 px-5 py-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex items-center gap-2">
                <span className="flex items-center gap-2">
                  <span
                    className={cn(
                      "h-1.5 w-1.5 rounded-full",
                      TONE_DOT[journalTone],
                    )}
                  />
                  <SectionLabel>Weekly journal</SectionLabel>
                </span>
                <Badge
                  className={cn("ml-1 text-[10px]", TONE_BADGE[journalTone])}
                >
                  {journalLabel}
                </Badge>
              </div>
              <div className="min-w-0 flex-1 lg:px-6">
                <JournalWeekTracker />
              </div>
              <Link
                href="/journal"
                className="hidden shrink-0 items-center gap-1 text-xs font-medium text-primary hover:underline lg:flex"
              >
                Open journal
                <ChevronRight className="h-3.5 w-3.5" />
              </Link>
            </div>
          </div>
        </header>

        {/* ============ SECTION 1 — PERFORMANCE OVERVIEW ============ */}
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
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {kpis.map((k) => {
              const Icon = k.icon;
              return (
                <Link
                  key={k.label}
                  href={k.href}
                  className={cn(
                    PANEL,
                    "group relative flex flex-col p-4 transition-colors hover:border-primary/30 hover:bg-muted/30 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  )}
                  data-testid={`kpi-${k.label.toLowerCase().replace(/\s+/g, "-")}`}
                >
                  <div className="flex items-start justify-between">
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
                  <div className="mt-4 text-2xl font-bold leading-none tracking-tight tabular-nums">
                    {k.value}
                  </div>
                  <div className="mt-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    {k.label}
                  </div>
                  <div className="mt-0.5 truncate text-xs text-muted-foreground/80">
                    {k.sub}
                  </div>
                </Link>
              );
            })}
          </div>
        </section>

        {/* ============ MAIN WORKSPACE (left flow + right GRIT rail) ============ */}
        <div className="grid gap-5 lg:grid-cols-[1fr_340px] lg:items-start">
          {/* ---------- LEFT: primary workspace ---------- */}
          <div className="min-w-0 space-y-5">
            {/* SECTION 2 — PROGRESS CENTER */}
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
              {/* Connected metric grid — Stripe/Vercel-style segmented surface */}
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

                {/* Next milestone progress */}
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

            {/* SECTION 3 — GRIT MILES LADDER (hero visualization) */}
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

              <div className="mt-4 flex items-end justify-between">
                <div>
                  <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                    Verified revenue
                  </div>
                  <div className="mt-1 text-2xl font-bold tabular-nums tracking-tight">
                    {formatINR(summary.totalRevenue)}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                    Current level
                  </div>
                  <div className="mt-1 text-2xl font-bold tabular-nums tracking-tight">
                    {grit.currentLevel > 0 ? `L${grit.currentLevel}` : "—"}
                  </div>
                </div>
              </div>

              {/* Track + nodes */}
              <div className="relative mt-7 px-1">
                {/* base rail */}
                <div className="absolute left-1 right-1 top-1.5 h-1 -translate-y-1/2 rounded-full bg-muted" />
                {/* filled rail */}
                <div
                  className="absolute left-1 top-1.5 h-1 -translate-y-1/2 rounded-full bg-primary transition-all duration-700"
                  style={{ width: `calc(${ladderPercent}% - 0.5rem)` }}
                />
                <div className="relative flex justify-between">
                  {levels.map((l) => {
                    const reached = summary.totalRevenue >= l.revenueTarget;
                    const isNext = grit.nextLevel?.level === l.level;
                    return (
                      <div
                        key={l.level}
                        className="flex flex-col items-center gap-1.5 text-center"
                      >
                        <span
                          className={cn(
                            "grid h-3.5 w-3.5 place-items-center rounded-full ring-2 ring-card transition-colors",
                            reached
                              ? "bg-primary"
                              : isNext
                                ? "bg-card ring-primary"
                                : "bg-muted-foreground/25",
                          )}
                        />
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

              {/* Snapshot metrics — verified revenue, order book, level, miles */}
              <div className="mt-7 grid grid-cols-2 gap-px overflow-hidden rounded-lg border bg-border sm:grid-cols-4">
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
          <aside className="space-y-5 self-start lg:sticky lg:top-4">
            {/* GRIT Miles summary — rail hero */}
            <section className={cn(PANEL, "overflow-hidden")}>
              <div className="flex items-center justify-between px-5 pt-5">
                <SectionLabel>GRIT Miles</SectionLabel>
                {grit.currentLevel > 0 && (
                  <Badge className="bg-amber-100 text-amber-700 hover:bg-amber-100">
                    Level {grit.currentLevel}
                  </Badge>
                )}
              </div>

              <div className="px-5 pt-4">
                <div className="flex items-center gap-4">
                  <span className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-amber-100 text-amber-600">
                    <Award className="h-6 w-6" />
                  </span>
                  <div className="min-w-0">
                    <div
                      className="text-3xl font-bold leading-none tabular-nums tracking-tight"
                      data-testid="rail-grit-miles"
                    >
                      {grit.milesUnlocked.toLocaleString("en-IN")}
                    </div>
                    <div className="mt-1.5 text-xs text-muted-foreground">
                      Miles unlocked
                    </div>
                  </div>
                </div>

                <div className="mt-5">
                  <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                    <span className="flex items-center gap-1.5">
                      <Flag className="h-3 w-3" />
                      {grit.nextLevel
                        ? `Next · Level ${grit.nextLevel.level}`
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
                    className="mt-2 h-1.5"
                  />
                  <p className="mt-2.5 text-xs leading-relaxed text-muted-foreground">
                    {grit.nextLevel
                      ? `${formatINR(grit.revenueToNext)} more required to unlock ${grit.nextLevel.miles} GRIT Miles.`
                      : "You've unlocked every GRIT Miles reward 🎉"}
                  </p>
                </div>
              </div>

              <Link
                href="/demo-day"
                className="mt-5 flex items-center justify-between gap-2 border-t px-5 py-3.5 text-sm font-medium transition-colors hover:bg-muted/40"
                data-testid="rail-grit-cta"
              >
                View GRIT Miles
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
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
              <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
                {submittedThisWeek
                  ? "You're up to date for this week. Review or refine your entry anytime."
                  : "A quick 3-field entry keeps your team eligible for Demo Day."}
              </p>
              <Link
                href="/journal"
                className={cn(
                  "mt-4 flex items-center justify-center gap-2 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
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
