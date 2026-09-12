// Ticket status pill, shared by the student and staff ticket pages.
//
// The same status reads differently to each side: a student wants to know
// whether anybody has picked it up ("Being looked at", "Answered"); staff care
// whether it is still their work ("In progress", "Closed").
import { CheckCircle2, Clock, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { TicketStatus } from "@/lib/tickets-api";

const LABELS: Record<"student" | "staff", Record<TicketStatus, string>> = {
  student: { open: "Open", in_progress: "Being looked at", resolved: "Answered" },
  staff: { open: "Open", in_progress: "In progress", resolved: "Closed" },
};

const STYLES: Record<TicketStatus, string> = {
  open: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-900",
  in_progress:
    "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-900",
  resolved:
    "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-900",
};

const ICONS: Record<TicketStatus, typeof Clock> = {
  open: Clock,
  in_progress: Loader2,
  resolved: CheckCircle2,
};

export function TicketStatusBadge({
  status,
  audience,
  className,
}: {
  status: TicketStatus;
  audience: "student" | "staff";
  className?: string;
}) {
  const Icon = ICONS[status];
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium",
        STYLES[status],
        className,
      )}
    >
      <Icon className="h-3 w-3" aria-hidden="true" />
      {LABELS[audience][status]}
    </span>
  );
}
