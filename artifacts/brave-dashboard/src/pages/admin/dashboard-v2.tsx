import {
  useMemo,
  useState,
  type ComponentType,
  type CSSProperties,
  type ReactNode,
} from "react";
import { useGetDashboardSummary } from "@workspace/api-client-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import {
  Activity,
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  ArrowUpRight,
  Bell,
  BookOpenCheck,
  Building2,
  CheckCircle2,
  ClipboardCheck,
  Clock3,
  FileCheck2,
  HelpCircle,
  ListChecks,
  Trophy,
  Users,
  WalletCards,
} from "lucide-react";
import { formatINR } from "@/lib/format";
import { Spinner } from "@/components/ui/spinner";
import { Button } from "@/components/ui/button";
import { HelpMenu } from "@/components/help-menu";
import { SeasonSwitcher } from "@/components/season-switcher";
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
  sendBulkHeatmapReminders,
} from "@/lib/progress-api";

const PANEL =
  "rounded-2xl border border-[#e7e3db] bg-white shadow-[0_1px_2px_rgba(28,25,23,0.04)] dark:border-border dark:bg-card";
const MUTED = "text-[#7b756d] dark:text-muted-foreground";
const INK = "text-[#24211d] dark:text-foreground";
type IconComponent = ComponentType<{
  className?: string;
  style?: CSSProperties;
}>;

type SparklineProps = {
  values: number[];
  color?: string;
  fill?: string;
};

