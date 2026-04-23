import {
  useListTeams,
  useApproveTeam,
  useRejectTeam,
  getListTeamsQueryKey,
  type ErrorType,
  type ListTeamsStatus,
} from "@workspace/api-client-react";
import { useLocation } from "wouter";
import { useAuth } from "@workspace/replit-auth-web";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { formatINR } from "@/lib/format";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Search, Filter, Check, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ReasonPromptDialog } from "@/components/reason-prompt-dialog";

export default function AdminTeams() {
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<string>("all");
  const [rejectId, setRejectId] = useState<number | null>(null);

  const { data: teams, isLoading } = useListTeams({
    search: search || undefined,
    status: status !== "all" ? (status as ListTeamsStatus) : undefined,
  });

  const queryClient = useQueryClient();
  const { toast } = useToast();
  const approveTeam = useApproveTeam();
  const rejectTeam = useRejectTeam();

  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: getListTeamsQueryKey() });

  const handleApprove = (id: number) => {
    approveTeam.mutate(
      { id },
      {
        onSuccess: () => {
          toast({ title: "Team approved" });
          refresh();
        },
        onError: (err: ErrorType<unknown>) =>
          toast({
            title: "Approval failed",
            description: err instanceof Error ? err.message : "Please try again.",
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
          onError: (err: ErrorType<unknown>) => {
            toast({
              title: "Rejection failed",
              description: err instanceof Error ? err.message : "Please try again.",
              variant: "destructive",
            });
            resolve();
          },
        },
      );
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Teams Directory</h1>
          <p className="text-muted-foreground">
            Manage all {teams?.length || 0} teams across campuses
          </p>
        </div>

        <div className="flex items-center gap-3 w-full md:w-auto">
          <div className="relative flex-1 md:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search by team, campus, member name, email or NIAT ID…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>

          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="w-[140px]">
              <div className="flex items-center gap-2">
                <Filter className="w-4 h-4" />
                <SelectValue placeholder="Status" />
              </div>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="rejected">Rejected</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <Card>
        {isLoading ? (
          <div className="flex h-64 items-center justify-center">
            <Spinner size="lg" />
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Team</TableHead>
                <TableHead>Campus</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Revenue</TableHead>
                <TableHead className="text-right">Members</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {teams?.map((team) => {
                const isPending = team.status === "pending";
                return (
                  <TableRow
                    key={team.id}
                    className="hover:bg-muted/50 cursor-pointer transition-colors"
                    onClick={() => setLocation(`/teams/${team.id}`)}
                    data-testid={`row-team-${team.id}`}
                  >
                    <TableCell>
                      <div className="font-semibold">{team.name}</div>
                      <div className="text-xs text-muted-foreground truncate max-w-[200px]">
                        {team.tagline || "-"}
                      </div>
                    </TableCell>
                    <TableCell>{team.campusName}</TableCell>
                    <TableCell>
                      <Badge
                        variant={team.status === "active" ? "default" : "secondary"}
                        className="capitalize"
                      >
                        {team.status.replace("_", " ")}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right font-medium">
                      {formatINR(team.totalRevenue)}
                    </TableCell>
                    <TableCell className="text-right">{team.memberCount}</TableCell>
                    <TableCell className="text-right">
                      {isAdmin && isPending ? (
                        <div
                          className="flex items-center justify-end gap-2"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <Button
                            size="sm"
                            className="bg-green-600 hover:bg-green-700 text-white"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleApprove(team.id);
                            }}
                            disabled={approveTeam.isPending}
                            data-testid={`button-approve-${team.id}`}
                          >
                            <Check className="w-4 h-4 mr-1" /> Approve
                          </Button>
                          <Button
                            size="sm"
                            className="bg-red-400 hover:bg-red-500 text-white"
                            onClick={(e) => {
                              e.stopPropagation();
                              setRejectId(team.id);
                            }}
                            data-testid={`button-reject-${team.id}`}
                          >
                            <X className="w-4 h-4 mr-1" /> Reject
                          </Button>
                        </div>
                      ) : (
                        <span className="text-primary text-sm font-medium hover:underline">
                          View
                        </span>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
              {teams?.length === 0 && (
                <TableRow>
                  <TableCell
                    colSpan={6}
                    className="h-24 text-center text-muted-foreground"
                  >
                    No teams found matching your criteria.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        )}
      </Card>

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
    </div>
  );
}
