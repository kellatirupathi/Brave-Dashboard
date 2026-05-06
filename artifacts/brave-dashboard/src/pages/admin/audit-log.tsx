import { useMemo, useState } from "react";
import { useGetAuditLog } from "@workspace/api-client-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ClipboardList, User, Search, CalendarIcon, X } from "lucide-react";
import { cn } from "@/lib/utils";

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function formatDateLabel(d: Date | undefined): string {
  if (!d) return "Pick a date";
  return d.toLocaleDateString("en-IN", {
    year: "numeric",
    month: "short",
    day: "2-digit",
  });
}

export default function AdminAuditLog() {
  const { data: logs, isLoading } = useGetAuditLog({ limit: 100 });
  const [query, setQuery] = useState("");
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(undefined);
  const [datePopoverOpen, setDatePopoverOpen] = useState(false);

  const filtered = useMemo(() => {
    if (!logs) return [];
    const q = query.trim().toLowerCase();
    const dayKey = selectedDate ? isoDate(selectedDate) : null;
    return logs.filter((log) => {
      if (dayKey) {
        const logDay = new Date(log.createdAt).toISOString().slice(0, 10);
        if (logDay !== dayKey) return false;
      }
      if (!q) return true;
      return (
        (log.actorName ?? "").toLowerCase().includes(q) ||
        log.action.toLowerCase().includes(q) ||
        log.action.replace(/_/g, " ").toLowerCase().includes(q) ||
        (log.targetType ?? "").toLowerCase().includes(q) ||
        String(log.targetId ?? "")
          .toLowerCase()
          .includes(q) ||
        (log.details ?? "").toLowerCase().includes(q)
      );
    });
  }, [logs, query, selectedDate]);

  const anyFilter = query.trim() !== "" || selectedDate != null;
  const clearFilters = () => {
    setQuery("");
    setSelectedDate(undefined);
  };

  if (isLoading)
    return (
      <div className="flex h-64 items-center justify-center">
        <Spinner size="lg" />
      </div>
    );

  return (
    <div className="space-y-6 max-w-6xl mx-auto w-full">
      {/* Header row — title (left) + search (middle) + date filter (right) */}
      <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">
            System Audit Log
          </h1>
          <p className="text-muted-foreground mt-1">
            Immutable record of critical system actions
          </p>
        </div>
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full lg:w-auto">
          <div className="relative flex-1 sm:w-72">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search actor, action, target, or details"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="pl-9"
              data-testid="audit-search"
            />
          </div>
          <Popover open={datePopoverOpen} onOpenChange={setDatePopoverOpen}>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                className={cn(
                  "justify-start gap-2 sm:w-56",
                  !selectedDate && "text-muted-foreground",
                )}
                data-testid="audit-date-filter"
              >
                <CalendarIcon className="h-4 w-4" />
                {formatDateLabel(selectedDate)}
              </Button>
            </PopoverTrigger>
            <PopoverContent
              // Match the trigger button's width (sm:w-56 = 14rem = 224px)
              // so the calendar fills the same horizontal footprint as the
              // "Pick a date" button instead of shrinking to its content.
              className="w-[var(--radix-popover-trigger-width)] min-w-[280px] p-0"
              align="end"
              onCloseAutoFocus={(e) => e.preventDefault()}
            >
              <Calendar
                mode="single"
                selected={selectedDate}
                onSelect={(d) => {
                  setSelectedDate(d);
                  if (d) setDatePopoverOpen(false);
                }}
                captionLayout="dropdown"
                initialFocus
              />
              {selectedDate && (
                <div className="border-t p-2 flex justify-end">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setSelectedDate(undefined);
                      setDatePopoverOpen(false);
                    }}
                    data-testid="audit-date-clear"
                  >
                    <X className="w-3.5 h-3.5 mr-1" />
                    Clear date
                  </Button>
                </div>
              )}
            </PopoverContent>
          </Popover>
          {anyFilter && (
            <button
              type="button"
              onClick={clearFilters}
              className="text-xs text-muted-foreground hover:text-foreground underline-offset-2 hover:underline px-2 py-1 inline-flex items-center gap-1 self-center"
              data-testid="audit-clear-filters"
            >
              <X className="w-3.5 h-3.5" />
              Clear filters
            </button>
          )}
        </div>
      </div>

      <Card className="overflow-hidden">
        <CardHeader className="border-b bg-muted/20">
          <CardTitle className="text-lg flex items-center justify-between gap-2">
            <span className="flex items-center">
              <ClipboardList className="w-5 h-5 mr-2 text-primary" /> Activity
              Trail
            </span>
            <span className="text-xs font-normal text-muted-foreground">
              {filtered.length} of {logs?.length ?? 0} entries
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="divide-y">
            {filtered.map((log) => (
              <div
                key={log.id}
                className="p-4 sm:p-5 flex gap-3 sm:gap-4 hover:bg-muted/10 transition-colors"
              >
                <div className="w-10 h-10 rounded-full bg-secondary flex items-center justify-center shrink-0">
                  <User className="w-5 h-5 text-muted-foreground" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-1 sm:gap-4">
                    <p className="text-sm leading-relaxed break-words">
                      <span className="font-semibold text-foreground">
                        {log.actorName}
                      </span>{" "}
                      <span className="text-muted-foreground">
                        {log.action.replace(/_/g, " ")}
                      </span>{" "}
                      <span className="font-medium text-foreground">
                        {log.targetType}
                      </span>
                      {log.targetId ? ` #${log.targetId}` : ""}
                    </p>
                    <span className="text-xs text-muted-foreground whitespace-nowrap shrink-0">
                      {new Date(log.createdAt).toLocaleString("en-IN")}
                    </span>
                  </div>
                  {log.details && (
                    <div className="mt-2 text-xs bg-muted/40 p-3 rounded-md text-muted-foreground font-mono whitespace-pre-wrap break-all max-h-60 overflow-auto">
                      {log.details}
                    </div>
                  )}
                </div>
              </div>
            ))}
            {filtered.length === 0 && (
              <div className="p-8 text-center text-muted-foreground">
                {anyFilter
                  ? "No entries match the current filters."
                  : "No activity logged yet."}
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
