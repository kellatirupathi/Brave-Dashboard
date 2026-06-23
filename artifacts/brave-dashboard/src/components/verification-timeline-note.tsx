// Tentative revenue-verification turnaround note. Shown on the Revenue Entries
// tab and the Projects page so students know when to expect their pending
// revenue to be reviewed — reducing repeated "is my revenue verified yet?"
// queries. Additive + self-contained.
import { Clock } from "lucide-react";
import { cn } from "@/lib/utils";

export function VerificationTimelineNote({
  className,
}: {
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex items-start gap-2 rounded-lg border border-dashed bg-muted/30 px-3 py-2 text-xs text-muted-foreground",
        className,
      )}
      data-testid="verification-timeline-note"
    >
      <Clock className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
      <span>
        Submitted revenue is typically reviewed and verified within{" "}
        <strong className="text-foreground">24 hours</strong>. There's no need
        to re-submit while an entry is pending.
      </span>
    </div>
  );
}
