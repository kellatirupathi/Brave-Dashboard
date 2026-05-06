import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Calendar, RotateCcw, AlertTriangle, Lock } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import {
  listAdminProgrammeWeeks,
  regenerateProgrammeWeeks,
  toggleProgrammeWeek,
  clearProgrammeWeekOverride,
  type ProgrammeWeek,
} from "@/lib/progress-api";

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function statusOf(w: ProgrammeWeek): "current" | "past" | "future" {
  const today = todayIso();
  if (w.endDate < today) return "past";
  if (w.startDate > today) return "future";
  return "current";
}

export function ProgrammeWeeksManager() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const QUERY_KEY = ["admin-programme-weeks"];

  const { data: weeks, isLoading } = useQuery({
    queryKey: QUERY_KEY,
    queryFn: listAdminProgrammeWeeks,
  });

  const regenMut = useMutation({
    mutationFn: regenerateProgrammeWeeks,
    onSuccess: (r) => {
      toast({
        title: "Weeks regenerated",
        description: `${r.total} weeks · +${r.created} created · ${r.updated} updated · ${r.removed} removed`,
      });
      queryClient.invalidateQueries({ queryKey: QUERY_KEY });
    },
    onError: (err: Error) => {
      toast({
        title: "Regenerate failed",
        description: err.message,
        variant: "destructive",
      });
    },
  });

  const toggleMut = useMutation({
    mutationFn: ({ id, isOpen }: { id: number; isOpen: boolean }) =>
      toggleProgrammeWeek(id, isOpen),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEY });
    },
    onError: (err: Error) => {
      toast({
        title: "Toggle failed",
        description: err.message,
        variant: "destructive",
      });
    },
  });

  const clearOverrideMut = useMutation({
    mutationFn: (id: number) => clearProgrammeWeekOverride(id),
    onSuccess: () => {
      toast({ title: "Override cleared — cron will resume control" });
      queryClient.invalidateQueries({ queryKey: QUERY_KEY });
    },
    onError: (err: Error) => {
      toast({
        title: "Clear override failed",
        description: err.message,
        variant: "destructive",
      });
    },
  });

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Calendar className="w-5 h-5 text-primary" />
              Programme Weeks
            </CardTitle>
            <CardDescription>
              Auto-generated 7-day chunks from your start date. Weeks open
              automatically when their start date arrives. Manual toggles stick
              until you clear the override.
            </CardDescription>
          </div>
          <Button
            variant="outline"
            size="sm"
            disabled={regenMut.isPending}
            onClick={() => regenMut.mutate()}
            data-testid="regenerate-weeks"
          >
            <RotateCcw className="w-4 h-4 mr-1" />
            {regenMut.isPending ? "Regenerating…" : "Regenerate from dates"}
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex justify-center py-12">
            <Spinner className="size-8" />
          </div>
        ) : !weeks || weeks.length === 0 ? (
          <div className="text-sm text-muted-foreground py-12 text-center">
            <AlertTriangle className="w-6 h-6 mx-auto mb-2 text-amber-500" />
            No weeks generated yet. Save your start/end dates above first, then
            click &quot;Regenerate from dates&quot;.
          </div>
        ) : (
          <div className="space-y-2">
            {weeks.map((w) => {
              const s = statusOf(w);
              return (
                <div
                  key={w.id}
                  className={cn(
                    "flex items-center justify-between gap-3 p-3 rounded-md border",
                    s === "current" && "bg-emerald-50/40 border-emerald-200",
                    s === "past" && "bg-muted/20",
                    s === "future" && "bg-amber-50/30 border-amber-200",
                  )}
                  data-testid={`week-row-${w.weekNumber}`}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-sm">
                        Week {w.weekNumber}
                      </span>
                      {s === "current" && (
                        <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100 text-xs">
                          Current
                        </Badge>
                      )}
                      {s === "past" && (
                        <Badge variant="outline" className="text-xs">
                          Past
                        </Badge>
                      )}
                      {s === "future" && (
                        <Badge className="bg-amber-100 text-amber-700 hover:bg-amber-100 text-xs">
                          Future
                        </Badge>
                      )}
                      {w.manualOverride && (
                        <Badge className="bg-blue-100 text-blue-700 hover:bg-blue-100 text-xs">
                          <Lock className="w-3 h-3 mr-1" />
                          Manual
                        </Badge>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {w.startDate} → {w.endDate}
                    </div>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    {w.manualOverride && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => clearOverrideMut.mutate(w.id)}
                        disabled={clearOverrideMut.isPending}
                        title="Clear manual override — cron resumes auto-control"
                        data-testid={`week-clear-${w.weekNumber}`}
                      >
                        Clear
                      </Button>
                    )}
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">
                        {w.isOpen ? "Open" : "Closed"}
                      </span>
                      <Switch
                        checked={w.isOpen}
                        disabled={toggleMut.isPending}
                        onCheckedChange={(c) =>
                          toggleMut.mutate({ id: w.id, isOpen: c })
                        }
                        data-testid={`week-toggle-${w.weekNumber}`}
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
