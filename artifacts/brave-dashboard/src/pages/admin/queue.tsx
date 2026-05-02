import {
  useGetAdminReviewQueue,
  useVerifyRevenueEntry,
  useRejectRevenueEntry,
  useUnverifyRevenueEntry,
  getGetAdminReviewQueueQueryKey,
} from "@workspace/api-client-react";
import { formatINR, formatDateTime } from "@/lib/format";
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
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  AlertCircle,
  Check,
  X,
  Sparkles,
  Search,
  RotateCcw,
  CheckCircle2,
} from "lucide-react";
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
  status: "submitted" | "verified";
  verifiedAmount?: number | null;
  verifiedAt?: string | Date | null;
  adminNotes?: string | null;
};

type Tab = "pending" | "approved";

export default function AdminQueue() {
  const [tab, setTab] = useState<Tab>("pending");
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");

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
        <div className="relative w-full md:w-80">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search by team, project, client, amount…"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="pl-9"
            data-testid="input-search-queue"
          />
        </div>
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)}>
        <TabsList>
          <TabsTrigger value="pending" data-testid="tab-pending">
            Pending review
          </TabsTrigger>
          <TabsTrigger value="approved" data-testid="tab-approved">
            Approved
          </TabsTrigger>
        </TabsList>

        <TabsContent value="pending" className="mt-6">
          <QueueList status="submitted" search={search} />
        </TabsContent>

        <TabsContent value="approved" className="mt-6">
          <QueueList status="verified" search={search} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function QueueList({
  status,
  search,
}: {
  status: "submitted" | "verified";
  search: string;
}) {
  const type = "revenue" as const;
  const { data: queue, isLoading } = useGetAdminReviewQueue({
    type,
    status,
    search: search || undefined,
  });

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

  return (
    <div className="space-y-3">
      <div className="text-sm text-muted-foreground">
        <span className="mr-2">{totalCount} total</span>
        {status === "submitted" && overdueCount > 0 ? (
          <span className="text-destructive font-medium">
            · {overdueCount} overdue
          </span>
        ) : null}
      </div>

      {items.length === 0 ? (
        <EmptyState status={status} />
      ) : (
        <div className="flex flex-col gap-3">
          {items.map((item) => (
            <QueueRow key={item.id} item={item} status={status} />
          ))}
        </div>
      )}
    </div>
  );
}

function EmptyState({ status }: { status: "submitted" | "verified" }) {
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
}: {
  item: QueueItem;
  status: "submitted" | "verified";
}) {
  return (
    <Card
      className={`group relative transition-shadow hover:shadow-md hover:border-primary/40 ${
        item.isOverdue ? "border-destructive/50 shadow-sm" : ""
      }`}
      data-testid={`row-queue-${item.id}`}
    >
      <Link
        href={`/admin/teams/${item.teamId}`}
        className="absolute inset-0 z-10 rounded-lg cursor-pointer focus:outline-none"
        aria-label={`Open ${item.teamName} team details`}
        data-testid={`link-queue-card-${item.id}`}
      />
      <div className="p-4 flex flex-col lg:flex-row lg:items-center gap-4">
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

          {status === "submitted" ? (
            <PendingActions item={item} />
          ) : (
            <UnverifyAction item={item} />
          )}
        </div>
      </div>
    </Card>
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
