import { useState } from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

type CampusOption = { id: number; name: string };

// A searchable + scrollable "campus" filter dropdown. `value` is the campus id
// as a string, or "all" for no filter. Additive/reusable — the caller owns the
// value/state; this only renders the picker and reports the chosen value.
export function CampusCombobox({
  campuses,
  value,
  onChange,
  className,
  testId,
}: {
  campuses: CampusOption[];
  value: string; // "all" | "<campusId>"
  onChange: (value: string) => void;
  className?: string;
  testId?: string;
}) {
  const [open, setOpen] = useState(false);
  const selected =
    value === "all" ? null : campuses.find((c) => String(c.id) === value);
  const label =
    value === "all" ? "All campuses" : (selected?.name ?? "All campuses");

  const choose = (v: string) => {
    onChange(v);
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn("w-[200px] justify-between font-normal", className)}
          data-testid={testId}
        >
          <span className="truncate">{label}</span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[240px] p-0" align="start">
        <Command>
          <CommandInput placeholder="Search campus…" />
          <CommandList className="max-h-72">
            <CommandEmpty>No campus found.</CommandEmpty>
            <CommandGroup>
              <CommandItem value="All campuses" onSelect={() => choose("all")}>
                <Check
                  className={cn(
                    "mr-2 h-4 w-4",
                    value === "all" ? "opacity-100" : "opacity-0",
                  )}
                />
                All campuses
              </CommandItem>
              {campuses.map((c) => (
                <CommandItem
                  key={c.id}
                  value={c.name}
                  onSelect={() => choose(String(c.id))}
                >
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4",
                      value === String(c.id) ? "opacity-100" : "opacity-0",
                    )}
                  />
                  {c.name}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
