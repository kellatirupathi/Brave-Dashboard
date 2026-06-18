import { useState } from "react";
import { useLocation, Link } from "wouter";
import { useAuth } from "@workspace/replit-auth-web";
import {
  useGetMyTeam,
  useListMilestones,
  useListTeamInvitations,
  useListTeamJoinRequests,
  useListTeamLeaveRequests,
  useSearchCampusStudents,
  useSendTeamInvitation,
  useCancelInvitation,
  useApproveJoinRequest,
  useDeclineJoinRequest,
  useRequestToLeaveTeam,
  useApproveLeaveRequest,
  useDeclineLeaveRequest,
  useRemoveTeamMember,
  useTransferTeamLeadership,
  useDeleteTeam,
  useUpdateTeam,
  useGetProgrammeConfig,
  getGetMyTeamQueryKey,
  getListMilestonesQueryKey,
  getSearchCampusStudentsQueryKey,
} from "@workspace/api-client-react";
import type { TeamDetail } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { PendingMembershipBanner } from "@/components/pending-membership-banner";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Spinner } from "@/components/ui/spinner";
import { Progress } from "@/components/ui/progress";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  CalendarDays,
  Flag,
  Copy,
  UserPlus,
  Check,
  X,
  LogOut,
  Users,
  KeyRound,
  MoreVertical,
  Crown,
  UserMinus,
  Trash2,
  Mail,
  ShieldCheck,
  Inbox,
  FolderKanban,
  Activity,
  CheckCircle2,
  ChevronRight,
  Trophy,
  BookOpen,
  TrendingUp,
  Target,
  Rocket,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { formatDate, formatINR } from "@/lib/format";
import { InlineEditField } from "@/components/inline-edit-field";
import { invalidateMembershipQueries } from "@/lib/queries";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

export default function TeamProfile() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const { data: team, isLoading: teamLoading } = useGetMyTeam({
    query: { queryKey: getGetMyTeamQueryKey(), retry: false },
  });
  const { toast } = useToast();
  const queryClient = useQueryClient();

  if (teamLoading)
    return (
      <div className="flex h-64 items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  if (!team) {
    setLocation("/get-started");
    return null;
  }

  return (
    <TeamView
      team={team as TeamDetail}
      userId={user?.id ?? ""}
      toast={toast}
      queryClient={queryClient}
      setLocation={setLocation}
    />
  );
}

function memberInitials(firstName?: string, lastName?: string, email?: string) {
  const f = (firstName ?? "").trim();
  const l = (lastName ?? "").trim();
  if (f || l) return `${f[0] ?? ""}${l[0] ?? ""}`.toUpperCase();
  return (email ?? "?").substring(0, 2).toUpperCase();
}

function nameInitials(name?: string | null, email?: string | null) {
  const trimmed = (name ?? "").trim();
  if (trimmed) {
    return trimmed
      .split(/\s+/)
      .map((s) => s[0] ?? "")
      .join("")
      .slice(0, 2)
      .toUpperCase();
  }
  return (email ?? "?").substring(0, 2).toUpperCase();
}

// Human-friendly "how long this team has existed" label for the health strip.
function teamAgeLabel(createdAt?: string | null) {
  if (!createdAt) return "—";
  const start = new Date(createdAt).getTime();
  if (Number.isNaN(start)) return "—";
  const days = Math.max(0, Math.floor((Date.now() - start) / 86400000));
  if (days < 1) return "Today";
  if (days < 7) return `${days}d`;
  const weeks = Math.floor(days / 7);
  if (weeks < 8) return `${weeks}w`;
  const months = Math.floor(days / 30);
  return `${months}mo`;
}

// Flat, bordered surface — the building block of the workspace (no floating
// drop-shadow "cards", just clean panels like Linear / Notion.)
function Panel({
  className,
  children,
  id,
}: {
  className?: string;
  children: React.ReactNode;
  id?: string;
}) {
  return (
    <section id={id} className={cn("rounded-xl border bg-card", className)}>
      {children}
    </section>
  );
}

// Consistent L2 section heading used across every panel.
function SectionHeading({
  icon: Icon,
  title,
  count,
  caption,
  right,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  count?: number | string;
  caption?: string;
  right?: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-3 border-b px-4 py-3 sm:px-5">
      <div className="flex min-w-0 items-center gap-2">
        <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
        <h2 className="truncate text-sm font-semibold tracking-tight text-foreground">
          {title}
        </h2>
        {count != null && (
          <span className="rounded-full bg-muted px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground">
            {count}
          </span>
        )}
        {caption && (
          <span className="hidden truncate text-xs text-muted-foreground sm:inline">
            · {caption}
          </span>
        )}
      </div>
      {right && <div className="shrink-0">{right}</div>}
    </div>
  );
}

// Compact stat block for the health strip — dense, no icons, no shadow.
function MetricBlock({
  label,
  value,
  sub,
  children,
}: {
  label: string;
  value?: React.ReactNode;
  sub?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border bg-card px-4 py-3">
      <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      {children ?? (
        <div className="mt-1 truncate text-xl font-semibold tracking-tight text-foreground">
          {value}
        </div>
      )}
      {sub && (
        <div className="mt-0.5 truncate text-xs text-muted-foreground">
          {sub}
        </div>
      )}
    </div>
  );
}

