import {
  useListProjects,
  useDeleteProject,
  useListCampuses,
  getListProjectsQueryKey,
  type ErrorType,
  type ProjectRevenueStatus,
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
  MoreVertical,
  Download,
  FileSpreadsheet,
  ChevronsUpDown,
  Check,
  ArrowUp,
  ArrowDown,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
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
import { useAdminPageAccess } from "@/lib/admin-access";
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
import { PageSizeSelect } from "@/components/page-size-select";
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

// Columns the table can be sorted by. These map 1:1 to the `sortBy` values the
// list endpoint understands; sorting happens server-side so it spans all pages.
type SortKey =
  | "title"
  | "team"
  | "status"
  | "revenueStatus"
  | "revenue"
  | "orderBook"
  | "updated";

// For these, the first click should default to descending (largest / newest /
// most-progressed first). Text columns default to ascending (A→Z).
const NUMERIC_SORT_KEYS = new Set<SortKey>([
  "revenue",
  "orderBook",
  "updated",
  "revenueStatus",
]);

function SortHeader({
  label,
  sortKey,
  activeKey,
  dir,
  onSort,
  align = "left",
}: {
  label: string;
  sortKey: SortKey;
  activeKey: SortKey | null;
  dir: "asc" | "desc";
  onSort: (k: SortKey) => void;
  align?: "left" | "right";
}) {
  const active = activeKey === sortKey;
  return (
    <TableHead className={align === "right" ? "text-right" : undefined}>
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className={cn(
          "inline-flex items-center gap-1 select-none hover:opacity-80 transition-opacity",
          active && "font-semibold",
        )}
        data-testid={`sort-projects-${sortKey}`}
        aria-label={`Sort by ${label}`}
      >
        {label}
        {active ? (
          dir === "asc" ? (
            <ArrowUp className="w-3.5 h-3.5" />
          ) : (
            <ArrowDown className="w-3.5 h-3.5" />
          )
        ) : (
          <ChevronsUpDown className="w-3.5 h-3.5 opacity-40" />
        )}
      </button>
    </TableHead>
  );
}

function RevenueStatusBadge({ status }: { status?: ProjectRevenueStatus }) {
  if (status === "verified")
    return (
      <Badge className="bg-green-600 hover:bg-green-600 text-white dark:bg-green-500 dark:hover:bg-green-500 dark:text-white">
        Verified
      </Badge>
    );
  if (status === "pending")
    return (
      <Badge className="bg-amber-500 hover:bg-amber-500 text-white dark:bg-amber-500 dark:hover:bg-amber-500 dark:text-white">
        Pending
      </Badge>
    );
  if (status === "rejected")
    return <Badge variant="destructive">Rejected</Badge>;
  return <span className="text-muted-foreground text-sm">—</span>;
}

function ProjectsCampusFilterPopover({
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
          data-testid="select-projects-campus-filter"
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
            data-testid="projects-campus-search"
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
                data-testid="projects-campus-option-all"
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
                    data-testid={`projects-campus-option-${c.id}`}
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
  // Per-page permission gating (Super Admin permissions). Default-allow for
  // legacy/super admins; a restricted admin without delete loses the button.
  const { canDelete } = useAdminPageAccess("/admin/projects");
  const allowDelete = isAdmin && !readOnly && canDelete;

  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<string>("all");
  const [campusFilter, setCampusFilter] = useState<string>(ALL_CAMPUSES);
  const [sortBy, setSortBy] = useState<SortKey | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [page, setPage] = useState(1);

  const handleSort = (key: SortKey) => {
    if (sortBy === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortBy(key);
      setSortDir(NUMERIC_SORT_KEYS.has(key) ? "desc" : "asc");
    }
    setPage(1);
  };
  const [pageSize, setPageSize] = useState(PAGE_SIZE);
  const [deleteTarget, setDeleteTarget] = useState<{
    id: number;
    title: string;
  } | null>(null);

  const { data: campusOptions = [] } = useListCampuses();

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
    campusId: campusFilter !== ALL_CAMPUSES ? Number(campusFilter) : undefined,
    sortBy: sortBy ?? undefined,
    sortDir: sortBy ? sortDir : undefined,
    page,
    pageSize,
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

  // Mirror the list endpoint's filters into the export URL so the file
  // matches what the admin currently sees on screen.
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
          ? `/api/admin/projects/export-all.csv${exportQueryString()}`
          : `/api/admin/projects/export-by-campus.xlsx${exportQueryString()}`;
      const res = await fetch(path, { credentials: "include" });
      if (!res.ok) {
        throw new Error(`Export failed (HTTP ${res.status})`);
      }
      const blob = await res.blob();
      const filename =
        res.headers
          .get("content-disposition")
          ?.match(/filename="?([^"]+)"?/)?.[1] ??
        (kind === "csv" ? "brave-projects.csv" : "brave-projects.xlsx");
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
          {/* 1. Search */}
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

          {/* 2. Status */}
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

          {/* 3. Campus filter (searchable + scrollable) */}
          <ProjectsCampusFilterPopover
            value={campusFilter}
            campuses={campusOptions}
            onChange={(v) => {
              setCampusFilter(v);
              setPage(1);
            }}
          />

          {/* 4. Three-dot menu (admin only) */}
          {isAdmin && !readOnly && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  size="icon"
                  aria-label="More actions"
                  disabled={exporting !== null}
                  data-testid="button-projects-more-actions"
                >
                  <MoreVertical className="w-4 h-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="end"
                className="w-64"
                data-testid="menu-projects-more-actions"
              >
                <DropdownMenuItem
                  onClick={() => void downloadExport("csv")}
                  disabled={exporting !== null}
                  data-testid="menu-item-projects-export-csv"
                >
                  <Download className="w-4 h-4 mr-2" />
                  {exporting === "csv"
                    ? "Exporting CSV…"
                    : "Export all projects (CSV)"}
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => void downloadExport("xlsx")}
                  disabled={exporting !== null}
                  data-testid="menu-item-projects-export-xlsx"
                >
                  <FileSpreadsheet className="w-4 h-4 mr-2" />
                  {exporting === "xlsx"
                    ? "Exporting Excel…"
                    : "Export campus-wise (Excel)"}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
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
                  <SortHeader
                    label="Project"
                    sortKey="title"
                    activeKey={sortBy}
                    dir={sortDir}
                    onSort={handleSort}
                  />
                  <SortHeader
                    label="Team"
                    sortKey="team"
                    activeKey={sortBy}
                    dir={sortDir}
                    onSort={handleSort}
                  />
                  <SortHeader
                    label="Status"
                    sortKey="status"
                    activeKey={sortBy}
                    dir={sortDir}
                    onSort={handleSort}
                  />
                  <SortHeader
                    label="Revenue Status"
                    sortKey="revenueStatus"
                    activeKey={sortBy}
                    dir={sortDir}
                    onSort={handleSort}
                  />
                  <SortHeader
                    label="Revenue"
                    sortKey="revenue"
                    activeKey={sortBy}
                    dir={sortDir}
                    onSort={handleSort}
                    align="right"
                  />
                  <SortHeader
                    label="Order Book"
                    sortKey="orderBook"
                    activeKey={sortBy}
                    dir={sortDir}
                    onSort={handleSort}
                    align="right"
                  />
                  {showLastUpdated && (
                    <SortHeader
                      label="Last updated"
                      sortKey="updated"
                      activeKey={sortBy}
                      dir={sortDir}
                      onSort={handleSort}
                    />
                  )}
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
                    <TableCell>
                      <RevenueStatusBadge status={p.revenueStatus} />
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
                      colSpan={showLastUpdated ? 8 : 7}
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
          <div className="flex items-center gap-3">
            <PageSizeSelect
              value={pageSize}
              onChange={(s) => {
                setPageSize(s);
                setPage(1);
              }}
              testId="select-projects-page-size"
            />
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
