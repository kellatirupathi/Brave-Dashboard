// Programme end date + remaining-time countdown for the student dashboard.
// Reads the programme end date from the student GRIT config (which now surfaces
// `endDate`, sourced from the admin Config → End Date). Additive + self-
// contained: drop <ProgramCountdown /> anywhere on a student page.
import { useQuery } from "@tanstack/react-query";
import { CalendarClock } from "lucide-react";
import { getStudentGritConfig } from "@/lib/grit-config-api";
import { cn } from "@/lib/utils";

const PANEL = "rounded-xl border bg-card";

// Whole days from `now` until the end of the programme end date (inclusive).
function daysUntil(endDateISO: string, now: Date): number {
  const end = new Date(endDateISO + "T23:59:59");
  return Math.ceil((end.getTime() - now.getTime()) / 86_400_000);
}

export function ProgramCountdown({ className }: { className?: string }) {
  // Same query key + fn App.tsx already uses, so this shares the cache and
  // adds no extra network request on the dashboard.
  const { data } = useQuery({
    queryKey: ["student-grit-config"],
    queryFn: getStudentGritConfig,
    staleTime: 60_000,
  });

  const endDate = data?.endDate;
  if (!endDate) return null;

  const now = new Date();
  const daysLeft = daysUntil(endDate, now);
  const ended = daysLeft < 0;
  const endLabel = new Date(endDate + "T00:00:00").toLocaleDateString("en-IN", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  return (
    <section
      className={cn(PANEL, "p-5", className)}
      data-testid="program-countdown"
    >
      <div className="flex items-center gap-2">
        <CalendarClock className="h-4 w-4 text-primary" />
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
          Programme timeline
        </h2>
      </div>
      <div className="mt-3 flex items-end gap-2">
        <span className="text-5xl font-extrabold leading-none tabular-nums text-foreground">
          {ended ? 0 : daysLeft}
        </span>
        <span className="mb-1 text-sm text-muted-foreground">
          {ended
            ? "programme ended"
            : daysLeft === 1
              ? "day left"
              : "days left"}
        </span>
      </div>
      <p className="mt-3 text-xs text-muted-foreground">
        {ended ? "Ended on " : "Programme ends on "}
        <span className="font-medium text-foreground">{endLabel}</span>
      </p>
    </section>
  );
}
