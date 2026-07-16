// Shared three-dots Edit / Delete menu for a Finale deck. Used by BOTH the
// student page (team leader, while submissions are open) and the admin list —
// the server resolves permission from the caller's role, so this component
// only decides whether to *offer* the actions.
//
// Edit opens a modal with the remarks pre-filled and an optional file replace
// (keep the current deck by not picking one). Delete asks for confirmation.
import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useRequestUploadUrl } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import {
  FileUp,
  MoreHorizontal,
  Pencil,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import {
  deleteFinaleSubmission,
  updateFinaleSubmission,
} from "@/lib/finale-api";

const PPTX_MIME =
  "application/vnd.openxmlformats-officedocument.presentationml.presentation";
const PPT_MIME = "application/vnd.ms-powerpoint";

function isPptx(file: File): boolean {
  return (
    file.type === PPTX_MIME ||
    file.type === PPT_MIME ||
    /\.pptx?$/i.test(file.name)
  );
}

export type EditableSubmission = {
  id: number;
  fileName: string | null;
  category: string | null;
  remarks: string | null;
};

export function FinaleSubmissionActions({
  submission,
  onDone,
}: {
  submission: EditableSubmission;
  // Called after a successful edit/delete so the caller can refetch.
  onDone: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0"
            // The row itself may be clickable (admin list) — don't trigger it.
            onClick={(e) => e.stopPropagation()}
            data-testid={`button-finale-actions-${submission.id}`}
          >
            <MoreHorizontal className="h-4 w-4" />
            <span className="sr-only">Open actions</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
          <DropdownMenuItem
            onSelect={() => setEditing(true)}
            data-testid={`menu-edit-finale-${submission.id}`}
          >
            <Pencil className="mr-2 h-4 w-4" /> Edit
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={() => setConfirmingDelete(true)}
            className="text-destructive focus:text-destructive focus:bg-destructive/10"
            data-testid={`menu-delete-finale-${submission.id}`}
          >
            <Trash2 className="mr-2 h-4 w-4" /> Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Mounted only while open, so every open starts from the row's current
          server state — a cancelled draft (or an abandoned file replacement)
          is never carried into the next open. */}
      {editing ? (
        <EditSubmissionModal
          submission={submission}
          onClose={() => setEditing(false)}
          onDone={onDone}
        />
      ) : null}

      {confirmingDelete ? (
        <DeleteSubmissionDialog
          submission={submission}
          onClose={() => setConfirmingDelete(false)}
          onDone={onDone}
        />
      ) : null}
    </>
  );
}

