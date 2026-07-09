import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
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
import { useToast } from "@/hooks/use-toast";
import { MessageSquare, Plus, Pencil, Trash2 } from "lucide-react";
import {
  listPopups,
  createPopup,
  updatePopup,
  deletePopup,
  type PopupTemplate,
} from "@/lib/popups-api";

const POPUPS_KEY = ["admin-popups"];

// Admin Config card: CRUD over student pop-up templates. Each template has a
// name, a message, a type (checkbox-required or simple), and an on/off toggle.
// Enabled templates are shown to students one at a time until acknowledged.
export function PopupsAdminCard() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data: popups, isLoading } = useQuery({
    queryKey: POPUPS_KEY,
    queryFn: listPopups,
  });

  const refresh = () => queryClient.invalidateQueries({ queryKey: POPUPS_KEY });

  // Create form state.
  const [name, setName] = useState("");
  const [message, setMessage] = useState("");
  const [requireCheckbox, setRequireCheckbox] = useState(false);
  const [checkboxLabel, setCheckboxLabel] = useState("");
  const [enabled, setEnabled] = useState(false);

  const resetCreate = () => {
    setName("");
    setMessage("");
    setRequireCheckbox(false);
    setCheckboxLabel("");
    setEnabled(false);
  };

  const create = useMutation({
    mutationFn: () =>
      createPopup({
        name: name.trim(),
        message: message.trim(),
        requireCheckbox,
        checkboxLabel: requireCheckbox ? checkboxLabel.trim() || null : null,
        enabled,
      }),
    onSuccess: () => {
      toast({ title: "Popup created" });
      resetCreate();
      refresh();
    },
    onError: (err: unknown) => {
      const e = err as { data?: { error?: string }; message?: string };
      toast({
        title: "Could not create",
        description: e?.data?.error ?? e?.message ?? "Try again",
        variant: "destructive",
      });
    },
  });

  const toggleEnabled = useMutation({
    mutationFn: (p: PopupTemplate) =>
      updatePopup(p.id, { enabled: !p.enabled }),
    onSuccess: () => refresh(),
    onError: (err: unknown) => {
      const e = err as { data?: { error?: string }; message?: string };
      toast({
        title: "Could not update",
        description: e?.data?.error ?? e?.message ?? "Try again",
        variant: "destructive",
      });
    },
  });

  const [editing, setEditing] = useState<PopupTemplate | null>(null);
  const [deleting, setDeleting] = useState<PopupTemplate | null>(null);

  const remove = useMutation({
    mutationFn: (id: number) => deletePopup(id),
    onSuccess: () => {
      toast({ title: "Popup deleted" });
      setDeleting(null);
      refresh();
    },
    onError: (err: unknown) => {
      const e = err as { data?: { error?: string }; message?: string };
      toast({
        title: "Could not delete",
        description: e?.data?.error ?? e?.message ?? "Try again",
        variant: "destructive",
      });
    },
  });

  const canCreate = name.trim().length > 0 && message.trim().length > 0;

  return (
    <Card data-testid="card-popups">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <MessageSquare className="w-5 h-5" /> Student Pop-ups
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Create pop-ups shown to all students. Enabled pop-ups appear one at a
          time until each student confirms them. This is separate from the Terms
          &amp; Conditions gate.
        </p>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Create form */}
        <div className="space-y-3 rounded-lg border p-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">Template name</label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Revenue accuracy declaration"
              data-testid="input-popup-name"
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Message</label>
            <Textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={4}
              placeholder="The message shown to students…"
              data-testid="input-popup-message"
            />
          </div>
          <div className="flex items-center justify-between border p-3 rounded-lg">
            <div>
              <p className="font-medium text-sm">Require checkbox</p>
              <p className="text-xs text-muted-foreground">
                Students must tick a checkbox before the Confirm button enables.
                Off = message with a Confirm button only.
              </p>
            </div>
            <Switch
              checked={requireCheckbox}
              onCheckedChange={setRequireCheckbox}
              data-testid="switch-popup-require-checkbox"
            />
          </div>
          {requireCheckbox && (
            <div className="space-y-2">
              <label className="text-sm font-medium">
                Checkbox label (optional)
              </label>
              <Input
                value={checkboxLabel}
                onChange={(e) => setCheckboxLabel(e.target.value)}
                placeholder="I confirm the above"
                data-testid="input-popup-checkbox-label"
              />
            </div>
          )}
          <div className="flex items-center justify-between border p-3 rounded-lg">
            <div>
              <p className="font-medium text-sm">Enabled</p>
              <p className="text-xs text-muted-foreground">
                Show this pop-up to all students.
              </p>
            </div>
            <Switch
              checked={enabled}
              onCheckedChange={setEnabled}
              data-testid="switch-popup-enabled"
            />
          </div>
          <div className="flex justify-end">
            <Button
              onClick={() => create.mutate()}
              disabled={!canCreate || create.isPending}
              data-testid="button-create-popup"
            >
              {create.isPending ? (
                <Spinner className="w-4 h-4 mr-2" />
              ) : (
                <Plus className="w-4 h-4 mr-2" />
              )}
              Create pop-up
            </Button>
          </div>
        </div>

        {/* Existing templates */}
        <div className="space-y-3">
          <h4 className="text-sm font-medium">Existing pop-ups</h4>
          {isLoading ? (
            <div className="flex justify-center py-6">
              <Spinner />
            </div>
          ) : !popups || popups.length === 0 ? (
            <p className="text-sm text-muted-foreground">No pop-ups yet.</p>
          ) : (
            <div className="space-y-2">
              {popups.map((p) => (
                <div
                  key={p.id}
                  className="rounded-lg border p-3"
                  data-testid={`popup-row-${p.id}`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium">{p.name}</span>
                        <Badge variant={p.enabled ? "default" : "secondary"}>
                          {p.enabled ? "Enabled" : "Disabled"}
                        </Badge>
                        <Badge variant="outline">
                          {p.requireCheckbox ? "Checkbox required" : "Simple"}
                        </Badge>
                        <span className="text-xs text-muted-foreground">
                          {p.acknowledgedCount} confirmed
                        </span>
                      </div>
                      <p className="mt-1 text-sm text-muted-foreground line-clamp-2">
                        {p.message}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Switch
                        checked={p.enabled}
                        onCheckedChange={() => toggleEnabled.mutate(p)}
                        data-testid={`switch-popup-toggle-${p.id}`}
                      />
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8"
                        onClick={() => setEditing(p)}
                        aria-label="Edit pop-up"
                        data-testid={`button-edit-popup-${p.id}`}
                      >
                        <Pencil className="w-4 h-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8 text-destructive hover:text-destructive"
                        onClick={() => setDeleting(p)}
                        aria-label="Delete pop-up"
                        data-testid={`button-delete-popup-${p.id}`}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </CardContent>

      <EditPopupDialog
        popup={editing}
        onClose={() => setEditing(null)}
        onSaved={() => {
          setEditing(null);
          refresh();
        }}
      />

      <AlertDialog
        open={deleting != null}
        onOpenChange={(open) => {
          if (!open) setDeleting(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete "{deleting?.name}"?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently deletes the pop-up and every student's
              confirmation record for it. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                if (deleting) remove.mutate(deleting.id);
              }}
              disabled={remove.isPending}
              className="bg-destructive text-white hover:bg-destructive/90"
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

function EditPopupDialog({
  popup,
  onClose,
  onSaved,
}: {
  popup: PopupTemplate | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const [name, setName] = useState("");
  const [message, setMessage] = useState("");
  const [requireCheckbox, setRequireCheckbox] = useState(false);
  const [checkboxLabel, setCheckboxLabel] = useState("");
  const [enabled, setEnabled] = useState(false);
  const [initialisedFor, setInitialisedFor] = useState<number | null>(null);

  // Seed the form when a new popup is opened for editing.
  if (popup && initialisedFor !== popup.id) {
    setInitialisedFor(popup.id);
    setName(popup.name);
    setMessage(popup.message);
    setRequireCheckbox(popup.requireCheckbox);
    setCheckboxLabel(popup.checkboxLabel ?? "");
    setEnabled(popup.enabled);
  }

  const save = useMutation({
    mutationFn: () =>
      updatePopup(popup!.id, {
        name: name.trim(),
        message: message.trim(),
        requireCheckbox,
        checkboxLabel: requireCheckbox ? checkboxLabel.trim() || null : null,
        enabled,
      }),
    onSuccess: () => {
      toast({ title: "Popup updated" });
      setInitialisedFor(null);
      onSaved();
    },
    onError: (err: unknown) => {
      const e = err as { data?: { error?: string }; message?: string };
      toast({
        title: "Could not update",
        description: e?.data?.error ?? e?.message ?? "Try again",
        variant: "destructive",
      });
    },
  });

  const canSave = name.trim().length > 0 && message.trim().length > 0;

  return (
    <Dialog
      open={popup != null}
      onOpenChange={(open) => {
        if (!open) {
          setInitialisedFor(null);
          onClose();
        }
      }}
    >
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit pop-up</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-2">
            <label className="text-sm font-medium">Template name</label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Message</label>
            <Textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={4}
            />
          </div>
          <div className="flex items-center justify-between border p-3 rounded-lg">
            <p className="font-medium text-sm">Require checkbox</p>
            <Switch
              checked={requireCheckbox}
              onCheckedChange={setRequireCheckbox}
            />
          </div>
          {requireCheckbox && (
            <div className="space-y-2">
              <label className="text-sm font-medium">
                Checkbox label (optional)
              </label>
              <Input
                value={checkboxLabel}
                onChange={(e) => setCheckboxLabel(e.target.value)}
              />
            </div>
          )}
          <div className="flex items-center justify-between border p-3 rounded-lg">
            <p className="font-medium text-sm">Enabled</p>
            <Switch checked={enabled} onCheckedChange={setEnabled} />
          </div>
        </div>
        <DialogFooter>
          <Button
            onClick={() => save.mutate()}
            disabled={!canSave || save.isPending}
          >
            {save.isPending && <Spinner className="w-4 h-4 mr-2" />}
            Save changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
