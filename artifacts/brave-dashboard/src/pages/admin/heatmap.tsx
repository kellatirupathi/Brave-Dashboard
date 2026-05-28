import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Activity,
  Bell,
  AlertTriangle,
  Search,
  CheckCircle2,
  X,
  Users,
  LogIn,
  ClipboardList,
  Briefcase,
  MessageCircle,
  Rocket,
  PackageCheck,
  TrendingUp,
} from "lucide-react";
import { useAuth } from "@workspace/replit-auth-web";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import {
  getHeatmap,
  sendHeatmapReminder,
  sendBulkHeatmapReminders,
  listCampusesForFilter,
  getHeatmapAnalytics,
  listHeatmapStudents,
  type HeatmapTeamRow,
  type HeatmapTeamWeek,
  type HeatmapStudentRow,
} from "@/lib/progress-api";

function HeroCard({
  label,
  value,
  sub,
  loading,
  icon,
  accent,
}: {
  label: string;
  value: number | undefined;
  sub: string;
  loading: boolean;
  icon: React.ReactNode;
  accent?: string;
}) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardDescription className="text-xs font-medium uppercase tracking-wide">
            {label}
          </CardDescription>
          <span className={cn("text-muted-foreground", accent)}>{icon}</span>
        </div>
        <CardTitle
          className={cn("text-4xl tabular-nums mt-1", accent)}
          data-testid={`hero-card-${label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`}
        >
          {loading ? (
            <Spinner className="size-6" />
          ) : (
            (value ?? 0).toLocaleString("en-IN")
          )}
        </CardTitle>
        <p className="text-xs text-muted-foreground mt-1">{sub}</p>
      </CardHeader>
    </Card>
  );
}

function FunnelBar({
  label,
  icon,
  value,
  total,
  loading,
  color,
}: {
  label: string;
  icon: React.ReactNode;
  value: number | undefined;
  total: number | undefined;
  loading: boolean;
  color: string;
}) {
  const v = value ?? 0;
  const t = total ?? 0;
  const pct = t > 0 ? Math.min((v / t) * 100, 100) : 0;
  return (
    <div
      className="flex items-center gap-3"
      data-testid={`funnel-bar-${label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`}
    >
      <div className="flex items-center gap-2 w-56 shrink-0">
        <span className="text-muted-foreground">{icon}</span>
        <span className="text-sm font-medium truncate">{label}</span>
      </div>
      <div className="flex-1 h-2.5 rounded-full bg-muted overflow-hidden">
        {loading ? null : (
          <div
            className={cn("h-full rounded-full transition-all", color)}
            style={{ width: `${pct}%` }}
          />
        )}
      </div>
      <div className="w-32 text-right text-sm tabular-nums">
        {loading ? (
          <Spinner className="size-3 inline-block" />
        ) : (
          <>
            <span className="font-medium">{v.toLocaleString("en-IN")}</span>
            <span className="text-muted-foreground">
              {" "}
              / {t.toLocaleString("en-IN")}
            </span>
            <span className="text-muted-foreground ml-2 text-xs">
              {pct.toFixed(1)}%
            </span>
          </>
        )}
      </div>
    </div>
  );
}

function AnalyticsCard({
  label,
  value,
  loading,
  icon,
  color,
}: {
  label: string;
  value: number | undefined;
  loading: boolean;
  icon: React.ReactNode;
  color?: string;
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardDescription className="flex items-center gap-1.5 text-xs">
          <span className="text-muted-foreground">{icon}</span>
          {label}
        </CardDescription>
        <CardTitle
          className={cn("text-3xl tabular-nums", color)}
          data-testid={`analytics-card-${label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`}
        >
          {loading ? (
            <Spinner className="size-5" />
          ) : (
            (value ?? 0).toLocaleString("en-IN")
          )}
        </CardTitle>
      </CardHeader>
    </Card>
  );
}

function statusBadge(s: HeatmapTeamRow["status"]) {
  switch (s) {
    case "active":
      return (
        <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100">
          Active
        </Badge>
      );
    case "inconsistent":
      return (
        <Badge className="bg-amber-100 text-amber-700 hover:bg-amber-100">
          Inconsistent
        </Badge>
      );
    case "silent":
      return (
        <Badge className="bg-orange-100 text-orange-700 hover:bg-orange-100">
          <AlertTriangle className="w-3 h-3 mr-1" />
          Silent
        </Badge>
      );
    case "never_logged":
      return (
        <Badge className="bg-red-100 text-red-700 hover:bg-red-100">
          <AlertTriangle className="w-3 h-3 mr-1" />
          Never logged
        </Badge>
      );
  }
}

