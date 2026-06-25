// One-time motivational pop-up introducing GRIT Miles to students. Shown once
// per user (tracked in localStorage), only after they have accepted the Terms
// gate (so the two modals never stack), and only on the student dashboard.
// Fully additive — dismissing it never blocks anything.
import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@workspace/replit-auth-web";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Award, Rocket, Sparkles, Trophy } from "lucide-react";

// Bump the suffix if the announcement content changes and should re-show.
const SEEN_KEY = "grit-intro-seen-v1";

export function GritIntroDialog() {
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const [location] = useLocation();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (user?.role !== "student") return;
    // Don't compete with the blocking Terms gate — wait until accepted.
    if (!user.termsAcceptedAt) return;
    // Only surface it on the dashboard home so it feels like a welcome.
    if (location !== "/" && location !== "") return;
    let seen = false;
    try {
      seen = localStorage.getItem(SEEN_KEY) === "1";
    } catch {
      // localStorage unavailable (private mode) — show once per session.
    }
    if (!seen) setOpen(true);
  }, [user?.role, user?.termsAcceptedAt, location]);

  const dismiss = () => {
    try {
      localStorage.setItem(SEEN_KEY, "1");
    } catch {
      /* ignore */
    }
    setOpen(false);
  };

  const goToGrit = () => {
    dismiss();
    navigate("/grit-miles");
  };

  if (user?.role !== "student") return null;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && dismiss()}>
      <DialogContent className="max-w-md" data-testid="dialog-grit-intro">
        <DialogHeader>
          <div className="mb-2 flex items-center gap-2">
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-400 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-950">
              <Sparkles className="h-3 w-3" /> New
            </span>
          </div>
          <DialogTitle className="flex items-center gap-2 text-xl">
            <Award className="h-6 w-6 text-amber-500" /> Introducing GRIT Miles
          </DialogTitle>
          <DialogDescription className="text-base">
            You don&apos;t have to be in the top 3 to be rewarded.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 text-sm text-muted-foreground">
          <p>
            Every rupee of verified revenue moves you up the{" "}
            <span className="font-medium text-foreground">GRIT Miles</span>{" "}
            ladder — keep going and unlock level after level, no matter where
            you are on the leaderboard.
          </p>
          <div className="flex items-start gap-2 rounded-md bg-amber-500/5 p-3">
            <Trophy className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
            <p>
              Climb through the levels, earn more Miles, and see exactly how
              much more you need to unlock the next reward.
            </p>
          </div>
          <div className="flex items-start gap-2 rounded-md bg-primary/5 p-3">
            <Rocket className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
            <p>
              And don&apos;t miss the new{" "}
              <span className="font-medium text-foreground">Demo Day</span>{" "}
              section — submit your best project for a chance to present in
              front of investors.
            </p>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button
            variant="ghost"
            onClick={dismiss}
            data-testid="button-grit-intro-dismiss"
          >
            Maybe later
          </Button>
          <Button onClick={goToGrit} data-testid="button-grit-intro-explore">
            <Award className="mr-2 h-4 w-4" /> Explore GRIT Miles
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
