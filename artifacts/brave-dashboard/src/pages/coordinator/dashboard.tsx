import { useMemo, useState } from "react";
import {
  useGetDashboardSummary,
  useGetLeaderboard,
} from "@workspace/api-client-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { formatINR } from "@/lib/format";
import { Spinner } from "@/components/ui/spinner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Trophy,
  Users,
  AlertCircle,
  BookOpenCheck,
  Activity,
  Bell,
  Calendar,
  Megaphone,
  Briefcase,
  Building2,
  ArrowUpRight,
} from "lucide-react";
import { Link } from "wouter";
import { NotificationsBell } from "@/components/notifications-bell";
import { HelpMenu } from "@/components/help-menu";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import {
  getHeatmap,
  listAdminJournals,
  sendBulkHeatmapReminders,
  sendHeatmapReminder,
} from "@/lib/progress-api";

// ── Design system helpers ───────────────────────────────────────────────────
// Flat, enterprise SaaS surfaces. One confident focal point (the coverage
// ring), everything else calm and precisely aligned.
const PANEL = "rounded-2xl border bg-card";

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
      {children}
    </h2>
  );
}

// Circular progress ring (SVG, no deps). Colour-aware arc for coverage health.
function RadialProgress({
  value,
  size = 150,
  stroke = 13,
  arcClass = "text-primary",
  children,
}: {
  value: number;
  size?: number;
  stroke?: number;
  arcClass?: string;
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
          className={cn(arcClass, "transition-all duration-700 ease-out")}
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center text-center">
        {children}
      </div>
    </div>
  );
}

function relativeTime(iso: string): string {
  const d = new Date(iso).getTime();
  const diff = Date.now() - d;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "yesterday";
  if (days < 7) return `${days} days ago`;
  return new Date(iso).toLocaleDateString("en-IN", {
    month: "short",
    day: "2-digit",
  });
}

function truncate(s: string, n: number): string {
  if (s.length <= n) return s;
  return s.slice(0, n - 1).trimEnd() + "…";
}

