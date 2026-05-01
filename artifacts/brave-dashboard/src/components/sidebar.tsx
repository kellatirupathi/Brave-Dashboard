import { useAuth } from "@workspace/replit-auth-web";
import {
  useGetMyTeam,
  getGetMyTeamQueryKey,
} from "@workspace/api-client-react";
import { Link, useLocation } from "wouter";
import { useState } from "react";
import {
  LayoutDashboard,
  Trophy,
  Users,
  Megaphone,
  ClipboardList,
  Building2,
  Settings,
  FolderKanban,
  FileText,
  LogOut,
  CheckSquare,
  UserCog,
  ChevronRight,
  KeyRound,
} from "lucide-react";
import { ChangePasswordDialog } from "@/components/change-password-dialog";
import { cn } from "@/lib/utils";
import { BraveLogo } from "./brave-logo";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "./ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";

/**
 * Sidebar contents (header, nav links, profile menu) without any outer
 * shell/width. Used both inside the desktop fixed column and inside the
 * mobile Sheet drawer. Pass `onNavigate` so mobile callers can close the
 * drawer when a link is clicked.
 */
export function SidebarBody({ onNavigate }: { onNavigate?: () => void } = {}) {
  const { user, logout } = useAuth();
  const [location] = useLocation();
  const [showLogoutDialog, setShowLogoutDialog] = useState(false);
  const [showChangePasswordDialog, setShowChangePasswordDialog] =
    useState(false);
  // hasPassword is appended by the API when the account has a password_hash.
  // It is not yet declared on the generated AuthUser type — read defensively.
  const hasPassword = !!(user as unknown as { hasPassword?: boolean })
    ?.hasPassword;
  // Source of truth for "does this student have a team?" is the live
  // useGetMyTeam query — it's already invalidated after every team
  // membership mutation (create, join, leave, etc.), so the sidebar
  // updates instantly without needing a logout/login round-trip.
  // Skipped for non-students to avoid an unnecessary 404 request.
  // While the live query is loading (e.g. on page reload) we fall back
  // to user.teamId from the auth cache so the menu doesn't flash from
  // "Get started" to the full student menu for users who already have
  // a team.
  const { data: myTeam, isLoading: teamLoading } = useGetMyTeam({
    query: {
      queryKey: getGetMyTeamQueryKey(),
      retry: false,
      enabled: user?.role === "student",
    },
  });
  const hasTeam = teamLoading ? !!user?.teamId : !!myTeam;

  if (!user) return null;

  const role = user.role;

  const navItems = {
    student: hasTeam
      ? [
          { name: "Dashboard", href: "/", icon: LayoutDashboard },
          { name: "Projects", href: "/projects", icon: FolderKanban },
          { name: "Leaderboard", href: "/leaderboard", icon: Trophy },
          { name: "My Team", href: "/team", icon: Users },
          { name: "Demo Day", href: "/demo-day", icon: FileText },
        ]
      : [
          { name: "Get started", href: "/get-started", icon: Users },
          { name: "Leaderboard", href: "/leaderboard", icon: Trophy },
        ],
    coordinator: [
      { name: "Dashboard", href: "/coordinator", icon: LayoutDashboard },
      { name: "Teams", href: "/coordinator/teams", icon: Users },
      { name: "Projects", href: "/coordinator/projects", icon: FolderKanban },
      { name: "Leaderboard", href: "/coordinator/leaderboard", icon: Trophy },
      {
        name: "Announcements",
        href: "/coordinator/announcements",
        icon: Megaphone,
      },
    ],
    admin: [
      { name: "Dashboard", href: "/admin", icon: LayoutDashboard },
      { name: "Review Queue", href: "/admin/queue", icon: CheckSquare },
      { name: "Teams", href: "/admin/teams", icon: Users },
      { name: "Projects", href: "/admin/projects", icon: FolderKanban },
      { name: "Leaderboard", href: "/admin/leaderboard", icon: Trophy },
      { name: "Demo Day", href: "/admin/demo-day", icon: FileText },
      { name: "Campuses", href: "/admin/campuses", icon: Building2 },
      { name: "Users", href: "/admin/users", icon: Users },
      { name: "Roster", href: "/admin/roster", icon: ClipboardList },
      { name: "Announcements", href: "/admin/announcements", icon: Megaphone },
      { name: "Config", href: "/admin/config", icon: Settings },
      { name: "Audit Log", href: "/admin/audit-log", icon: ClipboardList },
    ],
  };

  const items = navItems[role as keyof typeof navItems] || [];

  return (
    <>
      <div className="flex h-full flex-col text-sidebar-foreground">
        <div className="p-6">
          <BraveLogo className="text-2xl" />
          <p className="text-xs text-sidebar-foreground/60 uppercase tracking-widest mt-2">
            Dashboard
          </p>
        </div>

        <nav className="flex-1 px-4 space-y-1 overflow-y-auto py-4">
          {items.map((item) => {
            const Icon = item.icon;
            const isExactOnly = items.some(
              (other) =>
                other.href !== item.href &&
                other.href.startsWith(
                  item.href === "/" ? "/" : item.href + "/",
                ),
            );
            const isActive = isExactOnly
              ? location === item.href
              : location === item.href || location.startsWith(item.href + "/");

            return (
              <Link key={item.name} href={item.href} onClick={onNavigate}>
                <span
                  className={cn(
                    "flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-all duration-200 cursor-pointer",
                    isActive
                      ? "bg-sidebar-primary text-sidebar-primary-foreground shadow-sm"
                      : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                  )}
                >
                  <Icon className="w-4 h-4" />
                  {item.name}
                </span>
              </Link>
            );
          })}
        </nav>

        <div className="p-4 border-t border-sidebar-border">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="w-full flex items-center gap-3 px-3 py-3 rounded-md text-left transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring"
                data-testid="button-sidebar-profile-menu"
                aria-label="Open profile menu"
              >
                {user.profileImage ? (
                  <img
                    src={user.profileImage}
                    alt=""
                    className="w-8 h-8 rounded-full"
                  />
                ) : (
                  <div className="w-8 h-8 rounded-full bg-sidebar-primary/20 text-sidebar-primary flex items-center justify-center text-sm font-bold">
                    {user.firstName?.[0]}
                    {user.lastName?.[0]}
                  </div>
                )}
                <div className="flex-1 overflow-hidden">
                  <p className="text-sm font-medium truncate">
                    {user.firstName} {user.lastName}
                  </p>
                  <p className="text-xs text-sidebar-foreground/50 truncate capitalize">
                    {user.role}
                  </p>
                </div>
                <ChevronRight className="w-4 h-4 text-sidebar-foreground/40" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              side="right"
              align="end"
              className="w-48"
              data-testid="menu-sidebar-profile"
            >
              <DropdownMenuItem asChild data-testid="menu-item-edit-profile">
                <Link href="/profile" onClick={onNavigate}>
                  <UserCog className="w-4 h-4 mr-2" />
                  Edit profile
                </Link>
              </DropdownMenuItem>
              {hasPassword && (
                <DropdownMenuItem
                  onSelect={(e) => {
                    e.preventDefault();
                    setShowChangePasswordDialog(true);
                  }}
                  data-testid="menu-item-change-password"
                >
                  <KeyRound className="w-4 h-4 mr-2" />
                  Change password
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onSelect={(e) => {
                  e.preventDefault();
                  setShowLogoutDialog(true);
                }}
                className="text-destructive focus:text-destructive focus:bg-destructive/10"
                data-testid="menu-item-logout"
              >
                <LogOut className="w-4 h-4 mr-2" />
                Logout
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <ChangePasswordDialog
        open={showChangePasswordDialog}
        onOpenChange={setShowChangePasswordDialog}
        mode={{ kind: "self" }}
      />

      <AlertDialog open={showLogoutDialog} onOpenChange={setShowLogoutDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Log out?</AlertDialogTitle>
            <AlertDialogDescription>
              You will be signed out of the BRAVE Dashboard and redirected to
              the login page.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => logout()}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Log out
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

/**
 * Desktop sidebar column. Hidden below the lg breakpoint — at <1024px the
 * Layout renders a top bar + Sheet drawer instead.
 */
export function Sidebar() {
  return (
    <div className="hidden lg:flex w-64 bg-sidebar border-r border-sidebar-border h-screen sticky top-0 flex-col">
      <SidebarBody />
    </div>
  );
}
