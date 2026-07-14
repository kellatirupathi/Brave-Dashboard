import {
  useGetAdminReviewQueue,
  useVerifyRevenueEntry,
  useRejectRevenueEntry,
  useUnverifyRevenueEntry,
  useReanalyseRevenueEntry,
  getGetAdminReviewQueueQueryKey,
} from "@workspace/api-client-react";
import { formatINR, formatDateTime } from "@/lib/format";
import { useAdminPageAccess } from "@/lib/admin-access";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertCircle,
  Check,
  X,
  Sparkles,
  Search,
  RotateCcw,
  CheckCircle2,
  XCircle,
  Bot,
  Loader2,
  Hourglass,
  ChevronLeft,
  ChevronRight,
  ArrowUpDown,
} from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { DocumentLinkButton } from "@/components/document-viewer";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { useEffect, useState } from "react";
import { Link } from "wouter";

type QueueItem = {
  id: number;
  type: "revenue";
  teamId: number;
  teamName: string;
  campusName: string;
  projectTitle: string;
  clientName: string;
  amount: number;
  submittedAt: string | Date;
  isOverdue: boolean;
  supportingDocUrl?: string | null;
  brdUrl?: string | null;
  status: "submitted" | "verified" | "rejected";
  verifiedAmount?: number | null;
  verifiedAt?: string | Date | null;
  adminNotes?: string | null;
  brdScore?: number | null;
  uniquenessScore?: number | null;
  aiAnalysedAt?: string | Date | null;
  aiAnalysisDetail?: BrdAiAnalysis | null;
};

type BrdAiAnalysis = {
  brd_score?: number;
  brd_findings?: string[];
  brd_pdf_summary?: {
    total_pages?: number;
    images_detected?: number;
    amount_match?: "yes" | "no" | "close" | "unable to verify";
  };
  uniqueness_score?: number;
  uniqueness_summary?: string;
  uniqueness_findings?: string[];
  uniqueness_comparison?: Array<{
    entry_label?: string;
    similarity_percent?: number;
    flag?: "unique" | "suspicious" | "duplicate";
    reason?: string;
  }>;
  analysed_at?: string;
};

type Tab = "pending" | "approved" | "rejected";

type SortOption = "newest" | "oldest" | "amount_desc" | "amount_asc";

// Tap-to-insert default rejection reasons shown under the reject textarea.
const REJECT_SUGGESTIONS = [
  "Kindly submit the BRD in the required format",
  "Please attach conversation screenshots, working links, a phase-wise payment plan, client details, and testimonials",
];

// Small chip row that inserts a suggested reason into the reject textarea.
function RejectReasonSuggestions({
  onPick,
}: {
  onPick: (text: string) => void;
}) {
  return (
    <div className="space-y-1.5">
      <p className="text-xs text-muted-foreground">
        Quick reasons — tap to add:
      </p>
      <div className="flex flex-wrap gap-1.5">
        {REJECT_SUGGESTIONS.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => onPick(s)}
            className="rounded-full border px-2.5 py-1 text-left text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            data-testid="reject-suggestion"
          >
            {s}
          </button>
        ))}
      </div>
    </div>
  );
}

// Append a picked suggestion to whatever the admin has already typed.
function appendReason(prev: string, text: string): string {
  const base = prev.trim();
  if (!base) return text;
  if (base.includes(text)) return base;
  return `${base} ${text}`;
}

