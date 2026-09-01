import { useParams } from "wouter";
import { useState, useEffect } from "react";
import { useAuth } from "@workspace/replit-auth-web";
import { useLocation } from "wouter";
import {
  useGetTeam,
  useDeleteTeam,
  getGetTeamQueryKey,
  getListTeamsQueryKey,
  type ErrorType,
} from "@workspace/api-client-react";
import { useQueryClient, useQuery, useMutation } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { useSeason } from "@/lib/season-context";
import {
  fetchTeamProjects,
  fetchTeamRevenue,
  fetchTeamOrderBook,
  teamSeasonKeys,
  type SeasonView,
} from "@/lib/team-season-api";
import { useToast } from "@/hooks/use-toast";
import { formatINR, formatDateTime } from "@/lib/format";
import { useAdminPageAccess } from "@/lib/admin-access";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Spinner } from "@/components/ui/spinner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  saveTeamAdminNotes,
  saveProjectAdminNotes,
} from "@/lib/admin-notes-api";
import {
  getTeamExemption,
  setTeamExemptions,
} from "@/lib/team-submissions-api";
import { Switch } from "@/components/ui/switch";
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
  StickyNote,
  Pencil,
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

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

// Modal editor for an admin note (team-level or per-project). Opens from the
// small "Admin note" buttons; saving empty text clears the note (the API
// stores null). Read-only view for admins without edit access.
function AdminNoteModal({
  open,
  onOpenChange,
  title,
  initial,
  placeholder,
  canEdit,
  onSave,
  testId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  initial: string;
  placeholder: string;
  canEdit: boolean;
  onSave: (value: string) => Promise<void>;
  testId: string;
}) {
  const { toast } = useToast();
  const [value, setValue] = useState(initial);
  const [saving, setSaving] = useState(false);

  // Re-sync the draft each time the modal opens with the latest saved note.
  useEffect(() => {
    if (open) setValue(initial);
  }, [open, initial]);

  const submit = async () => {
    setSaving(true);
    try {
      await onSave(value.trim());
      toast({ title: "Note saved" });
      onOpenChange(false);
    } catch (err) {
      toast({
        title: "Could not save note",
        description: err instanceof Error ? err.message : "Please try again.",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!saving) onOpenChange(o);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        {canEdit ? (
          <div className="space-y-3">
            <Textarea
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder={placeholder}
              rows={4}
              data-testid={`${testId}-input`}
            />
            <p className="text-xs text-muted-foreground">
              Visible to admins only.
            </p>
            <div className="flex justify-end">
              <Button
                size="sm"
                onClick={submit}
                disabled={saving}
                data-testid={`${testId}-save`}
              >
                {saving && <Spinner className="w-4 h-4 mr-2" />}
                Save note
              </Button>
            </div>
          </div>
        ) : (
          <p className="whitespace-pre-wrap text-sm text-muted-foreground">
            {initial || "No note yet."}
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}

// Header toggle: exempt THIS team from the global Projects Submissions Lock.
// On = this team can add revenue/order-book entries even while the global lock
// is on. Off = follows the global lock. Mirrors the "Teams Submissions" Config
// page (same endpoints), so both stay in sync.
function TeamSubmissionToggle({ teamId }: { teamId: number }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["team-exemption", teamId],
    queryFn: () => getTeamExemption(teamId),
    enabled: Number.isFinite(teamId),
  });
  const mutate = useMutation({
    mutationFn: (enabled: boolean) => setTeamExemptions({ teamId, enabled }),
    onSuccess: (_r, enabled) => {
      toast({
        title: enabled
          ? "Submissions enabled for this team"
          : "Submissions disabled for this team",
      });
      queryClient.invalidateQueries({ queryKey: ["team-exemption", teamId] });
      queryClient.invalidateQueries({ queryKey: ["admin-team-exemptions"] });
    },
    onError: (err: unknown) =>
      toast({
        title: "Could not update",
        description: err instanceof Error ? err.message : "Please try again.",
        variant: "destructive",
      }),
  });

  return (
    <label
      className="flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm select-none"
      title="Allow this team to add revenue / order book entries even while the global submissions lock is on"
      data-testid="team-submission-toggle"
    >
      <span className="text-muted-foreground">Submissions</span>
      <Switch
        checked={data?.exempted ?? false}
        disabled={isLoading || mutate.isPending}
        onCheckedChange={(c) => mutate.mutate(c)}
        aria-label="Allow submissions for this team while locked"
      />
    </label>
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
  // Which season's rows this page is showing. Defaults to the season being
  // viewed, so a 2.0 admin sees 2.0 work and a 1.0 admin sees 1.0 work — the
  // "All" tab is opt-in rather than the default, because mixing seasons is
  // what made this page confusing in the first place.
  const { seasons, viewingId } = useSeason();
  const [seasonView, setSeasonView] = useState<SeasonView>(viewingId ?? 1);
  // Follow the global switcher when it changes, unless the admin has chosen
  // "All" — that choice is theirs to undo.
  useEffect(() => {
    if (viewingId != null) {
      setSeasonView((prev) => (prev === "all" ? prev : viewingId));
    }
  }, [viewingId]);

  const allSeasonIds = seasons.map((s) => s.id);

  const {
    data: orderBook = [],
    isFetching: orderBookFetching,
  } = useQuery({
    queryKey: teamSeasonKeys.orderBook(teamId, seasonView),
    queryFn: () => fetchTeamOrderBook(teamId, seasonView, allSeasonIds),
    enabled: Number.isFinite(teamId) && allSeasonIds.length > 0,
  });
  const {
    data: revenue = [],
    isFetching: revenueFetching,
  } = useQuery({
    queryKey: teamSeasonKeys.revenue(teamId, seasonView),
    queryFn: () => fetchTeamRevenue(teamId, seasonView, allSeasonIds),
    enabled: Number.isFinite(teamId) && allSeasonIds.length > 0,
  });
  const {
    data: seasonProjects = [],
    isFetching: projectsFetching,
  } = useQuery({
    queryKey: teamSeasonKeys.projects(teamId, seasonView),
    queryFn: () => fetchTeamProjects(teamId, seasonView, allSeasonIds),
    enabled: Number.isFinite(teamId) && allSeasonIds.length > 0,
  });

  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const deleteTeam = useDeleteTeam();
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [teamNoteOpen, setTeamNoteOpen] = useState(false);

  const isAdmin = user?.role === "admin";
  // Respect the super-admin-controlled per-page delete permission for the
  // Teams page on this detail view too (API enforces it as well).
  const { canEdit, canDelete } = useAdminPageAccess("/admin/teams");
  const canEditNotes = isAdmin && canEdit;

  const invalidateTeam = () =>
    queryClient.invalidateQueries({ queryKey: getGetTeamQueryKey(teamId) });
  const saveTeamNotes = async (value: string) => {
    await saveTeamAdminNotes(teamId, value);
    invalidateTeam();
  };
  const saveProjectNotes = async (projectId: number, value: string) => {
    await saveProjectAdminNotes(projectId, value);
    invalidateTeam();
  };

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

  // The generated team response contains only the globally viewed season.
  // Once the season list is available, the explicit season query is the sole
  // source of truth. In particular, an empty selected season must stay empty
  // rather than falling back to another season's projects.
  const projects: any[] =
    allSeasonIds.length > 0 ? seasonProjects : ((team as any).projects ?? []);
  const selectedSeasonLabel =
    seasonView === "all"
      ? "All seasons"
      : (seasons.find((s) => s.id === seasonView)?.slug ?? String(seasonView));
  const seasonDataFetching =
    allSeasonIds.length > 0 &&
    (orderBookFetching || revenueFetching || projectsFetching);

  // The team endpoint's summary is tied to the global viewed season, not the
  // local 1.0 / 2.0 / All control. Derive these totals from the rows currently
  // rendered so the cards always match the selected view.
  const verifiedRevenueTotal = (revenue as any[]).reduce((total, entry) => {
    if (String(entry.status ?? "").toLowerCase() !== "verified") return total;
    return total + Number(entry.verifiedAmount ?? entry.amount ?? 0);
  }, 0);
  const verifiedOrderBookTotal = (orderBook as any[]).reduce((total, entry) => {
    if (String(entry.status ?? "").toLowerCase() !== "verified") return total;
    return total + Number(entry.verifiedAmount ?? entry.amount ?? 0);
  }, 0);

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
  const teamNote = (
    (team as unknown as { adminNotes?: string }).adminNotes ?? ""
  ).trim();

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
          {isAdmin && canEdit && <TeamSubmissionToggle teamId={teamId} />}
          {(canEditNotes || teamNote) && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => setTeamNoteOpen(true)}
              data-testid="button-team-admin-note"
            >
              <StickyNote className="w-4 h-4 mr-1" />
              {teamNote ? "Admin note" : "Add admin note"}
            </Button>
          )}
          <Badge
            variant={statusVariant as any}
            className="text-xs uppercase tracking-wide"
          >
            {team.status}
          </Badge>
          {isAdmin && canDelete && (
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

      {/* Season filter. Only rendered once more than one season exists, so a
          single-season deployment sees the page exactly as before. */}
      {seasons.length > 1 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium text-muted-foreground">
            Showing
          </span>
          {[
            ...seasons.map((s) => ({ key: s.id as SeasonView, label: s.slug })),
            { key: "all" as SeasonView, label: "All" },
          ].map((opt) => {
            const active = seasonView === opt.key;
            return (
              <button
                key={String(opt.key)}
                type="button"
                onClick={() => setSeasonView(opt.key)}
                data-testid={`team-season-${opt.label.toLowerCase()}`}
                className={cn(
                  "rounded-full border px-3 py-1 text-xs font-semibold transition-colors",
                  active
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border text-muted-foreground hover:bg-muted",
                )}
              >
                {opt.label}
              </button>
            );
          })}
          {seasonDataFetching && (
            <span className="ml-1 inline-flex items-center gap-1 text-xs text-muted-foreground">
              <Spinner className="h-3 w-3" />
              Loading {selectedSeasonLabel} data…
            </span>
          )}
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard
          icon={<Users className="w-4 h-4" />}
          label="Members"
          value={String(team.memberCount ?? team.members?.length ?? 0)}
        />
        <StatCard
          icon={<FolderKanban className="w-4 h-4" />}
          label="Projects"
          value={String(projects.length)}
        />
        <StatCard
          icon={<IndianRupee className="w-4 h-4" />}
          label="Verified Revenue"
          value={formatINR(verifiedRevenueTotal)}
        />
        <StatCard
          icon={<ListChecks className="w-4 h-4" />}
          label="Order Book"
          value={formatINR(verifiedOrderBookTotal)}
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

      {/* Team admin note — opened from the small header button. */}
      <AdminNoteModal
        open={teamNoteOpen}
        onOpenChange={setTeamNoteOpen}
        title={`Admin note — ${team.name}`}
        initial={teamNote}
        placeholder="Overall notes about this team (admins only)…"
        canEdit={canEditNotes}
        onSave={saveTeamNotes}
        testId="team-admin-notes"
      />

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
                canEdit={canEditNotes}
                onSaveNotes={(value) => saveProjectNotes(p.id, value)}
                // Only tagged in the "All" view; a single-season view would
                // repeat the same badge on every card.
                seasonSlug={
                  seasonView === "all"
                    ? seasons.find((s) => s.id === p.seasonId)?.slug
                    : undefined
                }
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
  canEdit,
  onSaveNotes,
  seasonSlug,
}: {
  project: any;
  orderBook: any[];
  revenue: any[];
  canEdit: boolean;
  onSaveNotes: (value: string) => Promise<void>;
  /** "1.0" / "2.0", or undefined when the page shows a single season. */
  seasonSlug?: string;
}) {
  const { toast } = useToast();
  const [noteOpen, setNoteOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const note = String(project.adminNotes ?? "").trim();

  const deleteNote = async () => {
    setDeleting(true);
    try {
      await onSaveNotes("");
      toast({ title: "Note deleted" });
      setConfirmDelete(false);
    } catch (err) {
      toast({
        title: "Could not delete note",
        description: err instanceof Error ? err.message : "Please try again.",
        variant: "destructive",
      });
    } finally {
      setDeleting(false);
    }
  };

  return (
    <Card data-testid={`project-${project.id}`}>
      <CardHeader className="pb-3">
        <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-2">
          <div className="min-w-0">
            <CardTitle className="text-base flex items-center gap-2">
              {project.title}
              {/* Season tag. Only meaningful when the page is showing more
                  than one season, which is the "All" view — otherwise every
                  card carries the same tag and it is just noise. */}
              {seasonSlug && (
                <Badge className="bg-primary text-primary-foreground text-[10px]">
                  {seasonSlug}
                </Badge>
              )}
              <Badge variant="outline" className="text-[10px] capitalize">
                {project.status}
              </Badge>
              {canEdit && !note && (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-6 px-2 text-xs"
                  onClick={() => setNoteOpen(true)}
                  data-testid={`button-add-project-note-${project.id}`}
                >
                  <StickyNote className="w-3 h-3 mr-1" /> Add admin note
                </Button>
              )}
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
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
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
        </div>
        {/* Saved note shown at the bottom of the project, with edit/delete
            icon buttons for admins who may edit. */}
        {note ? (
          <div
            className="space-y-1.5 rounded-md border bg-muted/20 p-3"
            data-testid={`project-note-${project.id}`}
          >
            <div className="flex items-center justify-between gap-2">
              <h4 className="flex items-center gap-1.5 text-sm font-medium">
                <StickyNote className="w-3.5 h-3.5" /> Admin note
              </h4>
              {canEdit && (
                <div className="flex gap-1">
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7"
                    onClick={() => setNoteOpen(true)}
                    aria-label="Edit admin note"
                    data-testid={`button-edit-project-note-${project.id}`}
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7 text-destructive hover:text-destructive"
                    onClick={() => setConfirmDelete(true)}
                    aria-label="Delete admin note"
                    data-testid={`button-delete-project-note-${project.id}`}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              )}
            </div>
            <p className="whitespace-pre-wrap text-sm text-muted-foreground">
              {note}
            </p>
          </div>
        ) : null}
      </CardContent>

      <AdminNoteModal
        open={noteOpen}
        onOpenChange={setNoteOpen}
        title={`Admin note — ${project.title}`}
        initial={note}
        placeholder="Notes about this project (admins only)…"
        canEdit={canEdit}
        onSave={onSaveNotes}
        testId={`project-notes-${project.id}`}
      />

      <AlertDialog
        open={confirmDelete}
        onOpenChange={(open) => {
          if (!deleting) setConfirmDelete(open);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this admin note?</AlertDialogTitle>
            <AlertDialogDescription>
              The note on "{project.title}" will be removed. This cannot be
              undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                void deleteNote();
              }}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-testid={`button-confirm-delete-project-note-${project.id}`}
            >
              {deleting && <Spinner className="w-4 h-4 mr-2" />}
              Delete note
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}

function truncateReason(s: string, n = 40): string {
  return s.length > n ? `${s.slice(0, n).trimEnd()}…` : s;
}

// Light row tint by entry status: green (verified), red (rejected), yellow
// (submitted). Others (draft/revoked) get no tint.
function statusRowClass(status: string): string {
  switch (status.toLowerCase()) {
    case "verified":
      return "bg-green-50 hover:bg-green-100/70 dark:bg-green-950/25 dark:hover:bg-green-950/40";
    case "rejected":
      return "bg-red-50 hover:bg-red-100/70 dark:bg-red-950/25 dark:hover:bg-red-950/40";
    case "submitted":
      return "bg-amber-50 hover:bg-amber-100/70 dark:bg-amber-950/25 dark:hover:bg-amber-950/40";
    default:
      return "";
  }
}

// Soft status badge — same light tint as the row (no thick/solid fill), with
// black text.
function statusBadgeClass(status: string): string {
  switch (status.toLowerCase()) {
    case "verified":
      return "bg-green-100 border-green-200 text-black hover:bg-green-100 dark:bg-green-950/40 dark:border-green-900 dark:text-green-100";
    case "rejected":
      return "bg-red-100 border-red-200 text-black hover:bg-red-100 dark:bg-red-950/40 dark:border-red-900 dark:text-red-100";
    case "submitted":
      return "bg-amber-100 border-amber-200 text-black hover:bg-amber-100 dark:bg-amber-950/40 dark:border-amber-900 dark:text-amber-100";
    default:
      return "bg-muted text-foreground";
  }
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
  // Full rejection reason shown in a modal when a truncated reason is clicked.
  const [reasonModal, setReasonModal] = useState<{
    client: string;
    reason: string;
  } | null>(null);

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
                <TableHead className="whitespace-nowrap">
                  Date &amp; time
                </TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead>Rejection reason</TableHead>
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
                const dateVal = e.submittedAt ?? e.createdAt ?? null;
                const isRejected =
                  String(e.status ?? "").toLowerCase() === "rejected";
                const reason = String(e.adminNotes ?? "").trim();
                const statusStr = String(e.status ?? "");
                return (
                  <TableRow
                    key={e.id}
                    data-testid={`${testIdPrefix}-${e.id}`}
                    className={statusRowClass(statusStr)}
                  >
                    <TableCell className="text-sm">
                      {e.clientName ?? "—"}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={`text-[10px] capitalize font-medium ${statusBadgeClass(statusStr)}`}
                      >
                        {e.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                      {dateVal ? formatDateTime(dateVal) : "—"}
                    </TableCell>
                    <TableCell className="text-right">
                      {formatINR(e.verifiedAmount ?? e.amount ?? 0)}
                    </TableCell>
                    <TableCell className="max-w-[220px]">
                      {isRejected && reason ? (
                        <button
                          type="button"
                          className="text-left text-xs text-destructive hover:underline"
                          onClick={() =>
                            setReasonModal({
                              client: e.clientName ?? "—",
                              reason,
                            })
                          }
                          data-testid={`${testIdPrefix}-${e.id}-reason`}
                          title="Click to view full reason"
                        >
                          {truncateReason(reason)}
                        </button>
                      ) : isRejected ? (
                        <span className="text-xs text-muted-foreground italic">
                          No reason given
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
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

      <Dialog
        open={reasonModal != null}
        onOpenChange={(open) => {
          if (!open) setReasonModal(null);
        }}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Rejection reason</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">
              Client: {reasonModal?.client}
            </p>
            <p className="whitespace-pre-wrap text-sm leading-relaxed">
              {reasonModal?.reason}
            </p>
          </div>
        </DialogContent>
      </Dialog>
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
