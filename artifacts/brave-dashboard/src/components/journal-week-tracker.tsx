import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { CheckCircle2, Circle } from "lucide-react";
import { cn } from "@/lib/utils";
import { getWeekTracker } from "@/lib/progress-api";
import { getStudentGritConfig } from "@/lib/grit-config-api";

// Week-wise journal completion tracker. Renders Week 1 → N as clickable
// circles: green tick = submitted, empty circle = pending, current week
// highlighted. Clicking a week deep-links to that week's journal entry.
export function JournalWeekTracker({ className }: { className?: string }) {
  const { data: tracker } = useQuery({
    queryKey: ["journal", "week-tracker"],
    queryFn: getWeekTracker,
  });
  const { data: gritConfig } = useQuery({
    queryKey: ["student-grit-config"],
    queryFn: getStudentGritConfig,
  });

  const weeks = tracker?.weeks ?? [];
  if (weeks.length === 0) return null;

  const deadline = gritConfig?.journalEditDeadline ?? null;
  const deadlineLabel = deadline
    ? new Date(deadline + "T00:00:00").toLocaleDateString("en-IN", {
        day: "numeric",
        month: "long",
      })
    : null;

  return (
    <div
      className={cn("min-w-0", className)}
      data-testid="journal-week-tracker"
    >
      <div className="flex flex-wrap items-center justify-center gap-1.5">
        {weeks.map((w) => {
          const tone = w.submitted
            ? "text-emerald-600"
            : w.isCurrent
              ? "text-primary"
              : "text-muted-foreground/50";
          return (
            <Link
              key={w.weekId}
              href={`/journal?week=${w.weekId}`}
              title={`Week ${w.weekNumber} · ${w.startDate} → ${w.endDate}${
                w.submitted ? " · submitted" : " · pending"
              }`}
              data-testid={`week-dot-${w.weekNumber}`}
              className={cn(
                "group flex flex-col items-center gap-0.5 rounded-md px-1 py-0.5 transition-colors hover:bg-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                w.isCurrent && "bg-primary/5",
              )}
            >
              <span
                className={cn(
                  "grid place-items-center",
                  tone,
                  w.isCurrent &&
                    "ring-2 ring-primary/40 rounded-full ring-offset-1 ring-offset-background",
                )}
              >
                {w.submitted ? (
                  <CheckCircle2 className="h-5 w-5" />
                ) : (
                  <Circle className="h-5 w-5" />
                )}
              </span>
              <span
                className={cn(
                  "text-[10px] font-medium tabular-nums",
                  w.isCurrent ? "text-primary" : "text-muted-foreground",
                )}
              >
                {w.weekNumber}
              </span>
            </Link>
          );
        })}
      </div>
      <p className="mt-2 text-xs text-muted-foreground text-center">
        {deadlineLabel
          ? `Editing your previous journal entries is available until ${deadlineLabel}. `
          : ""}
        Make sure to fill every weekly journal entry to remain eligible for Demo
        Day.
      </p>
    </div>
  );
}
