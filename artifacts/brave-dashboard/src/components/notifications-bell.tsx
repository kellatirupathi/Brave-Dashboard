import { Link } from "wouter";
import { Bell } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListNotifications,
  useMarkNotificationRead,
  useMarkAllNotificationsRead,
  getListNotificationsQueryKey,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";

const POLL_INTERVAL_MS = 30_000;
const VISIBLE_COUNT = 10;

export function NotificationsBell() {
  const queryClient = useQueryClient();
  const { data: notifications } = useListNotifications(
    {},
    {
      query: {
        queryKey: getListNotificationsQueryKey({}),
        refetchInterval: POLL_INTERVAL_MS,
        refetchOnWindowFocus: true,
      },
    },
  );
  const markRead = useMarkNotificationRead();
  const markAllRead = useMarkAllNotificationsRead();

  const all = notifications ?? [];
  const recent = all.slice(0, VISIBLE_COUNT);
  const unreadCount = all.filter((n) => !n.isRead).length;

  const invalidate = () =>
    queryClient.invalidateQueries({
      queryKey: getListNotificationsQueryKey({}),
    });

  const handleMarkOne = (id: number) => {
    markRead.mutate({ id }, { onSuccess: invalidate });
  };

  const handleMarkAll = () => {
    markAllRead.mutate(undefined, { onSuccess: invalidate });
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative"
          aria-label={
            unreadCount > 0
              ? `Notifications, ${unreadCount} unread`
              : "Notifications"
          }
          data-testid="button-notifications-bell"
        >
          <Bell className="w-5 h-5" />
          {unreadCount > 0 && (
            <span
              className="absolute -top-0.5 -right-0.5 min-w-[1.1rem] h-[1.1rem] px-1 rounded-full bg-destructive text-destructive-foreground text-[10px] font-semibold flex items-center justify-center leading-none"
              data-testid="badge-notifications-unread"
            >
              {unreadCount > 99 ? "99+" : unreadCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        sideOffset={8}
        className="w-[22rem] p-0"
        data-testid="popover-notifications"
      >
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <div className="font-semibold text-sm">Notifications</div>
          <Button
            variant="ghost"
            size="sm"
            disabled={unreadCount === 0 || markAllRead.isPending}
            onClick={handleMarkAll}
            data-testid="button-mark-all-read"
          >
            Mark all read
          </Button>
        </div>

        {/* [&_[data-radix-scroll-area-viewport]>div]:!block — Radix wraps the
            scroll content in a display:table div that shrink-wraps to its
            widest content, which breaks truncate/min-w-0 and lets rows
            overflow the popover. Forcing block makes it fill the width. */}
        <ScrollArea className="max-h-[24rem] [&_[data-radix-scroll-area-viewport]>div]:!block">
          {recent.length === 0 ? (
            <div className="px-4 py-10 text-center text-sm text-muted-foreground">
              You're all caught up.
            </div>
          ) : (
            <ul className="divide-y">
              {recent.map((n) => (
                <li
                  key={n.id}
                  className={cn(
                    "px-4 py-3 text-sm",
                    !n.isRead && "bg-primary/5",
                  )}
                  data-testid={`item-notification-${n.id}`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="font-medium truncate">{n.title}</div>
                      {n.body && (
                        <div className="text-muted-foreground line-clamp-2 mt-0.5">
                          {n.body}
                        </div>
                      )}
                      <div className="text-xs text-muted-foreground mt-1">
                        {formatDate(n.createdAt)}
                      </div>
                    </div>
                    {!n.isRead && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-xs h-7 px-2"
                        onClick={() => handleMarkOne(n.id)}
                        disabled={markRead.isPending}
                        data-testid={`button-mark-read-${n.id}`}
                      >
                        Mark read
                      </Button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </ScrollArea>

        <div className="px-4 py-2 border-t text-center">
          <Link href="/notifications">
            <Button
              variant="link"
              size="sm"
              className="h-auto p-0"
              data-testid="link-view-all-notifications"
            >
              View all notifications
            </Button>
          </Link>
        </div>
      </PopoverContent>
    </Popover>
  );
}
