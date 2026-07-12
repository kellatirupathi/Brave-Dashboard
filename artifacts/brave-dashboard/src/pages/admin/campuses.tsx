import {
  useListCampuses,
  useCreateCampus,
  useDeleteCampus,
  useUpdateCampus,
  useListUsers,
  getListCampusesQueryKey,
} from "@workspace/api-client-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
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
import {
  Building2,
  Plus,
  Trash2,
  Pencil,
  Check,
  X,
  ChevronsUpDown,
  ArrowUp,
  ArrowDown,
} from "lucide-react";
import { useAdminPageAccess } from "@/lib/admin-access";
import { cn } from "@/lib/utils";
import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { formatINR } from "@/lib/format";
import { Link, useLocation } from "wouter";
import {
  CoordinatorsCell,
  type CampusCoordinator,
} from "@/components/coordinators-popover";

const UNASSIGNED = "__unassigned__";

// The campuses list is not paginated (all campuses come back in one request),
// so sorting is done client-side over the full set.
type SortKey =
  | "name"
  | "location"
  | "activeTeams"
  | "totalRevenue"
  | "coordinator";

// These default to descending on first click (largest first). Text columns
// default to ascending (A→Z).
const NUMERIC_SORT_KEYS = new Set<SortKey>(["activeTeams", "totalRevenue"]);

