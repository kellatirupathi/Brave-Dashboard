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

  useEffect(() => {
    if (open && journal) {
      setWhatWeDid(journal.whatWeDid);
      setBlockers(journal.blockers ?? "");
      setNextWeekPlan(journal.nextWeekPlan ?? "");
    }
  }, [open, journal?.id]);

  const mut = useMutation({
    mutationFn: (body: {
      whatWeDid: string;
      blockers: string | null;
      nextWeekPlan: string | null;
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
    mut.mutate({
      whatWeDid: whatWeDid.trim(),
      blockers: blockers.trim() ? blockers.trim() : null,
      nextWeekPlan: nextWeekPlan.trim() ? nextWeekPlan.trim() : null,
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
