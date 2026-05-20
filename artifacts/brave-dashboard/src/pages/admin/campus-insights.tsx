import { useEffect, useMemo, useState } from "react";
import { useLocation, useSearch } from "wouter";
import JSZip from "jszip";
import {
  useGetCampusInsightsOverview,
  useGetCampusInsightsByCampus,
  useListCampuses,
  getGetCampusInsightsOverviewQueryKey,
  getGetCampusInsightsByCampusQueryKey,
} from "@workspace/api-client-react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatINR } from "@/lib/format";
import {
  Search,
  Download,
  ChevronLeft,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
} from "lucide-react";

type CampusRow = {
  campusId: number;
  campusName: string;
  teamsCount: number;
  journalsSubmitted: number;
  verifiedRevenueCount: number;
  rejectedRevenueCount: number;
  totalVerifiedAmount: number;
};

type TeamRow = {
  teamId: number;
  teamName: string;
  journalWeeksSubmitted: number;
  orderBookSubmittedCount: number;
  verifiedRevenueCount: number;
  rejectedRevenueCount: number;
  totalVerifiedAmount: number;
};

type SortDir = "asc" | "desc";
type CampusSortKey = keyof CampusRow | "tier";
type TeamSortKey = keyof TeamRow | "tier";

// Tier 1: verified revenue > 0 AND journals submitted >= 1
// Tier 2: verified revenue > 0 OR journals submitted >= 1
// Tier 3: rejected revenue > 0 (and none of the above)
// Tier 4: everything else
function campusTier(r: CampusRow): number {
  const hasRev = r.verifiedRevenueCount > 0 && r.totalVerifiedAmount > 0;
  const hasJrn = r.journalsSubmitted > 0;
  if (hasRev && hasJrn) return 1;
  if (hasRev || hasJrn) return 2;
  if (r.rejectedRevenueCount > 0) return 3;
  return 4;
}
function teamTier(r: TeamRow): number {
  const hasRev = r.verifiedRevenueCount > 0 && r.totalVerifiedAmount > 0;
  const hasJrn = r.journalWeeksSubmitted > 0;
  if (hasRev && hasJrn) return 1;
  if (hasRev || hasJrn) return 2;
  if (r.rejectedRevenueCount > 0) return 3;
  return 4;
}

