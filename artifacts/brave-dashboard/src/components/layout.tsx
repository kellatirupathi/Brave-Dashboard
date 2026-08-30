import { useState } from "react";
import { Menu } from "lucide-react";
import { Sidebar, SidebarBody } from "./sidebar";
import { BraveLogo } from "./brave-logo";
import { Button } from "./ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "./ui/sheet";
import { Chatbot } from "./chatbot";
import { PcaVoteBanner } from "./pca-vote-banner";
import { SeasonArchiveBanner } from "./season-archive-banner";
import { MobileNav } from "./mobile-nav";
import { AppHeader } from "./app-header";
import { isNativeApp } from "@/lib/native-auth";
import { useAuth } from "@workspace/replit-auth-web";
import { cn } from "@/lib/utils";
import { OfflineBanner } from "./offline-banner";

export function Layout({ children }: { children: React.ReactNode }) {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const { user } = useAuth();
  // Computed once: the shell does not change between renders.
  const nativeApp = isNativeApp();

  /**
   * Students navigate from the bottom bar on a phone, so the hamburger and its
   * left drawer are dead weight for them — two menus listing the same pages,
   * one of them at the top-left corner a thumb cannot reach. Below `lg` a
   * student gets the bottom bar ALONE.
   *
   * Staff keep the drawer: <MobileNav /> renders nothing for them, so it is
   * their only navigation on a small screen.
   */
  const hasBottomNav = user?.role === "student";
  const showDrawer = !hasBottomNav && !nativeApp;

  return (
    <div
      className="flex min-h-screen bg-background text-foreground"
      // Lets CSS move anything that would otherwise sit UNDER the bottom bar
      // (the floating assistant) without each of those components needing to
      // know the bar exists. Absent for staff, who have no bottom bar.
      data-bottom-nav={hasBottomNav ? "true" : undefined}
    >
      {/* Desktop sidebar — already hidden below lg via Sidebar's own classes. */}
      <Sidebar />

      <div className="flex-1 flex flex-col min-w-0">
        {/* Mobile/tablet top bar with hamburger. Hidden on desktop. */}
        {/* Native app gets a Material top app bar instead — a screen title and
            a back arrow, not a hamburger duplicating the bottom bar. */}
        <AppHeader />

        <header
          className={cn(
            "lg:hidden sticky top-0 z-30 flex h-14 items-center justify-between border-b border-sidebar-border bg-sidebar px-4 text-sidebar-foreground",
            nativeApp && "hidden",
          )}
        >
          {showDrawer ? (
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setMobileNavOpen(true)}
              aria-label="Open navigation menu"
              data-testid="button-open-mobile-nav"
              className="text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
            >
              <Menu className="h-5 w-5" />
            </Button>
          ) : (
            // Balances the trailing spacer so the wordmark stays centred now
            // that there is no hamburger to offset it.
            <div className="w-10" aria-hidden="true" />
          )}
          <div className="flex items-center">
            <BraveLogo className="text-lg" />
          </div>
          {/* Spacer to balance the hamburger button so the logo stays centered. */}
          <div className="w-10" aria-hidden="true" />
        </header>

        {/* Mobile drawer hosting the same sidebar contents. Staff only — a
            student's navigation is the bottom bar. */}
        {showDrawer && (
          <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
            <SheetContent
              side="left"
              className="w-72 max-w-[85vw] border-sidebar-border bg-sidebar p-0"
              data-testid="sheet-mobile-nav"
            >
              <SheetHeader className="sr-only">
                <SheetTitle>Navigation</SheetTitle>
                <SheetDescription>Site navigation menu</SheetDescription>
              </SheetHeader>
              <SidebarBody onNavigate={() => setMobileNavOpen(false)} />
            </SheetContent>
          </Sheet>
        )}

        {/* Connectivity notice. Self-gates: renders nothing while online. */}
        <OfflineBanner />

        {/* People's Choice Award nudge — sits above every page's content and
            self-gates (renders nothing unless voting is open, this student is
            eligible, and they haven't voted). */}
        <PcaVoteBanner />

        {/* Read-only notice while an archived season is being viewed. Self-gates
            (renders nothing for the live season), so every page inherits it. */}
        <SeasonArchiveBanner />

        {/* pb-20 on small screens clears the fixed bottom nav; lg:pb-8 puts
            the normal padding back where that nav is not rendered.
            `app-main` adds the gesture-bar inset on top of that, natively. */}
        <main
          className={cn(
            "flex-1 p-4 pb-20 sm:p-6 sm:pb-20 lg:p-8 lg:pb-8 overflow-x-hidden",
            nativeApp && "app-main",
          )}
        >
          {children}
        </main>
      </div>

      {/* Help menu is now rendered inline in each role's dashboard top-bar
          (next to the notifications bell) instead of floating. */}

      {/* Floating BRAVE assistant chatbot — visible to all logged-in users. */}
      <Chatbot variant="light" />

      {/* Thumb-reach bottom navigation. Self-gates on role + breakpoint, so it
          renders nothing for staff or on desktop. */}
      <MobileNav />
    </div>
  );
}
