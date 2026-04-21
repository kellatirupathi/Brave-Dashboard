import {
  useListAnnouncements,
  useCreateAnnouncement,
  useListCampuses,
  getListAnnouncementsQueryKey,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Spinner } from "@/components/ui/spinner";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { Megaphone, Plus } from "lucide-react";
import { useState, useMemo } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type TargetMode = "all" | "campus";

export default function AdminAnnouncements() {
  const { data: announcements, isLoading } = useListAnnouncements();
  const { data: campuses } = useListCampuses();
  const createAnnouncement = useCreateAnnouncement();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [isOpen, setIsOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [target, setTarget] = useState<TargetMode>("all");
  const [campusId, setCampusId] = useState<string>("");

  const campusNameById = useMemo(() => {
    const m = new Map<number, string>();
    (campuses ?? []).forEach((c: any) => m.set(c.id, c.name));
    return m;
  }, [campuses]);

  const reset = () => {
    setTitle("");
    setBody("");
    setTarget("all");
    setCampusId("");
  };

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (target === "campus" && !campusId) {
      toast({
        title: "Pick a campus",
        description: "Choose which campus should receive this announcement.",
        variant: "destructive",
      });
      return;
    }
    const payload: any = {
      title,
      body,
      target,
      campusId: target === "campus" ? Number(campusId) : null,
      teamId: null,
    };
    createAnnouncement.mutate(
      { data: payload },
      {
        onSuccess: () => {
          toast({ title: "Announcement sent" });
          queryClient.invalidateQueries({
            queryKey: getListAnnouncementsQueryKey(),
          });
          setIsOpen(false);
          reset();
        },
        onError: (err: any) =>
          toast({
            title: "Failed to send",
            description: err?.message ?? "Please try again.",
            variant: "destructive",
          }),
      },
    );
  };

  if (isLoading)
    return (
      <div className="flex h-64 items-center justify-center">
        <Spinner size="lg" />
      </div>
    );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
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
            <Button data-testid="button-new-announcement">
              <Plus className="w-4 h-4 mr-2" /> New Announcement
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create Announcement</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleCreate} className="space-y-4">
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
                    <SelectContent>
                      {campuses?.map((c: any) => (
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
              <div className="flex justify-end pt-4">
                <Button
                  type="submit"
                  disabled={createAnnouncement.isPending}
                  data-testid="button-send-announcement"
                >
                  {createAnnouncement.isPending && (
                    <Spinner className="w-4 h-4 mr-2" />
                  )}
                  Send
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid gap-4">
        {announcements?.map((a: any) => {
          const targetLabel =
            a.target === "all"
              ? "All campuses"
              : a.target === "campus"
                ? `Campus: ${campusNameById.get(a.campusId) ?? "—"}`
                : a.target === "team"
                  ? "Team"
                  : a.target;
          return (
            <Card key={a.id} data-testid={`announcement-${a.id}`}>
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between gap-3">
                  <CardTitle className="text-lg">{a.title}</CardTitle>
                  <Badge variant="outline" className="text-[10px]">
                    {targetLabel}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground">
                  Sent by {a.authorName} on{" "}
                  {new Date(a.createdAt).toLocaleDateString()}
                </p>
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
    </div>
  );
}
