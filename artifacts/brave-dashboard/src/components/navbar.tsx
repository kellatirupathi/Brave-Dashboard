import { useAuth } from "@workspace/replit-auth-web";
import { Link, useLocation } from "wouter";
import { Bell, Mail, LogOut } from "lucide-react";
import { Button } from "./ui/button";
import { useListMyInvitations, useListNotifications } from "@workspace/api-client-react";

type NavLink = { href: string; label: string };

const STUDENT_LINKS_WITH_TEAM: NavLink[] = [
  { href: "/", label: "Dashboard" },
  { href: "/team", label: "My Team" },
  { href: "/projects", label: "Projects" },
  { href: "/leaderboard", label: "Leaderboard" },
  { href: "/demo-day", label: "Demo Day" },
];

const STUDENT_LINKS_NO_TEAM: NavLink[] = [
  { href: "/get-started", label: "Get Started" },
  { href: "/browse-teams", label: "Browse Teams" },
  { href: "/join", label: "Join with Code" },
  { href: "/leaderboard", label: "Leaderboard" },
];

const COORDINATOR_LINKS: NavLink[] = [
  { href: "/coordinator", label: "Dashboard" },
  { href: "/coordinator/teams", label: "Teams" },
  { href: "/coordinator/leaderboard", label: "Leaderboard" },
  { href: "/coordinator/announcements", label: "Announcements" },
];

const ADMIN_LINKS: NavLink[] = [
  { href: "/admin", label: "Dashboard" },
  { href: "/admin/queue", label: "Queue" },
  { href: "/admin/teams", label: "Teams" },
  { href: "/admin/users", label: "Users" },
  { href: "/admin/roster", label: "Roster" },
  { href: "/admin/campuses", label: "Campuses" },
  { href: "/admin/leaderboard", label: "Leaderboard" },
  { href: "/admin/demo-day", label: "Demo Day" },
  { href: "/admin/audit-log", label: "Audit Log" },
  { href: "/admin/config", label: "Config" },
];

export function Navbar() {
  const { user } = useAuth();
  const [location] = useLocation();
  const isStudent = user?.role === "student";
  const { data: invitations } = useListMyInvitations({ query: { enabled: !!isStudent } });
  const { data: notifications } = useListNotifications({}, { query: { enabled: !!isStudent } });
  const pendingInvites = invitations?.filter((i) => i.status === "pending").length ?? 0;
  const unreadNotifications = notifications?.filter((n) => !n.isRead).length ?? 0;

  if (!user) return null;

  const links: NavLink[] =
    user.role === "admin"
      ? ADMIN_LINKS
      : user.role === "coordinator"
      ? COORDINATOR_LINKS
      : user.teamId
      ? STUDENT_LINKS_WITH_TEAM
      : STUDENT_LINKS_NO_TEAM;

  const isActive = (href: string) =>
    href === "/" ? location === "/" : location === href || location.startsWith(href + "/");

  return (
    <header className="h-16 border-b bg-card flex items-center justify-between px-6 sticky top-0 z-10">
      <nav className="flex items-center gap-1 overflow-x-auto">
        <span className="font-bold text-lg mr-4 whitespace-nowrap">BRAVE</span>
        {links.map((link) => (
          <Link key={link.href} href={link.href}>
            <Button
              variant={isActive(link.href) ? "secondary" : "ghost"}
              size="sm"
              className="cursor-pointer whitespace-nowrap"
              data-testid={`nav-link-${link.label.toLowerCase().replace(/\s+/g, "-")}`}
            >
              {link.label}
            </Button>
          </Link>
        ))}
      </nav>
      <div className="flex items-center gap-2">
        <span className="text-sm text-muted-foreground hidden sm:inline">
          {user.firstName || user.email}{" "}
          <span className="opacity-60">({user.role})</span>
        </span>
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
        <a href="/api/logout">
          <Button variant="ghost" size="icon" className="cursor-pointer" data-testid="button-logout" title="Sign out">
            <LogOut className="w-5 h-5 text-muted-foreground" />
          </Button>
        </a>
      </div>
    </header>
  );
}
