import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { motion } from "framer-motion";
import { CheckCircle2, Circle, HelpCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { getWeekTracker } from "@/lib/progress-api";
import { getStudentGritConfig } from "@/lib/grit-config-api";

// Week-wise journal completion tracker. Renders Week 1 → N as clickable
// circles connected by thick segments:
//   - green tick      = submitted
//   - red "?"         = a PAST week that was missed (before current, not submitted)
//   - ringed circle   = current week
//   - muted circle    = future week (pending)
// Connector segment colour follows the week on its LEFT: green if that week is
// submitted, red if it's a missed past week, neutral grey for current/future.
// Clicking a week deep-links to that week's journal entry.
export function JournalWeekTracker({
  className,
  compact = false,
}: {
  className?: string;
  compact?: boolean;
}) {
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

  // Index of the current week so we can tell past vs future weeks.
  const currentIndex = weeks.findIndex((w) => w.isCurrent);

  const deadline = gritConfig?.journalEditDeadline ?? null;
  const deadlineLabel = deadline
    ? new Date(deadline + "T00:00:00").toLocaleDateString("en-IN", {
        day: "numeric",
        month: "long",
      })
    : null;

  // A week is a "missed" week when it sits before the current week and was
  // never submitted. (When there is no current week, nothing is treated as
  // missed — we can't reliably tell past from future.)
  const isMissed = (index: number) =>
    currentIndex >= 0 && index < currentIndex && !weeks[index].submitted;

  // Connector segment to the LEFT of week[index] (index >= 1).
  const connectorTone = (leftIndex: number) => {
    if (weeks[leftIndex].submitted) return "bg-emerald-500";
    if (isMissed(leftIndex)) return "bg-red-500";
    return "bg-muted";
  };

  return (
    <div
      className={cn("min-w-0", className)}
      data-testid="journal-week-tracker"
    >
      <div className="overflow-x-auto">
        <div className="flex min-w-max items-start justify-center">
          {weeks.map((w, i) => {
            const missed = isMissed(i);
            const tone = w.submitted
              ? "text-emerald-600"
              : missed
                ? "text-red-500"
                : w.isCurrent
                  ? "text-primary"
                  : "text-muted-foreground/50";
            return (
              <div key={w.weekId} className="flex items-start">
                {/* Connector segment between the previous dot and this one.
                    Fills left → right on mount, staggered per segment. */}
                {i > 0 && (
                  <motion.div
                    aria-hidden
                    data-testid={`week-connector-${w.weekNumber}`}
                    initial={{ scaleX: 0 }}
                    animate={{ scaleX: 1 }}
                    transition={{
                      duration: 0.35,
                      delay: (i - 1) * 0.07,
                      ease: "easeOut",
                    }}
                    className={cn(
                      compact
                        ? "mt-3 h-0.5 w-2.5 origin-left shrink-0 rounded-full sm:w-3.5"
                        : "mt-3.5 h-1 w-3 origin-left shrink-0 rounded-full sm:w-4",
                      connectorTone(i - 1),
                    )}
                  />
                )}
                <Link
                  href={`/journal?week=${w.weekId}`}
                  title={`Week ${w.weekNumber} · ${w.startDate} → ${w.endDate}${
                    w.submitted
                      ? " · submitted"
                      : missed
                        ? " · missed"
                        : " · pending"
                  }`}
                  data-testid={`week-dot-${w.weekNumber}`}
                  className={cn(
                      "group flex flex-col items-center gap-0.5 rounded-md py-0.5 transition-colors hover:bg-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      compact ? "px-0.5" : "px-1",
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
                      <CheckCircle2 className={compact ? "h-6 w-6" : "h-7 w-7"} />
                    ) : missed ? (
                      <HelpCircle className={compact ? "h-6 w-6" : "h-7 w-7"} />
                    ) : (
                      <Circle className={compact ? "h-6 w-6" : "h-7 w-7"} />
                    )}
                  </span>
                  <span
                    className={cn(
                       compact ? "text-[11px] font-medium tabular-nums" : "text-xs font-medium tabular-nums",
                      w.isCurrent
                        ? "text-primary"
                        : missed
                          ? "text-red-500"
                          : "text-muted-foreground",
                    )}
                  >
                    {w.weekNumber}
                  </span>
                </Link>
              </div>
            );
          })}
        </div>
      </div>
      <p
        className={cn(
          "text-muted-foreground text-center",
          compact ? "mt-1.5 text-[11px]" : "mt-2 text-xs",
        )}
      >
        {deadlineLabel
          ? `Editing your previous journal entries is available until ${deadlineLabel}. `
          : ""}
        Make sure to fill every weekly journal entry to remain eligible for Demo
        Day.
      </p>
    </div>
  );
}
