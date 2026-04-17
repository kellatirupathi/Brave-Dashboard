import { useListAnnouncements, useCreateAnnouncement, getListAnnouncementsQueryKey } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Spinner } from "@/components/ui/spinner";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { Megaphone, Plus } from "lucide-react";
import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

export default function CoordinatorAnnouncements() {
  const { data: announcements, isLoading } = useListAnnouncements();
  const createAnnouncement = useCreateAnnouncement();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [isOpen, setIsOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    createAnnouncement.mutate({ data: { title, body, target: "campus" as any } }, {
      onSuccess: () => {
        toast({ title: "Announcement sent" });
        queryClient.invalidateQueries({ queryKey: getListAnnouncementsQueryKey() });
        setIsOpen(false);
        setTitle("");
        setBody("");
      }
    });
  };

  if (isLoading) return <div className="flex h-64 items-center justify-center"><Spinner size="lg" /></div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Announcements</h1>
          <p className="text-muted-foreground">Broadcast messages to your campus</p>
        </div>
        
        <Dialog open={isOpen} onOpenChange={setIsOpen}>
          <DialogTrigger asChild>
            <Button><Plus className="w-4 h-4 mr-2" /> New Announcement</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create Announcement</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleCreate} className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Title</label>
                <Input value={title} onChange={e => setTitle(e.target.value)} required />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Message</label>
                <Textarea value={body} onChange={e => setBody(e.target.value)} required rows={4} />
              </div>
              <div className="flex justify-end pt-4">
                <Button type="submit" disabled={createAnnouncement.isPending}>
                  {createAnnouncement.isPending && <Spinner className="w-4 h-4 mr-2" />} Send
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid gap-4">
        {announcements?.map(a => (
          <Card key={a.id}>
            <CardHeader className="pb-2">
              <CardTitle className="text-lg">{a.title}</CardTitle>
              <p className="text-xs text-muted-foreground">Sent by {a.authorName} on {new Date(a.createdAt).toLocaleDateString()}</p>
            </CardHeader>
            <CardContent>
              <p className="whitespace-pre-wrap">{a.body}</p>
            </CardContent>
          </Card>
        ))}
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