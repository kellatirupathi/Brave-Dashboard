import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Activity,
  Bell,
  AlertTriangle,
  Search,
  CheckCircle2,
  X,
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
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import {
  getHeatmap,
  sendHeatmapReminder,
  sendBulkHeatmapReminders,
  listCampusesForFilter,
  type HeatmapTeamRow,
  type HeatmapTeamWeek,
} from "@/lib/progress-api";

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
