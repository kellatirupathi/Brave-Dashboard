import {
  useListTeams,
  useDeleteTeam,
  useListCampuses,
  getListTeamsQueryKey,
  type ErrorType,
  type ListTeamsStatus,
} from "@workspace/api-client-react";
import { useLocation, useSearch } from "wouter";
import { useAuth } from "@workspace/replit-auth-web";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { formatINR, formatDateTime } from "@/lib/format";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import {
  Search,
  Filter,
  Trash2,
  UserPlus,
  Upload,
  ChevronLeft,
  ChevronRight,
  MoreVertical,
  Download,
  FileSpreadsheet,
  ChevronsUpDown,
  Check,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { cn } from "@/lib/utils";
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
const ALL_CAMPUSES = "__all__";

function TeamsCampusFilterPopover({
  value,
  campuses,
  onChange,
}: {
  value: string;
  campuses: { id: number; name: string }[];
  onChange: (next: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const selectedLabel =
    value === ALL_CAMPUSES
      ? "All campuses"
      : (campuses.find((c) => String(c.id) === value)?.name ?? "All campuses");
  const sorted = [...campuses].sort((a, b) => a.name.localeCompare(b.name));
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="sm:w-56 justify-between font-normal"
          data-testid="select-teams-campus-filter"
        >
          <span className="truncate">{selectedLabel}</span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-[--radix-popover-trigger-width] p-0"
        align="start"
      >
        <Command>
          <CommandInput
            placeholder="Search campuses…"
            data-testid="teams-campus-search"
          />
          <CommandList className="max-h-72">
            <CommandEmpty>No campus found.</CommandEmpty>
            <CommandGroup>
              <CommandItem
                value="All campuses"
                onSelect={() => {
                  onChange(ALL_CAMPUSES);
                  setOpen(false);
                }}
                data-testid="teams-campus-option-all"
              >
                <Check
                  className={cn(
                    "mr-2 h-4 w-4",
                    value === ALL_CAMPUSES ? "opacity-100" : "opacity-0",
                  )}
                />
                All campuses
              </CommandItem>
              {sorted.map((c) => {
                const v = String(c.id);
                return (
                  <CommandItem
                    key={c.id}
                    value={c.name}
                    onSelect={() => {
                      onChange(v);
                      setOpen(false);
                    }}
                    data-testid={`teams-campus-option-${c.id}`}
                  >
                    <Check
                      className={cn(
                        "mr-2 h-4 w-4",
                        value === v ? "opacity-100" : "opacity-0",
                      )}
                    />
                    {c.name}
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

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
  const [campusFilter, setCampusFilter] = useState<string>(ALL_CAMPUSES);
  const [deleteTarget, setDeleteTarget] = useState<{
    id: number;
    name: string;
  } | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [page, setPage] = useState(1);

  const { data: campusOptions = [] } = useListCampuses();

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
    campusId: campusFilter !== ALL_CAMPUSES ? Number(campusFilter) : undefined,
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

  // Build the same filter query string used by the list endpoint so the
  // export respects the admin's current view (status + search + campus).
  const exportQueryString = () => {
    const p = new URLSearchParams();
    if (status !== "all") p.set("status", status);
    if (campusFilter !== ALL_CAMPUSES) p.set("campusId", campusFilter);
    if (search.trim()) p.set("search", search.trim());
    const qs = p.toString();
    return qs ? `?${qs}` : "";
  };

  const [exporting, setExporting] = useState<null | "csv" | "xlsx">(null);

  const downloadExport = async (kind: "csv" | "xlsx") => {
    if (exporting) return;
    setExporting(kind);
    try {
      const path =
        kind === "csv"
          ? `/api/admin/teams/export-all.csv${exportQueryString()}`
          : `/api/admin/teams/export-by-campus.xlsx${exportQueryString()}`;
      const res = await fetch(path, { credentials: "include" });
      if (!res.ok) {
        throw new Error(`Export failed (HTTP ${res.status})`);
      }
      const blob = await res.blob();
      const filename =
        res.headers
          .get("content-disposition")
          ?.match(/filename="?([^"]+)"?/)?.[1] ??
        (kind === "csv" ? "brave-teams.csv" : "brave-teams.xlsx");
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast({
        title: kind === "csv" ? "CSV exported" : "Excel exported",
        description: filename,
      });
    } catch (err) {
      toast({
        title: "Export failed",
        description: err instanceof Error ? err.message : "Please try again.",
        variant: "destructive",
      });
    } finally {
      setExporting(null);
    }
  };

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
            description:
              err instanceof Error ? err.message : "Please try again.",
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
          {/* 1. Search */}
          <div className="relative flex-1 md:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search by team, campus, member name, email or NIAT ID…"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              className="pl-9"
            />
          </div>

          {/* 2. Status */}
          <Select
            value={status}
            onValueChange={(v) => {
              setStatus(v);
              setPage(1);
            }}
          >
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

          {/* 3. Campus filter (searchable + scrollable) */}
          <TeamsCampusFilterPopover
            value={campusFilter}
            campuses={campusOptions}
            onChange={(v) => {
              setCampusFilter(v);
              setPage(1);
            }}
          />

          {/* 4. Three-dot menu (admin only) */}
          {isAdmin && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  size="icon"
                  aria-label="More actions"
                  disabled={exporting !== null}
                  data-testid="button-teams-more-actions"
                >
                  <MoreVertical className="w-4 h-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="end"
                className="w-64"
                data-testid="menu-teams-more-actions"
              >
                <DropdownMenuItem
                  onClick={() => setImportOpen(true)}
                  data-testid="menu-item-import-csv"
                >
                  <Upload className="w-4 h-4 mr-2" />
                  Import CSV
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => void downloadExport("csv")}
                  disabled={exporting !== null}
                  data-testid="menu-item-export-csv"
                >
                  <Download className="w-4 h-4 mr-2" />
                  {exporting === "csv"
                    ? "Exporting CSV…"
                    : "Export all teams (CSV)"}
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => void downloadExport("xlsx")}
                  disabled={exporting !== null}
                  data-testid="menu-item-export-xlsx"
                >
                  <FileSpreadsheet className="w-4 h-4 mr-2" />
                  {exporting === "xlsx"
                    ? "Exporting Excel…"
                    : "Export campus-wise (Excel)"}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}

          {/* 5. Add Team (admin only) */}
          {isAdmin && (
            <Button
              onClick={() => setAddOpen(true)}
              data-testid="button-open-add-team"
            >
              <UserPlus className="w-4 h-4 mr-2" />
              Add Team
            </Button>
          )}
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
                  <TableHead>Last updated</TableHead>
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
                          variant={
                            team.status === "active" ? "default" : "secondary"
                          }
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
                      <TableCell className="text-right">
                        {team.memberCount}
                      </TableCell>
                      <TableCell
                        className="text-sm text-muted-foreground whitespace-nowrap"
                        data-testid={`text-team-updated-${team.id}`}
                      >
                        {formatDateTime(
                          (
                            team as unknown as {
                              updatedAt?: string | Date | null;
                            }
                          ).updatedAt ?? team.createdAt,
                        )}
                      </TableCell>
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
                                setDeleteTarget({
                                  id: team.id,
                                  name: team.name,
                                });
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
                      colSpan={7}
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
              disabled={isLoading || teams.page * teams.pageSize >= teams.total}
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
              members, projects, revenue entries, order book entries,
              milestones, demo day applications, invitations and join/leave
              requests. This action cannot be undone.
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
