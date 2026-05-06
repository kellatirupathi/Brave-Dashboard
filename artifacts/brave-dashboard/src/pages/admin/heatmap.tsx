import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Activity,
  Bell,
  AlertTriangle,
  Search,
  CheckCircle2,
} from "lucide-react";
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
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import {
  getHeatmap,
  sendHeatmapReminder,
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
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"all" | "silent" | "never">("all");
  const [weeksBack, setWeeksBack] = useState(8);

  const { data, isLoading, error } = useQuery({
    queryKey: ["heatmap", weeksBack],
    queryFn: () => getHeatmap({ weeksBack }),
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

  const filteredTeams = useMemo(() => {
    if (!data?.teams) return [];
    const q = query.trim().toLowerCase();
    return data.teams.filter((t) => {
      if (filter === "silent" && t.status !== "silent") return false;
      if (filter === "never" && t.status !== "never_logged") return false;
      if (!q) return true;
      return (
        t.teamName.toLowerCase().includes(q) ||
        (t.campusName ?? "").toLowerCase().includes(q)
      );
    });
  }, [data, query, filter]);

  const counts = useMemo(() => {
    const teams = data?.teams ?? [];
    return {
      total: teams.length,
      active: teams.filter((t) => t.status === "active").length,
      silent: teams.filter((t) => t.status === "silent").length,
      never: teams.filter((t) => t.status === "never_logged").length,
    };
  }, [data]);

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
          <div className="flex flex-col sm:flex-row gap-2 items-start sm:items-center justify-between">
            <CardTitle>Per-team weekly journal coverage</CardTitle>
            <div className="flex flex-wrap gap-2">
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
            </div>
          </div>
          <div className="flex flex-col sm:flex-row gap-2 pt-2">
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
              No teams match.
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
                        className="text-center px-1 py-2 font-mono text-[10px] text-muted-foreground"
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
    </div>
  );
}
