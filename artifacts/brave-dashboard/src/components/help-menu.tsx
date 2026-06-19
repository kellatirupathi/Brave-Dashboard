import { useState } from "react";
import { useAuth } from "@workspace/replit-auth-web";
import { MessageSquare } from "lucide-react";
import { FeedbackDialog } from "@/components/feedback-dialog";

export function HelpMenu({ inline = false }: { inline?: boolean } = {}) {
  const { user } = useAuth();
  const [feedbackOpen, setFeedbackOpen] = useState(false);

  // Show the feedback action for students, admins, and coordinators. Hide for
  // unauthenticated users or any other role.
  const isStudent = user?.role === "student";
  const isAdmin = user?.role === "admin";
  const isCoordinator = user?.role === "coordinator";
  const enabled = isStudent || isAdmin || isCoordinator;

  if (!user || !enabled) return null;

  // Directly display a Feedback icon + label in the top bar (no dropdown menu).
  // Clicking opens the feedback dialog straight away.
  const triggerClassName = inline
    ? "inline-flex h-9 items-center gap-2 rounded-md px-3 text-sm font-medium text-muted-foreground hover:bg-accent hover:text-foreground cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-ring transition-colors"
    : "fixed bottom-6 right-6 z-50 inline-flex h-12 items-center gap-2 rounded-full bg-primary px-5 text-sm font-medium text-primary-foreground shadow-lg transition-transform hover:scale-105 hover:bg-primary/90 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background";

  return (
    <>
      <button
        type="button"
        aria-label="Share feedback"
        title="Feedback"
        data-testid="button-feedback"
        className={triggerClassName}
        onClick={() => setFeedbackOpen(true)}
      >
        <MessageSquare className={inline ? "h-5 w-5" : "h-6 w-6"} />
        Feedback
      </button>

      <FeedbackDialog open={feedbackOpen} onOpenChange={setFeedbackOpen} />
    </>
  );
}
