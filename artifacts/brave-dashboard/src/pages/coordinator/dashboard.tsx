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
  Megaphone,
  Briefcase,
  ChevronRight,
  ListChecks,
  Clock,
  ArrowRight,
} from "lucide-react";
import { Link } from "wouter";
import { NotificationsBell } from "@/components/notifications-bell";
import { HelpMenu } from "@/components/help-menu";
import { SeasonSwitcher } from "@/components/season-switcher";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import {
  getHeatmap,
  listAdminJournals,
  sendBulkHeatmapReminders,
  sendHeatmapReminder,
} from "@/lib/progress-api";

// ── Design system ───────────────────────────────────────────────────────────
// Coordinator = an OPERATIONS CONSOLE (not a personal journey). Action-first,
// worklist-driven, dense and calm. Deliberately distinct from the student view:
// horizontal coverage meter instead of a progress ring, a left work column with
// a right "command rail", structured list/table surfaces.
const PANEL = "rounded-xl border bg-card";

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
      {children}
    </h2>
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
  const demoEligibleCount = summary?.demoEligibleTeams ?? 0;

  if (isLoading)
    return (
      <div className="flex h-64 items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  if (!summary) return <div>Failed to load dashboard</div>;

  // Coverage health → bar colour + status label.
  const pct = coverage?.pct ?? 0;
  const health =
    pct >= 80
      ? {
          label: "Healthy",
          dot: "bg-emerald-500",
          text: "text-emerald-600",
          bar: "bg-emerald-500",
        }
      : pct >= 50
        ? {
            label: "At risk",
            dot: "bg-amber-500",
            text: "text-amber-600",
            bar: "bg-amber-500",
          }
        : {
            label: "Critical",
            dot: "bg-red-500",
            text: "text-red-600",
            bar: "bg-red-500",
          };
  const pendingCoverage = coverage ? coverage.total - coverage.submitted : 0;

  // ── KPI tiles (campus-scoped). Order: Verified Revenue → Order Book →
  //    Active Teams → Pending Reviews. Horizontal icon-left layout. ───────────
  const kpis: {
    label: string;
    value: React.ReactNode;
    sub: React.ReactNode;
    icon: React.ComponentType<{ className?: string }>;
    accent: string;
    href: string;
    testid: string;
  }[] = [
    {
      label: "Verified revenue",
      value: formatINR(summary.totalVerifiedRevenue),
      sub: "Your campus",
      icon: Trophy,
      accent: "bg-emerald-50 text-emerald-600 dark:bg-emerald-950",
      href: "/coordinator/leaderboard",
      testid: "link-card-revenue",
    },
    {
      label: "Order book",
      value: formatINR(summary.totalOrderBook),
      sub: "Committed pipeline",
      icon: Briefcase,
      accent: "bg-blue-50 text-blue-600 dark:bg-blue-950",
      href: "/coordinator/projects",
      testid: "link-card-order-book",
    },
    {
      label: "Active teams",
      value: summary.activeTeams,
      sub: "At your campus",
      icon: Users,
      accent: "bg-violet-50 text-violet-600 dark:bg-violet-950",
      href: "/coordinator/leaderboard",
      testid: "link-card-teams",
    },
    {
      label: "Pending reviews",
      value: summary.pendingReviewCount,
      sub:
        summary.overdueReviewCount > 0 ? (
          <span className="font-medium text-destructive">
            {summary.overdueReviewCount} overdue
          </span>
        ) : (
          "Nothing overdue"
        ),
      icon: AlertCircle,
      accent: "bg-amber-50 text-amber-600 dark:bg-amber-950",
      href: "/coordinator/queue",
      testid: "link-card-pending-reviews",
    },
  ];

  return (
    <>
      <div className="space-y-5 animate-in fade-in slide-in-from-bottom-4 duration-500">
        {/* ===================== TOOLBAR HEADER ===================== */}
        <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2.5">
            <span className="h-7 w-1 rounded-full bg-primary" />
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-foreground">
                Campus Operations
              </h1>
              <p className="text-xs text-muted-foreground">
                Monitor coverage, clear reviews, keep every team moving.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 self-start sm:self-center">
            <SeasonSwitcher />
            <HelpMenu inline />
            <NotificationsBell />
          </div>
        </header>

        {/* ============ KPI TILES — horizontal, icon-left ============ */}
        <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {kpis.map((k) => {
            const Icon = k.icon;
            return (
              <Link
                key={k.testid}
                href={k.href}
                className={cn(
                  PANEL,
                  "group flex items-center gap-3.5 p-4 transition-colors hover:border-primary/30 hover:bg-muted/30 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                )}
                data-testid={k.testid}
              >
                <span
                  className={cn(
                    "grid h-11 w-11 shrink-0 place-items-center rounded-xl",
                    k.accent,
                  )}
                >
                  <Icon className="h-5 w-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-xl font-bold leading-tight tabular-nums tracking-tight">
                    {k.value}
                  </div>
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    {k.label}
                  </div>
                  <div className="truncate text-xs text-muted-foreground/80">
                    {k.sub}
                  </div>
                </div>
                <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
              </Link>
            );
          })}
        </section>

        {/* ============ MAIN CONSOLE: work column + command rail ============ */}
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_300px] lg:items-start">
          {/* ---------- WORK COLUMN ---------- */}
          <div className="min-w-0 space-y-5">
            {/* JOURNAL COVERAGE — horizontal meter (NOT a ring) */}
            <section className={cn(PANEL, "overflow-hidden")}>
              <div className="flex items-center justify-between px-5 py-4">
                <div className="flex items-center gap-2">
                  <BookOpenCheck className="h-4 w-4 text-primary" />
                  <SectionLabel>This week's journal coverage</SectionLabel>
                </div>
                {coverage && (
                  <span
                    className={cn(
                      "flex items-center gap-1.5 text-xs font-semibold",
                      health.text,
                    )}
                  >
                    <span
                      className={cn("h-1.5 w-1.5 rounded-full", health.dot)}
                    />
                    {health.label}
                  </span>
                )}
              </div>

              {!coverage ? (
                <p className="border-t px-5 py-8 text-sm text-muted-foreground">
                  No programme weeks generated yet, or no teams in this campus.
                </p>
              ) : (
                <div className="border-t px-5 py-5">
                  {/* Big readout + meter */}
                  <div className="flex flex-wrap items-end gap-x-3 gap-y-1">
                    <span
                      className={cn(
                        "text-5xl font-bold leading-none tabular-nums tracking-tight",
                        health.text,
                      )}
                    >
                      {coverage.pct}
                      <span className="text-2xl">%</span>
                    </span>
                    <span className="pb-1 text-sm text-muted-foreground">
                      <span className="font-semibold text-foreground tabular-nums">
                        {coverage.submitted}
                      </span>{" "}
                      of{" "}
                      <span className="font-semibold text-foreground tabular-nums">
                        {coverage.total}
                      </span>{" "}
                      teams submitted
                    </span>
                  </div>

                  <div className="mt-4 h-3 w-full overflow-hidden rounded-full bg-muted">
                    <div
                      className={cn(
                        "h-full rounded-full transition-all",
                        health.bar,
                      )}
                      style={{ width: `${coverage.pct}%` }}
                    />
                  </div>

                  {/* Breakdown legend */}
                  <div className="mt-4 grid grid-cols-3 gap-3">
                    {(
                      [
                        {
                          label: "Submitted",
                          value: coverage.submitted,
                          dot: "bg-emerald-500",
                        },
                        {
                          label: "Pending",
                          value: pendingCoverage,
                          dot: "bg-muted-foreground/40",
                        },
                        {
                          label: "Silent",
                          value: silentTeams.length,
                          dot: "bg-red-500",
                        },
                      ] as const
                    ).map((s) => (
                      <div
                        key={s.label}
                        className="flex items-center gap-2.5 rounded-lg border bg-muted/20 px-3 py-2.5"
                      >
                        <span className={cn("h-2 w-2 rounded-full", s.dot)} />
                        <div>
                          <div className="text-base font-bold leading-none tabular-nums">
                            {s.value}
                          </div>
                          <div className="mt-0.5 text-[11px] uppercase tracking-wide text-muted-foreground">
                            {s.label}
                          </div>
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
              )}
            </section>

            {/* TEAMS NEEDING ATTENTION — triage worklist */}
            <section className={cn(PANEL, "overflow-hidden")}>
              <div className="flex items-center justify-between px-5 py-4">
                <div className="flex items-center gap-2">
                  <AlertCircle className="h-4 w-4 text-orange-500" />
                  <SectionLabel>Teams needing attention</SectionLabel>
                </div>
                {topSilent.length > 0 && (
                  <Link
                    href="/coordinator/heatmap"
                    className="flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                    data-testid="link-view-all-silent"
                  >
                    View all
                    <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                )}
              </div>
              <div className="border-t">
                {topSilent.length === 0 ? (
                  <div className="flex items-center gap-2 px-5 py-8 text-sm text-muted-foreground">
                    <ListChecks className="h-4 w-4 text-emerald-500" />
                    All teams are active — no silent teams flagged.
                  </div>
                ) : (
                  <ul className="divide-y">
                    {topSilent.map((t, idx) => (
                      <li
                        key={t.teamId}
                        className="flex items-center justify-between gap-3 px-5 py-3 transition-colors hover:bg-muted/30"
                        data-testid={`silent-team-${t.teamId}`}
                      >
                        <div className="flex min-w-0 flex-1 items-center gap-3">
                          <span className="grid h-7 w-7 shrink-0 place-items-center rounded-md bg-orange-100 text-xs font-bold tabular-nums text-orange-700 dark:bg-orange-950 dark:text-orange-300">
                            {idx + 1}
                          </span>
                          <div className="min-w-0">
                            <div className="truncate text-sm font-medium">
                              {t.teamName}
                            </div>
                            <div className="flex items-center gap-1 text-xs text-orange-600 dark:text-orange-400">
                              <Clock className="h-3 w-3" />
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

            {/* RECENT JOURNAL SUBMISSIONS — activity feed */}
            <section className={cn(PANEL, "overflow-hidden")}>
              <div className="flex items-center justify-between px-5 py-4">
                <div className="flex items-center gap-2">
                  <Activity className="h-4 w-4 text-primary" />
                  <SectionLabel>Recent journal submissions</SectionLabel>
                </div>
                {recentJournals.length > 0 && (
                  <Link
                    href="/coordinator/journals"
                    className="flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                    data-testid="link-view-all-journals"
                  >
                    View all
                    <ArrowRight className="h-3.5 w-3.5" />
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
                          className="flex gap-3 px-5 py-3 transition-colors hover:bg-muted/30"
                          data-testid={`recent-journal-${j.id}`}
                        >
                          <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                            {(j.teamName ?? `T${j.teamId}`)
                              .slice(0, 2)
                              .toUpperCase()}
                          </span>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-baseline justify-between gap-2">
                              <div className="truncate text-sm font-medium">
                                {j.teamName ?? `Team #${j.teamId}`}
                              </div>
                              <span className="whitespace-nowrap text-xs text-muted-foreground">
                                {relativeTime(j.submittedAt)}
                              </span>
                            </div>
                            <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                              {truncate(j.whatWeDid, 120)}
                            </p>
                          </div>
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </section>
          </div>

          {/* ---------- COMMAND RAIL ---------- */}
          <aside className="space-y-5 self-start lg:sticky lg:top-4">
            {/* Review queue focus */}
            <section className={cn(PANEL, "p-5")}>
              <div className="flex items-center gap-2">
                <ListChecks className="h-4 w-4 text-primary" />
                <SectionLabel>Review queue</SectionLabel>
              </div>
              <div className="mt-4 flex items-end justify-between">
                <div>
                  <div className="text-3xl font-bold leading-none tabular-nums">
                    {summary.pendingReviewCount}
                  </div>
                  <div className="mt-1.5 text-xs text-muted-foreground">
                    awaiting your review
                  </div>
                </div>
                {summary.overdueReviewCount > 0 && (
                  <Badge className="bg-red-100 text-red-700 hover:bg-red-100">
                    {summary.overdueReviewCount} overdue
                  </Badge>
                )}
              </div>
              <Button asChild size="sm" className="mt-4 w-full">
                <Link href="/coordinator/queue">
                  Open review queue
                  <ChevronRight className="ml-1 h-4 w-4" />
                </Link>
              </Button>
            </section>

            {/* Demo Day pipeline (conditional) */}
            {demoEligibleCount > 0 && (
              <section className={cn(PANEL, "p-5")}>
                <div className="flex items-center gap-2">
                  <Trophy className="h-4 w-4 text-primary" />
                  <SectionLabel>Demo Day pipeline</SectionLabel>
                </div>
                <div className="mt-4 flex items-center gap-3">
                  <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
                    <Trophy className="h-5 w-5" />
                  </span>
                  <div className="min-w-0">
                    <div className="text-2xl font-bold leading-none tabular-nums">
                      {demoEligibleCount}
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      eligible team{demoEligibleCount === 1 ? "" : "s"} · ₹2L+
                    </div>
                  </div>
                </div>
                {leaderboard && leaderboard.length > 0 && (
                  <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
                    Top eligible:{" "}
                    <span className="text-foreground">
                      {leaderboard
                        .slice(0, Math.min(3, leaderboard.length))
                        .map((t: { teamName: string }) => t.teamName)
                        .join(", ")}
                    </span>
                  </p>
                )}
                <div className="mt-4 flex flex-col gap-2">
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
              </section>
            )}
          </aside>
        </div>
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
