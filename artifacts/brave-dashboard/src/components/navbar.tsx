import { useAuth } from "@workspace/replit-auth-web";
import { Link } from "wouter";
import { Bell, Mail } from "lucide-react";
import { Button } from "./ui/button";
import { useListMyInvitations, useListNotifications } from "@workspace/api-client-react";

export function Navbar() {
  const { user } = useAuth();
  const isStudent = user?.role === "student";
  const { data: invitations } = useListMyInvitations({ query: { enabled: !!isStudent } });
  const { data: notifications } = useListNotifications({}, { query: { enabled: !!isStudent } });
  const pendingInvites = invitations?.filter((i) => i.status === "pending").length ?? 0;
  const unreadNotifications = notifications?.filter((n) => !n.isRead).length ?? 0;

  if (!user) return null;

  return (
    <header className="h-16 border-b bg-card flex items-center justify-between px-6 sticky top-0 z-10">
      <div className="flex items-center gap-4" />
      <div className="flex items-center gap-2">
        {isStudent && (
          <Link href="/invitations">
            <Button variant="ghost" size="icon" className="relative cursor-pointer" data-testid="button-invitations-bell">
              <Mail className="w-5 h-5 text-muted-foreground" />
              {pendingInvites > 0 && (
                <span className="absolute top-1 right-1 inline-flex h-4 min-w-[16px] items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground px-1" data-testid="badge-invitations-count">
                  {pendingInvites}
                </span>
              )}
            </Button>
          </Link>
        )}
        {isStudent && (
          <Link href="/notifications">
            <Button variant="ghost" size="icon" className="relative cursor-pointer" data-testid="button-notifications-bell">
              <Bell className="w-5 h-5 text-muted-foreground" />
              {unreadNotifications > 0 && (
                <span className="absolute top-1 right-1 inline-flex h-4 min-w-[16px] items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground px-1">
                  {unreadNotifications}
                </span>
              )}
            </Button>
          </Link>
        )}
      </div>
    </header>
  );
}
