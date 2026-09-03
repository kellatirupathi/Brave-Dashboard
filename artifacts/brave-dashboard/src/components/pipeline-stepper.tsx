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
}: {
  status: PipelineStatus;
  className?: string;
}) {
  return (
    <div className={cn("w-full", className)}>
      <ol className="flex flex-col gap-4 sm:flex-row sm:items-start sm:gap-0">
        {status.steps.map((s, i) => {
          const Icon = STATE_ICON[s.state] ?? STEP_ICON[s.key];
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
                  <Icon className="h-4 w-4" aria-hidden="true" />
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

      {/* Advisory mode note. The A/B/C gate legend that used to sit here was
          removed: the step captions already say what each step needs, and the
          full rules live in the role documentation. */}
      {status.enforced === false ? (
        <p className="mt-5 border-t pt-4 text-xs text-muted-foreground">
          These checks are recommendations this season — every step is open.
          Reviewers still see which ones were met.
        </p>
      ) : null}
    </div>
  );
}
