import { useAuth } from "@workspace/replit-auth-web";
import { signOut } from "@/lib/native-auth";
import { IntroVideoDialog } from "@/components/intro-video-dialog";
import { PlayCircle } from "lucide-react";
import {
  useGetMyTeam,
  getGetMyTeamQueryKey,
} from "@workspace/api-client-react";
import { useQuery } from "@tanstack/react-query";
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
  Handshake,
  Award,
  LogOut,
  CheckSquare,
  UserCog,
  ChevronRight,
  KeyRound,
  BookOpenCheck,
  Activity,
  BookOpen,
  BarChart3,
  FileBarChart,
  MessageSquare,
  Clapperboard,
  Bell,
  UserCheck,
  UserPlus,
  GraduationCap,
  ExternalLink,
  Rocket,
  Sparkles,
  Inbox,
  Vote,
  Lock,
} from "lucide-react";

import { ChangePasswordDialog } from "@/components/change-password-dialog";
import { useMyAdminAccess, isHidden } from "@/lib/admin-access";
import { getStudentGritConfig } from "@/lib/grit-config-api";
import { getFinaleMe } from "@/lib/finale-api";
import { cn } from "@/lib/utils";
import { useSeason } from "@/lib/season-context";
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
  // When true, the link opens in a new browser tab (full page load) instead of
  // an in-app route — used for the standalone Guidebook page.
  newTab?: boolean;
  // When true, render a small shining "NEW" badge to draw attention to a newly
  // launched section (e.g. GRIT Miles, Demo Day).
  isNew?: boolean;
  // Which write capability this section needs. When the viewed season is a
  // read-only archive and that capability is not re-opened, the entry gets a
  // padlock. The page itself stays reachable — students should still be able
  // to READ their archived work, which is the whole point of keeping it.
  writes?: "journal" | "revenue" | "project";
};
type NavGroup = {
  name: string;
  icon: ComponentType<{ className?: string }>;
  children: NavLeaf[];
  // Same shining "NEW" badge as a leaf — drawn on the group trigger.
  isNew?: boolean;
};
type NavItem = NavLeaf | NavGroup;

function isGroup(item: NavItem): item is NavGroup {
  return (item as NavGroup).children !== undefined;
}

/**
 * Padlock shown beside a nav entry whose section is read-only in the season
 * being viewed. Deliberately not a disabled link: the page still opens, it
 * just cannot be written to, and the server enforces that independently.
 */
function ArchiveLock({ name }: { name: string }) {
  return (
    <span
      title="Read-only in this season"
      aria-label="Read-only in this season"
      data-testid={`sidebar-archive-lock-${name}`}
      className="inline-flex shrink-0"
    >
      <Lock className="h-3 w-3 opacity-50" aria-hidden="true" />
    </span>
  );
}

/** The shining "NEW" badge shared by leaf links and group triggers. */
function NewBadge({ name }: { name: string }) {
  return (
    <span
      className="inline-flex items-center gap-0.5 rounded-full bg-amber-400 px-1.5 py-0.5 text-[10px] font-bold uppercase leading-none tracking-wide text-amber-950 shadow-sm animate-pulse"
      data-testid={`sidebar-new-badge-${name}`}
    >
      <Sparkles className="h-2.5 w-2.5" />
      New
    </span>
  );
}

/**
 * Group flyout: opens on hover OR click. Built on Radix DropdownMenu so the
 * panel renders into a portal — escapes the sidebar's overflow boundary and
 * floats over page content. Hover closes after a short delay (so cursor can
 * travel from trigger to panel without flicker).
 */
