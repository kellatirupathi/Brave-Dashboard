import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { CampusCombobox } from "@/components/campus-combobox";
import {
  FileBarChart,
  Search,
  Download,
  Check,
  Minus,
  ExternalLink,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { normalizeError } from "@/lib/api-error";
import {
  getReportWeeks,
  getCampusSummary,
  getCampusDrilldown,
  getReportLinks,
  downloadCampusCsv,
  type CampusSummaryRow,
} from "@/lib/reports-api";

function MailMark({ on }: { on: boolean }) {
  return on ? (
    <Check className="w-4 h-4 text-emerald-600" />
  ) : (
    <Minus className="w-4 h-4 text-muted-foreground/40" />
  );
}

function CampusReportsTab() {
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [campusFilter, setCampusFilter] = useState<string>("all");
  // "current" = current week, "all" = all weeks, else weekId.
  const [weekFilter, setWeekFilter] = useState<string>("current");
  const [drilldownId, setDrilldownId] = useState<number | null>(null);

  const weekParam =
    weekFilter === "current"
      ? undefined
      : weekFilter === "all"
        ? "all"
        : Number(weekFilter);

  const { data: weeks } = useQuery({
    queryKey: ["report-weeks"],
    queryFn: getReportWeeks,
  });

  const { data: summary, isLoading } = useQuery({
    queryKey: ["report-campus-summary", weekFilter],
    queryFn: () => getCampusSummary(weekParam),
  });

  const rows = useMemo(() => {
    let r = summary?.rows ?? [];
    if (campusFilter !== "all")
      r = r.filter((x) => String(x.campusId) === campusFilter);
    if (search.trim())
      r = r.filter((x) =>
        x.campusName.toLowerCase().includes(search.trim().toLowerCase()),
      );
    return r;
  }, [summary, campusFilter, search]);

  const drilldown = useQuery({
    queryKey: ["report-drilldown", drilldownId, weekFilter],
    queryFn: () =>
      getCampusDrilldown(
        drilldownId!,
        weekParam === "all" ? undefined : weekParam,
      ),
    enabled: drilldownId != null,
  });

  const exportTable = () => {
    if (rows.length === 0) return;
    const esc = (s: string) => `"${(s ?? "").replace(/"/g, '""')}"`;
    const lines = [
      "Campus,Total Teams,Submitted,Not Submitted,Mailed Success Coach,Mailed COS,Mailed Admin",
    ];
    for (const r of rows) {
      lines.push(
        [
          esc(r.campusName),
          r.totalTeams,
          r.submittedTeams,
          r.notSubmittedTeams,
          r.mailedSuccessCoach ? "Yes" : "No",
          r.mailedCos ? "Yes" : "No",
          r.mailedAdmin ? "Yes" : "No",
        ].join(","),
      );
    }
    const blob = new Blob([lines.join("\n")], {
      type: "text/csv;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "campus-journal-summary.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const onDownloadRow = async (row: CampusSummaryRow) => {
    try {
      await downloadCampusCsv(
        row.campusId,
        weekParam === "all" ? undefined : weekParam,
      );
    } catch (e: unknown) {
      toast({
        title: "Download failed",
        description: normalizeError(e).message,
        variant: "destructive",
      });
    }
  };

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search campus…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
            data-testid="input-report-search"
          />
        </div>
        <Select value={weekFilter} onValueChange={setWeekFilter}>
          <SelectTrigger className="w-48" data-testid="select-report-week">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="current">Current week</SelectItem>
            <SelectItem value="all">All weeks</SelectItem>
            {(weeks ?? []).map((w) => (
              <SelectItem key={w.id} value={String(w.id)}>
                Week {w.weekNumber}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <CampusCombobox
          value={campusFilter}
          onChange={setCampusFilter}
          campuses={(summary?.rows ?? []).map((r) => ({
            id: r.campusId,
            name: r.campusName,
          }))}
          className="w-56"
          testId="select-report-campus"
        />
        <Button
          variant="outline"
          onClick={exportTable}
          disabled={rows.length === 0}
          data-testid="button-export-summary"
        >
          <Download className="w-4 h-4 mr-2" /> Export
        </Button>
      </div>

      {summary?.week ? (
        <p className="text-sm text-muted-foreground">
          Week {summary.week.weekNumber} · {summary.week.startDate} →{" "}
          {summary.week.endDate}
        </p>
      ) : weekFilter !== "all" && !isLoading ? (
        /* No week has started in this season yet. Saying so is far better than
           rendering nothing, or — as it did before — reporting on the season's
           FINAL week with every team marked not-submitted. */
        <p className="text-sm text-muted-foreground">
          This season has not started yet, so there is nothing to report on.
        </p>
      ) : null}
      {weekFilter === "all" && summary?.weeksCount ? (
        <p className="text-sm text-muted-foreground">
          Aggregated across {summary.weeksCount} weeks.
        </p>
      ) : null}

      <Card>
        {isLoading ? (
          <div className="flex h-48 items-center justify-center">
            <Spinner size="lg" />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Campus</TableHead>
                  <TableHead className="text-center">Total teams</TableHead>
                  <TableHead className="text-center">Submitted</TableHead>
                  <TableHead className="text-center">Not submitted</TableHead>
                  <TableHead className="text-center">Success Coach</TableHead>
                  <TableHead className="text-center">COS</TableHead>
                  <TableHead className="text-center">Admin</TableHead>
                  <TableHead className="text-right">CSV</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow
                    key={r.campusId}
                    className="cursor-pointer hover:bg-muted/40"
                    onClick={() => setDrilldownId(r.campusId)}
                    data-testid={`report-row-${r.campusId}`}
                  >
                    <TableCell className="font-medium">
                      {r.campusName}
                    </TableCell>
                    <TableCell className="text-center tabular-nums">
                      {r.totalTeams}
                    </TableCell>
                    <TableCell className="text-center tabular-nums text-emerald-600 font-medium">
                      {r.submittedTeams}
                    </TableCell>
                    <TableCell className="text-center tabular-nums text-amber-600 font-medium">
                      {r.notSubmittedTeams}
                    </TableCell>
                    <TableCell>
                      <div className="flex justify-center">
                        <MailMark on={r.mailedSuccessCoach} />
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex justify-center">
                        <MailMark on={r.mailedCos} />
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex justify-center">
                        <MailMark on={r.mailedAdmin} />
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8"
                        onClick={(e) => {
                          e.stopPropagation();
                          onDownloadRow(r);
                        }}
                        title="Download CSV"
                        data-testid={`button-download-${r.campusId}`}
                      >
                        <Download className="w-4 h-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
                {rows.length === 0 && (
                  <TableRow>
                    <TableCell
                      colSpan={8}
                      className="h-24 text-center text-muted-foreground"
                    >
                      No campus data for this week.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        )}
      </Card>

      {/* Drill-down dialog */}
      <Dialog
        open={drilldownId != null}
        onOpenChange={(o) => !o && setDrilldownId(null)}
      >
        <DialogContent className="sm:max-w-[640px] max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {drilldown.data?.campus?.campusName ?? "Campus"} — team status
            </DialogTitle>
          </DialogHeader>
          {drilldown.isLoading ? (
            <div className="flex h-32 items-center justify-center">
              <Spinner />
            </div>
          ) : !drilldown.data?.campus ? (
            <p className="text-sm text-muted-foreground">No data.</p>
          ) : (
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">
                {drilldown.data.campus.submittedCount}/
                {drilldown.data.campus.totalTeams} submitted
                {drilldown.data.week
                  ? ` · Week ${drilldown.data.week.weekNumber}`
                  : ""}
              </p>
              {drilldown.data.campus.teams.map((t) => (
                <div
                  key={t.teamId}
                  className="flex items-center justify-between rounded-md border p-2.5"
                >
                  <span className="font-medium truncate">{t.teamName}</span>
                  {t.submitted ? (
                    <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100">
                      <CheckCircle2 className="w-3 h-3 mr-1" />
                      {t.submittedByRole === "coordinator"
                        ? "Coordinator"
                        : t.submittedByRole === "admin"
                          ? "Admin"
                          : "Student"}
                    </Badge>
                  ) : (
                    <Badge className="bg-amber-100 text-amber-700 hover:bg-amber-100">
                      <AlertCircle className="w-3 h-3 mr-1" /> Not submitted
                    </Badge>
                  )}
                </div>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ReportLinksTab() {
  const { data: links, isLoading } = useQuery({
    queryKey: ["report-links"],
    queryFn: getReportLinks,
  });

  if (isLoading)
    return (
      <div className="flex h-48 items-center justify-center">
        <Spinner size="lg" />
      </div>
    );

  if (!links || links.length === 0)
    return (
      <p className="text-sm text-muted-foreground py-12 text-center">
        No report links yet. They're generated by the weekly escalation + report
        crons.
      </p>
    );

  return (
    <Card>
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Title</TableHead>
              <TableHead>Campus</TableHead>
              <TableHead>Week</TableHead>
              <TableHead>Kind</TableHead>
              <TableHead>Created</TableHead>
              <TableHead className="text-right">Open</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {links.map((l) => (
              <TableRow key={l.id} data-testid={`report-link-${l.id}`}>
                <TableCell className="font-medium max-w-[260px] truncate">
                  {l.title}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {l.campusName ?? "All campuses"}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {l.weekLabel ?? "—"}
                </TableCell>
                <TableCell>
                  <Badge variant="outline" className="text-xs">
                    {l.kind.replace(/_/g, " ")}
                  </Badge>
                </TableCell>
                <TableCell className="text-muted-foreground text-xs">
                  {new Date(l.createdAt).toLocaleString("en-IN")}
                </TableCell>
                <TableCell className="text-right">
                  <Button asChild size="sm" variant="ghost">
                    <Link href={`/reports/view/${l.token}`}>
                      <ExternalLink className="w-4 h-4 mr-1" /> Open
                    </Link>
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </Card>
  );
}

export default function AdminReports() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
          <FileBarChart className="w-7 h-7 text-primary" /> Reports
        </h1>
        <p className="text-muted-foreground mt-1">
          Campus-wise journal submission reports and saved report links.
        </p>
      </div>

      <Tabs defaultValue="campus">
        <TabsList>
          <TabsTrigger value="campus" data-testid="tab-campus-reports">
            Campus reports
          </TabsTrigger>
          <TabsTrigger value="links" data-testid="tab-report-links">
            Report links
          </TabsTrigger>
        </TabsList>
        <TabsContent value="campus" className="mt-6">
          <CampusReportsTab />
        </TabsContent>
        <TabsContent value="links" className="mt-6">
          <ReportLinksTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
