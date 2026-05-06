import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  BookOpenCheck,
  Search,
  AlertTriangle,
  Pencil,
  Trash2,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { JournalEditDialog } from "@/components/journal-edit-dialog";
import {
  listAdminJournals,
  getJournalCoverage,
  deleteJournal,
  type JournalRow,
  type WeeklyJournal,
} from "@/lib/progress-api";

export default function AdminJournals() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<WeeklyJournal | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const { data: journals, isLoading } = useQuery({
    queryKey: ["admin-journals"],
    queryFn: () => listAdminJournals(),
  });

  const deleteMut = useMutation({
    mutationFn: deleteJournal,
    onSuccess: () => {
      toast({ title: "Journal deleted" });
      queryClient.invalidateQueries({ queryKey: ["admin-journals"] });
      queryClient.invalidateQueries({ queryKey: ["admin-journals-coverage"] });
      setDeletingId(null);
    },
    onError: (err: Error) => {
      toast({
        title: "Delete failed",
        description: err.message,
        variant: "destructive",
      });
    },
  });
  const { data: coverage } = useQuery({
    queryKey: ["admin-journals-coverage"],
    queryFn: getJournalCoverage,
  });
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState<"submitted" | "missed">("submitted");

  const filtered = useMemo(() => {
    if (!journals) return [];
    const q = query.trim().toLowerCase();
    return journals.filter((j) => {
      if (!q) return true;
      return (
        (j.teamName ?? "").toLowerCase().includes(q) ||
        (j.campusName ?? "").toLowerCase().includes(q) ||
        (j.submittedByName ?? "").toLowerCase().includes(q) ||
        j.whatWeDid.toLowerCase().includes(q)
      );
    });
  }, [journals, query]);

  const missedTeams = useMemo(() => {
    if (!coverage) return [];
    const q = query.trim().toLowerCase();
    return coverage
      .filter((t) => t.missedWeeks > 0)
      .filter((t) => {
        if (!q) return true;
        return (
          t.teamName.toLowerCase().includes(q) ||
          (t.campusName ?? "").toLowerCase().includes(q)
        );
      });
  }, [coverage, query]);

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <BookOpenCheck className="h-6 w-6 text-primary" />
          Weekly Journals
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          See which teams are submitting their weekly check-ins and which are
          silent.
        </p>
      </div>

      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by team, campus, member name, or content"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="pl-9"
            data-testid="journals-search"
          />
        </div>
        <div className="flex gap-1">
          {(
            [
              { v: "submitted", label: "Submitted" },
              { v: "missed", label: "Teams missing journals" },
            ] as const
          ).map((b) => (
            <button
              key={b.v}
              type="button"
              onClick={() => setTab(b.v)}
              className={cn(
                "px-3 py-1.5 text-xs rounded-md border transition-colors",
                tab === b.v
                  ? "bg-primary text-primary-foreground border-primary"
                  : "hover:bg-accent",
              )}
            >
              {b.label}
            </button>
          ))}
        </div>
      </div>

      {tab === "submitted" ? (
        <Card>
          <CardHeader>
            <CardTitle>Submitted journals</CardTitle>
            <CardDescription>
              {filtered.length} of {journals?.length ?? 0} entries
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex justify-center py-12">
                <Spinner className="size-8" />
              </div>
            ) : filtered.length === 0 ? (
              <div className="text-sm text-muted-foreground py-12 text-center">
                No journals match.
              </div>
            ) : (
              <div className="space-y-3">
                {filtered.map((j) => (
                  <div
                    key={j.id}
                    className="border rounded-lg p-4 hover:bg-accent/30"
                    data-testid={`admin-journal-row-${j.id}`}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2 mb-2">
                      <div>
                        <div className="text-sm font-medium">
                          {j.teamName ?? `Team #${j.teamId}`}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {j.campusName ?? "—"} · Week {j.weekStartDate} →{" "}
                          {j.weekEndDate}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground">
                          by {j.submittedByName ?? "?"} ·{" "}
                          {new Date(j.submittedAt).toLocaleString()}
                        </span>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 px-2"
                          onClick={() =>
                            setEditing(j as unknown as WeeklyJournal)
                          }
                          data-testid={`edit-journal-${j.id}`}
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 px-2 text-destructive hover:text-destructive"
                          onClick={() => setDeletingId(j.id)}
                          data-testid={`delete-journal-${j.id}`}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </div>
                    <div className="space-y-2 text-sm">
                      <p className="whitespace-pre-wrap">
                        <span className="text-xs uppercase font-semibold text-muted-foreground">
                          What we did:{" "}
                        </span>
                        {j.whatWeDid}
                      </p>
                      {j.blockers && (
                        <p className="whitespace-pre-wrap">
                          <span className="text-xs uppercase font-semibold text-muted-foreground">
                            Blockers:{" "}
                          </span>
                          {j.blockers}
                        </p>
                      )}
                      {j.nextWeekPlan && (
                        <p className="whitespace-pre-wrap">
                          <span className="text-xs uppercase font-semibold text-muted-foreground">
                            Next week:{" "}
                          </span>
                          {j.nextWeekPlan}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Coverage gaps (last 12 weeks)</CardTitle>
            <CardDescription>
              {missedTeams.length} teams have missed at least one journal week
            </CardDescription>
          </CardHeader>
          <CardContent>
            {!coverage ? (
              <div className="flex justify-center py-12">
                <Spinner className="size-8" />
              </div>
            ) : missedTeams.length === 0 ? (
              <div className="text-sm text-muted-foreground py-12 text-center">
                Everyone is fully covered. Nice.
              </div>
            ) : (
              <div className="space-y-2">
                {missedTeams.map((t) => (
                  <div
                    key={t.teamId}
                    className={cn(
                      "flex items-center justify-between gap-2 p-3 rounded-md border",
                      t.submittedWeeks === 0
                        ? "bg-red-50/60 border-red-200"
                        : "bg-amber-50/40 border-amber-200",
                    )}
                  >
                    <div className="min-w-0">
                      <div className="text-sm font-medium truncate">
                        {t.teamName}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {t.campusName ?? "—"} ·{" "}
                        {t.lastSubmittedWeek
                          ? `last submitted week ${t.lastSubmittedWeek}`
                          : "never submitted"}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <Badge
                        className={
                          t.submittedWeeks === 0
                            ? "bg-red-100 text-red-700 hover:bg-red-100"
                            : "bg-amber-100 text-amber-700 hover:bg-amber-100"
                        }
                      >
                        {t.submittedWeeks === 0 ? (
                          <>
                            <AlertTriangle className="w-3 h-3 mr-1" />
                            never submitted
                          </>
                        ) : (
                          `${t.submittedWeeks}/${t.totalWeeks} weeks`
                        )}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <JournalEditDialog
        open={editing !== null}
        onOpenChange={(o) => !o && setEditing(null)}
        journal={editing}
        invalidateKeys={[["admin-journals"], ["admin-journals-coverage"]]}
      />

      <AlertDialog
        open={deletingId !== null}
        onOpenChange={(o) => !o && setDeletingId(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this journal?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently deletes the journal entry. The action is logged
              to the audit log and cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() =>
                deletingId !== null && deleteMut.mutate(deletingId)
              }
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-testid="confirm-delete-journal"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
