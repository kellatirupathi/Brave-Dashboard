// Bottom navigation for phones (additive, isolated).
//
// FOUR slots — the three screens a student works in, plus More:
//
//   1  Dashboard
//   2  Journal
//   3  Leads (Season 2) / Projects (Season 1)
//   4  More — everything else, in a sheet that slides up from the bar
//
// Four rather than five. Material allows five, but the fifth was Profile, and
// profile is not a *task* — it is something you visit once at signup and then
// almost never. Spending a permanent thumb-reach slot on it crowded the three
// screens that actually carry the work; it now lives at the top of the More
// sheet, where settings-shaped things belong.
//
// The "More" sheet is what makes four slots enough. A student has up to ten
// destinations depending on which features an admin has switched on, and
// hiding the surplus behind a hamburger at the OPPOSITE end of the screen
// (top-left, where the thumb cannot reach) is the thing that makes a web app
// feel like a web app on a phone.
//
// SCOPE
// - Students only, below `lg` only. Staff work at a desk where the sidebar is
//   the better affordance.
// - The nav mirrors the sidebar's own rules rather than re-deciding them:
//   Season 2 shows Leads where Season 1 shows Projects, and Demo Day / Finale /
//   Resources appear only when their admin toggle is on.
//
// Deleting this file means removing the one <MobileNav /> tag in layout.tsx
// and the pb-20 class on <main> beside it.
import { useEffect, useState } from "react";
import { Link, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import {
  LayoutDashboard,
  BookOpenCheck,
  FolderKanban,
  Handshake,
  Trophy,
  Users,
  BookOpen,
  Library,
  Award,
  Rocket,
  User,
  MoreHorizontal,
  X,
} from "lucide-react";
import { useAuth } from "@workspace/replit-auth-web";
import { useSeason } from "@/lib/season-context";
import { getStudentGritConfig } from "@/lib/grit-config-api";
import { getFinaleMe } from "@/lib/finale-api";
import { cn } from "@/lib/utils";

type Item = {
  name: string;
  href: string;
  icon: typeof LayoutDashboard;
  /** Opens in a new tab rather than routing. */
  external?: boolean;
};

export function MobileNav() {
  const { user } = useAuth();
  const [location] = useLocation();
  const { viewingId } = useSeason();
  const [moreOpen, setMoreOpen] = useState(false);

  const isStudent = user?.role === "student";

  // Which optional sections an admin has switched on. These reuse the SIDEBAR'S
  // OWN query keys, so they hit the same cache — no extra requests, and the two
  // menus can never disagree about which pages exist.
  const { data: gritConfig } = useQuery({
    queryKey: ["student-grit-config"],
    queryFn: getStudentGritConfig,
    staleTime: 60_000,
    enabled: isStudent,
  });
  const { data: finaleMe } = useQuery({
    queryKey: ["finale-me"],
    queryFn: getFinaleMe,
    staleTime: 60_000,
    enabled: isStudent,
  });
  const { data: resourcesSettings } = useQuery<{
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
    enabled: isStudent,
  });

  // Close the sheet on navigation — otherwise it stays open over the new page.
  useEffect(() => {
    setMoreOpen(false);
  }, [location]);

  // Lock the page behind the sheet so the list under it does not scroll.
  useEffect(() => {
    if (!moreOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [moreOpen]);

  if (!isStudent) return null;

  // Same rule as the sidebar: from Season 2 on, a project only exists behind a
  // converted lead, so the pipeline entry replaces Projects.
  const usesLeadPipeline = viewingId != null && viewingId >= 2;

  /** Slots 1-3: what a student opens most while working. */
  const primary: Item[] = [
    { name: "Dashboard", href: "/", icon: LayoutDashboard },
    { name: "Journal", href: "/journal", icon: BookOpenCheck },
    usesLeadPipeline
      ? { name: "Leads", href: "/leads", icon: Handshake }
      : { name: "Projects", href: "/projects", icon: FolderKanban },
  ];

  /**
   * Everything else, behind More. Profile leads because it is the one a
   * student reaches for deliberately; the rest follow the sidebar's order.
   */
  const overflow: Item[] = [
    { name: "Profile", href: "/profile", icon: User },
    { name: "Leaderboard", href: "/leaderboard", icon: Trophy },
    { name: "GRIT Miles", href: "/grit-miles", icon: Award },
    ...(gritConfig?.demoDayMenuEnabled !== false
      ? [{ name: "Demo Day", href: "/demo-day", icon: Rocket }]
      : []),
    // Finale needs BOTH the admin toggle and this team clearing the bar.
    ...(finaleMe?.enabled && finaleMe?.eligible
      ? [{ name: "Finale", href: "/finale", icon: Trophy }]
      : []),
    { name: "My Team", href: "/team", icon: Users },
    // Defaults to visible on error, matching the server's default-allow.
    ...((resourcesSettings?.enabledForStudents ?? true)
      ? [{ name: "Resources", href: "/resources-library", icon: Library }]
      : []),
    { name: "Guidebook", href: "/guidebook", icon: BookOpen, external: true },
  ];

  /**
   * Exact match for "/", prefix match elsewhere — so /leads/12/project still
   * highlights Leads, but /journal does not light up Home.
   */
  const isActive = (href: string) =>
    href === "/" ? location === "/" : location.startsWith(href);

  /** True when the current page lives behind More, so that slot lights up too. */
  const inOverflow = overflow.some(
    (i) => !i.external && isActive(i.href),
  );

  const slotClass = (active: boolean) =>
    cn(
      // 56px is Material's bottom-nav height; below that it gets genuinely
      // hard to hit while walking.
      "flex min-h-[56px] w-full flex-col items-center justify-center gap-1 px-1 pb-1.5 pt-2",
      "transition-colors",
      active ? "text-sidebar-primary" : "text-sidebar-foreground/65",
    );

  /**
   * Material's active indicator: a pill behind the icon, not a colour change
   * alone. It is what makes the selected tab readable at a glance on a phone
   * held at arm's length, and it gives the tap something to land on.
   */
  const pillClass = (active: boolean) =>
    cn(
      "flex h-7 w-[3.25rem] items-center justify-center rounded-full transition-colors",
      active ? "bg-sidebar-primary/15" : "bg-transparent",
    );

  const labelClass = (active: boolean) =>
    cn(
      "text-[10px] leading-tight tracking-tight",
      active ? "font-bold" : "font-medium",
    );

  return (
    <>
      {/* ── More sheet ─────────────────────────────────────────── */}
      {moreOpen && (
        <>
          <button
            type="button"
            aria-label="Close menu"
            onClick={() => setMoreOpen(false)}
            className="lg:hidden fixed inset-0 z-40 bg-black/40 animate-in fade-in duration-200"
          />
          <div
            role="dialog"
            aria-label="More pages"
            data-testid="sheet-mobile-more"
            className={cn(
              "lg:hidden fixed inset-x-0 bottom-0 z-50",
              "rounded-t-2xl border-t bg-card text-card-foreground shadow-2xl",
              "animate-in slide-in-from-bottom duration-300",
            )}
            style={{
              paddingBottom: "calc(4.5rem + env(safe-area-inset-bottom, 0px))",
            }}
          >
            {/* Grab handle — the affordance that says "this sheet drags". */}
            <div className="flex justify-center pt-2.5">
              <div className="h-1 w-10 rounded-full bg-muted-foreground/30" />
            </div>

            <div className="flex items-center justify-between px-5 pb-1 pt-3">
              <p className="text-sm font-bold">More</p>
              <button
                type="button"
                onClick={() => setMoreOpen(false)}
                aria-label="Close"
                className="rounded-full p-1.5 text-muted-foreground active:bg-muted"
              >
                <X className="h-5 w-5" aria-hidden="true" />
              </button>
            </div>

            <div className="grid grid-cols-3 gap-1 px-3 pb-2">
              {overflow.map((item) => {
                const Icon = item.icon;
                const active = !item.external && isActive(item.href);
                const inner = (
                  <>
                    <span
                      className={cn(
                        "flex h-12 w-12 items-center justify-center rounded-xl",
                        active
                          ? "bg-primary text-primary-foreground"
                          : "bg-muted text-foreground",
                      )}
                    >
                      <Icon className="h-5 w-5" aria-hidden="true" />
                    </span>
                    <span className="text-center text-[11px] font-medium leading-tight">
                      {item.name}
                    </span>
                  </>
                );
                const cls =
                  "flex flex-col items-center gap-1.5 rounded-xl p-3 active:bg-muted/60";

                return item.external ? (
                  <a
                    key={item.href}
                    href={item.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={cls}
                    data-testid={`link-more-${item.name.toLowerCase()}`}
                  >
                    {inner}
                  </a>
                ) : (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cls}
                    data-testid={`link-more-${item.name.toLowerCase()}`}
                  >
                    {inner}
                  </Link>
                );
              })}
            </div>
          </div>
        </>
      )}

      {/* ── The bar ────────────────────────────────────────────── */}
      <nav
        aria-label="Primary"
        data-testid="nav-mobile-bottom"
        className={cn(
          "lg:hidden fixed bottom-0 inset-x-0 z-50",
          "border-t border-sidebar-border bg-sidebar text-sidebar-foreground",
          // Clears the iOS home indicator and the Android gesture pill.
          "pb-[env(safe-area-inset-bottom,0px)]",
        )}
      >
        <ul className="flex items-stretch">
          {primary.map((item) => {
            const active = isActive(item.href);
            const Icon = item.icon;
            return (
              <li key={item.href} className="flex-1">
                <Link
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  data-testid={`link-mobile-${item.name.toLowerCase()}`}
                  className={slotClass(active)}
                >
                  <span className={pillClass(active)}>
                    <Icon
                      className={cn(
                        "h-5 w-5 shrink-0",
                        active && "stroke-[2.5]",
                      )}
                      aria-hidden="true"
                    />
                  </span>
                  <span className={labelClass(active)}>{item.name}</span>
                </Link>
              </li>
            );
          })}

          {/* Slot 4 — More */}
          <li className="flex-1">
            <button
              type="button"
              onClick={() => setMoreOpen((v) => !v)}
              aria-expanded={moreOpen}
              aria-haspopup="dialog"
              data-testid="button-mobile-more"
              className={slotClass(moreOpen || inOverflow)}
            >
              <span className={pillClass(moreOpen || inOverflow)}>
                <MoreHorizontal
                  className={cn(
                    "h-5 w-5 shrink-0",
                    (moreOpen || inOverflow) && "stroke-[2.5]",
                  )}
                  aria-hidden="true"
                />
              </span>
              <span className={labelClass(moreOpen || inOverflow)}>More</span>
            </button>
          </li>
        </ul>
      </nav>
    </>
  );
}
