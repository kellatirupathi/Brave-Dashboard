// Native app header (additive, isolated).
//
// The web layout puts a hamburger on the left and the wordmark in the middle —
// correct for a browser, wrong for an installed app. Android apps title the
// SCREEN you are on, and offer a back arrow when you have navigated into
// something rather than a menu that duplicates the bottom bar.
//
// So inside the native shell the header becomes:
//   - a back arrow on any screen below the top level
//   - the current screen's name, left-aligned, as Material specifies
//   - nothing else; every destination lives in the bottom bar
//
// WEB IS UNTOUCHED. Renders null unless running natively, so the browser keeps
// its hamburger and wordmark exactly as before.
//
// Deleting this file means removing its one tag in layout.tsx.
import { useEffect, useRef, useState } from "react";
import { Link, useLocation } from "wouter";
import { ArrowLeft, LogOut, User } from "lucide-react";
import { useAuth } from "@workspace/replit-auth-web";
import { NotificationsBell } from "@/components/notifications-bell";
import { isNativeApp, signOut } from "@/lib/native-auth";
import { cn } from "@/lib/utils";

/**
 * Screen title for a path, and whether it is a top-level destination.
 *
 * Top-level screens are the ones reachable from the bottom bar; everything
 * else is somewhere you drilled into and therefore gets a back arrow.
 */
function describe(path: string): { title: string; topLevel: boolean } {
  const map: Array<[RegExp, string, boolean]> = [
    [/^\/$/, "Dashboard", true],
    [/^\/journal/, "Weekly Journal", true],
    [/^\/leads\/\d+\/delivery/, "Delivery & payment", false],
    [/^\/leads\/\d+\/project/, "Define the project", false],
    [/^\/leads\/\d+/, "Lead", false],
    [/^\/leads/, "Leads", true],
    [/^\/projects\/\d+/, "Project", false],
    [/^\/projects/, "Projects", true],
    [/^\/leaderboard/, "Leaderboard", false],
    [/^\/get-started/, "Get started", false],
    [/^\/browse-teams/, "Browse teams", false],
    [/^\/invitations/, "Team invitations", false],
    [/^\/vote-peoples-choice/, "People's Choice", false],
    [/^\/grit-miles/, "GRIT Miles", false],
    [/^\/demo-day/, "Demo Day", false],
    [/^\/finale/, "Finale", false],
    [/^\/team/, "My Team", false],
    [/^\/resources-library/, "Resources", false],
    [/^\/assistant/, "BRAVE Assistant", false],
    // Reached from the More sheet, not the bottom bar, so it is a drill-down
    // and gets a back arrow like any other.
    [/^\/profile/, "Profile", false],
    [/^\/notifications/, "Notifications", false],
    [/^\/get-app/, "Get the app", false],
  ];
  for (const [re, title, topLevel] of map) {
    if (re.test(path)) return { title, topLevel };
  }
  return { title: "BRAVE", topLevel: true };
}

export function AppHeader() {
  const [location] = useLocation();
  const { user, logout } = useAuth();
  // Elevation appears only once the page has scrolled, the way a Material
  // top app bar does — flat at rest, raised over content.
  const [scrolled, setScrolled] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const profileRef = useRef<HTMLDivElement | null>(null);
  const native = isNativeApp();
  // A student's navigation below `lg` is the bottom bar, so their top bar is
  // free to be a real app bar: the screen's name, notifications, and their
  // own face. Staff keep the wordmark-and-hamburger header in layout.tsx,
  // because the drawer IS their navigation at that width.
  const isStudent = user?.role === "student";

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 4);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    setProfileOpen(false);
  }, [location]);

  useEffect(() => {
    if (!profileOpen) return undefined;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (target && !profileRef.current?.contains(target)) {
        setProfileOpen(false);
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [profileOpen]);

  if (!native && !isStudent) return null;

  const { title, topLevel } = describe(location);
  const initials =
    `${user?.firstName?.[0] ?? ""}${user?.lastName?.[0] ?? ""}`.trim() || "?";

  return (
    <header
      data-testid="app-header"
      className={cn(
        "sticky top-0 z-30 flex items-center gap-1 bg-sidebar px-2 text-sidebar-foreground",
        "transition-shadow",
        // Native draws it on every width; on the web it is a phone/tablet
        // affordance and the desktop sidebar takes over at `lg`.
        !native && "lg:hidden",
        scrolled && "shadow-md",
      )}
      style={{
        // The status bar is ours to paint in an installed app.
        paddingTop: "var(--safe-area-inset-top, 0px)",
        height: "calc(3.5rem + var(--safe-area-inset-top, 0px))",
      }}
    >
      {!isStudent && !topLevel && (
        <button
          type="button"
          onClick={() => window.history.back()}
          aria-label="Back"
          data-testid="button-app-back"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full active:bg-sidebar-accent"
        >
          <ArrowLeft className="h-5 w-5" aria-hidden="true" />
        </button>
      )}
      <h1
        className={cn(
          "min-w-0 flex-1 truncate text-[17px] font-bold tracking-tight",
          topLevel || isStudent ? "px-2" : "px-1",
        )}
      >
        {title}
      </h1>

      {/* Notifications + profile. Both already exist elsewhere; this is the
          phone's place for them now that the wordmark no longer occupies the
          bar. The wrapper recolours the bell's icon for a dark surface. */}
      {isStudent && (
        <div className="flex shrink-0 items-center gap-0.5 pr-1 [&_button]:text-sidebar-foreground [&_button:hover]:bg-sidebar-accent">
          <NotificationsBell mobile />
          <div ref={profileRef} className="relative">
            <button
              type="button"
              onClick={() => setProfileOpen((open) => !open)}
              aria-label="Open profile menu"
              aria-expanded={profileOpen}
              aria-haspopup="menu"
              data-testid="button-app-header-profile"
              className="ml-0.5 flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full border border-white/25 bg-sidebar-accent text-[12px] font-bold uppercase"
            >
              {user?.profileImage ? (
                <img
                  src={user.profileImage}
                  alt=""
                  className="h-full w-full object-cover"
                />
              ) : (
                initials
              )}
            </button>
            {profileOpen && (
              <div
                role="menu"
                aria-label="Profile menu"
                data-testid="menu-app-header-profile"
                className="absolute right-0 top-[calc(100%+0.5rem)] z-50 w-40 overflow-hidden rounded-xl border border-sidebar-border bg-white py-1 text-sm text-[#2B090C] shadow-xl"
              >
                <Link
                  href="/profile"
                  role="menuitem"
                  onClick={() => setProfileOpen(false)}
                  className="flex items-center gap-2.5 px-3 py-2.5 font-medium hover:bg-[#FFF5F5]"
                  data-testid="link-app-header-profile-page"
                >
                  <User className="h-4 w-4 text-[#6B4F47]" aria-hidden="true" />
                  Profile
                </Link>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => void signOut(logout)}
                  className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left font-medium !text-[#D4402F] hover:!bg-[#FFF5F5] hover:!text-[#D4402F]"
                  data-testid="button-app-header-logout"
                >
                  <LogOut className="h-4 w-4" aria-hidden="true" />
                  Logout
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </header>
  );
}
