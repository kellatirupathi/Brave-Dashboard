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
  FileText,
  CheckCircle,
  AlertCircle,
  Bell,
  BookOpenCheck,
  Flame,
  ChevronRight,
  Users,
  FolderKanban,
  Sparkles,
  Target,
  ClipboardList,
  CalendarDays,
} from "lucide-react";
import { NotificationsBell } from "@/components/notifications-bell";
import { HelpMenu } from "@/components/help-menu";
import { PinnedAnnouncementBanner } from "@/components/pinned-announcement-banner";
import { SupportBanner } from "@/components/support-banner";
import { AutoIntroVideo } from "@/components/intro-video-dialog";

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
const TONE_DOT: Record<Tone, string> = {
  good: "bg-emerald-500",
  warn: "bg-amber-500",
  bad: "bg-red-500",
  muted: "bg-muted-foreground/40",
};

export default function TeamDashboard() {
  const { data: summary, isLoading } = useGetTeamDashboardSummary();
  // Same data source the journal widgets already used — reused here so the
  // journal status / streak / consistency features are preserved, just
  // re-laid-out into the new workspace.
  const { data: progress } = useQuery({
    queryKey: ["progress-summary"],
    queryFn: getProgressSummary,
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

  const demoDayThreshold = 200000;
  const progressPercent = Math.min(
    (summary.totalRevenue / demoDayThreshold) * 100,
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

  // Derived "smart reminders" — all from existing data, no new sources.
  const reminders: {
    tone: Tone;
    label: string;
    href: string;
  }[] = [];
  if (!submittedThisWeek)
    reminders.push({
      tone: "warn",
      label: "Submit this week's journal",
      href: "/journal",
    });
  if (pending > 0)
    reminders.push({
      tone: "warn",
      label: `${pending} submission${pending === 1 ? "" : "s"} awaiting review`,
      href: "/projects",
    });
  if (!summary.demoEligible)
    reminders.push({
      tone: "muted",
      label: `${progressPercent.toFixed(0)}% toward Demo Day goal`,
      href: "/demo-day",
    });

  // Suggested next action (Section 5) — derived.
  const nextAction = !submittedThisWeek
    ? { label: "Submit your weekly journal", href: "/journal" }
    : pending > 0
      ? { label: "Review your pending submissions", href: "/projects" }
      : !summary.demoEligible
        ? {
            label: "Log a new revenue entry to climb toward Demo Day",
            href: "/projects",
          }
        : { label: "Apply for Demo Day", href: "/demo-day" };

  // ── Daily Focus Bar block ──────────────────────────────────────────────
  const focusBlocks: {
    label: string;
    value: React.ReactNode;
    sub?: string;
    tone?: Tone;
    href: string;
    icon: React.ComponentType<{ className?: string }>;
  }[] = [
    {
      label: "Journal",
      value: journalLabel,
      sub: "This week",
      tone: journalTone,
      href: "/journal",
      icon: BookOpenCheck,
    },
    {
      label: "Pending actions",
      value: pending,
      sub: "Awaiting review",
      tone: pending > 0 ? "warn" : "good",
      href: "/projects",
      icon: AlertCircle,
    },
    {
      label: "Active projects",
      value: activeProjects,
      sub: "Running now",
      href: "/projects",
      icon: FolderKanban,
    },
    {
      label: "National rank",
      value: `#${summary.nationalRank || "—"}`,
      sub: "All campuses",
      href: "/leaderboard",
      icon: Trophy,
    },
    {
      label: "Demo Day",
      value: `${progressPercent.toFixed(0)}%`,
      sub: summary.demoEligible ? "Eligible" : "To goal",
      tone: summary.demoEligible ? "good" : undefined,
      href: "/demo-day",
      icon: Target,
    },
  ];

  return (
    <>
      <AutoIntroVideo />
      <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
        <PinnedAnnouncementBanner />

        {/* ===================== HEADER (unchanged) ===================== */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
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
          <div className="flex items-center gap-3 self-stretch sm:self-auto justify-end">
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

        {/* ============ SECTION 1 — DAILY FOCUS BAR ============ */}
        <div
          className={cn(
            PANEL,
            "grid grid-cols-2 divide-x divide-y sm:grid-cols-3 lg:grid-cols-5 lg:divide-y-0 overflow-hidden",
          )}
        >
          {focusBlocks.map((b) => {
            const Icon = b.icon;
            return (
              <Link
                key={b.label}
                href={b.href}
                className="group flex items-center gap-3 p-4 hover:bg-muted/40 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
                data-testid={`focus-${b.label.toLowerCase().replace(/\s+/g, "-")}`}
              >
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground group-hover:text-foreground">
                  <Icon className="h-4 w-4" />
                </span>
                <span className="min-w-0">
                  <span className="block text-[11px] uppercase tracking-wide text-muted-foreground">
                    {b.label}
                  </span>
                  <span className="flex items-center gap-1.5">
                    {b.tone && (
                      <span
                        className={cn(
                          "inline-block h-1.5 w-1.5 rounded-full",
                          TONE_DOT[b.tone],
                        )}
                      />
                    )}
                    <span className="text-sm font-semibold tabular-nums truncate">
                      {b.value}
                    </span>
                  </span>
                  {b.sub && (
                    <span className="block text-[11px] text-muted-foreground truncate">
                      {b.sub}
                    </span>
                  )}
                </span>
              </Link>
            );
          })}
        </div>

        {/* ============ SECTION 2 — MAIN WORKSPACE (70/30) ============ */}
        <div className="grid gap-6 lg:grid-cols-[7fr_3fr] lg:items-start">
          {/* ---------- LEFT: primary workspace ---------- */}
          <div className="space-y-6 min-w-0">
            {/* Weekly Progress Overview */}
            <section className={cn(PANEL, "p-5")}>
              <div className="flex items-center justify-between">
                <SectionLabel>Weekly progress overview</SectionLabel>
                <Link
                  href="/journal"
                  className="text-xs text-primary hover:underline"
                >
                  Open journal
                </Link>
              </div>
              <div className="mt-4 grid gap-x-8 gap-y-5 sm:grid-cols-2">
                {/* Journal completion */}
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

                {/* Journal streak / consistency */}
                <div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="flex items-center gap-2 text-muted-foreground">
                      <Flame className="h-4 w-4" /> Journal streak
                    </span>
                    <span className="text-sm font-semibold tabular-nums">
                      {streak} week{streak === 1 ? "" : "s"}
                    </span>
                  </div>
                  <Progress
                    value={Math.min(streak * 25, 100)}
                    className="mt-2 h-1.5"
                  />
                  <p className="mt-1.5 text-xs text-muted-foreground">
                    {totalJournals} journal{totalJournals === 1 ? "" : "s"}{" "}
                    submitted in total
                  </p>
                </div>

                {/* Submission progress */}
                <div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="flex items-center gap-2 text-muted-foreground">
                      <ClipboardList className="h-4 w-4" /> Pending submissions
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
                    {formatINR(summary.totalRevenue)} verified
                  </p>
                </div>
              </div>
            </section>

            {/* Announcements feed */}
            <section className={cn(PANEL, "p-5")}>
              <div className="flex items-center justify-between">
                <SectionLabel>Announcements</SectionLabel>
                <Link
                  href="/notifications"
                  className="text-xs text-primary hover:underline"
                >
                  View all
                </Link>
              </div>
              {summary.announcements.length > 0 ? (
                <ul className="mt-3 divide-y">
                  {summary.announcements.slice(0, 5).map((announcement) => (
                    <li key={announcement.id}>
                      <Link
                        href="/notifications"
                        className="flex gap-3 py-3 -mx-2 px-2 rounded-md hover:bg-muted/40 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        data-testid={`link-announcement-${announcement.id}`}
                      >
                        <Bell className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                        <div className="min-w-0">
                          <h4 className="text-sm font-semibold">
                            {announcement.title}
                          </h4>
                          <p className="mt-0.5 text-sm text-muted-foreground line-clamp-2">
                            {announcement.body}
                          </p>
                        </div>
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="py-8 text-center text-sm text-muted-foreground">
                  No recent announcements
                </div>
              )}
            </section>
          </div>

          {/* ---------- RIGHT: sticky context rail ---------- */}
          <aside className="space-y-6 lg:sticky lg:top-4 self-start">
            {/* Quick actions */}
            <section className={cn(PANEL, "p-4")}>
              <SectionLabel>Quick actions</SectionLabel>
              <div className="mt-3 space-y-1">
                {(
                  [
                    {
                      label: "Submit journal",
                      href: "/journal",
                      icon: BookOpenCheck,
                    },
                    {
                      label: "Open projects",
                      href: "/projects",
                      icon: FolderKanban,
                    },
                    { label: "View team", href: "/team", icon: Users },
                    {
                      label: "Access resources",
                      href: "/resources",
                      icon: FileText,
                    },
                  ] as const
                ).map((a) => {
                  const Icon = a.icon;
                  return (
                    <Link
                      key={a.href}
                      href={a.href}
                      className="flex items-center gap-3 rounded-md px-2 py-2 text-sm hover:bg-muted/50 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      data-testid={`quick-${a.label.toLowerCase().replace(/\s+/g, "-")}`}
                    >
                      <Icon className="h-4 w-4 text-muted-foreground" />
                      <span className="flex-1">{a.label}</span>
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    </Link>
                  );
                })}
              </div>
            </section>

            {/* Performance snapshot — compact KPI rows */}
            <section className={cn(PANEL, "p-4")}>
              <SectionLabel>Performance snapshot</SectionLabel>
              <dl className="mt-3 divide-y text-sm">
                <Link
                  href="/leaderboard"
                  className="flex items-center justify-between py-2.5 -mx-2 px-2 rounded-md hover:bg-muted/40"
                  data-testid="snapshot-national-rank"
                >
                  <dt className="flex items-center gap-2 text-muted-foreground">
                    <Trophy className="h-4 w-4" /> National rank
                  </dt>
                  <dd className="font-semibold tabular-nums">
                    #{summary.nationalRank || "—"}
                  </dd>
                </Link>
                <Link
                  href="/leaderboard"
                  className="flex items-center justify-between py-2.5 -mx-2 px-2 rounded-md hover:bg-muted/40"
                  data-testid="snapshot-campus-rank"
                >
                  <dt className="flex items-center gap-2 text-muted-foreground">
                    <Building2 className="h-4 w-4" /> Campus rank
                  </dt>
                  <dd className="font-semibold tabular-nums">
                    #{summary.campusRank || "—"}
                  </dd>
                </Link>
                <Link
                  href="/demo-day"
                  className="flex items-center justify-between py-2.5 -mx-2 px-2 rounded-md hover:bg-muted/40"
                  data-testid="snapshot-revenue"
                >
                  <dt className="flex items-center gap-2 text-muted-foreground">
                    <Trophy className="h-4 w-4" /> Verified revenue
                  </dt>
                  <dd className="font-semibold tabular-nums">
                    {formatINR(summary.totalRevenue)}
                  </dd>
                </Link>
                <Link
                  href="/projects"
                  className="flex items-center justify-between py-2.5 -mx-2 px-2 rounded-md hover:bg-muted/40"
                  data-testid="snapshot-order-book"
                >
                  <dt className="flex items-center gap-2 text-muted-foreground">
                    <Briefcase className="h-4 w-4" /> Order book
                  </dt>
                  <dd className="font-semibold tabular-nums">
                    {formatINR(summary.totalOrderBook)}
                  </dd>
                </Link>
              </dl>
            </section>

            {/* Smart reminders */}
            <section className={cn(PANEL, "p-4")}>
              <SectionLabel>Smart reminders</SectionLabel>
              {reminders.length > 0 ? (
                <ul className="mt-3 space-y-1">
                  {reminders.map((r, i) => (
                    <li key={i}>
                      <Link
                        href={r.href}
                        className="flex items-center gap-2.5 rounded-md px-2 py-2 text-sm hover:bg-muted/50 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        <span
                          className={cn(
                            "inline-block h-1.5 w-1.5 shrink-0 rounded-full",
                            TONE_DOT[r.tone],
                          )}
                        />
                        <span className="flex-1">{r.label}</span>
                        <ChevronRight className="h-4 w-4 text-muted-foreground" />
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-3 text-sm text-muted-foreground">
                  You're all caught up. Nice.
                </p>
              )}
            </section>
          </aside>
        </div>

        {/* ============ SECTION 3 — PERFORMANCE ============ */}
        <section className={cn(PANEL, "p-5")}>
          <div className="flex items-center justify-between">
            <SectionLabel>Performance</SectionLabel>
            <Link
              href="/demo-day"
              className="text-xs text-primary hover:underline"
            >
              Demo Day
            </Link>
          </div>
          <div className="mt-4 space-y-1">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">
                Progress toward Demo Day goal
              </span>
              <span className="font-semibold tabular-nums">
                {formatINR(summary.totalRevenue)} · {progressPercent.toFixed(0)}
                %
              </span>
            </div>
            <Progress value={progressPercent} className="h-2" />
          </div>
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
                { label: "Journals submitted", value: String(totalJournals) },
                { label: "Journal streak", value: `${streak} wk` },
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

        {/* ============ SECTION 4 — PROJECT & EXECUTION ============ */}
        <section className={cn(PANEL, "overflow-hidden")}>
          <div className="flex items-center justify-between p-5 pb-3">
            <SectionLabel>Projects &amp; execution</SectionLabel>
            <Link
              href="/projects"
              className="text-xs text-primary hover:underline"
            >
              Open projects
            </Link>
          </div>
          <ul className="divide-y border-t">
            {(
              [
                {
                  icon: FolderKanban,
                  label: "Active projects",
                  desc: "Projects currently running",
                  value: activeProjects,
                  tone: "muted" as Tone,
                  href: "/projects",
                },
                {
                  icon: AlertCircle,
                  label: "Pending reviews",
                  desc: "Submissions awaiting admin verification",
                  value: pending,
                  tone: (pending > 0 ? "warn" : "good") as Tone,
                  href: "/projects",
                },
                {
                  icon: Users,
                  label: "Team",
                  desc: summary.team?.campusName
                    ? `${summary.team.name || "Your team"} · ${summary.team.campusName}`
                    : "Manage members & invite code",
                  value: null,
                  tone: "muted" as Tone,
                  href: "/team",
                },
              ] as const
            ).map((row) => {
              const Icon = row.icon;
              return (
                <li key={row.label}>
                  <Link
                    href={row.href}
                    className="flex items-center gap-4 px-5 py-3.5 hover:bg-muted/40 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
                    data-testid={`exec-${row.label.toLowerCase().replace(/\s+/g, "-")}`}
                  >
                    <Icon className="h-5 w-5 shrink-0 text-muted-foreground" />
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium">{row.label}</div>
                      <div className="truncate text-xs text-muted-foreground">
                        {row.desc}
                      </div>
                    </div>
                    {row.value !== null && (
                      <Badge className={TONE_BADGE[row.tone]}>
                        {row.value}
                      </Badge>
                    )}
                    <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>

        {/* ============ SECTION 5 — INSIGHTS & GUIDANCE ============ */}
        <div className="grid gap-6 md:grid-cols-3">
          <section className={cn(PANEL, "p-5")}>
            <div className="flex items-center gap-2">
              <Flame className="h-4 w-4 text-orange-500" />
              <SectionLabel>Streak insight</SectionLabel>
            </div>
            <p className="mt-3 text-sm text-muted-foreground">
              {streak === 0
                ? "Submit this week's journal to start a streak — consistency is what coordinators look for."
                : streak >= 4
                  ? `Strong ${streak}-week streak. Keep submitting every Sunday to hold it.`
                  : `You're on a ${streak}-week streak. Submit again this week to extend it.`}
            </p>
          </section>

          <section className={cn(PANEL, "p-5")}>
            <div className="flex items-center gap-2">
              <CalendarDays className="h-4 w-4 text-primary" />
              <SectionLabel>Demo Day readiness</SectionLabel>
            </div>
            <p className="mt-3 text-sm text-muted-foreground">
              {summary.demoEligible
                ? "Your team has crossed the Demo Day goal — make sure your application is in."
                : `You're at ${progressPercent.toFixed(0)}% of the Demo Day goal (${formatINR(summary.totalRevenue)} verified). Keep logging verified revenue to climb the leaderboard.`}
            </p>
          </section>

          <section className={cn(PANEL, "p-5")}>
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" />
              <SectionLabel>Suggested next action</SectionLabel>
            </div>
            <p className="mt-3 text-sm text-muted-foreground">
              {nextAction.label}.
            </p>
            <Link
              href={nextAction.href}
              className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
              data-testid="next-action-cta"
            >
              Go <ChevronRight className="h-4 w-4" />
            </Link>
          </section>
        </div>

        <SupportBanner />
      </div>
    </>
  );
}
