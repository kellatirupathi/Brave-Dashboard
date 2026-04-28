import { Link, useLocation, useParams } from "wouter";
import { useState } from "react";
import {
  useGetCampus,
  useListTeams,
  useGetAuditLog,
  useDeleteCampus,
  useUpdateCampus,
  useListUsers,
  getListCampusesQueryKey,
  getGetCampusQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { formatINR } from "@/lib/format";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
  ArrowLeft,
  Building2,
  Users,
  IndianRupee,
  ListChecks,
  UserCog,
  Trash2,
  Pencil,
  Check,
  X,
} from "lucide-react";

const UNASSIGNED = "__unassigned__";

export default function AdminCampusDetail() {
  const params = useParams<{ id: string }>();
  const campusId = Number(params.id);
  const enabled = Number.isFinite(campusId);
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const deleteCampus = useDeleteCampus();
  const updateCampus = useUpdateCampus();
  const { data: coordinatorUsers = [] } = useListUsers({ role: "coordinator" });
  const [deleteOpen, setDeleteOpen] = useState(false);

  const [isEditing, setIsEditing] = useState(false);
  const [draftName, setDraftName] = useState("");
  const [draftCity, setDraftCity] = useState("");
  const [draftState, setDraftState] = useState("");
  const [draftCoordinatorId, setDraftCoordinatorId] = useState<string>(UNASSIGNED);

  const startEdit = () => {
    if (!campus) return;
    setDraftName(campus.name);
    setDraftCity(campus.city);
    setDraftState(campus.state);
    setDraftCoordinatorId(campus.coordinatorId ?? UNASSIGNED);
    setIsEditing(true);
  };

  const cancelEdit = () => setIsEditing(false);

  const saveEdit = () => {
    const payload = {
      name: draftName.trim(),
      city: draftCity.trim(),
      state: draftState.trim(),
      coordinatorId: draftCoordinatorId === UNASSIGNED ? null : draftCoordinatorId,
    };
    if (!payload.name || !payload.city || !payload.state) {
      toast({
        title: "Name, city and state are required",
        variant: "destructive",
      });
      return;
    }
    updateCampus.mutate(
      { id: campusId, data: payload },
      {
        onSuccess: () => {
          toast({ title: "Campus updated" });
          queryClient.invalidateQueries({ queryKey: getGetCampusQueryKey(campusId) });
          queryClient.invalidateQueries({ queryKey: getListCampusesQueryKey() });
          setIsEditing(false);
        },
        onError: (err) => {
          const data = (err as { data?: unknown }).data;
          let message = err instanceof Error ? err.message : "Please try again.";
          if (data && typeof data === "object" && "error" in data && typeof (data as { error: unknown }).error === "string") {
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

  const handleDelete = () => {
    deleteCampus.mutate(
      { id: campusId },
      {
        onSuccess: () => {
          toast({ title: "Campus deleted" });
          queryClient.invalidateQueries({ queryKey: getListCampusesQueryKey() });
          setDeleteOpen(false);
          setLocation("/admin/campuses");
        },
        onError: (err) => {
          const data = (err as { data?: unknown }).data;
          let message = err instanceof Error ? err.message : "Please try again.";
          if (data && typeof data === "object" && "error" in data && typeof (data as { error: unknown }).error === "string") {
            message = (data as { error: string }).error;
          }
          toast({
            title: "Cannot delete campus",
            description: message,
            variant: "destructive",
          });
        },
      },
    );
  };

  const {
    data: campus,
    isLoading: campusLoading,
    isError: campusError,
  } = useGetCampus(campusId, {
    query: { enabled },
  });
  const { data: teams = [], isLoading: teamsLoading } = useListTeams(
    { campusId },
    { query: { enabled } },
  );
  const { data: auditLog = [] } = useGetAuditLog(
    { limit: 200 },
    { query: { enabled } },
  );

  if (campusLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  if (!enabled || campusError || !campus) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <Link href="/admin/campuses">
            <Button
              variant="ghost"
              size="sm"
              data-testid="button-back-to-campuses"
            >
              <ArrowLeft className="w-4 h-4 mr-1" /> Back to Campuses
            </Button>
          </Link>
        </div>
        <Card>
          <CardContent className="py-12 text-center space-y-3">
            <Building2 className="w-10 h-10 mx-auto opacity-40" />
            <p className="text-lg font-semibold">Campus not found</p>
            <p className="text-sm text-muted-foreground">
              We couldn&apos;t find a campus with id {params.id}. It may have
              been removed or the link is incorrect.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const teamIds = new Set((teams as any[]).map((t) => t.id));
  const recentActivity = (auditLog as any[])
    .filter((log) => {
      if (log.targetType === "campus" && log.targetId === campus.id) return true;
      if (log.targetType === "team" && log.targetId && teamIds.has(log.targetId)) return true;
      return false;
    })
    .slice(0, 15);

  const totalOrderBook = (teams as any[]).reduce(
    (acc, t) => acc + (t.totalOrderBook ?? 0),
    0,
  );
  const totalRevenueFromTeams = (teams as any[]).reduce(
    (acc, t) => acc + (t.totalRevenue ?? 0),
    0,
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/admin/campuses">
          <Button
            variant="ghost"
            size="sm"
            data-testid="button-back-to-campuses"
          >
            <ArrowLeft className="w-4 h-4 mr-1" /> Back to Campuses
          </Button>
        </Link>
      </div>

      <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3">
        <div className="flex-1 min-w-0">
          {isEditing ? (
            <div className="space-y-3 max-w-2xl">
              <div className="flex items-center gap-2">
                <Building2 className="w-7 h-7 text-primary shrink-0" />
                <Input
                  value={draftName}
                  onChange={(e) => setDraftName(e.target.value)}
                  placeholder="Campus name"
                  className="text-2xl font-bold h-12"
                  data-testid="input-edit-campus-name"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">
                    City
                  </label>
                  <Input
                    value={draftCity}
                    onChange={(e) => setDraftCity(e.target.value)}
                    placeholder="City"
                    data-testid="input-edit-campus-city"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">
                    State
                  </label>
                  <Input
                    value={draftState}
                    onChange={(e) => setDraftState(e.target.value)}
                    placeholder="State"
                    data-testid="input-edit-campus-state"
                  />
                </div>
              </div>
              <div className="space-y-1 max-w-xs">
                <label className="text-xs font-medium text-muted-foreground">
                  Coordinator
                </label>
                <Select
                  value={draftCoordinatorId}
                  onValueChange={setDraftCoordinatorId}
                >
                  <SelectTrigger data-testid="select-edit-campus-coordinator">
                    <SelectValue placeholder="Coordinator" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={UNASSIGNED}>Unassigned</SelectItem>
                    {coordinatorUsers.map((u) => (
                      <SelectItem key={u.id} value={u.id}>
                        {u.firstName} {u.lastName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          ) : (
            <>
              <h1
                className="text-3xl font-bold tracking-tight flex items-center gap-2"
                data-testid="text-campus-name"
              >
                <Building2 className="w-7 h-7 text-primary" />
                {campus.name}
              </h1>
              <p className="text-muted-foreground mt-1">
                {campus.city}, {campus.state}
              </p>
            </>
          )}
        </div>
        <div className="flex flex-col md:flex-row md:items-center gap-3">
          {!isEditing && (
            <div className="flex items-center gap-2 text-sm">
              <UserCog className="w-4 h-4 text-muted-foreground" />
              <span className="text-muted-foreground">Coordinator:</span>
              <span className="font-medium" data-testid="text-coordinator-name">
                {campus.coordinatorName || "Unassigned"}
              </span>
            </div>
          )}
          {isEditing ? (
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                onClick={saveEdit}
                disabled={updateCampus.isPending}
                data-testid="button-save-campus-detail"
              >
                {updateCampus.isPending ? (
                  <Spinner className="w-4 h-4 mr-1" />
                ) : (
                  <Check className="w-4 h-4 mr-1" />
                )}
                Save
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={cancelEdit}
                disabled={updateCampus.isPending}
                data-testid="button-cancel-edit-campus-detail"
              >
                <X className="w-4 h-4 mr-1" /> Cancel
              </Button>
            </div>
          ) : (
            <Button
              size="sm"
              variant="outline"
              onClick={startEdit}
              data-testid="button-edit-campus-detail"
            >
              <Pencil className="w-4 h-4 mr-1" /> Edit
            </Button>
          )}
          {!isEditing && (
            <Button
              size="sm"
              variant="outline"
              className="text-destructive hover:text-destructive border-destructive/40"
              onClick={() => setDeleteOpen(true)}
              data-testid="button-delete-campus-detail"
            >
              <Trash2 className="w-4 h-4 mr-1" /> Delete campus
            </Button>
          )}
        </div>
      </div>

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete campus "{campus.name}"?</AlertDialogTitle>
            <AlertDialogDescription>
              The campus can only be deleted if it has no teams. Any users
              currently attached to this campus will be detached. This action
              cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete-campus-detail">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                handleDelete();
              }}
              disabled={deleteCampus.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-testid="button-confirm-delete-campus-detail"
            >
              {deleteCampus.isPending && <Spinner className="w-4 h-4 mr-2" />}
              Delete campus
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard
          icon={<Users className="w-4 h-4" />}
          label="Active Teams"
          value={`${campus.activeTeams} / ${campus.totalTeams}`}
        />
        <StatCard
          icon={<IndianRupee className="w-4 h-4" />}
          label="Verified Revenue"
          value={formatINR(campus.totalRevenue)}
        />
        <StatCard
          icon={<ListChecks className="w-4 h-4" />}
          label="Order Book"
          value={formatINR(totalOrderBook)}
        />
        <StatCard
          icon={<IndianRupee className="w-4 h-4" />}
          label="Avg Revenue / Team"
          value={
            campus.totalTeams > 0
              ? formatINR(Math.round(totalRevenueFromTeams / campus.totalTeams))
              : formatINR(0)
          }
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Teams ({teams.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {teamsLoading ? (
            <div className="flex h-32 items-center justify-center">
              <Spinner />
            </div>
          ) : teams.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No teams have been registered at this campus yet.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Team</TableHead>
                  <TableHead>Leader</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Members</TableHead>
                  <TableHead className="text-right">Revenue</TableHead>
                  <TableHead className="text-right">Order Book</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {[...(teams as any[])]
                  .sort((a, b) => (b.totalRevenue ?? 0) - (a.totalRevenue ?? 0))
                  .map((t) => {
                    const variant =
                      t.status === "active"
                        ? "default"
                        : t.status === "pending"
                          ? "secondary"
                          : "destructive";
                    return (
                      <TableRow
                        key={t.id}
                        className="cursor-pointer hover-elevate"
                        onClick={() => setLocation(`/admin/teams/${t.id}`)}
                        data-testid={`row-team-${t.id}`}
                      >
                        <TableCell className="font-semibold">
                          <Link
                            href={`/admin/teams/${t.id}`}
                            className="hover:underline"
                            data-testid={`link-team-${t.id}`}
                            onClick={(e) => e.stopPropagation()}
                          >
                            {t.name}
                          </Link>
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {t.leaderName}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant={variant as any}
                            className="text-[10px] capitalize"
                          >
                            {t.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          {t.memberCount}
                        </TableCell>
                        <TableCell className="text-right font-medium text-primary">
                          {formatINR(t.totalRevenue ?? 0)}
                        </TableCell>
                        <TableCell className="text-right text-muted-foreground">
                          {formatINR(t.totalOrderBook ?? 0)}
                        </TableCell>
                      </TableRow>
                    );
                  })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Recent Activity</CardTitle>
        </CardHeader>
        <CardContent>
          {recentActivity.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No recent activity for this campus.
            </p>
          ) : (
            <div className="space-y-1">
              {recentActivity.map((log) => (
                <div
                  key={log.id}
                  className="text-sm border-b last:border-0 p-2 -mx-2"
                  data-testid={`row-activity-${log.id}`}
                >
                  <span className="font-semibold">{log.actorName}</span>{" "}
                  {log.action}{" "}
                  <span className="font-medium">{log.targetType}</span>
                  <div className="text-xs text-muted-foreground mt-1">
                    {new Date(log.createdAt).toLocaleString()}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
          {icon}
          {label}
        </div>
        <div className="text-2xl font-bold tracking-tight">{value}</div>
      </CardContent>
    </Card>
  );
}
