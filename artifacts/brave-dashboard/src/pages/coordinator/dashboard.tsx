import { useMemo, useState } from "react";
import {
  useGetDashboardSummary,
  useGetLeaderboard,
} from "@workspace/api-client-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { formatINR } from "@/lib/format";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
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
  BookOpenCheck,
  Activity,
  Bell,
  Calendar,
  Megaphone,
  ArrowRight,
} from "lucide-react";
import { Link } from "wouter";
import { NotificationsBell } from "@/components/notifications-bell";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import {
  getHeatmap,
  listAdminJournals,
  sendBulkHeatmapReminders,
  sendHeatmapReminder,
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

export default function CoordinatorDashboard() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: summary, isLoading } = useGetDashboardSummary();
  const { data: leaderboard } = useGetLeaderboard({ limit: 10 });

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

  const cardLinkClass =
    "block rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background";

  // Coverage color
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
              Campus Dashboard
            </h1>
            <p className="text-muted-foreground">
              Overview of your campus performance
            </p>
          </div>
          <NotificationsBell />
        </div>

        {/* Row 1 — KPI Cards (UNCHANGED) */}
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
          <Link
            href="/coordinator/leaderboard"
            className={cardLinkClass}
            data-testid="link-card-revenue"
          >
            <Card className="hover-elevate active-elevate-2 transition-all cursor-pointer h-full">
              <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
                <CardTitle className="text-sm font-medium">
                  Verified Revenue
                </CardTitle>
                <Trophy className="w-4 h-4 text-primary" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {formatINR(summary.totalVerifiedRevenue)}
                </div>
              </CardContent>
            </Card>
          </Link>

          <Link
            href="/coordinator/teams"
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
                  Teams at your campus
                </p>
              </CardContent>
            </Card>
          </Link>

          <Link
            href="/coordinator/leaderboard"
            className={cardLinkClass}
            data-testid="link-card-demo-eligible"
          >
            <Card className="hover-elevate active-elevate-2 transition-all cursor-pointer h-full">
              <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
                <CardTitle className="text-sm font-medium">
                  Demo Eligible
                </CardTitle>
                <CheckCircle className="w-4 h-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {summary.demoEligibleTeams}
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                  Teams crossed ₹2,00,000
                </p>
              </CardContent>
            </Card>
          </Link>

          <Link
            href="/coordinator/teams"
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
                <p className="text-xs text-muted-foreground mt-2 text-destructive">
                  {summary.overdueReviewCount} overdue
                </p>
              </CardContent>
            </Card>
          </Link>
        </div>

        {/* Row 2 — Campus Journal Coverage (full width) */}
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
                No programme weeks generated yet, or no teams in this campus.
              </p>
            ) : (
              <div className="space-y-3">
                <div className="flex items-baseline justify-between gap-3">
                  <div className="text-2xl font-bold">
                    {coverage.submitted} / {coverage.total}
                    <span className="text-base font-normal text-muted-foreground ml-2">
                      teams submitted ({coverage.pct}%)
                    </span>
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
                      href="/coordinator/heatmap"
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
                    Send reminder to {silentTeams.length} silent team
                    {silentTeams.length === 1 ? "" : "s"}
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Row 3 — Top 3 Silent + Recent Journals (side-by-side) */}
        <div className="grid gap-6 lg:grid-cols-2">
          {/* Top 3 Silent Teams */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <AlertCircle className="w-5 h-5 text-orange-500" />
                Teams Needing Attention
              </CardTitle>
              <CardDescription>
                Most silent teams in your campus
              </CardDescription>
            </CardHeader>
            <CardContent>
              {topSilent.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4">
                  All teams are active — no silent teams flagged.
                </p>
              ) : (
                <div className="space-y-2">
                  {topSilent.map((t, idx) => (
                    <div
                      key={t.teamId}
                      className="flex items-center justify-between p-3 border rounded-md hover:bg-accent/30"
                      data-testid={`silent-team-${t.teamId}`}
                    >
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        <span className="text-sm font-mono text-muted-foreground tabular-nums w-6">
                          #{idx + 1}
                        </span>
                        <div className="min-w-0">
                          <div className="font-medium truncate">
                            {t.teamName}
                          </div>
                          <div className="text-xs text-orange-600 dark:text-orange-400 flex items-center gap-1">
                            <AlertCircle className="w-3 h-3" />
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
                        <Bell className="w-3 h-3 mr-1" />
                        Remind
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
                      href="/coordinator/heatmap"
                      data-testid="link-view-all-silent"
                    >
                      View all silent teams
                      <ArrowRight className="w-4 h-4 ml-1" />
                    </Link>
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Recent Journals */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <BookOpenCheck className="w-5 h-5 text-primary" />
                Recent Journal Submissions
              </CardTitle>
              <CardDescription>Latest entries from your campus</CardDescription>
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
                      href="/coordinator/journals"
                      className="block p-3 border rounded-md hover:bg-accent/30 transition-colors"
                      data-testid={`recent-journal-${j.id}`}
                    >
                      <div className="flex items-baseline justify-between gap-2 mb-1">
                        <div className="text-sm font-medium truncate">
                          {j.teamName ?? `Team #${j.teamId}`}
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
                      href="/coordinator/journals"
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

        {/* Row 4 — Demo Day Pipeline (only if eligible teams exist) */}
        {demoEligibleCount > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Trophy className="w-5 h-5 text-primary" />
                Demo Day Pipeline
              </CardTitle>
              <CardDescription>
                Teams in your campus that have crossed the ₹2L threshold
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap items-center gap-3 justify-between">
                <div>
                  <div className="text-2xl font-bold">{demoEligibleCount}</div>
                  <p className="text-sm text-muted-foreground">
                    eligible team{demoEligibleCount === 1 ? "" : "s"} — make
                    sure they apply on `/demo-day` before the deadline.
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button asChild variant="outline" size="sm">
                    <Link
                      href="/coordinator/leaderboard"
                      data-testid="link-demo-leaderboard"
                    >
                      <Trophy className="w-4 h-4 mr-1" />
                      View leaderboard
                    </Link>
                  </Button>
                  <Button asChild size="sm">
                    <Link
                      href="/coordinator/announcements"
                      data-testid="link-demo-nudge"
                    >
                      <Megaphone className="w-4 h-4 mr-1" />
                      Nudge via announcement
                    </Link>
                  </Button>
                </div>
              </div>
              {leaderboard && leaderboard.length > 0 && (
                <p className="text-xs text-muted-foreground mt-3">
                  Top eligible:{" "}
                  {leaderboard
                    .slice(0, Math.min(3, leaderboard.length))
                    .map((t: { teamName: string }) => t.teamName)
                    .join(", ")}
                </p>
              )}
            </CardContent>
          </Card>
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
