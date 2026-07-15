// Admin Config card: Revenue rejection reasons catalog (add / edit / delete).
// The review-queue reject dialogs show these as tap-to-insert chips. Seeded
// with the two previously hardcoded reasons; fully admin-managed after that.
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Spinner } from "@/components/ui/spinner";
import { XCircle, Plus, Pencil, Trash2, Check, X } from "lucide-react";
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
  listRejectionReasons,
  createRejectionReason,
  updateRejectionReason,
  deleteRejectionReason,
  type RejectionReason,
} from "@/lib/rejection-reasons-api";

export const REJECTION_REASONS_QUERY_KEY = ["admin-rejection-reasons"];

export function RejectionReasonsCard() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: REJECTION_REASONS_QUERY_KEY,
    queryFn: listRejectionReasons,
  });
  const reasons: RejectionReason[] = data?.items ?? [];

  const [newLabel, setNewLabel] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editLabel, setEditLabel] = useState("");
  const [deleting, setDeleting] = useState<RejectionReason | null>(null);

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: REJECTION_REASONS_QUERY_KEY });

  const onError = (err: unknown) =>
    toast({
      title: "Could not save",
      description: err instanceof Error ? err.message : "Please try again.",
      variant: "destructive",
    });

  const create = useMutation({
    mutationFn: (label: string) => createRejectionReason(label),
    onSuccess: () => {
      toast({ title: "Reason added" });
      setNewLabel("");
      invalidate();
    },
    onError,
  });

  const update = useMutation({
    mutationFn: ({ id, label }: { id: number; label: string }) =>
      updateRejectionReason(id, label),
    onSuccess: () => {
      toast({ title: "Reason updated" });
      setEditingId(null);
      setEditLabel("");
      invalidate();
    },
    onError,
  });

  const remove = useMutation({
    mutationFn: (id: number) => deleteRejectionReason(id),
    onSuccess: () => {
      toast({ title: "Reason deleted" });
      setDeleting(null);
      invalidate();
    },
    onError,
  });

  return (
    <Card data-testid="card-rejection-reasons">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <XCircle className="w-5 h-5 text-primary" /> Revenue Rejection Reasons
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Common reasons shown as tap-to-insert chips in the review queue's
          reject dialogs. Add, edit or delete them here.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading ? (
          <div className="flex justify-center py-6">
            <Spinner />
          </div>
        ) : reasons.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No reasons yet — add one below.
          </p>
        ) : (
          <ul className="space-y-2">
            {reasons.map((r) => (
              <li
                key={r.id}
                className="rounded-md border p-3"
                data-testid={`rejection-reason-${r.id}`}
              >
                {editingId === r.id ? (
                  <div className="space-y-2">
                    <Textarea
                      value={editLabel}
                      onChange={(e) => setEditLabel(e.target.value)}
                      rows={2}
                      maxLength={500}
                      data-testid={`input-edit-reason-${r.id}`}
                    />
                    <div className="flex justify-end gap-2">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          setEditingId(null);
                          setEditLabel("");
                        }}
                        disabled={update.isPending}
                      >
                        <X className="w-4 h-4 mr-1" /> Cancel
                      </Button>
                      <Button
                        size="sm"
                        onClick={() =>
                          update.mutate({ id: r.id, label: editLabel.trim() })
                        }
                        disabled={
                          update.isPending || editLabel.trim().length < 3
                        }
                        data-testid={`button-save-reason-${r.id}`}
                      >
                        {update.isPending ? (
                          <Spinner className="w-4 h-4 mr-1" />
                        ) : (
                          <Check className="w-4 h-4 mr-1" />
                        )}
                        Save
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-start justify-between gap-3">
                    <p className="text-sm leading-relaxed">{r.label}</p>
                    <div className="flex shrink-0 gap-1">
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7"
                        onClick={() => {
                          setEditingId(r.id);
                          setEditLabel(r.label);
                        }}
                        aria-label="Edit reason"
                        data-testid={`button-edit-reason-${r.id}`}
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7 text-destructive hover:text-destructive"
                        onClick={() => setDeleting(r)}
                        aria-label="Delete reason"
                        data-testid={`button-delete-reason-${r.id}`}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}

        <div className="space-y-2 border-t pt-4">
          <label className="text-sm font-medium">Add a new reason</label>
          <Textarea
            value={newLabel}
            onChange={(e) => setNewLabel(e.target.value)}
            rows={2}
            maxLength={500}
            placeholder="e.g. Please include client contact details in the BRD…"
            data-testid="input-new-rejection-reason"
          />
          <div className="flex justify-end">
            <Button
              size="sm"
              onClick={() => create.mutate(newLabel.trim())}
              disabled={create.isPending || newLabel.trim().length < 3}
              data-testid="button-add-rejection-reason"
            >
              {create.isPending ? (
                <Spinner className="w-4 h-4 mr-2" />
              ) : (
                <Plus className="w-4 h-4 mr-2" />
              )}
              Add reason
            </Button>
          </div>
        </div>
      </CardContent>

      <AlertDialog
        open={deleting != null}
        onOpenChange={(open) => {
          if (!open) setDeleting(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this rejection reason?</AlertDialogTitle>
            <AlertDialogDescription>
              "{deleting?.label}" will no longer appear as a quick reason in the
              review queue. Reasons already used on rejected entries are not
              affected.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={remove.isPending}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                if (deleting) remove.mutate(deleting.id);
              }}
              disabled={remove.isPending}
              className="bg-destructive text-white hover:bg-destructive/90"
              data-testid="button-confirm-delete-reason"
            >
              {remove.isPending && <Spinner className="w-4 h-4 mr-2" />}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