function csvEscape(v: string | number): string {
  const s = String(v ?? "");
  if (/[",\r\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}
function toCsv(headers: string[], rows: (string | number)[][]): string {
  const lines = [headers.map(csvEscape).join(",")];
  for (const r of rows) lines.push(r.map(csvEscape).join(","));
  return lines.join("\n") + "\n";
}
function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}
function safeFilename(s: string): string {
  return s.replace(/[^a-z0-9-_.]+/gi, "_").slice(0, 80);
}

function SortIcon({
  active,
  dir,
}: {
  active: boolean;
  dir: SortDir;
}) {
  if (!active) return <ArrowUpDown className="ml-1 inline h-3 w-3 opacity-50" />;
  return dir === "asc" ? (
    <ArrowUp className="ml-1 inline h-3 w-3" />
  ) : (
    <ArrowDown className="ml-1 inline h-3 w-3" />
  );
}

export default function AdminCampusInsights() {
  const [location, setLocation] = useLocation();
  const searchString = useSearch();
  const params = new URLSearchParams(searchString);
  const urlCampus = params.get("campus") ?? "all";
  const urlQ = params.get("q") ?? "";

  const [searchInput, setSearchInput] = useState(urlQ);
  const [search, setSearch] = useState(urlQ);

  // Keep URL in sync as state changes.
  function pushUrl(nextCampus: string, nextQ: string) {
    const p = new URLSearchParams();
    if (nextCampus && nextCampus !== "all") p.set("campus", nextCampus);
    if (nextQ) p.set("q", nextQ);
    const qs = p.toString();
    setLocation(qs ? `${location}?${qs}` : location, { replace: true });
  }

  // Debounced search (250ms).
  useEffect(() => {
    const h = window.setTimeout(() => {
      const trimmed = searchInput.trim();
      setSearch(trimmed);
      pushUrl(urlCampus, trimmed);
    }, 250);
    return () => window.clearTimeout(h);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchInput]);

  // Sync state from URL changes (e.g. back/forward navigation).
  useEffect(() => {
    if (urlQ !== search) {
      setSearch(urlQ);
      setSearchInput(urlQ);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlQ]);

  const isOverview = urlCampus === "all";
  const selectedCampusId = isOverview ? null : Number(urlCampus);
  const campusIdValid =
    selectedCampusId != null && Number.isInteger(selectedCampusId);

  const { data: campusesList } = useListCampuses();
  const { data: overview, isLoading: loadingOverview } =
    useGetCampusInsightsOverview({
      query: {
        queryKey: getGetCampusInsightsOverviewQueryKey(),
        enabled: isOverview,
      },
    });
  const campusIdForQuery = campusIdValid ? selectedCampusId! : 0;
  const { data: campusView, isLoading: loadingCampus } =
    useGetCampusInsightsByCampus(campusIdForQuery, {
      query: {
        queryKey: getGetCampusInsightsByCampusQueryKey(campusIdForQuery),
        enabled: !isOverview && campusIdValid,
      },
    });

  const isLoading = isOverview ? loadingOverview : loadingCampus;
  const programmeWeeksTotal =
    (isOverview ? overview?.programmeWeeksTotal : campusView?.programmeWeeksTotal) ??
    0;

  // ----- Sorting state -----
  const [campusSort, setCampusSort] = useState<{
    key: CampusSortKey;
    dir: SortDir;
  }>({ key: "tier", dir: "asc" });
  const [teamSort, setTeamSort] = useState<{
    key: TeamSortKey;
    dir: SortDir;
  }>({ key: "tier", dir: "asc" });

  function toggleCampusSort(key: CampusSortKey) {
    setCampusSort((s) =>
      s.key === key
        ? { key, dir: s.dir === "asc" ? "desc" : "asc" }
        : { key, dir: key === "campusName" ? "asc" : "desc" },
    );
  }
  function toggleTeamSort(key: TeamSortKey) {
    setTeamSort((s) =>
      s.key === key
        ? { key, dir: s.dir === "asc" ? "desc" : "asc" }
        : { key, dir: key === "teamName" ? "asc" : "desc" },
    );
  }

  // ----- VIEW A rows (filtered + sorted) -----
  const campusRows: CampusRow[] = useMemo(() => {
    const all = (overview?.rows ?? []) as CampusRow[];
    const lower = search.toLowerCase();
    const filtered = lower
      ? all.filter((r) => r.campusName.toLowerCase().includes(lower))
      : all;
    const sorted = [...filtered];
    if (campusSort.key === "tier") {
      sorted.sort((a, b) => {
        const ta = campusTier(a);
        const tb = campusTier(b);
        if (ta !== tb) return ta - tb;
        if (a.totalVerifiedAmount !== b.totalVerifiedAmount)
          return b.totalVerifiedAmount - a.totalVerifiedAmount;
        return a.campusName.localeCompare(b.campusName);
      });
    } else {
      const { key, dir } = campusSort;
      const mult = dir === "asc" ? 1 : -1;
      sorted.sort((a, b) => {
        const av = a[key as keyof CampusRow];
        const bv = b[key as keyof CampusRow];
        if (typeof av === "number" && typeof bv === "number")
          return (av - bv) * mult;
        return String(av).localeCompare(String(bv)) * mult;
      });
    }
    return sorted;
  }, [overview, search, campusSort]);

  // ----- VIEW B rows (filtered + sorted) -----
  const teamRows: TeamRow[] = useMemo(() => {
    const all = (campusView?.rows ?? []) as TeamRow[];
    const lower = search.toLowerCase();
    const filtered = lower
      ? all.filter((r) => r.teamName.toLowerCase().includes(lower))
      : all;
    const sorted = [...filtered];
    if (teamSort.key === "tier") {
      sorted.sort((a, b) => {
        const ta = teamTier(a);
        const tb = teamTier(b);
        if (ta !== tb) return ta - tb;
        if (a.totalVerifiedAmount !== b.totalVerifiedAmount)
          return b.totalVerifiedAmount - a.totalVerifiedAmount;
        return a.teamName.localeCompare(b.teamName);
      });
    } else {
      const { key, dir } = teamSort;
      const mult = dir === "asc" ? 1 : -1;
      sorted.sort((a, b) => {
        const av = a[key as keyof TeamRow];
        const bv = b[key as keyof TeamRow];
        if (typeof av === "number" && typeof bv === "number")
          return (av - bv) * mult;
        return String(av).localeCompare(String(bv)) * mult;
      });
    }
    return sorted;
  }, [campusView, search, teamSort]);

  // ----- CSV exports -----
  const campusOverviewHeaders = [
    "Campus",
    "Teams",
    "Journals submitted",
    "Verified revenue (count)",
    "Rejected revenue (count)",
    "Total verified amount (INR)",
  ];
  const teamHeaders = [
    "Team",
    `Journal weeks submitted (of ${programmeWeeksTotal})`,
    "Order book submitted (count)",
    "Verified revenue (count)",
    "Rejected revenue (count)",
    "Total verified amount (INR)",
  ];

  function exportCampusWise() {
    const date = todayIso();
    if (isOverview) {
      // Build one CSV per campus, packed in a ZIP.
      const allCampuses = (overview?.rows ?? []) as CampusRow[];
      if (allCampuses.length === 0) return;
      const zip = new JSZip();
      // Add an overview.csv at the root for convenience.
      const overviewCsv = toCsv(
        campusOverviewHeaders,
        allCampuses.map((r) => [
          r.campusName,
          r.teamsCount,
          r.journalsSubmitted,
          r.verifiedRevenueCount,
          r.rejectedRevenueCount,
          r.totalVerifiedAmount,
        ]),
      );
      zip.file(`campus-insights-overview-${date}.csv`, overviewCsv);
      // For per-campus team data we fetch on-demand via parallel requests.
      // To keep things simple and avoid touching every campus serially we
      // include just the campus summary row in each per-campus file. The
      // user can drill into a specific campus and export the team-level CSV
      // there for the granular view.
      for (const c of allCampuses) {
        const csv = toCsv(campusOverviewHeaders, [
          [
            c.campusName,
            c.teamsCount,
            c.journalsSubmitted,
            c.verifiedRevenueCount,
            c.rejectedRevenueCount,
            c.totalVerifiedAmount,
          ],
        ]);
        zip.file(`${safeFilename(c.campusName)}-${date}.csv`, csv);
      }
      zip.generateAsync({ type: "blob" }).then((blob) => {
        downloadBlob(blob, `campus-insights-${date}.zip`);
      });
    } else {
      const rows = (campusView?.rows ?? []) as TeamRow[];
      const csv = toCsv(
        teamHeaders,
        rows.map((r) => [
          r.teamName,
          `${r.journalWeeksSubmitted} / ${programmeWeeksTotal}`,
          r.orderBookSubmittedCount,
          r.verifiedRevenueCount,
          r.rejectedRevenueCount,
          r.totalVerifiedAmount,
        ]),
      );
      const name = safeFilename(campusView?.campusName ?? "campus");
      downloadBlob(
        new Blob([csv], { type: "text/csv;charset=utf-8" }),
        `campus-insights-${name}-${date}.csv`,
      );
    }
  }

  function exportAllCampusesSingleCsv() {
    const date = todayIso();
    if (isOverview) {
      const rows = (overview?.rows ?? []) as CampusRow[];
      const csv = toCsv(
        ["Campus", ...campusOverviewHeaders.slice(1)],
        rows.map((r) => [
          r.campusName,
          r.teamsCount,
          r.journalsSubmitted,
          r.verifiedRevenueCount,
          r.rejectedRevenueCount,
          r.totalVerifiedAmount,
        ]),
      );
      downloadBlob(
        new Blob([csv], { type: "text/csv;charset=utf-8" }),
        `campus-insights-all-${date}.csv`,
      );
    } else {
      // For drilldown view, a "single CSV" is just this campus's team CSV
      // with a Campus column on every row so the data stays pivotable.
      const rows = (campusView?.rows ?? []) as TeamRow[];
      const name = campusView?.campusName ?? "";
      const csv = toCsv(
        ["Campus", ...teamHeaders],
        rows.map((r) => [
          name,
          r.teamName,
          `${r.journalWeeksSubmitted} / ${programmeWeeksTotal}`,
          r.orderBookSubmittedCount,
          r.verifiedRevenueCount,
          r.rejectedRevenueCount,
          r.totalVerifiedAmount,
        ]),
      );
      downloadBlob(
        new Blob([csv], { type: "text/csv;charset=utf-8" }),
        `campus-insights-${safeFilename(name)}-teams-${date}.csv`,
      );
    }
  }

  function selectCampus(value: string) {
    pushUrl(value, search);
    // Reset sort whenever the view changes.
    setCampusSort({ key: "tier", dir: "asc" });
    setTeamSort({ key: "tier", dir: "asc" });
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Campus Insights</h1>
          <p className="text-muted-foreground">
            {isOverview
              ? "Aggregate metrics across every campus."
              : `Team-level metrics for ${campusView?.campusName ?? "campus"}.`}
          </p>
          {!isOverview && (
            <button
              type="button"
              onClick={() => selectCampus("all")}
              className="mt-2 inline-flex items-center gap-1 text-sm text-primary hover:underline"
              data-testid="link-back-all-campuses"
            >
              <ChevronLeft className="w-4 h-4" />
              Back to all campuses
            </button>
          )}
        </div>

        <div className="flex flex-col sm:flex-row gap-3 w-full md:w-auto">
          <div className="relative flex-1 sm:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search campus or team…"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              className="pl-9"
              data-testid="input-search"
            />
          </div>

          <Select value={urlCampus} onValueChange={selectCampus}>
            <SelectTrigger className="w-[220px]" data-testid="select-campus">
              <SelectValue placeholder="All campuses" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All campuses</SelectItem>
              {(campusesList ?? [])
                .slice()
                .sort((a, b) => a.name.localeCompare(b.name))
                .map((c) => (
                  <SelectItem key={c.id} value={String(c.id)}>
                    {c.name}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" data-testid="button-export">
                <Download className="w-4 h-4 mr-2" />
                Export
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuItem
                onClick={exportCampusWise}
                data-testid="menu-export-campus-wise"
              >
                Campus-wise CSV{isOverview ? " (ZIP)" : ""}
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={exportAllCampusesSingleCsv}
                data-testid="menu-export-single-csv"
              >
                {isOverview
                  ? "All campuses (single CSV)"
                  : "This campus (single CSV)"}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {isOverview && overview && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Card className="p-4">
            <div className="text-xs uppercase text-muted-foreground">
              Total verified revenue
            </div>
            <div className="text-2xl font-semibold mt-1">
              {formatINR(overview.totals.totalVerifiedRevenue)}
            </div>
          </Card>
          <Card className="p-4">
            <div className="text-xs uppercase text-muted-foreground">
              Total teams
            </div>
            <div className="text-2xl font-semibold mt-1">
              {overview.totals.totalTeams.toLocaleString()}
            </div>
          </Card>
          <Card className="p-4">
            <div className="text-xs uppercase text-muted-foreground">
              Journals submitted
            </div>
            <div className="text-2xl font-semibold mt-1">
              {overview.totals.totalJournalsSubmitted.toLocaleString()}
            </div>
          </Card>
        </div>
      )}

      <Card>
        {isLoading ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <div
                key={i}
                className="h-10 rounded-md bg-muted/40 animate-pulse"
              />
            ))}
          </div>
        ) : isOverview ? (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader className="sticky top-0 z-10 bg-card">
                <TableRow>
                  <TableHead
                    className="cursor-pointer select-none"
                    onClick={() => toggleCampusSort("campusName")}
                    data-testid="th-campus-name"
                  >
                    Campus name
                    <SortIcon
                      active={campusSort.key === "campusName"}
                      dir={campusSort.dir}
                    />
                  </TableHead>
                  <TableHead
                    className="text-right cursor-pointer select-none"
                    onClick={() => toggleCampusSort("teamsCount")}
                  >
                    No. of teams
                    <SortIcon
                      active={campusSort.key === "teamsCount"}
                      dir={campusSort.dir}
                    />
                  </TableHead>
                  <TableHead
                    className="text-right cursor-pointer select-none"
                    onClick={() => toggleCampusSort("journalsSubmitted")}
                  >
                    Journals submitted
                    <SortIcon
                      active={campusSort.key === "journalsSubmitted"}
                      dir={campusSort.dir}
                    />
                  </TableHead>
                  <TableHead
                    className="text-right cursor-pointer select-none"
                    onClick={() => toggleCampusSort("verifiedRevenueCount")}
                  >
                    Verified revenue
                    <SortIcon
                      active={campusSort.key === "verifiedRevenueCount"}
                      dir={campusSort.dir}
                    />
                  </TableHead>
                  <TableHead
                    className="text-right cursor-pointer select-none"
                    onClick={() => toggleCampusSort("rejectedRevenueCount")}
                  >
                    Rejected revenue
                    <SortIcon
                      active={campusSort.key === "rejectedRevenueCount"}
                      dir={campusSort.dir}
                    />
                  </TableHead>
                  <TableHead
                    className="text-right cursor-pointer select-none"
                    onClick={() => toggleCampusSort("totalVerifiedAmount")}
                  >
                    Verified amount
                    <SortIcon
                      active={campusSort.key === "totalVerifiedAmount"}
                      dir={campusSort.dir}
                    />
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {campusRows.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={6}
                      className="h-24 text-center text-muted-foreground"
                    >
                      No campuses match this filter.
                    </TableCell>
                  </TableRow>
                ) : (
                  campusRows.map((r) => (
                    <TableRow
                      key={r.campusId}
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => selectCampus(String(r.campusId))}
                      data-testid={`row-campus-${r.campusId}`}
                    >
                      <TableCell className="font-medium">
                        {r.campusName}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {r.teamsCount.toLocaleString()}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {r.journalsSubmitted.toLocaleString()}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {r.verifiedRevenueCount.toLocaleString()}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {r.rejectedRevenueCount.toLocaleString()}
                      </TableCell>
                      <TableCell className="text-right tabular-nums font-medium">
                        {formatINR(r.totalVerifiedAmount)}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader className="sticky top-0 z-10 bg-card">
                <TableRow>
                  <TableHead
                    className="cursor-pointer select-none"
                    onClick={() => toggleTeamSort("teamName")}
                  >
                    Team name
                    <SortIcon
                      active={teamSort.key === "teamName"}
                      dir={teamSort.dir}
                    />
                  </TableHead>
                  <TableHead
                    className="text-right cursor-pointer select-none"
                    onClick={() => toggleTeamSort("journalWeeksSubmitted")}
                  >
                    Journal weeks
                    <SortIcon
                      active={teamSort.key === "journalWeeksSubmitted"}
                      dir={teamSort.dir}
                    />
                  </TableHead>
                  <TableHead
                    className="text-right cursor-pointer select-none"
                    onClick={() => toggleTeamSort("orderBookSubmittedCount")}
                  >
                    Order book submitted
                    <SortIcon
                      active={teamSort.key === "orderBookSubmittedCount"}
                      dir={teamSort.dir}
                    />
                  </TableHead>
                  <TableHead
                    className="text-right cursor-pointer select-none"
                    onClick={() => toggleTeamSort("verifiedRevenueCount")}
                  >
                    Verified revenue
                    <SortIcon
                      active={teamSort.key === "verifiedRevenueCount"}
                      dir={teamSort.dir}
                    />
                  </TableHead>
                  <TableHead
                    className="text-right cursor-pointer select-none"
                    onClick={() => toggleTeamSort("rejectedRevenueCount")}
                  >
                    Rejected revenue
                    <SortIcon
                      active={teamSort.key === "rejectedRevenueCount"}
                      dir={teamSort.dir}
                    />
                  </TableHead>
                  <TableHead
                    className="text-right cursor-pointer select-none"
                    onClick={() => toggleTeamSort("totalVerifiedAmount")}
                  >
                    Total verified
                    <SortIcon
                      active={teamSort.key === "totalVerifiedAmount"}
                      dir={teamSort.dir}
                    />
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {teamRows.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={6}
                      className="h-24 text-center text-muted-foreground"
                    >
                      No teams match this filter.
                    </TableCell>
                  </TableRow>
                ) : (
                  teamRows.map((r) => (
                    <TableRow
                      key={r.teamId}
                      className="hover:bg-muted/50"
                      data-testid={`row-team-${r.teamId}`}
                    >
                      <TableCell className="font-medium">
                        {r.teamName}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {r.journalWeeksSubmitted} / {programmeWeeksTotal}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {r.orderBookSubmittedCount.toLocaleString()}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {r.verifiedRevenueCount.toLocaleString()}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {r.rejectedRevenueCount.toLocaleString()}
                      </TableCell>
                      <TableCell className="text-right tabular-nums font-medium">
                        {formatINR(r.totalVerifiedAmount)}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        )}
      </Card>

      {/* Tiny inline footer note kept neutral; no nav link to this page elsewhere. */}
      {isLoading ? null : (
        <div className="text-xs text-muted-foreground">
          Default sort: rows with both verified revenue and submitted journals
          first, then either of those, then rejected revenue, then everything
          else. Click any column header to override.
        </div>
      )}
    </div>
  );
}