function cellClass(b: HeatmapTeamWeek): string {
  return b.hasJournal ? "bg-emerald-500" : "bg-muted/40";
}

export default function HeatmapPage() {
  const { user } = useAuth();
  const isCoordinator = user?.role === "coordinator";
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"all" | "silent" | "never">("all");
  const [weeksBack, setWeeksBack] = useState(8);
  const [selectedCampusId, setSelectedCampusId] = useState<string>("all");
  const [selectedWeek, setSelectedWeek] = useState<string>("all"); // value = week startDate or "all"
  const [bulkDialogOpen, setBulkDialogOpen] = useState(false);

  // Pass campusId to backend so the rows are pre-scoped (efficient when
  // there are many campuses). Admin only — coordinator is auto-scoped.
  const campusFilterForApi =
    !isCoordinator && selectedCampusId !== "all"
      ? Number(selectedCampusId)
      : undefined;

  const { data, isLoading, error } = useQuery({
    queryKey: ["heatmap", weeksBack, campusFilterForApi ?? "all"],
    queryFn: () =>
      getHeatmap({
        weeksBack,
        ...(campusFilterForApi ? { campusId: campusFilterForApi } : {}),
      }),
  });

  // Campus list for the dropdown (admin only).
  const { data: campuses } = useQuery({
    queryKey: ["campuses-for-heatmap"],
    queryFn: listCampusesForFilter,
    enabled: !isCoordinator,
  });

  // Programme funnel + engagement card data. Scoped to the same campus
  // filter as the heatmap so all three sections move together.
  const { data: analytics, isLoading: analyticsLoading } = useQuery({
    queryKey: ["heatmap-analytics", campusFilterForApi ?? "all"],
    queryFn: () =>
      getHeatmapAnalytics(
        campusFilterForApi ? { campusId: campusFilterForApi } : undefined,
      ),
  });

  // Per-student funnel table.
  const [studentQuery, setStudentQuery] = useState("");
  const [studentSort, setStudentSort] = useState<
    "total" | "clients" | "conversations" | "started" | "closed"
  >("total");
  const { data: studentsData, isLoading: studentsLoading } = useQuery({
    queryKey: [
      "heatmap-students",
      campusFilterForApi ?? "all",
      studentQuery.trim(),
    ],
    queryFn: () =>
      listHeatmapStudents({
        ...(campusFilterForApi ? { campusId: campusFilterForApi } : {}),
        ...(studentQuery.trim() ? { q: studentQuery.trim() } : {}),
        limit: 200,
      }),
  });

  const sortedStudents = useMemo(() => {
    const rows = studentsData?.rows ?? [];
    const score = (r: HeatmapStudentRow): number => {
      switch (studentSort) {
        case "clients":
          return r.clientsVisited;
        case "conversations":
          return r.activeConversations;
        case "started":
          return r.projectsStarted;
        case "closed":
          return r.projectsClosed;
        default:
          return (
            r.clientsVisited +
            r.activeConversations +
            r.projectsStarted +
            r.projectsClosed
          );
      }
    };
    return [...rows].sort((a, b) => {
      const d = score(b) - score(a);
      if (d !== 0) return d;
      return `${a.firstName} ${a.lastName}`.localeCompare(
        `${b.firstName} ${b.lastName}`,
      );
    });
  }, [studentsData, studentSort]);

  const remindMut = useMutation({
    mutationFn: sendHeatmapReminder,
    onSuccess: () => {
      toast({ title: "Reminder sent" });
      queryClient.invalidateQueries({ queryKey: ["heatmap"] });
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
        description: `Pinged ${r.sentToTeams} team${r.sentToTeams === 1 ? "" : "s"} (${r.sentToUsers} member${r.sentToUsers === 1 ? "" : "s"}).${r.skippedTeams > 0 ? ` Skipped ${r.skippedTeams} (out of scope).` : ""}`,
      });
      setBulkDialogOpen(false);
      queryClient.invalidateQueries({ queryKey: ["heatmap"] });
    },
    onError: (err: Error) => {
      toast({
        title: "Bulk reminder failed",
        description: err.message,
        variant: "destructive",
      });
      setBulkDialogOpen(false);
    },
  });

  // Apply text + status + week-specific filters client-side. Campus is
  // already filtered server-side via the query.
  // Sort priority: Active → Inconsistent → Silent → Never logged.
  // Within the same status, alphabetical by team name. Surfaces engaged
  // teams first and pushes problem rows down so admins can scan top-down.
  const filteredTeams = useMemo(() => {
    if (!data?.teams) return [];
    const q = query.trim().toLowerCase();
    const statusRank: Record<HeatmapTeamRow["status"], number> = {
      active: 0,
      inconsistent: 1,
      silent: 2,
      never_logged: 3,
    };
    return data.teams
      .filter((t) => {
        // Status filter
        if (filter === "silent" && t.status !== "silent") return false;
        if (filter === "never" && t.status !== "never_logged") return false;
        // Week-specific filter — keep only teams that did NOT submit this week.
        if (selectedWeek !== "all") {
          const weekRow = t.weeks.find((w) => w.weekStartDate === selectedWeek);
          if (weekRow?.hasJournal) return false;
        }
        // Search
        if (!q) return true;
        return (
          t.teamName.toLowerCase().includes(q) ||
          (t.campusName ?? "").toLowerCase().includes(q)
        );
      })
      .sort((a, b) => {
        const r = statusRank[a.status] - statusRank[b.status];
        if (r !== 0) return r;
        return a.teamName.localeCompare(b.teamName);
      });
  }, [data, query, filter, selectedWeek]);

  const counts = useMemo(() => {
    const teams = data?.teams ?? [];
    return {
      total: teams.length,
      active: teams.filter((t) => t.status === "active").length,
      silent: teams.filter((t) => t.status === "silent").length,
      never: teams.filter((t) => t.status === "never_logged").length,
    };
  }, [data]);

  const anyFilterActive =
    query.trim() !== "" ||
    filter !== "all" ||
    selectedCampusId !== "all" ||
    selectedWeek !== "all";

  const clearAllFilters = () => {
    setQuery("");
    setFilter("all");
    setSelectedCampusId("all");
    setSelectedWeek("all");
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <Activity className="h-6 w-6 text-primary" />
          Activity Heatmap
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Each cell = one week. Green = weekly journal submitted, gray = no
          journal that week.
        </p>
      </div>

      {/* Hero Strip — 3 headline KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <HeroCard
          label="Total Students"
          value={analytics?.totals.totalStudents}
          sub={`Across ${campuses?.length ?? "—"} campuses`}
          loading={analyticsLoading}
          icon={<Users className="h-5 w-5" />}
        />
        <HeroCard
          label="Weekly Active (WAU)"
          value={analytics?.engagement.wau}
          sub={
            analytics && analytics.totals.totalStudents > 0
              ? `${((analytics.engagement.wau / analytics.totals.totalStudents) * 100).toFixed(1)}% of students`
              : "—"
          }
          loading={analyticsLoading}
          icon={<TrendingUp className="h-5 w-5" />}
          accent="text-primary"
        />
        <HeroCard
          label="Total Teams"
          value={counts.total}
          sub={`${counts.active} active · ${counts.silent} silent · ${counts.never} never logged`}
          loading={isLoading}
          icon={<Activity className="h-5 w-5" />}
        />
      </div>

      {/* Tabs: Funnel / Engagement / Team Status */}
      <Tabs defaultValue="funnel" className="w-full">
        <TabsList className="grid w-full max-w-md grid-cols-3">
          <TabsTrigger value="funnel" data-testid="tab-funnel">
            Funnel
          </TabsTrigger>
          <TabsTrigger value="engagement" data-testid="tab-engagement">
            Engagement
          </TabsTrigger>
          <TabsTrigger value="team-status" data-testid="tab-team-status">
            Team Status
          </TabsTrigger>
        </TabsList>

        {/* Funnel — vertical bar list, reads as a real conversion funnel */}
        <TabsContent value="funnel" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Programme Funnel</CardTitle>
              <CardDescription>
                Each row = distinct students who reached that stage, against
                total registered students.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <FunnelBar
                label="Unique Journal Entries"
                icon={<ClipboardList className="h-4 w-4" />}
                value={analytics?.totals.uniqueJournalEntries}
                total={analytics?.totals.totalStudents}
                loading={analyticsLoading}
                color="bg-slate-500"
              />
              <FunnelBar
                label=">1 Clients Visited"
                icon={<Briefcase className="h-4 w-4" />}
                value={analytics?.funnel.studentsWithClients}
                total={analytics?.totals.totalStudents}
                loading={analyticsLoading}
                color="bg-blue-500"
              />
              <FunnelBar
                label=">1 Active Conversations"
                icon={<MessageCircle className="h-4 w-4" />}
                value={analytics?.funnel.studentsWithConversations}
                total={analytics?.totals.totalStudents}
                loading={analyticsLoading}
                color="bg-violet-500"
              />
              <FunnelBar
                label=">1 Projects Started"
                icon={<Rocket className="h-4 w-4" />}
                value={analytics?.funnel.studentsWithProjectsStarted}
                total={analytics?.totals.totalStudents}
                loading={analyticsLoading}
                color="bg-amber-500"
              />
              <FunnelBar
                label=">1 Projects Closed"
                icon={<PackageCheck className="h-4 w-4" />}
                value={analytics?.funnel.studentsWithProjectsClosed}
                total={analytics?.totals.totalStudents}
                loading={analyticsLoading}
                color="bg-emerald-500"
              />
            </CardContent>
          </Card>
        </TabsContent>

        {/* Engagement — DAU/WAU + Logged in summary */}
        <TabsContent value="engagement" className="mt-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <AnalyticsCard
              label="DAU (last 24h)"
              value={analytics?.engagement.dau}
              loading={analyticsLoading}
              icon={<TrendingUp className="h-4 w-4" />}
              color="text-primary"
            />
            <AnalyticsCard
              label="WAU (last 7d)"
              value={analytics?.engagement.wau}
              loading={analyticsLoading}
              icon={<TrendingUp className="h-4 w-4" />}
              color="text-primary"
            />
            <AnalyticsCard
              label="Logged in to Dashboard"
              value={analytics?.totals.loggedInEver}
              loading={analyticsLoading}
              icon={<LogIn className="h-4 w-4" />}
            />
          </div>
        </TabsContent>

        {/* Team Status — the original 4 counters */}
        <TabsContent value="team-status" className="mt-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Total teams</CardDescription>
                <CardTitle className="text-3xl">{counts.total}</CardTitle>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Active</CardDescription>
                <CardTitle className="text-3xl text-emerald-600">
                  {counts.active}
                </CardTitle>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Silent (&gt; 14d)</CardDescription>
                <CardTitle className="text-3xl text-orange-600">
                  {counts.silent}
                </CardTitle>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Never logged</CardDescription>
                <CardTitle className="text-3xl text-red-600">
                  {counts.never}
                </CardTitle>
              </CardHeader>
            </Card>
          </div>
        </TabsContent>
      </Tabs>

      <Card>
        <CardHeader>
          {/* Top toolbar — bulk button (left) + campus / week dropdowns (right) + clear filters (right) */}
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
            <div className="flex items-center gap-2 flex-wrap">
              <Button
                size="sm"
                variant="default"
                disabled={
                  !anyFilterActive ||
                  filteredTeams.length === 0 ||
                  bulkRemindMut.isPending
                }
                onClick={() => setBulkDialogOpen(true)}
                data-testid="bulk-remind-button"
              >
                <Bell className="w-4 h-4 mr-1" />
                Send reminder to {filteredTeams.length} team
                {filteredTeams.length === 1 ? "" : "s"}
              </Button>
              <CardTitle className="hidden lg:block ml-2">
                Per-team weekly journal coverage
              </CardTitle>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {/* Campus dropdown — admin only */}
              {!isCoordinator && (
                <Select
                  value={selectedCampusId}
                  onValueChange={setSelectedCampusId}
                >
                  <SelectTrigger
                    className="w-48"
                    data-testid="heatmap-campus-filter"
                  >
                    <SelectValue placeholder="All campuses" />
                  </SelectTrigger>
                  <SelectContent className="max-h-72 overflow-y-auto">
                    <SelectItem value="all">All campuses</SelectItem>
                    {(campuses ?? []).map((c) => (
                      <SelectItem key={c.id} value={String(c.id)}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}

              {/* Week dropdown */}
              <Select value={selectedWeek} onValueChange={setSelectedWeek}>
                <SelectTrigger
                  className="w-44"
                  data-testid="heatmap-week-filter"
                >
                  <SelectValue placeholder="All weeks" />
                </SelectTrigger>
                <SelectContent className="max-h-72 overflow-y-auto">
                  <SelectItem value="all">All weeks</SelectItem>
                  {(data?.weeks ?? []).map((w, idx) => (
                    <SelectItem key={w} value={w}>
                      Week {idx + 1} ({w.slice(5)})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {/* Range buttons */}
              <div className="flex gap-1">
                {[4, 8, 12, 24].map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setWeeksBack(n)}
                    className={cn(
                      "px-3 py-1.5 text-xs rounded-md border transition-colors",
                      weeksBack === n
                        ? "bg-primary text-primary-foreground border-primary"
                        : "hover:bg-accent",
                    )}
                  >
                    {n}w
                  </button>
                ))}
              </div>

              {/* Clear filters */}
              {anyFilterActive && (
                <button
                  type="button"
                  onClick={clearAllFilters}
                  className="text-xs text-muted-foreground hover:text-foreground underline-offset-2 hover:underline px-2 py-1 inline-flex items-center gap-1"
                  data-testid="clear-filters-button"
                >
                  <X className="w-3.5 h-3.5" />
                  Clear filters
                </button>
              )}
            </div>
          </div>

          {/* Search + status pills row */}
          <div className="flex flex-col sm:flex-row gap-2 pt-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search team or campus"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="pl-9"
                data-testid="heatmap-search"
              />
            </div>
            <div className="flex gap-1">
              {(
                [
                  { v: "all", label: "All" },
                  { v: "silent", label: "Silent" },
                  { v: "never", label: "Never logged" },
                ] as const
              ).map((b) => (
                <button
                  key={b.v}
                  type="button"
                  onClick={() => setFilter(b.v)}
                  className={cn(
                    "px-3 py-1.5 text-xs rounded-md border transition-colors",
                    filter === b.v
                      ? "bg-primary text-primary-foreground border-primary"
                      : "hover:bg-accent",
                  )}
                >
                  {b.label}
                </button>
              ))}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center py-12">
              <Spinner className="size-8" />
            </div>
          ) : error ? (
            <div className="text-sm text-destructive py-6 text-center">
              Failed to load heatmap.
            </div>
          ) : filteredTeams.length === 0 ? (
            <div className="text-sm text-muted-foreground py-12 text-center">
              No teams match the current filters.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-2 pr-3 font-medium min-w-[180px]">
                      Team
                    </th>
                    {data!.weeks.map((w) => (
                      <th
                        key={w}
                        className={cn(
                          "text-center px-1 py-2 font-mono text-[10px] text-muted-foreground",
                          selectedWeek === w &&
                            "text-primary font-semibold underline",
                        )}
                        title={w}
                      >
                        {w.slice(5)}
                      </th>
                    ))}
                    <th className="text-center px-2 py-2 font-medium">
                      Status
                    </th>
                    <th className="text-right pl-2 py-2 font-medium">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredTeams.map((t) => (
                    <tr
                      key={t.teamId}
                      className="border-b hover:bg-accent/30"
                      data-testid={`heatmap-row-${t.teamId}`}
                    >
                      <td className="py-2 pr-3">
                        <div className="font-medium truncate">{t.teamName}</div>
                        <div className="text-xs text-muted-foreground truncate">
                          {t.campusName ?? "—"} · {t.totalJournals} journal
                          {t.totalJournals === 1 ? "" : "s"}
                          {t.daysSinceLastJournal != null
                            ? ` · last ${t.daysSinceLastJournal}d ago`
                            : ""}
                        </div>
                      </td>
                      {t.weeks.map((b) => (
                        <td
                          key={b.weekStartDate}
                          className="px-1 py-2 text-center"
                        >
                          <div
                            className={cn(
                              "h-6 w-6 mx-auto rounded relative flex items-center justify-center",
                              cellClass(b),
                              selectedWeek === b.weekStartDate &&
                                "ring-2 ring-primary",
                            )}
                            title={`${b.weekStartDate} · ${b.hasJournal ? "journal ✓" : "no journal"}`}
                          >
                            {b.hasJournal && (
                              <CheckCircle2 className="w-3 h-3 text-white" />
                            )}
                          </div>
                        </td>
                      ))}
                      <td className="px-2 py-2 text-center">
                        {statusBadge(t.status)}
                      </td>
                      <td className="pl-2 py-2 text-right">
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={remindMut.isPending}
                          onClick={() => remindMut.mutate(t.teamId)}
                          data-testid={`heatmap-remind-${t.teamId}`}
                        >
                          <Bell className="w-3 h-3 mr-1" />
                          Remind
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Per-student funnel */}
      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <CardTitle>Student-wise Funnel</CardTitle>
              <CardDescription>
                Per-student totals across all of their team's journal entries.
                {studentsData && (
                  <span className="ml-1">
                    Showing {sortedStudents.length} of {studentsData.total}
                    {studentsData.total > sortedStudents.length && " (top 200)"}
                  </span>
                )}
              </CardDescription>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search student"
                  value={studentQuery}
                  onChange={(e) => setStudentQuery(e.target.value)}
                  className="pl-9 w-56"
                  data-testid="student-funnel-search"
                />
              </div>
              <Select
                value={studentSort}
                onValueChange={(v) => setStudentSort(v as typeof studentSort)}
              >
                <SelectTrigger
                  className="w-44"
                  data-testid="student-funnel-sort"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="total">Sort: Total funnel</SelectItem>
                  <SelectItem value="clients">Sort: Clients visited</SelectItem>
                  <SelectItem value="conversations">
                    Sort: Active conversations
                  </SelectItem>
                  <SelectItem value="started">
                    Sort: Projects started
                  </SelectItem>
                  <SelectItem value="closed">Sort: Projects closed</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {studentsLoading ? (
            <div className="flex justify-center py-12">
              <Spinner className="size-8" />
            </div>
          ) : sortedStudents.length === 0 ? (
            <div className="text-sm text-muted-foreground py-12 text-center">
              No students match the current filters.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left">
                    <th className="py-2 pr-3 font-medium min-w-[200px]">
                      Student
                    </th>
                    <th className="py-2 px-3 font-medium">Team</th>
                    <th className="py-2 px-3 font-medium text-right">
                      #Clients visited
                    </th>
                    <th className="py-2 px-3 font-medium text-right">
                      #Active conversations
                    </th>
                    <th className="py-2 px-3 font-medium text-right">
                      #Projects started
                    </th>
                    <th className="py-2 px-3 font-medium text-right">
                      #Projects closed
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {sortedStudents.map((s) => (
                    <tr
                      key={s.userId}
                      className="border-b hover:bg-accent/30"
                      data-testid={`student-funnel-row-${s.userId}`}
                    >
                      <td className="py-2 pr-3">
                        <div className="font-medium truncate">
                          {`${s.firstName} ${s.lastName}`.trim() || s.email}
                        </div>
                        <div className="text-xs text-muted-foreground truncate">
                          {s.niatId ?? s.email} · {s.campusName ?? "—"}
                        </div>
                      </td>
                      <td className="py-2 px-3 text-muted-foreground">
                        {s.teamName ?? "—"}
                      </td>
                      <td className="py-2 px-3 text-right font-mono">
                        {s.clientsVisited}
                      </td>
                      <td className="py-2 px-3 text-right font-mono">
                        {s.activeConversations}
                      </td>
                      <td className="py-2 px-3 text-right font-mono">
                        {s.projectsStarted}
                      </td>
                      <td className="py-2 px-3 text-right font-mono">
                        {s.projectsClosed}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Bulk send confirmation */}
      <AlertDialog open={bulkDialogOpen} onOpenChange={setBulkDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Send reminders to {filteredTeams.length} team
              {filteredTeams.length === 1 ? "" : "s"}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Each team in the current filtered view will get an in-app
              notification asking them to submit their weekly journal. This
              action is logged.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={bulkRemindMut.isPending}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={bulkRemindMut.isPending}
              onClick={() =>
                bulkRemindMut.mutate(filteredTeams.map((t) => t.teamId))
              }
              data-testid="bulk-remind-confirm"
            >
              {bulkRemindMut.isPending ? "Sending…" : "Send reminders"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
