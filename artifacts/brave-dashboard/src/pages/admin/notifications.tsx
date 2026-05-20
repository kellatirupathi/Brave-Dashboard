import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, Plus, Trash2, Mail } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
  listNotificationSubscribers,
  createNotificationSubscriber,
  updateNotificationSubscriber,
  deleteNotificationSubscriber,
  type NotificationSubscriber,
} from "@/lib/progress-api";

export default function AdminNotifications() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const { data: subscribers, isLoading } = useQuery({
    queryKey: ["admin-notification-subscribers"],
    queryFn: listNotificationSubscribers,
  });

  const invalidate = () =>
    qc.invalidateQueries({ queryKey: ["admin-notification-subscribers"] });

  const createMut = useMutation({
    mutationFn: createNotificationSubscriber,
    onSuccess: () => {
      toast({ title: "Subscriber added" });
      setEmail("");
      setName("");
      invalidate();
    },
    onError: (err: Error) => {
      toast({
        title: "Failed to add",
        description: err.message,
        variant: "destructive",
      });
    },
  });

  const updateMut = useMutation({
    mutationFn: ({
      id,
      body,
    }: {
      id: number;
      body: Parameters<typeof updateNotificationSubscriber>[1];
    }) => updateNotificationSubscriber(id, body),
    onSuccess: () => invalidate(),
    onError: (err: Error) => {
      toast({
        title: "Update failed",
        description: err.message,
        variant: "destructive",
      });
    },
  });

  const deleteMut = useMutation({
    mutationFn: deleteNotificationSubscriber,
    onSuccess: () => {
      toast({ title: "Subscriber removed" });
      setDeletingId(null);
      invalidate();
    },
    onError: (err: Error) => {
      toast({
        title: "Delete failed",
        description: err.message,
        variant: "destructive",
      });
    },
  });

  function onAdd(e: React.FormEvent) {
    e.preventDefault();
    const trimmedEmail = email.trim();
    if (!trimmedEmail || !trimmedEmail.includes("@")) {
      toast({
        title: "Enter a valid email address",
        variant: "destructive",
      });
      return;
    }
    createMut.mutate({
      email: trimmedEmail,
      name: name.trim() || undefined,
    });
  }

  const activeCount = (subscribers ?? []).filter((s) => s.isActive).length;

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <Bell className="h-6 w-6 text-primary" />
          Admin Notifications
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Manage the people who receive the daily email digest of overdue
          revenue review-queue items (submissions waiting more than 48 hours).
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Add subscriber</CardTitle>
          <CardDescription>
            New subscribers receive emails starting from the next daily run.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form
            onSubmit={onAdd}
            className="flex flex-col sm:flex-row gap-2"
            data-testid="admin-notifications-add-form"
          >
            <Input
              type="email"
              placeholder="email@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              data-testid="admin-notifications-email-input"
              className="flex-1"
            />
            <Input
              type="text"
              placeholder="Name (optional)"
              value={name}
              onChange={(e) => setName(e.target.value)}
              data-testid="admin-notifications-name-input"
              className="sm:w-56"
            />
            <Button
              type="submit"
              disabled={createMut.isPending}
              data-testid="admin-notifications-add-submit"
            >
              <Plus className="w-4 h-4 mr-1" />
              {createMut.isPending ? "Adding…" : "Add"}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Subscribers</CardTitle>
              <CardDescription>
                {(subscribers ?? []).length} total · {activeCount} active
              </CardDescription>
            </div>
            <Badge variant="secondary" className="gap-1">
              <Mail className="w-3 h-3" />
              Daily digest
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center py-12">
              <Spinner className="size-8" />
            </div>
          ) : !subscribers || subscribers.length === 0 ? (
            <div className="text-sm text-muted-foreground py-12 text-center">
              No subscribers yet. Add one above to start receiving the daily
              overdue digest.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Email</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead className="text-center">Active</TableHead>
                    <TableHead className="text-right">Added</TableHead>
                    <TableHead className="w-10" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {subscribers.map((s: NotificationSubscriber) => (
                    <TableRow
                      key={s.id}
                      data-testid={`admin-notifications-row-${s.id}`}
                    >
                      <TableCell className="font-medium">{s.email}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {s.name ?? "—"}
                      </TableCell>
                      <TableCell className="text-center">
                        <Switch
                          checked={s.isActive}
                          onCheckedChange={(checked) =>
                            updateMut.mutate({
                              id: s.id,
                              body: { isActive: checked },
                            })
                          }
                          disabled={updateMut.isPending}
                          data-testid={`admin-notifications-toggle-${s.id}`}
                        />
                      </TableCell>
                      <TableCell className="text-right text-xs text-muted-foreground tabular-nums">
                        {new Date(s.createdAt).toLocaleDateString()}
                      </TableCell>
                      <TableCell>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 px-2 text-destructive hover:text-destructive"
                          onClick={() => setDeletingId(s.id)}
                          data-testid={`admin-notifications-delete-${s.id}`}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <AlertDialog
        open={deletingId !== null}
        onOpenChange={(o) => !o && setDeletingId(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove subscriber?</AlertDialogTitle>
            <AlertDialogDescription>
              They will no longer receive the daily overdue digest. You can
              re-add them at any time.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() =>
                deletingId !== null && deleteMut.mutate(deletingId)
              }
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-testid="admin-notifications-confirm-delete"
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
