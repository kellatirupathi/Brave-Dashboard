import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation, useSearch } from "wouter";
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
  BarChart3,
  List,
  UserX,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from "recharts";
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
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import {
  getHeatmap,
  sendHeatmapReminder,
  sendBulkHeatmapReminders,
  remindNeverLoggedInStudents,
  listCampusesForFilter,
  getHeatmapAnalytics,
  listHeatmapStudents,
  type HeatmapTeamRow,
  type HeatmapTeamWeek,
  type HeatmapStudentRow,
} from "@/lib/progress-api";

// Per-stage icon + colour for the funnel. Keyed by the backend stage `key`.
// Colours progress cool→warm→green to read as a journey toward "closed".
const FUNNEL_STAGE_META: Record<
  string,
  { icon: React.ReactNode; color: string }
> = {
  registered_teams: {
    icon: <Users className="h-4 w-4" />,
    color: "bg-slate-400",
  },
  teams_logged_in: {
    icon: <LogIn className="h-4 w-4" />,
    color: "bg-sky-500",
  },
  students_logged_in: {
    icon: <LogIn className="h-4 w-4" />,
    color: "bg-cyan-500",
  },
  never_logged_in_students: {
    icon: <UserX className="h-4 w-4" />,
    color: "bg-rose-500",
  },
  submitted_journal: {
    icon: <ClipboardList className="h-4 w-4" />,
    color: "bg-blue-500",
  },
  visited_client: {
    icon: <Briefcase className="h-4 w-4" />,
    color: "bg-violet-500",
  },
  active_conversation: {
    icon: <MessageCircle className="h-4 w-4" />,
    color: "bg-fuchsia-500",
  },
  started_project: {
    icon: <Rocket className="h-4 w-4" />,
    color: "bg-amber-500",
  },
  closed_project: {
    icon: <PackageCheck className="h-4 w-4" />,
    color: "bg-emerald-500",
  },
};

// Hex equivalents of the Tailwind funnel colours above — recharts needs real
// colour values, not class names. Keyed by the same backend stage `key`.
const FUNNEL_STAGE_HEX: Record<string, string> = {
  registered_teams: "#94a3b8", // slate-400
  teams_logged_in: "#0ea5e9", // sky-500
  students_logged_in: "#06b6d4", // cyan-500
  never_logged_in_students: "#f43f5e", // rose-500
  submitted_journal: "#3b82f6", // blue-500
  visited_client: "#8b5cf6", // violet-500
  active_conversation: "#d946ef", // fuchsia-500
  started_project: "#f59e0b", // amber-500
  closed_project: "#10b981", // emerald-500
};

// Colour for a step-conversion pill: green = healthy retention, amber =
// moderate, red = heavy drop-off. Lets admins spot the leaky step at a glance.
function conversionPillClass(pct: number): string {
  if (pct >= 80) return "bg-emerald-100 text-emerald-700";
  if (pct >= 50) return "bg-amber-100 text-amber-700";
  return "bg-red-100 text-red-700";
}

// A professional, left-aligned conversion funnel. Every bar shares the same
// left edge and a full-width track, so the coloured fill (= share of the top
// stage) visibly tapers down the list. The right rail shows the headline count,
// % of the top stage, and a colour-coded step-to-step conversion pill.
const NEVER_LOGGED_KEY = "never_logged_in_students";

