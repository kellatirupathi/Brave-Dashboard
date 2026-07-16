// Admin "Finale Submissions" list — one row per team showing its LATEST pptx
// deck (a team may submit several; the row expands to show all of them).
// Server-side search / date filter / sort / pagination, same shape as the
// review queue. Export pulls EVERY deck with its Drive link.
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
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
import {
  ChevronLeft,
  ChevronRight,
  Download,
  ExternalLink,
  Presentation,
  Search,
  Trophy,
} from "lucide-react";
import { formatDateTime, formatINR } from "@/lib/format";
import {
  finaleExportUrl,
  listFinaleSubmissions,
  listTeamFinaleSubmissions,
  type FinaleAdminRow,
  type FinaleSort,
} from "@/lib/finale-api";

const PAGE_SIZE = 50;

const SORTS: Array<{ value: FinaleSort; label: string }> = [
  { value: "newest", label: "Newest first" },
  { value: "oldest", label: "Oldest first" },
  { value: "team_asc", label: "Team name: A → Z" },
  { value: "team_desc", label: "Team name: Z → A" },
];

export default function AdminFinaleSubmissions() {
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<FinaleSort>("newest");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(1);
  const [detail, setDetail] = useState<FinaleAdminRow | null>(null);

  const params = {
    search: search || undefined,
    from: from || undefined,
    to: to || undefined,
    sort,
    page,
    pageSize: PAGE_SIZE,
  };

  const { data, isLoading } = useQuery({
    queryKey: ["admin-finale-submissions", search, sort, from, to, page],
    queryFn: () => listFinaleSubmissions(params),
  });

  // Any filter change puts you back on page 1 — otherwise you can land on an
  // empty page that no longer exists in the narrowed result set.
  useEffect(() => {
    setPage(1);
  }, [search, sort, from, to]);

  const items = data?.items ?? [];
  const totalCount = data?.totalCount ?? 0;
  const pageCount = Math.max(1, data?.pageCount ?? 1);
  const rangeStart = totalCount === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const rangeEnd = (page - 1) * PAGE_SIZE + items.length;

  return (
    <div className="space-y-6">
      {/* Title left; filters + search + export pinned right. */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-3xl font-bold tracking-tight">
            <Trophy className="h-7 w-7 text-primary" />
            Finale Submissions
          </h1>
          <p className="text-muted-foreground">
            Final pitch decks submitted by teams — latest per team.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1">
            <Input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="w-[150px]"
              data-testid="input-finale-from"
            />
            <span className="text-sm text-muted-foreground">to</span>
            <Input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="w-[150px]"
              data-testid="input-finale-to"
            />
          </div>

          <Select value={sort} onValueChange={(v) => setSort(v as FinaleSort)}>
            <SelectTrigger
              className="w-[180px]"
              data-testid="select-finale-sort"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SORTS.map((s) => (
                <SelectItem key={s.value} value={s.value}>
                  {s.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <div className="relative w-full max-w-xs">
            <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search team, campus, remarks…"
              className="pl-8"
              data-testid="input-finale-search"
            />
          </div>

          <Button
            asChild
            variant="outline"
            size="sm"
            data-testid="button-finale-export"
          >
            <a href={finaleExportUrl(params)}>
              <Download className="mr-1.5 h-4 w-4" /> Export
            </a>
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="flex h-64 items-center justify-center">
          <Spinner size="lg" />
        </div>
      ) : items.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            <Presentation className="mx-auto mb-3 h-8 w-8 opacity-40" />
            No submissions yet.
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="overflow-x-auto rounded-md border">
            <table className="w-full min-w-[1000px] text-sm">
              <thead className="bg-muted/50">
                <tr className="text-left">
                  <th className="p-3 font-medium">Team</th>
                  <th className="p-3 font-medium">Campus</th>
                  <th className="p-3 font-medium">Submitted by</th>
                  <th className="p-3 font-medium text-right">
                    Verified revenue
                  </th>
                  <th className="p-3 font-medium">Latest deck</th>
                  <th className="p-3 font-medium whitespace-nowrap">
                    Submitted
                  </th>
                  <th className="p-3 font-medium text-right">Decks</th>
                </tr>
              </thead>
              <tbody>
                {items.map((r) => (
                  <tr
                    key={r.id}
                    className="cursor-pointer border-t align-top hover:bg-muted/30"
                    onClick={() => setDetail(r)}
                    data-testid={`finale-row-${r.teamId}`}
                  >
                    <td className="p-3 font-medium">{r.teamName}</td>
                    <td className="p-3 text-muted-foreground">
                      {r.campusName}
                    </td>
                    <td className="p-3 text-muted-foreground">
                      {r.leaderName}
                    </td>
                    <td className="p-3 text-right tabular-nums">
                      {formatINR(r.verifiedRevenue)}
                    </td>
                    <td className="p-3">
                      <a
                        href={r.driveUrl || `/api/storage${r.fileUrl}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="inline-flex items-center gap-1 text-primary hover:underline"
                      >
                        <Presentation className="h-3.5 w-3.5" />
                        <span className="max-w-[200px] truncate">
                          {r.fileName || "Deck"}
                        </span>
                        <ExternalLink className="h-3 w-3 opacity-70" />
                      </a>
                    </td>
                    <td className="p-3 whitespace-nowrap text-muted-foreground">
                      {formatDateTime(r.createdAt)}
                    </td>
                    <td className="p-3 text-right tabular-nums text-muted-foreground">
                      {r.totalSubmissions}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-between gap-2 pt-2">
            <span
              className="text-sm text-muted-foreground"
              data-testid="text-finale-range"
            >
              Showing {rangeStart}–{rangeEnd} of {totalCount}
            </span>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                data-testid="button-finale-prev"
              >
                <ChevronLeft className="h-4 w-4" /> Previous
              </Button>
              <span className="text-sm tabular-nums text-muted-foreground">
                Page {page} of {pageCount}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= pageCount}
                onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
                data-testid="button-finale-next"
              >
                Next <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </>
      )}

      <TeamDecksDialog row={detail} onClose={() => setDetail(null)} />
    </div>
  );
}

// A team's full deck history — the row only shows its latest.
function TeamDecksDialog({
  row,
  onClose,
}: {
  row: FinaleAdminRow | null;
  onClose: () => void;
}) {
  const { data, isLoading } = useQuery({
    queryKey: ["admin-finale-team", row?.teamId],
    queryFn: () => listTeamFinaleSubmissions(row!.teamId),
    enabled: row != null,
  });

  return (
    <Dialog open={row != null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{row?.teamName} — all submissions</DialogTitle>
        </DialogHeader>
        {isLoading ? (
          <div className="flex justify-center py-8">
            <Spinner />
          </div>
        ) : (
          <div className="max-h-[60vh] space-y-3 overflow-y-auto">
            {(data?.items ?? []).map((item) => (
              <div key={item.id} className="rounded-md border p-3">
                <a
                  href={item.driveUrl || `/api/storage${item.fileUrl}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
                >
                  <Presentation className="h-3.5 w-3.5" />
                  {item.fileName || "Deck"}
                  <ExternalLink className="h-3 w-3 opacity-70" />
                </a>
                <p className="mt-1 text-xs text-muted-foreground">
                  {formatDateTime(item.createdAt)} · by {item.submitterName}
                </p>
                {item.remarks ? (
                  <p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">
                    {item.remarks}
                  </p>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
