import { useListTeams, useApproveTeam, useRejectTeam, getListTeamsQueryKey } from "@workspace/api-client-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Users, Check, X } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { formatINR } from "@/lib/format";

export default function CoordinatorTeams() {
  const { data: teams, isLoading } = useListTeams();
  const approveTeam = useApproveTeam();
  const rejectTeam = useRejectTeam();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const handleApprove = (id: number) => {
    approveTeam.mutate({ id }, {
      onSuccess: () => {
        toast({ title: "Team approved" });
        queryClient.invalidateQueries({ queryKey: getListTeamsQueryKey() });
      }
    });
  };

  const handleReject = (id: number) => {
    rejectTeam.mutate({ id, data: { reason: "Rejected by coordinator" } }, {
      onSuccess: () => {
        toast({ title: "Team rejected" });
        queryClient.invalidateQueries({ queryKey: getListTeamsQueryKey() });
      }
    });
  };

  if (isLoading) return <div className="flex h-64 items-center justify-center"><Spinner size="lg" /></div>;

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
          <Card key={team.id} className="p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center text-primary font-bold">
                {team.name.substring(0,2).toUpperCase()}
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
            
            <div className="flex items-center gap-3 w-full sm:w-auto">
              <Badge variant={team.status === 'active' ? 'default' : 'secondary'} className="capitalize">
                {team.status}
              </Badge>
              {team.status === 'pending' && (
                <div className="flex gap-2 ml-auto sm:ml-0">
                  <Button size="sm" onClick={() => handleApprove(team.id)} disabled={approveTeam.isPending}>
                    <Check className="w-4 h-4 mr-1" /> Approve
                  </Button>
                  <Button size="sm" variant="destructive" onClick={() => handleReject(team.id)} disabled={rejectTeam.isPending}>
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
    </div>
  );
}