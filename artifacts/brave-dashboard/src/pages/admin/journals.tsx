import { useMemo, useState } from "react";
import { useLocation } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  BookOpenCheck,
  Search,
  AlertTriangle,
  Pencil,
  Trash2,
  Sparkles,
  RefreshCw,
  ChevronRight,
  Check,
  ChevronsUpDown,
  CheckCircle2,
  CircleDot,
  UserCog,
  Download,
  Clapperboard,
  ImageIcon,
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
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
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
import { JournalEditDialog } from "@/components/journal-edit-dialog";
import {
  listAdminJournals,
  getJournalCoverage,
  deleteJournal,
  listCampusesForFilter,
  type WeeklyJournal,
  type JournalRow,
  type BlockerPriority,
  type BlockerStatus,
} from "@/lib/progress-api";
import {
  analyseJournalNow,
  updateJournalBlocker,
  runJournalReelScan,
} from "@/lib/journals-ai-api";

type Props = {
  scope?: "admin" | "coordinator";
};

const ALL = "all" as const;
type Tab = "overview" | "all" | "missed";

// ---- Blocker priority / status presentation ----
export const PRIORITY_META: Record<
  BlockerPriority,
  { label: string; rank: number; badge: string; dot: string }
> = {
  high: {
    label: "High",
    rank: 3,
    badge: "bg-red-100 text-red-700 hover:bg-red-100",
    dot: "bg-red-500",
  },
  medium: {
    label: "Medium",
    rank: 2,
    badge: "bg-amber-100 text-amber-700 hover:bg-amber-100",
    dot: "bg-amber-500",
  },
  low: {
    label: "Low",
    rank: 1,
    badge: "bg-emerald-100 text-emerald-700 hover:bg-emerald-100",
    dot: "bg-emerald-500",
  },
  none: {
    label: "None",
    rank: 0,
    badge: "bg-muted text-muted-foreground hover:bg-muted",
    dot: "bg-muted-foreground/40",
  },
};

export const STATUS_META: Record<
  BlockerStatus,
  { label: string; badge: string; icon: typeof CircleDot }
> = {
  open: {
    label: "Open",
    badge: "bg-rose-100 text-rose-700 hover:bg-rose-100",
    icon: CircleDot,
  },
  assigned: {
    label: "Assigned",
    badge: "bg-blue-100 text-blue-700 hover:bg-blue-100",
    icon: UserCog,
  },
  resolved: {
    label: "Resolved",
    badge: "bg-emerald-100 text-emerald-700 hover:bg-emerald-100",
    icon: CheckCircle2,
  },
};

const PRIORITY_ORDER: BlockerPriority[] = ["high", "medium", "low", "none"];

export function getPriority(j: WeeklyJournal): BlockerPriority {
  return (j.blockerPriority ??
    j.aiAnalysis?.blockers?.priority ??
    "none") as BlockerPriority;
}
export function getStatus(j: WeeklyJournal): BlockerStatus {
  return (j.blockerStatus ?? "open") as BlockerStatus;
}

