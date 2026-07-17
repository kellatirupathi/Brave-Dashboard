// Admin "Finale Submissions" list — one row per team showing its LATEST pptx
// deck (a team may submit several; the row expands to show all of them).
// Server-side search / date filter / sort / pagination, same shape as the
// review queue. Export pulls EVERY deck with its Drive link.
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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
  Check,
  ChevronLeft,
  ChevronRight,
  Download,
  ExternalLink,
  Presentation,
  Search,
  Trophy,
  X,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { formatDateTime, formatINR } from "@/lib/format";
import { useAdminPageAccess } from "@/lib/admin-access";
import { FinaleSubmissionActions } from "@/components/finale-submission-actions";
import {
  finaleExportUrl,
  listFinaleSubmissions,
  listTeamFinaleSubmissions,
  reviewFinaleSubmission,
  type FinaleAdminRow,
  type FinaleReviewStatus,
  type FinaleSort,
} from "@/lib/finale-api";

const PAGE_SIZE = 50;

// Row tint + label for a review decision. Kept light so the text stays black
// and readable — same treatment as the team-detail entry tables.
const STATUS_STYLES: Record<
  FinaleReviewStatus,
  { row: string; text: string; label: string }
> = {
  verified: {
    row: "bg-green-50 hover:bg-green-100/70 dark:bg-green-950/20 dark:hover:bg-green-950/30",
    text: "text-green-700 dark:text-green-400",
    label: "Verified",
  },
  rejected: {
    row: "bg-red-50 hover:bg-red-100/70 dark:bg-red-950/20 dark:hover:bg-red-950/30",
    text: "text-red-700 dark:text-red-400",
    label: "Rejected",
  },
  pending: {
    row: "hover:bg-muted/30",
    text: "text-muted-foreground",
    label: "Pending",
  },
};

const SORTS: Array<{ value: FinaleSort; label: string }> = [
  { value: "newest", label: "Newest first" },
  { value: "oldest", label: "Oldest first" },
  { value: "team_asc", label: "Team name: A → Z" },
  { value: "team_desc", label: "Team name: Z → A" },
];

export default function AdminFinaleSubmissions() {
  const queryClient = useQueryClient();
  // Export is separately grantable — the server enforces it too.
  const { canExport } = useAdminPageAccess("/admin/finale-submissions");
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
      <div>
        <h1 className="flex items-center gap-2 text-3xl font-bold tracking-tight">
          <Trophy className="h-7 w-7 text-primary" />
          Finale Submissions
        </h1>
        <p className="text-muted-foreground">
          Final pitch decks submitted by teams — latest per team.
        </p>
      </div>

      {/* One row: search, dates, sort — Export pinned far right. The search
          box flexes so the controls stay on a single line as it narrows. */}
      <div className="flex items-center gap-2">
        <div className="relative min-w-0 flex-1">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search team, campus, remarks…"
            className="pl-8"
            data-testid="input-finale-search"
          />
        </div>

        <Input
          type="date"
          value={from}
          onChange={(e) => setFrom(e.target.value)}
          className="w-[150px] shrink-0"
          data-testid="input-finale-from"
        />
        <span className="shrink-0 text-sm text-muted-foreground">to</span>
        <Input
          type="date"
          value={to}
          onChange={(e) => setTo(e.target.value)}
          className="w-[150px] shrink-0"
          data-testid="input-finale-to"
        />

        <Select value={sort} onValueChange={(v) => setSort(v as FinaleSort)}>
          <SelectTrigger
            className="w-[180px] shrink-0"
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

        {canExport ? (
          <Button
            asChild
            variant="outline"
            className="shrink-0"
            data-testid="button-finale-export"
          >
            <a href={finaleExportUrl(params)}>
              <Download className="mr-1.5 h-4 w-4" /> Export
            </a>
          </Button>
        ) : null}
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
                  <th className="p-3 font-medium">Category</th>
                  <th className="p-3 font-medium">Submitted by</th>
                  <th className="p-3 font-medium text-right">
                    Verified revenue
                  </th>
                  <th className="p-3 font-medium">Latest deck</th>
                  <th className="p-3 font-medium">Status</th>
                  <th className="p-3 font-medium whitespace-nowrap">
                    Submitted
                  </th>
                  <th className="p-3 font-medium text-right">Decks</th>
                  <th className="p-3 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {items.map((r) => {
                  const st = STATUS_STYLES[r.reviewStatus ?? "pending"];
                  return (
                    <tr
                      key={r.id}
                      className={`cursor-pointer border-t align-top ${st.row}`}
                      onClick={() => setDetail(r)}
                      data-testid={`finale-row-${r.teamId}`}
                    >
                      <td className="p-3 font-medium">{r.teamName}</td>
                      <td className="p-3 text-muted-foreground">
                        {r.campusName}
                      </td>
                      <td className="p-3 text-muted-foreground">
                        {r.category || "—"}
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
                      <td className={`p-3 font-semibold ${st.text}`}>
                        {st.label}
                      </td>
                      <td className="p-3 whitespace-nowrap text-muted-foreground">
                        {formatDateTime(r.createdAt)}
                      </td>
                      <td className="p-3 text-right tabular-nums text-muted-foreground">
                        {r.totalSubmissions}
                      </td>
                      <td className="p-3 text-right">
                        <FinaleSubmissionActions
                          submission={r}
                          onDone={() =>
                            queryClient.invalidateQueries({
                              queryKey: ["admin-finale-submissions"],
                            })
                          }
                        />
                      </td>
                    </tr>
                  );
                })}
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

      <TeamDecksDialog
        row={detail}
        onClose={() => setDetail(null)}
        onReviewed={(status) =>
          setDetail((d) => (d ? { ...d, reviewStatus: status } : d))
        }
      />
    </div>
  );
}

