import { useListNotifications, useMarkNotificationRead, useMarkAllNotificationsRead, getListNotificationsQueryKey } from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { useQueryClient } from "@tanstack/react-query";
import { Bell, Check, CheckSquare } from "lucide-react";
import { formatDate } from "@/lib/format";

export default function Notifications() {
  const { data: notifications, isLoading } = useListNotifications({});
  const markRead = useMarkNotificationRead();
  const markAllRead = useMarkAllNotificationsRead();
  const queryClient = useQueryClient();

  const handleMarkRead = (id: number) => {
    markRead.mutate({ id }, {
      onSuccess: () => queryClient.invalidateQueries({ queryKey: getListNotificationsQueryKey() })
    });
  };

  const handleMarkAllRead = () => {
    markAllRead.mutate(undefined, {
      onSuccess: () => queryClient.invalidateQueries({ queryKey: getListNotificationsQueryKey() })
    });
  };

  if (isLoading) return <div className="flex h-64 items-center justify-center"><Spinner size="lg" /></div>;

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Notifications</h1>
        </div>
        <Button variant="outline" onClick={handleMarkAllRead} disabled={markAllRead.isPending}>
          <CheckSquare className="w-4 h-4 mr-2" /> Mark all as read
        </Button>
      </div>

      <div className="space-y-4">
        {notifications?.map(n => (
          <Card key={n.id} className={!n.isRead ? "bg-primary/5 border-primary/20" : "opacity-75"}>
            <CardContent className="p-4 flex gap-4">
              <div className="mt-1">
                <Bell className={`w-5 h-5 ${!n.isRead ? "text-primary" : "text-muted-foreground"}`} />
              </div>
              <div className="flex-1">
                <div className="flex items-start justify-between gap-4">
                  <h3 className="font-semibold text-lg">{n.title}</h3>
                  <span className="text-xs text-muted-foreground whitespace-nowrap">{formatDate(n.createdAt)}</span>
                </div>
                <p className="mt-1 text-muted-foreground">{n.body}</p>
              </div>
              {!n.isRead && (
                <Button variant="ghost" size="icon" onClick={() => handleMarkRead(n.id)} title="Mark as read">
                  <Check className="w-4 h-4" />
                </Button>
              )}
            </CardContent>
          </Card>
        ))}
        
        {notifications?.length === 0 && (
          <div className="text-center py-20 bg-card border rounded-xl border-dashed">
            <Bell className="w-12 h-12 text-muted-foreground mx-auto mb-4 opacity-50" />
            <h3 className="text-lg font-semibold">No notifications</h3>
            <p className="text-muted-foreground mt-2">You're all caught up.</p>
          </div>
        )}
      </div>
    </div>
  );
}
