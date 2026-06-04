import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  listAdminMembershipRequests,
  approveMembershipRequest,
  rejectMembershipRequest,
  type MembershipRequest,
} from "@/lib/membership-api";
import { normalizeError } from "@/lib/api-error";
import { formatDateTime } from "@/lib/format";
import { MembershipHistoryPopover } from "@/components/membership-history-popover";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
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
import {
  UserCheck,
  Check,
  X,
  ArrowRight,
  LogOut,
  ListChecks,
} from "lucide-react";

const PENDING_KEY = ["admin", "membership-requests", "pending"] as const;
const HISTORY_KEY = ["admin", "membership-requests", "history"] as const;

function TypeBadge({ type }: { type: MembershipRequest["type"] }) {
  const isRemoval = type === "leave" || type === "leader_remove";
  return (
    <Badge variant={isRemoval ? "destructive" : "secondary"} className="gap-1">
      {isRemoval ? (
        <LogOut className="h-3 w-3" />
      ) : (
        <ArrowRight className="h-3 w-3" />
      )}
      {type === "join_by_code"
        ? "Join by code"
        : type === "invite_accept"
          ? "Accept invite"
          : type === "join_request_approve"
            ? "Join request"
            : type === "leave"
              ? "Leave team"
              : "Remove member"}
    </Badge>
  );
}

function StatusBadge({ status }: { status: MembershipRequest["status"] }) {
  if (status === "approved")
    return (
      <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100">
        Approved
      </Badge>
    );
  if (status === "rejected")
    return <Badge variant="destructive">Rejected</Badge>;
  return <Badge variant="outline">Pending</Badge>;
}

function RequestSummary({ mr }: { mr: MembershipRequest }) {
  const isRemoval = mr.type === "leave" || mr.type === "leader_remove";
  return (
    <div className="space-y-1">
      <div className="flex flex-wrap items-center gap-2">
        <TypeBadge type={mr.type} />
        <span className="font-medium">{mr.targetName}</span>
        <span className="text-muted-foreground">
          {isRemoval ? "leaving" : "joining"}
        </span>
        <span className="font-medium">{mr.teamName}</span>
      </div>
      <div className="text-sm text-muted-foreground">
        {mr.campusName ? <span>{mr.campusName} · </span> : null}
        <span>{mr.targetEmail}</span>
        {mr.actorUserId !== mr.targetUserId ? (
          <span> · requested by {mr.actorName}</span>
        ) : null}
      </div>
      {mr.reason ? (
        <div className="text-sm">
          <span className="text-muted-foreground">Reason: </span>
          {mr.reason}
        </div>
      ) : null}
    </div>
  );
}

