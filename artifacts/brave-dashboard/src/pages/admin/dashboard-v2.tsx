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
  ArrowRight,
  Bell,
  BookOpenCheck,
  BriefcaseBusiness,
  Building2,
  CheckCircle2,
  ClipboardCheck,
  Clock3,
  FileCheck2,
  Flag,
  ListChecks,
  Medal,
  Rocket,
  Trophy,
  UserPlus,
  Users,
  WalletCards,
  X,
} from "lucide-react";
import { formatINR } from "@/lib/format";
import { Spinner } from "@/components/ui/spinner";
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
  "rounded-xl border border-[#e9e5de] bg-white shadow-[0_2px_10px_rgba(65,46,35,0.035)] dark:border-border dark:bg-card";
const INK = "text-[#241713] dark:text-foreground";
const MUTED = "text-[#766f69] dark:text-muted-foreground";

type IconComponent = ComponentType<{
  className?: string;
  style?: CSSProperties;
}>;

type Coverage = {
  currentWeek: string;
  submitted: number;
  total: number;
  pct: number;
  campusCount: number;
  silentCount: number;
  neverCount: number;
};

function SectionTitle({
  icon: Icon,
  children,
  action,
}: {
  icon: IconComponent;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex h-11 items-center justify-between gap-3 border-b border-[#eeeae4] px-4 dark:border-border">
      <div className="flex min-w-0 items-center gap-2">
        <Icon className="h-4 w-4 shrink-0 text-[#9a241f]" />
        <h2 className={cn("truncate text-[11px] font-bold uppercase tracking-[0.11em]", INK)}>
          {children}
        </h2>
      </div>
      {action}
    </div>
  );
}

function Sparkline({
  values,
  color,
  height = 28,
}: {
  values: number[];
  color: string;
  height?: number;
}) {
  const source = values.length > 1 ? values : [values[0] ?? 0, values[0] ?? 0];
  const max = Math.max(...source, 1);
  const min = Math.min(...source, 0);
  const range = max - min || 1;
  const points = source
    .map((value, index) => {
      const x = (index / Math.max(source.length - 1, 1)) * 100;
      const y = height - 4 - ((value - min) / range) * (height - 8);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");

  return (
    <svg
      aria-hidden="true"
      className="block w-full overflow-visible"
      style={{ height }}
      viewBox={`0 0 100 ${height}`}
      preserveAspectRatio="none"
    >
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
      {source.map((value, index) => {
        const x = (index / Math.max(source.length - 1, 1)) * 100;
        const y = height - 4 - ((value - min) / range) * (height - 8);
        return index === source.length - 1 ? (
          <circle key={index} cx={x} cy={y} r="1.8" fill={color} />
        ) : null;
      })}
    </svg>
  );
}

function KpiCard({
  label,
  value,
  detail,
  href,
  icon: Icon,
  color,
  testId,
}: {
  label: string;
  value: string;
  detail: string;
  href: string;
  icon: IconComponent;
  color: string;
  testId: string;
}) {
  return (
    <Link
      href={href}
      data-testid={testId}
      className={cn(
        PANEL,
        "group grid min-h-[100px] min-w-0 grid-cols-[minmax(0,1fr)_56px] gap-2 p-4 transition-shadow hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-[#a62520]",
      )}
    >
      <div className="min-w-0">
        <div className="flex items-center gap-1.5">
          <Icon className="h-3.5 w-3.5 shrink-0" style={{ color }} />
          <p className={cn("truncate text-[8px] font-bold uppercase tracking-[0.07em]", MUTED)}>
            {label}
          </p>
        </div>
        <p className="mt-2 truncate text-[19px] font-extrabold leading-none tracking-tight" style={{ color }}>
          {value}
        </p>
        <p className={cn("mt-2 truncate text-[8px] leading-none", MUTED)}>{detail}</p>
      </div>
      <div className="self-end pb-2">
        <Sparkline values={[1, 1, 1, 1, 1, 1, 1]} color={color} height={28} />
      </div>
    </Link>
  );
}

function HealthMetric({
  label,
  value,
  detail,
  href,
  icon: Icon,
  tone,
}: {
  label: string;
  value: string;
  detail: string;
  href: string;
  icon: IconComponent;
  tone: "red" | "orange" | "green" | "blue";
}) {
  const tones = {
    red: "bg-[#fff1ef] text-[#a62520]",
    orange: "bg-[#fff5e9] text-[#cf6819]",
    green: "bg-[#edf8f1] text-[#23845b]",
    blue: "bg-[#f0f3fa] text-[#5871a7]",
  };

  return (
    <Link
      href={href}
      className="group flex min-w-0 items-center gap-3 px-4 py-4 transition-colors hover:bg-[#fdfbf7] focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#a62520] dark:hover:bg-muted/20"
    >
      <span className={cn("grid h-8 w-8 shrink-0 place-items-center rounded-full", tones[tone])}>
        <Icon className="h-4 w-4" />
      </span>
      <span className="min-w-0">
        <span className={cn("block truncate text-[8px] font-semibold uppercase tracking-[0.06em]", MUTED)}>
          {label}
        </span>
        <span className={cn("mt-0.5 block text-[17px] font-extrabold leading-none tabular-nums", INK)}>
          {value}
        </span>
        <span className={cn("mt-1 block truncate text-[7px] leading-none", MUTED)}>{detail}</span>
      </span>
    </Link>
  );
}

function MiniLineChart({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color: string;
}) {
  const snapshot = Array(7).fill(value) as number[];
  return (
      <div className="min-w-0 px-4 py-4">
      <p className={cn("truncate text-[9px] font-medium", INK)}>{label}</p>
      <p className={cn("mt-1 text-[16px] font-extrabold leading-none tabular-nums", INK)}>
        {value.toLocaleString()}
      </p>
      <div className="mt-2 h-[70px] border-l border-b border-[#eeeae4] px-1 pb-1 dark:border-border">
        <Sparkline values={snapshot} color={color} height={63} />
      </div>
      <div className={cn("mt-1 flex justify-between text-[6px]", MUTED)}>
        <span>Live</span>
        <span>snapshot</span>
      </div>
    </div>
  );
}

function FunnelLevel({
  label,
  value,
  percent,
  color,
  width,
}: {
  label: string;
  value: string;
  percent: number;
  color: string;
  width: string;
}) {
  return (
    <div
      className="relative mx-auto flex h-[52px] items-center justify-center text-center text-white"
      style={{
        width,
        backgroundColor: color,
        clipPath: "polygon(0 0, 100% 0, 87% 100%, 13% 100%)",
      }}
    >
      <div className="leading-tight">
        <p className="text-[8px] font-semibold">{label}</p>
        <p className="mt-0.5 text-[9px] font-extrabold tabular-nums">{value}</p>
        <p className="text-[7px] text-white/80">{percent}%</p>
      </div>
    </div>
  );
}

function StatusBox({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color: string;
}) {
  return (
    <div className="rounded-md border border-[#eeeae4] bg-[#fdfcfa] px-2.5 py-2.5 dark:border-border dark:bg-muted/20">
      <div className="flex items-center gap-1.5">
        <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: color }} />
        <span className={cn("text-[13px] font-extrabold leading-none tabular-nums", INK)}>
          {value.toLocaleString()}
        </span>
      </div>
      <p className={cn("mt-1.5 pl-3 text-[7px] font-semibold uppercase tracking-wide", MUTED)}>
        {label}
      </p>
    </div>
  );
}

function AttentionItem({
  icon: Icon,
  value,
  label,
  tone,
  href,
}: {
  icon: IconComponent;
  value: number;
  label: string;
  tone: string;
  href: string;
}) {
  return (
    <Link
      href={href}
      className="flex min-w-0 items-center gap-2 rounded-md border border-[#eeeae4] bg-[#fdfcfa] px-3 py-3 transition-colors hover:bg-[#faf7f1] dark:border-border dark:bg-muted/20"
    >
      <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full" style={{ backgroundColor: `${tone}16`, color: tone }}>
        <Icon className="h-3.5 w-3.5" />
      </span>
      <span className={cn("text-[10px] font-extrabold tabular-nums", INK)}>{value.toLocaleString()}</span>
      <span className={cn("truncate text-[8px]", MUTED)}>{label}</span>
    </Link>
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
      heatmap.teams.map((team) => team.campusId).filter((id): id is number => id != null),
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

  if (isLoading || !summary) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  const gritSummary = summary as typeof summary & {
    maxGritMiles?: number;
    gritAchievedTeams?: number;
  };
  const pendingRevenue = summary.totalPendingRevenue ?? 0;
  const rejectedRevenue = summary.totalRejectedRevenue ?? 0;
  const pendingCoverage = coverage ? Math.max(coverage.total - coverage.submitted, 0) : 0;
  const pct = coverage?.pct ?? 0;
  const health =
    pct >= 80
      ? { label: "Healthy", color: "#1f9d68" }
      : pct >= 50
        ? { label: "At Risk", color: "#e87918" }
        : { label: "Critical", color: "#d80f18" };
  const orderBookConversion =
    summary.totalOrderBook > 0
      ? Math.round((summary.totalVerifiedRevenue / summary.totalOrderBook) * 100)
      : 0;
  const pendingPercent =
    summary.totalOrderBook > 0
      ? Math.round((pendingRevenue / summary.totalOrderBook) * 100)
      : 0;

  const healthMetrics = [
    {
      label: "Active teams",
      value: summary.activeTeams.toLocaleString(),
      detail: `Across ${summary.totalCampuses} campuses`,
      href: "/admin/teams",
      icon: Users,
      tone: "red" as const,
    },
    {
      label: "Demo Day eligible",
      value: summary.demoEligibleTeams.toLocaleString(),
      detail: "Teams crossing ₹2L",
      href: "/admin/demo-day-submissions",
      icon: Rocket,
      tone: "red" as const,
    },
    {
      label: "GRIT Miles",
      value: (gritSummary.maxGritMiles ?? 0).toLocaleString(),
      detail: "Highest milestone",
      href: "/admin/teams",
      icon: Flag,
      tone: "orange" as const,
    },
    {
      label: "GRIT Miles achieved",
      value: (gritSummary.gritAchievedTeams ?? 0).toLocaleString(),
      detail: "Teams at a GRIT level",
      href: "/admin/teams",
      icon: Medal,
      tone: "orange" as const,
    },
    {
      label: "Pending reviews",
      value: summary.pendingReviewCount.toLocaleString(),
      detail: summary.overdueReviewCount > 0 ? `${summary.overdueReviewCount} overdue` : "Nothing overdue",
      href: "/admin/queue",
      icon: Clock3,
      tone: "orange" as const,
    },
    {
      label: "Campuses",
      value: summary.totalCampuses.toLocaleString(),
      detail: "Program-wide",
      href: "/admin/campuses",
      icon: Building2,
      tone: "green" as const,
    },
    {
      label: "Teams awaiting approval",
      value: summary.pendingTeams.toLocaleString(),
      detail: "Team requests",
      href: "/admin/team-requests",
      icon: ListChecks,
      tone: "blue" as const,
    },
    {
      label: "Roster requests",
      value: summary.pendingAccessRequestCount.toLocaleString(),
      detail: "New-user access",
      href: "/admin/roster",
      icon: UserPlus,
      tone: "green" as const,
    },
  ];

  return (
    <>
      <div
        className="-m-1 min-h-[calc(100vh-4rem)] bg-[#fbfaf7] p-1 text-[#241713] dark:bg-background dark:text-foreground"
        data-testid="admin-dashboard-v2"
      >
        <header className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-[24px] font-extrabold leading-tight tracking-[-0.035em]">
              National Command Center
            </h1>
            <p className={cn("mt-0.5 text-[10px]", MUTED)}>
              Program-wide health, pending work, and live activity at a glance.
            </p>
          </div>
          {/* Roster access requests. Season 1 shows these in a full-width
              banner under the header; this season's dashboard is dense enough
              that a banner would push the KPIs below the fold, so the same
              signal rides in the header row instead. Hidden at zero — an
              always-present "0 pending" trains people to stop looking. */}
          {summary.pendingAccessRequestCount > 0 ? (
            <Link
              href="/admin/roster"
              data-testid="admin-v2-roster-requests-card"
              className="order-last flex items-center gap-2.5 self-start rounded-lg border border-amber-400/50 bg-amber-50 px-3.5 py-2 transition-colors hover:bg-amber-100 dark:bg-amber-950/20 dark:hover:bg-amber-950/40 sm:order-none sm:min-w-[210px]"
            >
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-amber-200/60 text-amber-700 dark:bg-amber-900/40 dark:text-amber-200">
                <UserPlus className="h-4 w-4" />
              </span>
              <span className="min-w-0 leading-tight sm:mr-auto">
                <span className="block text-xs font-semibold text-amber-900 dark:text-amber-100">
                  {summary.pendingAccessRequestCount} roster{" "}
                  {summary.pendingAccessRequestCount === 1
                    ? "request"
                    : "requests"}
                </span>
                <span className={cn("block text-[10px]", MUTED)}>
                  Awaiting your review
                </span>
              </span>
              <ArrowRight className="h-3.5 w-3.5 shrink-0 text-amber-700 dark:text-amber-200" />
            </Link>
          ) : null}
          <div className="flex items-center gap-1.5 self-start">
            <SeasonSwitcher />
            <HelpMenu inline />
          </div>
        </header>

        <div className="grid min-w-0 gap-4 lg:min-h-[calc(100vh-8rem)] lg:grid-cols-[minmax(0,1fr)_210px] xl:grid-cols-[minmax(0,1fr)_270px]">
          <main className="grid min-w-0 gap-4 lg:min-h-0 lg:grid-rows-[auto_auto_minmax(0,1fr)_auto]">
            <section
              className="grid min-w-0 grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4"
              data-testid="admin-v2-revenue-kpis"
            >
              <KpiCard
                label="Verified revenue"
                value={formatINR(summary.totalVerifiedRevenue)}
                detail="Counts toward leaderboard"
                href="/admin/leaderboard"
                icon={Trophy}
                color="#b51d24"
                testId="admin-v2-kpi-verified"
              />
              <KpiCard
                label="Order book"
                value={formatINR(summary.totalOrderBook)}
                detail="Committed pipeline"
                href="/admin/projects"
                icon={BriefcaseBusiness}
                color="#321a18"
                testId="admin-v2-kpi-order-book"
              />
              <KpiCard
                label="Pending revenue"
                value={formatINR(pendingRevenue)}
                detail="Awaiting review"
                href="/admin/queue"
                icon={Clock3}
                color="#ed7a16"
                testId="admin-v2-kpi-pending"
              />
              <KpiCard
                label="Rejected revenue"
                value={formatINR(rejectedRevenue)}
                detail="Rejected entries"
                href="/admin/queue"
                icon={X}
                color="#625e5b"
                testId="admin-v2-kpi-rejected"
              />
            </section>

            <section className={cn(PANEL, "min-h-[154px] overflow-hidden")} data-testid="admin-v2-program-health">
              <SectionTitle icon={Activity}>Program Health Snapshot</SectionTitle>
              <div className="grid grid-cols-1 divide-y divide-[#eeeae4] sm:grid-cols-2 lg:grid-cols-4 lg:divide-y-0 dark:divide-border">
                {healthMetrics.map((metric, index) => (
                  <div
                    key={metric.label}
                    className={cn(
                      "border-[#eeeae4] dark:border-border",
                      index % 4 !== 3 && "lg:border-r",
                      index >= 4 && "lg:border-t",
                    )}
                  >
                    <HealthMetric {...metric} />
                  </div>
                ))}
              </div>
            </section>

            <div className="grid min-h-0 min-w-0 gap-4 lg:grid-cols-[minmax(0,1.7fr)_minmax(190px,0.76fr)]">
              <section className={cn(PANEL, "min-h-[204px] overflow-hidden")} data-testid="admin-v2-activity-overview">
                <SectionTitle
                  icon={Activity}
                  action={
                    <span className="rounded-md border border-[#eeeae4] px-2 py-1 text-[7px] font-semibold text-[#625e5b] dark:border-border dark:text-muted-foreground">
                      Live snapshot
                    </span>
                  }
                >
                  Activity Overview
                </SectionTitle>
                <div className="grid grid-cols-1 divide-y divide-[#eeeae4] sm:grid-cols-3 sm:divide-x sm:divide-y-0 dark:divide-border">
                  <MiniLineChart label="Team Requests" value={summary.pendingTeams} color="#b51d24" />
                  <MiniLineChart label="Reviews Completed" value={summary.pendingReviewCount} color="#ed8a18" />
                  <MiniLineChart label="Roster Requests" value={summary.pendingAccessRequestCount} color="#169b69" />
                </div>
              </section>

              <section className={cn(PANEL, "min-h-[204px] overflow-hidden")} data-testid="admin-v2-revenue-pipeline">
                <SectionTitle icon={WalletCards}>Revenue Pipeline (₹)</SectionTitle>
                <div className="px-3.5 pb-3 pt-3">
                  <FunnelLevel
                    label="Order Book"
                    value={formatINR(summary.totalOrderBook)}
                    percent={100}
                    color="#731d1b"
                    width="100%"
                  />
                  <FunnelLevel
                    label="Pending Revenue"
                    value={formatINR(pendingRevenue)}
                    percent={pendingPercent}
                    color="#ef7912"
                    width="78%"
                  />
                  <FunnelLevel
                    label="Verified Revenue"
                    value={formatINR(summary.totalVerifiedRevenue)}
                    percent={orderBookConversion}
                    color="#15985f"
                    width="56%"
                  />
                  <div className="mt-3 flex h-7 items-center justify-center rounded-md border border-[#eeeae4] text-[8px] dark:border-border">
                    <span className={MUTED}>Conversion</span>
                    <span className={cn("ml-2 font-extrabold tabular-nums", INK)}>{orderBookConversion}%</span>
                  </div>
                </div>
              </section>
            </div>

            <section className={cn(PANEL, "min-h-[92px] overflow-hidden")} data-testid="admin-v2-attention">
              <SectionTitle icon={Building2}>Campuses Needing Attention</SectionTitle>
              <div className="grid gap-2 p-4 sm:grid-cols-[1fr_1fr_1fr_auto]">
                <AttentionItem
                  icon={ClipboardCheck}
                  value={summary.overdueReviewCount}
                  label="Overdue reviews"
                  tone="#c62828"
                  href="/admin/queue"
                />
                <AttentionItem
                  icon={ListChecks}
                  value={summary.pendingTeams}
                  label="Teams awaiting approval"
                  tone="#e68622"
                  href="/admin/team-requests"
                />
                <AttentionItem
                  icon={UserPlus}
                  value={summary.pendingAccessRequestCount}
                  label="Roster requests pending"
                  tone="#249869"
                  href="/admin/roster"
                />
                <Link
                  href="/admin/campuses"
                  data-testid="admin-v2-view-campuses"
                  className="inline-flex h-9 items-center justify-center gap-1.5 rounded-md px-3 text-[8px] font-semibold text-[#6b2a24] hover:bg-[#faf7f1]"
                >
                  View all campuses
                  <ArrowRight className="h-3 w-3" />
                </Link>
              </div>
            </section>
          </main>

          <aside className="grid min-w-0 gap-4 lg:min-h-0 lg:grid-rows-[auto_minmax(0,1fr)]">
            <section className={cn(PANEL, "min-h-[234px] overflow-hidden")} data-testid="admin-v2-journal-coverage">
              <SectionTitle
                icon={BookOpenCheck}
                action={
                  <span className="flex items-center gap-1 text-[8px] font-semibold" style={{ color: health.color }}>
                    <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: health.color }} />
                    {health.label}
                  </span>
                }
              >
                This Week&apos;s Journal Coverage
              </SectionTitle>
              <div className="p-4">
                <div className="flex items-end gap-3">
                  <p className="text-[38px] font-extrabold leading-none tracking-[-0.06em]" style={{ color: health.color }}>
                    {pct}<span className="text-[19px]">%</span>
                  </p>
                  <p className={cn("pb-1 text-[8px] leading-relaxed", MUTED)}>
                    {coverage?.submitted ?? 0} of {(coverage?.total ?? 0).toLocaleString()} teams
                    <br />
                    across {coverage?.campusCount ?? 0} campuses
                  </p>
                </div>
                <div className="mt-5 h-1.5 overflow-hidden rounded-full bg-[#f1ede7] dark:bg-muted">
                  <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: health.color }} />
                </div>
                <div className="mt-5 grid grid-cols-2 gap-2">
                  <StatusBox label="Submitted" value={coverage?.submitted ?? 0} color="#19ad73" />
                  <StatusBox label="Pending" value={pendingCoverage} color="#b7b3af" />
                  <StatusBox label="Silent" value={coverage?.silentCount ?? 0} color="#e00018" />
                  <StatusBox label="Never logged" value={coverage?.neverCount ?? 0} color="#77726e" />
                </div>
                <div className="mt-5 grid grid-cols-[0.8fr_1.2fr] gap-2">
                  <Link
                    href="/admin/heatmap"
                    data-testid="admin-v2-coverage-heatmap"
                    className="inline-flex h-9 items-center justify-center gap-1.5 rounded-md border border-[#e8e2db] text-[8px] font-semibold text-[#4f4540] hover:bg-[#faf7f1] dark:border-border dark:text-foreground"
                  >
                    <Activity className="h-3 w-3" />
                    View heatmap
                  </Link>
                  <button
                    type="button"
                    disabled={silentTeams.length === 0 || bulkRemindMut.isPending}
                    onClick={() => setBulkOpen(true)}
                    data-testid="admin-v2-bulk-remind"
                    className="inline-flex h-9 items-center justify-center gap-1.5 rounded-md bg-[#c5161d] px-2 text-[8px] font-semibold text-white transition-colors hover:bg-[#a91319] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <Bell className="h-3 w-3" />
                    Bulk-remind {silentTeams.length.toLocaleString()} team{silentTeams.length === 1 ? "" : "s"}
                  </button>
                </div>
              </div>
            </section>

            <section className={cn(PANEL, "min-h-[264px] overflow-hidden")} data-testid="admin-v2-top-campuses">
              <SectionTitle
                icon={Trophy}
                action={
                  <Link
                    href="/admin/campus-leaderboard"
                    data-testid="admin-v2-campus-leaderboard"
                    className="text-[8px] font-semibold text-[#b51d24] hover:underline"
                  >
                    View all
                  </Link>
                }
              >
                Top Campuses
              </SectionTitle>
              {summary.topCampuses.length === 0 ? (
                <p className={cn("px-3 py-8 text-center text-[9px]", MUTED)}>No campus data yet.</p>
              ) : (
                <ol className="divide-y divide-[#eeeae4] px-3 dark:divide-border">
                  {summary.topCampuses.slice(0, 5).map((campus, index) => (
                    <li key={campus.id}>
                      <Link
                        href={`/admin/campuses/${campus.id}`}
                        data-testid={`admin-v2-top-campus-${campus.id}`}
                        className="group grid grid-cols-[22px_minmax(0,1fr)_auto] items-center gap-2 py-3.5"
                      >
                        <span
                          className={cn(
                            "grid h-5 w-5 place-items-center rounded text-[8px] font-bold",
                            index === 0
                              ? "bg-[#fff3d9] text-[#c47714]"
                              : "bg-[#f4f1ec] text-[#6f6964] dark:bg-muted dark:text-muted-foreground",
                          )}
                        >
                          {index + 1}
                        </span>
                        <span className="min-w-0">
                          <span className={cn("block truncate text-[9px] font-semibold", INK)}>{campus.name}</span>
                          <span className={cn("mt-0.5 block text-[7px]", MUTED)}>
                            {campus.activeTeams} team{campus.activeTeams === 1 ? "" : "s"}
                          </span>
                        </span>
                        <span className={cn("text-[9px] font-extrabold tabular-nums", INK)}>
                          {formatINR(campus.totalRevenue)}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ol>
              )}
            </section>
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