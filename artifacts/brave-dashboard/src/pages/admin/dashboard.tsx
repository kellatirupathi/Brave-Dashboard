import { useMemo, useState } from "react";
import { useGetDashboardSummary } from "@workspace/api-client-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { formatINR } from "@/lib/format";
import { Spinner } from "@/components/ui/spinner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { HelpMenu } from "@/components/help-menu";
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
  Building2,
  ArrowRight,
  AlertTriangle,
  X,
  Briefcase,
  ListChecks,
  Clock,
  History,
  UserPlus,
  Rocket,
} from "lucide-react";
import { Link } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { ActionCenter } from "./components/ActionCenter";
import {
  getHeatmap,
  listAdminJournals,
  sendBulkHeatmapReminders,
} from "@/lib/progress-api";

// ── Design system (shared language with the Coordinator console) ─────────────
// Admin = the NATIONAL COMMAND CENTER. Calm, dense, low-colour. A single
// hairline-divided metric band up top (no floating cards / wasted space), then
// a work column for monitoring + triage and a sticky command rail.
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

// Turn an audit action key ("verify_revenue") into a readable phrase.
function humanizeAction(action: string): string {
  return action.replace(/_/g, " ").trim().toLowerCase();
}

// Top-of-dashboard reminder banner that surfaces pending verifications so an
// admin can't accidentally forget. Self-hides when everything is clean and is
// dismissable for the current view via the X button. Dismissal lives in
// component state only, so a page reload brings it back automatically.
function PendingReviewBanner({
  pendingReviewCount,
  overdueReviewCount,
  pendingDemoDayCount,
  pendingAccessRequestCount,
  oldestPendingAt,
}: {
  pendingReviewCount: number;
  overdueReviewCount: number;
  pendingDemoDayCount: number;
  pendingAccessRequestCount: number;
  oldestPendingAt: string | null | undefined;
}) {
  const [dismissed, setDismissed] = useState(false);

  const totalPending =
    pendingReviewCount + pendingDemoDayCount + pendingAccessRequestCount;
  if (totalPending === 0 || dismissed) return null;

  const isUrgent = overdueReviewCount > 0;
  const oldestLabel = oldestPendingAt ? relativeTime(oldestPendingAt) : null;

  const parts: string[] = [];
  if (pendingReviewCount > 0) {
    parts.push(
      `${pendingReviewCount} revenue ${pendingReviewCount === 1 ? "entry" : "entries"}`,
    );
  }
  if (pendingDemoDayCount > 0) {
    parts.push(
      `${pendingDemoDayCount} Demo Day ${pendingDemoDayCount === 1 ? "application" : "applications"}`,
    );
  }
  if (pendingAccessRequestCount > 0) {
    parts.push(
      `${pendingAccessRequestCount} roster ${pendingAccessRequestCount === 1 ? "request" : "requests"}`,
    );
  }
  const summaryLine = parts.join(" · ");

  const reviewHref =
    pendingReviewCount > 0
      ? "/admin/queue"
      : pendingDemoDayCount > 0
        ? "/admin/demo-day-submissions"
        : "/admin/roster";

  return (
    <div
      role="alert"
      data-testid="admin-pending-banner"
      className={cn(
        "relative flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between rounded-xl border p-4 sm:px-5",
        isUrgent
          ? "border-destructive/40 bg-destructive/[0.05]"
          : "border-amber-400/50 bg-amber-50 dark:bg-amber-950/20",
      )}
    >
      <div className="flex items-start gap-3 pr-8 sm:pr-10">
        <div
          className={cn(
            "shrink-0 mt-0.5 w-9 h-9 rounded-lg flex items-center justify-center",
            isUrgent
              ? "bg-destructive/15 text-destructive"
              : "bg-amber-200/60 text-amber-700 dark:bg-amber-900/40 dark:text-amber-200",
          )}
        >
          <AlertTriangle className="w-4 h-4" />
        </div>
        <div className="min-w-0">
          <p
            className={cn(
              "text-sm font-semibold tracking-tight",
              isUrgent
                ? "text-destructive"
                : "text-amber-900 dark:text-amber-100",
            )}
          >
            {isUrgent
              ? `${overdueReviewCount} overdue ${
                  overdueReviewCount === 1 ? "item" : "items"
                } need your review`
              : "Pending verifications need your review"}
          </p>
          <p className="text-sm text-muted-foreground mt-0.5">
            {summaryLine}
            {oldestLabel ? ` — oldest ${oldestLabel}` : ""}.
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2 sm:shrink-0">
        <Link
          href={reviewHref}
          data-testid="admin-pending-banner-cta"
          className={cn(
            "inline-flex items-center justify-center gap-1.5 h-9 px-4 rounded-lg text-sm font-semibold transition-colors",
            isUrgent
              ? "bg-destructive text-destructive-foreground hover:bg-destructive/90"
              : "bg-amber-500 text-white hover:bg-amber-600",
          )}
        >
          Review now
          <ArrowRight className="w-3.5 h-3.5" />
        </Link>
      </div>

      <button
        type="button"
        onClick={() => setDismissed(true)}
        aria-label="Dismiss"
        data-testid="admin-pending-banner-close"
        className={cn(
          "absolute top-2.5 right-2.5 w-7 h-7 rounded-md inline-flex items-center justify-center transition-colors",
          "text-muted-foreground hover:bg-foreground/5 hover:text-foreground",
        )}
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}

export default function AdminDashboard() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: summary, isLoading } = useGetDashboardSummary();

  const { data: heatmap } = useQuery({
    queryKey: ["admin-heatmap-national", 8],
    queryFn: () => getHeatmap({ weeksBack: 8 }),
  });

  const { data: journals } = useQuery({
    queryKey: ["admin-recent-journals-national"],
    queryFn: () => listAdminJournals(),
  });

  const [bulkOpen, setBulkOpen] = useState(false);

  const bulkRemindMut = useMutation({
    mutationFn: sendBulkHeatmapReminders,
    onSuccess: (r) => {
      toast({
        title: "Bulk reminder sent",
        description: `Pinged ${r.sentToTeams} team${r.sentToTeams === 1 ? "" : "s"} (${r.sentToUsers} member${r.sentToUsers === 1 ? "" : "s"}).${r.skippedTeams > 0 ? ` Skipped ${r.skippedTeams}.` : ""}`,
      });
      setBulkOpen(false);
      queryClient.invalidateQueries({ queryKey: ["admin-heatmap-national"] });
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

  // Current-week journal coverage (national).
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
    const campusSet = new Set(
      heatmap.teams
        .map((t) => t.campusId)
        .filter((id): id is number => id != null),
    );
    const silentCount = heatmap.teams.filter(
      (t) => t.status === "silent",
    ).length;
    const neverCount = heatmap.teams.filter(
      (t) => t.status === "never_logged",
    ).length;
    return {
      currentWeek,
      submitted,
      total,
      pct,
      campusCount: campusSet.size,
      silentCount,
      neverCount,
    };
  }, [heatmap]);

  const silentTeams = useMemo(() => {
    if (!heatmap) return [];
    return heatmap.teams.filter(
      (t) => t.status === "silent" || t.status === "never_logged",
    );
  }, [heatmap]);

  const worstCampuses = useMemo(() => {
    if (!heatmap || heatmap.weeks.length === 0) return [];
    const currentWeek = heatmap.weeks[heatmap.weeks.length - 1];
    type CampusAgg = {
      campusId: number;
      campusName: string;
      total: number;
      submitted: number;
      silent: number;
    };
    const map = new Map<number, CampusAgg>();
    for (const t of heatmap.teams) {
      if (t.campusId == null) continue;
      const agg = map.get(t.campusId) ?? {
        campusId: t.campusId,
        campusName: t.campusName ?? `Campus #${t.campusId}`,
        total: 0,
        submitted: 0,
        silent: 0,
      };
      agg.total += 1;
      const w = t.weeks.find((x) => x.weekStartDate === currentWeek);
      if (w?.hasJournal) agg.submitted += 1;
      if (t.status === "silent" || t.status === "never_logged") agg.silent += 1;
      map.set(t.campusId, agg);
    }
    return Array.from(map.values())
      .map((c) => ({
        ...c,
        pct: c.total === 0 ? 0 : Math.round((c.submitted / c.total) * 100),
      }))
      .filter((c) => c.total >= 1)
      .sort((a, b) => a.pct - b.pct || b.silent - a.silent)
      .slice(0, 4);
  }, [heatmap]);

  const recentJournals = useMemo(() => {
    if (!journals) return [];
    return [...journals]
      .sort(
        (a, b) =>
          new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime(),
      )
      .slice(0, 4);
  }, [journals]);

  if (isLoading)
    return (
      <div className="flex h-64 items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  if (!summary) return <div>Failed to load dashboard</div>;

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

  const hasPending =
    summary.pendingReviewCount +
      summary.pendingDemoDayCount +
      summary.pendingAccessRequestCount >
    0;

  // ── Unified metric band (one hairline-divided grid, no floating cards) ──────
  const metrics: {
    label: string;
    value: React.ReactNode;
    sub?: React.ReactNode;
    icon: React.ComponentType<{ className?: string }>;
    href: string;
    testid: string;
    valueClass?: string;
  }[] = [
    {
      label: "Verified revenue",
      value: formatINR(summary.totalVerifiedRevenue),
      sub: "Counts toward leaderboard",
      icon: Trophy,
      href: "/admin/leaderboard",
      testid: "metric-revenue",
      valueClass: "text-primary",
    },
    {
      label: "Order book",
      value: formatINR(summary.totalOrderBook),
      sub: "Committed pipeline",
      icon: Briefcase,
      href: "/admin/projects",
      testid: "metric-order-book",
    },
    {
      label: "Active teams",
      value: summary.activeTeams.toLocaleString(),
      sub: `Across ${summary.totalCampuses} campuses`,
      icon: Users,
      href: "/admin/teams",
      testid: "metric-teams",
    },
    {
      label: "Demo Day eligible",
      value: summary.demoEligibleTeams.toLocaleString(),
      sub: "Teams crossing ₹2L",
      icon: Rocket,
      href: "/admin/demo-day-submissions",
      testid: "metric-demo-day",
    },
    {
      label: "Pending reviews",
      value: summary.pendingReviewCount.toLocaleString(),
      sub:
        summary.overdueReviewCount > 0 ? (
          <span className="font-medium text-destructive">
            {summary.overdueReviewCount} overdue
          </span>
        ) : (
          "Nothing overdue"
        ),
      icon: AlertCircle,
      href: "/admin/queue",
      testid: "metric-pending-reviews",
    },
    {
      label: "Campuses",
      value: summary.totalCampuses.toLocaleString(),
      sub: "Program-wide",
      icon: Building2,
      href: "/admin/campuses",
      testid: "metric-campuses",
    },
    {
      label: "Teams awaiting approval",
      value: summary.pendingTeams.toLocaleString(),
      sub: "Team requests",
      icon: ListChecks,
      href: "/admin/team-requests",
      testid: "metric-pending-teams",
    },
    {
      label: "Roster requests",
      value: summary.pendingAccessRequestCount.toLocaleString(),
      sub: "New-user access",
      icon: UserPlus,
      href: "/admin/new-users-requests",
      testid: "metric-roster-requests",
    },
  ];

  return (
    <>
      <div className="space-y-5 animate-in fade-in slide-in-from-bottom-4 duration-500">
        {/* ===================== HEADER ===================== */}
        <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2.5">
            <span className="h-8 w-1 rounded-full bg-primary" />
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-foreground">
                National Command Center
              </h1>
              <p className="text-xs text-muted-foreground">
                Program-wide health, pending work, and live activity at a
                glance.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 self-start sm:self-center">
            {coverage && (
              <Badge variant="outline" className="gap-1.5 text-xs font-normal">
                <Calendar className="h-3 w-3" />
                Week of {coverage.currentWeek}
              </Badge>
            )}
            <HelpMenu inline />
          </div>
        </header>

        <PendingReviewBanner
          pendingReviewCount={summary.pendingReviewCount}
          overdueReviewCount={summary.overdueReviewCount}
          pendingDemoDayCount={summary.pendingDemoDayCount}
          pendingAccessRequestCount={summary.pendingAccessRequestCount}
          oldestPendingAt={summary.pendingReviewOldestAt}
        />

        {/* ============ METRIC BAND — one panel, hairline dividers ============ */}
        <section
          className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border bg-border md:grid-cols-4"
          data-testid="admin-metric-band"
        >
          {metrics.map((m) => {
            const Icon = m.icon;
            return (
              <Link
                key={m.testid}
                href={m.href}
                data-testid={m.testid}
                className="group bg-card p-4 transition-colors hover:bg-muted/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
              >
                <div className="flex items-center gap-1.5 text-muted-foreground">
                  <Icon className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate text-[11px] font-medium uppercase tracking-wide">
                    {m.label}
                  </span>
                </div>
                <div
                  className={cn(
                    "mt-2 text-2xl font-bold leading-none tabular-nums tracking-tight",
                    m.valueClass,
                  )}
                >
                  {m.value}
                </div>
                {m.sub && (
                  <div className="mt-1.5 truncate text-xs text-muted-foreground">
                    {m.sub}
                  </div>
                )}
              </Link>
            );
          })}
        </section>

        {/* ============ MAIN CONSOLE: work column + command rail ============ */}
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start">
          {/* ---------- WORK COLUMN ---------- */}
          <div className="min-w-0 space-y-5">
            {/* NATIONAL JOURNAL COVERAGE */}
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
                  No programme weeks generated yet, or no active teams.
                </p>
              ) : (
                <div className="border-t px-5 py-5">
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
                        {coverage.submitted.toLocaleString()}
                      </span>{" "}
                      of{" "}
                      <span className="font-semibold text-foreground tabular-nums">
                        {coverage.total.toLocaleString()}
                      </span>{" "}
                      teams across {coverage.campusCount} campus
                      {coverage.campusCount === 1 ? "" : "es"}
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

                  <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
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
                          value: coverage.silentCount,
                          dot: "bg-red-500",
                        },
                        {
                          label: "Never logged",
                          value: coverage.neverCount,
                          dot: "bg-zinc-400",
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
                            {s.value.toLocaleString()}
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
                        href="/admin/heatmap"
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
                      Bulk-remind {silentTeams.length} silent team
                      {silentTeams.length === 1 ? "" : "s"}
                    </Button>
                  </div>
                </div>
              )}
            </section>

            {/* CAMPUSES NEEDING ATTENTION */}
            <section className={cn(PANEL, "overflow-hidden")}>
              <div className="flex items-center justify-between px-5 py-4">
                <div className="flex items-center gap-2">
                  <Building2 className="h-4 w-4 text-orange-500" />
                  <SectionLabel>Campuses needing attention</SectionLabel>
                </div>
                <Link
                  href="/admin/campuses"
                  className="flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                  data-testid="link-view-all-campuses"
                >
                  View all
                  <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </div>
              <div className="border-t">
                {worstCampuses.length === 0 ? (
                  <div className="flex items-center gap-2 px-5 py-8 text-sm text-muted-foreground">
                    <ListChecks className="h-4 w-4 text-emerald-500" />
                    Coverage data not available yet.
                  </div>
                ) : (
                  <ul className="divide-y">
                    {worstCampuses.map((c, idx) => (
                      <li
                        key={c.campusId}
                        className="flex items-center justify-between gap-3 px-5 py-3 transition-colors hover:bg-muted/30"
                        data-testid={`worst-campus-${c.campusId}`}
                      >
                        <div className="flex min-w-0 flex-1 items-center gap-3">
                          <span className="grid h-7 w-7 shrink-0 place-items-center rounded-md bg-orange-100 text-xs font-bold tabular-nums text-orange-700 dark:bg-orange-950 dark:text-orange-300">
                            {idx + 1}
                          </span>
                          <div className="min-w-0">
                            <div className="truncate text-sm font-medium">
                              {c.campusName}
                            </div>
                            <div className="flex items-center gap-1 text-xs text-orange-600 dark:text-orange-400">
                              <AlertCircle className="h-3 w-3" />
                              {c.pct}% coverage · {c.silent} silent team
                              {c.silent === 1 ? "" : "s"}
                            </div>
                          </div>
                        </div>
                        <Button asChild size="sm" variant="outline">
                          <Link
                            href={`/admin/heatmap?campusId=${c.campusId}`}
                            data-testid={`link-campus-heatmap-${c.campusId}`}
                          >
                            View
                          </Link>
                        </Button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </section>

            {/* RECENT JOURNAL SUBMISSIONS */}
            <section className={cn(PANEL, "overflow-hidden")}>
              <div className="flex items-center justify-between px-5 py-4">
                <div className="flex items-center gap-2">
                  <BookOpenCheck className="h-4 w-4 text-primary" />
                  <SectionLabel>Recent journal submissions</SectionLabel>
                </div>
                {recentJournals.length > 0 && (
                  <Link
                    href="/admin/journals"
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
                          href="/admin/journals"
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
                                {j.campusName ? (
                                  <span className="ml-1 text-xs font-normal text-muted-foreground">
                                    · {j.campusName}
                                  </span>
                                ) : null}
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
            {/* Pending work — only when there IS pending work (no empty box) */}
            {hasPending && (
              <ActionCenter
                items={[
                  {
                    key: "revenue",
                    label: "Revenue entries to verify",
                    count: summary.pendingReviewCount,
                    oldestAt: summary.pendingReviewOldestAt,
                    href: "/admin/queue",
                    color: "orange",
                  },
                  {
                    key: "demoday",
                    label: "Demo Day applications",
                    count: summary.pendingDemoDayCount,
                    oldestAt: summary.pendingDemoDayOldestAt,
                    href: "/admin/demo-day-submissions",
                    color: "violet",
                  },
                  {
                    key: "roster",
                    label: "Roster join requests",
                    count: summary.pendingAccessRequestCount,
                    oldestAt: summary.pendingAccessRequestOldestAt,
                    href: "/admin/roster",
                    color: "rose",
                  },
                ]}
              />
            )}

            {/* Top campuses */}
            <section className={cn(PANEL, "overflow-hidden")}>
              <div className="flex items-center justify-between px-5 py-4">
                <div className="flex items-center gap-2">
                  <Trophy className="h-4 w-4 text-primary" />
                  <SectionLabel>Top campuses</SectionLabel>
                </div>
                <Link
                  href="/admin/campus-leaderboard"
                  className="flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                  data-testid="link-campus-leaderboard"
                >
                  All
                  <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </div>
              <div className="border-t">
                {summary.topCampuses.length === 0 ? (
                  <p className="px-5 py-8 text-sm text-muted-foreground">
                    No campus data yet.
                  </p>
                ) : (
                  <ul className="divide-y">
                    {summary.topCampuses.slice(0, 5).map((campus, i) => (
                      <li key={campus.id}>
                        <Link
                          href={`/admin/campuses/${campus.id}`}
                          className="flex items-center justify-between gap-3 px-5 py-2.5 transition-colors hover:bg-muted/30"
                          data-testid={`link-top-campus-${campus.id}`}
                        >
                          <div className="flex min-w-0 items-center gap-3">
                            <span
                              className={cn(
                                "grid h-7 w-7 shrink-0 place-items-center rounded-md text-xs font-bold tabular-nums",
                                i === 0
                                  ? "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300"
                                  : "bg-muted text-muted-foreground",
                              )}
                            >
                              {i + 1}
                            </span>
                            <div className="min-w-0">
                              <p className="truncate text-sm font-medium">
                                {campus.name}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {campus.activeTeams} team
                                {campus.activeTeams === 1 ? "" : "s"}
                              </p>
                            </div>
                          </div>
                          <span className="shrink-0 text-sm font-bold tabular-nums">
                            {formatINR(campus.totalRevenue)}
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </section>

            {/* Recent activity — live audit feed */}
            <section className={cn(PANEL, "overflow-hidden")}>
              <div className="flex items-center justify-between px-5 py-4">
                <div className="flex items-center gap-2">
                  <History className="h-4 w-4 text-primary" />
                  <SectionLabel>Recent activity</SectionLabel>
                </div>
                <Link
                  href="/admin/audit-log"
                  className="flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                  data-testid="link-audit-log"
                >
                  Log
                  <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </div>
              <div className="border-t">
                {summary.recentActivity.length === 0 ? (
                  <p className="px-5 py-8 text-sm text-muted-foreground">
                    No activity recorded yet.
                  </p>
                ) : (
                  <ul className="divide-y">
                    {summary.recentActivity.slice(0, 6).map((a) => (
                      <li
                        key={a.id}
                        className="flex gap-3 px-5 py-2.5"
                        data-testid={`activity-${a.id}`}
                      >
                        <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-muted text-muted-foreground">
                          <Clock className="h-3 w-3" />
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm leading-snug">
                            <span className="font-medium">
                              {a.actorName?.trim() &&
                              a.actorName !== "null null"
                                ? a.actorName
                                : "System"}
                            </span>{" "}
                            <span className="text-muted-foreground">
                              {humanizeAction(a.action)}
                            </span>{" "}
                            <span className="text-muted-foreground">
                              {a.targetType}
                              {a.targetId != null ? ` #${a.targetId}` : ""}
                            </span>
                          </p>
                          <p className="text-[11px] text-muted-foreground">
                            {relativeTime(a.createdAt)}
                          </p>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </section>
          </aside>
        </div>
      </div>

      {/* Bulk-remind silent teams confirmation */}
      <AlertDialog open={bulkOpen} onOpenChange={setBulkOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Send reminders to {silentTeams.length} silent team
              {silentTeams.length === 1 ? "" : "s"} nationally?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Every team flagged as Silent or Never-logged across all campuses
              will get an in-app notification asking them to submit their weekly
              journal. Each send is logged.
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