function SortHeader({
  label,
  sortKey,
  activeKey,
  dir,
  onSort,
  align = "left",
  className,
}: {
  label: string;
  sortKey: SortKey;
  activeKey: SortKey | null;
  dir: "asc" | "desc";
  onSort: (k: SortKey) => void;
  align?: "left" | "right";
  className?: string;
}) {
  const active = activeKey === sortKey;
  return (
    <TableHead className={cn(align === "right" && "text-right", className)}>
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className={cn(
          "inline-flex items-center gap-1 select-none hover:opacity-80 transition-opacity",
          active && "font-semibold",
        )}
        data-testid={`sort-campuses-${sortKey}`}
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

export default function AdminCampuses() {
  const { data: campuses, isLoading } = useListCampuses();
  const { data: coordinatorUsersResp } = useListUsers({
    role: "coordinator",
    pageSize: 1000,
  });
  const coordinatorUsers = coordinatorUsersResp?.items ?? [];
  const createCampus = useCreateCampus();
  const updateCampus = useUpdateCampus();
  const deleteCampus = useDeleteCampus();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const { canEdit, canDelete } = useAdminPageAccess("/admin/campuses");

  const [sortBy, setSortBy] = useState<SortKey | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  const handleSort = (key: SortKey) => {
    if (sortBy === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortBy(key);
      setSortDir(NUMERIC_SORT_KEYS.has(key) ? "desc" : "asc");
    }
  };

  const sortedCampuses = useMemo(() => {
    const list = campuses ?? [];
    if (!sortBy) return list;
    const dir = sortDir === "desc" ? -1 : 1;
    return [...list].sort((a, b) => {
      let cmp = 0;
      switch (sortBy) {
        case "name":
          cmp = a.name.localeCompare(b.name);
          break;
        case "location":
          cmp = `${a.city}, ${a.state}`.localeCompare(`${b.city}, ${b.state}`);
          break;
        case "activeTeams":
          // Primary: active (engaged) teams; tiebreak on total teams.
          cmp = a.activeTeams - b.activeTeams || a.totalTeams - b.totalTeams;
          break;
        case "totalRevenue":
          cmp = a.totalRevenue - b.totalRevenue;
          break;
        case "coordinator":
          cmp = (a.coordinatorName ?? "").localeCompare(
            b.coordinatorName ?? "",
          );
          break;
      }
      if (cmp === 0) cmp = a.id - b.id; // stable tiebreak
      return cmp * dir;
    });
  }, [campuses, sortBy, sortDir]);

  const [isOpen, setIsOpen] = useState(false);
  const [name, setName] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<{
    id: number;
    name: string;
  } | null>(null);

  const [editingId, setEditingId] = useState<number | null>(null);
  const [draftCity, setDraftCity] = useState("");
  const [draftState, setDraftState] = useState("");
  const [draftCoordinatorId, setDraftCoordinatorId] =
    useState<string>(UNASSIGNED);

  const startEdit = (c: {
    id: number;
    city: string;
    state: string;
    coordinatorId: string | null;
  }) => {
    setEditingId(c.id);
    setDraftCity(c.city);
    setDraftState(c.state);
    setDraftCoordinatorId(c.coordinatorId ?? UNASSIGNED);
  };

  const cancelEdit = () => {
    setEditingId(null);
  };

  const saveEdit = (id: number) => {
    const payload = {
      city: draftCity.trim(),
      state: draftState.trim(),
      coordinatorId:
        draftCoordinatorId === UNASSIGNED ? null : draftCoordinatorId,
    };
    if (!payload.city || !payload.state) {
      toast({
        title: "City and state are required",
        variant: "destructive",
      });
      return;
    }
    updateCampus.mutate(
      { id, data: payload },
      {
        onSuccess: () => {
          toast({ title: "Campus updated" });
          queryClient.invalidateQueries({
            queryKey: getListCampusesQueryKey(),
          });
          setEditingId(null);
        },
        onError: (err) => {
          const data = (err as { data?: unknown }).data;
          let message =
            err instanceof Error ? err.message : "Please try again.";
          if (
            data &&
            typeof data === "object" &&
            "error" in data &&
            typeof (data as { error: unknown }).error === "string"
          ) {
            message = (data as { error: string }).error;
          }
          toast({
            title: "Could not update campus",
            description: message,
            variant: "destructive",
          });
        },
      },
    );
  };

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    createCampus.mutate(
      { data: { name, city, state } },
      {
        onSuccess: () => {
          toast({ title: "Campus created" });
          queryClient.invalidateQueries({
            queryKey: getListCampusesQueryKey(),
          });
          setIsOpen(false);
          setName("");
          setCity("");
          setState("");
        },
      },
    );
  };

  const handleDelete = () => {
    if (!deleteTarget) return;
    deleteCampus.mutate(
      { id: deleteTarget.id },
      {
        onSuccess: () => {
          toast({ title: `Campus "${deleteTarget.name}" deleted` });
          queryClient.invalidateQueries({
            queryKey: getListCampusesQueryKey(),
          });
          setDeleteTarget(null);
        },
        onError: (err) => {
          const data = (err as { data?: unknown }).data;
          let message =
            err instanceof Error ? err.message : "Please try again.";
          if (
            data &&
            typeof data === "object" &&
            "error" in data &&
            typeof (data as { error: unknown }).error === "string"
          ) {
            message = (data as { error: string }).error;
          }
          toast({
            title: "Cannot delete campus",
            description: message,
            variant: "destructive",
          });
          setDeleteTarget(null);
        },
      },
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Campuses</h1>
          <p className="text-muted-foreground">Manage participating campuses</p>
        </div>
        {canEdit && (
          <Dialog open={isOpen} onOpenChange={setIsOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="w-4 h-4 mr-2" /> Add Campus
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>New Campus</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleCreate} className="space-y-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Campus Name</label>
                  <Input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                  />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">City</label>
                    <Input
                      value={city}
                      onChange={(e) => setCity(e.target.value)}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">State</label>
                    <Input
                      value={state}
                      onChange={(e) => setState(e.target.value)}
                      required
                    />
                  </div>
                </div>
                <div className="flex justify-end pt-4">
                  <Button type="submit" disabled={createCampus.isPending}>
                    {createCampus.isPending && (
                      <Spinner className="w-4 h-4 mr-2" />
                    )}{" "}
                    Create
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        )}
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
                    label="Campus Name"
                    sortKey="name"
                    activeKey={sortBy}
                    dir={sortDir}
                    onSort={handleSort}
                  />
                  <SortHeader
                    label="Location"
                    sortKey="location"
                    activeKey={sortBy}
                    dir={sortDir}
                    onSort={handleSort}
                  />
                  <SortHeader
                    label="Teams (Active)"
                    sortKey="activeTeams"
                    activeKey={sortBy}
                    dir={sortDir}
                    onSort={handleSort}
                    align="right"
                  />
                  <SortHeader
                    label="Total Revenue"
                    sortKey="totalRevenue"
                    activeKey={sortBy}
                    dir={sortDir}
                    onSort={handleSort}
                    align="right"
                  />
                  <SortHeader
                    label="Coordinator"
                    sortKey="coordinator"
                    activeKey={sortBy}
                    dir={sortDir}
                    onSort={handleSort}
                  />
                  <TableHead className="text-right w-28"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedCampuses.map((c) => {
                  const isEditing = editingId === c.id;
                  return (
                    <TableRow
                      key={c.id}
                      className={
                        isEditing ? undefined : "cursor-pointer hover-elevate"
                      }
                      onClick={
                        isEditing
                          ? undefined
                          : () => setLocation(`/admin/campuses/${c.id}`)
                      }
                      data-testid={`row-campus-${c.id}`}
                    >
                      <TableCell className="font-semibold">
                        <Link
                          href={`/admin/campuses/${c.id}`}
                          className="hover:underline"
                          data-testid={`link-campus-${c.id}`}
                          onClick={(e) => e.stopPropagation()}
                        >
                          {c.name}
                        </Link>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {isEditing ? (
                          <div
                            className="flex gap-2"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <Input
                              value={draftCity}
                              onChange={(e) => setDraftCity(e.target.value)}
                              placeholder="City"
                              className="h-8"
                              data-testid={`input-edit-city-${c.id}`}
                            />
                            <Input
                              value={draftState}
                              onChange={(e) => setDraftState(e.target.value)}
                              placeholder="State"
                              className="h-8"
                              data-testid={`input-edit-state-${c.id}`}
                            />
                          </div>
                        ) : (
                          <>
                            {c.city}, {c.state}
                          </>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        {c.activeTeams} / {c.totalTeams}
                      </TableCell>
                      <TableCell className="text-right font-medium text-primary">
                        {formatINR(c.totalRevenue)}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {isEditing ? (
                          <div onClick={(e) => e.stopPropagation()}>
                            <Select
                              value={draftCoordinatorId}
                              onValueChange={setDraftCoordinatorId}
                            >
                              <SelectTrigger
                                className="h-8 w-full"
                                data-testid={`select-edit-coordinator-${c.id}`}
                              >
                                <SelectValue placeholder="Coordinator" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value={UNASSIGNED}>
                                  Unassigned
                                </SelectItem>
                                {coordinatorUsers.map((u) => (
                                  <SelectItem key={u.id} value={u.id}>
                                    {u.firstName} {u.lastName}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        ) : (
                          <CoordinatorsCell
                            coordinators={
                              (c as { coordinators?: CampusCoordinator[] })
                                .coordinators
                            }
                            fallbackName={c.coordinatorName}
                          />
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        {isEditing ? (
                          <div
                            className="inline-flex gap-1"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-8 w-8 text-primary"
                              onClick={() => saveEdit(c.id)}
                              disabled={updateCampus.isPending}
                              data-testid={`button-save-campus-${c.id}`}
                              aria-label="Save"
                            >
                              {updateCampus.isPending ? (
                                <Spinner className="w-4 h-4" />
                              ) : (
                                <Check className="w-4 h-4" />
                              )}
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-8 w-8"
                              onClick={cancelEdit}
                              disabled={updateCampus.isPending}
                              data-testid={`button-cancel-edit-campus-${c.id}`}
                              aria-label="Cancel"
                            >
                              <X className="w-4 h-4" />
                            </Button>
                          </div>
                        ) : (
                          <div
                            className="inline-flex gap-1"
                            onClick={(e) => e.stopPropagation()}
                          >
                            {canEdit && (
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-8 w-8"
                                onClick={() =>
                                  startEdit({
                                    id: c.id,
                                    city: c.city,
                                    state: c.state,
                                    coordinatorId: c.coordinatorId ?? null,
                                  })
                                }
                                data-testid={`button-edit-campus-${c.id}`}
                                aria-label="Edit campus"
                              >
                                <Pencil className="w-4 h-4" />
                              </Button>
                            )}
                            {canDelete && (
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-8 w-8 text-destructive hover:text-destructive"
                                onClick={() =>
                                  setDeleteTarget({ id: c.id, name: c.name })
                                }
                                data-testid={`button-delete-campus-${c.id}`}
                                aria-label="Delete campus"
                              >
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            )}
                          </div>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
                {campuses?.length === 0 && (
                  <TableRow>
                    <TableCell
                      colSpan={6}
                      className="h-24 text-center text-muted-foreground"
                    >
                      <Building2 className="w-8 h-8 mx-auto mb-2 opacity-50" />
                      No campuses found
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        )}
      </Card>

      <AlertDialog
        open={deleteTarget != null}
        onOpenChange={(o) => {
          if (!o) setDeleteTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Delete campus "{deleteTarget?.name}"?
            </AlertDialogTitle>
            <AlertDialogDescription>
              The campus can only be deleted if it has no teams. Any users
              currently attached to this campus will be detached. This action
              cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete-campus">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                handleDelete();
              }}
              disabled={deleteCampus.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-testid="button-confirm-delete-campus"
            >
              {deleteCampus.isPending && <Spinner className="w-4 h-4 mr-2" />}
              Delete campus
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