// ---- CSV export ----
function csvCell(value: unknown): string {
  if (value == null) return "";
  let s = String(value);
  // Neutralize spreadsheet formula injection: prefix a single quote when the
  // value (ignoring leading whitespace) starts with a formula trigger char.
  if (/^[\s]*[=+\-@\t\r]/.test(s)) {
    s = `'${s}`;
  }
  // Quote when the value contains a comma, quote, or newline; escape inner quotes.
  if (/[",\n\r]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function triggerCsvDownload(filename: string, lines: string[]): void {
  // Prepend a BOM so Excel reads UTF-8 correctly.
  const blob = new Blob(["\uFEFF" + lines.join("\r\n")], {
    type: "text/csv;charset=utf-8;",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// Builds the full text of a single journal for a CSV cell.
function journalCellText(j: WeeklyJournal): string {
  const parts: string[] = [];
  if (j.whatWeDid?.trim()) parts.push(j.whatWeDid.trim());
  if (j.blockers?.trim()) parts.push(`Blockers: ${j.blockers.trim()}`);
  if (j.nextWeekPlan?.trim()) parts.push(`Next week: ${j.nextWeekPlan.trim()}`);
  return parts.join("\n\n");
}

// Exports every journal as a team × week matrix: one row per team, one column
// per week, each cell holding that team's journal for that week.
function exportJournalsToCsv(journals: JournalRow[]): void {
  // Distinct weeks across all journals, ascending by start date.
  const weekMap = new Map<string, string>();
  for (const j of journals) {
    if (!weekMap.has(j.weekStartDate)) {
      weekMap.set(j.weekStartDate, `${j.weekStartDate} → ${j.weekEndDate}`);
    }
  }
  const weeks = Array.from(weekMap.entries())
    .sort((a, b) => (a[0] < b[0] ? -1 : 1))
    .map(([start, label]) => ({ start, label }));

  // Group journals by team.
  const teams = new Map<
    number,
    {
      teamName: string;
      campusName: string;
      byWeek: Map<string, JournalRow>;
    }
  >();
  for (const j of journals) {
    const t = teams.get(j.teamId) ?? {
      teamName: j.teamName ?? `Team #${j.teamId}`,
      campusName: j.campusName ?? "",
      byWeek: new Map<string, JournalRow>(),
    };
    t.byWeek.set(j.weekStartDate, j);
    teams.set(j.teamId, t);
  }

  const headers = ["Team", "Campus", ...weeks.map((w) => `Week ${w.label}`)];
  const lines = [headers.map(csvCell).join(",")];

  const teamRows = Array.from(teams.values()).sort((a, b) =>
    a.teamName.localeCompare(b.teamName),
  );
  for (const t of teamRows) {
    const cells: unknown[] = [t.teamName, t.campusName];
    for (const w of weeks) {
      const j = t.byWeek.get(w.start);
      cells.push(j ? journalCellText(j) : "");
    }
    lines.push(cells.map(csvCell).join(","));
  }

  const stamp = new Date().toISOString().slice(0, 10);
  triggerCsvDownload(`weekly-journals-${stamp}.csv`, lines);
}

export default function AdminJournals({ scope = "admin" }: Props) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();
  // Team drill-down now lives on its own full page instead of a modal.
  const teamDetailBase =
    scope === "coordinator" ? "/coordinator/journals" : "/admin/journals";

  const { data: journals, isLoading } = useQuery({
    queryKey: ["admin-journals"],
    queryFn: () => listAdminJournals(),
  });

  const { data: coverage } = useQuery({
    queryKey: ["admin-journals-coverage"],
    queryFn: getJournalCoverage,
  });

  const { data: campuses } = useQuery({
    queryKey: ["campuses-filter"],
    queryFn: listCampusesForFilter,
    enabled: scope === "admin",
  });

  const [query, setQuery] = useState("");
  const [tab, setTab] = useState<Tab>("overview");
  const [weekFilter, setWeekFilter] = useState<string>(ALL);
  const [campusFilter, setCampusFilter] = useState<string>(ALL);
  const [campusPopoverOpen, setCampusPopoverOpen] = useState(false);
  // Global "Analyse all" sequential progress.
  const [analyseProgress, setAnalyseProgress] = useState<{
    running: boolean;
    done: number;
    total: number;
  } | null>(null);
  const [confirmAnalyseAll, setConfirmAnalyseAll] = useState(false);

  const selectedCampusName =
    campusFilter === ALL
      ? "All campuses"
      : (campuses?.find((c) => String(c.id) === campusFilter)?.name ??
        "All campuses");

  const weekOptions = useMemo(() => {
    if (!journals) return [] as Array<{ value: string; label: string }>;
    const seen = new Map<string, string>();
    for (const j of journals) {
      if (!seen.has(j.weekStartDate)) {
        seen.set(j.weekStartDate, `${j.weekStartDate} → ${j.weekEndDate}`);
      }
    }
    return Array.from(seen.entries())
      .sort((a, b) => (a[0] < b[0] ? 1 : -1))
      .map(([value, label]) => ({ value, label }));
  }, [journals]);

  const filtered = useMemo(() => {
    if (!journals) return [] as JournalRow[];
    const q = query.trim().toLowerCase();
    return journals.filter((j) => {
      if (q) {
        const hit =
          (j.teamName ?? "").toLowerCase().includes(q) ||
          (j.campusName ?? "").toLowerCase().includes(q) ||
          (j.submittedByName ?? "").toLowerCase().includes(q) ||
          j.whatWeDid.toLowerCase().includes(q);
        if (!hit) return false;
      }
      if (weekFilter !== ALL && j.weekStartDate !== weekFilter) return false;
      if (
        scope === "admin" &&
        campusFilter !== ALL &&
        (j.campusName ?? "") !==
          (campuses?.find((c) => String(c.id) === campusFilter)?.name ?? "")
      ) {
        return false;
      }
      return true;
    });
  }, [journals, query, weekFilter, campusFilter, scope, campuses]);

  // ---- Analytics rollups (computed from the filtered set) ----
  const analytics = useMemo(() => {
    const total = filtered.length;
    let analysed = 0;
    const sums = { clients: 0, convos: 0, started: 0, closed: 0 };
    const priorityCounts: Record<BlockerPriority, number> = {
      high: 0,
      medium: 0,
      low: 0,
      none: 0,
    };
    let openHigh = 0;
    let openBlockers = 0;
    const categoryCounts = new Map<string, number>();
    for (const j of filtered) {
      if (j.aiAnalysedAt) analysed += 1;
      sums.clients += j.clientsVisited ?? 0;
      sums.convos += j.activeConversations ?? 0;
      sums.started += j.projectsStarted ?? 0;
      sums.closed += j.projectsClosed ?? 0;
      const p = getPriority(j);
      priorityCounts[p] += 1;
      const status = getStatus(j);
      if (p !== "none" && status !== "resolved") openBlockers += 1;
      if (p === "high" && status !== "resolved") openHigh += 1;
      const cat = j.aiAnalysis?.primary_category;
      if (j.aiAnalysedAt && cat) {
        categoryCounts.set(cat, (categoryCounts.get(cat) ?? 0) + 1);
      }
    }
    const categories = Array.from(categoryCounts.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);
    return {
      total,
      analysed,
      pending: total - analysed,
      sums,
      priorityCounts,
      openHigh,
      openBlockers,
      categories,
    };
  }, [filtered]);

  // ---- Team-wise grouping for the "All Journals" table ----
  const teamGroups = useMemo(() => {
    const map = new Map<
      number,
      {
        teamId: number;
        teamName: string;
        campusName: string | null;
        journals: JournalRow[];
      }
    >();
    for (const j of filtered) {
      const g = map.get(j.teamId) ?? {
        teamId: j.teamId,
        teamName: j.teamName ?? `Team #${j.teamId}`,
        campusName: j.campusName ?? null,
        journals: [],
      };
      g.journals.push(j);
      map.set(j.teamId, g);
    }
    const groups = Array.from(map.values()).map((g) => {
      const sorted = [...g.journals].sort((a, b) =>
        a.weekStartDate < b.weekStartDate ? 1 : -1,
      );
      const sums = { clients: 0, convos: 0, started: 0, closed: 0 };
      let openHigh = 0;
      let openMedium = 0;
      let openLow = 0;
      let analysed = 0;
      for (const j of sorted) {
        sums.clients += j.clientsVisited ?? 0;
        sums.convos += j.activeConversations ?? 0;
        sums.started += j.projectsStarted ?? 0;
        sums.closed += j.projectsClosed ?? 0;
        if (j.aiAnalysedAt) analysed += 1;
        const p = getPriority(j);
        const open = getStatus(j) !== "resolved";
        if (open && p === "high") openHigh += 1;
        else if (open && p === "medium") openMedium += 1;
        else if (open && p === "low") openLow += 1;
      }
      const topPriority: BlockerPriority =
        openHigh > 0
          ? "high"
          : openMedium > 0
            ? "medium"
            : openLow > 0
              ? "low"
              : "none";
      return {
        ...g,
        journals: sorted,
        sums,
        analysed,
        openBlockers: openHigh + openMedium + openLow,
        topPriority,
        latestWeek: sorted[0]?.weekStartDate ?? null,
      };
    });
    // Teams with open high-priority blockers first, then by journal count.
    groups.sort((a, b) => {
      const pa = PRIORITY_META[a.topPriority].rank;
      const pb = PRIORITY_META[b.topPriority].rank;
      if (pb !== pa) return pb - pa;
      return b.journals.length - a.journals.length;
    });
    return groups;
  }, [filtered]);

  const missedTeams = useMemo(() => {
    if (!coverage) return [];
    const q = query.trim().toLowerCase();
    const selName =
      scope === "admin" && campusFilter !== ALL
        ? (campuses?.find((c) => String(c.id) === campusFilter)?.name ?? null)
        : null;
    return coverage
      .filter((t) => t.missedWeeks > 0)
      .filter((t) => {
        if (q) {
          const hit =
            t.teamName.toLowerCase().includes(q) ||
            (t.campusName ?? "").toLowerCase().includes(q);
          if (!hit) return false;
        }
        if (selName !== null && t.campusName !== selName) return false;
        if (weekFilter !== ALL) {
          if (!t.lastSubmittedWeek) return true;
          if (t.lastSubmittedWeek >= weekFilter) return false;
        }
        return true;
      });
  }, [coverage, query, weekFilter, campusFilter, scope, campuses]);

  // ---- Mutations: analyse one + blocker triage ----
  function patchJournalInCache(
    id: number,
    fields: Partial<WeeklyJournal>,
  ): void {
    queryClient.setQueryData<JournalRow[]>(["admin-journals"], (old) =>
      old?.map((j) => (j.id === id ? { ...j, ...fields } : j)),
    );
  }

  // Sequentially analyse every not-yet-analysed journal in the filtered set,
  // one at a time, with live progress. Driven from the frontend so progress is
  // visible and a single failure never aborts the batch.
  async function analyseAll() {
    const pending = filtered.filter((j) => !j.aiAnalysedAt);
    if (pending.length === 0) {
      toast({
        title: "Nothing to analyse",
        description: "All journals here are analysed.",
      });
      return;
    }
    setAnalyseProgress({ running: true, done: 0, total: pending.length });
    let done = 0;
    for (const j of pending) {
      try {
        const res = await analyseJournalNow(j.id);
        if (res.journal) patchJournalInCache(j.id, res.journal);
      } catch {
        // keep going — individual failures are tolerated
      }
      done += 1;
      setAnalyseProgress({ running: true, done, total: pending.length });
    }
    setAnalyseProgress({ running: false, done, total: pending.length });
    toast({ title: `Analysed ${done} journal${done === 1 ? "" : "s"}` });
    queryClient.invalidateQueries({ queryKey: ["admin-journals"] });
    setTimeout(() => setAnalyseProgress(null), 4000);
  }

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <BookOpenCheck className="h-6 w-6 text-primary" />
            Weekly Journals
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            AI-structured weekly check-ins — activity, categories, and blocker
            triage across every team.
          </p>
        </div>
        <Button
          onClick={() => setConfirmAnalyseAll(true)}
          disabled={analyseProgress?.running}
          className="gap-2"
          data-testid="journals-analyse-all"
        >
          {analyseProgress?.running ? (
            <Spinner className="size-4" />
          ) : (
            <Sparkles className="h-4 w-4" />
          )}
          {analyseProgress?.running
            ? `Analysing ${analyseProgress.done}/${analyseProgress.total}…`
            : "Analyse all"}
        </Button>
      </div>

      {analyseProgress && (
        <div className="space-y-1">
          <Progress
            value={
              analyseProgress.total
                ? (analyseProgress.done / analyseProgress.total) * 100
                : 0
            }
          />
          <div className="text-xs text-muted-foreground">
            {analyseProgress.running
              ? `Analysing journals one by one — ${analyseProgress.done} of ${analyseProgress.total}`
              : `Done — analysed ${analyseProgress.done} of ${analyseProgress.total}`}
          </div>
        </div>
      )}

      {/* Filters + tabs */}
      <div className="flex flex-col gap-3">
        {/* Search (left, reduced width) + export (right) */}
        <div className="flex items-center gap-2">
          <div className="relative w-full max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by team, campus, member name, or content"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="pl-9"
              data-testid="journals-search"
            />
          </div>
          <Button
            variant="outline"
            className="ml-auto gap-2"
            onClick={() => exportJournalsToCsv(journals ?? [])}
            disabled={!journals || journals.length === 0}
            data-testid="journals-export"
          >
            <Download className="h-4 w-4" />
            Export CSV
          </Button>
        </div>

        {/* Tabs (left) + week/campus filters (right) — one row */}
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap gap-1">
            {(
              [
                { v: "overview", label: "Overview" },
                { v: "all", label: "All Journals" },
                { v: "missed", label: "Teams missing journals" },
              ] as const
            ).map((b) => (
              <button
                key={b.v}
                type="button"
                onClick={() => setTab(b.v)}
                className={cn(
                  "px-3 py-1.5 text-xs rounded-md border transition-colors",
                  tab === b.v
                    ? "bg-primary text-primary-foreground border-primary"
                    : "hover:bg-accent",
                )}
                data-testid={`journals-tab-${b.v}`}
              >
                {b.label}
              </button>
            ))}
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
            <Select value={weekFilter} onValueChange={setWeekFilter}>
              <SelectTrigger
                className="sm:w-72"
                data-testid="journals-week-filter"
              >
                <SelectValue placeholder="All weeks" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>All weeks</SelectItem>
                {weekOptions.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    Week {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {scope === "admin" && (
              <Popover
                open={campusPopoverOpen}
                onOpenChange={setCampusPopoverOpen}
              >
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={campusPopoverOpen}
                    className="sm:w-64 justify-between font-normal"
                    data-testid="journals-campus-filter"
                  >
                    <span className="truncate">{selectedCampusName}</span>
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent
                  className="w-[--radix-popover-trigger-width] p-0"
                  align="start"
                >
                  <Command>
                    <CommandInput
                      placeholder="Search campuses…"
                      data-testid="journals-campus-search"
                    />
                    <CommandList className="max-h-72">
                      <CommandEmpty>No campus found.</CommandEmpty>
                      <CommandGroup>
                        <CommandItem
                          value="All campuses"
                          onSelect={() => {
                            setCampusFilter(ALL);
                            setCampusPopoverOpen(false);
                          }}
                          data-testid="journals-campus-option-all"
                        >
                          <Check
                            className={cn(
                              "mr-2 h-4 w-4",
                              campusFilter === ALL
                                ? "opacity-100"
                                : "opacity-0",
                            )}
                          />
                          All campuses
                        </CommandItem>
                        {(campuses ?? []).map((c) => {
                          const value = String(c.id);
                          return (
                            <CommandItem
                              key={c.id}
                              value={c.name}
                              onSelect={() => {
                                setCampusFilter(value);
                                setCampusPopoverOpen(false);
                              }}
                              data-testid={`journals-campus-option-${c.id}`}
                            >
                              <Check
                                className={cn(
                                  "mr-2 h-4 w-4",
                                  campusFilter === value
                                    ? "opacity-100"
                                    : "opacity-0",
                                )}
                              />
                              {c.name}
                            </CommandItem>
                          );
                        })}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            )}
          </div>
        </div>
      </div>

      {/* ===================== OVERVIEW ===================== */}
      {tab === "overview" && (
        <OverviewTab
          isLoading={isLoading}
          analytics={analytics}
          onOpenPriority={() => setTab("all")}
        />
      )}

      {/* ===================== ALL JOURNALS (team-wise) ===================== */}
      {tab === "all" && (
        <Card>
          <CardHeader>
            <CardTitle>Teams</CardTitle>
            <CardDescription>
              {teamGroups.length} teams · {filtered.length} journals · click a
              team to see week-by-week detail
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex justify-center py-12">
                <Spinner className="size-8" />
              </div>
            ) : teamGroups.length === 0 ? (
              <div className="text-sm text-muted-foreground py-12 text-center">
                No journals match.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Team</TableHead>
                      <TableHead>Campus</TableHead>
                      <TableHead className="text-center">Journals</TableHead>
                      <TableHead>Latest</TableHead>
                      <TableHead className="text-center">Clients</TableHead>
                      <TableHead className="text-center">Convos</TableHead>
                      <TableHead>Open blockers</TableHead>
                      <TableHead className="text-center">AI</TableHead>
                      <TableHead />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {teamGroups.map((g) => (
                      <TableRow
                        key={g.teamId}
                        className="cursor-pointer"
                        onClick={() =>
                          setLocation(`${teamDetailBase}/team/${g.teamId}`)
                        }
                        data-testid={`journal-team-row-${g.teamId}`}
                      >
                        <TableCell className="font-medium">
                          {g.teamName}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {g.campusName ?? "—"}
                        </TableCell>
                        <TableCell className="text-center tabular-nums">
                          {g.journals.length}
                        </TableCell>
                        <TableCell className="text-muted-foreground text-xs">
                          {g.latestWeek ?? "—"}
                        </TableCell>
                        <TableCell className="text-center tabular-nums">
                          {g.sums.clients}
                        </TableCell>
                        <TableCell className="text-center tabular-nums">
                          {g.sums.convos}
                        </TableCell>
                        <TableCell>
                          {g.openBlockers > 0 ? (
                            <Badge
                              className={PRIORITY_META[g.topPriority].badge}
                            >
                              {g.openBlockers} ·{" "}
                              {PRIORITY_META[g.topPriority].label}
                            </Badge>
                          ) : (
                            <span className="text-xs text-muted-foreground">
                              none
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="text-center">
                          <span
                            className={cn(
                              "text-xs tabular-nums",
                              g.analysed === g.journals.length
                                ? "text-emerald-600"
                                : "text-amber-600",
                            )}
                          >
                            {g.analysed}/{g.journals.length}
                          </span>
                        </TableCell>
                        <TableCell>
                          <ChevronRight className="h-4 w-4 text-muted-foreground" />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* ===================== MISSED ===================== */}
      {tab === "missed" && (
        <Card>
          <CardHeader>
            <CardTitle>Coverage gaps (last 12 weeks)</CardTitle>
            <CardDescription>
              {missedTeams.length} teams have missed at least one journal week
            </CardDescription>
          </CardHeader>
          <CardContent>
            {!coverage ? (
              <div className="flex justify-center py-12">
                <Spinner className="size-8" />
              </div>
            ) : missedTeams.length === 0 ? (
              <div className="text-sm text-muted-foreground py-12 text-center">
                Everyone is fully covered. Nice.
              </div>
            ) : (
              <div className="space-y-2">
                {missedTeams.map((t) => (
                  <div
                    key={t.teamId}
                    className={cn(
                      "flex items-center justify-between gap-2 p-3 rounded-md border",
                      t.submittedWeeks === 0
                        ? "bg-red-50/60 border-red-200"
                        : "bg-amber-50/40 border-amber-200",
                    )}
                  >
                    <div className="min-w-0">
                      <div className="text-sm font-medium truncate">
                        {t.teamName}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {t.campusName ?? "—"} ·{" "}
                        {t.lastSubmittedWeek
                          ? `last submitted week ${t.lastSubmittedWeek}`
                          : "never submitted"}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <Badge
                        className={
                          t.submittedWeeks === 0
                            ? "bg-red-100 text-red-700 hover:bg-red-100"
                            : "bg-amber-100 text-amber-700 hover:bg-amber-100"
                        }
                      >
                        {t.submittedWeeks === 0 ? (
                          <>
                            <AlertTriangle className="w-3 h-3 mr-1" />
                            never submitted
                          </>
                        ) : (
                          `${t.submittedWeeks}/${t.totalWeeks} weeks`
                        )}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <AlertDialog open={confirmAnalyseAll} onOpenChange={setConfirmAnalyseAll}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Analyse all journals?</AlertDialogTitle>
            <AlertDialogDescription>
              This runs the AI auditor on every journal that hasn't been
              analysed yet, one by one. It can take a while and uses AI credits.
              You can keep using the page while it runs.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setConfirmAnalyseAll(false);
                void analyseAll();
              }}
              data-testid="confirm-analyse-all"
            >
              Yes, analyse all
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ============================================================
// Overview tab
// ============================================================
function OverviewTab({
  isLoading,
  analytics,
  onOpenPriority,
}: {
  isLoading: boolean;
  analytics: {
    total: number;
    analysed: number;
    pending: number;
    sums: { clients: number; convos: number; started: number; closed: number };
    priorityCounts: Record<BlockerPriority, number>;
    openHigh: number;
    openBlockers: number;
    categories: { name: string; count: number }[];
  };
  onOpenPriority: () => void;
}) {
  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <Spinner className="size-8" />
      </div>
    );
  }
  const maxCat = analytics.categories[0]?.count ?? 1;
  return (
    <div className="space-y-4">
      {/* Compact summary line */}
      <Card>
        <CardContent className="py-4">
          <div className="flex flex-wrap gap-x-8 gap-y-3 text-sm">
            <Metric label="Journals" value={analytics.total} />
            <Metric label="Clients visited" value={analytics.sums.clients} />
            <Metric label="Active convos" value={analytics.sums.convos} />
            <Metric label="Projects started" value={analytics.sums.started} />
            <Metric label="Projects closed" value={analytics.sums.closed} />
            <Metric
              label="AI analysed"
              value={`${analytics.analysed}/${analytics.total}`}
              accent={analytics.pending > 0 ? "amber" : "emerald"}
            />
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        {/* Blocker triage */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Blocker triage</CardTitle>
            <CardDescription>
              {analytics.openBlockers} open ·{" "}
              <span className="text-red-600 font-medium">
                {analytics.openHigh} high-priority
              </span>{" "}
              need attention
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {PRIORITY_ORDER.map((p) => (
              <div
                key={p}
                className="flex items-center justify-between rounded-md border px-3 py-2"
              >
                <div className="flex items-center gap-2 text-sm">
                  <span
                    className={cn(
                      "inline-block h-2.5 w-2.5 rounded-full",
                      PRIORITY_META[p].dot,
                    )}
                  />
                  {PRIORITY_META[p].label}
                </div>
                <span className="text-sm font-semibold tabular-nums">
                  {analytics.priorityCounts[p]}
                </span>
              </div>
            ))}
            {analytics.openHigh > 0 && (
              <Button
                variant="outline"
                size="sm"
                className="w-full mt-1"
                onClick={onOpenPriority}
              >
                Review high-priority blockers
              </Button>
            )}
          </CardContent>
        </Card>

        {/* Category breakdown */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">What teams are doing</CardTitle>
            <CardDescription>
              Main focus category of each analysed journal
            </CardDescription>
          </CardHeader>
          <CardContent>
            {analytics.categories.length === 0 ? (
              <div className="text-sm text-muted-foreground py-6 text-center">
                No analysed journals yet. Use “Analyse all” to populate this.
              </div>
            ) : (
              <div className="space-y-2">
                {analytics.categories.map((c) => (
                  <div key={c.name} className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span>{c.name}</span>
                      <span className="tabular-nums text-muted-foreground">
                        {c.count}
                      </span>
                    </div>
                    <div className="h-2 rounded bg-muted overflow-hidden">
                      <div
                        className="h-full bg-primary"
                        style={{ width: `${(c.count / maxCat) * 100}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Metric({
  label,
  value,
  accent,
}: {
  label: string;
  value: number | string;
  accent?: "amber" | "emerald";
}) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div
        className={cn(
          "text-xl font-bold tabular-nums",
          accent === "amber" && "text-amber-600",
          accent === "emerald" && "text-emerald-600",
        )}
      >
        {typeof value === "number" ? value.toLocaleString() : value}
      </div>
    </div>
  );
}

// ============================================================
// Team snapshot (drill-down header rollup)
// ============================================================
export function TeamSnapshot({ journals }: { journals: JournalRow[] }) {
  const snap = useMemo(() => {
    const sums = { clients: 0, convos: 0, started: 0, closed: 0 };
    const priority: Record<BlockerPriority, number> = {
      high: 0,
      medium: 0,
      low: 0,
      none: 0,
    };
    const cats = new Map<string, number>();
    for (const j of journals) {
      sums.clients += j.clientsVisited ?? 0;
      sums.convos += j.activeConversations ?? 0;
      sums.started += j.projectsStarted ?? 0;
      sums.closed += j.projectsClosed ?? 0;
      priority[getPriority(j)] += 1;
      const c = j.aiAnalysis?.primary_category;
      if (j.aiAnalysedAt && c) cats.set(c, (cats.get(c) ?? 0) + 1);
    }
    return { sums, priority, cats: Array.from(cats.entries()) };
  }, [journals]);

  return (
    <div className="rounded-lg border bg-muted/30 p-3 space-y-2 text-sm">
      <div className="flex flex-wrap gap-x-6 gap-y-1">
        <span>
          Clients <b className="tabular-nums">{snap.sums.clients}</b>
        </span>
        <span>
          Convos <b className="tabular-nums">{snap.sums.convos}</b>
        </span>
        <span>
          Started <b className="tabular-nums">{snap.sums.started}</b>
        </span>
        <span>
          Closed <b className="tabular-nums">{snap.sums.closed}</b>
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {(["high", "medium", "low"] as BlockerPriority[]).map((p) =>
          snap.priority[p] > 0 ? (
            <Badge key={p} className={PRIORITY_META[p].badge}>
              {PRIORITY_META[p].label}: {snap.priority[p]}
            </Badge>
          ) : null,
        )}
        {snap.cats.length > 0 && (
          <span className="text-xs text-muted-foreground">
            {snap.cats.map(([c, n]) => `${c} ×${n}`).join(" · ")}
          </span>
        )}
      </div>
    </div>
  );
}

// ============================================================
// Single journal detail card (used inside the drill-down)
// ============================================================
export function JournalDetailCard({
  journal,
  analysing,
  onAnalyse,
  onEdit,
  onDelete,
  onBlocker,
  blockerSaving,
}: {
  journal: JournalRow;
  analysing: boolean;
  onAnalyse: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onBlocker: (body: {
    priority?: BlockerPriority;
    status?: BlockerStatus;
    note?: string | null;
  }) => void;
  blockerSaving: boolean;
}) {
  const [showRaw, setShowRaw] = useState(false);
  const [note, setNote] = useState(journal.blockerNote ?? "");
  const ai = journal.aiAnalysis ?? null;
  const priority = getPriority(journal);
  const status = getStatus(journal);

  return (
    <div
      className="border rounded-lg p-4"
      data-testid={`journal-detail-${journal.id}`}
    >
      <div className="flex flex-wrap items-start justify-between gap-2 mb-3">
        <div>
          <div className="text-sm font-medium">
            Week {journal.weekStartDate} → {journal.weekEndDate}
          </div>
          <div className="text-xs text-muted-foreground flex flex-wrap items-center gap-1.5">
            <span>
              by {journal.submittedByName ?? "?"} ·{" "}
              {new Date(journal.submittedAt).toLocaleDateString()}
              {ai?.primary_category ? ` · ${ai.primary_category}` : ""}
            </span>
            <Badge
              variant="outline"
              className="text-[10px] py-0 px-1.5"
              data-testid={`journal-source-${journal.id}`}
            >
              {journal.submittedByRole === "coordinator"
                ? "Coordinator submitted"
                : journal.submittedByRole === "admin"
                  ? "Admin submitted"
                  : "Student submitted"}
            </Badge>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          {priority !== "none" && (
            <Badge className={PRIORITY_META[priority].badge}>
              {PRIORITY_META[priority].label}
            </Badge>
          )}
          <Button
            size="sm"
            variant="outline"
            className="h-7 gap-1 text-xs"
            onClick={onAnalyse}
            disabled={analysing}
            data-testid={`analyse-journal-${journal.id}`}
          >
            {analysing ? (
              <Spinner className="size-3" />
            ) : journal.aiAnalysedAt ? (
              <RefreshCw className="h-3 w-3" />
            ) : (
              <Sparkles className="h-3 w-3" />
            )}
            {journal.aiAnalysedAt ? "Re-analyse" : "Analyse"}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 px-2"
            onClick={onEdit}
            data-testid={`edit-journal-${journal.id}`}
          >
            <Pencil className="w-3.5 h-3.5" />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 px-2 text-destructive hover:text-destructive"
            onClick={onDelete}
            data-testid={`delete-journal-${journal.id}`}
          >
            <Trash2 className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>

      {/* Counters */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3">
        {(
          [
            ["Clients visited", journal.clientsVisited],
            ["Active conversations", journal.activeConversations],
            ["Projects started", journal.projectsStarted],
            ["Projects complete", journal.projectsClosed],
          ] as const
        ).map(([label, value]) => (
          <div key={label} className="rounded border bg-muted/30 px-2 py-1.5">
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
              {label}
            </div>
            <div className="text-sm font-semibold tabular-nums">
              {(value ?? 0).toLocaleString()}
            </div>
          </div>
        ))}
      </div>

      {/* AI-formatted sections (or raw fallback) */}
      {ai && !showRaw ? (
        <div className="space-y-3 text-sm">
          <Section
            icon="✅"
            title="What we did"
            summary={ai.what_we_did?.summary}
            bullets={ai.what_we_did?.bullets}
            chips={ai.what_we_did?.categories}
          />
          <BlockerSection
            ai={ai}
            priority={priority}
            status={status}
            note={note}
            setNote={setNote}
            saving={blockerSaving}
            onBlocker={onBlocker}
            manual={journal.blockerPriorityManual ?? false}
          />
          <Section
            icon="➡️"
            title="Next week"
            summary={ai.next_week?.summary}
            bullets={ai.next_week?.bullets}
          />
        </div>
      ) : (
        <RawJournal journal={journal} pending={!ai} />
      )}

      <div className="mt-3 flex items-center justify-between">
        {ai?.overall_summary ? (
          <p className="text-xs text-muted-foreground italic pr-3">
            {ai.overall_summary}
          </p>
        ) : (
          <span />
        )}
        {ai && (
          <button
            type="button"
            className="text-xs text-muted-foreground underline shrink-0"
            onClick={() => setShowRaw((s) => !s)}
          >
            {showRaw ? "Show formatted" : "Show raw"}
          </button>
        )}
      </div>

      {/* Student-attached images (optional). Surfaced for the reel shoot. */}
      <JournalImagesStrip images={journal.images ?? null} />

      {/* Per-journal reel scan: worthy/not verdict + script for THIS entry. */}
      <JournalReelCard journal={journal} />
    </div>
  );
}

// Shows any images the student attached to this journal entry.
function JournalImagesStrip({ images }: { images: string[] | null }) {
  if (!images || images.length === 0) return null;
  return (
    <div className="mt-3 border-t pt-3">
      <div className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase text-muted-foreground">
        <ImageIcon className="h-3.5 w-3.5" /> Attached images ({images.length})
      </div>
      <div className="flex flex-wrap gap-2">
        {images.map((src, i) => (
          <a
            key={i}
            href={src}
            target="_blank"
            rel="noopener noreferrer"
            className="block"
          >
            <img
              src={src}
              alt={`Journal attachment ${i + 1}`}
              className="h-20 w-20 rounded-md border object-cover transition-opacity hover:opacity-80"
            />
          </a>
        ))}
      </div>
    </div>
  );
}

// Per-journal reel scan card. Self-contained: shows the AI's worthy/not verdict
// and, when worthy, the generated reel script for THIS journal entry. The
// "Scan" / "Re-scan" button runs the scan on demand and patches the cache.
function JournalReelCard({ journal }: { journal: JournalRow }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [scanning, setScanning] = useState(false);

  const scanned = !!journal.reelAnalysedAt;
  const worthy = journal.reelWorthy === true;

  const runScan = async () => {
    setScanning(true);
    try {
      const res = await runJournalReelScan(journal.id);
      if (res.journal) {
        const r = res.journal;
        queryClient.setQueryData<JournalRow[]>(["admin-journals"], (old) =>
          (old ?? []).map((j) =>
            j.id === journal.id
              ? {
                  ...j,
                  reelWorthy: r.reelWorthy,
                  reelBucket: r.reelBucket,
                  reelScript: r.reelScript,
                  reelReason: r.reelReason,
                  reelAnalysedAt: r.reelAnalysedAt,
                }
              : j,
          ),
        );
      }
      if (!res.ok && !res.journal?.reelAnalysedAt) {
        toast({
          title: "Reel scan didn't complete",
          description: "Check that GEMINI_API_KEY is configured.",
          variant: "destructive",
        });
      }
    } catch (err) {
      toast({
        title: "Reel scan failed",
        description: err instanceof Error ? err.message : "Please try again.",
        variant: "destructive",
      });
    } finally {
      setScanning(false);
    }
  };

  const copyScript = () => {
    if (journal.reelScript) {
      void navigator.clipboard?.writeText(journal.reelScript);
      toast({ title: "Reel script copied" });
    }
  };

  return (
    <div className="mt-3 rounded-md border border-dashed bg-muted/20 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-xs font-semibold uppercase text-muted-foreground">
          <Clapperboard className="h-3.5 w-3.5" /> Reel script
          {scanned &&
            (worthy ? (
              <Badge className="bg-purple-500 hover:bg-purple-600 text-[10px]">
                Reel-worthy
              </Badge>
            ) : (
              <Badge variant="secondary" className="text-[10px]">
                Not reel-worthy
              </Badge>
            ))}
          {journal.reelBucket && worthy && (
            <Badge variant="outline" className="text-[10px]">
              {journal.reelBucket}
            </Badge>
          )}
        </div>
        <Button
          size="sm"
          variant="outline"
          className="h-7 gap-1 text-xs"
          onClick={runScan}
          disabled={scanning}
          data-testid={`reel-scan-${journal.id}`}
        >
          {scanning ? (
            <Spinner className="size-3" />
          ) : scanned ? (
            <RefreshCw className="h-3 w-3" />
          ) : (
            <Clapperboard className="h-3 w-3" />
          )}
          {scanned ? "Re-scan" : "Scan"}
        </Button>
      </div>

      {!scanned ? (
        <p className="mt-2 text-xs text-muted-foreground">
          Not scanned yet. It runs automatically a few seconds after a journal
          is submitted, or click Scan.
        </p>
      ) : worthy && journal.reelScript ? (
        <div className="mt-2 space-y-1.5">
          <p className="whitespace-pre-wrap rounded bg-background p-2.5 text-sm">
            {journal.reelScript}
          </p>
          <div className="flex items-center justify-between gap-2">
            {journal.reelReason && (
              <p className="text-[11px] italic text-muted-foreground">
                {journal.reelReason}
              </p>
            )}
            <button
              type="button"
              onClick={copyScript}
              className="shrink-0 text-xs text-muted-foreground underline"
            >
              Copy
            </button>
          </div>
        </div>
      ) : (
        <p className="mt-2 text-xs text-muted-foreground">
          {journal.reelReason ||
            "This entry isn't a strong fit for a reel this week."}
        </p>
      )}
    </div>
  );
}

function Section({
  icon,
  title,
  summary,
  bullets,
  chips,
}: {
  icon: string;
  title: string;
  summary?: string;
  bullets?: string[];
  chips?: string[];
}) {
  const hasContent =
    (summary && summary.trim()) || (bullets && bullets.length > 0);
  if (!hasContent) return null;
  return (
    <div>
      <div className="text-xs uppercase font-semibold text-muted-foreground mb-1">
        {icon} {title}
      </div>
      {summary && summary.trim() && <p className="mb-1">{summary}</p>}
      {bullets && bullets.length > 0 && (
        <ul className="list-disc ml-5 space-y-0.5">
          {bullets.map((b, i) => (
            <li key={i}>{b}</li>
          ))}
        </ul>
      )}
      {chips && chips.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-1.5">
          {chips.map((c) => (
            <Badge key={c} variant="secondary" className="text-[10px]">
              {c}
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}

function BlockerSection({
  ai,
  priority,
  status,
  note,
  setNote,
  saving,
  onBlocker,
  manual,
}: {
  ai: NonNullable<JournalRow["aiAnalysis"]>;
  priority: BlockerPriority;
  status: BlockerStatus;
  note: string;
  setNote: (v: string) => void;
  saving: boolean;
  onBlocker: (body: {
    priority?: BlockerPriority;
    status?: BlockerStatus;
    note?: string | null;
  }) => void;
  manual: boolean;
}) {
  const blk = ai.blockers;
  const hasBlocker =
    priority !== "none" ||
    (blk?.summary && blk.summary.trim()) ||
    (blk?.items && blk.items.length > 0);
  return (
    <div className="rounded-md border border-amber-200 bg-amber-50/40 p-2.5">
      <div className="flex items-center justify-between mb-1">
        <div className="text-xs uppercase font-semibold text-muted-foreground">
          ⚠️ Blockers
        </div>
        {blk?.needs_admin && (
          <span className="text-[10px] text-red-600 font-medium">
            needs admin
          </span>
        )}
      </div>

      {blk?.summary && blk.summary.trim() ? (
        <p className="mb-1 font-medium">{blk.summary}</p>
      ) : !hasBlocker ? (
        <p className="text-muted-foreground text-xs mb-1">
          No blocker reported.
        </p>
      ) : null}

      {blk?.items && blk.items.length > 0 && (
        <ul className="list-disc ml-5 space-y-0.5 mb-2">
          {blk.items.map((b, i) => (
            <li key={i}>{b}</li>
          ))}
        </ul>
      )}
      {blk?.priority_reason && blk.priority_reason.trim() && (
        <p className="text-[11px] text-muted-foreground mb-2">
          AI: {blk.priority_reason}
        </p>
      )}

      {/* Triage controls */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1">
          <span className="text-[10px] uppercase text-muted-foreground mr-1">
            Priority{manual ? " (manual)" : ""}
          </span>
          {(["high", "medium", "low", "none"] as BlockerPriority[]).map((p) => (
            <button
              key={p}
              type="button"
              disabled={saving}
              onClick={() => onBlocker({ priority: p })}
              className={cn(
                "px-2 py-0.5 rounded text-[11px] border transition-colors",
                priority === p
                  ? PRIORITY_META[p].badge
                  : "hover:bg-accent text-muted-foreground",
              )}
            >
              {PRIORITY_META[p].label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1">
          <span className="text-[10px] uppercase text-muted-foreground mr-1">
            Status
          </span>
          {(["open", "assigned", "resolved"] as BlockerStatus[]).map((s) => {
            const Icon = STATUS_META[s].icon;
            return (
              <button
                key={s}
                type="button"
                disabled={saving}
                onClick={() => onBlocker({ status: s })}
                className={cn(
                  "px-2 py-0.5 rounded text-[11px] border inline-flex items-center gap-1 transition-colors",
                  status === s
                    ? STATUS_META[s].badge
                    : "hover:bg-accent text-muted-foreground",
                )}
              >
                <Icon className="h-3 w-3" />
                {STATUS_META[s].label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex items-start gap-2 mt-2">
        <Textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Admin note (who's on it, resolution…)"
          className="min-h-[36px] text-xs"
          rows={1}
        />
        <Button
          size="sm"
          variant="outline"
          className="h-8 text-xs shrink-0"
          disabled={saving}
          onClick={() => onBlocker({ note: note.trim() === "" ? null : note })}
        >
          Save note
        </Button>
      </div>
    </div>
  );
}

function RawJournal({
  journal,
  pending,
}: {
  journal: JournalRow;
  pending: boolean;
}) {
  return (
    <div className="space-y-2 text-sm">
      {pending && (
        <div className="text-[11px] text-amber-600 mb-1">
          Analysis pending — showing raw entry.
        </div>
      )}
      <p className="whitespace-pre-wrap">
        <span className="text-xs uppercase font-semibold text-muted-foreground">
          What we did:{" "}
        </span>
        {journal.whatWeDid}
      </p>
      {journal.blockers && (
        <p className="whitespace-pre-wrap">
          <span className="text-xs uppercase font-semibold text-muted-foreground">
            Blockers:{" "}
          </span>
          {journal.blockers}
        </p>
      )}
      {journal.nextWeekPlan && (
        <p className="whitespace-pre-wrap">
          <span className="text-xs uppercase font-semibold text-muted-foreground">
            Next week:{" "}
          </span>
          {journal.nextWeekPlan}
        </p>
      )}
    </div>
  );
}