export default function CoordinatorDashboard() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: summary, isLoading } = useGetDashboardSummary();
  const { data: leaderboard } = useGetLeaderboard();

  // Heatmap (last 8 weeks). Server scopes coordinator to their campus.
  const { data: heatmap } = useQuery({
    queryKey: ["coord-heatmap", 8],
    queryFn: () => getHeatmap({ weeksBack: 8 }),
  });

  // Recent journals from this campus.
  const { data: journals } = useQuery({
    queryKey: ["coord-recent-journals"],
    queryFn: () => listAdminJournals(),
  });

  const [bulkOpen, setBulkOpen] = useState(false);

  const remindMut = useMutation({
    mutationFn: sendHeatmapReminder,
    onSuccess: () => {
      toast({ title: "Reminder sent" });
      queryClient.invalidateQueries({ queryKey: ["coord-heatmap"] });
    },
    onError: (err: Error) => {
      toast({
        title: "Reminder failed",
        description: err.message,
        variant: "destructive",
      });
    },
  });

  const bulkRemindMut = useMutation({
    mutationFn: sendBulkHeatmapReminders,
    onSuccess: (r) => {
      toast({
        title: "Bulk reminder sent",
        description: `Pinged ${r.sentToTeams} team${r.sentToTeams === 1 ? "" : "s"} (${r.sentToUsers} member${r.sentToUsers === 1 ? "" : "s"}).`,
      });
      setBulkOpen(false);
      queryClient.invalidateQueries({ queryKey: ["coord-heatmap"] });
    },
    onError: (err: Error) => {
      toast({
        title: "Bulk reminder failed",
        description: err.message,
        variant: "destructive",
      });
      setBulkOpen(false);
    },
  });

  // Current-week journal coverage. The rightmost week in the heatmap is the
  // current/anchor week — count teams that have hasJournal=true for it.
  const coverage = useMemo(() => {
    if (!heatmap || heatmap.weeks.length === 0 || heatmap.teams.length === 0) {
      return null;
    }
    const currentWeek = heatmap.weeks[heatmap.weeks.length - 1];
    let submitted = 0;
    for (const t of heatmap.teams) {
      const w = t.weeks.find((x) => x.weekStartDate === currentWeek);
      if (w?.hasJournal) submitted += 1;
    }
    const total = heatmap.teams.length;
    const pct = total === 0 ? 0 : Math.round((submitted / total) * 100);
    return { currentWeek, submitted, total, pct };
  }, [heatmap]);

  // Teams flagged silent (>14d) or never logged — for bulk-remind target.
  const silentTeams = useMemo(() => {
    if (!heatmap) return [];
    return heatmap.teams.filter(
      (t) => t.status === "silent" || t.status === "never_logged",
    );
  }, [heatmap]);

  // Top 3 most-silent teams (by daysSinceLastJournal desc, then status priority).
  const topSilent = useMemo(() => {
    if (!heatmap) return [];
    const ranked = [...heatmap.teams].filter(
      (t) => t.status === "silent" || t.status === "never_logged",
    );
    ranked.sort((a, b) => {
      // never_logged ranks higher than silent
      const sa =
        a.status === "never_logged" ? 999999 : (a.daysSinceLastJournal ?? 0);
      const sb =
        b.status === "never_logged" ? 999999 : (b.daysSinceLastJournal ?? 0);
      return sb - sa;
    });
    return ranked.slice(0, 3);
  }, [heatmap]);

  // Latest 3 journals submitted in this campus.
  const recentJournals = useMemo(() => {
    if (!journals) return [];
    return [...journals]
      .sort(
        (a, b) =>
          new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime(),
      )
      .slice(0, 3);
  }, [journals]);

  // Demo Day pipeline: derived from leaderboard + summary.
  // We can show eligible count from summary, and names from leaderboard top.
  const demoEligibleCount = summary?.demoEligibleTeams ?? 0;

  if (isLoading)
    return (
      <div className="flex h-64 items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  if (!summary) return <div>Failed to load dashboard</div>;

  // Coverage health → arc + bar colour.
  const coverageArc = !coverage
    ? "text-muted-foreground"
    : coverage.pct >= 80
      ? "text-emerald-500"
      : coverage.pct >= 50
        ? "text-amber-500"
        : "text-red-500";
  const coverageBar = !coverage
    ? "bg-muted"
    : coverage.pct >= 80
      ? "bg-emerald-500"
      : coverage.pct >= 50
        ? "bg-amber-500"
        : "bg-red-500";
  const pendingCoverage = coverage ? coverage.total - coverage.submitted : 0;

  // ── KPI bar (campus-scoped). Order: Verified Revenue → Order Book →
  //    Active Teams → Pending Reviews. ───────────────────────────────────────
  const kpis: {
    label: string;
    value: React.ReactNode;
    sub: React.ReactNode;
    icon: React.ComponentType<{ className?: string }>;
    href: string;
    testid: string;
  }[] = [
    {
      label: "Verified revenue",
      value: formatINR(summary.totalVerifiedRevenue),
      sub: "Your campus",
      icon: Trophy,
      href: "/coordinator/leaderboard",
      testid: "link-card-revenue",
    },
    {
      label: "Order book",
      value: formatINR(summary.totalOrderBook),
      sub: "Committed pipeline",
      icon: Briefcase,
      href: "/coordinator/projects",
      testid: "link-card-order-book",
    },
    {
      label: "Active teams",
      value: summary.activeTeams,
      sub: "Teams at your campus",
      icon: Users,
      href: "/coordinator/leaderboard",
      testid: "link-card-teams",
    },
    {
      label: "Pending reviews",
      value: summary.pendingReviewCount,
      sub:
        summary.overdueReviewCount > 0 ? (
          <span className="text-destructive">
            {summary.overdueReviewCount} overdue
          </span>
        ) : (
          "Nothing overdue"
        ),
      icon: AlertCircle,
      href: "/coordinator/queue",
      testid: "link-card-pending-reviews",
    },
  ];

  return (
    <>
      <div className="space-y-5 animate-in fade-in slide-in-from-bottom-4 duration-500">
        {/* ===================== COMMAND HEADER ===================== */}
        <header className={cn(PANEL, "p-5")}>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3.5">
              <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-primary/10 text-primary ring-1 ring-inset ring-primary/15">
                <Building2 className="h-6 w-6" />
              </span>
              <div className="min-w-0">
                <h1 className="text-xl font-bold tracking-tight text-foreground">
                  Campus Dashboard
                </h1>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Operational overview of your campus performance
                </p>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2 self-start sm:self-center">
              <HelpMenu inline />
              <NotificationsBell />
            </div>
          </div>
        </header>

        {/* ============ PERFORMANCE OVERVIEW — segmented stat bar ============ */}
        <section>
          <div className="mb-3 flex items-center justify-between">
            <SectionLabel>Campus performance</SectionLabel>
            <Link
              href="/coordinator/leaderboard"
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
                  key={k.testid}
                  href={k.href}
                  className="group relative flex flex-col bg-card p-5 transition-colors hover:bg-muted/30 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                  data-testid={k.testid}
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

        {/* ===================== JOURNAL COVERAGE HERO ===================== */}
        <section className={cn(PANEL, "overflow-hidden")}>
          <div className="flex items-center justify-between px-6 pt-5">
            <div className="flex items-center gap-2">
              <BookOpenCheck className="h-4 w-4 text-primary" />
              <SectionLabel>This week's journal coverage</SectionLabel>
            </div>
            {coverage && (
              <Badge
                variant="outline"
                className="flex items-center gap-1 text-xs"
              >
                <Calendar className="h-3 w-3" />
                {coverage.currentWeek}
              </Badge>
            )}
          </div>

          {!coverage ? (
            <p className="px-6 py-8 text-sm text-muted-foreground">
              No programme weeks generated yet, or no teams in this campus.
            </p>
          ) : (
            <>
              <div className="flex flex-col items-center gap-8 px-6 py-7 lg:flex-row lg:gap-12">
                {/* Radial focal point */}
                <RadialProgress value={coverage.pct} arcClass={coverageArc}>
                  <div className="text-4xl font-bold leading-none tabular-nums tracking-tight">
                    {coverage.pct}
                    <span className="text-xl">%</span>
                  </div>
                  <div className="mt-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                    Submitted
                  </div>
                </RadialProgress>

                {/* Readouts + actions */}
                <div className="min-w-0 flex-1">
                  <div className="text-2xl font-bold tabular-nums tracking-tight">
                    {coverage.submitted}{" "}
                    <span className="text-muted-foreground">
                      / {coverage.total}
                    </span>
                    <span className="ml-2 text-sm font-normal text-muted-foreground">
                      teams submitted this week
                    </span>
                  </div>

                  <div className="mt-4 h-2.5 w-full overflow-hidden rounded-full bg-muted">
                    <div
                      className={cn("h-full transition-all", coverageBar)}
                      style={{ width: `${coverage.pct}%` }}
                    />
                  </div>

                  {/* Mini breakdown */}
                  <div className="mt-5 grid grid-cols-3 gap-px overflow-hidden rounded-lg border bg-border">
                    {(
                      [
                        { label: "Submitted", value: coverage.submitted },
                        { label: "Pending", value: pendingCoverage },
                        { label: "Silent", value: silentTeams.length },
                      ] as const
                    ).map((s) => (
                      <div key={s.label} className="bg-card p-3 text-center">
                        <div className="text-lg font-bold tabular-nums">
                          {s.value}
                        </div>
                        <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
                          {s.label}
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="mt-5 flex flex-wrap gap-2">
                    <Button asChild variant="outline" size="sm">
                      <Link
                        href="/coordinator/heatmap"
                        data-testid="link-coverage-heatmap"
                      >
                        <Activity className="mr-1 h-4 w-4" />
                        View heatmap
                      </Link>
                    </Button>
                    <Button
                      size="sm"
                      disabled={
                        silentTeams.length === 0 || bulkRemindMut.isPending
                      }
                      onClick={() => setBulkOpen(true)}
                      data-testid="button-bulk-remind-silent"
                    >
                      <Bell className="mr-1 h-4 w-4" />
                      Send reminder to {silentTeams.length} silent team
                      {silentTeams.length === 1 ? "" : "s"}
                    </Button>
                  </div>
                </div>
              </div>
            </>
          )}
        </section>

        {/* ============ WORKSPACE — triage + activity ============ */}
        <div className="grid gap-5 lg:grid-cols-2">
          {/* Teams Needing Attention */}
          <section className={cn(PANEL, "overflow-hidden")}>
            <div className="flex items-center justify-between px-5 py-4">
              <div className="flex items-center gap-2">
                <AlertCircle className="h-4 w-4 text-orange-500" />
                <SectionLabel>Teams needing attention</SectionLabel>
              </div>
              {topSilent.length > 0 && (
                <Link
                  href="/coordinator/heatmap"
                  className="text-xs font-medium text-primary hover:underline"
                  data-testid="link-view-all-silent"
                >
                  View all
                </Link>
              )}
            </div>
            <div className="border-t">
              {topSilent.length === 0 ? (
                <p className="px-5 py-8 text-sm text-muted-foreground">
                  All teams are active — no silent teams flagged.
                </p>
              ) : (
                <ul className="divide-y">
                  {topSilent.map((t, idx) => (
                    <li
                      key={t.teamId}
                      className="flex items-center justify-between gap-3 px-5 py-3.5 transition-colors hover:bg-muted/30"
                      data-testid={`silent-team-${t.teamId}`}
                    >
                      <div className="flex min-w-0 flex-1 items-center gap-3">
                        <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-orange-100 text-xs font-semibold tabular-nums text-orange-700 dark:bg-orange-950 dark:text-orange-300">
                          {idx + 1}
                        </span>
                        <div className="min-w-0">
                          <div className="truncate text-sm font-medium">
                            {t.teamName}
                          </div>
                          <div className="flex items-center gap-1 text-xs text-orange-600 dark:text-orange-400">
                            <AlertCircle className="h-3 w-3" />
                            {t.status === "never_logged"
                              ? "Never logged a journal"
                              : `${t.daysSinceLastJournal ?? 0} days silent`}
                          </div>
                        </div>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={remindMut.isPending}
                        onClick={() => remindMut.mutate(t.teamId)}
                        data-testid={`button-remind-${t.teamId}`}
                      >
                        <Bell className="mr-1 h-3 w-3" />
                        Remind
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>

          {/* Recent Journal Submissions */}
          <section className={cn(PANEL, "overflow-hidden")}>
            <div className="flex items-center justify-between px-5 py-4">
              <div className="flex items-center gap-2">
                <BookOpenCheck className="h-4 w-4 text-primary" />
                <SectionLabel>Recent journal submissions</SectionLabel>
              </div>
              {recentJournals.length > 0 && (
                <Link
                  href="/coordinator/journals"
                  className="text-xs font-medium text-primary hover:underline"
                  data-testid="link-view-all-journals"
                >
                  View all
                </Link>
              )}
            </div>
            <div className="border-t">
              {recentJournals.length === 0 ? (
                <p className="px-5 py-8 text-sm text-muted-foreground">
                  No journal submissions yet.
                </p>
              ) : (
                <ul className="divide-y">
                  {recentJournals.map((j) => (
                    <li key={j.id}>
                      <Link
                        href="/coordinator/journals"
                        className="block px-5 py-3.5 transition-colors hover:bg-muted/30"
                        data-testid={`recent-journal-${j.id}`}
                      >
                        <div className="mb-1 flex items-baseline justify-between gap-2">
                          <div className="truncate text-sm font-medium">
                            {j.teamName ?? `Team #${j.teamId}`}
                          </div>
                          <span className="whitespace-nowrap text-xs text-muted-foreground">
                            {relativeTime(j.submittedAt)}
                          </span>
                        </div>
                        <p className="line-clamp-2 text-xs text-muted-foreground">
                          {truncate(j.whatWeDid, 120)}
                        </p>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>
        </div>

        {/* ============ DEMO DAY PIPELINE (conditional) ============ */}
        {demoEligibleCount > 0 && (
          <section className={cn(PANEL, "p-5")}>
            <div className="flex items-center gap-2">
              <Trophy className="h-4 w-4 text-primary" />
              <SectionLabel>Demo Day pipeline</SectionLabel>
            </div>
            <div className="mt-4 flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-4">
                <span className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-primary/10 text-primary">
                  <Trophy className="h-6 w-6" />
                </span>
                <div>
                  <div className="text-2xl font-bold tabular-nums leading-none">
                    {demoEligibleCount}
                  </div>
                  <p className="mt-1.5 text-sm text-muted-foreground">
                    eligible team{demoEligibleCount === 1 ? "" : "s"} crossed
                    the ₹2L threshold — make sure they apply before the
                    deadline.
                  </p>
                </div>
              </div>
              <div className="flex gap-2">
                <Button asChild variant="outline" size="sm">
                  <Link
                    href="/coordinator/leaderboard"
                    data-testid="link-demo-leaderboard"
                  >
                    <Trophy className="mr-1 h-4 w-4" />
                    View leaderboard
                  </Link>
                </Button>
                <Button asChild size="sm">
                  <Link
                    href="/coordinator/announcements"
                    data-testid="link-demo-nudge"
                  >
                    <Megaphone className="mr-1 h-4 w-4" />
                    Nudge via announcement
                  </Link>
                </Button>
              </div>
            </div>
            {leaderboard && leaderboard.length > 0 && (
              <p className="mt-4 border-t pt-3 text-xs text-muted-foreground">
                Top eligible:{" "}
                {leaderboard
                  .slice(0, Math.min(3, leaderboard.length))
                  .map((t: { teamName: string }) => t.teamName)
                  .join(", ")}
              </p>
            )}
          </section>
        )}
      </div>

      {/* Bulk-remind silent teams confirmation */}
      <AlertDialog open={bulkOpen} onOpenChange={setBulkOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Send reminders to {silentTeams.length} silent team
              {silentTeams.length === 1 ? "" : "s"}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Each team flagged as Silent or Never-logged in your campus will
              get an in-app notification asking them to submit their weekly
              journal. This action is logged.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={bulkRemindMut.isPending}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={bulkRemindMut.isPending}
              onClick={() =>
                bulkRemindMut.mutate(silentTeams.map((t) => t.teamId))
              }
              data-testid="button-bulk-remind-confirm"
            >
              {bulkRemindMut.isPending ? "Sending…" : "Send reminders"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