export default function AdminTeamRequests() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<"pending" | "history">("pending");
  const [rejectTarget, setRejectTarget] = useState<MembershipRequest | null>(
    null,
  );
  const [rejectNote, setRejectNote] = useState("");

  // Bulk selection (Pending tab only).
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [bulkReject, setBulkReject] = useState(false);
  const [bulkBusy, setBulkBusy] = useState(false);

  const pendingQuery = useQuery({
    queryKey: PENDING_KEY,
    queryFn: () => listAdminMembershipRequests("pending"),
  });
  const historyQuery = useQuery({
    queryKey: HISTORY_KEY,
    queryFn: () => listAdminMembershipRequests("history"),
  });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: PENDING_KEY });
    void queryClient.invalidateQueries({ queryKey: HISTORY_KEY });
  };

  const pending = pendingQuery.data ?? [];
  const history = historyQuery.data ?? [];

  const clearSelection = () => setSelectedIds(new Set());
  const exitSelectMode = () => {
    setSelectMode(false);
    clearSelection();
  };
  const toggleSelected = (id: number) =>
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const allSelected = pending.length > 0 && selectedIds.size === pending.length;
  const toggleSelectAll = () =>
    setSelectedIds((prev) =>
      prev.size === pending.length
        ? new Set()
        : new Set(pending.map((m) => m.id)),
    );

  const approveMutation = useMutation({
    mutationFn: (id: number) => approveMembershipRequest(id),
    onSuccess: () => {
      toast({
        title: "Request approved",
        description: "The change has been applied.",
      });
      invalidate();
    },
    onError: (err) => {
      toast({
        variant: "destructive",
        title: "Could not approve",
        description: normalizeError(err).message,
      });
    },
  });

  const rejectMutation = useMutation({
    mutationFn: ({ id, note }: { id: number; note: string }) =>
      rejectMembershipRequest(id, note),
    onSuccess: () => {
      toast({ title: "Request rejected" });
      setRejectTarget(null);
      setRejectNote("");
      invalidate();
    },
    onError: (err) => {
      toast({
        variant: "destructive",
        title: "Could not reject",
        description: normalizeError(err).message,
      });
    },
  });

  const busy =
    approveMutation.isPending || rejectMutation.isPending || bulkBusy;

  async function runBulk(action: "approve" | "reject", note: string) {
    if (bulkBusy) return;
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    setBulkBusy(true);
    let ok = 0;
    const failures: string[] = [];
    const failedIds: number[] = [];
    for (const id of ids) {
      try {
        if (action === "approve") await approveMembershipRequest(id);
        else await rejectMembershipRequest(id, note);
        ok += 1;
      } catch (err) {
        failures.push(normalizeError(err).message);
        failedIds.push(id);
      }
    }
    setBulkBusy(false);
    setBulkReject(false);
    setRejectNote("");
    invalidate();
    const verb = action === "approve" ? "approved" : "rejected";
    if (failures.length === 0) {
      toast({
        title: `${ok} request${ok === 1 ? "" : "s"} ${verb}`,
      });
      exitSelectMode();
    } else {
      toast({
        variant: "destructive",
        title: `${ok} ${verb}, ${failures.length} failed`,
        description: failures[0],
      });
      // Keep only the failed requests selected so the admin can retry them.
      setSelectedIds(new Set(failedIds));
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="rounded-lg bg-primary/10 p-2">
          <UserCheck className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Team Requests
          </h1>
          <p className="text-sm text-muted-foreground">
            Approve or reject team membership changes from students and team
            leaders.
          </p>
        </div>
      </div>

      <Tabs
        value={tab}
        onValueChange={(v) => {
          setTab(v as "pending" | "history");
          if (v !== "pending") exitSelectMode();
        }}
      >
        <div className="flex items-center justify-between gap-3">
          <TabsList>
            <TabsTrigger value="pending">
              Pending
              {pending.length > 0 ? (
                <Badge variant="secondary" className="ml-2">
                  {pending.length}
                </Badge>
              ) : null}
            </TabsTrigger>
            <TabsTrigger value="history">History</TabsTrigger>
          </TabsList>

          {tab === "pending" && pending.length > 0 ? (
            selectMode ? (
              <Button variant="ghost" size="sm" onClick={exitSelectMode}>
                Cancel
              </Button>
            ) : (
              <Button
                variant="outline"
                size="sm"
                className="gap-1"
                onClick={() => setSelectMode(true)}
              >
                <ListChecks className="h-4 w-4" />
                Select
              </Button>
            )
          ) : null}
        </div>

        <TabsContent value="pending" className="mt-4">
          {pendingQuery.isLoading ? (
            <div className="flex justify-center py-12">
              <Spinner />
            </div>
          ) : pending.length === 0 ? (
            <Card className="p-10 text-center text-muted-foreground">
              No pending requests. You're all caught up.
            </Card>
          ) : (
            <div className="space-y-3">
              {selectMode ? (
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-muted/40 px-4 py-2">
                  <label className="flex items-center gap-2 text-sm font-medium">
                    <Checkbox
                      checked={allSelected}
                      onCheckedChange={toggleSelectAll}
                    />
                    {selectedIds.size > 0
                      ? `${selectedIds.size} selected`
                      : "Select all"}
                  </label>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      disabled={selectedIds.size === 0 || busy}
                      onClick={() => void runBulk("approve", "")}
                    >
                      <Check className="mr-1 h-4 w-4" />
                      Approve selected
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={selectedIds.size === 0 || busy}
                      onClick={() => {
                        setRejectNote("");
                        setBulkReject(true);
                      }}
                    >
                      <X className="mr-1 h-4 w-4" />
                      Reject selected
                    </Button>
                  </div>
                </div>
              ) : null}

              {pending.map((mr) => {
                // Scope the loading/disabled state to THIS row only. Using the
                // mutation's own `variables` means a click on one card never
                // touches the buttons on the others — only the acted-on button
                // shows a spinner and goes disabled.
                const isApproving =
                  approveMutation.isPending &&
                  approveMutation.variables === mr.id;
                const isRejecting =
                  rejectMutation.isPending &&
                  rejectMutation.variables?.id === mr.id;
                const rowBusy = isApproving || isRejecting;
                return (
                  <Card
                    key={mr.id}
                    className="flex flex-col gap-4 p-4 md:flex-row md:items-center md:justify-between"
                  >
                    <div className="flex flex-1 items-start gap-3">
                      {selectMode ? (
                        <Checkbox
                          className="mt-1"
                          checked={selectedIds.has(mr.id)}
                          onCheckedChange={() => toggleSelected(mr.id)}
                          aria-label={`Select request for ${mr.targetName}`}
                        />
                      ) : null}
                      <div className="flex-1">
                        <RequestSummary mr={mr} />
                        <div className="mt-1 text-xs text-muted-foreground">
                          Submitted {formatDateTime(mr.createdAt)}
                        </div>
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <MembershipHistoryPopover
                        userId={mr.targetUserId}
                        name={mr.targetName}
                      />
                      <Button
                        size="sm"
                        onClick={() => approveMutation.mutate(mr.id)}
                        disabled={rowBusy || bulkBusy}
                      >
                        {isApproving ? (
                          <Spinner className="mr-1" />
                        ) : (
                          <Check className="mr-1 h-4 w-4" />
                        )}
                        Approve
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setRejectTarget(mr);
                          setRejectNote("");
                        }}
                        disabled={rowBusy || bulkBusy}
                      >
                        {isRejecting ? (
                          <Spinner className="mr-1" />
                        ) : (
                          <X className="mr-1 h-4 w-4" />
                        )}
                        Reject
                      </Button>
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>

        <TabsContent value="history" className="mt-4">
          {historyQuery.isLoading ? (
            <div className="flex justify-center py-12">
              <Spinner />
            </div>
          ) : history.length === 0 ? (
            <Card className="p-10 text-center text-muted-foreground">
              No decisions yet.
            </Card>
          ) : (
            <div className="space-y-3">
              {history.map((mr) => (
                <Card key={mr.id} className="space-y-2 p-4">
                  <div className="flex items-start justify-between gap-4">
                    <RequestSummary mr={mr} />
                    <div className="flex shrink-0 items-center gap-2">
                      <MembershipHistoryPopover
                        userId={mr.targetUserId}
                        name={mr.targetName}
                      />
                      <StatusBadge status={mr.status} />
                    </div>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {mr.status === "approved" ? "Approved" : "Rejected"}
                    {mr.decidedByName ? ` by ${mr.decidedByName}` : ""}
                    {mr.decidedAt ? ` · ${formatDateTime(mr.decidedAt)}` : ""}
                  </div>
                  {mr.decisionNote ? (
                    <div className="rounded-md bg-muted px-3 py-2 text-sm">
                      <span className="text-muted-foreground">Note: </span>
                      {mr.decisionNote}
                    </div>
                  ) : null}
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Single reject dialog */}
      <AlertDialog
        open={rejectTarget !== null}
        onOpenChange={(open) => {
          if (!open) {
            setRejectTarget(null);
            setRejectNote("");
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reject this request?</AlertDialogTitle>
            <AlertDialogDescription>
              No membership change will be made. The requester will be notified.
              You can add an optional note explaining the decision.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Textarea
            placeholder="Optional note to the requester…"
            value={rejectNote}
            onChange={(e) => setRejectNote(e.target.value)}
            maxLength={1000}
          />
          <AlertDialogFooter>
            <AlertDialogCancel disabled={rejectMutation.isPending}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                if (rejectTarget) {
                  rejectMutation.mutate({
                    id: rejectTarget.id,
                    note: rejectNote,
                  });
                }
              }}
              disabled={rejectMutation.isPending}
            >
              Reject request
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Bulk reject dialog */}
      <AlertDialog
        open={bulkReject}
        onOpenChange={(open) => {
          if (!open) {
            setBulkReject(false);
            setRejectNote("");
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Reject {selectedIds.size} selected request
              {selectedIds.size === 1 ? "" : "s"}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              No membership changes will be made. Each requester will be
              notified. The optional note below is sent with every rejection.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Textarea
            placeholder="Optional note to the requesters…"
            value={rejectNote}
            onChange={(e) => setRejectNote(e.target.value)}
            maxLength={1000}
          />
          <AlertDialogFooter>
            <AlertDialogCancel disabled={bulkBusy}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                void runBulk("reject", rejectNote);
              }}
              disabled={bulkBusy}
            >
              Reject {selectedIds.size} request
              {selectedIds.size === 1 ? "" : "s"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
