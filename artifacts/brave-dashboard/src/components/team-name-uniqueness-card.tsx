// Admin Config card: "Team Name Uniqueness". Shows how many teams currently
// share a name, and a button that flags every team EXCEPT the keeper in each
// group (highest verified revenue → most journals → oldest) and notifies the
// rest via an in-app popup + email. See team-name-uniqueness-api.
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { BadgeAlert, Send } from "lucide-react";
import { fetchTeamNameDuplicates } from "@/lib/team-duplicates-api";
import { notifyTeamNameDuplicates } from "@/lib/team-name-uniqueness-api";

export function TeamNameUniquenessCard() {
  const { toast } = useToast();

  const { data: dupData } = useQuery({
    queryKey: ["team-name-duplicates"],
    queryFn: fetchTeamNameDuplicates,
    staleTime: 60_000,
  });
  const groups = dupData?.groups ?? [];
  const groupCount = groups.length;
  // One team keeps its name per group; the rest are the ones that get notified.
  const affectedTeams = groups.reduce(
    (sum, g) => sum + Math.max(0, g.teams.length - 1),
    0,
  );

  const notify = useMutation({
    mutationFn: notifyTeamNameDuplicates,
    onSuccess: (res) => {
      toast({
        title: "Duplicate-name teams notified",
        description: `Flagged ${res.teamsFlagged} team(s) across ${res.duplicateGroups} duplicate name(s). ${res.emailsSent} email(s) sent.`,
      });
    },
    onError: (err: unknown) => {
      toast({
        title: "Could not notify teams",
        description:
          err instanceof Error ? err.message : "Please try again in a moment.",
        variant: "destructive",
      });
    },
  });

  return (
    <Card data-testid="card-team-name-uniqueness">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <BadgeAlert className="h-5 w-5 text-primary" />
          Team Name Uniqueness
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Some teams share the same name across campuses. Sending a notice keeps
          the strongest team's name in each group — chosen by{" "}
          <span className="font-medium text-foreground">
            highest verified revenue, then most journals submitted, then the
            oldest team
          </span>{" "}
          — and asks every other team to rename, via an in-app popup (which
          keeps re-appearing until they rename) and a friendly email to the team
          leader and members.
        </p>

        <div className="flex items-center gap-6 rounded-lg border bg-muted/30 p-3 text-sm">
          <div>
            <div className="text-xs text-muted-foreground">Duplicate names</div>
            <div className="text-xl font-bold tabular-nums">{groupCount}</div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">
              Teams to be notified
            </div>
            <div className="text-xl font-bold tabular-nums text-primary">
              {affectedTeams}
            </div>
          </div>
        </div>

        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button
              disabled={notify.isPending || groupCount === 0}
              data-testid="button-notify-duplicates"
            >
              {notify.isPending ? (
                <Spinner className="mr-2 h-4 w-4" />
              ) : (
                <Send className="mr-2 h-4 w-4" />
              )}
              Send popup &amp; email
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Notify duplicate-name teams?</AlertDialogTitle>
              <AlertDialogDescription>
                This will show a rename popup to, and email, the leader and
                members of <strong>{affectedTeams}</strong> team(s) across{" "}
                <strong>{groupCount}</strong> duplicate name(s). The
                highest-performing team in each group keeps its name and is not
                contacted. You can run this again any time.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => notify.mutate()}
                data-testid="button-confirm-notify-duplicates"
              >
                Send now
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {groupCount === 0 && (
          <p className="text-xs text-muted-foreground">
            No duplicate team names right now — nothing to send.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
