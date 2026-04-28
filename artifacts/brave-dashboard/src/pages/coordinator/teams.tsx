import {
  useListTeams,
  useApproveTeam,
  useRejectTeam,
  useRequestTeamChanges,
  getListTeamsQueryKey,
  type ErrorType,
} from "@workspace/api-client-react";
import { useAuth } from "@workspace/replit-auth-web";
import { useLocation } from "wouter";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Users, Check, X, MessageSquareWarning } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { formatINR } from "@/lib/format";
import { useState } from "react";
import { ReasonPromptDialog } from "@/components/reason-prompt-dialog";

export default function CoordinatorTeams() {
  const { user } = useAuth();
  const isCoordinator = user?.role === "coordinator";
  const { data: teamsResp, isLoading } = useListTeams({ pageSize: 1000 });
  const teams = teamsResp?.items;
  const approveTeam = useApproveTeam();
  const rejectTeam = useRejectTeam();
  const requestChanges = useRequestTeamChanges();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [rejectId, setRejectId] = useState<number | null>(null);
  const [changesId, setChangesId] = useState<number | null>(null);
  const [, setLocation] = useLocation();

  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: getListTeamsQueryKey() });

  const errorDescription = (err: ErrorType<unknown>) =>
    err instanceof Error ? err.message : "Please try again.";

  const handleApprove = (id: number) => {
    approveTeam.mutate(
      { id },
      {
        onSuccess: () => {
          toast({ title: "Team approved" });
          refresh();
        },
        onError: (err) =>
          toast({
            title: "Approval failed",
            description: errorDescription(err),
            variant: "destructive",
          }),
      },
    );
  };

  const handleReject = async (reason: string) => {
    if (rejectId == null) return;
    await new Promise<void>((resolve) => {
      rejectTeam.mutate(
        { id: rejectId, data: { reason } },
        {
          onSuccess: () => {
            toast({ title: "Team rejected" });
            refresh();
            setRejectId(null);
            resolve();
          },
          onError: (err) => {
            toast({
              title: "Rejection failed",
              description: errorDescription(err),
              variant: "destructive",
            });
            resolve();
          },
        },
      );
    });
  };

  const handleRequestChanges = async (comment: string) => {
    if (changesId == null) return;
    await new Promise<void>((resolve) => {
      requestChanges.mutate(
        { id: changesId, data: { comment } },
        {
          onSuccess: () => {
            toast({ title: "Changes requested" });
            refresh();
            setChangesId(null);
            resolve();
          },
          onError: (err) => {
            toast({
              title: "Request failed",
              description: errorDescription(err),
              variant: "destructive",
            });
            resolve();
          },
        },
      );
    });
  };

  if (isLoading)
    return (
      <div className="flex h-64 items-center justify-center">
        <Spinner size="lg" />
      </div>
    );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Teams Management</h1>
          <p className="text-muted-foreground">Manage teams at your campus</p>
        </div>
      </div>

      <div className="grid gap-4">
        {teams?.map((team) => (
          <Card
            key={team.id}
            className="p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 cursor-pointer hover-elevate active-elevate-2"
            onClick={() => setLocation(`/teams/${team.id}`)}
            data-testid={`row-team-${team.id}`}
          >
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center text-primary font-bold">
                {team.name.substring(0, 2).toUpperCase()}
              </div>
              <div>
                <h3 className="font-bold text-lg">{team.name}</h3>
                <div className="flex items-center gap-2 text-sm text-muted-foreground mt-1">
                  <span>{team.memberCount} Members</span>
                  <span>•</span>
                  <span>{formatINR(team.totalRevenue)} Revenue</span>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3 w-full sm:w-auto">
              <Badge
                variant={team.status === "active" ? "default" : "secondary"}
                className={
                  team.status === "active"
                    ? "capitalize bg-green-600 hover:bg-green-600 text-white dark:bg-green-500 dark:hover:bg-green-500 dark:text-white"
                    : "capitalize"
                }
              >
                {team.status.replace("_", " ")}
              </Badge>
              {isCoordinator && team.status === "pending" && (
                <div
                  className="flex flex-wrap gap-2 ml-auto sm:ml-0"
                  onClick={(e) => e.stopPropagation()}
                >
                  <Button
                    size="sm"
                    className="bg-green-600 hover:bg-green-700 text-white"
                    onClick={() => handleApprove(team.id)}
                    disabled={approveTeam.isPending}
                    data-testid={`button-approve-${team.id}`}
                  >
                    <Check className="w-4 h-4 mr-1" /> Approve
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setChangesId(team.id)}
                    data-testid={`button-request-changes-${team.id}`}
                  >
                    <MessageSquareWarning className="w-4 h-4 mr-1" /> Request changes
                  </Button>
                  <Button
                    size="sm"
                    className="bg-red-400 hover:bg-red-500 text-white"
                    onClick={() => setRejectId(team.id)}
                    data-testid={`button-reject-${team.id}`}
                  >
                    <X className="w-4 h-4 mr-1" /> Reject
                  </Button>
                </div>
              )}
            </div>
          </Card>
        ))}
        {teams?.length === 0 && (
          <div className="text-center py-12 text-muted-foreground border-2 border-dashed rounded-lg">
            <Users className="w-8 h-8 mx-auto mb-3 opacity-50" />
            <p>No teams found.</p>
          </div>
        )}
      </div>

      <ReasonPromptDialog
        open={rejectId != null}
        onOpenChange={(o) => {
          if (!o) setRejectId(null);
        }}
        title="Reject team"
        description="Tell the team why their registration is being rejected."
        label="Rejection reason"
        placeholder="e.g. Team name conflicts with an existing team."
        submitLabel="Reject team"
        submitVariant="destructive"
        isSubmitting={rejectTeam.isPending}
        onSubmit={handleReject}
      />

      <ReasonPromptDialog
        open={changesId != null}
        onOpenChange={(o) => {
          if (!o) setChangesId(null);
        }}
        title="Request changes"
        description="Let the team know what they need to fix before approval."
        label="Comment for the team"
        placeholder="e.g. Please update your team tagline and add a 4th member."
        submitLabel="Send request"
        isSubmitting={requestChanges.isPending}
        onSubmit={handleRequestChanges}
      />
    </div>
  );
}
