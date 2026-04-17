import { useAuth } from "@workspace/replit-auth-web";
import { Link } from "wouter";
import { Bell } from "lucide-react";
import { Button } from "./ui/button";

export function Navbar() {
  const { user } = useAuth();

  if (!user) return null;

  return (
    <header className="h-16 border-b bg-card flex items-center justify-between px-6 sticky top-0 z-10">
      <div className="flex items-center gap-4">
        {/* Breadcrumbs or page title could go here */}
      </div>

      <div className="flex items-center gap-4">
        {user.role === "student" && (
          <Link href="/notifications">
            <Button variant="ghost" size="icon" className="relative cursor-pointer">
              <Bell className="w-5 h-5 text-muted-foreground" />
              {/* Add indicator if there are unread notifications */}
            </Button>
          </Link>
        )}
      </div>
    </header>
  );
}
