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
import { PageSizeSelect } from "@/components/page-size-select";
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

// Coral funnel palette — matches the BRAVE brand. Each layer's fill is
// interpolated from a lighter coral at the top to a deeper coral at the bottom
// so the stacked funnel reads with subtle depth (t in [0,1], top → bottom).
function funnelColor(t: number): string {
  const top = [232, 150, 130]; // light coral
  const bottom = [199, 102, 78]; // deep coral
  const k = Math.min(Math.max(t, 0), 1);
  const c = top.map((v, i) => Math.round(v + (bottom[i] - v) * k));
  return `rgb(${c[0]}, ${c[1]}, ${c[2]})`;
}

// Compact label shown inside each funnel layer + a short form for the "top
// drop-off" arrow. Falls back to the stage's own label when a key is unmapped.
const FUNNEL_LABELS: Record<string, { display: string; short: string }> = {
  registered_teams: {
    display: "Total registered teams",
    short: "Registration",
  },
  teams_logged_in: { display: "Teams logged in", short: "Login" },
  submitted_journal: { display: "Submitted journals", short: "Journals" },
  visited_client: { display: "Visited clients", short: "Client visit" },
  active_conversation: {
    display: "Active conversation",
    short: "Conversation",
  },
  started_project: { display: "Project started", short: "Project start" },
  closed_project: { display: "Project complete", short: "Complete" },
  registered_students: {
    display: "Total registered students",
    short: "Registration",
  },
  students_logged_in: { display: "Students logged in", short: "Login" },
  students_joined_teams: { display: "Students in a team", short: "In a team" },
  students_not_logged_in: {
    display: "Students not logged in",
    short: "Not logged in",
  },
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

// A true funnel chart (coral trapezoids that narrow as they descend). Each layer
// holds the label, count, and a % pill; a "Drop-off" badge sits on the seam
// between layers. A headline bar shows overall conversion + active-user stats,
// and a side panel flags the "Top Drop-off Point" (biggest single-step leak).
// The inverse side-stat (students who never logged in) keeps its Remind CTA.
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
  showActiveStudents = false,
  extraSideStats = [],
}: {
  stages: { key: string; label: string; count: number }[];
  loading: boolean;
  engagement?: { dau: number; wau: number; mau: number };
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
  // Show the separate Monthly/Weekly/Daily active-students block (students
  // funnel only).
  showActiveStudents?: boolean;
  // Extra "leftover"/negative side-stats shown as plain count callouts in the
  // side panel (e.g. students registered but not in a team).
  extraSideStats?: { label: string; count: number }[];
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
  const subjectNoun = inverseKey != null ? "students" : "teams";

  // Forward stages form the funnel; an inverse stage (students who never logged
  // in) is shown as a "leftover" callout in the side panel with the Remind CTA.
  const forward = stages.filter(
    (s) => !(inverseKey != null && s.key === inverseKey),
  );
  const inverseStage =
    inverseKey != null ? stages.find((s) => s.key === inverseKey) : undefined;
  const n = forward.length;

  // Even, eased taper (decoupled from raw counts) so the funnel always reads as
  // a clean inverted pyramid — magnitude is carried by the count, % pill, and
  // drop-off badge, exactly like the reference. Width is a % of the funnel box.
  const STEP = 9;
  const FLOOR = 42;
  const widthPct = (i: number) => Math.max(100 - i * STEP, FLOOR);

  // Biggest single-step leak, for the "Top Drop-off Point" card.
  let topDrop: {
    fromKey: string;
    fromLabel: string;
    toKey: string;
    toLabel: string;
    dropped: number;
    pct: number;
  } | null = null;
  for (let i = 1; i < n; i++) {
    const prev = forward[i - 1];
    const cur = forward[i];
    const dropped = Math.max(prev.count - cur.count, 0);
    if (!topDrop || dropped > topDrop.dropped) {
      topDrop = {
        fromKey: prev.key,
        fromLabel: prev.label,
        toKey: cur.key,
        toLabel: cur.label,
        dropped,
        pct: prev.count > 0 ? (dropped / prev.count) * 100 : 0,
      };
    }
  }

  return (
    <div className="space-y-4" data-testid="funnel-chart">
      {/* Headline bar — overall conversion + active-user stats. */}
      <div className="flex flex-col gap-3 rounded-xl border bg-gradient-to-r from-rose-50/60 via-background to-indigo-50/40 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <div className="text-2xl font-bold tracking-tight text-[#c96a50]">
            Overall conversion {overall.toFixed(1)}%
          </div>
          <div className="mt-0.5 text-sm text-muted-foreground">
            <span className="font-medium text-foreground">
              {base.toLocaleString("en-IN")}
            </span>{" "}
            {subjectNoun} registered →{" "}
            <span className="font-medium text-foreground">
              {successCount.toLocaleString("en-IN")}
            </span>{" "}
            {successLabel}
          </div>
        </div>
        {!showActiveStudents ? (
          <div
            className="flex shrink-0 gap-6"
            data-testid="funnel-active-users"
          >
            {[
              { label: "Active", value: rangeActiveCount },
              { label: "Daily avg", value: engagement?.dau ?? 0 },
              { label: "Weekly active", value: engagement?.wau ?? 0 },
            ].map((stat) => (
              <div key={stat.label}>
                <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  {stat.label}
                </div>
                <div className="text-lg font-bold tabular-nums">
                  {stat.value.toLocaleString("en-IN")}
                </div>
              </div>
            ))}
          </div>
        ) : null}
      </div>

      {/* Funnel + side panel. */}
      <div className="grid gap-4 lg:grid-cols-[1.7fr_1fr]">
        {/* The funnel — stacked coral trapezoids; drop-off badges on the seams. */}
        <div className="rounded-xl border bg-gradient-to-b from-rose-50/50 to-transparent p-4 sm:p-6">
          <div className="flex flex-col items-stretch">
            {forward.map((s, i) => {
              const wTop = widthPct(i);
              const wBot =
                i < n - 1
                  ? widthPct(i + 1)
                  : Math.max(wTop - STEP, FLOOR * 0.8);
              const rBot = wBot / wTop; // bottom edge as a fraction of this layer's width
              const pctOfTotal = base > 0 ? (s.count / base) * 100 : 0;
              const prev = i > 0 ? forward[i - 1] : null;
              const keptPct =
                prev && prev.count > 0
                  ? Math.min((s.count / prev.count) * 100, 100)
                  : 0;
              return (
                <div key={s.key} className="flex flex-col items-stretch">
                  {/* Step-conversion badge ("% continued") on the seam. */}
                  {i > 0 ? (
                    <div className="relative z-10 -my-2 flex justify-center">
                      <span className="inline-flex items-center rounded-full border bg-white px-2.5 py-0.5 text-[11px] font-semibold text-[#c96a50] shadow-sm">
                        {`${keptPct.toFixed(0)}% continued`}
                      </span>
                    </div>
                  ) : null}

                  {/* Trapezoid layer: label · count · % pill, in white. */}
                  <div
                    className="relative mx-auto flex h-14 items-center"
                    style={{
                      width: `${wTop}%`,
                      background: funnelColor(n > 1 ? i / (n - 1) : 0),
                      clipPath: `polygon(0 0, 100% 0, ${(50 + rBot * 50).toFixed(2)}% 100%, ${(50 - rBot * 50).toFixed(2)}% 100%)`,
                    }}
                    data-testid={`funnel-stage-${s.key}`}
                  >
                    <div className="flex w-full items-center gap-2 px-5 text-white">
                      <span
                        className="flex-1 truncate text-sm font-medium"
                        title={s.label}
                      >
                        {FUNNEL_LABELS[s.key]?.display ?? s.label}
                      </span>
                      <span className="text-lg font-bold tabular-nums">
                        {s.count.toLocaleString("en-IN")}
                      </span>
                      <span className="shrink-0 rounded-full bg-white/25 px-2 py-0.5 text-[11px] font-semibold tabular-nums">
                        {pctOfTotal.toFixed(0)}%
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Active-students footer — integrated inside the funnel card
              (students funnel only). Rolling windows, independent of the range
              dropdown. */}
          {showActiveStudents ? (
            <div className="mt-5 border-t pt-4">
              <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Active students
              </div>
              <div className="grid grid-cols-3 gap-3">
                {[
                  { label: "Monthly", value: engagement?.mau ?? 0 },
                  { label: "Weekly", value: engagement?.wau ?? 0 },
                  { label: "Daily", value: engagement?.dau ?? 0 },
                ].map((m) => (
                  <div
                    key={m.label}
                    className="rounded-lg border bg-white/60 px-3 py-2 text-center"
                  >
                    <div className="text-xl font-bold tabular-nums">
                      {m.value.toLocaleString("en-IN")}
                    </div>
                    <div className="text-[11px] text-muted-foreground">
                      {m.label} active
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>

        {/* Side panel: top drop-off point + inverse leftover/Remind. */}
        <div className="space-y-4">
          <div className="rounded-xl border bg-card p-4">
            <div className="text-sm font-semibold">Top Drop-off Point</div>
            {topDrop ? (
              <div className="mt-3 rounded-lg border-l-4 border-[#c96a50] bg-rose-50/60 p-3">
                <div className="text-[11px] font-semibold uppercase tracking-wide text-[#c96a50]">
                  {FUNNEL_LABELS[topDrop.fromKey]?.short ?? topDrop.fromLabel} →{" "}
                  {FUNNEL_LABELS[topDrop.toKey]?.short ?? topDrop.toLabel}
                </div>
                <div className="mt-1 text-sm text-muted-foreground">
                  <span className="font-semibold text-foreground">
                    {topDrop.dropped.toLocaleString("en-IN")} {subjectNoun}
                  </span>{" "}
                  ({topDrop.pct.toFixed(0)}%) dropped off at this step — the
                  funnel's biggest single leak.
                </div>
              </div>
            ) : (
              <div className="mt-2 text-sm text-muted-foreground">
                No drop-off to report yet.
              </div>
            )}
          </div>

          {inverseStage ? (
            <div className="rounded-xl border border-rose-200 bg-rose-50/50 p-4">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-[#c96a50]">
                {FUNNEL_LABELS[inverseStage.key]?.display ?? inverseStage.label}
              </div>
              <div className="mt-0.5 text-2xl font-bold tabular-nums text-rose-700">
                {inverseStage.count.toLocaleString("en-IN")}
              </div>
              {onRemindNeverLogged ? (
                <Button
                  size="sm"
                  variant="outline"
                  className="mt-3 h-8 w-full border-rose-200 text-rose-700 hover:bg-rose-100 hover:text-rose-800"
                  disabled={remindingNeverLogged || remindTargetCount === 0}
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
          ) : null}

          {extraSideStats.map((stat) => (
            <div
              key={stat.label}
              className="rounded-xl border bg-card p-4"
              data-testid={`funnel-side-stat-${stat.label}`}
            >
              <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                {stat.label}
              </div>
              <div className="mt-0.5 text-2xl font-bold tabular-nums">
                {stat.count.toLocaleString("en-IN")}
              </div>
            </div>
          ))}
        </div>
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
    // All-time structural journey so the funnel always descends cleanly:
    // registered ≥ in a team ≥ logged-in-ever. The date-range dropdown drives
    // the Teams funnel + the Active-students windows below — not this shape.
    const loggedInEver = analytics?.totals.loggedInEver ?? 0;
    const joinedTeams = analytics?.totals.studentsJoinedTeams ?? 0;
    return [
      {
        key: "registered_students",
        label: "Total registered students",
        count: total,
      },
      {
        key: "students_joined_teams",
        label: "Students in a team",
        count: joinedTeams,
      },
      {
        key: "students_logged_in",
        label: "Students logged on the platform at least once",
        count: loggedInEver,
      },
      {
        key: "students_not_logged_in",
        label: "Students not logged in",
        count: Math.max(total - loggedInEver, 0),
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
  const [pageSize, setPageSize] = useState(100);
  const [page, setPage] = useState(1);
  const pageCount = Math.max(1, Math.ceil(filteredTeams.length / pageSize));

  // Reset to page 1 whenever the filtered result set changes.
  useEffect(() => {
    setPage(1);
  }, [query, filter, selectedCampusId, selectedWeek, weeksBack]);

  // Clamp the page if the result set shrank below the current page.
  useEffect(() => {
    if (page > pageCount) setPage(pageCount);
  }, [page, pageCount]);

  const pagedTeams = useMemo<HeatmapTeamRow[]>(
    () => filteredTeams.slice((page - 1) * pageSize, page * pageSize),
    [filteredTeams, page, pageSize],
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
                showActiveStudents={!isTeamsFunnel}
                extraSideStats={
                  isTeamsFunnel
                    ? undefined
                    : [
                        {
                          label: "Registered but not in a team",
                          count: Math.max(
                            (analytics?.totals.totalStudents ?? 0) -
                              (analytics?.totals.studentsJoinedTeams ?? 0),
                            0,
                          ),
                        },
                      ]
                }
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
                    <div className="flex items-center gap-3">
                      <PageSizeSelect
                        value={pageSize}
                        onChange={(s) => {
                          setPageSize(s);
                          setPage(1);
                        }}
                        testId="heatmap-page-size"
                      />
                      <span className="text-muted-foreground tabular-nums">
                        Showing {(page - 1) * pageSize + 1}–
                        {Math.min(page * pageSize, filteredTeams.length)} of{" "}
                        {filteredTeams.length.toLocaleString("en-IN")} teams
                      </span>
                    </div>
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