export default function AdminQueue() {
  const [tab, setTab] = useState<Tab>("pending");
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<SortOption>("newest");

  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput.trim()), 250);
    return () => clearTimeout(t);
  }, [searchInput]);

  // Reset search when tab changes
  useEffect(() => {
    setSearchInput("");
    setSearch("");
  }, [tab]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Review Queue</h1>
          <p className="text-muted-foreground mt-1">
            Verify, reject, or unverify revenue entries submitted by teams.
          </p>
        </div>
        <div className="flex flex-col sm:flex-row gap-3 w-full md:w-auto">
          <div className="relative w-full sm:w-80">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search by team, project, client, amount…"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              className="pl-9"
              data-testid="input-search-queue"
            />
          </div>
          <Select value={sort} onValueChange={(v) => setSort(v as SortOption)}>
            <SelectTrigger className="sm:w-52" data-testid="select-queue-sort">
              <div className="flex items-center gap-2">
                <ArrowUpDown className="w-4 h-4" />
                <SelectValue placeholder="Sort" />
              </div>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="newest">Newest first</SelectItem>
              <SelectItem value="oldest">Oldest first</SelectItem>
              <SelectItem value="amount_desc">Amount: High → Low</SelectItem>
              <SelectItem value="amount_asc">Amount: Low → High</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)}>
        <div className="flex items-center justify-between gap-2">
          <TabsList>
            <TabsTrigger value="pending" data-testid="tab-pending">
              Pending review
            </TabsTrigger>
            <TabsTrigger value="approved" data-testid="tab-approved">
              Approved
            </TabsTrigger>
            <TabsTrigger value="rejected" data-testid="tab-rejected">
              Rejected
            </TabsTrigger>
          </TabsList>
          <Link href="/admin/queue/detailed-analysis">
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              data-testid="link-view-all-analysis"
            >
              <Bot className="w-4 h-4" />
              View all analysis
            </Button>
          </Link>
        </div>

        <TabsContent value="pending" className="mt-6">
          <QueueList status="submitted" search={search} sort={sort} />
        </TabsContent>

        <TabsContent value="approved" className="mt-6">
          <QueueList status="verified" search={search} sort={sort} />
        </TabsContent>

        <TabsContent value="rejected" className="mt-6">
          <QueueList status="rejected" search={search} sort={sort} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

const QUEUE_PAGE_SIZE = 20;

