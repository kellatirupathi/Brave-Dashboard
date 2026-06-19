// Full-page team drill-down for the admin/coordinator Weekly Journals view.
// Replaces what used to be a modal popup on /admin/journals — clicking a team
// row now navigates here so the week-by-week detail gets the whole page.
import { useMemo, useState } from "react";
import { Link, useParams } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, BookOpenCheck } from "lucide-react";
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
import { JournalEditDialog } from "@/components/journal-edit-dialog";
import {
  listAdminJournals,
  deleteJournal,
  type WeeklyJournal,
  type JournalRow,
  type BlockerPriority,
  type BlockerStatus,
} from "@/lib/progress-api";
import { analyseJournalNow, updateJournalBlocker } from "@/lib/journals-ai-api";
import { TeamSnapshot, JournalDetailCard } from "@/pages/admin/journals";

type Props = {
  scope?: "admin" | "coordinator";
};

export default function JournalTeamDetail({ scope = "admin" }: Props) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const params = useParams<{ teamId: string }>();
  const teamId = Number(params.teamId);

  const backHref =
    scope === "coordinator" ? "/coordinator/journals" : "/admin/journals";

  const [editing, setEditing] = useState<WeeklyJournal | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  // Reuses the same cache key as the list page, so navigating from the table is
  // instant; a direct URL hit fetches the full (campus-scoped for coordinators)
  // set and filters client-side.
  const { data: journals, isLoading } = useQuery({
    queryKey: ["admin-journals"],
    queryFn: () => listAdminJournals(),
  });

  const team = useMemo(() => {
    if (!journals) return null;
    const mine = journals
      .filter((j) => j.teamId === teamId)
      .sort((a, b) => (a.weekStartDate < b.weekStartDate ? 1 : -1));
    if (mine.length === 0) return null;
    return {
      teamId,
      teamName: mine[0].teamName ?? `Team #${teamId}`,
      campusName: mine[0].campusName ?? null,
      journals: mine,
    };
  }, [journals, teamId]);

  function patchJournalInCache(
    id: number,
    fields: Partial<WeeklyJournal>,
  ): void {
    queryClient.setQueryData<JournalRow[]>(["admin-journals"], (old) =>
      old?.map((j) => (j.id === id ? { ...j, ...fields } : j)),
    );
  }

  const analyseOneMut = useMutation({
    mutationFn: (id: number) => analyseJournalNow(id),
    onSuccess: (res, id) => {
      if (res.journal) patchJournalInCache(id, res.journal);
      if (!res.ok && !res.journal?.aiAnalysedAt) {
        toast({
          title: "Analysis not completed",
          description: "Check that the AI key (GEMINI_API_KEY) is configured.",
          variant: "destructive",
        });
      } else {
        toast({ title: "Journal analysed" });
      }
    },
    onError: (err: Error) => {
      toast({
        title: "Analyse failed",
        description: err.message,
        variant: "destructive",
      });
    },
  });

  const blockerMut = useMutation({
    mutationFn: (vars: {
      id: number;
      body: {
        priority?: BlockerPriority;
        status?: BlockerStatus;
        note?: string | null;
      };
    }) => updateJournalBlocker(vars.id, vars.body),
    onSuccess: (updated) => {
      patchJournalInCache(updated.id, updated);
      toast({ title: "Blocker updated" });
    },
    onError: (err: Error) => {
      toast({
        title: "Update failed",
        description: err.message,
        variant: "destructive",
      });
    },
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

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <Link
        href={backHref}
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        data-testid="journal-team-back"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Weekly Journals
      </Link>

      {isLoading ? (
        <div className="flex justify-center py-16">
          <Spinner className="size-8" />
        </div>
      ) : !team ? (
        <div className="text-sm text-muted-foreground py-16 text-center">
          No journals found for this team.
        </div>
      ) : (
        <>
          <div>
            <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
              <BookOpenCheck className="h-6 w-6 text-primary" />
              {team.teamName}
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              {team.campusName ?? "—"} · {team.journals.length} journal
              {team.journals.length === 1 ? "" : "s"}
            </p>
          </div>

          <TeamSnapshot journals={team.journals} />

          <div className="space-y-4">
            {team.journals.map((j) => (
              <JournalDetailCard
                key={j.id}
                journal={j}
                analysing={
                  analyseOneMut.isPending && analyseOneMut.variables === j.id
                }
                onAnalyse={() => analyseOneMut.mutate(j.id)}
                onEdit={() => setEditing(j as unknown as WeeklyJournal)}
                onDelete={() => setDeletingId(j.id)}
                onBlocker={(body) => blockerMut.mutate({ id: j.id, body })}
                blockerSaving={blockerMut.isPending}
              />
            ))}
          </div>
        </>
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
