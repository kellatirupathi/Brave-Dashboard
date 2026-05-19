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

export function Layout({ children }: { children: React.ReactNode }) {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  return (
    <div className="flex min-h-screen bg-background text-foreground">
      {/* Desktop sidebar — already hidden below lg via Sidebar's own classes. */}
      <Sidebar />

      <div className="flex-1 flex flex-col min-w-0">
        {/* Mobile/tablet top bar with hamburger. Hidden on desktop. */}
        <header className="lg:hidden sticky top-0 z-30 flex h-14 items-center justify-between border-b border-sidebar-border bg-sidebar px-4 text-sidebar-foreground">
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
          <div className="flex items-center">
            <BraveLogo className="text-lg" />
          </div>
          {/* Spacer to balance the hamburger button so the logo stays centered. */}
          <div className="w-10" aria-hidden="true" />
        </header>

        {/* Mobile drawer hosting the same sidebar contents. */}
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

        <main className="flex-1 p-4 sm:p-6 lg:p-8 overflow-x-hidden">
          {children}
        </main>
      </div>

      {/* Help menu is now rendered inline in each role's dashboard top-bar
          (next to the notifications bell) instead of floating. */}

      {/* Floating BRAVE assistant chatbot — visible to all logged-in users. */}
      <Chatbot variant="light" />
    </div>
  );
}