function QueueList({
  status,
  search,
  sort,
}: {
  status: "submitted" | "verified" | "rejected";
  search: string;
  sort: SortOption;
}) {
  const type = "revenue" as const;
  const [page, setPage] = useState(1);

  // Bulk multi-select is only offered on the pending tab, and only to admins
  // who may edit the queue. Selection is scoped to the current page.
  const { canEdit } = useAdminPageAccess("/admin/queue");
  const selectable = status === "submitted" && canEdit;
  const [selected, setSelected] = useState<Set<number>>(new Set());

  // Reset to the first page whenever the search term or sort order changes.
  useEffect(() => {
    setPage(1);
  }, [search, sort]);

  // Selection is per-page — clear it whenever the page or search changes.
  useEffect(() => {
    setSelected(new Set());
  }, [page, search]);

  const { data: queue, isLoading } = useGetAdminReviewQueue({
    type,
    status,
    search: search || undefined,
    sort,
    page,
    pageSize: QUEUE_PAGE_SIZE,
  });

  const pageCount = Math.max(1, queue?.pageCount ?? 1);

  // If entries were removed (e.g. after verifying) and the current page no
  // longer exists, fall back to the last valid page.
  useEffect(() => {
    if (queue && page > pageCount) setPage(pageCount);
  }, [queue, page, pageCount]);

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  const items = (queue?.items ?? []) as QueueItem[];
  const totalCount = queue?.totalCount ?? items.length;
  const overdueCount = queue?.overdueCount ?? 0;
  const rangeStart = totalCount === 0 ? 0 : (page - 1) * QUEUE_PAGE_SIZE + 1;
  const rangeEnd = (page - 1) * QUEUE_PAGE_SIZE + items.length;

  const selectedItems = items.filter((i) => selected.has(i.id));
  const allOnPageSelected =
    items.length > 0 && items.every((i) => selected.has(i.id));

  const toggleOne = (id: number) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const toggleAllOnPage = () =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (items.every((i) => next.has(i.id))) {
        for (const i of items) next.delete(i.id);
      } else {
        for (const i of items) next.add(i.id);
      }
      return next;
    });

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div className="text-sm text-muted-foreground">
          <span className="mr-2">{totalCount} total</span>
          {status === "submitted" && overdueCount > 0 ? (
            <span className="text-destructive font-medium">
              · {overdueCount} overdue
            </span>
          ) : null}
        </div>
        {selectable && items.length > 0 ? (
          <label className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer select-none">
            <Checkbox
              checked={allOnPageSelected}
              onCheckedChange={toggleAllOnPage}
              aria-label="Select all on this page"
              data-testid="checkbox-queue-select-all"
            />
            Select all on this page
          </label>
        ) : null}
      </div>

      {selectable && selectedItems.length > 0 ? (
        <BulkReviewBar
          items={selectedItems}
          onDone={() => setSelected(new Set())}
        />
      ) : null}

      {items.length === 0 ? (
        <EmptyState status={status} />
      ) : (
        <>
          <div className="flex flex-col gap-3">
            {items.map((item) => (
              <QueueRow
                key={item.id}
                item={item}
                status={status}
                selectable={selectable}
                checked={selected.has(item.id)}
                onToggle={toggleOne}
              />
            ))}
          </div>

          <div className="flex items-center justify-between gap-2 pt-2">
            <span
              className="text-sm text-muted-foreground"
              data-testid="text-queue-range"
            >
              Showing {rangeStart}–{rangeEnd} of {totalCount}
            </span>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                data-testid="button-queue-prev"
              >
                <ChevronLeft className="w-4 h-4" />
                Previous
              </Button>
              <span
                className="text-sm text-muted-foreground tabular-nums"
                data-testid="text-queue-page"
              >
                Page {page} of {pageCount}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= pageCount}
                onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
                data-testid="button-queue-next"
              >
                Next
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function EmptyState({
  status,
}: {
  status: "submitted" | "verified" | "rejected";
}) {
  if (status === "rejected") {
    return (
      <div className="text-center py-16 text-muted-foreground border-2 border-dashed rounded-lg">
        <XCircle className="w-12 h-12 mx-auto mb-4 text-muted-foreground opacity-40" />
        <h3 className="text-lg font-semibold text-foreground">
          No rejected entries
        </h3>
        <p>No revenue entries have been rejected.</p>
      </div>
    );
  }
  return (
    <div className="text-center py-16 text-muted-foreground border-2 border-dashed rounded-lg">
      <Check className="w-12 h-12 mx-auto mb-4 text-green-500 opacity-50" />
      <h3 className="text-lg font-semibold text-foreground">
        {status === "submitted"
          ? "Pending queue is empty"
          : "No approved entries"}
      </h3>
      <p>
        {status === "submitted"
          ? "You're all caught up on revenue reviews!"
          : "No revenue entries have been verified yet."}
      </p>
    </div>
  );
}

function QueueRow({
  item,
  status,
  selectable = false,
  checked = false,
  onToggle,
}: {
  item: QueueItem;
  status: "submitted" | "verified" | "rejected";
  selectable?: boolean;
  checked?: boolean;
  onToggle?: (id: number) => void;
}) {
  // Review-queue verify/reject/unverify are "edit" actions — hidden for an
  // admin without edit on /admin/queue (default-allow for everyone else).
  const { canEdit } = useAdminPageAccess("/admin/queue");
  return (
    <Card
      className={`group relative transition-shadow hover:shadow-md hover:border-primary/40 ${
        item.isOverdue ? "border-destructive/50 shadow-sm" : ""
      } ${checked ? "ring-2 ring-primary/50" : ""}`}
      data-testid={`row-queue-${item.id}`}
    >
      <Link
        href={`/admin/teams/${item.teamId}`}
        className="absolute inset-0 z-10 rounded-lg cursor-pointer focus:outline-none"
        aria-label={`Open ${item.teamName} team details`}
        data-testid={`link-queue-card-${item.id}`}
      />
      <div className="p-4 flex flex-col lg:flex-row lg:items-center gap-4">
        {selectable ? (
          <div
            className="relative z-20 flex items-center self-start lg:self-center"
            onClick={(e) => e.stopPropagation()}
          >
            <Checkbox
              checked={checked}
              onCheckedChange={() => onToggle?.(item.id)}
              aria-label={`Select ${item.teamName} revenue entry`}
              data-testid={`checkbox-queue-${item.id}`}
            />
          </div>
        ) : null}

        {/* Left — main info */}
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2 mb-2">
            <h3 className="font-bold text-base group-hover:underline underline-offset-2 truncate">
              {item.teamName}
            </h3>
            <Badge variant="outline">{item.campusName}</Badge>
            {status === "verified" ? (
              <Badge className="h-5 px-1.5 bg-green-600 hover:bg-green-600 text-white">
                <CheckCircle2 className="w-3 h-3 mr-1" /> Verified
              </Badge>
            ) : status === "rejected" ? (
              <Badge className="h-5 px-1.5 bg-destructive hover:bg-destructive text-destructive-foreground">
                <XCircle className="w-3 h-3 mr-1" /> Rejected
              </Badge>
            ) : item.isOverdue ? (
              <Badge variant="destructive" className="h-5 px-1.5">
                <AlertCircle className="w-3 h-3 mr-1" /> Overdue
              </Badge>
            ) : Date.now() - new Date(item.submittedAt).getTime() <
              10 * 60 * 1000 ? (
              <Badge
                className="h-5 px-1.5 bg-emerald-600 hover:bg-emerald-600 text-white"
                data-testid={`badge-just-submitted-${item.id}`}
              >
                <Sparkles className="w-3 h-3 mr-1" /> Just submitted
              </Badge>
            ) : null}
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-x-6 gap-y-2 text-sm">
            <div className="min-w-0">
              <div className="text-xs font-medium text-muted-foreground">
                Project
              </div>
              <div className="font-medium truncate">{item.projectTitle}</div>
            </div>
            <div className="min-w-0">
              <div className="text-xs font-medium text-muted-foreground">
                Client
              </div>
              <div className="font-medium truncate">{item.clientName}</div>
            </div>
            <div>
              <div className="text-xs font-medium text-muted-foreground">
                {status === "verified" ? "Verified amount" : "Amount claimed"}
              </div>
              <div className="font-bold text-primary">
                {status === "verified"
                  ? formatINR(item.verifiedAmount ?? item.amount)
                  : formatINR(item.amount)}
              </div>
            </div>
            <div>
              <div className="text-xs font-medium text-muted-foreground">
                {status === "verified" ? "Verified" : "Submitted"}
              </div>
              <div>
                {status === "verified" && item.verifiedAt
                  ? formatDateTime(item.verifiedAt as string)
                  : formatDateTime(item.submittedAt as string)}
              </div>
            </div>
          </div>

          {status === "verified" && item.amount !== item.verifiedAmount ? (
            <div className="mt-2 text-xs text-muted-foreground">
              Originally claimed: {formatINR(item.amount)}
            </div>
          ) : null}

          {status === "verified" && item.adminNotes ? (
            <div className="mt-2 text-xs text-muted-foreground italic line-clamp-2">
              Admin notes: {item.adminNotes}
            </div>
          ) : null}

          {status === "rejected" && item.adminNotes ? (
            <div className="mt-2 text-xs text-destructive/80 italic">
              Rejection reason: {item.adminNotes}
            </div>
          ) : null}

          {item.brdUrl ? (
            <div
              className="mt-3 relative z-20"
              onClick={(e) => e.stopPropagation()}
            >
              <AiBrdAuditCard item={item} />
            </div>
          ) : null}
        </div>

        {/* Right — actions */}
        <div
          className="flex flex-col sm:flex-row lg:flex-row gap-2 lg:items-center lg:w-auto relative z-20 shrink-0"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex flex-wrap gap-2">
            <DocumentLinkButton
              url={item.supportingDocUrl ?? null}
              label="Document"
              filename={`${item.teamName}-supporting-doc`}
              testId={`button-view-doc-${item.id}`}
            />
            <DocumentLinkButton
              url={item.brdUrl ?? null}
              label="BRD"
              filename={`${item.teamName}-brd`}
              testId={`button-view-brd-${item.id}`}
            />
          </div>

          {canEdit &&
            (status === "submitted" ? (
              <PendingActions item={item} />
            ) : status === "rejected" ? (
              <ReopenAction item={item} />
            ) : (
              <UnverifyAction item={item} />
            ))}
        </div>
      </div>
    </Card>
  );
}

// Bulk verify / reject for the selected pending entries. There is no bulk
// backend endpoint, so this loops the existing per-entry mutations (each also
// fires its own notification/email side-effects, same as a single action).
// Bulk verify uses each entry's full claimed amount — to verify a different
// amount, review that entry individually.
function BulkReviewBar({
  items,
  onDone,
}: {
  items: QueueItem[];
  onDone: () => void;
}) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const verify = useVerifyRevenueEntry();
  const reject = useRejectRevenueEntry();
  const [open, setOpen] = useState<"approve" | "reject" | null>(null);
  const [notes, setNotes] = useState("");
  const [progress, setProgress] = useState<{
    done: number;
    total: number;
  } | null>(null);
  const running = progress !== null;

  const totalAmount = items.reduce((sum, i) => sum + (i.amount || 0), 0);

  const invalidate = () => {
    for (const s of ["submitted", "verified", "rejected"] as const) {
      queryClient.invalidateQueries({
        queryKey: getGetAdminReviewQueueQueryKey({
          type: "revenue",
          status: s as "submitted" | "verified",
        }),
      });
    }
  };

  const runBulk = async (mode: "approve" | "reject") => {
    if (mode === "reject" && !notes.trim()) return;
    setProgress({ done: 0, total: items.length });
    let ok = 0;
    let fail = 0;
    for (const it of items) {
      try {
        if (mode === "approve") {
          await verify.mutateAsync({
            id: it.id,
            data: { verifiedAmount: it.amount, adminNotes: notes },
          });
        } else {
          await reject.mutateAsync({
            id: it.id,
            data: { adminNotes: notes },
          });
        }
        ok++;
      } catch {
        fail++;
      }
      setProgress((p) => (p ? { ...p, done: p.done + 1 } : p));
    }
    setProgress(null);
    setOpen(null);
    setNotes("");
    invalidate();
    const verb = mode === "approve" ? "Verified" : "Rejected";
    toast({
      title: `${verb} ${ok} ${ok === 1 ? "entry" : "entries"}${
        fail ? ` · ${fail} failed` : ""
      }`,
      variant: fail ? "destructive" : undefined,
    });
    onDone();
  };

  return (
    <div className="sticky top-2 z-30 flex flex-wrap items-center gap-3 rounded-lg border bg-background/95 px-4 py-2 shadow-sm backdrop-blur">
      <span className="text-sm font-medium" data-testid="text-bulk-selected">
        {items.length} selected · {formatINR(totalAmount)} claimed
      </span>
      <div className="ml-auto flex items-center gap-2">
        <Button
          size="sm"
          className="bg-green-600 hover:bg-green-700 text-white"
          onClick={() => setOpen("approve")}
          disabled={running}
          data-testid="button-bulk-approve"
        >
          <Check className="w-4 h-4 mr-1" /> Approve selected
        </Button>
        <Button
          size="sm"
          className="bg-red-400 hover:bg-red-500 text-white"
          onClick={() => setOpen("reject")}
          disabled={running}
          data-testid="button-bulk-reject"
        >
          <X className="w-4 h-4 mr-1" /> Reject selected
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={onDone}
          disabled={running}
          data-testid="button-bulk-clear"
        >
          Clear
        </Button>
      </div>

      {/* Bulk approve dialog */}
      <Dialog
        open={open === "approve"}
        onOpenChange={(o) => (!o && !running ? setOpen(null) : undefined)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Approve {items.length} entries</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <p className="text-sm text-muted-foreground">
              Each selected entry will be verified at its{" "}
              <strong>full claimed amount</strong> (total{" "}
              {formatINR(totalAmount)}). To verify a different amount, review
              that entry individually.
            </p>
            <div className="space-y-2">
              <label className="text-sm font-medium">
                Admin notes (optional, applied to all)
              </label>
              <Textarea
                placeholder="Optional note added to every verified entry…"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>
            {running ? (
              <p className="text-sm text-muted-foreground">
                Verifying {progress?.done}/{progress?.total}…
              </p>
            ) : null}
            <div className="flex justify-end pt-2">
              <Button
                onClick={() => void runBulk("approve")}
                disabled={running}
                className="bg-green-600 hover:bg-green-700 text-white"
                data-testid="button-confirm-bulk-approve"
              >
                {running && <Spinner className="w-4 h-4 mr-2" />}
                Verify {items.length} entries
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Bulk reject dialog */}
      <Dialog
        open={open === "reject"}
        onOpenChange={(o) => (!o && !running ? setOpen(null) : undefined)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject {items.length} entries</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <label className="text-sm font-medium text-destructive">
                Rejection reason (required, applied to all)
              </label>
              <Textarea
                placeholder="Explain why these are being rejected so the students can fix them…"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                required
              />
              <RejectReasonSuggestions
                onPick={(text) => setNotes((prev) => appendReason(prev, text))}
              />
            </div>
            {running ? (
              <p className="text-sm text-muted-foreground">
                Rejecting {progress?.done}/{progress?.total}…
              </p>
            ) : null}
            <div className="flex justify-end pt-2">
              <Button
                onClick={() => void runBulk("reject")}
                disabled={running || !notes.trim()}
                className="bg-red-400 hover:bg-red-500 text-white"
                data-testid="button-confirm-bulk-reject"
              >
                {running && <Spinner className="w-4 h-4 mr-2" />}
                Reject {items.length} entries
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function PendingActions({ item }: { item: QueueItem }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const verify = useVerifyRevenueEntry();
  const reject = useRejectRevenueEntry();
  const [open, setOpen] = useState<"approve" | "reject" | null>(null);
  const [verifiedAmount, setVerifiedAmount] = useState<number | "">(
    item.amount,
  );
  const [adminNotes, setAdminNotes] = useState("");

  const isPending = verify.isPending || reject.isPending;

  const reset = () => {
    setOpen(null);
    setAdminNotes("");
    setVerifiedAmount(item.amount);
  };

  const invalidate = () => {
    queryClient.invalidateQueries({
      queryKey: getGetAdminReviewQueueQueryKey({
        type: "revenue",
        status: "submitted",
      }),
    });
    queryClient.invalidateQueries({
      queryKey: getGetAdminReviewQueueQueryKey({
        type: "revenue",
        status: "verified",
      }),
    });
    queryClient.invalidateQueries({
      queryKey: getGetAdminReviewQueueQueryKey({
        type: "revenue",
        status: "rejected" as "submitted" | "verified",
      }),
    });
  };

  const onApprove = () => {
    const amount = Number(verifiedAmount) || item.amount;
    verify.mutate(
      { id: item.id, data: { verifiedAmount: amount, adminNotes } },
      {
        onSuccess: () => {
          toast({ title: "Revenue entry verified" });
          invalidate();
          reset();
        },
      },
    );
  };

  const onReject = () => {
    reject.mutate(
      { id: item.id, data: { adminNotes } },
      {
        onSuccess: () => {
          toast({ title: "Revenue entry rejected" });
          invalidate();
          reset();
        },
      },
    );
  };

  return (
    <div className="flex gap-2">
      <Button
        size="sm"
        className="bg-green-600 hover:bg-green-700 text-white"
        onClick={() => setOpen("approve")}
        data-testid={`button-verify-${item.id}`}
      >
        <Check className="w-4 h-4 mr-1" /> Verify
      </Button>
      <Button
        size="sm"
        className="bg-red-400 hover:bg-red-500 text-white"
        onClick={() => setOpen("reject")}
        data-testid={`button-reject-${item.id}`}
      >
        <X className="w-4 h-4 mr-1" /> Reject
      </Button>

      {/* Verify dialog */}
      <Dialog
        open={open === "approve"}
        onOpenChange={(o) => (!o ? reset() : null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Verify Revenue Entry</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Verified Amount (₹)</label>
              <Input
                type="number"
                value={verifiedAmount}
                onChange={(e) => setVerifiedAmount(Number(e.target.value))}
              />
              <p className="text-xs text-muted-foreground">
                Original claim: {formatINR(item.amount)}
              </p>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">
                Admin Notes (Optional)
              </label>
              <Textarea
                placeholder="Add internal notes or feedback..."
                value={adminNotes}
                onChange={(e) => setAdminNotes(e.target.value)}
              />
            </div>
            <div className="flex justify-end pt-4">
              <Button
                onClick={onApprove}
                disabled={isPending}
                className="bg-green-600 hover:bg-green-700 text-white"
                data-testid={`button-confirm-verify-${item.id}`}
              >
                {isPending && <Spinner className="w-4 h-4 mr-2" />} Confirm
                Verification
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Reject dialog */}
      <Dialog
        open={open === "reject"}
        onOpenChange={(o) => (!o ? reset() : null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject Revenue Entry</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label className="text-sm font-medium text-destructive">
                Rejection Reason (Required)
              </label>
              <Textarea
                placeholder="Explain why this is being rejected so the student can fix it..."
                value={adminNotes}
                onChange={(e) => setAdminNotes(e.target.value)}
                required
              />
              <RejectReasonSuggestions
                onPick={(text) =>
                  setAdminNotes((prev) => appendReason(prev, text))
                }
              />
            </div>
            <div className="flex justify-end pt-4">
              <Button
                className="bg-red-400 hover:bg-red-500 text-white"
                onClick={onReject}
                disabled={isPending || !adminNotes.trim()}
                data-testid={`button-confirm-reject-${item.id}`}
              >
                {isPending && <Spinner className="w-4 h-4 mr-2" />} Reject Entry
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function UnverifyAction({ item }: { item: QueueItem }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const unverify = useUnverifyRevenueEntry();
  const [open, setOpen] = useState(false);

  const onConfirm = () => {
    unverify.mutate(
      { id: item.id },
      {
        onSuccess: () => {
          toast({
            title: "Entry unverified",
            description:
              "The entry was moved back to the pending review queue.",
          });
          queryClient.invalidateQueries({
            queryKey: getGetAdminReviewQueueQueryKey({
              type: "revenue",
              status: "submitted",
            }),
          });
          queryClient.invalidateQueries({
            queryKey: getGetAdminReviewQueueQueryKey({
              type: "revenue",
              status: "verified",
            }),
          });
          setOpen(false);
        },
        onError: (err: unknown) => {
          const message =
            err instanceof Error ? err.message : "Failed to unverify entry";
          toast({
            title: "Unverify failed",
            description: message,
            variant: "destructive",
          });
        },
      },
    );
  };

  return (
    <>
      <Button
        size="sm"
        variant="outline"
        onClick={() => setOpen(true)}
        data-testid={`button-unverify-${item.id}`}
      >
        <RotateCcw className="w-4 h-4 mr-1" /> Unverify
      </Button>
      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Move entry back to review?</AlertDialogTitle>
            <AlertDialogDescription>
              This will clear the verified amount and admin notes, move the
              entry back to <strong>Pending review</strong>, and notify the team
              leader. You can re-verify or reject it from the pending tab.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={unverify.isPending}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={onConfirm}
              disabled={unverify.isPending}
              data-testid={`button-confirm-unverify-${item.id}`}
            >
              {unverify.isPending && <Spinner className="w-4 h-4 mr-2" />}
              Unverify
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function ReopenAction({ item }: { item: QueueItem }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const unverify = useUnverifyRevenueEntry();
  const [open, setOpen] = useState(false);

  const onConfirm = () => {
    unverify.mutate(
      { id: item.id },
      {
        onSuccess: () => {
          toast({
            title: "Entry re-opened",
            description:
              "The entry was moved back to the pending review queue.",
          });
          queryClient.invalidateQueries({
            queryKey: getGetAdminReviewQueueQueryKey({
              type: "revenue",
              status: "submitted",
            }),
          });
          queryClient.invalidateQueries({
            queryKey: getGetAdminReviewQueueQueryKey({
              type: "revenue",
              status: "rejected" as "submitted" | "verified",
            }),
          });
          setOpen(false);
        },
        onError: (err: unknown) => {
          const message =
            err instanceof Error ? err.message : "Failed to re-open entry";
          toast({
            title: "Re-open failed",
            description: message,
            variant: "destructive",
          });
        },
      },
    );
  };

  return (
    <>
      <Button
        size="sm"
        variant="outline"
        onClick={() => setOpen(true)}
        data-testid={`button-reopen-${item.id}`}
      >
        <RotateCcw className="w-4 h-4 mr-1" /> Re-open
      </Button>
      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Re-open this entry for review?</AlertDialogTitle>
            <AlertDialogDescription>
              This will move the entry back to <strong>Pending review</strong>{" "}
              so you can verify or reject it again. The team leader will be
              notified.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={unverify.isPending}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={onConfirm}
              disabled={unverify.isPending}
              data-testid={`button-confirm-reopen-${item.id}`}
            >
              {unverify.isPending && <Spinner className="w-4 h-4 mr-2" />}
              Re-open
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

// ─── AI BRD Auditor card ───────────────────────────────────────────────────
// Shows the Gemini-generated relevancy + uniqueness scores for the BRD on a
// revenue entry. Click "Details" to see findings + per-previous-BRD comparison.
// "Re-analyse" runs the auditor immediately (bypasses the 5-minute setTimeout).

function scoreColor(score: number | null | undefined): string {
  if (score == null) return "bg-muted text-muted-foreground";
  if (score >= 75) return "bg-emerald-100 text-emerald-800 border-emerald-200";
  if (score >= 40) return "bg-amber-100 text-amber-800 border-amber-200";
  return "bg-red-100 text-red-800 border-red-200";
}

function AiBrdAuditCard({ item }: { item: QueueItem }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const reanalyse = useReanalyseRevenueEntry();

  const detail = item.aiAnalysisDetail ?? null;
  const analysed = item.aiAnalysedAt != null;

  const onReanalyse = () => {
    reanalyse.mutate(
      { id: item.id },
      {
        onSuccess: () => {
          toast({ title: "AI re-analysis complete" });
          queryClient.invalidateQueries({
            queryKey: getGetAdminReviewQueueQueryKey({
              type: "revenue",
              status: "submitted",
            }),
          });
          queryClient.invalidateQueries({
            queryKey: getGetAdminReviewQueueQueryKey({
              type: "revenue",
              status: "verified",
            }),
          });
          queryClient.invalidateQueries({
            queryKey: getGetAdminReviewQueueQueryKey({
              type: "revenue",
              status: "rejected" as "submitted" | "verified",
            }),
          });
        },
        onError: (err: unknown) => {
          toast({
            title: "Re-analysis failed",
            description: err instanceof Error ? err.message : "Unknown error",
            variant: "destructive",
          });
        },
      },
    );
  };

  return (
    <div className="rounded-md border border-border/60 bg-muted/30 p-2 flex flex-wrap items-center gap-2 text-xs">
      <div className="flex items-center gap-1 font-medium text-muted-foreground">
        <Bot className="w-3.5 h-3.5" />
        AI BRD audit
      </div>

      {!analysed ? (
        <Badge variant="outline" className="h-5 gap-1">
          <Hourglass className="w-3 h-3" /> Pending (runs ~5 min after submit)
        </Badge>
      ) : (
        <>
          <Badge
            variant="outline"
            className={`h-5 ${scoreColor(item.brdScore)}`}
            data-testid={`badge-brd-score-${item.id}`}
          >
            Relevancy: {item.brdScore ?? "?"}/100
          </Badge>
          <Badge
            variant="outline"
            className={`h-5 ${scoreColor(item.uniquenessScore)}`}
            data-testid={`badge-uniqueness-score-${item.id}`}
          >
            Uniqueness: {item.uniquenessScore ?? "?"}/100
          </Badge>
        </>
      )}

      {analysed && detail ? (
        <Link href={`/admin/queue/detailed-analysis?entryId=${item.id}`}>
          <Button
            size="sm"
            variant="ghost"
            className="h-6 px-2 text-xs"
            data-testid={`button-ai-details-${item.id}`}
          >
            Details
          </Button>
        </Link>
      ) : null}

      <Button
        size="sm"
        variant="ghost"
        className="h-6 px-2 text-xs ml-auto"
        onClick={onReanalyse}
        disabled={reanalyse.isPending}
        data-testid={`button-reanalyse-${item.id}`}
      >
        {reanalyse.isPending ? (
          <Loader2 className="w-3 h-3 mr-1 animate-spin" />
        ) : (
          <RotateCcw className="w-3 h-3 mr-1" />
        )}
        {analysed ? "Re-analyse" : "Analyse now"}
      </Button>
    </div>
  );
}

function AiAnalysisDetails({ detail }: { detail: BrdAiAnalysis }) {
  return (
    <div className="space-y-3">
      <div>
        <div className="font-semibold mb-1">BRD relevancy findings</div>
        <ul className="space-y-0.5">
          {(detail.brd_findings ?? []).map((f, i) => (
            <li key={i} className="leading-relaxed">
              {f}
            </li>
          ))}
          {(detail.brd_findings ?? []).length === 0 ? (
            <li className="text-muted-foreground italic">No findings.</li>
          ) : null}
        </ul>
        {detail.brd_pdf_summary ? (
          <div className="mt-1 text-muted-foreground">
            Pages: {detail.brd_pdf_summary.total_pages ?? "?"} · Images:{" "}
            {detail.brd_pdf_summary.images_detected ?? "?"} · Amount match:{" "}
            <span className="font-medium">
              {detail.brd_pdf_summary.amount_match ?? "?"}
            </span>
          </div>
        ) : null}
      </div>

      <div>
        <div className="font-semibold mb-1">Uniqueness</div>
        {detail.uniqueness_summary ? (
          <div className="mb-1 italic text-muted-foreground">
            {detail.uniqueness_summary}
          </div>
        ) : null}
        <ul className="space-y-0.5">
          {(detail.uniqueness_findings ?? []).map((f, i) => (
            <li key={i} className="leading-relaxed">
              {f}
            </li>
          ))}
        </ul>
        {(detail.uniqueness_comparison ?? []).length > 0 ? (
          <div className="mt-2 space-y-1">
            <div className="font-medium text-muted-foreground">
              Compared against:
            </div>
            {(detail.uniqueness_comparison ?? []).map((c, i) => (
              <div
                key={i}
                className="rounded border border-border/50 p-1.5 bg-background/60"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate">{c.entry_label ?? "—"}</span>
                  <Badge
                    variant="outline"
                    className={`h-4 text-[10px] ${
                      c.flag === "duplicate"
                        ? "bg-red-100 text-red-800 border-red-200"
                        : c.flag === "suspicious"
                          ? "bg-amber-100 text-amber-800 border-amber-200"
                          : "bg-emerald-100 text-emerald-800 border-emerald-200"
                    }`}
                  >
                    {c.flag ?? "?"} · {c.similarity_percent ?? 0}%
                  </Badge>
                </div>
                {c.reason ? (
                  <div className="mt-0.5 text-muted-foreground">{c.reason}</div>
                ) : null}
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}
