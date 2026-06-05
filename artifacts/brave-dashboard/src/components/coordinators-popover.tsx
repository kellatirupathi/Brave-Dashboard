import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { UserCog } from "lucide-react";

export type CampusCoordinator = { id: string; name: string };

/**
 * Renders a campus's coordinators as "FirstName +N". When there's more than
 * one, the chip is clickable and opens a small popover listing every
 * coordinator. The popover auto-flips up or down depending on available space
 * (Radix collision handling) and renders in a portal so it escapes table
 * overflow boundaries. Falls back to a single legacy name, then "Unassigned".
 */
export function CoordinatorsCell({
  coordinators,
  fallbackName,
  align = "start",
}: {
  coordinators?: CampusCoordinator[] | null;
  fallbackName?: string | null;
  align?: "start" | "center" | "end";
}) {
  const list = (coordinators ?? []).filter((c) => c.name && c.name.trim());

  if (list.length === 0) {
    if (fallbackName && fallbackName.trim()) {
      return <span>{fallbackName}</span>;
    }
    return <span className="text-muted-foreground">Unassigned</span>;
  }

  const [first, ...rest] = list;

  if (rest.length === 0) {
    return <span>{first.name}</span>;
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          onClick={(e) => e.stopPropagation()}
          className="inline-flex max-w-full items-center gap-1.5 rounded-md px-1.5 py-0.5 text-left align-middle transition-colors hover:bg-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          data-testid="coordinators-trigger"
        >
          <span className="truncate">{first.name}</span>
          <span className="shrink-0 rounded-full bg-primary/10 px-1.5 py-0.5 text-xs font-semibold text-primary">
            +{rest.length}
          </span>
        </button>
      </PopoverTrigger>
      <PopoverContent
        align={align}
        side="bottom"
        sideOffset={6}
        collisionPadding={12}
        className="w-64 p-0"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-b px-3 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Coordinators ({list.length})
        </div>
        <ul className="max-h-64 overflow-y-auto py-1">
          {list.map((c) => (
            <li
              key={c.id}
              className="flex items-center gap-2 px-3 py-1.5 text-sm"
            >
              <UserCog className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <span className="truncate">{c.name}</span>
            </li>
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  );
}
