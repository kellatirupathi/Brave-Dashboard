import {
  useListProjects,
  useDeleteProject,
  getListProjectsQueryKey,
  type ErrorType,
} from "@workspace/api-client-react";
import { useLocation } from "wouter";
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
  ChevronLeft,
  ChevronRight,
  FolderKanban,
} from "lucide-react";
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

type ProjectsListProps = {
  /**
   * When true, hides admin-only controls (delete, etc.). The backend already
   * enforces campus-scoping for coordinators — this prop just changes the UI.
   */
  readOnly?: boolean;
  /** Heading title (e.g. "Projects" or "Campus Projects"). */
  title?: string;
  /** Heading subtitle. */
  subtitle?: string;
};

export default function AdminProjects({
  readOnly = false,
  title = "All Projects",
  subtitle,
}: ProjectsListProps = {}) {
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const isCoordinator = user?.role === "coordinator";
  // Staff (admin or coordinator) see the "Last updated" column. Students do not.
  const showLastUpdated = isAdmin || isCoordinator;
  const allowDelete = isAdmin && !readOnly;

  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<string>("all");
  const [page, setPage] = useState(1);
  const [deleteTarget, setDeleteTarget] = useState<{
    id: number;
    title: string;
  } | null>(null);

  // Debounce search so we aren't firing a request on every keystroke.
  useEffect(() => {
    const handle = window.setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(1);
    }, 300);
    return () => window.clearTimeout(handle);
  }, [searchInput]);

  const { data: projects, isLoading } = useListProjects({
    search: search || undefined,
    status: status !== "all" ? (status as "active" | "inactive") : undefined,
    page,
    pageSize: PAGE_SIZE,
  });

  // Clamp the current page back into range when filters narrow the result set.
  useEffect(() => {
    if (!projects) return;
    if (projects.total === 0) {
      if (page !== 1) setPage(1);
      return;
    }
    const maxPage = Math.max(1, Math.ceil(projects.total / projects.pageSize));
    if (page > maxPage) setPage(maxPage);
  }, [projects, page]);

  const items = projects?.items ?? [];

  const queryClient = useQueryClient();
  const { toast } = useToast();
  const deleteProject = useDeleteProject();

  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: getListProjectsQueryKey() });

  const handleDelete = () => {
    if (!deleteTarget) return;
    deleteProject.mutate(
      { id: deleteTarget.id },
      {
        onSuccess: () => {
          toast({ title: `Project "${deleteTarget.title}" deleted` });
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

  const detailHref = (projectId: number) =>
    isAdmin
      ? `/admin/projects/${projectId}`
      : `/coordinator/projects/${projectId}`;

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{title}</h1>
          <p className="text-muted-foreground">
            {subtitle ?? `Browse all ${projects?.total ?? 0} projects.`}
          </p>
        </div>

        <div className="flex flex-col md:flex-row items-stretch md:items-center gap-3 w-full md:w-auto">
          <div className="relative flex-1 md:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search by project, team, or campus…"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              className="pl-9"
              data-testid="input-projects-search"
            />
          </div>

          <Select
            value={status}
            onValueChange={(v) => {
              setStatus(v);
              setPage(1);
            }}
          >
            <SelectTrigger
              className="w-[140px]"
              data-testid="select-projects-status"
            >
              <div className="flex items-center gap-2">
                <Filter className="w-4 h-4" />
                <SelectValue placeholder="Status" />
              </div>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="inactive">Inactive</SelectItem>
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
                  <TableHead>Project</TableHead>
                  <TableHead>Team</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Revenue</TableHead>
                  <TableHead className="text-right">Order Book</TableHead>
                  {showLastUpdated && <TableHead>Last updated</TableHead>}
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((p) => (
                  <TableRow
                    key={p.id}
                    className="hover:bg-muted/50 cursor-pointer transition-colors"
                    onClick={() => setLocation(detailHref(p.id))}
                    data-testid={`row-project-${p.id}`}
                  >
                    <TableCell>
                      <div className="font-semibold flex items-center gap-2">
                        <FolderKanban className="w-4 h-4 text-muted-foreground" />
                        {p.title}
                      </div>
                      <div className="text-xs text-muted-foreground truncate max-w-[260px]">
                        {p.description || "-"}
                      </div>
                    </TableCell>
                    <TableCell>{p.teamName}</TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          p.status === "active" ? "default" : "secondary"
                        }
                        className={
                          p.status === "active"
                            ? "capitalize bg-green-600 hover:bg-green-600 text-white dark:bg-green-500 dark:hover:bg-green-500 dark:text-white"
                            : "capitalize"
                        }
                      >
                        {p.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right font-medium">
                      {formatINR(p.verifiedRevenue)}
                    </TableCell>
                    <TableCell className="text-right font-medium">
                      {formatINR(p.verifiedOrderBook)}
                    </TableCell>
                    {showLastUpdated && (
                      <TableCell
                        className="text-sm text-muted-foreground whitespace-nowrap"
                        data-testid={`text-project-updated-${p.id}`}
                      >
                        {formatDateTime(p.updatedAt)}
                      </TableCell>
                    )}
                    <TableCell className="text-right">
                      <div
                        className="flex items-center justify-end gap-2"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <span
                          className="text-primary text-sm font-medium hover:underline cursor-pointer"
                          onClick={(e) => {
                            e.stopPropagation();
                            setLocation(detailHref(p.id));
                          }}
                        >
                          View
                        </span>
                        {allowDelete && (
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8 text-destructive hover:text-destructive"
                            onClick={(e) => {
                              e.stopPropagation();
                              setDeleteTarget({ id: p.id, title: p.title });
                            }}
                            data-testid={`button-delete-project-${p.id}`}
                            aria-label="Delete project"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
                {items.length === 0 && (
                  <TableRow>
                    <TableCell
                      colSpan={showLastUpdated ? 7 : 6}
                      className="h-24 text-center text-muted-foreground"
                    >
                      No projects found matching your criteria.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        )}
      </Card>

      {projects && projects.total > 0 && (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div
            className="text-sm text-muted-foreground"
            data-testid="text-projects-pagination-info"
          >
            {(() => {
              const start = (projects.page - 1) * projects.pageSize + 1;
              const end = Math.min(
                projects.page * projects.pageSize,
                projects.total,
              );
              return `Showing ${start.toLocaleString()}–${end.toLocaleString()} of ${projects.total.toLocaleString()}`;
            })()}
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={isLoading || projects.page <= 1}
              data-testid="button-projects-prev-page"
            >
              <ChevronLeft className="w-4 h-4 mr-1" />
              Previous
            </Button>
            <span
              className="text-sm tabular-nums"
              data-testid="text-projects-page-indicator"
            >
              Page {projects.page} of{" "}
              {Math.max(1, Math.ceil(projects.total / projects.pageSize))}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => p + 1)}
              disabled={
                isLoading || projects.page * projects.pageSize >= projects.total
              }
              data-testid="button-projects-next-page"
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
              Delete project "{deleteTarget?.title}"?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This permanently deletes the project and ALL of its order book
              entries and revenue entries. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete-project">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                handleDelete();
              }}
              disabled={deleteProject.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-testid="button-confirm-delete-project"
            >
              {deleteProject.isPending && <Spinner className="w-4 h-4 mr-2" />}
              Delete project
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
