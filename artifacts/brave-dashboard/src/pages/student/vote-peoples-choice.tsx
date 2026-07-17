// Student People's Choice Award vote page — /vote/people-choice-award.
//
// Two fields: pick a team, add a comment, submit. The caller's own team is
// never in the list (the server strips it), so self-voting isn't offered.
// One vote per person and it can't be changed — so the page makes that plain
// before submitting, and shows a "thanks" state afterwards.
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CheckCircle2, Info, Trophy } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { castPcaVote, getPcaMe } from "@/lib/pca-api";
import { PCA_ME_KEY } from "@/components/pca-vote-banner";

export default function VotePeoplesChoice() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [teamId, setTeamId] = useState<string>("");
  const [comments, setComments] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: PCA_ME_KEY,
    queryFn: getPcaMe,
  });

  const vote = useMutation({
    mutationFn: () =>
      castPcaVote({
        votedTeamId: Number(teamId),
        comments: comments.trim() || undefined,
      }),
    onSuccess: () => {
      // Toast lands top-right — the app's Toaster is anchored there.
      toast({
        title: "Vote submitted",
        description: "Thanks — your vote has been counted.",
      });
      // Refreshes this page into its thanks state AND clears the banner.
      queryClient.invalidateQueries({ queryKey: PCA_ME_KEY });
    },
    onError: (err: unknown) =>
      toast({
        title: "Could not submit your vote",
        description: err instanceof Error ? err.message : "Please try again.",
        variant: "destructive",
      }),
  });

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }
  if (!data) return null;

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight sm:text-3xl">
          <Trophy className="h-6 w-6 shrink-0 text-primary sm:h-7 sm:w-7" />
          People's Choice Award
        </h1>
        <p className="text-muted-foreground">
          Vote for the team whose work impressed you most.
        </p>
      </div>

      {data.hasVoted ? (
        <Card data-testid="card-pca-voted">
          <CardContent className="space-y-2 py-10 text-center">
            <CheckCircle2 className="mx-auto h-10 w-10 text-emerald-600" />
            <p className="font-medium">Thanks — your vote is in.</p>
            <p className="text-sm text-muted-foreground">
              You get one vote for the People's Choice Award, so this can't be
              changed. Results will be shared soon.
            </p>
          </CardContent>
        </Card>
      ) : !data.eligible ? (
        <Card>
          <CardContent className="py-10 text-center">
            <Trophy className="mx-auto mb-3 h-8 w-8 opacity-40" />
            <p className="font-medium">Voting isn't open for your team</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Only teams that have crossed the revenue milestone can take part.
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card data-testid="card-pca-form">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Cast your vote</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-start gap-2 rounded-md border bg-muted/40 p-3 text-xs text-muted-foreground">
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <p>
                You get <span className="font-medium">one vote</span> and it
                can't be changed once submitted. Your own team isn't listed —
                you can't vote for yourself.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="pca-team">Team</Label>
              <Select value={teamId} onValueChange={setTeamId}>
                <SelectTrigger id="pca-team" data-testid="select-pca-team">
                  <SelectValue placeholder="Choose a team…" />
                </SelectTrigger>
                {/* Explicit cap: the shared default only limits height to the
                    space below the trigger, so a long candidate list runs off
                    the page instead of scrolling inside its own menu. */}
                <SelectContent className="max-h-[300px]">
                  {data.teams.map((t) => (
                    <SelectItem key={t.id} value={String(t.id)}>
                      {t.name}
                      {t.campusName ? ` — ${t.campusName}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {data.teams.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  No other teams are in the running yet.
                </p>
              ) : null}
            </div>

            <div className="space-y-2">
              <Label htmlFor="pca-comments">Comments</Label>
              <Textarea
                id="pca-comments"
                value={comments}
                onChange={(e) => setComments(e.target.value)}
                rows={4}
                maxLength={2000}
                placeholder="What stood out about their work?"
                data-testid="input-pca-comments"
              />
            </div>

            <div className="flex justify-end">
              <Button
                onClick={() => vote.mutate()}
                disabled={!teamId || vote.isPending}
                data-testid="button-submit-pca-vote"
              >
                {vote.isPending ? (
                  <Spinner className="mr-2 h-4 w-4" />
                ) : (
                  <Trophy className="mr-2 h-4 w-4" />
                )}
                Submit vote
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
