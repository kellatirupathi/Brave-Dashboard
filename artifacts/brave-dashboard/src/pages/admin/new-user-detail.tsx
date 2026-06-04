// Admin: detail view for a single New User access request. Shows all submitted
// fields and lets the admin Approve (provision roster + user) or Reject
// (re-freeze access). Reachable from the New Users list.
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link, useParams, useLocation } from "wouter";
import {
  getAdminAccessRequest,
  approveAccessRequest,
  rejectAccessRequest,
  type AccessRequest,
} from "@/lib/access-api";
import { normalizeError } from "@/lib/api-error";
import { formatDateTime } from "@/lib/format";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
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
import { ArrowLeft, Check, X } from "lucide-react";

function StatusBadge({ status }: { status: AccessRequest["status"] }) {
  if (status === "approved")
    return (
      <Badge className="bg-green-500/15 text-green-600 dark:text-green-400 border-green-500/20">
        Approved
      </Badge>
    );
  if (status === "rejected")
    return (
      <Badge className="bg-destructive/15 text-destructive border-destructive/20">
        Rejected
      </Badge>
    );
  return (
    <Badge className="bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/20">
      Pending
    </Badge>
  );
}

function Field({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="space-y-1">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className="text-sm font-medium">{value && value.trim() ? value : "—"}</p>
    </div>
  );
}

export default function AdminNewUserDetail() {
  const params = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const id = Number(params.id);

  const [confirm, setConfirm] = useState<null | "approve" | "reject">(null);

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["admin-access-request", id],
    queryFn: () => getAdminAccessRequest(id),
    enabled: Number.isInteger(id),
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["admin-access-request", id] });
    queryClient.invalidateQueries({ queryKey: ["admin-access-requests"] });
  };

  const approve = useMutation({
    mutationFn: () => approveAccessRequest(id),
    onSuccess: () => {
      invalidate();
      toast({ title: "Access approved" });
    },
    onError: (err) =>
      toast({
        variant: "destructive",
        title: "Approve failed",
        description: normalizeError(err).message,
      }),
    onSettled: () => setConfirm(null),
  });

  const reject = useMutation({
    mutationFn: () => rejectAccessRequest(id),
    onSuccess: () => {
      invalidate();
      toast({ title: "Request rejected" });
    },
    onError: (err) =>
      toast({
        variant: "destructive",
        title: "Reject failed",
        description: normalizeError(err).message,
      }),
    onSettled: () => setConfirm(null),
  });

  const busy = approve.isPending || reject.isPending;

  return (
    <div className="space-y-6 max-w-2xl">
      <button
        onClick={() => setLocation("/admin/new-users-requests")}
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="w-4 h-4" /> Back to New Users
      </button>

      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <Spinner className="size-8" />
        </div>
      ) : isError || !data ? (
        <Card className="py-16 text-center text-destructive">
          {isError ? normalizeError(error).message : "Request not found."}
          <div className="mt-4">
            <Link href="/admin/new-users-requests">
              <Button variant="outline">Back to list</Button>
            </Link>
          </div>
        </Card>
      ) : (
        <>
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold tracking-tight">
                {data.fullName}
              </h1>
              <p className="text-sm text-muted-foreground">{data.email}</p>
            </div>
            <StatusBadge status={data.status} />
          </div>

          <Card className="p-6 grid grid-cols-1 sm:grid-cols-2 gap-5">
            <Field label="NIAT ID" value={data.niatId} />
            <Field label="Campus" value={data.campusName} />
            <Field label="Mobile Number" value={data.mobileNumber} />
            <Field label="Section" value={data.sectionName} />
            <Field label="Submitted" value={formatDateTime(data.createdAt)} />
            <Field
              label="Decided"
              value={data.decidedAt ? formatDateTime(data.decidedAt) : null}
            />
          </Card>

          {data.status === "pending" ? (
            <div className="flex items-center gap-3">
              <Button
                onClick={() => setConfirm("approve")}
                disabled={busy}
                className="gap-2"
              >
                <Check className="w-4 h-4" /> Approve
              </Button>
              <Button
                variant="destructive"
                onClick={() => setConfirm("reject")}
                disabled={busy}
                className="gap-2"
              >
                <X className="w-4 h-4" /> Reject
              </Button>
            </div>
          ) : (
            <div className="flex items-center gap-3">
              <p className="text-sm text-muted-foreground">
                This request has been {data.status}. You can change the decision
                below.
              </p>
              {data.status === "rejected" ? (
                <Button
                  onClick={() => setConfirm("approve")}
                  disabled={busy}
                  size="sm"
                  className="gap-2"
                >
                  <Check className="w-4 h-4" /> Approve instead
                </Button>
              ) : (
                <Button
                  variant="destructive"
                  onClick={() => setConfirm("reject")}
                  disabled={busy}
                  size="sm"
                  className="gap-2"
                >
                  <X className="w-4 h-4" /> Revoke access
                </Button>
              )}
            </div>
          )}
        </>
      )}

      <AlertDialog
        open={confirm !== null}
        onOpenChange={(open) => !open && setConfirm(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirm === "approve" ? "Approve access?" : "Reject access?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirm === "approve"
                ? "This adds the user to the roster and grants them access to the student dashboard."
                : "This rejects the request. If the user was previously approved, their access will be revoked."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                if (confirm === "approve") approve.mutate();
                else reject.mutate();
              }}
              disabled={busy}
            >
              {busy && <Spinner className="w-4 h-4 mr-2" />}
              {confirm === "approve" ? "Approve" : "Reject"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
