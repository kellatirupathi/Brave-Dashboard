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
    <div className="mx-auto max-w-3xl space-y-4 sm:space-y-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="mobile-page-heading">
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Notifications</h1>
        </div>
        <Button
          variant="outline"
          onClick={handleMarkAllRead}
          disabled={markAllRead.isPending}
          className="h-10 px-3 text-sm"
        >
          <CheckSquare className="mr-1.5 h-4 w-4" /> Mark all as read
        </Button>
      </div>

      <div className="space-y-3 sm:space-y-4">
        {notifications?.map(n => (
          <Card key={n.id} className={!n.isRead ? "bg-primary/5 border-primary/20" : "opacity-75"}>
            <CardContent className="flex gap-2.5 p-3 sm:gap-4 sm:p-4">
              <div className="mt-0.5">
                <Bell className={`h-4 w-4 ${!n.isRead ? "text-primary" : "text-muted-foreground"} sm:h-5 sm:w-5`} />
              </div>
              <div className="flex-1">
                <div className="flex items-start justify-between gap-2 sm:gap-4">
                  <h3 className="text-base font-semibold leading-snug sm:text-lg">{n.title}</h3>
                  <span className="whitespace-nowrap text-[11px] text-muted-foreground sm:text-xs">{formatDate(n.createdAt)}</span>
                </div>
                <p className="mt-1 text-sm leading-5 text-muted-foreground sm:text-base sm:leading-normal">{n.body}</p>
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
          <div className="rounded-xl border border-dashed bg-card py-12 text-center sm:py-20">
            <Bell className="mx-auto mb-3 h-10 w-10 text-muted-foreground opacity-50 sm:mb-4 sm:h-12 sm:w-12" />
            <h3 className="text-base font-semibold sm:text-lg">No notifications</h3>
            <p className="mt-1.5 text-sm text-muted-foreground sm:mt-2">You're all caught up.</p>
          </div>
        )}
      </div>
    </div>
  );
}
