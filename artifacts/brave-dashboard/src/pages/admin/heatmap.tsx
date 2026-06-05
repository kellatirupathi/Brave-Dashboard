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
  UserX,
  TrendingDown,
  Target,
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
  registered_students: {
    icon: <Users className="h-4 w-4" />,
    color: "bg-indigo-500",
  },
  students_logged_in: {
    icon: <LogIn className="h-4 w-4" />,
    color: "bg-cyan-500",
  },
  never_logged_in_students: {
    icon: <UserX className="h-4 w-4" />,
    color: "bg-rose-500",
  },
  students_not_logged_in: {
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

// Hex equivalents of the Tailwind funnel colours above — the conic-gradient
// node rings and the gradient spine need real colour values, not class names.
// Keyed by the same backend stage `key`.
const FUNNEL_STAGE_HEX: Record<string, string> = {
  registered_teams: "#94a3b8", // slate-400
  teams_logged_in: "#0ea5e9", // sky-500
  registered_students: "#6366f1", // indigo-500
  students_logged_in: "#06b6d4", // cyan-500
  never_logged_in_students: "#f43f5e", // rose-500
  students_not_logged_in: "#f43f5e", // rose-500
  submitted_journal: "#3b82f6", // blue-500
  visited_client: "#8b5cf6", // violet-500
  active_conversation: "#d946ef", // fuchsia-500
  started_project: "#f59e0b", // amber-500
  closed_project: "#10b981", // emerald-500
};

// The Teams funnel = the team-level journey through the programme, in order.
// Labels are team-centric (the Teams tab makes the subject explicit). Keys
// match the backend analytics payload. The Students funnel is derived
// separately from `totals` + the student login counts.
const TEAM_FUNNEL_STAGES: { key: string; label: string }[] = [
  { key: "registered_teams", label: "Total registered teams" },
  { key: "teams_logged_in", label: "Teams logged in at least once" },
  {
    key: "submitted_journal",
    label: "Teams submitted journals at least once",
  },
  { key: "visited_client", label: "Teams visited clients at least once" },
  {
    key: "active_conversation",
    label: "Teams with at least one active conversation",
  },
  {
    key: "started_project",
    label: "Teams with at least one project started",
  },
  {
    key: "closed_project",
    label: "Teams with at least one project complete",
  },
];

// Colour for a step-conversion pill: green = healthy retention, amber =
// moderate, red = heavy drop-off. Lets admins spot the leaky step at a glance.
function conversionPillClass(pct: number): string {
  if (pct >= 80) return "bg-emerald-100 text-emerald-700";
  if (pct >= 50) return "bg-amber-100 text-amber-700";
  return "bg-red-100 text-red-700";
}

// A bar-free "flow journey" funnel. A single continuous gradient spine is
// threaded through radial share-of-total nodes (each node = a conic ring with
// the stage icon at its core). The retention ribbon riding into every node
// carries the step-to-step conversion and the absolute drop-off, so leakage
// reads on one top-down scan — no bars, no axes. The inverse side-stat (e.g.
// students who never logged in) renders as a dashed rose "leftover" aside that
// hosts the Remind CTA, never as a forward success step.
function FunnelChart({
  stages,
  loading,
  engagement,
  rangeActiveCount,
  successCount,
  successLabel,
  inverseKey = null,
  remindTargetCount = 0,
  onRemindNeverLogged,
  remindingNeverLogged,
}: {
  stages: { key: string; label: string; count: number }[];
  loading: boolean;
  engagement?: { dau: number; wau: number };
  // Active-user count for the headline card (always programme-wide students).
  rangeActiveCount: number;
  // Numerator + caption for the "overall conversion" headline (e.g. teams that
  // completed a project, or students that logged in).
  successCount: number;
  successLabel: string;
  // A stage that is an inverse/side-stat (e.g. students NOT logged in): no
  // conversion pill, and it hosts the "Remind" button. null = none.
  inverseKey?: string | null;
  // All-time count actually targeted by the remind action (never-logged-in).
  remindTargetCount?: number;
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
  const overall = base > 0 ? (successCount / base) * 100 : 0;
  const overallRing = Math.min(Math.max(overall, 0), 100);

  return (
    <div className="space-y-5" data-testid="funnel-chart">
      {/* Headline tiles — overall conversion (with a radial echo) + active
          users. Soft gradient washes give each tile its own identity. */}
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex items-center gap-4 overflow-hidden rounded-xl border bg-gradient-to-br from-primary/[0.07] to-transparent px-4 py-3.5">
          <div
            className="relative h-14 w-14 shrink-0"
            title={`${overall.toFixed(1)}% overall conversion`}
          >
            <div
              className="h-14 w-14 rounded-full"
              style={{
                background: `conic-gradient(hsl(var(--primary)) ${overallRing}%, hsl(var(--muted)) ${overallRing}% 100%)`,
              }}
            />
            <div className="absolute inset-[3px] flex items-center justify-center rounded-full bg-card">
              <Target className="h-5 w-5 text-primary" />
            </div>
          </div>
          <div className="min-w-0">
            <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              Overall conversion
            </div>
            <div className="text-3xl font-bold leading-tight tabular-nums text-primary">
              {overall.toFixed(1)}%
            </div>
            <div className="text-xs text-muted-foreground">
              <span className="font-semibold text-foreground tabular-nums">
                {base.toLocaleString("en-IN")}
              </span>{" "}
              registered →{" "}
              <span className="font-semibold text-foreground tabular-nums">
                {successCount.toLocaleString("en-IN")}
              </span>{" "}
              {successLabel}
            </div>
          </div>
        </div>

        {/* Active users — range-aware count, with the fixed 24h / 7d windows
            shown alongside so the daily/weekly active figures are never lost. */}
        <div
          className="flex items-center gap-4 overflow-hidden rounded-xl border bg-gradient-to-br from-sky-500/[0.07] to-transparent px-4 py-3.5"
          data-testid="funnel-active-users"
        >
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-sky-500/10 text-sky-600">
            <Activity className="h-6 w-6" />
          </div>
          <div className="min-w-0">
            <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              Active users · selected range
            </div>
            <div className="text-3xl font-bold leading-tight tabular-nums text-sky-600">
              {rangeActiveCount.toLocaleString("en-IN")}
            </div>
            <div className="text-xs text-muted-foreground">
              <span className="font-semibold text-foreground tabular-nums">
                {(engagement?.dau ?? 0).toLocaleString("en-IN")}
              </span>{" "}
              daily (24h) ·{" "}
              <span className="font-semibold text-foreground tabular-nums">
                {(engagement?.wau ?? 0).toLocaleString("en-IN")}
              </span>{" "}
              weekly (7d)
            </div>
          </div>
        </div>
      </div>

      {/* The journey — a continuous gradient spine threaded through radial
          share-of-total nodes. Each forward stage shows the retention ribbon
          (% continued + drop-off) riding in from the stage above. No bars. */}
      <div className="pl-1">
        {stages.map((s, i) => {
          const isInverse = inverseKey != null && s.key === inverseKey;
          const pctOfTotal = base > 0 ? (s.count / base) * 100 : 0;
          // Nearest EARLIER non-inverse stage — the side-stat never breaks the
          // forward chain, so conversion always compares real stage to real
          // stage.
          const prev = (() => {
            for (let k = i - 1; k >= 0; k--) {
              if (!(inverseKey != null && stages[k].key === inverseKey))
                return stages[k];
            }
            return null;
          })();
          const stepPct =
            isInverse || !prev || prev.count <= 0
              ? null
              : (s.count / prev.count) * 100;
          const dropped = prev ? Math.max(prev.count - s.count, 0) : 0;
          const droppedPct =
            prev && prev.count > 0 ? (dropped / prev.count) * 100 : 0;
          const meta = FUNNEL_STAGE_META[s.key] ?? {
            icon: null,
            color: "bg-primary",
          };
          const hex = FUNNEL_STAGE_HEX[s.key] ?? "#6366f1";
          const prevHex = prev
            ? (FUNNEL_STAGE_HEX[prev.key] ?? "#6366f1")
            : hex;
          const nextStage = stages[i + 1];
          const nextHex = nextStage
            ? (FUNNEL_STAGE_HEX[nextStage.key] ?? "#6366f1")
            : hex;
          const nextIsInverse =
            inverseKey != null && nextStage?.key === inverseKey;
          const ringPct = Math.min(Math.max(pctOfTotal, 0), 100);
          const isLast = i === stages.length - 1;
          return (
            <div
              key={s.key}
              className="relative grid grid-cols-[3.5rem_minmax(0,1fr)] gap-x-3 sm:gap-x-4"
              data-testid={`funnel-stage-${s.key}`}
            >
              {/* Left rail: incoming spine · node · outgoing spine. */}
              <div className="relative flex flex-col items-center">
                {i > 0 ? (
                  <div className="flex w-full flex-1 justify-center">
                    <div
                      className={cn(
                        "w-1 flex-1",
                        isInverse
                          ? "border-l-2 border-dashed border-rose-300"
                          : "rounded-full",
                      )}
                      style={
                        isInverse
                          ? undefined
                          : {
                              backgroundImage: `linear-gradient(to bottom, ${prevHex}, ${hex})`,
                            }
                      }
                    />
                  </div>
                ) : (
                  <div className="flex-1" />
                )}

                {/* Radial share-of-total node with the stage icon at its core
                    and a floating share badge. */}
                <div
                  className="relative my-1.5 h-14 w-14 shrink-0"
                  title={`${pctOfTotal.toFixed(0)}% of the top stage`}
                >
                  <div
                    className={cn(
                      "h-14 w-14 rounded-full shadow-sm ring-1",
                      isInverse ? "ring-rose-200" : "ring-black/5",
                    )}
                    style={{
                      background: `conic-gradient(${hex} ${ringPct}%, hsl(var(--muted)) ${ringPct}% 100%)`,
                    }}
                  />
                  <div
                    className={cn(
                      "absolute inset-[4px] flex items-center justify-center rounded-full text-white",
                      meta.color,
                    )}
                  >
                    {meta.icon}
                  </div>
                  <span className="absolute -bottom-1 -right-1 rounded-full border border-background bg-card px-1.5 py-px text-[10px] font-bold tabular-nums text-foreground shadow-sm">
                    {pctOfTotal.toFixed(0)}%
                  </span>
                </div>

                {!isLast ? (
                  <div className="flex w-full flex-1 justify-center">
                    <div
                      className={cn(
                        "w-1 flex-1",
                        nextIsInverse
                          ? "border-l-2 border-dashed border-rose-300"
                          : "rounded-full",
                      )}
                      style={
                        nextIsInverse
                          ? undefined
                          : {
                              backgroundImage: `linear-gradient(to bottom, ${hex}, ${nextHex})`,
                            }
                      }
                    />
                  </div>
                ) : (
                  <div className="flex-1" />
                )}
              </div>

              {/* Right: retention ribbon · stage card. */}
              <div className="min-w-0 pb-3 pt-1.5">
                {/* Retention ribbon — % continued + absolute drop-off. */}
                {i > 0 && stepPct !== null ? (
                  <div className="mb-2 flex flex-wrap items-center gap-1.5">
                    <span
                      className={cn(
                        "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold tabular-nums",
                        conversionPillClass(stepPct),
                      )}
                      title="Continued from the previous stage"
                    >
                      {stepPct.toFixed(0)}% continued
                    </span>
                    {dropped > 0 ? (
                      <span
                        className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-2 py-0.5 text-[11px] font-semibold tabular-nums text-rose-600"
                        title="Dropped off since the previous stage"
                      >
                        <TrendingDown className="h-3 w-3" />−
                        {dropped.toLocaleString("en-IN")} ·{" "}
                        {droppedPct.toFixed(0)}%
                      </span>
                    ) : null}
                  </div>
                ) : null}

                {/* Stage card. */}
                <div
                  className={cn(
                    "rounded-2xl border bg-card px-4 py-3 shadow-sm transition-shadow hover:shadow-md",
                    isInverse && "border-dashed border-rose-200 bg-rose-50/40",
                  )}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      {isInverse ? (
                        <span className="mb-0.5 inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-rose-500">
                          <UserX className="h-3 w-3" />
                          leftover · never logged in
                        </span>
                      ) : i === 0 ? (
                        <span className="mb-0.5 inline-block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                          top of funnel
                        </span>
                      ) : null}
                      <div
                        className="truncate text-sm font-medium leading-snug"
                        title={s.label}
                      >
                        {s.label}
                      </div>
                      <div className="mt-0.5 flex items-baseline gap-1.5">
                        <span
                          className="text-2xl font-bold tabular-nums"
                          style={{ color: isInverse ? "#e11d48" : hex }}
                        >
                          {s.count.toLocaleString("en-IN")}
                        </span>
                        {i > 0 ? (
                          <span className="text-xs text-muted-foreground tabular-nums">
                            of {base.toLocaleString("en-IN")}
                          </span>
                        ) : null}
                      </div>
                    </div>

                    {/* Remind CTA — inverse stage only. */}
                    {isInverse && onRemindNeverLogged ? (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 shrink-0 border-rose-200 px-2.5 text-xs text-rose-600 hover:bg-rose-100 hover:text-rose-700"
                        disabled={
                          remindingNeverLogged || remindTargetCount === 0
                        }
                        onClick={onRemindNeverLogged}
                        title="Send a notification + email to every student who has never logged in"
                        data-testid="funnel-remind-never-logged"
                      >
                        <Bell className="mr-1 h-3 w-3" />
                        {remindingNeverLogged
                          ? "Sending…"
                          : `Remind ${remindTargetCount.toLocaleString("en-IN")}`}
                      </Button>
                    ) : null}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
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

const HEATMAP_TABS = ["funnel", "coverage"] as const;
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
    enabled: activeTab === "coverage",
  });

  // Campus list for the dropdown (admin only).
  const { data: campuses } = useQuery({
    queryKey: ["campuses-for-heatmap"],
    queryFn: listCampusesForFilter,
    enabled: !isCoordinator,
  });

  // Programme funnel date filter. "Registered teams" baseline ignores this;
  // every other stage is scoped to the chosen range. Default = Today.
  const [funnelRange, setFunnelRange] = useState<
    "today" | "week" | "all" | "custom"
  >("today");
  // Which entity's funnel is shown — Teams (default) or Students. Same chart,
  // same controls; only the underlying stage data swaps.
  const [funnelEntity, setFunnelEntity] = useState<"teams" | "students">(
    "teams",
  );
  const [customFrom, setCustomFrom] = useState<string>("");
  const [customTo, setCustomTo] = useState<string>("");

  const funnelDateParams = useMemo<{
    from?: string;
    to?: string;
    range?: "all";
  }>(() => {
    const fmt = (d: Date) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
        d.getDate(),
      ).padStart(2, "0")}`;
    if (funnelRange === "all") {
      return { range: "all" };
    }
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
      funnelDateParams.range ?? "",
    ],
    queryFn: () =>
      getHeatmapAnalytics({
        ...(campusFilterForApi ? { campusId: campusFilterForApi } : {}),
        ...funnelDateParams,
      }),
    enabled: activeTab === "funnel",
  });

  // Split the single analytics payload into the two funnels. The Teams funnel
  // is the team-level journey (always 7 stages); the Students funnel is
  // registration → logged in → not logged in, derived from totals + the
  // student login counts (both scoped to the selected range; "All time" ⇒
  // ever / never).
  const teamFunnelStages = useMemo(() => {
    const byKey = new Map(
      (analytics?.funnel ?? []).map((s) => [s.key, s.count] as const),
    );
    return TEAM_FUNNEL_STAGES.map((t) => ({
      key: t.key,
      label: t.label,
      count: byKey.get(t.key) ?? 0,
    }));
  }, [analytics]);
  const studentFunnelStages = useMemo(() => {
    const total = analytics?.totals.totalStudents ?? 0;
    const loggedIn =
      (analytics?.funnel ?? []).find((s) => s.key === "students_logged_in")
        ?.count ?? 0;
    return [
      {
        key: "registered_students",
        label: "Total registered students",
        count: total,
      },
      {
        key: "students_logged_in",
        label: "Students logged in at least once",
        count: loggedIn,
      },
      {
        key: "students_not_logged_in",
        label: "Students not logged in at least once",
        count: Math.max(total - loggedIn, 0),
      },
    ];
  }, [analytics]);

  const isTeamsFunnel = funnelEntity === "teams";
  const activeFunnelStages = isTeamsFunnel
    ? teamFunnelStages
    : studentFunnelStages;
  // Headline "overall conversion" endpoint per entity.
  const funnelSuccessCount = isTeamsFunnel
    ? (teamFunnelStages.find((s) => s.key === "closed_project")?.count ?? 0)
    : (studentFunnelStages.find((s) => s.key === "students_logged_in")?.count ??
      0);
  const funnelSuccessLabel = isTeamsFunnel
    ? "completed a project"
    : "logged in";
  const funnelInverseKey = isTeamsFunnel ? null : "students_not_logged_in";
  // Active-users card is always programme-wide student logins for the range.
  const funnelRangeActive =
    (analytics?.funnel ?? []).find((s) => s.key === "students_logged_in")
      ?.count ?? 0;

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
        <TabsList className="grid w-full max-w-md grid-cols-2">
          <TabsTrigger value="funnel" data-testid="tab-funnel">
            Funnel
          </TabsTrigger>
          <TabsTrigger value="coverage" data-testid="tab-coverage">
            Per-team coverage
          </TabsTrigger>
        </TabsList>

        {/* Funnel — bar-free flow journey, reads top-down as a conversion funnel */}
        <TabsContent value="funnel" className="mt-4">
          <Card>
            <CardHeader>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="max-w-4xl">
                  <CardTitle className="text-base">Programme Funnel</CardTitle>
                  <CardDescription>
                    Switch between the <em>Teams</em> and <em>Students</em>{" "}
                    funnels below. The first stage (registered) is the all-time
                    baseline; every other stage counts activity within the
                    selected date range. Each row shows count · % of the top
                    stage · step-to-step conversion.
                  </CardDescription>
                </div>
                {/* Controls stack — the range dropdown, with the custom date
                    range dropping to a row below it. shrink-0 keeps it on one
                    row (no wrap). */}
                <div className="flex flex-col gap-2 sm:items-end shrink-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <Select
                      value={funnelRange}
                      onValueChange={(v) =>
                        setFunnelRange(v as "today" | "week" | "all" | "custom")
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
                        <SelectItem value="all">All time</SelectItem>
                        <SelectItem value="custom">Custom range</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Custom range — sits below the range dropdown */}
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
              {/* Teams / Students switch — same chart + controls, different
                  data. Defaults to Teams. */}
              <Tabs
                value={funnelEntity}
                onValueChange={(v) =>
                  setFunnelEntity(v as "teams" | "students")
                }
                className="mb-4"
              >
                <TabsList>
                  <TabsTrigger value="teams" data-testid="funnel-entity-teams">
                    Teams
                  </TabsTrigger>
                  <TabsTrigger
                    value="students"
                    data-testid="funnel-entity-students"
                  >
                    Students
                  </TabsTrigger>
                </TabsList>
              </Tabs>

              <FunnelChart
                stages={activeFunnelStages}
                loading={analyticsLoading}
                engagement={analytics?.engagement}
                rangeActiveCount={funnelRangeActive}
                successCount={funnelSuccessCount}
                successLabel={funnelSuccessLabel}
                inverseKey={funnelInverseKey}
                remindTargetCount={neverLoggedCount}
                onRemindNeverLogged={
                  isTeamsFunnel ? undefined : () => setRemindNeverOpen(true)
                }
                remindingNeverLogged={remindNeverMut.isPending}
              />
            </CardContent>
          </Card>
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
