// Shared admin view of pending "Request to submit" requests. Shows team name,
// leader name, requested date/time, and the purpose text, with an Enable
// action that turns on that team's submission exemption (which also resolves
// the request). Used on the Config "Teams Submissions" page and the
// Communications → Submission Requests page.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Check, Inbox } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { formatDateTime } from "@/lib/format";
import {
  listSubmissionRequests,
  setTeamExemptions,
  type SubmissionRequest,
} from "@/lib/team-submissions-api";

export const SUBMISSION_REQUESTS_KEY = ["admin-submission-requests"];

export function SubmissionRequestsList() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: SUBMISSION_REQUESTS_KEY,
    queryFn: listSubmissionRequests,
  });
  const items: SubmissionRequest[] = data?.items ?? [];

  const enable = useMutation({
    mutationFn: (teamId: number) =>
      setTeamExemptions({ teamId, enabled: true }),
    onSuccess: () => {
      toast({ title: "Team enabled" });
      queryClient.invalidateQueries({ queryKey: SUBMISSION_REQUESTS_KEY });
      queryClient.invalidateQueries({ queryKey: ["admin-team-exemptions"] });
    },
    onError: (err: unknown) =>
      toast({
        title: "Could not enable team",
        description: err instanceof Error ? err.message : "Please try again.",
        variant: "destructive",
      }),
  });

  if (isLoading) {
    return (
      <div className="flex justify-center py-8">
        <Spinner />
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="rounded-md border border-dashed py-10 text-center text-sm text-muted-foreground">
        <Inbox className="mx-auto mb-3 h-8 w-8 opacity-40" />
        No pending requests.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-md border">
      <table className="w-full text-sm">
        <thead className="bg-muted/50">
          <tr className="text-left">
            <th className="p-3 font-medium">Team</th>
            <th className="p-3 font-medium">Leader</th>
            <th className="p-3 font-medium">Campus</th>
            <th className="p-3 font-medium whitespace-nowrap">Requested</th>
            <th className="p-3 font-medium">Purpose</th>
            <th className="p-3 font-medium text-right">Action</th>
          </tr>
        </thead>
        <tbody>
          {items.map((r) => (
            <tr
              key={r.id}
              className="border-t align-top hover:bg-muted/30"
              data-testid={`submission-request-${r.id}`}
            >
              <td className="p-3 font-medium">{r.teamName}</td>
              <td className="p-3 text-muted-foreground">{r.leaderName}</td>
              <td className="p-3 text-muted-foreground">
                {r.campusName || "—"}
              </td>
              <td className="p-3 text-muted-foreground whitespace-nowrap">
                {formatDateTime(r.createdAt)}
              </td>
              <td className="p-3 text-muted-foreground max-w-[360px] whitespace-pre-wrap">
                {r.purpose || (
                  <span className="italic opacity-70">No detail given</span>
                )}
              </td>
              <td className="p-3 text-right">
                {r.exempted ? (
                  <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-600">
                    <Check className="h-3.5 w-3.5" /> Enabled
                  </span>
                ) : (
                  <Button
                    size="sm"
                    disabled={enable.isPending}
                    onClick={() => enable.mutate(r.teamId)}
                    data-testid={`button-enable-request-${r.id}`}
                  >
                    {enable.isPending && enable.variables === r.teamId ? (
                      <Spinner className="mr-1 h-4 w-4" />
                    ) : (
                      <Check className="mr-1 h-4 w-4" />
                    )}
                    Enable
                  </Button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
