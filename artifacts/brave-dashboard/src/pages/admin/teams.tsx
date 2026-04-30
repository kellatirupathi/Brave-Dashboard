import {
  useListTeams,
  useDeleteTeam,
  getListTeamsQueryKey,
  type ErrorType,
  type ListTeamsStatus,
} from "@workspace/api-client-react";
import { useLocation, useSearch } from "wouter";
import { useAuth } from "@workspace/replit-auth-web";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { formatINR } from "@/lib/format";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Search, Filter, Trash2, UserPlus, Upload, ChevronLeft, ChevronRight } from "lucide-react";
import { AddTeamDialog } from "./components/AddTeamDialog";
import { ImportTeamsDialog } from "./components/ImportTeamsDialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useEffect, useState } from "react";
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

const PAGE_SIZE = 100;

export default function AdminTeams() {
  const [, setLocation] = useLocation();
  const searchString = useSearch();
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const initialStatus = (() => {
    const params = new URLSearchParams(searchString);
    const fromUrl = params.get("status");
    return fromUrl && ["active", "rejected", "suspended"].includes(fromUrl)
      ? fromUrl
      : "all";
  })();
  const [status, setStatus] = useState<string>(initialStatus);
  const [deleteTarget, setDeleteTarget] = useState<{ id: number; name: string } | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [page, setPage] = useState(1);

  // Debounce search so we aren't firing a request on every keystroke.
  useEffect(() => {
    const handle = window.setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(1);
    }, 300);
    return () => window.clearTimeout(handle);
  }, [searchInput]);

  const { data: teams, isLoading } = useListTeams({
    search: search || undefined,
    status: status !== "all" ? (status as ListTeamsStatus) : undefined,
    page,
    pageSize: PAGE_SIZE,
  });

  // Clamp the current page back into range when filters narrow the result set.
  useEffect(() => {
    if (!teams) return;
    if (teams.total === 0) {
      if (page !== 1) setPage(1);
      return;
    }
    const maxPage = Math.max(1, Math.ceil(teams.total / teams.pageSize));
    if (page > maxPage) setPage(maxPage);
  }, [teams, page]);

  const teamItems = teams?.items ?? [];

  const queryClient = useQueryClient();
  const { toast } = useToast();
  const deleteTeam = useDeleteTeam();

  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: getListTeamsQueryKey() });

  const handleDelete = () => {
    if (!deleteTarget) return;
    deleteTeam.mutate(
      { id: deleteTarget.id },
      {
        onSuccess: () => {
          toast({ title: `Team "${deleteTarget.name}" deleted` });
          refresh();
          setDeleteTarget(null);
        },
        onError: (err: ErrorType<unknown>) => {
          toast({
            title: "Delete failed",
            description: err instanceof Error ? err.message : "Please try again.",
            variant: "destructive",
          });
          setDeleteTarget(null);
        },
      },
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Teams Directory</h1>
          <p className="text-muted-foreground">
            Manage all {teams?.total ?? 0} teams across campuses
          </p>
        </div>

        <div className="flex flex-col md:flex-row items-stretch md:items-center gap-3 w-full md:w-auto">
          {isAdmin && (
            <div className="flex items-center gap-2">
              <Button
                onClick={() => setAddOpen(true)}
                data-testid="button-open-add-team"
              >
                <UserPlus className="w-4 h-4 mr-2" />
                Add Team
              </Button>
              <Button
                variant="outline"
                onClick={() => setImportOpen(true)}
                data-testid="button-open-import-teams"
              >
                <Upload className="w-4 h-4 mr-2" />
                Import CSV
              </Button>
            </div>
          )}
          <div className="relative flex-1 md:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search by team, campus, member name, email or NIAT ID…"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              className="pl-9"
            />
          </div>

          <Select value={status} onValueChange={(v) => { setStatus(v); setPage(1); }}>
            <SelectTrigger className="w-[140px]">
              <div className="flex items-center gap-2">
                <Filter className="w-4 h-4" />
                <SelectValue placeholder="Status" />
              </div>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="active">Active</SelectItem>
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
          <div className="overflow-x-auto">
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
              {teamItems.map((team) => {
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
                        className={
                          team.status === "active"
                            ? "capitalize bg-green-600 hover:bg-green-600 text-white dark:bg-green-500 dark:hover:bg-green-500 dark:text-white"
                            : "capitalize"
                        }
                      >
                        {team.status.replace("_", " ")}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right font-medium">
                      {formatINR(team.totalRevenue)}
                    </TableCell>
                    <TableCell className="text-right">{team.memberCount}</TableCell>
                    <TableCell className="text-right">
                      <div
                        className="flex items-center justify-end gap-2"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <span
                          className="text-primary text-sm font-medium hover:underline cursor-pointer"
                          onClick={(e) => {
                            e.stopPropagation();
                            setLocation(`/teams/${team.id}`);
                          }}
                        >
                          View
                        </span>
                        {isAdmin && (
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8 text-destructive hover:text-destructive"
                            onClick={(e) => {
                              e.stopPropagation();
                              setDeleteTarget({ id: team.id, name: team.name });
                            }}
                            data-testid={`button-delete-team-${team.id}`}
                            aria-label="Delete team"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
              {teamItems.length === 0 && (
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
          </div>
        )}
      </Card>

      {teams && teams.total > 0 && (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div
            className="text-sm text-muted-foreground"
            data-testid="text-teams-pagination-info"
          >
            {(() => {
              const start = (teams.page - 1) * teams.pageSize + 1;
              const end = Math.min(teams.page * teams.pageSize, teams.total);
              return `Showing ${start.toLocaleString()}–${end.toLocaleString()} of ${teams.total.toLocaleString()}`;
            })()}
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={isLoading || teams.page <= 1}
              data-testid="button-teams-prev-page"
            >
              <ChevronLeft className="w-4 h-4 mr-1" />
              Previous
            </Button>
            <span
              className="text-sm tabular-nums"
              data-testid="text-teams-page-indicator"
            >
              Page {teams.page} of{" "}
              {Math.max(1, Math.ceil(teams.total / teams.pageSize))}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => p + 1)}
              disabled={
                isLoading || teams.page * teams.pageSize >= teams.total
              }
              data-testid="button-teams-next-page"
            >
              Next
              <ChevronRight className="w-4 h-4 ml-1" />
            </Button>
          </div>
        </div>
      )}

      <AlertDialog
        open={deleteTarget != null}
        onOpenChange={(o) => {
          if (!o) setDeleteTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Delete team "{deleteTarget?.name}"?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This permanently deletes the team and ALL associated data —
              members, projects, revenue entries, order book entries, milestones,
              demo day applications, invitations and join/leave requests.
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete-team">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                handleDelete();
              }}
              disabled={deleteTeam.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-testid="button-confirm-delete-team"
            >
              {deleteTeam.isPending && <Spinner className="w-4 h-4 mr-2" />}
              Delete team
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AddTeamDialog open={addOpen} onOpenChange={setAddOpen} />
      <ImportTeamsDialog open={importOpen} onOpenChange={setImportOpen} />
    </div>
  );
}
