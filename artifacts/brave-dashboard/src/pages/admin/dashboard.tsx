import { useMemo, useState } from "react";
import { useGetDashboardSummary } from "@workspace/api-client-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { formatINR } from "@/lib/format";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
  CheckCircle,
  AlertCircle,
  HelpCircle,
  BookOpenCheck,
  Activity,
  Bell,
  Calendar,
  Building2,
  ArrowRight,
  AlertTriangle,
  X,
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

  // Build a compact human-readable list of what's pending.
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

  // Pick the most relevant deep-link target for the "Review now" CTA.
  const reviewHref =
    pendingReviewCount > 0
      ? "/admin/queue"
      : pendingDemoDayCount > 0
        ? "/admin/demo-day"
        : "/admin/roster";

  return (
    <div
      role="alert"
      data-testid="admin-pending-banner"
      className={cn(
        "relative flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between rounded-2xl border p-4 sm:p-5 shadow-sm",
        isUrgent
          ? "border-destructive/40 bg-destructive/[0.06]"
          : "border-amber-400/50 bg-amber-50 dark:bg-amber-950/20",
      )}
    >
      <div className="flex items-start gap-3 pr-8 sm:pr-10">
        <div
          className={cn(
            "shrink-0 mt-0.5 w-9 h-9 rounded-xl flex items-center justify-center",
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

      {/* Close — top-right; component state only, so reload re-shows it. */}
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

  // National heatmap (all campuses).
  const { data: heatmap } = useQuery({
    queryKey: ["admin-heatmap-national", 8],
    queryFn: () => getHeatmap({ weeksBack: 8 }),
  });

  // Recent journals across the country.
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

  // Teams flagged silent or never logged — bulk-remind target.
  const silentTeams = useMemo(() => {
    if (!heatmap) return [];
    return heatmap.teams.filter(
      (t) => t.status === "silent" || t.status === "never_logged",
    );
  }, [heatmap]);

  // Worst-performing campuses by current-week coverage %.
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
      .filter((c) => c.total >= 1) // require at least 1 team to rank
      .sort((a, b) => a.pct - b.pct || b.silent - a.silent)
      .slice(0, 3);
  }, [heatmap]);

  // Latest 3 journals nationally.
  const recentJournals = useMemo(() => {
    if (!journals) return [];
    return [...journals]
      .sort(
        (a, b) =>
          new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime(),
      )
      .slice(0, 3);
  }, [journals]);

  if (isLoading)
    return (
      <div className="flex h-64 items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  if (!summary) return <div>Failed to load dashboard</div>;

  const cardLinkClass =
    "block rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background";

  const coverageColor = !coverage
    ? "bg-muted"
    : coverage.pct >= 80
      ? "bg-emerald-500"
      : coverage.pct >= 50
        ? "bg-amber-500"
        : "bg-red-500";

  return (
    <>
      <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-foreground">
              National Dashboard
            </h1>
            <p className="text-muted-foreground">High-level program overview</p>
          </div>
        </div>

        {/* Pending-verification reminder banner — sits at the top so admin
            can't miss it. Closeable via X (component state only — reload
            brings it back). Hidden when there's nothing pending. */}
        <PendingReviewBanner
          pendingReviewCount={summary.pendingReviewCount}
          overdueReviewCount={summary.overdueReviewCount}
          pendingDemoDayCount={summary.pendingDemoDayCount}
          pendingAccessRequestCount={summary.pendingAccessRequestCount}
          oldestPendingAt={summary.pendingReviewOldestAt}
        />

        {/* Row 1 — KPI Cards (UNCHANGED) */}
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
          <Link
            href="/admin/leaderboard"
            className={cardLinkClass}
            data-testid="link-card-revenue"
          >
            <Card className="hover-elevate active-elevate-2 transition-all border-primary shadow-sm bg-primary/5 cursor-pointer h-full">
              <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
                <CardTitle className="text-sm font-medium">
                  Total Verified Revenue
                </CardTitle>
                <Trophy className="w-4 h-4 text-primary" />
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-extrabold text-primary">
                  {formatINR(summary.totalVerifiedRevenue)}
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                  + {formatINR(summary.totalOrderBook)} pending
                </p>
              </CardContent>
            </Card>
          </Link>

          <Link
            href="/admin/teams"
            className={cardLinkClass}
            data-testid="link-card-teams"
          >
            <Card className="hover-elevate active-elevate-2 transition-all cursor-pointer h-full">
              <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
                <CardTitle className="text-sm font-medium">
                  Active Teams
                </CardTitle>
                <Users className="w-4 h-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{summary.activeTeams}</div>
                <p className="text-xs text-muted-foreground mt-2">
                  Across {summary.totalCampuses} campuses
                </p>
              </CardContent>
            </Card>
          </Link>

          <Link
            href="/admin/demo-day"
            className={cardLinkClass}
            data-testid="link-card-demo-day"
          >
            <Card className="hover-elevate active-elevate-2 transition-all cursor-pointer h-full">
              <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
                <CardTitle className="text-sm font-medium">
                  Demo Day Eligible
                </CardTitle>
                <CheckCircle className="w-4 h-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {summary.demoEligibleTeams}
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                  Teams crossing ₹2L mark
                </p>
              </CardContent>
            </Card>
          </Link>

          <Link
            href="/admin/queue"
            className={cardLinkClass}
            data-testid="link-card-pending-reviews"
          >
            <Card className="hover-elevate active-elevate-2 transition-all cursor-pointer h-full">
              <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
                <CardTitle className="text-sm font-medium">
                  Pending Reviews
                </CardTitle>
                <AlertCircle className="w-4 h-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {summary.pendingReviewCount}
                </div>
                <p className="text-xs text-destructive mt-2 font-medium">
                  {summary.overdueReviewCount} overdue
                </p>
              </CardContent>
            </Card>
          </Link>
        </div>

        {/* Row 2 — Top Campuses + Action Center (UNCHANGED) */}
        <div className="grid gap-6 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Top Campuses</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {summary.topCampuses.map((campus, i) => (
                  <Link
                    key={campus.id}
                    href={`/admin/campuses/${campus.id}`}
                    className="flex items-center justify-between rounded-md p-2 -mx-2 hover-elevate active-elevate-2 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    data-testid={`link-top-campus-${campus.id}`}
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded bg-muted flex items-center justify-center font-bold text-muted-foreground text-sm">
                        #{i + 1}
                      </div>
                      <div>
                        <p className="font-semibold">{campus.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {campus.activeTeams} Teams
                        </p>
                      </div>
                    </div>
                    <div className="font-bold">
                      {formatINR(campus.totalRevenue)}
                    </div>
                  </Link>
                ))}
              </div>
            </CardContent>
          </Card>

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
                href: "/admin/demo-day",
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
        </div>

        {/* Row 3 — National Journal Coverage (NEW, full width) */}
        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <CardTitle className="flex items-center gap-2">
                <BookOpenCheck className="w-5 h-5 text-primary" />
                This Week's Journal Coverage
              </CardTitle>
              {coverage && (
                <Badge
                  variant="outline"
                  className="text-xs flex items-center gap-1"
                >
                  <Calendar className="w-3 h-3" />
                  {coverage.currentWeek}
                </Badge>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {!coverage ? (
              <p className="text-sm text-muted-foreground py-4">
                No programme weeks generated yet, or no active teams.
              </p>
            ) : (
              <div className="space-y-3">
                <div className="flex items-baseline justify-between gap-3 flex-wrap">
                  <div className="text-2xl font-bold">
                    {coverage.submitted.toLocaleString()} /{" "}
                    {coverage.total.toLocaleString()}
                    <span className="text-base font-normal text-muted-foreground ml-2">
                      teams submitted ({coverage.pct}%)
                    </span>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Across {coverage.campusCount} campus
                    {coverage.campusCount === 1 ? "" : "es"} ·{" "}
                    {coverage.silentCount} silent (&gt; 14d) ·{" "}
                    {coverage.neverCount} never logged
                  </div>
                </div>
                <div className="h-3 w-full bg-muted rounded-full overflow-hidden">
                  <div
                    className={cn("h-full transition-all", coverageColor)}
                    style={{ width: `${coverage.pct}%` }}
                  />
                </div>
                <div className="flex flex-wrap gap-2 pt-2">
                  <Button asChild variant="outline" size="sm">
                    <Link
                      href="/admin/heatmap"
                      data-testid="link-coverage-heatmap"
                    >
                      <Activity className="w-4 h-4 mr-1" />
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
                    <Bell className="w-4 h-4 mr-1" />
                    Bulk-remind {silentTeams.length} silent team
                    {silentTeams.length === 1 ? "" : "s"}
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Row 4 — Worst-Performing Campuses + Recent Journals (national) */}
        <div className="grid gap-6 lg:grid-cols-2">
          {/* Worst-performing campuses */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Building2 className="w-5 h-5 text-orange-500" />
                Campuses Needing Attention
              </CardTitle>
              <CardDescription>
                Lowest journal coverage this week
              </CardDescription>
            </CardHeader>
            <CardContent>
              {worstCampuses.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4">
                  Coverage data not available yet.
                </p>
              ) : (
                <div className="space-y-2">
                  {worstCampuses.map((c, idx) => (
                    <div
                      key={c.campusId}
                      className="flex items-center justify-between p-3 border rounded-md hover:bg-accent/30"
                      data-testid={`worst-campus-${c.campusId}`}
                    >
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        <span className="text-sm font-mono text-muted-foreground tabular-nums w-6">
                          #{idx + 1}
                        </span>
                        <div className="min-w-0">
                          <div className="font-medium truncate">
                            {c.campusName}
                          </div>
                          <div className="text-xs text-orange-600 dark:text-orange-400 flex items-center gap-1">
                            <AlertCircle className="w-3 h-3" />
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
                    </div>
                  ))}
                  <Button
                    asChild
                    variant="ghost"
                    size="sm"
                    className="w-full mt-2"
                  >
                    <Link
                      href="/admin/campuses"
                      data-testid="link-view-all-campuses"
                    >
                      View all campuses
                      <ArrowRight className="w-4 h-4 ml-1" />
                    </Link>
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Recent journals (national) */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <BookOpenCheck className="w-5 h-5 text-primary" />
                Recent Journal Submissions
              </CardTitle>
              <CardDescription>Latest entries from any campus</CardDescription>
            </CardHeader>
            <CardContent>
              {recentJournals.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4">
                  No journal submissions yet.
                </p>
              ) : (
                <div className="space-y-3">
                  {recentJournals.map((j) => (
                    <Link
                      key={j.id}
                      href="/admin/journals"
                      className="block p-3 border rounded-md hover:bg-accent/30 transition-colors"
                      data-testid={`recent-journal-${j.id}`}
                    >
                      <div className="flex items-baseline justify-between gap-2 mb-1">
                        <div className="text-sm font-medium truncate">
                          {j.teamName ?? `Team #${j.teamId}`}
                          {j.campusName ? (
                            <span className="text-xs text-muted-foreground font-normal ml-1">
                              · {j.campusName}
                            </span>
                          ) : null}
                        </div>
                        <span className="text-xs text-muted-foreground whitespace-nowrap">
                          {relativeTime(j.submittedAt)}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground line-clamp-2">
                        {truncate(j.whatWeDid, 120)}
                      </p>
                    </Link>
                  ))}
                  <Button
                    asChild
                    variant="ghost"
                    size="sm"
                    className="w-full mt-2"
                  >
                    <Link
                      href="/admin/journals"
                      data-testid="link-view-all-journals"
                    >
                      View all journals
                      <ArrowRight className="w-4 h-4 ml-1" />
                    </Link>
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
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

      <a
        href="https://docs.google.com/document/d/1qMP-1s3k4GD-cuiYGfjBbcfdQU20___Bl6YLrzgYFb4/edit?usp=sharing"
        target="_blank"
        rel="noopener noreferrer"
        aria-label="Open admin help guide in a new tab"
        title="Help"
        data-testid="button-help"
        className="fixed bottom-6 right-6 z-50 flex h-12 w-12 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition-transform hover:scale-105 hover:bg-primary/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      >
        <HelpCircle className="h-6 w-6" />
      </a>
    </>
  );
}