// Only rendered while open (see FinaleSubmissionActions), so the initial
// useState values ARE the seeding — no prop-sync needed.
function EditSubmissionModal({
  submission,
  onClose,
  onDone,
}: {
  submission: EditableSubmission;
  onClose: () => void;
  onDone: () => void;
}) {
  const { toast } = useToast();
  const requestUpload = useRequestUploadUrl();
  const [category, setCategory] = useState(submission.category ?? "");
  const [remarks, setRemarks] = useState(submission.remarks ?? "");
  const [newFile, setNewFile] = useState<File | null>(null);
  const [newFileUrl, setNewFileUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  const handleFile = async (picked: File | undefined) => {
    if (!picked) return;
    if (!isPptx(picked)) {
      toast({
        title: "Only .pptx files",
        description: "Please upload your deck as a PowerPoint (.pptx) file.",
        variant: "destructive",
      });
      return;
    }
    setUploading(true);
    try {
      const presigned = await requestUpload.mutateAsync({
        data: {
          name: picked.name,
          size: picked.size,
          contentType: picked.type || PPTX_MIME,
        },
      });
      const put = await fetch(presigned.uploadURL, {
        method: "PUT",
        headers: { "Content-Type": picked.type || PPTX_MIME },
        body: picked,
      });
      if (!put.ok) throw new Error("Upload failed");
      setNewFile(picked);
      setNewFileUrl(presigned.objectPath);
    } catch (err) {
      toast({
        title: "Could not upload",
        description: err instanceof Error ? err.message : "Please try again.",
        variant: "destructive",
      });
    } finally {
      setUploading(false);
    }
  };

  const save = useMutation({
    mutationFn: () =>
      updateFinaleSubmission(submission.id, {
        // Omitted when no new file was picked — the server keeps the old deck.
        ...(newFileUrl ? { fileUrl: newFileUrl, fileName: newFile?.name } : {}),
        category: category.trim() || null,
        remarks: remarks.trim() || null,
      }),
    onSuccess: () => {
      toast({ title: "Submission updated" });
      onClose();
      onDone();
    },
    onError: (err: unknown) =>
      toast({
        title: "Could not update",
        description: err instanceof Error ? err.message : "Please try again.",
        variant: "destructive",
      }),
  });

  return (
    <Dialog
      open
      onOpenChange={(o) => {
        if (!o && !save.isPending) onClose();
      }}
    >
      <DialogContent onClick={(e) => e.stopPropagation()}>
        <DialogHeader>
          <DialogTitle>Edit submission</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Pitch deck (.pptx)</Label>
            {newFileUrl && newFile ? (
              <div className="flex items-center gap-2 rounded-md border bg-muted/30 p-3 text-sm">
                <FileUp className="h-4 w-4 shrink-0 text-primary" />
                <span className="flex-1 truncate">{newFile.name}</span>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setNewFile(null);
                    setNewFileUrl(null);
                  }}
                  data-testid="button-clear-edit-file"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ) : (
              <>
                <div className="rounded-md border bg-muted/30 p-3 text-sm">
                  <span className="text-muted-foreground">Current: </span>
                  <span className="font-medium">
                    {submission.fileName || "Pitch deck"}
                  </span>
                </div>
                <label
                  htmlFor="finale-edit-file"
                  className="flex cursor-pointer items-center justify-center gap-2 rounded-md border border-dashed p-4 text-sm text-muted-foreground hover:bg-muted/30"
                >
                  {uploading ? (
                    <>
                      <Spinner className="h-4 w-4" /> Uploading…
                    </>
                  ) : (
                    <>
                      <Upload className="h-4 w-4" /> Replace with a new .pptx
                    </>
                  )}
                  <input
                    id="finale-edit-file"
                    type="file"
                    accept=".ppt,.pptx"
                    className="hidden"
                    disabled={uploading}
                    onChange={(e) => void handleFile(e.target.files?.[0])}
                    data-testid="input-edit-finale-file"
                  />
                </label>
                <p className="text-xs text-muted-foreground">
                  Leave this alone to keep the current deck and only change the
                  remarks.
                </p>
              </>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="finale-edit-category">Category</Label>
            <Input
              id="finale-edit-category"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              maxLength={200}
              placeholder="e.g. EdTech, D2C, SaaS…"
              data-testid="input-edit-finale-category"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="finale-edit-remarks">Remarks</Label>
            <Textarea
              id="finale-edit-remarks"
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
              rows={4}
              maxLength={2000}
              data-testid="input-edit-finale-remarks"
            />
          </div>

          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={onClose}
              disabled={save.isPending}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={() => save.mutate()}
              disabled={uploading || save.isPending}
              data-testid="button-save-finale-edit"
            >
              {save.isPending ? <Spinner className="mr-2 h-4 w-4" /> : null}
              Submit
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function DeleteSubmissionDialog({
  submission,
  onClose,
  onDone,
}: {
  submission: EditableSubmission;
  onClose: () => void;
  onDone: () => void;
}) {
  const { toast } = useToast();
  const del = useMutation({
    mutationFn: () => deleteFinaleSubmission(submission.id),
    onSuccess: () => {
      toast({ title: "Submission deleted" });
      onClose();
      onDone();
    },
    onError: (err: unknown) =>
      toast({
        title: "Could not delete",
        description: err instanceof Error ? err.message : "Please try again.",
        variant: "destructive",
      }),
  });

  return (
    <AlertDialog open onOpenChange={(o) => !o && onClose()}>
      <AlertDialogContent onClick={(e) => e.stopPropagation()}>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete this submission?</AlertDialogTitle>
          <AlertDialogDescription>
            {submission.fileName || "This deck"} will be removed from the Finale
            submissions. This can't be undone from here.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={del.isPending}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => {
              e.preventDefault();
              del.mutate();
            }}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            data-testid="button-confirm-delete-finale"
          >
            {del.isPending ? <Spinner className="mr-2 h-4 w-4" /> : null}
            Delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
