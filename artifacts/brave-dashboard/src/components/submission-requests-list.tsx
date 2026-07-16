// Shared admin view of "Request to submit" requests. Shows team name, leader
// name, requested date/time and the purpose text, with Enable / Reject actions.
// Enabling turns on that team's submission exemption (and resolves the
// request); rejecting stores a reason, emails the team, and the row then shows
// "Rejected" with that reason instead of the action buttons. Used on the Config
// "Teams Submissions" page and Communications → Submission Requests.
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Spinner } from "@/components/ui/spinner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Check, Inbox, X, XCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { formatDateTime } from "@/lib/format";
import {
  listSubmissionRequests,
  rejectSubmissionRequest,
  setTeamExemptions,
  type SubmissionRequest,
} from "@/lib/team-submissions-api";

export const SUBMISSION_REQUESTS_KEY = ["admin-submission-requests"];

export function SubmissionRequestsList() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: SUBMISSION_REQUESTS_KEY,
    queryFn: listSubmissionRequests,
  });
  const items: SubmissionRequest[] = data?.items ?? [];

  // The request whose reject-reason modal is open.
  const [rejecting, setRejecting] = useState<SubmissionRequest | null>(null);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: SUBMISSION_REQUESTS_KEY });
    queryClient.invalidateQueries({ queryKey: ["admin-team-exemptions"] });
  };

  const enable = useMutation({
    mutationFn: (teamId: number) =>
      setTeamExemptions({ teamId, enabled: true }),
    onSuccess: () => {
      toast({ title: "Team enabled" });
      invalidate();
    },
    onError: (err: unknown) =>
      toast({
        title: "Could not enable team",
        description: err instanceof Error ? err.message : "Please try again.",
        variant: "destructive",
      }),
  });

  if (isLoading) {
    return (
      <div className="flex justify-center py-8">
        <Spinner />
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="rounded-md border border-dashed py-10 text-center text-sm text-muted-foreground">
        <Inbox className="mx-auto mb-3 h-8 w-8 opacity-40" />
        No pending requests.
      </div>
    );
  }

  return (
    <>
      {/* Horizontally scrollable so the wide Purpose column never squeezes the
          rest of the table. */}
      <div className="overflow-x-auto rounded-md border">
        <table className="w-full min-w-[1100px] text-sm">
          <thead className="bg-muted/50">
            <tr className="text-left">
              <th className="p-3 font-medium w-[140px]">Team</th>
              <th className="p-3 font-medium w-[140px]">Leader</th>
              <th className="p-3 font-medium w-[150px]">Campus</th>
              <th className="p-3 font-medium w-[170px] whitespace-nowrap">
                Requested
              </th>
              <th className="p-3 font-medium w-[420px]">Purpose</th>
              <th className="p-3 font-medium w-[190px] text-right">Action</th>
            </tr>
          </thead>
          <tbody>
            {items.map((r) => {
              const isRejected = r.status === "rejected";
              return (
                <tr
                  key={r.id}
                  className={`border-t align-top ${
                    isRejected
                      ? "bg-red-50/60 dark:bg-red-950/20"
                      : "hover:bg-muted/30"
                  }`}
                  data-testid={`submission-request-${r.id}`}
                >
                  <td className="p-3 font-medium">{r.teamName}</td>
                  <td className="p-3 text-muted-foreground">{r.leaderName}</td>
                  <td className="p-3 text-muted-foreground">
                    {r.campusName || "—"}
                  </td>
                  <td className="p-3 text-muted-foreground whitespace-nowrap">
                    {formatDateTime(r.createdAt)}
                  </td>
                  <td className="p-3 text-muted-foreground whitespace-pre-wrap">
                    {r.purpose || (
                      <span className="italic opacity-70">No detail given</span>
                    )}
                    {isRejected && r.decisionNote ? (
                      <div className="mt-2 rounded-md bg-red-100/70 p-2 text-xs text-red-900 dark:bg-red-950/40 dark:text-red-100">
                        <span className="font-semibold">Rejection reason:</span>{" "}
                        {r.decisionNote}
                      </div>
                    ) : null}
                  </td>
                  <td className="p-3 text-right">
                    {isRejected ? (
                      <span
                        className="inline-flex items-center gap-1 text-xs font-semibold text-destructive"
                        data-testid={`request-rejected-${r.id}`}
                      >
                        <XCircle className="h-3.5 w-3.5" /> Rejected
                      </span>
                    ) : r.exempted ? (
                      <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-600">
                        <Check className="h-3.5 w-3.5" /> Enabled
                      </span>
                    ) : (
                      <div className="flex justify-end gap-2">
                        <Button
                          size="sm"
                          disabled={enable.isPending}
                          onClick={() => enable.mutate(r.teamId)}
                          data-testid={`button-enable-request-${r.id}`}
                        >
                          {enable.isPending && enable.variables === r.teamId ? (
                            <Spinner className="mr-1 h-4 w-4" />
                          ) : (
                            <Check className="mr-1 h-4 w-4" />
                          )}
                          Enable
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-destructive hover:text-destructive border-destructive/40"
                          onClick={() => setRejecting(r)}
                          data-testid={`button-reject-request-${r.id}`}
                        >
                          <X className="mr-1 h-4 w-4" /> Reject
                        </Button>
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <RejectRequestModal
        request={rejecting}
        onClose={() => setRejecting(null)}
        onDone={invalidate}
      />
    </>
  );
}

// Reason modal for rejecting a request. Submitting stores the reason and emails
// the team.
function RejectRequestModal({
  request,
  onClose,
  onDone,
}: {
  request: SubmissionRequest | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const { toast } = useToast();
  const [reason, setReason] = useState("");

  const reject = useMutation({
    mutationFn: () => rejectSubmissionRequest(request!.id, reason.trim()),
    onSuccess: () => {
      toast({
        title: "Request rejected",
        description: "The team has been emailed the reason.",
      });
      setReason("");
      onClose();
      onDone();
    },
    onError: (err: unknown) =>
      toast({
        title: "Could not reject",
        description: err instanceof Error ? err.message : "Please try again.",
        variant: "destructive",
      }),
  });

  return (
    <Dialog
      open={request != null}
      onOpenChange={(o) => {
        if (!o && !reject.isPending) {
          setReason("");
          onClose();
        }
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Reject request — {request?.teamName}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Tell the team why you can't open submissions for them right now.
            This reason is emailed to the team leader and members.
          </p>
          <Textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={4}
            maxLength={1000}
            placeholder="e.g. Submissions are closed for the final review — please share the details with your success coach."
            data-testid="input-reject-reason"
          />
          <div className="flex justify-end">
            <Button
              size="sm"
              className="bg-destructive text-white hover:bg-destructive/90"
              onClick={() => reject.mutate()}
              disabled={reject.isPending || !reason.trim()}
              data-testid="button-submit-reject"
            >
              {reject.isPending ? (
                <Spinner className="mr-2 h-4 w-4" />
              ) : (
                <X className="mr-2 h-4 w-4" />
              )}
              Submit
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
