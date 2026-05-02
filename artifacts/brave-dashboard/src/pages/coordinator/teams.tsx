import { useListTeams } from "@workspace/api-client-react";
import { useLocation } from "wouter";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import { Users } from "lucide-react";
import { formatINR, formatDateTime } from "@/lib/format";

export default function CoordinatorTeams() {
  const { data: teamsResp, isLoading } = useListTeams({ pageSize: 1000 });
  const teams = teamsResp?.items;
  const [, setLocation] = useLocation();

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
          <h1 className="text-3xl font-bold tracking-tight">
            Teams Management
          </h1>
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
                <div
                  className="text-xs text-muted-foreground mt-1"
                  data-testid={`text-team-updated-${team.id}`}
                >
                  Last updated:{" "}
                  {formatDateTime(
                    (team as unknown as { updatedAt?: string | Date | null })
                      .updatedAt ?? team.createdAt,
                  )}
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
