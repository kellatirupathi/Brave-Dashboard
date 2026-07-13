// Admin "Popups" page (Communications menu). One row per student popup
// confirmation, across every popup: template name, student, NIAT id, campus,
// and when they confirmed. Search + template filter + CSV export + pagination.
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { listPopups, getPopupConfirmations } from "@/lib/popups-api";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Badge } from "@/components/ui/badge";
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
import { useToast } from "@/hooks/use-toast";
import { formatDateTime } from "@/lib/format";
import {
  Search,
  Filter,
  Download,
  ChevronLeft,
  ChevronRight,
  MessageSquare,
} from "lucide-react";

const PAGE_SIZE = 50;
const ALL_POPUPS = "__all__";

export default function AdminPopups() {
  const { toast } = useToast();
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [popupFilter, setPopupFilter] = useState<string>(ALL_POPUPS);
  const [page, setPage] = useState(1);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    const h = window.setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(1);
    }, 300);
    return () => window.clearTimeout(h);
  }, [searchInput]);

  const { data: popups = [] } = useQuery({
    queryKey: ["popups-list"],
    queryFn: listPopups,
    staleTime: 60_000,
  });

  const popupId = popupFilter !== ALL_POPUPS ? Number(popupFilter) : undefined;

  const { data, isLoading } = useQuery({
    queryKey: ["popup-confirmations", search, popupId, page],
    queryFn: () =>
      getPopupConfirmations({
        search: search || undefined,
        popupId,
        page,
        pageSize: PAGE_SIZE,
      }),
  });

  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  useEffect(() => {
    if (page > pageCount) setPage(pageCount);
  }, [pageCount, page]);

  const downloadCsv = async () => {
    if (exporting) return;
    setExporting(true);
    try {
      const p = new URLSearchParams();
      if (search) p.set("search", search);
      if (popupId != null) p.set("popupId", String(popupId));
      const qs = p.toString();
      const res = await fetch(
        `/api/admin/popup-confirmations/export.csv${qs ? `?${qs}` : ""}`,
        { credentials: "include" },
      );
      if (!res.ok) throw new Error(`Export failed (HTTP ${res.status})`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "popup-confirmations.csv";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast({ title: "CSV exported", description: "popup-confirmations.csv" });
    } catch (err) {
      toast({
        title: "Export failed",
        description: err instanceof Error ? err.message : "Please try again.",
        variant: "destructive",
      });
    } finally {
      setExporting(false);
    }
  };

  const rangeStart = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const rangeEnd = (page - 1) * PAGE_SIZE + items.length;

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-3xl font-bold tracking-tight">
            <MessageSquare className="h-7 w-7 text-primary" /> Popups
          </h1>
          <p className="text-muted-foreground">
            Every student confirmation of a pop-up, across all templates.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full md:w-auto">
          {/* Search */}
          <div className="relative flex-1 sm:w-72">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search student, NIAT ID, email or template…"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              className="pl-9"
              data-testid="input-popups-search"
            />
          </div>

          {/* Template filter */}
          <Select
            value={popupFilter}
            onValueChange={(v) => {
              setPopupFilter(v);
              setPage(1);
            }}
          >
            <SelectTrigger
              className="sm:w-56"
              data-testid="select-popup-filter"
            >
              <div className="flex items-center gap-2">
                <Filter className="w-4 h-4" />
                <SelectValue placeholder="Template" />
              </div>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_POPUPS}>All templates</SelectItem>
              {popups.map((p) => (
                <SelectItem key={p.id} value={String(p.id)}>
                  {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Export */}
          <Button
            variant="outline"
            onClick={() => void downloadCsv()}
            disabled={exporting || total === 0}
            data-testid="button-popups-export"
          >
            {exporting ? (
              <Spinner className="w-4 h-4 mr-2" />
            ) : (
              <Download className="w-4 h-4 mr-2" />
            )}
            Export CSV
          </Button>
        </div>
      </div>

      <Card>
        {isLoading ? (
          <div className="flex h-64 items-center justify-center">
            <Spinner size="lg" />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12">#</TableHead>
                  <TableHead>Template</TableHead>
                  <TableHead>Student</TableHead>
                  <TableHead>NIAT ID</TableHead>
                  <TableHead>Campus</TableHead>
                  <TableHead>Confirmed at</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((r, i) => (
                  <TableRow key={r.id} data-testid={`row-confirmation-${r.id}`}>
                    <TableCell className="text-muted-foreground tabular-nums">
                      {rangeStart + i}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="font-normal">
                        {r.templateName}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="font-medium">{r.studentName}</div>
                      {r.email && (
                        <div className="text-xs text-muted-foreground truncate max-w-[220px]">
                          {r.email}
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="tabular-nums">
                      {r.niatId ?? "—"}
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      {r.campusName ?? "—"}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                      {formatDateTime(r.confirmedAt)}
                    </TableCell>
                  </TableRow>
                ))}
                {items.length === 0 && (
                  <TableRow>
                    <TableCell
                      colSpan={6}
                      className="h-24 text-center text-muted-foreground"
                    >
                      No confirmations found.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        )}
      </Card>

      {total > 0 && (
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm text-muted-foreground">
            Showing {rangeStart}–{rangeEnd} of {total.toLocaleString()}
          </span>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              data-testid="button-popups-prev"
            >
              <ChevronLeft className="w-4 h-4 mr-1" />
              Previous
            </Button>
            <span className="text-sm tabular-nums">
              Page {page} of {pageCount}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= pageCount}
              onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
              data-testid="button-popups-next"
            >
              Next
              <ChevronRight className="w-4 h-4 ml-1" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
