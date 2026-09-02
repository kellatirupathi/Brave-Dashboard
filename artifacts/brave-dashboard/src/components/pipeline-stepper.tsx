// The 5-step Season 2 pipeline stepper.
//
// Every step's state comes from the SERVER (GET /pipeline/status), never from
// local inference. That is deliberate: the same gate code that governs the
// buttons produces these states, so the stepper can never tell a student they
// may proceed when the API would refuse them.
import { Check, Lock, AlertTriangle, Circle } from "lucide-react";
import { cn } from "@/lib/utils";
import type { PipelineStatus, StepState } from "@/lib/leads-api";

const ICON: Record<StepState, typeof Check> = {
  complete: Check,
  current: Circle,
  blocked: AlertTriangle,
  locked: Lock,
  // Advisory mode: not done yet, but nothing stops the team doing it.
  open: Circle,
};

const RING: Record<StepState, string> = {
  complete: "bg-emerald-500 text-white border-emerald-500",
  current: "bg-primary text-primary-foreground border-primary",
  blocked: "bg-amber-100 text-amber-700 border-amber-400",
  locked: "bg-muted text-muted-foreground border-border",
  open: "bg-background text-muted-foreground border-border",
};

const LABEL_TONE: Record<StepState, string> = {
  complete: "text-foreground",
  current: "text-foreground font-semibold",
  blocked: "text-amber-700",
  locked: "text-muted-foreground",
  open: "text-foreground",
};

export function PipelineStepper({
  status,
  className,
}: {
  status: PipelineStatus;
  className?: string;
}) {
  return (
    <div className={cn("w-full", className)}>
      <ol className="flex flex-col gap-4 sm:flex-row sm:items-start sm:gap-0">
        {status.steps.map((s, i) => {
          const Icon = ICON[s.state];
          const isLast = i === status.steps.length - 1;
          return (
            <li
              key={s.key}
              className="flex flex-1 items-start gap-3 sm:flex-col sm:items-center sm:text-center"
            >
              <div className="flex items-center sm:w-full">
                {/* Left connector — hidden on the first step and on mobile,
                    where the list stacks vertically. */}
                <span
                  className={cn(
                    "hidden h-px flex-1 sm:block",
                    i === 0 ? "invisible" : "bg-border",
                  )}
                />
                <span
                  className={cn(
                    "flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 text-xs font-semibold",
                    RING[s.state],
                  )}
                >
                  {s.state === "current" ? (
                    s.step
                  ) : (
                    <Icon className="h-4 w-4" aria-hidden="true" />
                  )}
                </span>
                <span
                  className={cn(
                    "hidden h-px flex-1 sm:block",
                    isLast ? "invisible" : "bg-border",
                  )}
                />
              </div>
              <div className="sm:mt-2 sm:px-2">
                <p className={cn("text-sm leading-tight", LABEL_TONE[s.state])}>
                  {s.label}
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {s.caption}
                </p>
              </div>
            </li>
          );
        })}
      </ol>

      {/* The gates, spelled out. A student who cannot proceed should be able to
          read WHY without opening a lead. */}
      {status.enforced === false ? (
        <p className="mt-4 text-xs text-muted-foreground">
          These checks are recommendations this season — every step is open.
          Reviewers still see which ones were met.
        </p>
      ) : null}
      <div className="mt-5 grid gap-2 border-t pt-4 sm:grid-cols-3">
        {(
          [
            ["A", status.gates.a],
            ["B", status.gates.b],
            ["C", status.gates.c],
          ] as const
        ).map(([name, gate]) => (
          <div key={name} className="flex items-start gap-2 text-xs">
            <span
              className={cn(
                "mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[10px] font-bold",
                gate.passed
                  ? "bg-emerald-100 text-emerald-700"
                  : "bg-muted text-muted-foreground",
              )}
            >
              {name}
            </span>
            <span
              className={
                gate.passed ? "text-foreground" : "text-muted-foreground"
              }
            >
              {gate.label}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
