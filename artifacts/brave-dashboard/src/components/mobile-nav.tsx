// Bottom navigation for phones (additive, isolated).
//
// The hamburger drawer stays — this sits alongside it and puts the four or five
// screens a student actually uses in the field within thumb reach, the way a
// native Android app does. Anything else is still one tap away in the drawer.
//
// SCOPE
// - Students only, and only below the `lg` breakpoint. Coordinators and admins
//   work at a desk, where the sidebar is already the better affordance.
// - Follows Material's bottom-nav rules: 3-5 destinations, always-visible
//   labels, 56dp target height, active item in the accent colour.
// - Season-aware: Season 2 shows Leads where Season 1 shows Projects, matching
//   the sidebar exactly rather than duplicating the decision.
//
// Deleting this file means removing the one <MobileNav /> tag in layout.tsx and
// the pb-16 class beside it.
import { Link, useLocation } from "wouter";
import {
  LayoutDashboard,
  BookOpenCheck,
  FolderKanban,
  Handshake,
  Trophy,
  Users,
} from "lucide-react";
import { useAuth } from "@workspace/replit-auth-web";
import { useSeason } from "@/lib/season-context";
import { cn } from "@/lib/utils";

type Item = {
  name: string;
  href: string;
  icon: typeof LayoutDashboard;
};

export function MobileNav() {
  const { user } = useAuth();
  const [location] = useLocation();
  const { viewingId } = useSeason();

  // Staff keep the sidebar; a bottom bar would just cover content for them.
  if (!user || user.role !== "student") return null;

  // Same rule as the sidebar: from Season 2 on, a project only exists behind a
  // converted lead, so the pipeline entry replaces Projects.
  const usesLeadPipeline = viewingId != null && viewingId >= 2;

  const items: Item[] = [
    { name: "Home", href: "/", icon: LayoutDashboard },
    { name: "Journal", href: "/journal", icon: BookOpenCheck },
    usesLeadPipeline
      ? { name: "Leads", href: "/leads", icon: Handshake }
      : { name: "Projects", href: "/projects", icon: FolderKanban },
    { name: "Ranks", href: "/leaderboard", icon: Trophy },
    { name: "Team", href: "/team", icon: Users },
  ];

  /**
   * Exact match for "/", prefix match elsewhere — so /leads/12/project still
   * highlights Leads, but /journal does not light up Home.
   */
  const isActive = (href: string) =>
    href === "/" ? location === "/" : location.startsWith(href);

  return (
    <nav
      aria-label="Primary"
      data-testid="nav-mobile-bottom"
      className={cn(
        "lg:hidden fixed bottom-0 inset-x-0 z-40",
        "border-t border-sidebar-border bg-sidebar text-sidebar-foreground",
        // Keeps the bar clear of the iOS home indicator and Android gesture pill.
        "pb-[env(safe-area-inset-bottom,0px)]",
      )}
    >
      <ul className="flex items-stretch">
        {items.map((item) => {
          const active = isActive(item.href);
          const Icon = item.icon;
          return (
            <li key={item.href} className="flex-1">
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                data-testid={`link-mobile-${item.name.toLowerCase()}`}
                className={cn(
                  // 56px min-height is the Material bottom-nav target; below
                  // that it gets genuinely hard to hit while walking.
                  "flex min-h-[56px] flex-col items-center justify-center gap-0.5 px-1 py-1.5",
                  "transition-colors active:bg-sidebar-accent",
                  active
                    ? "text-sidebar-primary"
                    : "text-sidebar-foreground/65",
                )}
              >
                <Icon
                  className={cn("h-5 w-5 shrink-0", active && "stroke-[2.5]")}
                  aria-hidden="true"
                />
                <span
                  className={cn(
                    "text-[10px] leading-tight tracking-tight",
                    active ? "font-bold" : "font-medium",
                  )}
                >
                  {item.name}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
