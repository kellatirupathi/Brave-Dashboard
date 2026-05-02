import { useParams } from "wouter";
import { useState } from "react";
import { useAuth } from "@workspace/replit-auth-web";
import { useLocation } from "wouter";
import {
  useGetTeam,
  useListOrderBookEntries,
  useListRevenueEntries,
  useDeleteTeam,
  getGetTeamQueryKey,
  getListTeamsQueryKey,
  getListOrderBookEntriesQueryKey,
  getListRevenueEntriesQueryKey,
  type ErrorType,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { formatINR, formatDateTime } from "@/lib/format";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Spinner } from "@/components/ui/spinner";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  ArrowLeft,
  Users,
  FolderKanban,
  IndianRupee,
  ListChecks,
  Trash2,
} from "lucide-react";
import { DocumentLinkButton } from "@/components/document-viewer";
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

function docLink(url: string | null | undefined, label: string, key: string) {
  if (!url) return null;
  return (
    <DocumentLinkButton
      key={key}
      url={url}
      label={label}
      variant="inline"
      testId={`attachment-${key}`}
    />
  );
}

export default function AdminTeamDetail() {
  const params = useParams<{ id: string }>();
  const teamId = Number(params.id);
  const { user } = useAuth();
  const backHref =
    user?.role === "admin"
      ? "/admin/teams"
      : user?.role === "coordinator"
        ? "/coordinator/leaderboard"
        : "/leaderboard";
  const backLabel =
    user?.role === "admin" ? "Back to Teams" : "Back to Leaderboard";

  const { data: team, isLoading: teamLoading } = useGetTeam(teamId, {
    query: {
      queryKey: getGetTeamQueryKey(teamId),
      enabled: Number.isFinite(teamId),
    },
  });
  const { data: orderBook = [] } = useListOrderBookEntries(
    { teamId },
    {
      query: {
        queryKey: getListOrderBookEntriesQueryKey({ teamId }),
        enabled: Number.isFinite(teamId),
      },
    },
  );
  const { data: revenue = [] } = useListRevenueEntries(
    { teamId },
    {
      query: {
        queryKey: getListRevenueEntriesQueryKey({ teamId }),
        enabled: Number.isFinite(teamId),
      },
    },
  );

  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const deleteTeam = useDeleteTeam();
  const [deleteOpen, setDeleteOpen] = useState(false);

  const isAdmin = user?.role === "admin";

  const handleDelete = () => {
    deleteTeam.mutate(
      { id: teamId },
      {
        onSuccess: () => {
          toast({ title: "Team deleted" });
          queryClient.invalidateQueries({ queryKey: getListTeamsQueryKey() });
          setDeleteOpen(false);
          setLocation("/admin/teams");
        },
        onError: (err: ErrorType<unknown>) => {
          toast({
            title: "Delete failed",
            description:
              err instanceof Error ? err.message : "Please try again.",
            variant: "destructive",
          });
        },
      },
    );
  };

  if (teamLoading || !team) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  const projects: any[] = (team as any).projects ?? [];

  // Group order book + revenue entries by project. Anything orphaned
  // (project missing or unknown) lands in an "Unassigned" bucket.
  const obByProject = new Map<number, any[]>();
  for (const e of orderBook as any[]) {
    const arr = obByProject.get(e.projectId) ?? [];
    arr.push(e);
    obByProject.set(e.projectId, arr);
  }
  const revByProject = new Map<number, any[]>();
  for (const e of revenue as any[]) {
    const arr = revByProject.get(e.projectId) ?? [];
    arr.push(e);
    revByProject.set(e.projectId, arr);
  }

  const knownProjectIds = new Set(projects.map((p) => p.id));
  const orphanedOB = (orderBook as any[]).filter(
    (e) => !knownProjectIds.has(e.projectId),
  );
  const orphanedRev = (revenue as any[]).filter(
    (e) => !knownProjectIds.has(e.projectId),
  );

  const statusVariant = team.status === "active" ? "default" : "destructive";

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            if (window.history.length > 1) window.history.back();
            else window.location.assign(backHref);
          }}
          data-testid="button-back-to-teams"
        >
          <ArrowLeft className="w-4 h-4 mr-1" /> {backLabel}
        </Button>
      </div>

      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div>
          <h1
            className="text-3xl font-bold tracking-tight"
            data-testid="text-team-name"
          >
            {team.name}
          </h1>
          <p className="text-muted-foreground mt-1">
            {team.tagline || "—"} · {team.campusName}
          </p>
          {(isAdmin || user?.role === "coordinator") && (
            <p
              className="text-xs text-muted-foreground mt-1"
              data-testid="text-team-last-updated"
            >
              Last updated:{" "}
              {formatDateTime(
                (team as unknown as { updatedAt?: string | Date | null })
                  .updatedAt ?? team.createdAt,
              )}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Badge
            variant={statusVariant as any}
            className="text-xs uppercase tracking-wide"
          >
            {team.status}
          </Badge>
          {isAdmin && (
            <Button
              size="sm"
              variant="outline"
              className="text-destructive hover:text-destructive border-destructive/40"
              onClick={() => setDeleteOpen(true)}
              data-testid="button-delete-team"
            >
              <Trash2 className="w-4 h-4 mr-1" /> Delete team
            </Button>
          )}
        </div>
      </div>

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete team "{team.name}"?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently deletes the team and ALL associated data —
              members, projects, revenue entries, order book entries,
              milestones, demo day applications, invitations and join/leave
              requests. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete-team-detail">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                handleDelete();
              }}
              disabled={deleteTeam.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-testid="button-confirm-delete-team-detail"
            >
              {deleteTeam.isPending && <Spinner className="w-4 h-4 mr-2" />}
              Delete team
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard
          icon={<Users className="w-4 h-4" />}
          label="Members"
          value={String(team.memberCount ?? team.members?.length ?? 0)}
        />
        <StatCard
          icon={<FolderKanban className="w-4 h-4" />}
          label="Projects"
          value={String(team.projectCount ?? projects.length)}
        />
        <StatCard
          icon={<IndianRupee className="w-4 h-4" />}
          label="Verified Revenue"
          value={formatINR(team.totalRevenue ?? 0)}
        />
        <StatCard
          icon={<ListChecks className="w-4 h-4" />}
          label="Order Book"
          value={formatINR(team.totalOrderBook ?? 0)}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">
            Members ({team.members?.length ?? 0})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {team.members?.length ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {team.members.map((m: any) => (
                <div
                  key={m.userId}
                  className="flex items-center gap-3 p-3 rounded-md border"
                  data-testid={`member-${m.userId}`}
                >
                  <Avatar>
                    <AvatarImage src={m.profileImage || undefined} />
                    <AvatarFallback>
                      {m.firstName?.[0] ?? "?"}
                      {m.lastName?.[0] ?? ""}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">
                      {m.firstName} {m.lastName}
                    </p>
                    <p className="text-xs text-muted-foreground truncate">
                      {m.niatId ?? m.email}
                    </p>
                  </div>
                  {m.isLeader && (
                    <Badge variant="secondary" className="text-[10px]">
                      Leader
                    </Badge>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No members yet.</p>
          )}
        </CardContent>
      </Card>

      <div>
        <h2 className="text-xl font-semibold tracking-tight mb-3">
          Projects ({projects.length})
        </h2>
        <p className="text-sm text-muted-foreground mb-4">
          Each project below shows the order book and revenue entries it has
          produced.
        </p>

        {projects.length === 0 ? (
          <Card>
            <CardContent className="py-10 text-center text-sm text-muted-foreground">
              No projects submitted yet.
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {projects.map((p) => (
              <ProjectCard
                key={p.id}
                project={p}
                orderBook={obByProject.get(p.id) ?? []}
                revenue={revByProject.get(p.id) ?? []}
              />
            ))}
          </div>
        )}

        {(orphanedOB.length > 0 || orphanedRev.length > 0) && (
          <Card className="mt-4 border-dashed">
            <CardHeader>
              <CardTitle className="text-base">Unassigned entries</CardTitle>
              <p className="text-xs text-muted-foreground">
                These entries reference a project that no longer exists.
              </p>
            </CardHeader>
            <CardContent className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <EntryTable
                title="Order Book"
                entries={orphanedOB}
                emptyText="None."
                testIdPrefix="ob-orphan"
              />
              <EntryTable
                title="Revenue"
                entries={orphanedRev}
                emptyText="None."
                testIdPrefix="rev-orphan"
              />
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

function ProjectCard({
  project,
  orderBook,
  revenue,
}: {
  project: any;
  orderBook: any[];
  revenue: any[];
}) {
  return (
    <Card data-testid={`project-${project.id}`}>
      <CardHeader className="pb-3">
        <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-2">
          <div className="min-w-0">
            <CardTitle className="text-base flex items-center gap-2">
              {project.title}
              <Badge variant="outline" className="text-[10px] capitalize">
                {project.status}
              </Badge>
            </CardTitle>
            {project.description && (
              <p className="text-xs text-muted-foreground mt-1 max-w-2xl">
                {project.description}
              </p>
            )}
          </div>
          <div className="flex gap-4 text-sm shrink-0">
            <div className="text-right">
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                Verified Revenue
              </div>
              <div className="font-semibold">
                {formatINR(project.verifiedRevenue ?? 0)}
              </div>
            </div>
            <div className="text-right">
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                Order Book
              </div>
              <div className="font-semibold">
                {formatINR(project.verifiedOrderBook ?? 0)}
              </div>
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <EntryTable
          title={`Order Book (${orderBook.length})`}
          entries={orderBook}
          emptyText="No order book entries."
          testIdPrefix={`ob-p${project.id}`}
        />
        <EntryTable
          title={`Revenue (${revenue.length})`}
          entries={revenue}
          emptyText="No revenue entries."
          testIdPrefix={`rev-p${project.id}`}
        />
      </CardContent>
    </Card>
  );
}

function EntryTable({
  title,
  entries,
  emptyText,
  testIdPrefix,
}: {
  title: string;
  entries: any[];
  emptyText: string;
  testIdPrefix: string;
}) {
  return (
    <div>
      <h4 className="text-sm font-medium mb-2">{title}</h4>
      {entries.length === 0 ? (
        <p className="text-xs text-muted-foreground">{emptyText}</p>
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Client</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead>Attachments</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {entries.map((e) => {
                const attachments = [
                  docLink(
                    e.supportingDocUrl,
                    "Supporting doc",
                    `${testIdPrefix}-${e.id}-support`,
                  ),
                  docLink(e.brdUrl, "BRD", `${testIdPrefix}-${e.id}-brd`),
                  docLink(
                    e.testimonialUrl,
                    "Testimonial",
                    `${testIdPrefix}-${e.id}-testimonial`,
                  ),
                ].filter(Boolean);
                return (
                  <TableRow key={e.id} data-testid={`${testIdPrefix}-${e.id}`}>
                    <TableCell className="text-sm">
                      {e.clientName ?? "—"}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className="text-[10px] capitalize"
                      >
                        {e.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      {formatINR(e.verifiedAmount ?? e.amount ?? 0)}
                    </TableCell>
                    <TableCell>
                      {attachments.length > 0 ? (
                        <div className="flex flex-wrap gap-2">
                          {attachments}
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">
                          None
                        </span>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
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
