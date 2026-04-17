import { useAuth } from "@workspace/replit-auth-web";
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
  Bell,
  CheckSquare
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "./ui/button";
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

export function Sidebar() {
  const { user, logout } = useAuth();
  const [location] = useLocation();
  const [showLogoutDialog, setShowLogoutDialog] = useState(false);

  if (!user) return null;

  const role = user.role;

  const navItems = {
    student: user.teamId
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
      { name: "Leaderboard", href: "/coordinator/leaderboard", icon: Trophy },
      { name: "Announcements", href: "/coordinator/announcements", icon: Megaphone },
    ],
    admin: [
      { name: "Dashboard", href: "/admin", icon: LayoutDashboard },
      { name: "Review Queue", href: "/admin/queue", icon: CheckSquare },
      { name: "Teams", href: "/admin/teams", icon: Users },
      { name: "Leaderboard", href: "/admin/leaderboard", icon: Trophy },
      { name: "Demo Day", href: "/admin/demo-day", icon: FileText },
      { name: "Campuses", href: "/admin/campuses", icon: Building2 },
      { name: "Users", href: "/admin/users", icon: Users },
      { name: "Roster", href: "/admin/roster", icon: ClipboardList },
      { name: "Announcements", href: "/admin/announcements", icon: Megaphone },
      { name: "Config", href: "/admin/config", icon: Settings },
      { name: "Audit Log", href: "/admin/audit-log", icon: ClipboardList },
    ]
  };

  const items = navItems[role as keyof typeof navItems] || [];

  return (
    <>
      <div className="w-64 bg-sidebar border-r border-sidebar-border h-screen sticky top-0 flex flex-col text-sidebar-foreground">
        <div className="p-6">
          <h1 className="text-2xl font-bold tracking-tight text-sidebar-primary">BRAVE</h1>
          <p className="text-xs text-sidebar-foreground/60 uppercase tracking-widest mt-1">Dashboard</p>
        </div>

        <nav className="flex-1 px-4 space-y-1 overflow-y-auto py-4">
          {items.map((item) => {
            const Icon = item.icon;
            const isActive = location === item.href || (location.startsWith(item.href + '/') && item.href !== '/');
            
            return (
              <Link key={item.name} href={item.href}>
                <span className={cn(
                  "flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-all duration-200 cursor-pointer",
                  isActive 
                    ? "bg-sidebar-primary text-sidebar-primary-foreground shadow-sm" 
                    : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                )}>
                  <Icon className="w-4 h-4" />
                  {item.name}
                </span>
              </Link>
            );
          })}
        </nav>

        <div className="p-4 border-t border-sidebar-border">
          <div className="flex items-center gap-3 px-3 py-3">
            {user.profileImage ? (
              <img src={user.profileImage} alt="" className="w-8 h-8 rounded-full" />
            ) : (
              <div className="w-8 h-8 rounded-full bg-sidebar-primary/20 text-sidebar-primary flex items-center justify-center text-sm font-bold">
                {user.firstName?.[0]}{user.lastName?.[0]}
              </div>
            )}
            <div className="flex-1 overflow-hidden">
              <p className="text-sm font-medium truncate">{user.firstName} {user.lastName}</p>
              <p className="text-xs text-sidebar-foreground/50 truncate capitalize">{user.role}</p>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setShowLogoutDialog(true)}
              title="Logout"
            >
              <LogOut className="w-4 h-4 text-sidebar-foreground/50 hover:text-sidebar-foreground" />
            </Button>
          </div>
        </div>
      </div>

      <AlertDialog open={showLogoutDialog} onOpenChange={setShowLogoutDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Log out?</AlertDialogTitle>
            <AlertDialogDescription>
              You will be signed out of the BRAVE Dashboard and redirected to the login page.
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
