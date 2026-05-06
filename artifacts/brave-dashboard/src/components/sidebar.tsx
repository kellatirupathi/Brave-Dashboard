import { useAuth } from "@workspace/replit-auth-web";
import {
  useGetMyTeam,
  getGetMyTeamQueryKey,
} from "@workspace/api-client-react";
import { Link, useLocation } from "wouter";
import { useEffect, useRef, useState, type ComponentType } from "react";
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
  BookOpenCheck,
  Activity,
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

// A leaf nav entry has an href; a group has children (each child is a leaf).
type NavLeaf = {
  name: string;
  href: string;
  icon: ComponentType<{ className?: string }>;
};
type NavGroup = {
  name: string;
  icon: ComponentType<{ className?: string }>;
  children: NavLeaf[];
};
type NavItem = NavLeaf | NavGroup;

function isGroup(item: NavItem): item is NavGroup {
  return (item as NavGroup).children !== undefined;
}

/**
 * Group flyout: opens on hover OR click, anchored to the right of the
 * parent menu item. Click-opened state stays sticky until the user clicks
 * outside; hover-opened state closes when the cursor leaves both the
 * trigger and the flyout.
 */
function GroupFlyout({
  group,
  isActive,
  childActive,
  currentLocation,
  onNavigate,
}: {
  group: NavGroup;
  isActive: boolean;
  childActive: boolean;
  currentLocation: string;
  onNavigate?: () => void;
}) {
  const Icon = group.icon;
  const [hoverOpen, setHoverOpen] = useState(false);
  const [clickOpen, setClickOpen] = useState(false);
  const open = hoverOpen || clickOpen;
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Close click-opened flyout when clicking anywhere outside it.
  useEffect(() => {
    if (!clickOpen) return;
    function onDocClick(e: MouseEvent) {
      const target = e.target as HTMLElement | null;
      if (!target?.closest("[data-sidebar-group='" + group.name + "']")) {
        setClickOpen(false);
      }
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [clickOpen, group.name]);

  const cancelClose = () => {
    if (closeTimer.current) {
      clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  };
  const scheduleClose = () => {
    cancelClose();
    closeTimer.current = setTimeout(() => setHoverOpen(false), 150);
  };

  return (
    <div
      data-sidebar-group={group.name}
      className="relative"
      onMouseEnter={() => {
        cancelClose();
        setHoverOpen(true);
      }}
      onMouseLeave={scheduleClose}
    >
      <button
        type="button"
        onClick={() => setClickOpen((v) => !v)}
        className={cn(
          "w-full flex items-center justify-between gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-all duration-200 cursor-pointer",
          isActive || childActive
            ? "bg-sidebar-primary text-sidebar-primary-foreground shadow-sm"
            : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
        )}
        data-testid={`sidebar-group-${group.name}`}
      >
        <span className="flex items-center gap-3">
          <Icon className="w-4 h-4" />
          {group.name}
        </span>
        <ChevronRight
          className={cn(
            "w-4 h-4 transition-transform",
            open && "translate-x-0.5",
          )}
        />
      </button>

      {open && (
        <div
          className="absolute left-full top-0 ml-2 z-50 min-w-[200px] rounded-md border border-sidebar-border bg-sidebar shadow-lg p-1"
          onMouseEnter={cancelClose}
          onMouseLeave={scheduleClose}
        >
          {group.children.map((child) => {
            const ChildIcon = child.icon;
            const active =
              currentLocation === child.href ||
              currentLocation.startsWith(child.href + "/");
            return (
              <Link
                key={child.name}
                href={child.href}
                onClick={() => {
                  setClickOpen(false);
                  setHoverOpen(false);
                  onNavigate?.();
                }}
              >
                <span
                  className={cn(
                    "flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium cursor-pointer",
                    active
                      ? "bg-sidebar-primary text-sidebar-primary-foreground"
                      : "text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                  )}
                  data-testid={`sidebar-child-${child.name}`}
                >
                  <ChildIcon className="w-4 h-4" />
                  {child.name}
                </span>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

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
          { name: "Weekly Journal", href: "/journal", icon: BookOpenCheck },
          { name: "Demo Day", href: "/demo-day", icon: FileText },
        ]
      : [
          { name: "Get started", href: "/get-started", icon: Users },
          { name: "Leaderboard", href: "/leaderboard", icon: Trophy },
        ],
    coordinator: [
      { name: "Dashboard", href: "/coordinator", icon: LayoutDashboard },
      { name: "Review Queue", href: "/coordinator/queue", icon: CheckSquare },
      { name: "Teams", href: "/coordinator/teams", icon: Users },
      { name: "Projects", href: "/coordinator/projects", icon: FolderKanban },
      { name: "Leaderboard", href: "/coordinator/leaderboard", icon: Trophy },
      { name: "Heatmap", href: "/coordinator/heatmap", icon: Activity },
      { name: "Journals", href: "/coordinator/journals", icon: BookOpenCheck },
      {
        name: "Announcements",
        href: "/coordinator/announcements",
        icon: Megaphone,
      },
    ],
    admin: [
      { name: "Dashboard", href: "/admin", icon: LayoutDashboard },
      { name: "Review Queue", href: "/admin/queue", icon: CheckSquare },
      {
        name: "Programme",
        icon: Users,
        children: [
          { name: "Teams", href: "/admin/teams", icon: Users },
          { name: "Projects", href: "/admin/projects", icon: FolderKanban },
          { name: "Roster", href: "/admin/roster", icon: ClipboardList },
        ],
      },
      {
        name: "Performance",
        icon: Trophy,
        children: [
          { name: "Leaderboard", href: "/admin/leaderboard", icon: Trophy },
          { name: "Heatmap", href: "/admin/heatmap", icon: Activity },
          { name: "Journals", href: "/admin/journals", icon: BookOpenCheck },
        ],
      },
      { name: "Demo Day", href: "/admin/demo-day", icon: FileText },
      {
        name: "Setup",
        icon: Building2,
        children: [
          { name: "Campuses", href: "/admin/campuses", icon: Building2 },
          { name: "Users", href: "/admin/users", icon: Users },
        ],
      },
      {
        name: "Communications",
        icon: Megaphone,
        children: [
          {
            name: "Announcements",
            href: "/admin/announcements",
            icon: Megaphone,
          },
          { name: "Audit Log", href: "/admin/audit-log", icon: ClipboardList },
        ],
      },
      { name: "Config", href: "/admin/config", icon: Settings },
    ],
  };

  const items = (navItems[role as keyof typeof navItems] || []) as NavItem[];

  return (
    <>
      <div className="flex h-full flex-col text-sidebar-foreground">
        <div className="p-6">
          <BraveLogo className="text-2xl" />
          <p className="text-xs text-sidebar-foreground/60 uppercase tracking-widest mt-2">
            Dashboard
          </p>
        </div>

        <nav className="flex-1 px-4 space-y-1 overflow-y-auto overflow-x-visible py-4">
          {items.map((item) => {
            // Group: render the hover/click flyout instead of a direct link.
            if (isGroup(item)) {
              const childActive = item.children.some(
                (c) => location === c.href || location.startsWith(c.href + "/"),
              );
              return (
                <GroupFlyout
                  key={item.name}
                  group={item}
                  isActive={false}
                  childActive={childActive}
                  currentLocation={location}
                  onNavigate={onNavigate}
                />
              );
            }

            // Leaf item — same behavior as before.
            const leaf = item;
            const Icon = leaf.icon;
            const leafItems = items.filter((i): i is NavLeaf => !isGroup(i));
            const isExactOnly = leafItems.some(
              (other) =>
                other.href !== leaf.href &&
                other.href.startsWith(
                  leaf.href === "/" ? "/" : leaf.href + "/",
                ),
            );
            const isActive = isExactOnly
              ? location === leaf.href
              : location === leaf.href || location.startsWith(leaf.href + "/");

            return (
              <Link key={leaf.name} href={leaf.href} onClick={onNavigate}>
                <span
                  className={cn(
                    "flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-all duration-200 cursor-pointer",
                    isActive
                      ? "bg-sidebar-primary text-sidebar-primary-foreground shadow-sm"
                      : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                  )}
                >
                  <Icon className="w-4 h-4" />
                  {leaf.name}
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
