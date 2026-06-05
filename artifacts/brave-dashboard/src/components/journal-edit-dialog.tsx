import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { updateJournal, type WeeklyJournal } from "@/lib/progress-api";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  journal: WeeklyJournal | null;
  /** React Query keys to invalidate after a successful save. */
  invalidateKeys?: ReadonlyArray<readonly unknown[]>;
};

export function JournalEditDialog({
  open,
  onOpenChange,
  journal,
  invalidateKeys = [],
}: Props) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [whatWeDid, setWhatWeDid] = useState("");
  const [blockers, setBlockers] = useState("");
  const [nextWeekPlan, setNextWeekPlan] = useState("");
  const [clientsVisited, setClientsVisited] = useState<string>("0");
  const [activeConversations, setActiveConversations] = useState<string>("0");
  const [projectsStarted, setProjectsStarted] = useState<string>("0");
  const [projectsClosed, setProjectsClosed] = useState<string>("0");

  useEffect(() => {
    if (open && journal) {
      setWhatWeDid(journal.whatWeDid);
      setBlockers(journal.blockers ?? "");
      setNextWeekPlan(journal.nextWeekPlan ?? "");
      setClientsVisited(String(journal.clientsVisited ?? 0));
      setActiveConversations(String(journal.activeConversations ?? 0));
      setProjectsStarted(String(journal.projectsStarted ?? 0));
      setProjectsClosed(String(journal.projectsClosed ?? 0));
    }
  }, [open, journal?.id]);

  const mut = useMutation({
    mutationFn: (body: {
      whatWeDid: string;
      blockers: string | null;
      nextWeekPlan: string | null;
      clientsVisited: number;
      activeConversations: number;
      projectsStarted: number;
      projectsClosed: number;
    }) => updateJournal(journal!.id, body),
    onSuccess: () => {
      toast({ title: "Journal updated" });
      for (const key of invalidateKeys) {
        queryClient.invalidateQueries({ queryKey: key as unknown[] });
      }
      onOpenChange(false);
    },
    onError: (err: Error) => {
      toast({
        title: "Update failed",
        description: err.message,
        variant: "destructive",
      });
    },
  });

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!journal) return;
    if (whatWeDid.trim().length < 5) {
      toast({
        title: "&quot;What we did&quot; needs at least 5 characters",
        variant: "destructive",
      });
      return;
    }
    const toCount = (s: string): number => {
      const n = parseInt(s, 10);
      return Number.isFinite(n) && n >= 0 ? n : 0;
    };
    mut.mutate({
      whatWeDid: whatWeDid.trim(),
      blockers: blockers.trim() ? blockers.trim() : null,
      nextWeekPlan: nextWeekPlan.trim() ? nextWeekPlan.trim() : null,
      clientsVisited: toCount(clientsVisited),
      activeConversations: toCount(activeConversations),
      projectsStarted: toCount(projectsStarted),
      projectsClosed: toCount(projectsClosed),
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Edit weekly journal</DialogTitle>
          <DialogDescription>
            {journal
              ? `Week of ${journal.weekStartDate} → ${journal.weekEndDate}`
              : ""}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <label className="text-sm font-medium block mb-1">
              What did your team do this week?
            </label>
            <Textarea
              rows={4}
              value={whatWeDid}
              onChange={(e) => setWhatWeDid(e.target.value)}
              maxLength={2000}
              required
              data-testid="edit-journal-what"
            />
          </div>
          <div>
            <label className="text-sm font-medium block mb-1">
              Blockers (optional)
            </label>
            <Textarea
              rows={3}
              value={blockers}
              onChange={(e) => setBlockers(e.target.value)}
              maxLength={2000}
              data-testid="edit-journal-blockers"
            />
          </div>
          <div>
            <label className="text-sm font-medium block mb-1">
              Plan for next week (optional)
            </label>
            <Textarea
              rows={3}
              value={nextWeekPlan}
              onChange={(e) => setNextWeekPlan(e.target.value)}
              maxLength={2000}
              data-testid="edit-journal-next-plan"
            />
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {(
              [
                {
                  label: "Clients visited",
                  value: clientsVisited,
                  setValue: setClientsVisited,
                  testId: "edit-journal-clients-visited",
                },
                {
                  label: "Active conversations",
                  value: activeConversations,
                  setValue: setActiveConversations,
                  testId: "edit-journal-active-conversations",
                },
                {
                  label: "Projects started",
                  value: projectsStarted,
                  setValue: setProjectsStarted,
                  testId: "edit-journal-projects-started",
                },
                {
                  label: "Projects complete",
                  value: projectsClosed,
                  setValue: setProjectsClosed,
                  testId: "edit-journal-projects-closed",
                },
              ] as const
            ).map((f) => (
              <div key={f.label}>
                <label className="text-xs font-medium block mb-1 text-muted-foreground">
                  {f.label}
                </label>
                <input
                  type="number"
                  min={0}
                  max={100000}
                  step={1}
                  inputMode="numeric"
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  value={f.value}
                  onChange={(e) => f.setValue(e.target.value)}
                  data-testid={f.testId}
                />
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={mut.isPending}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={mut.isPending}
              data-testid="edit-journal-save"
            >
              {mut.isPending ? "Saving…" : "Save changes"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
