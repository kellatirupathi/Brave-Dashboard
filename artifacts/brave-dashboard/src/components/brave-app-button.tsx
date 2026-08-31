// "BRAVE App" entry point on the student dashboard (additive, isolated).
//
// Season 2 only: the mobile app exists to capture leads in the field, which is
// a Season 2 flow. A Season 1 student viewing their archive has nothing to do
// on a phone, so the button stays hidden for them.
//
// Opens the install guide in a NEW TAB rather than navigating, so a student
// reading the instructions does not lose the dashboard behind them.
//
// Deleting this file means removing the one <BraveAppButton /> tag in
// pages/student/dashboard.tsx.
import { Smartphone } from "lucide-react";
import { useAuth } from "@workspace/replit-auth-web";
import { useSeason } from "@/lib/season-context";

/** Running inside the installed app already — no point offering the download. */
function isInstalledApp(): boolean {
  if (typeof window === "undefined") return false;
  const w = window as { Capacitor?: { isNativePlatform?: () => boolean } };
  if (w.Capacitor?.isNativePlatform?.()) return true;
  return (
    window.matchMedia?.("(display-mode: standalone)").matches ||
    (window.navigator as { standalone?: boolean }).standalone === true
  );
}

export function BraveAppButton() {
  const { user } = useAuth();
  const { viewing } = useSeason();

  if (!user || user.role !== "student") return null;
  // Same rule as the sidebar's Leads entry: the pipeline, and therefore the
  // app, belongs to Season 2 onwards.
  if (!viewing || viewing.slug === "1.0") return null;
  if (isInstalledApp()) return null;

  return (
    <div className="mt-8 flex justify-center">
      <a
        href={`${import.meta.env.BASE_URL.replace(/\/$/, "")}/student/season/${encodeURIComponent(viewing.slug)}/get-app`}
        target="_blank"
        rel="noopener noreferrer"
        data-testid="link-brave-app"
        className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-4 py-2 text-sm font-medium text-foreground shadow-sm transition-colors hover:bg-muted"
      >
        <Smartphone className="h-4 w-4 text-primary" aria-hidden="true" />
        BRAVE App
      </a>
    </div>
  );
}
