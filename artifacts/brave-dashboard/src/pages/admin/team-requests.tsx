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
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import { UserCheck, Check, X, ArrowRight, LogOut } from "lucide-react";

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
  const [rejectTarget, setRejectTarget] = useState<MembershipRequest | null>(
    null,
  );
  const [rejectNote, setRejectNote] = useState("");

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

  const approveMutation = useMutation({
    mutationFn: (id: number) => approveMembershipRequest(id),
    onSuccess: () => {
      toast({ title: "Request approved", description: "The change has been applied." });
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

  const pending = pendingQuery.data ?? [];
  const history = historyQuery.data ?? [];

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

      <Tabs defaultValue="pending">
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
              {pending.map((mr) => (
                <Card
                  key={mr.id}
                  className="flex flex-col gap-4 p-4 md:flex-row md:items-center md:justify-between"
                >
                  <div className="flex-1">
                    <RequestSummary mr={mr} />
                    <div className="mt-1 text-xs text-muted-foreground">
                      Submitted {formatDateTime(mr.createdAt)}
                    </div>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <Button
                      size="sm"
                      onClick={() => approveMutation.mutate(mr.id)}
                      disabled={
                        approveMutation.isPending || rejectMutation.isPending
                      }
                    >
                      <Check className="mr-1 h-4 w-4" />
                      Approve
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setRejectTarget(mr);
                        setRejectNote("");
                      }}
                      disabled={
                        approveMutation.isPending || rejectMutation.isPending
                      }
                    >
                      <X className="mr-1 h-4 w-4" />
                      Reject
                    </Button>
                  </div>
                </Card>
              ))}
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
                    <StatusBadge status={mr.status} />
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
    </div>
  );
}
