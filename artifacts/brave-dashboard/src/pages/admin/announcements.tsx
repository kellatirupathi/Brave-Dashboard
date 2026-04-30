import {
  useListAnnouncements,
  useCreateAnnouncement,
  useUpdateAnnouncement,
  useDeleteAnnouncement,
  useListCampuses,
  getListAnnouncementsQueryKey,
  getGetPinnedAnnouncementQueryKey,
  type Announcement,
  type Campus,
  type CreateAnnouncementBody,
  type UpdateAnnouncementBody,
  type ErrorType,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Spinner } from "@/components/ui/spinner";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { Megaphone, Plus, Pencil, Trash2 } from "lucide-react";
import { useState, useMemo } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Pin } from "lucide-react";

type TargetMode = "all" | "campus";

export default function AdminAnnouncements() {
  const { data: announcements, isLoading } = useListAnnouncements();
  const { data: campuses } = useListCampuses();
  const createAnnouncement = useCreateAnnouncement();
  const updateAnnouncement = useUpdateAnnouncement();
  const deleteAnnouncement = useDeleteAnnouncement();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [isOpen, setIsOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [target, setTarget] = useState<TargetMode>("all");
  const [campusId, setCampusId] = useState<string>("");
  const [pinToDashboard, setPinToDashboard] = useState(false);

  const campusNameById = useMemo(() => {
    const m = new Map<number, string>();
    (campuses ?? []).forEach((c: Campus) => m.set(c.id, c.name));
    return m;
  }, [campuses]);

  const reset = () => {
    setTitle("");
    setBody("");
    setTarget("all");
    setCampusId("");
    setPinToDashboard(false);
    setEditingId(null);
  };

  const refresh = () => {
    queryClient.invalidateQueries({
      queryKey: getListAnnouncementsQueryKey(),
    });
    // Pin status / audience may have changed — refresh the student-facing
    // pinned banner cache so it reflects the latest pinned announcement.
    queryClient.invalidateQueries({
      queryKey: getGetPinnedAnnouncementQueryKey(),
    });
  };

  const openCreate = () => {
    reset();
    setIsOpen(true);
  };

  const openEdit = (a: Announcement) => {
    setEditingId(a.id);
    setTitle(a.title);
    setBody(a.body);
    setPinToDashboard(a.pinToDashboard);
    if (a.target === "campus") {
      setTarget("campus");
      setCampusId(a.campusId != null ? String(a.campusId) : "");
    } else {
      setTarget("all");
      setCampusId("");
    }
    setIsOpen(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (target === "campus" && !campusId) {
      toast({
        title: "Pick a campus",
        description: "Choose which campus should receive this announcement.",
        variant: "destructive",
      });
      return;
    }

    if (editingId != null) {
      const payload: UpdateAnnouncementBody = {
        title,
        body,
        target,
        campusId: target === "campus" ? Number(campusId) : null,
        teamId: null,
        pinToDashboard,
      };
      updateAnnouncement.mutate(
        { id: editingId, data: payload },
        {
          onSuccess: () => {
            toast({ title: "Announcement updated" });
            refresh();
            setIsOpen(false);
            reset();
          },
          onError: (err: ErrorType<unknown>) =>
            toast({
              title: "Update failed",
              description:
                err instanceof Error ? err.message : "Please try again.",
              variant: "destructive",
            }),
        },
      );
      return;
    }

    const payload: CreateAnnouncementBody = {
      title,
      body,
      target,
      campusId: target === "campus" ? Number(campusId) : null,
      teamId: null,
      pinToDashboard,
    };
    createAnnouncement.mutate(
      { data: payload },
      {
        onSuccess: () => {
          toast({ title: "Announcement sent" });
          refresh();
          setIsOpen(false);
          reset();
        },
        onError: (err: ErrorType<unknown>) =>
          toast({
            title: "Failed to send",
            description:
              err instanceof Error ? err.message : "Please try again.",
            variant: "destructive",
          }),
      },
    );
  };

  const handleDelete = () => {
    if (deletingId == null) return;
    deleteAnnouncement.mutate(
      { id: deletingId },
      {
        onSuccess: () => {
          toast({ title: "Announcement deleted" });
          refresh();
          setDeletingId(null);
        },
        onError: (err: ErrorType<unknown>) => {
          toast({
            title: "Delete failed",
            description:
              err instanceof Error ? err.message : "Please try again.",
            variant: "destructive",
          });
          setDeletingId(null);
        },
      },
    );
  };

  if (isLoading)
    return (
      <div className="flex h-64 items-center justify-center">
        <Spinner size="lg" />
      </div>
    );

  const isEditing = editingId != null;
  const isSubmitting = isEditing
    ? updateAnnouncement.isPending
    : createAnnouncement.isPending;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Announcements</h1>
          <p className="text-muted-foreground">
            Broadcast messages to all campuses or a specific campus
          </p>
        </div>

        <Dialog
          open={isOpen}
          onOpenChange={(o) => {
            setIsOpen(o);
            if (!o) reset();
          }}
        >
          <DialogTrigger asChild>
            <Button onClick={openCreate} data-testid="button-new-announcement">
              <Plus className="w-4 h-4 mr-2" /> New Announcement
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {isEditing ? "Edit Announcement" : "Create Announcement"}
              </DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Audience</label>
                <Select
                  value={target}
                  onValueChange={(v) => setTarget(v as TargetMode)}
                >
                  <SelectTrigger data-testid="select-audience">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All campuses</SelectItem>
                    <SelectItem value="campus">A specific campus</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {target === "campus" && (
                <div className="space-y-2">
                  <label className="text-sm font-medium">Campus</label>
                  <Select value={campusId} onValueChange={setCampusId}>
                    <SelectTrigger data-testid="select-campus">
                      <SelectValue placeholder="Pick a campus" />
                    </SelectTrigger>
                    <SelectContent className="max-h-72 overflow-y-auto">
                      {campuses?.map((c: Campus) => (
                        <SelectItem key={c.id} value={String(c.id)}>
                          {c.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div className="space-y-2">
                <label className="text-sm font-medium">Title</label>
                <Input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  required
                  data-testid="input-title"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Message</label>
                <Textarea
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  required
                  rows={4}
                  data-testid="input-body"
                />
              </div>
              <div className="flex items-start gap-2 rounded-md border p-3">
                <Checkbox
                  id="pin-to-dashboard"
                  checked={pinToDashboard}
                  onCheckedChange={(v) => setPinToDashboard(v === true)}
                  data-testid="checkbox-pin-to-dashboard"
                  className="mt-0.5"
                />
                <div className="flex-1">
                  <label
                    htmlFor="pin-to-dashboard"
                    className="text-sm font-medium cursor-pointer flex items-center gap-1.5"
                  >
                    <Pin className="w-3.5 h-3.5" />
                    Pin to student dashboard
                  </label>
                  <p className="text-xs text-muted-foreground mt-1">
                    Shows a banner at the top of each targeted student's
                    dashboard until they dismiss it.
                  </p>
                </div>
              </div>
              <div className="flex justify-end pt-4">
                <Button
                  type="submit"
                  disabled={isSubmitting}
                  data-testid="button-send-announcement"
                >
                  {isSubmitting && <Spinner className="w-4 h-4 mr-2" />}
                  {isEditing ? "Save changes" : "Send"}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid gap-4">
        {announcements?.map((a: Announcement) => {
          const targetLabel =
            a.target === "all"
              ? "All campuses"
              : a.target === "campus"
                ? `Campus: ${a.campusId != null ? (campusNameById.get(a.campusId) ?? "—") : "—"}`
                : a.target === "team"
                  ? "Team"
                  : a.target;
          return (
            <Card key={a.id} data-testid={`announcement-${a.id}`}>
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <CardTitle className="text-lg">{a.title}</CardTitle>
                    <p className="text-xs text-muted-foreground mt-1">
                      Sent by {a.authorName} on{" "}
                      {new Date(a.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {a.pinToDashboard && (
                      <Badge
                        variant="default"
                        className="text-[10px] gap-1"
                        data-testid={`badge-pinned-${a.id}`}
                      >
                        <Pin className="w-3 h-3" />
                        Pinned
                      </Badge>
                    )}
                    <Badge variant="outline" className="text-[10px]">
                      {targetLabel}
                    </Badge>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8"
                      onClick={() => openEdit(a)}
                      data-testid={`button-edit-announcement-${a.id}`}
                      aria-label="Edit"
                    >
                      <Pencil className="w-4 h-4" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8 text-destructive hover:text-destructive"
                      onClick={() => setDeletingId(a.id)}
                      data-testid={`button-delete-announcement-${a.id}`}
                      aria-label="Delete"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <p className="whitespace-pre-wrap">{a.body}</p>
              </CardContent>
            </Card>
          );
        })}
        {announcements?.length === 0 && (
          <div className="text-center py-12 text-muted-foreground border-2 border-dashed rounded-lg">
            <Megaphone className="w-8 h-8 mx-auto mb-3 opacity-50" />
            <p>No announcements sent yet.</p>
          </div>
        )}
      </div>

      <AlertDialog
        open={deletingId != null}
        onOpenChange={(o) => {
          if (!o) setDeletingId(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this announcement?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes the announcement for everyone who could
              see it. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete-announcement">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                handleDelete();
              }}
              disabled={deleteAnnouncement.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-testid="button-confirm-delete-announcement"
            >
              {deleteAnnouncement.isPending && (
                <Spinner className="w-4 h-4 mr-2" />
              )}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