function TeamView({
  team,
  userId,
  toast,
  queryClient,
  setLocation,
}: {
  team: TeamDetail;
  userId: string;
  toast: ReturnType<typeof useToast>["toast"];
  queryClient: ReturnType<typeof useQueryClient>;
  setLocation: (to: string) => void;
}) {
  const isLeader = String(team.leaderId) === userId;
  const { data: milestones, isLoading: milestonesLoading } = useListMilestones(
    { teamId: team.id },
    {
      query: {
        queryKey: getListMilestonesQueryKey({ teamId: team.id }),
        enabled: !!team.id,
      },
    },
  );
  const { data: sentInvitations } = useListTeamInvitations(team.id);
  const { data: joinRequests } = useListTeamJoinRequests(team.id);
  const { data: leaveRequests } = useListTeamLeaveRequests(team.id);
  const { data: programmeConfig } = useGetProgrammeConfig();
  const teamMemberLimit = programmeConfig?.teamMemberLimit ?? 5;
  const memberCount = team.members.length;
  const isTeamFull = memberCount >= teamMemberLimit;

  const sendInvite = useSendTeamInvitation();
  const cancelInvite = useCancelInvitation();
  const approveJoin = useApproveJoinRequest();
  const declineJoin = useDeclineJoinRequest();
  const requestLeave = useRequestToLeaveTeam();
  const approveLeave = useApproveLeaveRequest();
  const declineLeave = useDeclineLeaveRequest();
  const removeMember = useRemoveTeamMember();
  const transferLeadership = useTransferTeamLeadership();
  const deleteTeam = useDeleteTeam();
  const updateTeam = useUpdateTeam();

  const saveTeamField = async (field: "name" | "tagline", next: string) => {
    try {
      await updateTeam.mutateAsync({
        id: team.id,
        data: { [field]: next },
      });
      await queryClient.invalidateQueries({ queryKey: getGetMyTeamQueryKey() });
      toast({
        title: field === "name" ? "Team name updated" : "Tagline updated",
      });
    } catch (err: unknown) {
      const message =
        err instanceof Error
          ? err.message
          : `Could not update team ${field}. Try again.`;
      toast({
        title: "Update failed",
        description: message,
        variant: "destructive",
      });
      // Re-throw so the inline-edit component reverts the draft and exits
      // edit mode after surfacing the error.
      throw err;
    }
  };

  const [inviteOpen, setInviteOpen] = useState(false);
  const [searchQ, setSearchQ] = useState("");
  const [leaveOpen, setLeaveOpen] = useState(false);
  const [removeTarget, setRemoveTarget] = useState<{
    userId: string;
    name: string;
  } | null>(null);
  const [transferTarget, setTransferTarget] = useState<{
    userId: string;
    name: string;
  } | null>(null);
  const [deleteTeamOpen, setDeleteTeamOpen] = useState(false);
  const [cancelInviteTarget, setCancelInviteTarget] = useState<{
    id: number;
    inviteeName: string;
  } | null>(null);

  const pendingInvitations =
    sentInvitations?.filter((i) => i.status === "pending") ?? [];
  const pendingJoins =
    joinRequests?.filter((j) => j.status === "pending") ?? [];
  const pendingLeaves =
    leaveRequests?.filter((l) => l.status === "pending") ?? [];
  const totalRequests =
    pendingInvitations.length +
    pendingJoins.length +
    (isLeader ? pendingLeaves.length : 0);

  const { data: students = [] } = useSearchCampusStudents(
    { q: searchQ },
    {
      query: {
        queryKey: getSearchCampusStudentsQueryKey({ q: searchQ }),
        enabled: searchQ.trim().length >= 2,
      },
    },
  );

  const invalidateAll = () => {
    invalidateMembershipQueries(queryClient, { teamId: team.id });
  };

  const copyInviteCode = async () => {
    if (!team.inviteCode) {
      toast({ title: "No invite code on this team", variant: "destructive" });
      return;
    }
    try {
      await navigator.clipboard.writeText(team.inviteCode);
      toast({ title: "Invite code copied", description: team.inviteCode });
    } catch {
      toast({ title: "Could not copy", variant: "destructive" });
    }
  };

  const handleInvite = (
    target: { inviteeId?: string | null; rosterId?: number | null },
    name: string,
  ) => {
    const data: { inviteeId?: string; rosterId?: number } = {};
    if (target.inviteeId) data.inviteeId = target.inviteeId;
    else if (target.rosterId != null) data.rosterId = target.rosterId;
    else {
      toast({
        title: "Could not invite",
        description: "Missing student identifier.",
        variant: "destructive",
      });
      return;
    }
    sendInvite.mutate(
      { id: team.id, data },
      {
        onSuccess: () => {
          toast({
            title: "Invitation sent",
            description: `${name} will see it in their invitations.`,
          });
          invalidateAll();
        },
        onError: (err: unknown) => {
          const raw = (err as { message?: string })?.message ?? "Try again.";
          const cleaned = raw.replace(/^HTTP\s+\d+[^:]*:\s*/i, "");
          toast({
            description: cleaned,
            variant: "destructive",
          });
        },
      },
    );
  };

  const handleApproveJoin = (id: number) =>
    approveJoin.mutate(
      { id },
      {
        onSuccess: (res) => {
          // Approval auto-applies unless gated; the server signals which via
          // `status` ("applied" = joined now, "pending_approval" = needs admin).
          const r = res as { status?: string; message?: string } | undefined;
          const applied = r?.status === "applied";
          toast({
            title: applied ? "Member added" : "Awaiting admin approval",
            description:
              r?.message ??
              (applied
                ? "The student has been added to the team."
                : "Sent for admin approval. The student joins once approved."),
          });
          invalidateAll();
        },
        onError: (err: unknown) => {
          const e = err as { data?: { error?: string }; message?: string };
          toast({
            title: "Failed",
            description: e?.data?.error ?? e?.message,
            variant: "destructive",
          });
        },
      },
    );
  const handleDeclineJoin = (id: number) =>
    declineJoin.mutate(
      { id },
      {
        onSuccess: () => {
          toast({ title: "Request declined" });
          invalidateAll();
        },
        onError: (err: unknown) =>
          toast({
            title: "Failed",
            description: (err as { message?: string })?.message,
            variant: "destructive",
          }),
      },
    );

  const handleConfirmLeave = () => {
    requestLeave.mutate(
      { id: team.id, data: {} },
      {
        onSuccess: (res) => {
          // Leaving auto-approves unless the team has verified revenue (then it
          // is gated). The server signals which via `status`.
          const r = res as { status?: string; message?: string } | undefined;
          const applied = r?.status === "applied";
          toast({
            title: applied ? "You've left the team" : "Awaiting admin approval",
            description:
              r?.message ??
              (applied
                ? `You've left ${team.name}.`
                : `Your request to leave ${team.name} has been sent for admin approval.`),
          });
          setLeaveOpen(false);
          invalidateAll();
        },
        onError: (err: unknown) => {
          const e = err as { data?: { error?: string }; message?: string };
          toast({
            title: "Could not leave team",
            description: e?.data?.error ?? e?.message ?? "Try again.",
            variant: "destructive",
          });
        },
      },
    );
  };

  const handleApproveLeave = (id: number) =>
    approveLeave.mutate(
      { id },
      {
        onSuccess: () => {
          toast({ title: "Leave approved" });
          invalidateAll();
        },
        onError: (err: unknown) =>
          toast({
            title: "Failed",
            description: (err as { message?: string })?.message,
            variant: "destructive",
          }),
      },
    );
  const handleDeclineLeave = (id: number) =>
    declineLeave.mutate(
      { id },
      {
        onSuccess: () => {
          toast({ title: "Leave declined" });
          invalidateAll();
        },
        onError: (err: unknown) =>
          toast({
            title: "Failed",
            description: (err as { message?: string })?.message,
            variant: "destructive",
          }),
      },
    );

  const handleConfirmRemove = () => {
    if (!removeTarget) return;
    const name = removeTarget.name;
    removeMember.mutate(
      { id: team.id, userId: removeTarget.userId },
      {
        onSuccess: (res) => {
          // Removal auto-approves unless the team has verified revenue (then it
          // is gated). The server signals which via `status`.
          const r = res as { status?: string; message?: string } | undefined;
          const applied = r?.status === "applied";
          toast({
            title: applied ? "Member removed" : "Awaiting admin approval",
            description:
              r?.message ??
              (applied
                ? `${name} has been removed from the team.`
                : `Removal of ${name} has been sent for admin approval.`),
          });
          setRemoveTarget(null);
          invalidateAll();
        },
        onError: (err: unknown) => {
          const e = err as { data?: { error?: string }; message?: string };
          toast({
            title: "Could not remove member",
            description: e?.data?.error ?? e?.message ?? "Try again.",
            variant: "destructive",
          });
        },
      },
    );
  };

  const handleDeleteTeam = () => {
    deleteTeam.mutate(
      { id: team.id },
      {
        onSuccess: () => {
          toast({
            title: "Team deleted",
            description: `${team.name} and its drafts were removed.`,
          });
          setDeleteTeamOpen(false);
          invalidateMembershipQueries(queryClient, { teamId: team.id });
          setLocation("/get-started");
        },
        onError: (err: unknown) => {
          const e = err as {
            status?: number;
            data?: { error?: string };
            message?: string;
          };
          const desc =
            e?.status === 409
              ? e?.data?.error ||
                "Team has submitted or verified entries — clear them first."
              : e?.data?.error || e?.message || "Try again.";
          toast({
            title: "Could not delete team",
            description: desc,
            variant: "destructive",
          });
        },
      },
    );
  };

  const handleConfirmTransfer = () => {
    if (!transferTarget) return;
    const name = transferTarget.name;
    transferLeadership.mutate(
      { id: team.id, data: { newLeaderId: transferTarget.userId } },
      {
        onSuccess: () => {
          toast({
            title: "Leadership transferred",
            description: `${name} is now the team leader.`,
          });
          setTransferTarget(null);
          invalidateAll();
        },
        onError: (err: unknown) =>
          toast({
            title: "Could not transfer leadership",
            description: (err as { message?: string })?.message ?? "Try again.",
            variant: "destructive",
          }),
      },
    );
  };

  // ---- Derived workspace data (all from already-loaded `team` + milestones) ----
  const projects = team.projects ?? [];
  const activeProjects = projects.filter((p) => p.status === "active");
  const milestoneCount = milestones?.length ?? 0;
  const clientsEngaged = projects.reduce(
    (sum, p) => sum + (p.clientCount ?? 0),
    0,
  );
  const demoThreshold = programmeConfig?.demoEligibilityThreshold ?? 200000;
  const progressPct =
    demoThreshold > 0
      ? Math.min(100, Math.round((team.totalRevenue / demoThreshold) * 100))
      : 0;
  const seatsOpen = Math.max(0, teamMemberLimit - memberCount);

  // Unified activity feed — team registration + project creation + milestones,
  // newest first. Pure presentation derived from existing data (no new fetches).
  type FeedEvent = {
    id: string;
    kind: "team" | "project" | "milestone";
    date: string;
    title: string;
    desc?: string | null;
  };
  const feed: FeedEvent[] = [
    {
      id: "team-created",
      kind: "team",
      date: team.createdAt,
      title: "Team registered",
      desc: `${team.name} is active at ${team.campusName}.`,
    },
    ...projects.map((p) => ({
      id: `project-${p.id}`,
      kind: "project" as const,
      date: p.createdAt,
      title: "Project created",
      desc: p.title,
    })),
    ...(milestones ?? []).map((m) => ({
      id: `milestone-${m.id}`,
      kind: "milestone" as const,
      date: m.date,
      title: m.title,
      desc: m.description,
    })),
  ]
    .filter((e) => !!e.date)
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  const feedShown = feed.slice(0, 8);
  const feedHidden = feed.length - feedShown.length;

  const feedIcon = (kind: FeedEvent["kind"]) => {
    if (kind === "team") return Rocket;
    if (kind === "project") return FolderKanban;
    return Flag;
  };

  const scrollToDirectory = () => {
    document
      .getElementById("team-directory")
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <div className="mx-auto max-w-7xl space-y-5 pb-12">
      <PendingMembershipBanner />

      {/* ============================================================= */}
      {/* SECTION 1 — TEAM COMMAND CENTER                               */}
      {/* ============================================================= */}
      <Panel className="px-4 py-4 sm:px-6 sm:py-5">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          {/* Identity */}
          <div className="flex min-w-0 items-center gap-4">
            {team.photoUrl ? (
              <img
                src={team.photoUrl}
                alt={team.name}
                className="h-14 w-14 shrink-0 rounded-xl object-cover ring-1 ring-border"
              />
            ) : (
              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-xl font-bold text-primary ring-1 ring-primary/15">
                {team.name.substring(0, 2).toUpperCase()}
              </div>
            )}
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h1 className="min-w-0 truncate text-2xl font-semibold tracking-tight text-foreground">
                  <InlineEditField
                    value={team.name}
                    editable={isLeader}
                    required
                    maxLength={80}
                    ariaLabel="Team name"
                    testId="text-team-name"
                    className="text-2xl font-semibold tracking-tight"
                    onSave={(next) => saveTeamField("name", next)}
                  />
                </h1>
              </div>
              {(isLeader || team.tagline) && (
                <div className="mt-0.5 text-sm text-muted-foreground">
                  <InlineEditField
                    value={team.tagline ?? ""}
                    editable={isLeader}
                    placeholder="Add a tagline…"
                    maxLength={120}
                    ariaLabel="Team tagline"
                    testId="text-team-tagline"
                    className="text-sm text-muted-foreground"
                    onSave={(next) => saveTeamField("tagline", next)}
                  />
                </div>
              )}
              <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1.5">
                <Badge
                  variant={team.status === "active" ? "default" : "outline"}
                  className="gap-1 capitalize"
                >
                  <ShieldCheck className="h-3 w-3" /> {team.status}
                </Badge>
                <Badge variant="secondary" className="gap-1">
                  {team.campusName}
                </Badge>
                {isLeader ? (
                  <Badge className="gap-1 border border-amber-500/30 bg-amber-500/15 text-amber-700 hover:bg-amber-500/15">
                    <Crown className="h-3 w-3" /> Leader
                  </Badge>
                ) : (
                  <Badge
                    variant="outline"
                    className="text-muted-foreground"
                    data-testid="badge-team-member"
                  >
                    Member
                  </Badge>
                )}
                <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                  <CalendarDays className="h-3 w-3" />
                  Since {team.createdAt ? formatDate(team.createdAt) : "—"}
                </span>
              </div>
            </div>
          </div>

          {/* Presence + primary action */}
          <div className="flex items-center justify-between gap-4 lg:justify-end">
            <div className="flex items-center gap-3">
              <div className="flex -space-x-2">
                {team.members.slice(0, 6).map((m) => {
                  const nm = `${m.firstName} ${m.lastName}`.trim() || m.email;
                  return (
                    <span key={m.userId} title={nm}>
                      <Avatar className="h-9 w-9 ring-2 ring-background">
                        <AvatarImage src={m.profileImage ?? undefined} />
                        <AvatarFallback className="text-xs">
                          {memberInitials(m.firstName, m.lastName, m.email)}
                        </AvatarFallback>
                      </Avatar>
                    </span>
                  );
                })}
                {team.members.length > 6 && (
                  <div className="flex h-9 w-9 items-center justify-center rounded-full bg-muted text-xs font-medium ring-2 ring-background">
                    +{team.members.length - 6}
                  </div>
                )}
              </div>
              <div className="text-xs text-muted-foreground">
                <div className="font-medium text-foreground">
                  {memberCount}/{teamMemberLimit}
                </div>
                <div>members</div>
              </div>
            </div>

            {isTeamFull ? (
              <div
                className="inline-flex items-center gap-1.5 rounded-lg border bg-muted/40 px-3 py-2 text-sm text-muted-foreground"
                data-testid="text-team-full"
              >
                <Users className="h-3.5 w-3.5" />
                Team is full ({memberCount}/{teamMemberLimit})
              </div>
            ) : (
              <Button
                onClick={() => setInviteOpen(true)}
                data-testid="button-hero-invite"
                className="gap-2"
              >
                <UserPlus className="h-4 w-4" /> Invite member
              </Button>
            )}
          </div>
        </div>
      </Panel>

      {/* ============================================================= */}
      {/* SECTION 2 — TEAM HEALTH OVERVIEW                              */}
      {/* ============================================================= */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <MetricBlock
          label="Members"
          value={`${memberCount}/${teamMemberLimit}`}
          sub={
            isTeamFull
              ? "Team full"
              : `${seatsOpen} seat${seatsOpen === 1 ? "" : "s"} open`
          }
        />
        <MetricBlock
          label="Active projects"
          value={activeProjects.length}
          sub={`${projects.length} total`}
        />
        <MetricBlock label="Milestones" value={milestoneCount} sub="achieved" />
        <MetricBlock
          label="Team age"
          value={teamAgeLabel(team.createdAt)}
          sub={
            team.createdAt ? `since ${formatDate(team.createdAt)}` : undefined
          }
        />
        <MetricBlock label="Demo Day progress">
          <div className="mt-1.5 flex items-center gap-2">
            <span className="text-xl font-semibold tracking-tight text-foreground">
              {progressPct}%
            </span>
          </div>
          <Progress value={progressPct} className="mt-2 h-1.5" />
          <div className="mt-1 truncate text-xs text-muted-foreground">
            {formatINR(team.totalRevenue)} / {formatINR(demoThreshold)}
          </div>
        </MetricBlock>
      </div>

      {/* ============================================================= */}
      {/* ACTION REQUIRED — membership inbox (only when needed)         */}
      {/* ============================================================= */}
      {totalRequests > 0 && (
        <Panel data-testid="panel-action-required">
          <SectionHeading
            icon={Inbox}
            title="Action required"
            count={totalRequests}
            caption="Membership requests waiting on your team"
          />
          <div className="space-y-5 p-4 sm:p-5">
            {pendingInvitations.length > 0 && (
              <div data-testid="card-sent-invitations">
                <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  <Mail className="h-3.5 w-3.5" /> Invitations sent (
                  {pendingInvitations.length})
                </div>
                <div className="space-y-2">
                  {pendingInvitations.map((inv) => (
                    <div
                      key={inv.id}
                      className="flex items-center justify-between gap-3 rounded-lg border bg-background p-3 transition-colors hover:border-primary/30"
                      data-testid={`sent-invite-${inv.id}`}
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">
                          {inv.inviteeName}
                        </p>
                        <p className="truncate text-xs text-muted-foreground">
                          {inv.inviteeNiatId ?? inv.inviteeEmail} • Invited by{" "}
                          {inv.inviterName}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <Badge variant="outline">Pending</Badge>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() =>
                            setCancelInviteTarget({
                              id: inv.id,
                              inviteeName: inv.inviteeName,
                            })
                          }
                          disabled={
                            cancelInvite.isPending &&
                            cancelInvite.variables?.id === inv.id
                          }
                          data-testid={`button-cancel-invite-${inv.id}`}
                        >
                          Cancel invitation
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {pendingJoins.length > 0 && (
              <div data-testid="card-join-requests">
                <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  <UserPlus className="h-3.5 w-3.5" /> Join requests (
                  {pendingJoins.length})
                </div>
                <div className="space-y-2">
                  {pendingJoins.map((jr) => (
                    <div
                      key={jr.id}
                      className="flex items-start gap-3 rounded-lg border bg-background p-3 transition-colors hover:border-emerald-500/30"
                      data-testid={`join-request-${jr.id}`}
                    >
                      <Avatar>
                        <AvatarImage
                          src={jr.requesterProfileImage ?? undefined}
                        />
                        <AvatarFallback>
                          {nameInitials(jr.requesterName, jr.requesterEmail)}
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium">
                          {jr.requesterName}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {jr.requesterNiatId ?? jr.requesterEmail}
                        </p>
                        {jr.message && (
                          <p className="mt-2 text-sm italic">"{jr.message}"</p>
                        )}
                      </div>
                      <div className="flex shrink-0 gap-2">
                        <Button
                          size="sm"
                          className="bg-green-600 text-white hover:bg-green-700"
                          onClick={() => handleApproveJoin(jr.id)}
                          disabled={approveJoin.isPending}
                          data-testid={`button-approve-join-${jr.id}`}
                        >
                          <Check className="h-4 w-4" />
                        </Button>
                        <Button
                          size="sm"
                          className="bg-red-400 text-white hover:bg-red-500"
                          onClick={() => handleDeclineJoin(jr.id)}
                          disabled={declineJoin.isPending}
                          data-testid={`button-decline-join-${jr.id}`}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {isLeader && pendingLeaves.length > 0 && (
              <div data-testid="card-leave-requests">
                <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  <LogOut className="h-3.5 w-3.5" /> Leave requests (
                  {pendingLeaves.length})
                </div>
                <div className="space-y-2">
                  {pendingLeaves.map((lr) => (
                    <div
                      key={lr.id}
                      className="flex items-start gap-3 rounded-lg border bg-background p-3 transition-colors hover:border-orange-500/30"
                      data-testid={`leave-request-${lr.id}`}
                    >
                      <Avatar>
                        <AvatarImage
                          src={lr.requesterProfileImage ?? undefined}
                        />
                        <AvatarFallback>
                          {nameInitials(lr.requesterName, lr.requesterEmail)}
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium">
                          {lr.requesterName}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          wants to leave the team
                        </p>
                        {lr.reason && (
                          <p className="mt-2 text-sm italic">"{lr.reason}"</p>
                        )}
                      </div>
                      <div className="flex shrink-0 gap-2">
                        <Button
                          size="sm"
                          className="bg-green-600 text-white hover:bg-green-700"
                          onClick={() => handleApproveLeave(lr.id)}
                          disabled={approveLeave.isPending}
                          data-testid={`button-approve-leave-${lr.id}`}
                        >
                          <Check className="h-4 w-4" />
                        </Button>
                        <Button
                          size="sm"
                          className="bg-red-400 text-white hover:bg-red-500"
                          onClick={() => handleDeclineLeave(lr.id)}
                          disabled={declineLeave.isPending}
                          data-testid={`button-decline-leave-${lr.id}`}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </Panel>
      )}

      {/* ============================================================= */}
      {/* SECTION 3 — MAIN COLLABORATION WORKSPACE (70 / 30)            */}
      {/* ============================================================= */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-10">
        {/* LEFT — Team Activity Hub */}
        <div className="space-y-5 lg:col-span-7">
          {/* Team Timeline (activity feed) */}
          <Panel>
            <SectionHeading
              icon={Activity}
              title="Team activity"
              caption="Recent updates across your workspace"
            />
            <div className="p-4 sm:p-5">
              {feedShown.length === 0 ? (
                <div className="rounded-lg border border-dashed py-10 text-center text-sm text-muted-foreground">
                  No activity yet.
                </div>
              ) : (
                <ol className="relative space-y-4 pl-1">
                  {feedShown.map((e, idx) => {
                    const Icon = feedIcon(e.kind);
                    const last = idx === feedShown.length - 1;
                    return (
                      <li key={e.id} className="relative flex gap-3">
                        <div className="flex flex-col items-center">
                          <span className="flex h-7 w-7 items-center justify-center rounded-full border bg-background text-muted-foreground">
                            <Icon className="h-3.5 w-3.5" />
                          </span>
                          {!last && (
                            <span className="mt-1 w-px flex-1 bg-border" />
                          )}
                        </div>
                        <div className="min-w-0 pb-1">
                          <div className="flex flex-wrap items-baseline gap-x-2">
                            <p className="text-sm font-medium text-foreground">
                              {e.title}
                            </p>
                            <span className="text-xs text-muted-foreground">
                              {formatDate(e.date)}
                            </span>
                          </div>
                          {e.desc && (
                            <p className="truncate text-sm text-muted-foreground">
                              {e.desc}
                            </p>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ol>
              )}
              {feedHidden > 0 && (
                <p className="mt-3 text-xs text-muted-foreground">
                  + {feedHidden} earlier event{feedHidden === 1 ? "" : "s"}
                </p>
              )}
            </div>
          </Panel>

          {/* Milestone Journey (vertical roadmap) */}
          <Panel>
            <SectionHeading
              icon={Flag}
              title="Milestone journey"
              count={milestoneCount}
              caption="Track your team's progress"
            />
            <div className="p-4 sm:p-5">
              {milestonesLoading ? (
                <div className="flex justify-center py-8">
                  <Spinner />
                </div>
              ) : !milestones || milestones.length === 0 ? (
                <div className="rounded-lg border border-dashed py-12 text-center text-muted-foreground">
                  <Flag className="mx-auto mb-3 h-8 w-8 opacity-50" />
                  <p className="text-sm">No milestones yet.</p>
                </div>
              ) : (
                <ol className="relative space-y-5">
                  {milestones.map((m, idx) => {
                    const last = idx === milestones.length - 1;
                    return (
                      <li key={m.id} className="relative flex gap-4">
                        <div className="flex flex-col items-center">
                          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-primary-foreground">
                            <CheckCircle2 className="h-4 w-4" />
                          </span>
                          {!last && (
                            <span className="mt-1 w-px flex-1 bg-primary/30" />
                          )}
                        </div>
                        <div className="min-w-0 flex-1 pb-1">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <h4 className="text-sm font-semibold text-foreground">
                              {m.title}
                            </h4>
                            <span className="inline-flex items-center text-xs text-muted-foreground">
                              <CalendarDays className="mr-1 h-3 w-3" />
                              {formatDate(m.date)}
                            </span>
                          </div>
                          {m.description && (
                            <p className="mt-0.5 whitespace-pre-wrap text-sm text-muted-foreground">
                              {m.description}
                            </p>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ol>
              )}
            </div>
          </Panel>
        </div>

        {/* RIGHT — Team Control Panel */}
        <div className="space-y-5 lg:col-span-3">
          {/* Invite Workspace */}
          <Panel>
            <SectionHeading icon={KeyRound} title="Invite workspace" />
            <div className="space-y-3 p-4 sm:p-5">
              <div className="rounded-lg border-2 border-dashed bg-muted/30 px-3 py-3 text-center">
                <p
                  className="break-all font-mono text-lg font-bold uppercase tracking-[0.2em] text-primary"
                  data-testid="input-invite-code"
                >
                  {team.inviteCode}
                </p>
              </div>
              <Button
                onClick={copyInviteCode}
                variant="outline"
                className="w-full gap-2"
                data-testid="button-copy-code"
              >
                <Copy className="h-4 w-4" /> Copy code
              </Button>
              <p className="text-xs leading-relaxed text-muted-foreground">
                Share this code with classmates at {team.campusName} so they can
                request to join your team.
              </p>
            </div>
          </Panel>

          {/* Quick Actions */}
          <Panel>
            <SectionHeading icon={Target} title="Quick actions" />
            <div className="space-y-1.5 p-3 sm:p-4">
              {isTeamFull ? (
                <div className="flex items-center gap-2 rounded-lg border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
                  <Users className="h-4 w-4" /> Team is full ({memberCount}/
                  {teamMemberLimit})
                </div>
              ) : (
                <Button
                  variant="outline"
                  className="w-full justify-between"
                  onClick={() => setInviteOpen(true)}
                  data-testid="button-open-invite"
                >
                  <span className="flex items-center gap-2">
                    <UserPlus className="h-4 w-4 text-primary" /> Invite members
                  </span>
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                </Button>
              )}
              <button
                type="button"
                onClick={scrollToDirectory}
                className="flex w-full items-center justify-between rounded-md border px-3 py-2 text-sm font-medium transition-colors hover:bg-muted/50"
              >
                <span className="flex items-center gap-2">
                  <Users className="h-4 w-4 text-muted-foreground" /> Manage
                  team
                </span>
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              </button>
              <Link
                href="/projects"
                className="flex w-full items-center justify-between rounded-md border px-3 py-2 text-sm font-medium transition-colors hover:bg-muted/50"
              >
                <span className="flex items-center gap-2">
                  <FolderKanban className="h-4 w-4 text-muted-foreground" />{" "}
                  View projects
                </span>
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              </Link>
              <Link
                href="/leaderboard"
                className="flex w-full items-center justify-between rounded-md border px-3 py-2 text-sm font-medium transition-colors hover:bg-muted/50"
              >
                <span className="flex items-center gap-2">
                  <Trophy className="h-4 w-4 text-muted-foreground" />{" "}
                  Leaderboard
                </span>
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              </Link>
              <Link
                href="/resources-library"
                className="flex w-full items-center justify-between rounded-md border px-3 py-2 text-sm font-medium transition-colors hover:bg-muted/50"
              >
                <span className="flex items-center gap-2">
                  <BookOpen className="h-4 w-4 text-muted-foreground" /> Team
                  resources
                </span>
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              </Link>
            </div>
          </Panel>

          {/* Team Insights */}
          <Panel>
            <SectionHeading icon={TrendingUp} title="Team insights" />
            <div className="space-y-4 p-4 sm:p-5">
              <div>
                <div className="mb-1.5 flex items-center justify-between text-xs">
                  <span className="font-medium text-muted-foreground">
                    Demo Day eligibility
                  </span>
                  <span className="font-semibold text-foreground">
                    {progressPct}%
                  </span>
                </div>
                <Progress value={progressPct} className="h-2" />
                <p className="mt-1 text-xs text-muted-foreground">
                  {formatINR(team.totalRevenue)} of {formatINR(demoThreshold)}{" "}
                  verified revenue
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-lg border bg-background px-3 py-2">
                  <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
                    National rank
                  </div>
                  <div className="mt-0.5 text-base font-semibold text-foreground">
                    {team.nationalRank != null ? `#${team.nationalRank}` : "—"}
                  </div>
                </div>
                <div className="rounded-lg border bg-background px-3 py-2">
                  <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
                    Clients
                  </div>
                  <div className="mt-0.5 text-base font-semibold text-foreground">
                    {clientsEngaged}
                  </div>
                </div>
              </div>

              {/* Upcoming actions — subtle, derived nudges */}
              <div>
                <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Upcoming actions
                </div>
                <ul className="space-y-1.5 text-sm">
                  {!isTeamFull && (
                    <li className="flex items-center gap-2 text-muted-foreground">
                      <span className="h-1.5 w-1.5 rounded-full bg-primary" />
                      Invite {seatsOpen} more member{seatsOpen === 1 ? "" : "s"}
                    </li>
                  )}
                  {projects.length === 0 && (
                    <li className="flex items-center gap-2 text-muted-foreground">
                      <span className="h-1.5 w-1.5 rounded-full bg-primary" />
                      Create your first project
                    </li>
                  )}
                  {team.totalRevenue < demoThreshold && (
                    <li className="flex items-center gap-2 text-muted-foreground">
                      <span className="h-1.5 w-1.5 rounded-full bg-primary" />
                      {formatINR(demoThreshold - team.totalRevenue)} more to
                      reach Demo Day
                    </li>
                  )}
                  {milestoneCount === 0 && (
                    <li className="flex items-center gap-2 text-muted-foreground">
                      <span className="h-1.5 w-1.5 rounded-full bg-primary" />
                      Earn your first milestone
                    </li>
                  )}
                  {isTeamFull &&
                    projects.length > 0 &&
                    team.totalRevenue >= demoThreshold &&
                    milestoneCount > 0 && (
                      <li className="flex items-center gap-2 text-emerald-600">
                        <CheckCircle2 className="h-4 w-4" />
                        Your team is on track — keep it up!
                      </li>
                    )}
                </ul>
              </div>

              {/* Membership controls — leave / delete preserved here */}
              <div className="border-t pt-3">
                {!isLeader && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full gap-2"
                    data-testid="button-open-leave"
                    onClick={() => setLeaveOpen(true)}
                  >
                    <LogOut className="h-4 w-4" /> Leave team
                  </Button>
                )}
                {isLeader && (
                  <div className="space-y-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="w-full gap-2 text-destructive hover:bg-destructive/10 hover:text-destructive"
                      onClick={() => setDeleteTeamOpen(true)}
                      data-testid="button-open-delete-team"
                    >
                      <Trash2 className="h-4 w-4" /> Delete team
                    </Button>
                    <p className="text-[11px] leading-relaxed text-muted-foreground">
                      Deletes all members, drafts and the invite code. Only
                      possible with no submitted or verified entries.
                    </p>
                  </div>
                )}
              </div>
            </div>
          </Panel>
        </div>
      </div>

      {/* ============================================================= */}
      {/* SECTION 4 — TEAM DIRECTORY                                    */}
      {/* ============================================================= */}
      <Panel id="team-directory">
        <SectionHeading
          icon={Users}
          title="Team directory"
          count={team.members.length}
          right={
            !isTeamFull ? (
              <Button
                variant="ghost"
                size="sm"
                className="h-8 gap-1.5"
                onClick={() => setInviteOpen(true)}
              >
                <UserPlus className="h-4 w-4" /> Invite
              </Button>
            ) : undefined
          }
        />
        <div className="overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Member</TableHead>
                <TableHead className="hidden sm:table-cell">
                  Student ID
                </TableHead>
                <TableHead>Role</TableHead>
                <TableHead className="hidden md:table-cell">Status</TableHead>
                <TableHead className="w-10 text-right" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {team.members.map((member) => {
                const memberName =
                  `${member.firstName} ${member.lastName}`.trim() ||
                  member.email;
                const showLeaderMenu = isLeader && !member.isLeader;
                return (
                  <TableRow
                    key={member.userId}
                    data-testid={`member-${member.userId}`}
                  >
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <Avatar className="h-8 w-8">
                          <AvatarImage src={member.profileImage || undefined} />
                          <AvatarFallback className="text-xs">
                            {memberInitials(
                              member.firstName,
                              member.lastName,
                              member.email,
                            )}
                          </AvatarFallback>
                        </Avatar>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-foreground">
                            {memberName}
                          </p>
                          <p className="truncate text-xs text-muted-foreground sm:hidden">
                            {member.niatId ?? member.email}
                          </p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="hidden font-mono text-xs text-muted-foreground sm:table-cell">
                      {member.niatId ?? member.email}
                    </TableCell>
                    <TableCell>
                      {member.isLeader ? (
                        <Badge className="h-5 gap-1 border border-amber-500/30 bg-amber-500/15 px-1.5 text-[10px] text-amber-700 hover:bg-amber-500/15">
                          <Crown className="h-3 w-3" /> Leader
                        </Badge>
                      ) : (
                        <span className="text-sm text-muted-foreground">
                          Member
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                        Active
                      </span>
                    </TableCell>
                    <TableCell className="text-right">
                      {showLeaderMenu && (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              data-testid={`button-member-menu-${member.userId}`}
                              aria-label={`Manage ${memberName}`}
                            >
                              <MoreVertical className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem
                              onSelect={() =>
                                setTransferTarget({
                                  userId: member.userId,
                                  name: memberName,
                                })
                              }
                              data-testid={`menu-make-leader-${member.userId}`}
                            >
                              <Crown className="mr-2 h-4 w-4" /> Make leader
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onSelect={() =>
                                setRemoveTarget({
                                  userId: member.userId,
                                  name: memberName,
                                })
                              }
                              className="text-destructive focus:text-destructive"
                              data-testid={`menu-remove-${member.userId}`}
                            >
                              <UserMinus className="mr-2 h-4 w-4" /> Remove from
                              team
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </Panel>

      {/* ============================================================= */}
      {/* SECTION 5 — TEAM EXECUTION AREA                               */}
      {/* ============================================================= */}
      <Panel>
        <SectionHeading
          icon={FolderKanban}
          title="Projects & execution"
          count={projects.length}
          caption="Active work and verified deliverables"
          right={
            <Link href="/projects">
              <Button variant="ghost" size="sm" className="h-8 gap-1.5">
                Open projects <ChevronRight className="h-4 w-4" />
              </Button>
            </Link>
          }
        />
        <div className="overflow-hidden">
          {projects.length === 0 ? (
            <div className="px-5 py-12 text-center">
              <FolderKanban className="mx-auto mb-3 h-8 w-8 text-muted-foreground opacity-50" />
              <p className="text-sm text-muted-foreground">No projects yet.</p>
              <Link href="/projects">
                <Button variant="outline" size="sm" className="mt-3 gap-2">
                  <FolderKanban className="h-4 w-4" /> Go to projects
                </Button>
              </Link>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>Project</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="hidden sm:table-cell text-right">
                    Clients
                  </TableHead>
                  <TableHead className="hidden md:table-cell text-right">
                    Order book
                  </TableHead>
                  <TableHead className="text-right">Revenue</TableHead>
                  <TableHead className="hidden lg:table-cell text-right">
                    Created
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {projects.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell>
                      <Link
                        href={`/projects/${p.id}`}
                        className="block min-w-0"
                      >
                        <p className="truncate text-sm font-medium text-foreground hover:text-primary hover:underline">
                          {p.title}
                        </p>
                        {p.description && (
                          <p className="truncate text-xs text-muted-foreground">
                            {p.description}
                          </p>
                        )}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={p.status === "active" ? "default" : "outline"}
                        className="capitalize"
                      >
                        {p.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="hidden sm:table-cell text-right text-sm text-muted-foreground">
                      {p.clientCount}
                    </TableCell>
                    <TableCell className="hidden md:table-cell text-right text-sm text-muted-foreground">
                      {formatINR(p.verifiedOrderBook)}
                    </TableCell>
                    <TableCell className="text-right text-sm font-medium text-foreground">
                      {formatINR(p.verifiedRevenue)}
                    </TableCell>
                    <TableCell className="hidden lg:table-cell text-right text-xs text-muted-foreground">
                      {formatDate(p.createdAt)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
      </Panel>

      {/* ============================================================= */}
      {/* SECTION 6 — TEAM INSIGHTS (achievements & growth)            */}
      {/* ============================================================= */}
      <Panel>
        <SectionHeading
          icon={Trophy}
          title="Achievements & growth"
          caption="Your team's progress at a glance"
        />
        <div className="grid grid-cols-2 gap-px overflow-hidden rounded-b-xl bg-border sm:grid-cols-3 lg:grid-cols-6">
          {[
            { label: "Milestones earned", value: String(milestoneCount) },
            { label: "Active projects", value: String(activeProjects.length) },
            { label: "Clients engaged", value: String(clientsEngaged) },
            {
              label: "Verified revenue",
              value: formatINR(team.totalRevenue),
            },
            {
              label: "Order book",
              value: formatINR(team.totalOrderBook),
            },
            {
              label: "National rank",
              value: team.nationalRank != null ? `#${team.nationalRank}` : "—",
            },
          ].map((s) => (
            <div key={s.label} className="bg-card px-4 py-4">
              <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                {s.label}
              </div>
              <div className="mt-1 truncate text-lg font-semibold tracking-tight text-foreground">
                {s.value}
              </div>
            </div>
          ))}
        </div>
      </Panel>

      <Link href="/browse-teams" className="hidden">
        browse
      </Link>

      {/* ============================================================= */}
      {/* INVITE DIALOG (controlled — triggered from multiple buttons)  */}
      {/* ============================================================= */}
      <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Invite a teammate</DialogTitle>
            <DialogDescription>
              Search students at {team.campusName} who aren't on a team yet.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Input
              placeholder="Search by name, email, NIAT ID or student ID…"
              value={searchQ}
              onChange={(e) => setSearchQ(e.target.value)}
              data-testid="input-search-students"
              autoFocus
            />
            <div className="max-h-72 space-y-1 overflow-y-auto">
              {searchQ.trim().length < 2 ? (
                <p className="p-2 text-sm text-muted-foreground">
                  Type at least 2 characters to search.
                </p>
              ) : students.length === 0 ? (
                <p className="p-2 text-sm text-muted-foreground">
                  No matching students.
                </p>
              ) : (
                students.map((s) => {
                  const alreadyInvited =
                    !!s.id &&
                    pendingInvitations.some((i) => i.inviteeId === s.id);
                  const rowKey = s.id ?? `roster-${s.rosterId}`;
                  return (
                    <div
                      key={rowKey}
                      className="flex items-center gap-3 rounded-lg p-2 hover:bg-muted/50"
                      data-testid={`student-${rowKey}`}
                    >
                      <Avatar className="h-8 w-8">
                        <AvatarImage src={s.profileImage ?? undefined} />
                        <AvatarFallback>
                          {memberInitials(s.firstName, s.lastName, s.email)}
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">
                          {s.firstName} {s.lastName}
                        </p>
                        <p className="truncate text-xs text-muted-foreground">
                          {s.niatId ?? s.email}
                        </p>
                      </div>
                      {alreadyInvited ? (
                        <Badge variant="secondary" className="text-[10px]">
                          Invited
                        </Badge>
                      ) : (
                        <Button
                          size="sm"
                          onClick={() =>
                            handleInvite(
                              { inviteeId: s.id, rosterId: s.rosterId },
                              `${s.firstName} ${s.lastName}`,
                            )
                          }
                          disabled={sendInvite.isPending}
                          data-testid={`button-invite-${rowKey}`}
                        >
                          Invite
                        </Button>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* DIALOGS */}
      <AlertDialog
        open={cancelInviteTarget !== null}
        onOpenChange={(open) => {
          if (!open && !cancelInvite.isPending) setCancelInviteTarget(null);
        }}
      >
        <AlertDialogContent data-testid="dialog-confirm-cancel-invite">
          <AlertDialogHeader>
            <AlertDialogTitle>
              Cancel invitation to {cancelInviteTarget?.inviteeName}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              They won't be able to accept this invite anymore. They will not be
              notified that it was cancelled. You can always send a new invite
              later.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              data-testid="button-dismiss-cancel-invite"
              disabled={cancelInvite.isPending}
            >
              Keep invite
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                if (!cancelInviteTarget) return;
                const target = cancelInviteTarget;
                cancelInvite.mutate(
                  { id: target.id },
                  {
                    onSuccess: () => {
                      invalidateAll();
                      setCancelInviteTarget(null);
                      toast({
                        title: "Invitation cancelled",
                        description: `Invite to ${target.inviteeName} has been withdrawn.`,
                      });
                    },
                    onError: (err: unknown) => {
                      const message =
                        err instanceof Error
                          ? err.message
                          : "Could not cancel the invitation. Try again.";
                      toast({
                        title: "Couldn't cancel invitation",
                        description: message,
                        variant: "destructive",
                      });
                    },
                  },
                );
              }}
              disabled={cancelInvite.isPending}
              data-testid="button-confirm-cancel-invite"
            >
              {cancelInvite.isPending && <Spinner className="w-4 h-4 mr-2" />}
              Cancel invitation
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={leaveOpen}
        onOpenChange={(open) => {
          if (!open && !requestLeave.isPending) setLeaveOpen(false);
        }}
      >
        <AlertDialogContent data-testid="dialog-confirm-leave-team">
          <AlertDialogHeader>
            <AlertDialogTitle>
              Are you sure you want to leave team {team.name}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              You'll lose access to this team immediately. You can join another
              team or create your own afterwards.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              data-testid="button-cancel-leave-team"
              disabled={requestLeave.isPending}
            >
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                handleConfirmLeave();
              }}
              disabled={requestLeave.isPending}
              className="bg-destructive text-white hover:bg-destructive/90"
              data-testid="button-confirm-leave-team"
            >
              {requestLeave.isPending && <Spinner className="w-4 h-4 mr-2" />}
              Leave
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={removeTarget !== null}
        onOpenChange={(open) => {
          if (!open) setRemoveTarget(null);
        }}
      >
        <AlertDialogContent data-testid="dialog-confirm-remove-member">
          <AlertDialogHeader>
            <AlertDialogTitle>
              Remove {removeTarget?.name} from the team?
            </AlertDialogTitle>
            <AlertDialogDescription>
              They'll lose access to this team immediately and will be notified
              that they were removed. This can't be undone — they'd need a new
              invite to come back.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-remove-member">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                handleConfirmRemove();
              }}
              disabled={removeMember.isPending}
              data-testid="button-confirm-remove-member"
            >
              {removeMember.isPending && <Spinner className="w-4 h-4 mr-2" />}
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={transferTarget !== null}
        onOpenChange={(open) => {
          if (!open) setTransferTarget(null);
        }}
      >
        <AlertDialogContent data-testid="dialog-confirm-transfer-leader">
          <AlertDialogHeader>
            <AlertDialogTitle>
              Make {transferTarget?.name} the new team leader?
            </AlertDialogTitle>
            <AlertDialogDescription>
              {transferTarget?.name} will take over leadership immediately and
              gain leader-only controls. You'll become a regular member. Both of
              you will be notified.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-transfer-leader">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                handleConfirmTransfer();
              }}
              disabled={transferLeadership.isPending}
              data-testid="button-confirm-transfer-leader"
            >
              {transferLeadership.isPending && (
                <Spinner className="w-4 h-4 mr-2" />
              )}
              Transfer leadership
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={deleteTeamOpen} onOpenChange={setDeleteTeamOpen}>
        <AlertDialogContent data-testid="dialog-confirm-delete-team">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {team.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes the team, its invite code, all members,
              and any draft revenue or order book entries. This cannot be
              undone. If the team has any submitted or verified entries, the
              request will be blocked.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete-team">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                handleDeleteTeam();
              }}
              disabled={deleteTeam.isPending}
              className="bg-destructive text-white hover:bg-destructive/90"
              data-testid="button-confirm-delete-team"
            >
              {deleteTeam.isPending && <Spinner className="w-4 h-4 mr-2" />}
              Delete team
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