// A team's full deck history — the row only shows its latest. The footer
// verifies/rejects that latest deck (the one the table row represents), which
// is what drives the row's Status column and tint.
function TeamDecksDialog({
  row,
  onClose,
  onReviewed,
}: {
  row: FinaleAdminRow | null;
  onClose: () => void;
  // Lets the parent reflect the new status without closing the dialog.
  onReviewed: (status: FinaleReviewStatus) => void;
}) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  // Verify and Reject are separately grantable — hide whichever isn't held.
  const { canApprove, canReject } = useAdminPageAccess(
    "/admin/finale-submissions",
  );
  const { data, isLoading } = useQuery({
    queryKey: ["admin-finale-team", row?.teamId],
    queryFn: () => listTeamFinaleSubmissions(row!.teamId),
    enabled: row != null,
  });

  // An edit/delete in here also changes the row behind the dialog (it may have
  // been that team's latest deck), so refresh both lists.
  const refreshBoth = () => {
    queryClient.invalidateQueries({ queryKey: ["admin-finale-team"] });
    queryClient.invalidateQueries({ queryKey: ["admin-finale-submissions"] });
  };

  const review = useMutation({
    mutationFn: (status: "verified" | "rejected") =>
      reviewFinaleSubmission(row!.id, status),
    onSuccess: (res) => {
      toast({
        title: res.reviewStatus === "verified" ? "Verified" : "Rejected",
        description: "The team has been emailed.",
      });
      onReviewed(res.reviewStatus);
      refreshBoth();
    },
    onError: (err: unknown) =>
      toast({
        title: "Could not save the decision",
        description: err instanceof Error ? err.message : "Please try again.",
        variant: "destructive",
      }),
  });

  const status: FinaleReviewStatus = row?.reviewStatus ?? "pending";
  const st = STATUS_STYLES[status];

  return (
    <Dialog open={row != null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex flex-wrap items-center gap-2">
            {row?.teamName} — all submissions
            {status !== "pending" ? (
              <span
                className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-semibold ${st.text}`}
                data-testid="finale-review-tag"
              >
                {status === "verified" ? (
                  <Check className="h-3 w-3" />
                ) : (
                  <X className="h-3 w-3" />
                )}
                {st.label}
              </span>
            ) : null}
          </DialogTitle>
        </DialogHeader>
        {isLoading ? (
          <div className="flex justify-center py-8">
            <Spinner />
          </div>
        ) : (
          <div className="max-h-[60vh] space-y-3 overflow-y-auto">
            {(data?.items ?? []).map((item) => (
              <div key={item.id} className="flex gap-2 rounded-md border p-3">
                <div className="min-w-0 flex-1">
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
                    {item.category ? ` · ${item.category}` : ""}
                  </p>
                  {item.remarks ? (
                    <p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">
                      {item.remarks}
                    </p>
                  ) : null}
                </div>
                <FinaleSubmissionActions
                  submission={item}
                  onDone={refreshBoth}
                />
              </div>
            ))}
          </div>
        )}

        {/* Decision footer — acts on this team's latest deck, which is the one
            the table row (and its Status column) represents. Both buttons stay
            available after a decision so it can be flipped. */}
        {canApprove || canReject ? (
          <div className="flex items-center justify-between gap-3 border-t pt-4">
            <p className="text-xs text-muted-foreground">
              {status === "pending"
                ? "Verifying or rejecting emails the team."
                : `Already ${st.label.toLowerCase()} — you can still change this.`}
            </p>
            <div className="flex gap-2">
              {canApprove && status !== "verified" ? (
                <Button
                  size="sm"
                  className="bg-green-600 text-white hover:bg-green-700"
                  disabled={review.isPending}
                  onClick={() => review.mutate("verified")}
                  data-testid="button-finale-verify"
                >
                  {review.isPending && review.variables === "verified" ? (
                    <Spinner className="mr-1.5 h-4 w-4" />
                  ) : (
                    <Check className="mr-1.5 h-4 w-4" />
                  )}
                  Verify
                </Button>
              ) : null}
              {canReject && status !== "rejected" ? (
                <Button
                  size="sm"
                  variant="outline"
                  className="border-destructive/40 text-destructive hover:text-destructive"
                  disabled={review.isPending}
                  onClick={() => review.mutate("rejected")}
                  data-testid="button-finale-reject"
                >
                  {review.isPending && review.variables === "rejected" ? (
                    <Spinner className="mr-1.5 h-4 w-4" />
                  ) : (
                    <X className="mr-1.5 h-4 w-4" />
                  )}
                  Reject
                </Button>
              ) : null}
            </div>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
