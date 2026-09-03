// The 5-step Season 2 pipeline stepper.
//
// Every step's state comes from the SERVER (GET /pipeline/status), never from
// local inference. That is deliberate: the same gate code that governs the
// buttons produces these states, so the stepper can never tell a student they
// may proceed when the API would refuse them.
import {
  Check,
  Lock,
  AlertTriangle,
  Handshake,
  MessagesSquare,
  FolderKanban,
  IndianRupee,
  FileCheck2,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { PipelineStatus, StepState } from "@/lib/leads-api";

// One icon per step, so a glance at the ring says WHICH step it is rather
// than only how far along it is. Keyed on the step key the server sends.
const STEP_ICON: Record<PipelineStatus["steps"][number]["key"], LucideIcon> = {
  capture: Handshake,
  work: MessagesSquare,
  project: FolderKanban,
  payment: IndianRupee,
  brd: FileCheck2,
};

// A completed or blocked step overrides its own icon, because the state is
// the more urgent thing to read there.
const STATE_ICON: Partial<Record<StepState, LucideIcon>> = {
  complete: Check,
  blocked: AlertTriangle,
  locked: Lock,
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
  compact = false,
}: {
  status: PipelineStatus;
  className?: string;
  /**
   * Phone layout: all five steps stay on ONE row, with smaller rings, shorter
   * type and dashed connectors, so the journey costs a strip rather than a
   * screen. The desktop stepper is unchanged.
   */
  compact?: boolean;
}) {
  return (
    <div className={cn("w-full", className)}>
      <ol
        className={cn(
          compact
            ? "flex items-start gap-0"
            : "flex flex-col gap-4 sm:flex-row sm:items-start sm:gap-0",
        )}
      >
        {status.steps.map((s, i) => {
          const Icon = STATE_ICON[s.state] ?? STEP_ICON[s.key];
          const isLast = i === status.steps.length - 1;
          return (
            <li
              key={s.key}
              className={cn(
                "flex flex-1",
                compact
                  ? "min-w-0 flex-col items-center text-center"
                  : "items-start gap-3 sm:flex-col sm:items-center sm:text-center",
              )}
            >
              <div className={cn("flex items-center", compact ? "w-full" : "sm:w-full")}>
                {/* Left connector — hidden on the first step and on mobile,
                    where the list stacks vertically. */}
                <span
                  className={cn(
                    "flex-1 border-t border-dashed border-border",
                    compact ? "block" : "hidden sm:block",
                    i === 0 && "invisible",
                  )}
                />
                <span
                  className={cn(
                    "flex shrink-0 items-center justify-center rounded-full border-2 font-semibold",
                    compact ? "h-7 w-7" : "h-8 w-8 text-xs",
                    RING[s.state],
                  )}
                >
                  <Icon
                    className={compact ? "h-3.5 w-3.5" : "h-4 w-4"}
                    aria-hidden="true"
                  />
                </span>
                <span
                  className={cn(
                    "flex-1 border-t border-dashed border-border",
                    compact ? "block" : "hidden sm:block",
                    isLast && "invisible",
                  )}
                />
              </div>
              <div className={compact ? "mt-1.5 px-0.5" : "sm:mt-2 sm:px-2"}>
                <p
                  className={cn(
                    "leading-tight",
                    compact ? "text-[10px]" : "text-sm",
                    LABEL_TONE[s.state],
                  )}
                >
                  {s.label}
                </p>
                <p
                  className={cn(
                    "mt-0.5 leading-tight text-muted-foreground",
                    compact ? "text-[9px]" : "text-xs",
                  )}
                >
                  {s.caption}
                </p>
              </div>
            </li>
          );
        })}
      </ol>

      {/* Advisory mode note. The A/B/C gate legend that used to sit here was
          removed: the step captions already say what each step needs, and the
          full rules live in the role documentation. */}
      {status.enforced === false && !compact ? (
        <p className="mt-5 border-t pt-4 text-xs text-muted-foreground">
          These checks are recommendations this season — every step is open.
          Reviewers still see which ones were met.
        </p>
      ) : null}
    </div>
  );
}