function Sparkline({
  values,
  color = "#b45309",
  fill = "rgba(180,83,9,0.10)",
}: SparklineProps) {
  const safeValues = values.length > 1 ? values : [values[0] ?? 0, values[0] ?? 0];
  const max = Math.max(...safeValues, 1);
  const min = Math.min(...safeValues, 0);
  const range = max - min || 1;
  const points = safeValues
    .map((value, index) => {
      const x = (index / (safeValues.length - 1)) * 100;
      const y = 28 - ((value - min) / range) * 24;
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(" ");
  const area = `0,32 ${points} 100,32`;

  return (
    <svg
      aria-hidden="true"
      className="h-9 w-full overflow-visible"
      viewBox="0 0 100 32"
      preserveAspectRatio="none"
    >
      <polygon points={area} fill={fill} />
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

function SectionHeading({
  icon: Icon,
  title,
  eyebrow,
  action,
}: {
  icon: IconComponent;
  title: string;
  eyebrow?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="flex min-w-0 items-start gap-2.5">
        <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-[#f5efe5] text-[#a16207] dark:bg-primary/10 dark:text-primary">
          <Icon className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          {eyebrow ? (
            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#a16207] dark:text-primary">
              {eyebrow}
            </p>
          ) : null}
          <h2 className={cn("truncate text-sm font-bold tracking-tight", INK)}>
            {title}
          </h2>
        </div>
      </div>
      {action}
    </div>
  );
}

function SmallLink({
  href,
  children,
  testId,
}: {
  href: string;
  children: ReactNode;
  testId?: string;
}) {
  return (
    <Link
      href={href}
      data-testid={testId}
      className="inline-flex shrink-0 items-center gap-1 text-xs font-semibold text-[#a16207] transition-colors hover:text-[#854d0e] hover:underline dark:text-primary"
    >
      {children}
      <ArrowRight className="h-3.5 w-3.5" />
    </Link>
  );
}

function RevenueKpi({
  label,
  value,
  detail,
  href,
  testId,
  icon: Icon,
  accent = "amber",
}: {
  label: string;
  value: string;
  detail: string;
  href: string;
  testId: string;
  icon: IconComponent;
  accent?: "amber" | "slate" | "rose";
}) {
  const accents = {
    amber: "bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-300",
    slate: "bg-stone-100 text-stone-600 dark:bg-muted dark:text-muted-foreground",
    rose: "bg-rose-50 text-rose-700 dark:bg-rose-950/30 dark:text-rose-300",
  };

  return (
    <Link
      href={href}
      data-testid={testId}
      className={cn(
        PANEL,
        "group min-w-0 p-4 transition-shadow hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-[#a16207] focus-visible:ring-offset-2",
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className={cn("grid h-8 w-8 place-items-center rounded-lg", accents[accent])}>
          <Icon className="h-4 w-4" />
        </span>
        <ArrowUpRight className="h-4 w-4 text-[#b9b1a7] transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
      </div>
      <p className={cn("mt-4 text-[11px] font-semibold uppercase tracking-[0.11em]", MUTED)}>
        {label}
      </p>
      <p className={cn("mt-1 truncate text-xl font-extrabold tracking-tight sm:text-2xl", INK)}>
        {value}
      </p>
      <p className={cn("mt-1 text-xs", MUTED)}>{detail}</p>
    </Link>
  );
}

function HealthMetric({
  label,
  value,
  href,
  icon: Icon,
  tone = "default",
  testId,
}: {
  label: string;
  value: string;
  href: string;
  icon: IconComponent;
  tone?: "default" | "warn" | "positive";
  testId: string;
}) {
  const toneClass =
    tone === "warn"
      ? "text-amber-700 dark:text-amber-300"
      : tone === "positive"
        ? "text-emerald-700 dark:text-emerald-400"
        : INK;

  return (
    <Link
      href={href}
      data-testid={testId}
      className="group flex min-w-0 items-center gap-3 rounded-xl border border-[#eeeae3] bg-[#fcfbf8] p-3 transition-colors hover:border-[#d9c6a6] hover:bg-[#faf7f0] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#a16207] dark:border-border dark:bg-muted/20 dark:hover:bg-muted/40"
    >
      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-white text-[#8a8278] shadow-sm dark:bg-card dark:text-muted-foreground">
        <Icon className="h-4 w-4" />
      </span>
      <span className="min-w-0">
        <span className={cn("block truncate text-[11px] font-semibold uppercase tracking-wide", MUTED)}>
          {label}
        </span>
        <span className={cn("mt-0.5 block text-lg font-extrabold tabular-nums", toneClass)}>
          {value}
        </span>
      </span>
      <ArrowRight className="ml-auto h-3.5 w-3.5 shrink-0 text-[#c9c0b5] transition-transform group-hover:translate-x-0.5" />
    </Link>
  );
}

function ActivityCard({
  label,
  value,
  detail,
  values,
  icon: Icon,
  color,
}: {
  label: string;
  value: string;
  detail: string;
  values?: number[];
  icon: IconComponent;
  color: string;
}) {
  return (
    <div className="min-w-0 rounded-xl border border-[#eeeae3] bg-[#fcfbf8] p-3 dark:border-border dark:bg-muted/20">
      <div className="flex items-center justify-between gap-2">
        <span className={cn("truncate text-[10px] font-bold uppercase tracking-[0.12em]", MUTED)}>
          {label}
        </span>
        <Icon className="h-3.5 w-3.5 shrink-0" style={{ color }} />
      </div>
      <div className="mt-2 flex items-end justify-between gap-2">
        <div>
          <p className={cn("text-xl font-extrabold tabular-nums", INK)}>{value}</p>
          <p className={cn("mt-0.5 text-[11px]", MUTED)}>{detail}</p>
        </div>
        {values ? (
          <div className="w-20 shrink-0">
            <Sparkline values={values} color={color} fill={`${color}18`} />
          </div>
        ) : null}
      </div>
    </div>
  );
}

function PipelineRow({
  label,
  value,
  width,
  color,
}: {
  label: string;
  value: string;
  width: number;
  color: string;
}) {
  return (
    <div className="grid grid-cols-[88px_minmax(0,1fr)_92px] items-center gap-3">
      <span className={cn("truncate text-xs font-semibold", MUTED)}>{label}</span>
      <div className="h-2.5 overflow-hidden rounded-full bg-[#eeeae3] dark:bg-muted">
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${Math.max(0, Math.min(100, width))}%`, backgroundColor: color }}
        />
      </div>
      <span className={cn("text-right text-xs font-bold tabular-nums", INK)}>{value}</span>
    </div>
  );
}

type Coverage = {
  currentWeek: string;
  submitted: number;
  total: number;
  pct: number;
  campusCount: number;
  silentCount: number;
  neverCount: number;
};

function JournalCoverageCard({
  coverage,
  silentTeams,
  onBulkRemind,
  isReminding,
}: {
  coverage: Coverage | null;
  silentTeams: { teamId: number }[];
  onBulkRemind: () => void;
  isReminding: boolean;
}) {
  const pct = coverage?.pct ?? 0;
  const health =
    pct >= 80
      ? { label: "Healthy", color: "text-emerald-700 dark:text-emerald-400", bar: "bg-emerald-500" }
      : pct >= 50
        ? { label: "At risk", color: "text-amber-700 dark:text-amber-300", bar: "bg-amber-500" }
        : { label: "Needs attention", color: "text-rose-700 dark:text-rose-400", bar: "bg-rose-500" };

  return (
    <section className={cn(PANEL, "p-5")} data-testid="admin-v2-journal-coverage">
      <div className="flex items-start justify-between gap-3">
        <SectionHeading
          icon={BookOpenCheck}
          eyebrow="Engagement"
          title="Journal coverage"
        />
        {coverage ? (
          <span className={cn("flex items-center gap-1.5 text-xs font-bold", health.color)}>
            <span className={cn("h-1.5 w-1.5 rounded-full", health.bar)} />
            {health.label}
          </span>
        ) : null}
      </div>
      {!coverage ? (
        <p className={cn("mt-6 text-sm", MUTED)}>
          No programme weeks or active teams are available yet.
        </p>
      ) : (
        <>
          <div className="mt-6 flex items-end justify-between gap-3">
            <div>
              <p className={cn("text-4xl font-extrabold tracking-tight", health.color)}>
                {pct}%
              </p>
              <p className={cn("mt-1 text-xs", MUTED)}>
                {coverage.submitted} of {coverage.total} teams submitted this week
              </p>
            </div>
            <span className={cn("pb-1 text-[11px] font-semibold uppercase tracking-wide", MUTED)}>
              Week starting {coverage.currentWeek}
            </span>
          </div>
          <div className="mt-4 h-2.5 overflow-hidden rounded-full bg-[#eeeae3] dark:bg-muted">
            <div className={cn("h-full rounded-full", health.bar)} style={{ width: `${pct}%` }} />
          </div>
          <div className="mt-4 grid grid-cols-3 gap-2">
            {[
              ["Submitted", coverage.submitted, "text-emerald-700 dark:text-emerald-400"],
              ["Silent", coverage.silentCount, "text-rose-700 dark:text-rose-400"],
              ["Never logged", coverage.neverCount, MUTED],
            ].map(([label, value, tone]) => (
              <div key={label as string} className="rounded-lg bg-[#f8f6f1] p-2.5 dark:bg-muted/30">
                <p className={cn("text-lg font-extrabold tabular-nums", tone as string)}>{value}</p>
                <p className={cn("mt-0.5 truncate text-[10px] font-semibold uppercase tracking-wide", MUTED)}>
                  {label}
                </p>
              </div>
            ))}
          </div>
        </>
      )}
      <div className="mt-5 flex flex-wrap gap-2">
        <Button asChild size="sm" variant="outline" className="rounded-lg">
          <Link href="/admin/heatmap" data-testid="admin-v2-coverage-heatmap">
            <Activity className="mr-1.5 h-3.5 w-3.5" />
            Open heatmap
          </Link>
        </Button>
        <Button
          size="sm"
          className="rounded-lg"
          disabled={silentTeams.length === 0 || isReminding}
          onClick={onBulkRemind}
          data-testid="admin-v2-bulk-remind"
        >
          <Bell className="mr-1.5 h-3.5 w-3.5" />
          Remind {silentTeams.length} team{silentTeams.length === 1 ? "" : "s"}
        </Button>
      </div>
    </section>
  );
}

export default function AdminDashboardV2() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: summary, isLoading } = useGetDashboardSummary();
  const [bulkOpen, setBulkOpen] = useState(false);

  const { data: heatmap } = useQuery({
    queryKey: ["admin-heatmap-national", 8],
    queryFn: () => getHeatmap({ weeksBack: 8 }),
  });

  const bulkRemindMut = useMutation({
    mutationFn: sendBulkHeatmapReminders,
    onSuccess: (response) => {
      toast({
        title: "Bulk reminder sent",
        description: `Pinged ${response.sentToTeams} team${response.sentToTeams === 1 ? "" : "s"} (${response.sentToUsers} member${response.sentToUsers === 1 ? "" : "s"}).${response.skippedTeams > 0 ? ` Skipped ${response.skippedTeams}.` : ""}`,
      });
      setBulkOpen(false);
      queryClient.invalidateQueries({ queryKey: ["admin-heatmap-national"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Bulk reminder failed",
        description: error.message,
        variant: "destructive",
      });
      setBulkOpen(false);
    },
  });

  const coverage = useMemo<Coverage | null>(() => {
    if (!heatmap || heatmap.weeks.length === 0 || heatmap.teams.length === 0) return null;
    const currentWeek = heatmap.weeks[heatmap.weeks.length - 1];
    const submitted = heatmap.teams.filter((team) =>
      team.weeks.some((week) => week.weekStartDate === currentWeek && week.hasJournal),
    ).length;
    const campusCount = new Set(
      heatmap.teams
        .map((team) => team.campusId)
        .filter((id): id is number => id != null),
    ).size;
    return {
      currentWeek,
      submitted,
      total: heatmap.teams.length,
      pct: Math.round((submitted / heatmap.teams.length) * 100),
      campusCount,
      silentCount: heatmap.teams.filter((team) => team.status === "silent").length,
      neverCount: heatmap.teams.filter((team) => team.status === "never_logged").length,
    };
  }, [heatmap]);

  const silentTeams = useMemo(
    () =>
      heatmap?.teams.filter(
        (team) => team.status === "silent" || team.status === "never_logged",
      ) ?? [],
    [heatmap],
  );

  const worstCampuses = useMemo(() => {
    if (!heatmap || heatmap.weeks.length === 0) return [];
    const currentWeek = heatmap.weeks[heatmap.weeks.length - 1];
    const campuses = new Map<
      number,
      {
        campusId: number;
        campusName: string;
        total: number;
        submitted: number;
        silent: number;
      }
    >();

    for (const team of heatmap.teams) {
      if (team.campusId == null) continue;
      const campus = campuses.get(team.campusId) ?? {
        campusId: team.campusId,
        campusName: team.campusName ?? `Campus #${team.campusId}`,
        total: 0,
        submitted: 0,
        silent: 0,
      };
      campus.total += 1;
      if (
        team.weeks.some(
          (week) =>
            week.weekStartDate === currentWeek && week.hasJournal,
        )
      ) {
        campus.submitted += 1;
      }
      if (team.status === "silent" || team.status === "never_logged") {
        campus.silent += 1;
      }
      campuses.set(team.campusId, campus);
    }

    return Array.from(campuses.values())
      .map((campus) => ({
        ...campus,
        pct:
          campus.total === 0
            ? 0
            : Math.round((campus.submitted / campus.total) * 100),
      }))
      .sort((a, b) => a.pct - b.pct || b.silent - a.silent)
      .slice(0, 4);
  }, [heatmap]);

  const journalActivity = useMemo(() => {
    if (!heatmap) return [0, 0, 0, 0, 0, 0, 0];
    return heatmap.weeks.map((week) =>
      heatmap.teams.filter((team) =>
        team.weeks.some((item) => item.weekStartDate === week && item.hasJournal),
      ).length,
    );
  }, [heatmap]);

  const gritSummary = summary as
    | (typeof summary & { maxGritMiles?: number; gritAchievedTeams?: number })
    | undefined;

  if (isLoading || !summary) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  const maxGritMiles = gritSummary?.maxGritMiles ?? 0;
  const gritAchievedTeams = gritSummary?.gritAchievedTeams ?? 0;
  const totalPendingRevenue = summary.totalPendingRevenue ?? 0;
  const totalRejectedRevenue = summary.totalRejectedRevenue ?? 0;
  const maxPipelineValue = Math.max(
    summary.totalVerifiedRevenue,
    summary.totalOrderBook,
    totalPendingRevenue,
    totalRejectedRevenue,
    1,
  );
  const totalOpenWork =
    summary.pendingReviewCount +
    summary.pendingDemoDayCount +
    summary.pendingTeams +
    summary.pendingAccessRequestCount;
  const conversionBase = summary.totalVerifiedRevenue + totalPendingRevenue;
  const verifiedConversion =
    conversionBase > 0
      ? Math.round((summary.totalVerifiedRevenue / conversionBase) * 100)
      : 0;
  const openWorkHref =
    summary.pendingReviewCount > 0
      ? "/admin/queue"
      : summary.pendingDemoDayCount > 0
        ? "/admin/demo-day-submissions"
        : summary.pendingTeams > 0
          ? "/admin/team-requests"
          : "/admin/roster";

  const healthMetrics = [
    {
      label: "Active teams",
      value: summary.activeTeams.toLocaleString(),
      href: "/admin/teams",
      icon: Users,
      testId: "admin-v2-health-active-teams",
    },
    {
      label: "Campuses",
      value: summary.totalCampuses.toLocaleString(),
      href: "/admin/campuses",
      icon: Building2,
      testId: "admin-v2-health-campuses",
    },
    {
      label: "Demo Day eligible",
      value: summary.demoEligibleTeams.toLocaleString(),
      href: "/admin/demo-day-submissions",
      icon: Trophy,
      tone: "positive" as const,
      testId: "admin-v2-health-demo-day",
    },
    {
      label: "GRIT Miles",
      value: maxGritMiles.toLocaleString(),
      href: "/admin/teams",
      icon: ArrowUpRight,
      tone: "positive" as const,
      testId: "admin-v2-health-grit",
    },
    {
      label: "Teams at GRIT level",
      value: gritAchievedTeams.toLocaleString(),
      href: "/admin/teams",
      icon: CheckCircle2,
      tone: "positive" as const,
      testId: "admin-v2-health-grit-teams",
    },
    {
      label: "Pending reviews",
      value: summary.pendingReviewCount.toLocaleString(),
      href: "/admin/queue",
      icon: ClipboardCheck,
      tone: summary.pendingReviewCount > 0 ? ("warn" as const) : ("default" as const),
      testId: "admin-v2-health-reviews",
    },
    {
      label: "Teams awaiting approval",
      value: summary.pendingTeams.toLocaleString(),
      href: "/admin/team-requests",
      icon: ListChecks,
      tone: summary.pendingTeams > 0 ? ("warn" as const) : ("default" as const),
      testId: "admin-v2-health-team-requests",
    },
    {
      label: "Roster requests",
      value: summary.pendingAccessRequestCount.toLocaleString(),
      href: "/admin/roster",
      icon: Users,
      tone: summary.pendingAccessRequestCount > 0 ? ("warn" as const) : ("default" as const),
      testId: "admin-v2-health-roster",
    },
  ];

  return (
    <>
      <div
        className="min-w-0 space-y-6 rounded-3xl bg-[#f8f6f1] p-1 text-[#24211d] dark:bg-background dark:text-foreground sm:p-2"
        data-testid="admin-dashboard-v2"
      >
        <header className="flex flex-col gap-4 px-1 sm:flex-row sm:items-start sm:justify-between sm:px-2">
          <div className="flex items-start gap-3">
            <div className="mt-1 h-10 w-1 rounded-full bg-[#b45309]" />
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-2xl font-extrabold tracking-tight sm:text-3xl">
                  National Command Center
                </h1>
                <span className="rounded-full bg-[#292524] px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.12em] text-white dark:bg-primary">
                  BRAVE 2.0
                </span>
              </div>
              <p className={cn("mt-1 text-sm", MUTED)}>
                Program-wide health, revenue, and engagement at a glance.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 self-start">
            <SeasonSwitcher />
            <HelpMenu inline />
          </div>
        </header>

        {totalOpenWork > 0 ? (
          <div className="flex flex-col gap-3 rounded-2xl border border-amber-300/70 bg-amber-50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5 dark:border-amber-700/50 dark:bg-amber-950/20">
            <div className="flex items-start gap-3">
              <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-amber-200/70 text-amber-800 dark:bg-amber-900/50 dark:text-amber-200">
                <AlertTriangle className="h-4 w-4" />
              </span>
              <div>
                <p className="text-sm font-bold text-amber-950 dark:text-amber-100">
                  {totalOpenWork} open item{totalOpenWork === 1 ? "" : "s"} need attention
                </p>
                <p className="mt-0.5 text-xs text-amber-800/80 dark:text-amber-200/80">
                  {summary.pendingReviewCount} reviews · {summary.pendingDemoDayCount} Demo Day ·{" "}
                  {summary.pendingTeams} team approvals · {summary.pendingAccessRequestCount} roster requests
                </p>
              </div>
            </div>
            <Link
              href={openWorkHref}
              className="inline-flex h-8 items-center gap-1.5 self-start rounded-lg bg-amber-600 px-3 text-xs font-bold text-white hover:bg-amber-700 sm:self-center"
            >
                Open next item
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        ) : null}

        <section className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4" data-testid="admin-v2-revenue-kpis">
          <RevenueKpi
            label="Verified revenue"
            value={formatINR(summary.totalVerifiedRevenue)}
            detail="Counts toward leaderboard"
            href="/admin/leaderboard"
            testId="admin-v2-kpi-verified"
            icon={WalletCards}
          />
          <RevenueKpi
            label="Order book"
            value={formatINR(summary.totalOrderBook)}
            detail="Committed pipeline"
            href="/admin/projects"
            testId="admin-v2-kpi-order-book"
            icon={WalletCards}
            accent="slate"
          />
          <RevenueKpi
            label="Pending revenue"
            value={formatINR(totalPendingRevenue)}
            detail="Awaiting review"
            href="/admin/queue"
            testId="admin-v2-kpi-pending"
            icon={Clock3}
            accent="amber"
          />
          <RevenueKpi
            label="Rejected revenue"
            value={formatINR(totalRejectedRevenue)}
            detail="Rejected entries"
            href="/admin/queue"
            testId="admin-v2-kpi-rejected"
            icon={FileCheck2}
            accent="rose"
          />
        </section>

        <section className={cn(PANEL, "p-5")} data-testid="admin-v2-program-health">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <SectionHeading
              icon={Activity}
              eyebrow="National snapshot"
              title="Program health"
            />
            <span className={cn("text-xs", MUTED)}>Live season totals</span>
          </div>
          <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {healthMetrics.map((metric) => (
              <HealthMetric
                key={metric.label}
                label={metric.label}
                value={metric.value}
                href={metric.href}
                icon={metric.icon}
                tone={metric.tone}
                testId={metric.testId}
              />
            ))}
          </div>
        </section>

        <div className="grid min-w-0 gap-5 xl:grid-cols-[minmax(0,1fr)_330px] xl:items-start">
          <main className="min-w-0 space-y-5">
            <section className={cn(PANEL, "p-5")} data-testid="admin-v2-activity-overview">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <SectionHeading
                  icon={Activity}
                  eyebrow="Operations"
                  title="Activity overview"
                />
                <span className={cn("text-xs font-semibold", MUTED)}>
                  Last {journalActivity.length} programme weeks
                </span>
              </div>
              <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
                <ActivityCard
                  label="Journal submissions"
                  value={coverage?.submitted.toLocaleString() ?? "0"}
                  detail="Current week"
                  values={journalActivity}
                  icon={BookOpenCheck}
                  color="#b45309"
                />
                <ActivityCard
                  label="Open reviews"
                  value={summary.pendingReviewCount.toLocaleString()}
                  detail={summary.overdueReviewCount > 0 ? `${summary.overdueReviewCount} overdue` : "Nothing overdue"}
                  icon={ClipboardCheck}
                  color="#c2410c"
                />
                <ActivityCard
                  label="Team approvals"
                  value={summary.pendingTeams.toLocaleString()}
                  detail="Awaiting coordinator action"
                  icon={ListChecks}
                  color="#7c3aed"
                />
                <ActivityCard
                  label="Roster requests"
                  value={summary.pendingAccessRequestCount.toLocaleString()}
                  detail="Awaiting review"
                  icon={Users}
                  color="#2563eb"
                />
              </div>
            </section>

            <section className={cn(PANEL, "p-5")} data-testid="admin-v2-revenue-pipeline">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <SectionHeading
                  icon={WalletCards}
                  eyebrow="Commercial performance"
                  title="Revenue pipeline"
                />
                <Link
                  href="/admin/leaderboard"
                  className={cn("text-xs font-semibold text-[#a16207] hover:underline dark:text-primary")}
                  data-testid="admin-v2-pipeline-link"
                >
                  View leaderboard
                </Link>
              </div>
              <div className="mt-6 space-y-4">
                <PipelineRow
                  label="Verified"
                  value={formatINR(summary.totalVerifiedRevenue)}
                  width={(summary.totalVerifiedRevenue / maxPipelineValue) * 100}
                  color="#b45309"
                />
                <PipelineRow
                  label="Order book"
                  value={formatINR(summary.totalOrderBook)}
                  width={(summary.totalOrderBook / maxPipelineValue) * 100}
                  color="#57534e"
                />
                <PipelineRow
                  label="Pending"
                  value={formatINR(totalPendingRevenue)}
                  width={(totalPendingRevenue / maxPipelineValue) * 100}
                  color="#d97706"
                />
                <PipelineRow
                  label="Rejected"
                  value={formatINR(totalRejectedRevenue)}
                  width={(totalRejectedRevenue / maxPipelineValue) * 100}
                  color="#e11d48"
                />
              </div>
              <div className="mt-6 grid grid-cols-2 gap-3 border-t border-[#eeeae3] pt-4 dark:border-border sm:grid-cols-3">
                <div>
                  <p className={cn("text-[10px] font-bold uppercase tracking-wide", MUTED)}>Verified conversion</p>
                  <p className={cn("mt-1 text-lg font-extrabold", INK)}>{verifiedConversion}%</p>
                </div>
                <div>
                  <p className={cn("text-[10px] font-bold uppercase tracking-wide", MUTED)}>Demo-ready teams</p>
                  <p className={cn("mt-1 text-lg font-extrabold", INK)}>{summary.demoEligibleTeams.toLocaleString()}</p>
                </div>
                <div className="col-span-2 sm:col-span-1">
                  <p className={cn("text-[10px] font-bold uppercase tracking-wide", MUTED)}>Pipeline total</p>
                  <p className={cn("mt-1 text-lg font-extrabold", INK)}>
                    {formatINR(summary.totalVerifiedRevenue + summary.totalOrderBook + totalPendingRevenue)}
                  </p>
                </div>
              </div>
            </section>

            <section className={cn(PANEL, "p-5")} data-testid="admin-v2-attention">
              <div className="flex items-start justify-between gap-3">
                <SectionHeading
                  icon={AlertCircle}
                  eyebrow="Action required"
                  title="Campuses needing attention"
                />
                <SmallLink href="/admin/campuses" testId="admin-v2-view-campuses">
                  View all campuses
                </SmallLink>
              </div>
              {worstCampuses.length === 0 ? (
                <div className="mt-5 flex items-center gap-2 rounded-xl border border-[#eeeae3] bg-[#fcfbf8] px-4 py-5 text-sm dark:border-border dark:bg-muted/20">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                  <span className={MUTED}>
                    Campus coverage data is not available yet.
                  </span>
                </div>
              ) : (
                <div className="mt-5 grid gap-2 sm:grid-cols-2">
                  {worstCampuses.map((campus) => (
                    <CampusAttentionRow
                      key={campus.campusId}
                      campusId={campus.campusId}
                      campusName={campus.campusName}
                      coverage={campus.pct}
                      silentTeams={campus.silent}
                    />
                  ))}
                </div>
              )}
            </section>
          </main>

          <aside className="min-w-0 space-y-5">
            <JournalCoverageCard
              coverage={coverage}
              silentTeams={silentTeams}
              onBulkRemind={() => setBulkOpen(true)}
              isReminding={bulkRemindMut.isPending}
            />

            <section className={cn(PANEL, "overflow-hidden")} data-testid="admin-v2-top-campuses">
              <div className="p-5">
                <div className="flex items-start justify-between gap-3">
                  <SectionHeading
                    icon={Trophy}
                    eyebrow="Standings"
                    title="Top campuses"
                  />
                  <SmallLink href="/admin/campus-leaderboard" testId="admin-v2-campus-leaderboard">
                    All
                  </SmallLink>
                </div>
              </div>
              {summary.topCampuses.length === 0 ? (
                <p className={cn("border-t border-[#eeeae3] px-5 py-7 text-sm dark:border-border", MUTED)}>
                  No campus data yet.
                </p>
              ) : (
                <ul className="divide-y divide-[#eeeae3] border-t border-[#eeeae3] dark:divide-border dark:border-border">
                  {summary.topCampuses.slice(0, 5).map((campus, index) => (
                    <li key={campus.id}>
                      <Link
                        href={`/admin/campuses/${campus.id}`}
                        className="group flex items-center gap-3 px-5 py-3 transition-colors hover:bg-[#fcfbf8] focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#a16207] dark:hover:bg-muted/30"
                        data-testid={`admin-v2-top-campus-${campus.id}`}
                      >
                        <span
                          className={cn(
                            "grid h-7 w-7 shrink-0 place-items-center rounded-lg text-xs font-extrabold tabular-nums",
                            index === 0
                              ? "bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300"
                              : "bg-[#f2efe9] text-[#7b756d] dark:bg-muted dark:text-muted-foreground",
                          )}
                        >
                          {index + 1}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className={cn("block truncate text-sm font-bold", INK)}>{campus.name}</span>
                          <span className={cn("mt-0.5 block text-[11px]", MUTED)}>
                            {campus.activeTeams} active team{campus.activeTeams === 1 ? "" : "s"}
                          </span>
                        </span>
                        <span className="shrink-0 text-right">
                          <span className={cn("block text-sm font-extrabold tabular-nums", INK)}>
                            {formatINR(campus.totalRevenue)}
                          </span>
                          <ArrowRight className="ml-auto mt-1 h-3 w-3 text-[#c9c0b5] transition-transform group-hover:translate-x-0.5" />
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <div className="rounded-2xl border border-dashed border-[#d7cfc2] bg-[#fcfbf8] p-4 dark:border-border dark:bg-muted/20">
              <div className="flex items-start gap-3">
                <HelpCircle className="mt-0.5 h-4 w-4 shrink-0 text-[#a16207] dark:text-primary" />
                <div>
                  <p className={cn("text-xs font-bold", INK)}>Need a deeper view?</p>
                  <p className={cn("mt-1 text-xs leading-relaxed", MUTED)}>
                    Open the heatmap for team-level engagement or the full leaderboard for campus detail.
                  </p>
                </div>
              </div>
            </div>
          </aside>
        </div>
      </div>

      <AlertDialog open={bulkOpen} onOpenChange={setBulkOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Send reminders to {silentTeams.length} silent team{silentTeams.length === 1 ? "" : "s"}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Every team flagged as Silent or Never-logged in the viewed season will receive an in-app reminder to submit its weekly journal. Each send is logged.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={bulkRemindMut.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={bulkRemindMut.isPending}
              onClick={() => bulkRemindMut.mutate(silentTeams.map((team) => team.teamId))}
              data-testid="admin-v2-bulk-remind-confirm"
            >
              {bulkRemindMut.isPending ? "Sending…" : "Send reminders"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function CampusAttentionRow({
  campusId,
  campusName,
  coverage,
  silentTeams,
}: {
  campusId: number;
  campusName: string;
  coverage: number;
  silentTeams: number;
}) {
  const tone =
    coverage >= 80
      ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300"
      : coverage >= 50
        ? "bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-300"
        : "bg-rose-50 text-rose-700 dark:bg-rose-950/30 dark:text-rose-300";

  return (
    <Link
      href={`/admin/heatmap?campusId=${campusId}`}
      className="group flex items-center gap-3 rounded-xl border border-[#eeeae3] bg-[#fcfbf8] p-3 transition-colors hover:border-[#d9c6a6] hover:bg-[#faf7f0] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#a16207] dark:border-border dark:bg-muted/20 dark:hover:bg-muted/40"
      data-testid={`admin-v2-attention-campus-${campusId}`}
    >
      <span
        className={cn(
          "grid h-9 w-9 shrink-0 place-items-center rounded-lg text-xs font-extrabold tabular-nums",
          tone,
        )}
      >
        {coverage}%
      </span>
      <span className="min-w-0 flex-1">
        <span className={cn("block truncate text-xs font-bold", INK)}>
          {campusName}
        </span>
        <span className={cn("mt-0.5 block truncate text-[11px]", MUTED)}>
          {silentTeams} silent team{silentTeams === 1 ? "" : "s"} this week
        </span>
      </span>
      <ArrowRight className="h-3.5 w-3.5 shrink-0 text-[#c9c0b5] transition-transform group-hover:translate-x-0.5" />
    </Link>
  );
}