function GroupFlyout({
  group,
  childActive,
  currentLocation,
  onNavigate,
}: {
  group: NavGroup;
  childActive: boolean;
  currentLocation: string;
  onNavigate?: () => void;
}) {
  const Icon = group.icon;
  const [open, setOpen] = useState(false);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cancelClose = () => {
    if (closeTimer.current) {
      clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  };
  const scheduleClose = () => {
    cancelClose();
    closeTimer.current = setTimeout(() => setOpen(false), 200);
  };

  return (
    <DropdownMenu open={open} onOpenChange={setOpen} modal={false}>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          onMouseEnter={() => {
            cancelClose();
            setOpen(true);
          }}
          onMouseLeave={scheduleClose}
          className={cn(
            "w-full flex items-center justify-between gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-all duration-200 cursor-pointer",
            childActive
              ? "bg-sidebar-primary text-sidebar-primary-foreground shadow-sm"
              : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
          )}
          data-testid={`sidebar-group-${group.name}`}
        >
          <span className="flex items-center gap-3">
            <Icon className="w-4 h-4" />
            {group.name}
          </span>
          <span className="flex items-center gap-1.5">
            {group.isNew && <NewBadge name={group.name} />}
            <ChevronRight
              className={cn(
                "w-4 h-4 transition-transform",
                open && "translate-x-0.5",
              )}
            />
          </span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        side="right"
        align="start"
        sideOffset={8}
        className="min-w-[200px]"
        onMouseEnter={cancelClose}
        onMouseLeave={scheduleClose}
        // Don't grab focus when the panel opens — focus stealing causes the
        // trigger to lose its hover state, which closes/re-opens the panel.
        // onOpenAutoFocus is supported by the underlying Radix Menu content
        // at runtime but is not in DropdownMenuContent's public prop types,
        // so it's passed via a typed-as-any spread.
        {...({
          onOpenAutoFocus: (e: Event) => e.preventDefault(),
        } as Record<string, unknown>)}
        onCloseAutoFocus={(e) => e.preventDefault()}
      >
        {group.children.map((child) => {
          const ChildIcon = child.icon;
          const active =
            currentLocation === child.href ||
            currentLocation.startsWith(child.href + "/");
          return (
            <DropdownMenuItem
              key={child.name}
              asChild
              className={cn(
                "cursor-pointer",
                active &&
                  "bg-sidebar-primary text-sidebar-primary-foreground focus:bg-sidebar-primary focus:text-sidebar-primary-foreground",
              )}
            >
              <Link
                href={child.href}
                onClick={() => {
                  setOpen(false);
                  onNavigate?.();
                }}
                data-testid={`sidebar-child-${child.name}`}
              >
                <ChildIcon className="w-4 h-4 mr-2" />
                {child.name}
              </Link>
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * Sidebar contents (header, nav links, profile menu) without any outer
 * shell/width. Used both inside the desktop fixed column and inside the
 * mobile Sheet drawer. Pass `onNavigate` so mobile callers can close the
 * drawer when a link is clicked.
 */
/**
 * The "1.0" / "2.0" pill beside the wordmark. Shown for every role.
 *
 * Renders the previous static label until the season list resolves, so the
 * sidebar header never flickers between two different strings.
 */
function SeasonBadge() {
  const { viewing, isLoading } = useSeason();

  if (isLoading || !viewing) {
    return (
      <span className="text-[10px] text-sidebar-foreground/60 uppercase tracking-widest">
        Dashboard
      </span>
    );
  }

  const isLive = !viewing.isReadOnly;
  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        data-testid="sidebar-season-badge"
        title={
          isLive
            ? `${viewing.name} — live`
            : `${viewing.name} — read-only archive`
        }
        className={cn(
          "inline-flex items-center rounded-md px-1.5 py-0.5 text-[9px] font-extrabold uppercase tracking-widest leading-none",
          isLive
            ? "bg-sidebar-primary text-sidebar-primary-foreground"
            : "border border-sidebar-foreground/30 text-sidebar-foreground/60",
        )}
      >
        {viewing.slug}
      </span>
      {!isLive && (
        <span className="text-[9px] uppercase tracking-widest text-sidebar-foreground/50">
          Archive
        </span>
      )}
    </span>
  );
}

export function SidebarBody({ onNavigate }: { onNavigate?: () => void } = {}) {
  const { user, logout } = useAuth();
  const [location] = useLocation();
  const [showLogoutDialog, setShowLogoutDialog] = useState(false);
  const [showChangePasswordDialog, setShowChangePasswordDialog] =
    useState(false);
  const [showIntroVideo, setShowIntroVideo] = useState(false);
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

  // Admin-controlled visibility flags for the student menu. Each of these can
  // hide a nav item, so we render NO toggleable item until they've all
  // resolved (see `configReady` below) — guessing a default either flashes an
  // item in and then yanks it away, or hides one the student should have.
  const { data: resourcesSettings, isLoading: resourcesLoading } = useQuery<{
    enabledForStudents: boolean;
  }>({
    queryKey: ["public-resources-settings"],
    queryFn: async () => {
      const res = await fetch("/api/resources-settings", {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to load resources settings");
      return res.json();
    },
    staleTime: 60_000,
    enabled: user?.role === "student",
  });
  // On error the query returns no data — fall back to visible, matching the
  // server's default-allow posture.
  const resourcesVisibleForStudent =
    resourcesSettings?.enabledForStudents ?? true;

  // Demo Day menu. Reuses the shared student-grit-config cache.
  const { data: studentGritConfig, isLoading: gritLoading } = useQuery({
    queryKey: ["student-grit-config"],
    queryFn: getStudentGritConfig,
    staleTime: 60_000,
    enabled: user?.role === "student",
  });
  const demoDayMenuVisibleForStudent =
    studentGritConfig?.demoDayMenuEnabled ?? true;

  // BRAVE Finale menu: the admin must have enabled the feature AND this
  // student's team must have cleared the verified-revenue bar.
  const { data: finaleMe, isLoading: finaleLoading } = useQuery({
    queryKey: ["finale-me"],
    queryFn: getFinaleMe,
    staleTime: 60_000,
    enabled: user?.role === "student",
  });
  const finaleMenuVisibleForStudent =
    !!finaleMe?.enabled && !!finaleMe?.eligible;

  // True once every visibility flag above has settled. `isLoading` is false
  // for disabled queries, so this is only ever false for students — other
  // roles render immediately.
  const configReady = !resourcesLoading && !gritLoading && !finaleLoading;

  // Per-page admin permissions (default-allow). Enabled only for admins; the
  // query is cached and shared with ProtectedRoute. Restricted admins have
  // hidden pages filtered out of the nav below.
  const { data: adminAccess } = useMyAdminAccess(user?.role === "admin");

  // Mirrors the server-side guard, so a padlock appears exactly where a write
  // would actually be refused.
  const { canWrite, viewing } = useSeason();

  // Season 1 keeps its Projects page; from Season 2 on, a project can only
  // exist behind a converted lead, so the pipeline entry replaces it. Keyed on
  // the season NUMBER rather than a feature flag because the two flows are
  // genuinely different products, and Season 1's must never change.
  const usesLeadPipeline = !!viewing && viewing.slug !== "1.0";

  if (!user) return null;

  const role = user.role;
  // Role documentation: one public page per role per season, so the link
  // follows the season currently being viewed (falls back to the live one).
  const docsHref = `/docs/${role}/${encodeURIComponent(viewing?.slug ?? "2.0")}`;

  const navItems = {
    student: hasTeam
      ? [
          { name: "Dashboard", href: "/", icon: LayoutDashboard },
          {
            name: "Weekly Journal",
            href: "/journal",
            icon: BookOpenCheck,
            writes: "journal",
          },
          usesLeadPipeline
            ? {
                name: "Leads",
                href: "/leads",
                icon: Handshake,
                writes: "project",
                isNew: true,
              }
            : {
                name: "Projects",
                href: "/projects",
                icon: FolderKanban,
                writes: "revenue",
              },
          { name: "Leaderboard", href: "/leaderboard", icon: Trophy },
          {
            name: "GRIT Miles",
            href: "/grit-miles",
            icon: Award,
            isNew: true,
          },
          ...(configReady && demoDayMenuVisibleForStudent
            ? [
                {
                  name: "Demo Day",
                  href: "/demo-day",
                  icon: Rocket,
                  isNew: true,
                },
              ]
            : []),
          ...(configReady && finaleMenuVisibleForStudent
            ? [
                {
                  name: "Finale Submissions",
                  href: "/finale",
                  icon: Trophy,
                  isNew: true,
                },
              ]
            : []),
          { name: "My Team", href: "/team", icon: Users },
          // Resources entry is gated by the admin-controlled visibility flag.
          ...(configReady && resourcesVisibleForStudent
            ? [
                {
                  name: "Resources",
                  href: "/resources-library",
                  icon: BookOpen,
                },
              ]
            : []),
          // Guidebook sits at the bottom, just after Resources. Opens in a new tab.
          {
            name: "Guidebook",
            href: "/guidebook",
            icon: GraduationCap,
            newTab: true,
          },
        ]
      : [
          { name: "Get started", href: "/get-started", icon: Users },
          { name: "Leaderboard", href: "/leaderboard", icon: Trophy },
          ...(configReady && resourcesVisibleForStudent
            ? [
                {
                  name: "Resources",
                  href: "/resources-library",
                  icon: BookOpen,
                },
              ]
            : []),
          // Guidebook sits at the bottom, just after Resources. Opens in a new tab.
          {
            name: "Guidebook",
            href: "/guidebook",
            icon: GraduationCap,
            newTab: true,
          },
        ],
    coordinator: [
      { name: "Dashboard", href: "/coordinator", icon: LayoutDashboard },
      { name: "Review Queue", href: "/coordinator/queue", icon: CheckSquare },
      {
        name: "Journals Tracking",
        href: "/coordinator/journal-tracking",
        icon: BookOpenCheck,
      },
      { name: "Projects", href: "/coordinator/projects", icon: FolderKanban },
      { name: "Leaderboard", href: "/coordinator/leaderboard", icon: Trophy },
      { name: "Heatmap", href: "/coordinator/heatmap", icon: Activity },
      { name: "Journals", href: "/coordinator/journals", icon: BookOpenCheck },
      { name: "Notifications", href: "/coordinator/notifications", icon: Bell },
      {
        name: "Announcements",
        href: "/coordinator/announcements",
        icon: Megaphone,
      },
      {
        name: "Guidebook",
        href: "/guidebook",
        icon: GraduationCap,
        newTab: true,
      },
    ],
    admin: [
      { name: "Dashboard", href: "/admin", icon: LayoutDashboard },
      { name: "Review Queue", href: "/admin/queue", icon: CheckSquare },
      { name: "Team Requests", href: "/admin/team-requests", icon: UserCheck },
      {
        name: "Programme",
        icon: Users,
        children: [
          { name: "Teams", href: "/admin/teams", icon: Users },
          // Season 2 pipeline oversight: every lead from every team, with its
          // trail, project, payments and BRD state in one table.
          { name: "Leads", href: "/admin/leads", icon: Handshake },
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
      {
        name: "Submissions",
        icon: Inbox,
        isNew: true,
        children: [
          {
            name: "Finale Submissions",
            href: "/admin/finale-submissions",
            icon: Trophy,
          },
          {
            name: "Demo Day Submissions",
            href: "/admin/demo-day-submissions",
            icon: Rocket,
          },
          {
            name: "People's Choice Votes",
            href: "/admin/votes/peoples-choice-votes",
            icon: Vote,
          },
        ],
      },
      {
        name: "Setup",
        icon: Building2,
        children: [
          { name: "Campuses", href: "/admin/campuses", icon: Building2 },
          { name: "Users", href: "/admin/users", icon: Users },
          {
            name: "New Users",
            href: "/admin/new-users-requests",
            icon: UserPlus,
          },
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
          { name: "Popups", href: "/admin/popups", icon: MessageSquare },
          {
            name: "Submission Requests",
            href: "/admin/submission-requests",
            icon: Inbox,
          },
          { name: "Feedback", href: "/admin/feedback", icon: MessageSquare },
          { name: "Audit Log", href: "/admin/audit-log", icon: ClipboardList },
        ],
      },
      {
        name: "Campus Insights",
        href: "/admin/campus-insights",
        icon: BarChart3,
      },
      {
        name: "Reports",
        icon: FileBarChart,
        children: [
          {
            name: "Journal Reports",
            href: "/admin/reports",
            icon: FileBarChart,
          },
          {
            name: "Chatbot History",
            href: "/admin/chatbot-history",
            icon: MessageSquare,
          },
          {
            name: "Reels Scripts",
            href: "/admin/reels-scripts",
            icon: Clapperboard,
          },
        ],
      },
      { name: "Config", href: "/admin/config", icon: Settings },
      { name: "Resources", href: "/admin/resources", icon: BookOpen },
      {
        name: "Guidebook",
        href: "/guidebook",
        icon: GraduationCap,
        newTab: true,
      },
    ],
  };

  const rawItems = (navItems[role as keyof typeof navItems] || []) as NavItem[];
  // For restricted admins, drop hidden leaves and any group left empty.
  // Super admins / default-allow admins keep the full nav (isHidden → false).
  const items: NavItem[] =
    role === "admin"
      ? rawItems
          .map((item): NavItem | null => {
            if (isGroup(item)) {
              const children = item.children.filter(
                (c) => !isHidden(adminAccess, c.href),
              );
              if (children.length === 0) return null;
              return { ...item, children };
            }
            return isHidden(adminAccess, item.href) ? null : item;
          })
          .filter((item): item is NavItem => item !== null)
      : rawItems;

  return (
    <>
      <div className="flex h-full flex-col text-sidebar-foreground">
        <div className="flex items-center gap-2 p-6">
          <BraveLogo className="text-2xl" />
          {/* Keep the viewed season immediately beside the wordmark so it is
              visible without taking a second line in the sidebar header. */}
          <SeasonBadge />
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
                  childActive={childActive}
                  currentLocation={location}
                  onNavigate={onNavigate}
                />
              );
            }

            // Leaf item — same behavior as before.
            const leaf = item;
            const Icon = leaf.icon;

            // New-tab leaf (e.g. the standalone Guidebook) — full page load in a
            // separate tab, so it opens outside the dashboard chrome.
            if (leaf.newTab) {
              const externalHref =
                import.meta.env.BASE_URL.replace(/\/+$/, "") + leaf.href;
              return (
                <a
                  key={leaf.name}
                  href={externalHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={onNavigate}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-all duration-200 cursor-pointer text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                >
                  <Icon className="w-4 h-4" />
                  {leaf.name}
                </a>
              );
            }

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
                  <span className="flex-1">{leaf.name}</span>
                  {leaf.writes && !canWrite(leaf.writes) && (
                    <ArchiveLock name={leaf.name} />
                  )}
                  {leaf.isNew && <NewBadge name={leaf.name} />}
                </span>
              </Link>
            );
          })}
        </nav>

        {role === "student" && (
          <div className="px-4 pb-2">
            <button
              type="button"
              onClick={() => setShowIntroVideo(true)}
              className="w-full flex items-center gap-2 px-3 py-2 rounded-md text-xs text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent transition-colors"
              data-testid="button-sidebar-intro-video"
            >
              <PlayCircle className="w-3.5 h-3.5" />
              Watch intro video
            </button>

            <a
              href={docsHref}
              target="_blank"
              rel="noopener noreferrer"
              onClick={onNavigate}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-all duration-200 cursor-pointer text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
              data-testid="link-sidebar-documentation"
            >
              <BookOpen className="w-4 h-4" />
              <span className="flex-1">Documentation</span>
              <ExternalLink className="w-4 h-4 opacity-70" />
            </a>
          </div>
        )}

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
              {(role === "admin" || role === "coordinator") && (
                <DropdownMenuItem asChild data-testid="menu-item-documentation">
                  <a
                    href={docsHref}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={onNavigate}
                  >
                    <BookOpen className="w-4 h-4 mr-2" />
                    Documentation
                  </a>
                </DropdownMenuItem>
              )}
              {role === "admin" && (
                <DropdownMenuItem
                  asChild
                  data-testid="menu-item-admin-notifications"
                >
                  <Link href="/admin/notifications" onClick={onNavigate}>
                    <Bell className="w-4 h-4 mr-2" />
                    Notifications
                  </Link>
                </DropdownMenuItem>
              )}
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

      <IntroVideoDialog
        open={showIntroVideo}
        onClose={() => setShowIntroVideo(false)}
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
              onClick={() => void signOut(logout)}
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