function FunnelChart({
  stages,
  loading,
  onRemindNeverLogged,
  remindingNeverLogged,
}: {
  stages: { key: string; label: string; count: number }[];
  loading: boolean;
  onRemindNeverLogged?: () => void;
  remindingNeverLogged?: boolean;
}) {
  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <Spinner className="size-8" />
      </div>
    );
  }
  if (stages.length === 0) {
    return (
      <div className="text-sm text-muted-foreground py-12 text-center">
        No funnel data yet.
      </div>
    );
  }
  const base = stages[0]?.count ?? 0;
  const final = stages[stages.length - 1]?.count ?? 0;
  const overall = base > 0 ? (final / base) * 100 : 0;

  return (
    <div className="space-y-4" data-testid="funnel-chart">
      {/* Headline summary — overall registered → closed conversion. */}
      <div className="flex items-center justify-between rounded-lg border bg-muted/30 px-4 py-3">
        <div>
          <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            Overall conversion
          </div>
          <div className="text-2xl font-bold tabular-nums text-primary">
            {overall.toFixed(1)}%
          </div>
        </div>
        <div className="text-right text-xs text-muted-foreground leading-relaxed">
          <span className="font-semibold text-foreground tabular-nums">
            {base.toLocaleString("en-IN")}
          </span>{" "}
          registered
          <br />→{" "}
          <span className="font-semibold text-foreground tabular-nums">
            {final.toLocaleString("en-IN")}
          </span>{" "}
          closed a project
        </div>
      </div>

      {/* Funnel bars. */}
      <div className="space-y-2.5">
        {stages.map((s, i) => {
          const isNeverLogged = s.key === NEVER_LOGGED_KEY;
          const pctOfTotal = base > 0 ? (s.count / base) * 100 : 0;
          // "Never logged-in" is an informational side-stat, not a funnel step.
          // It carries no conversion pill, and the next real stage chains its
          // step-conversion off the last genuine funnel stage (skipping it).
          const prev = (() => {
            for (let k = i - 1; k >= 0; k--) {
              if (stages[k].key !== NEVER_LOGGED_KEY) return stages[k];
            }
            return null;
          })();
          const stepPct =
            isNeverLogged || !prev || prev.count <= 0
              ? null
              : (s.count / prev.count) * 100;
          const meta = FUNNEL_STAGE_META[s.key] ?? {
            icon: null,
            color: "bg-primary",
          };
          return (
            <div
              key={s.key}
              className="flex items-center gap-3"
              data-testid={`funnel-stage-${s.key}`}
            >
              {/* Stage label + coloured icon chip */}
              <div className="flex items-center gap-2 w-44 shrink-0">
                <span
                  className={cn(
                    "flex h-7 w-7 items-center justify-center rounded-md text-white shrink-0",
                    meta.color,
                  )}
                >
                  {meta.icon}
                </span>
                <span className="text-sm font-medium truncate">{s.label}</span>
              </div>

              {/* Bar track + fill */}
              <div className="relative flex-1 h-8 rounded-md bg-muted overflow-hidden">
                <div
                  className={cn("h-full rounded-md transition-all", meta.color)}
                  style={{ width: `${Math.max(pctOfTotal, 1.5)}%` }}
                  title={`${s.count.toLocaleString("en-IN")}`}
                />
              </div>

              {/* Right rail: count · % of total · step pill */}
              <div className="flex items-center justify-end gap-2 shrink-0">
                <span className="w-16 text-right text-sm font-semibold tabular-nums">
                  {s.count.toLocaleString("en-IN")}
                </span>
                <span className="w-10 text-right text-xs tabular-nums text-muted-foreground">
                  {pctOfTotal.toFixed(0)}%
                </span>
                <span className="w-14 text-right">
                  {stepPct !== null ? (
                    <span
                      className={cn(
                        "inline-block rounded px-1.5 py-0.5 text-[10px] font-semibold tabular-nums",
                        conversionPillClass(stepPct),
                      )}
                      title="Conversion from the previous stage"
                    >
                      {stepPct.toFixed(0)}%
                    </span>
                  ) : (
                    <span className="text-[10px] text-muted-foreground">—</span>
                  )}
                </span>
                {/* Remind slot — only the never-logged-in row gets a button;
                    other rows keep an equal-width spacer so columns align. */}
                <span className="w-24 flex justify-end">
                  {isNeverLogged && onRemindNeverLogged ? (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 px-2 text-xs"
                      disabled={remindingNeverLogged || s.count === 0}
                      onClick={onRemindNeverLogged}
                      title="Send a notification + email to every student who has never logged in"
                      data-testid="funnel-remind-never-logged"
                    >
                      <Bell className="h-3 w-3 mr-1" />
                      Remind
                    </Button>
                  ) : null}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Same funnel data rendered as a real bar chart. `orientation` flips between
// vertical bars (category on the X axis) and horizontal bars (category on the
// Y axis), so admins can read it whichever way suits the stage labels.
function FunnelBarChart({
  stages,
  orientation,
}: {
  stages: { key: string; label: string; count: number }[];
  orientation: "vertical" | "horizontal";
}) {
  const data = stages.map((s) => ({
    ...s,
    fill: FUNNEL_STAGE_HEX[s.key] ?? "#6366f1",
  }));

  if (orientation === "horizontal") {
    return (
      <div data-testid="funnel-bar-chart-horizontal">
        <ResponsiveContainer
          width="100%"
          height={Math.max(280, data.length * 46)}
        >
          <BarChart
            data={data}
            layout="vertical"
            margin={{ top: 8, right: 44, left: 8, bottom: 8 }}
            barCategoryGap="25%"
          >
            <CartesianGrid
              horizontal={false}
              strokeDasharray="3 3"
              stroke="#e5e7eb"
            />
            <XAxis
              type="number"
              allowDecimals={false}
              tick={{ fontSize: 11 }}
            />
            <YAxis
              type="category"
              dataKey="label"
              width={150}
              tick={{ fontSize: 11 }}
            />
            <RechartsTooltip
              cursor={{ fill: "rgba(0,0,0,0.04)" }}
              formatter={(value) =>
                [Number(value).toLocaleString("en-IN"), "Teams"] as [
                  string,
                  string,
                ]
              }
            />
            <Bar
              dataKey="count"
              radius={[0, 4, 4, 0]}
              isAnimationActive={false}
            >
              {data.map((d) => (
                <Cell key={d.key} fill={d.fill} />
              ))}
              <LabelList
                dataKey="count"
                position="right"
                className="fill-foreground"
                fontSize={11}
              />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    );
  }

  return (
    <div data-testid="funnel-bar-chart-vertical">
      <ResponsiveContainer width="100%" height={360}>
        <BarChart
          data={data}
          margin={{ top: 20, right: 12, left: 0, bottom: 60 }}
          barCategoryGap="20%"
        >
          <CartesianGrid
            vertical={false}
            strokeDasharray="3 3"
            stroke="#e5e7eb"
          />
          <XAxis
            dataKey="label"
            tick={{ fontSize: 10 }}
            interval={0}
            angle={-30}
            textAnchor="end"
            height={70}
          />
          <YAxis allowDecimals={false} width={40} tick={{ fontSize: 11 }} />
          <RechartsTooltip
            cursor={{ fill: "rgba(0,0,0,0.04)" }}
            formatter={(value) =>
              [Number(value).toLocaleString("en-IN"), "Teams"] as [
                string,
                string,
              ]
            }
          />
          <Bar dataKey="count" radius={[4, 4, 0, 0]} isAnimationActive={false}>
            {data.map((d) => (
              <Cell key={d.key} fill={d.fill} />
            ))}
            <LabelList
              dataKey="count"
              position="top"
              className="fill-foreground"
              fontSize={11}
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
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

const HEATMAP_TABS = [
  "funnel",
  "coverage",
  "engagement",
  "team-status",
] as const;
type HeatmapTab = (typeof HEATMAP_TABS)[number];

export default function HeatmapPage() {
  const { user } = useAuth();
  const isCoordinator = user?.role === "coordinator";
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Active tab is driven by the URL (?tab=…) so deep links and the browser
  // back/forward buttons land on the right section, and each tab loads its own
  // data on demand. Defaults to the funnel.
  const search = useSearch();
  const [location, setLocation] = useLocation();
  const tabParam = new URLSearchParams(search).get("tab");
  const activeTab: HeatmapTab = (HEATMAP_TABS as readonly string[]).includes(
    tabParam ?? "",
  )
    ? (tabParam as HeatmapTab)
    : "funnel";
  const setActiveTab = (v: string) => setLocation(`${location}?tab=${v}`);

  // Programme Funnel: list (default) vs bar-chart view, plus chart orientation.
  const [funnelView, setFunnelView] = useState<"list" | "chart">("list");
  const [funnelChartOrientation, setFunnelChartOrientation] = useState<
    "vertical" | "horizontal"
  >("vertical");

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

  // Heavy per-team grid — only fetched for the tabs that render it.
  const { data, isLoading, error } = useQuery({
    queryKey: ["heatmap", weeksBack, campusFilterForApi ?? "all"],
    queryFn: () =>
      getHeatmap({
        weeksBack,
        ...(campusFilterForApi ? { campusId: campusFilterForApi } : {}),
      }),
    enabled: activeTab === "coverage" || activeTab === "team-status",
  });

  // Campus list for the dropdown (admin only).
  const { data: campuses } = useQuery({
    queryKey: ["campuses-for-heatmap"],
    queryFn: listCampusesForFilter,
    enabled: !isCoordinator,
  });

  // Programme funnel date filter. "Registered teams" baseline ignores this;
  // every other stage is scoped to the chosen range. Default = Today.
  const [funnelRange, setFunnelRange] = useState<"today" | "week" | "custom">(
    "today",
  );
  const [customFrom, setCustomFrom] = useState<string>("");
  const [customTo, setCustomTo] = useState<string>("");

  const funnelDateParams = useMemo<{ from?: string; to?: string }>(() => {
    const fmt = (d: Date) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
        d.getDate(),
      ).padStart(2, "0")}`;
    if (funnelRange === "today") {
      return { from: fmt(new Date()), to: fmt(new Date()) };
    }
    if (funnelRange === "week") {
      const now = new Date();
      const weekAgo = new Date(now.getTime() - 6 * 24 * 60 * 60 * 1000);
      return { from: fmt(weekAgo), to: fmt(now) };
    }
    // custom — only send bounds the user actually picked.
    return {
      ...(customFrom ? { from: customFrom } : {}),
      ...(customTo ? { to: customTo } : {}),
    };
  }, [funnelRange, customFrom, customTo]);

  // Programme funnel + engagement card data. Scoped to the same campus
  // filter as the heatmap so all three sections move together.
  const { data: analytics, isLoading: analyticsLoading } = useQuery({
    queryKey: [
      "heatmap-analytics",
      campusFilterForApi ?? "all",
      funnelDateParams.from ?? "",
      funnelDateParams.to ?? "",
    ],
    queryFn: () =>
      getHeatmapAnalytics({
        ...(campusFilterForApi ? { campusId: campusFilterForApi } : {}),
        ...funnelDateParams,
      }),
    enabled: activeTab === "funnel" || activeTab === "engagement",
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

  // Remind every student who has never logged in — notification + email.
  const [remindNeverOpen, setRemindNeverOpen] = useState(false);
  const neverLoggedCount =
    analytics?.funnel.find((s) => s.key === "never_logged_in_students")
      ?.count ?? 0;
  const remindNeverMut = useMutation({
    mutationFn: () =>
      remindNeverLoggedInStudents(
        campusFilterForApi ? { campusId: campusFilterForApi } : undefined,
      ),
    onSuccess: (r) => {
      toast({
        title: "Reminders sent",
        description: `Targeted ${r.targeted.toLocaleString("en-IN")} never-logged-in student${r.targeted === 1 ? "" : "s"} — ${r.notified.toLocaleString("en-IN")} in-app notification${r.notified === 1 ? "" : "s"}, ${r.emailQueued.toLocaleString("en-IN")} email${r.emailQueued === 1 ? "" : "s"} queued.`,
      });
      setRemindNeverOpen(false);
    },
    onError: (err: Error) => {
      toast({
        title: "Reminder failed",
        description: err.message,
        variant: "destructive",
      });
      setRemindNeverOpen(false);
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

  // Client-side pagination for the per-team table. Rendering all ~1,188 rows
  // (× up to 24 week-cells each) at once bloats the DOM to tens of thousands
  // of nodes, which makes every layout/repaint — including tab switches —
  // janky. Keeping ~50 rows in the DOM keeps interactions instant. Bulk
  // reminders still operate over the full filtered set, not just this page.
  const PAGE_SIZE = 50;
  const [page, setPage] = useState(1);
  const pageCount = Math.max(1, Math.ceil(filteredTeams.length / PAGE_SIZE));

  // Reset to page 1 whenever the filtered result set changes.
  useEffect(() => {
    setPage(1);
  }, [query, filter, selectedCampusId, selectedWeek, weeksBack]);

  // Clamp the page if the result set shrank below the current page.
  useEffect(() => {
    if (page > pageCount) setPage(pageCount);
  }, [page, pageCount]);

  const pagedTeams = useMemo<HeatmapTeamRow[]>(
    () => filteredTeams.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    [filteredTeams, page],
  );

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

      {/* URL-routed tabs (?tab=…): Funnel / Per-team coverage / Engagement /
          Team Status. Each tab loads its own data on demand. */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full max-w-2xl grid-cols-2 sm:grid-cols-4">
          <TabsTrigger value="funnel" data-testid="tab-funnel">
            Funnel
          </TabsTrigger>
          <TabsTrigger value="coverage" data-testid="tab-coverage">
            Per-team coverage
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
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="max-w-4xl">
                  <CardTitle className="text-base">Programme Funnel</CardTitle>
                  <CardDescription>
                    Team-level progression through the programme.{" "}
                    <em>Registered teams</em> is the baseline (all-time); every
                    other stage counts activity within the selected date range.
                    Each row shows count · % of the top stage · step-to-step
                    conversion.
                  </CardDescription>
                </div>
                {/* Controls stack — top row holds the range dropdown then the
                    list/graph icons; the custom date range drops to a row below.
                    shrink-0 keeps the dropdown + icons on one row (no wrap). */}
                <div className="flex flex-col gap-2 sm:items-end shrink-0">
                  <div className="flex flex-wrap items-center gap-2">
                    {/* 1. Range dropdown */}
                    <Select
                      value={funnelRange}
                      onValueChange={(v) =>
                        setFunnelRange(v as "today" | "week" | "custom")
                      }
                    >
                      <SelectTrigger
                        className="w-36"
                        data-testid="funnel-range-select"
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="today">Today</SelectItem>
                        <SelectItem value="week">Last week</SelectItem>
                        <SelectItem value="custom">Custom range</SelectItem>
                      </SelectContent>
                    </Select>

                    {/* Chart orientation — only in graph view */}
                    {funnelView === "chart" && (
                      <Select
                        value={funnelChartOrientation}
                        onValueChange={(v) =>
                          setFunnelChartOrientation(
                            v as "vertical" | "horizontal",
                          )
                        }
                      >
                        <SelectTrigger
                          className="w-32"
                          data-testid="funnel-orientation-select"
                        >
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="vertical">Vertical</SelectItem>
                          <SelectItem value="horizontal">Horizontal</SelectItem>
                        </SelectContent>
                      </Select>
                    )}

                    {/* 2 + 3. List (menu) icon then graph icon */}
                    <div className="flex items-center rounded-md border p-0.5">
                      <button
                        type="button"
                        onClick={() => setFunnelView("list")}
                        className={cn(
                          "inline-flex items-center justify-center rounded-sm p-1.5 transition-colors",
                          funnelView === "list"
                            ? "bg-primary text-primary-foreground"
                            : "text-muted-foreground hover:bg-accent",
                        )}
                        title="List view"
                        data-testid="funnel-view-list"
                      >
                        <List className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setFunnelView("chart")}
                        className={cn(
                          "inline-flex items-center justify-center rounded-sm p-1.5 transition-colors",
                          funnelView === "chart"
                            ? "bg-primary text-primary-foreground"
                            : "text-muted-foreground hover:bg-accent",
                        )}
                        title="Graph view"
                        data-testid="funnel-view-chart"
                      >
                        <BarChart3 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>

                  {/* Custom range — sits below the dropdown + icons row */}
                  {funnelRange === "custom" && (
                    <div className="flex items-center gap-1.5">
                      <Input
                        type="date"
                        value={customFrom}
                        max={customTo || undefined}
                        onChange={(e) => setCustomFrom(e.target.value)}
                        className="w-[150px]"
                        data-testid="funnel-from-date"
                      />
                      <span className="text-xs text-muted-foreground">to</span>
                      <Input
                        type="date"
                        value={customTo}
                        min={customFrom || undefined}
                        onChange={(e) => setCustomTo(e.target.value)}
                        className="w-[150px]"
                        data-testid="funnel-to-date"
                      />
                    </div>
                  )}
                </div>
              </div>
            </CardHeader>
            <CardContent className="pt-2">
              {funnelView === "chart" ? (
                analyticsLoading ? (
                  <div className="flex justify-center py-12">
                    <Spinner className="size-8" />
                  </div>
                ) : (analytics?.funnel ?? []).length === 0 ? (
                  <div className="text-sm text-muted-foreground py-12 text-center">
                    No funnel data yet.
                  </div>
                ) : (
                  <FunnelBarChart
                    stages={analytics?.funnel ?? []}
                    orientation={funnelChartOrientation}
                  />
                )
              ) : (
                <FunnelChart
                  stages={analytics?.funnel ?? []}
                  loading={analyticsLoading}
                  onRemindNeverLogged={() => setRemindNeverOpen(true)}
                  remindingNeverLogged={remindNeverMut.isPending}
                />
              )}
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

        {/* Per-team weekly journal coverage — the heavy grid in its own tab. */}
        <TabsContent value="coverage" className="mt-4">
          <Card>
            <CardContent className="pt-6 space-y-4">
              {/* Top toolbar — bulk button + campus / week dropdowns + clear filters */}
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
                        <th className="text-right pl-2 py-2 font-medium">
                          Action
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {pagedTeams.map((t) => (
                        <tr
                          key={t.teamId}
                          className="border-b hover:bg-accent/30"
                          data-testid={`heatmap-row-${t.teamId}`}
                        >
                          <td className="py-2 pr-3">
                            <div className="font-medium truncate">
                              {t.teamName}
                            </div>
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

                  {/* Pagination — keeps the DOM light by rendering one page of
                  rows at a time. Reminders still act on the full filtered set. */}
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 pt-4 text-sm">
                    <span className="text-muted-foreground tabular-nums">
                      Showing {(page - 1) * PAGE_SIZE + 1}–
                      {Math.min(page * PAGE_SIZE, filteredTeams.length)} of{" "}
                      {filteredTeams.length.toLocaleString("en-IN")} teams
                    </span>
                    {pageCount > 1 && (
                      <div className="flex items-center gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={page <= 1}
                          onClick={() => setPage((p) => Math.max(1, p - 1))}
                          data-testid="heatmap-prev-page"
                        >
                          Previous
                        </Button>
                        <span className="text-muted-foreground tabular-nums px-1">
                          Page {page} of {pageCount}
                        </span>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={page >= pageCount}
                          onClick={() =>
                            setPage((p) => Math.min(pageCount, p + 1))
                          }
                          data-testid="heatmap-next-page"
                        >
                          Next
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

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

      {/* Never-logged-in remind confirmation */}
      <AlertDialog open={remindNeverOpen} onOpenChange={setRemindNeverOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Remind {neverLoggedCount.toLocaleString("en-IN")} never-logged-in
              student{neverLoggedCount === 1 ? "" : "s"}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Every student who has never logged in
              {campusFilterForApi
                ? " (current campus)"
                : " (all campuses)"}{" "}
              will receive both an in-app notification and an email asking them
              to log in. Emails are sent in the background and may take a few
              minutes to finish.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={remindNeverMut.isPending}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={remindNeverMut.isPending || neverLoggedCount === 0}
              onClick={() => remindNeverMut.mutate()}
              data-testid="remind-never-logged-confirm"
            >
              {remindNeverMut.isPending
                ? "Sending…"
                : "Send notification + email"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
