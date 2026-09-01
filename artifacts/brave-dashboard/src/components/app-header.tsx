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
import { useEffect, useState } from "react";
import { Link, useLocation } from "wouter";
import { ArrowLeft } from "lucide-react";
import { useAuth } from "@workspace/replit-auth-web";
import { NotificationsBell } from "@/components/notifications-bell";
import { isNativeApp } from "@/lib/native-auth";
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
    [/^\/grit-miles/, "GRIT Miles", false],
    [/^\/demo-day/, "Demo Day", false],
    [/^\/finale/, "Finale", false],
    [/^\/team/, "My Team", false],
    [/^\/resources-library/, "Resources", false],
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
  const { user } = useAuth();
  // Elevation appears only once the page has scrolled, the way a Material
  // top app bar does — flat at rest, raised over content.
  const [scrolled, setScrolled] = useState(false);
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
      {!topLevel && (
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
          topLevel ? "px-2" : "px-1",
        )}
      >
        {title}
      </h1>

      {/* Notifications + profile. Both already exist elsewhere; this is the
          phone's place for them now that the wordmark no longer occupies the
          bar. The wrapper recolours the bell's icon for a dark surface. */}
      {isStudent && (
        <div className="flex shrink-0 items-center gap-0.5 pr-1 [&_button]:text-sidebar-foreground [&_button:hover]:bg-sidebar-accent">
          <NotificationsBell />
          <Link
            href="/profile"
            aria-label="Profile"
            data-testid="link-app-header-profile"
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
          </Link>
        </div>
      )}
    </header>
  );
}
