import { useState, useEffect } from "react";
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
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { checkTeamNameAvailability } from "@/lib/team-name-uniqueness-api";
import { resolveStoredObjectUrl } from "@/lib/storage-url";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PendingMembershipBanner } from "@/components/pending-membership-banner";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Spinner } from "@/components/ui/spinner";
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
  Home,
  Settings,
  LayoutGrid,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
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
import { formatDate } from "@/lib/format";
import { InlineEditField } from "@/components/inline-edit-field";
import { invalidateMembershipQueries } from "@/lib/queries";
import { useToast } from "@/hooks/use-toast";

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

// Small label/value tile used in the stats strip below the hero. The pastel
// icon square on the left is what separates the four at a glance — the values
// are different shapes (a ratio, a count, a date, a word) and read poorly as a
// set on their own.
function StatTile({
  label,
  value,
  helper,
  icon: Icon,
  accent,
}: {
  label: string;
  value: number | string;
  helper: string;
  icon: React.ComponentType<{ className?: string }>;
  accent: string;
}) {
  return (
    <Card className="rounded-[18px] p-3.5 transition-[transform,box-shadow] duration-200 hover:-translate-y-0.5 hover:shadow-md sm:p-4">
      <div className="flex items-center gap-3">
        <div
          className={cn(
            "flex h-10 w-10 shrink-0 items-center justify-center rounded-[13px] sm:h-[52px] sm:w-[52px] sm:rounded-[15px]",
            accent,
          )}
        >
          <Icon className="h-[18px] w-[18px] sm:h-[22px] sm:w-[22px]" />
        </div>
        <div className="min-w-0">
          <p className="text-[11px] font-medium text-muted-foreground sm:text-xs">
            {label}
          </p>
          <p className="truncate text-lg font-bold leading-tight tracking-tight sm:text-2xl">
            {value}
          </p>
          <p className="truncate text-[11px] text-muted-foreground sm:text-xs">
            {helper}
          </p>
        </div>
      </div>
    </Card>
  );
}

// Consistent section-header chip so every card reads at the same altitude.
function SectionIcon({
  icon: Icon,
  className,
}: {
  icon: React.ComponentType<{ className?: string }>;
  className: string;
}) {
  return (
    <span
      className={`flex h-7 w-7 items-center justify-center rounded-lg ${className}`}
    >
      <Icon className="h-4 w-4" />
    </span>
  );
}

type TeamTabKey = "overview" | "members" | "milestones" | "settings";

const TEAM_TABS: ReadonlyArray<{
  key: TeamTabKey;
  label: string;
  short: string;
  icon: typeof Home;
}> = [
  { key: "overview", label: "Overview", short: "Overview", icon: LayoutGrid },
  { key: "members", label: "Team Members", short: "Members", icon: Users },
  {
    key: "milestones",
    label: "Milestone Timeline",
    short: "Milestones",
    icon: Flag,
  },
  { key: "settings", label: "Settings", short: "Settings", icon: Settings },
];

/**
 * The page's own navigation.
 *
 * Sticky on a phone — the tab row is how you move around this screen, and the
 * Team Members list is long enough that losing it off the top strands you. It
 * parks directly beneath the app header, whose height includes the status-bar
 * inset in the installed app, so the offset is computed rather than guessed.
 */
function TeamTabs({
  value,
  onChange,
  memberBadge,
}: {
  value: TeamTabKey;
  onChange: (next: TeamTabKey) => void;
  /** Outstanding join/leave/invite requests, surfaced on the Members tab. */
  memberBadge: number;
}) {
  return (
    <div
      className="sticky z-20 -mx-4 mt-4 mb-5 border-b bg-background px-4 sm:-mx-6 sm:px-6 lg:static lg:mx-0 lg:px-0"
      style={{ top: "calc(3.5rem + var(--safe-area-inset-top, 0px))" }}
    >
      <div
        role="tablist"
        aria-label="Team sections"
        className="flex gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {TEAM_TABS.map((t) => {
          const active = t.key === value;
          return (
            <button
              key={t.key}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => onChange(t.key)}
              data-testid={`tab-${t.key}`}
              className={cn(
                "flex shrink-0 items-center gap-1.5 rounded-t-lg border-b-[3px] px-3 py-2.5 text-xs font-medium transition-colors duration-200 sm:gap-2 sm:px-4 sm:py-3 sm:text-sm",
                active
                  ? "border-primary bg-primary/[0.07] text-primary"
                  : "border-transparent text-muted-foreground hover:bg-muted/60 hover:text-foreground",
              )}
            >
              <t.icon className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span className="sm:hidden">{t.short}</span>
              <span className="hidden sm:inline">{t.label}</span>
              {/* Requests used to sit on the page itself. Behind a tab they
                  would go unnoticed, so the count comes out to the tab. */}
              {t.key === "members" && memberBadge > 0 ? (
                <span className="ml-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold text-primary-foreground">
                  {memberBadge}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
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

  // Live team-name uniqueness hint while the leader edits the name. Debounced
  // so we don't hit the API on every keystroke.
  const [nameDraft, setNameDraft] = useState(team.name);
  const [debouncedName, setDebouncedName] = useState("");
  useEffect(() => {
    const h = window.setTimeout(() => setDebouncedName(nameDraft.trim()), 300);
    return () => window.clearTimeout(h);
  }, [nameDraft]);
  const normalize = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");
  const draftDiffersFromCurrent =
    normalize(debouncedName) !== normalize(team.name);
  const { data: nameAvail } = useQuery({
    queryKey: ["team-name-availability", debouncedName, team.id],
    queryFn: () => checkTeamNameAvailability(debouncedName, team.id),
    enabled: isLeader && debouncedName.length >= 2 && draftDiffersFromCurrent,
  });
  const nameTaken = isLeader && draftDiffersFromCurrent && !!nameAvail?.taken;

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

  const [tab, setTab] = useState<TeamTabKey>("overview");
  const [copied, setCopied] = useState(false);
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
      // The button says so itself for a moment; a toast on every copy is noise.
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
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

  return (
    <div className="mx-auto max-w-6xl pb-12">
      <PendingMembershipBanner />

      {/* ===================== PAGE HEADER ===================== */}
      <div className="relative">
        <nav
          aria-label="Breadcrumb"
          className="flex items-center gap-1.5 text-xs text-muted-foreground sm:text-sm"
        >
          <Link href="/" className="hover:text-foreground">
            <Home className="h-3.5 w-3.5" aria-hidden="true" />
            <span className="sr-only">Dashboard</span>
          </Link>
          <span aria-hidden="true">/</span>
          <span className="text-foreground">My Team</span>
        </nav>
        <h1 className="mt-2 text-2xl font-extrabold tracking-tight text-foreground sm:text-4xl lg:text-[2.85rem] lg:leading-tight">
          My Team
        </h1>
        <p className="mt-1 max-w-xl text-sm text-muted-foreground sm:text-[17px]">
          Together we learn, build and create real impact.
        </p>
        {/* The brand line is decorative and the first thing worth dropping
            when the screen is narrow. */}
        <p
          aria-hidden="true"
          className="pointer-events-none absolute right-0 top-1 hidden select-none text-right text-[19px] leading-snug text-primary/85 xl:block"
          style={{ fontFamily: "'Segoe Script', 'Bradley Hand', cursive", transform: "rotate(-4deg)" }}
        >
          Better Students
          <br />
          Brighter Tomorrow
          <span className="mt-0.5 block h-[3px] w-28 rounded-full bg-[#FFC525]" />
        </p>
      </div>

      {/* ===================== TABS ===================== */}
      <TeamTabs value={tab} onChange={setTab} memberBadge={totalRequests} />

      {/* ===================== TAB PANELS ===================== */}
      <div key={tab} className="team-tab-panel space-y-5">
        {tab === "overview" ? (
          <>
            {/* ===================== HERO ===================== */}
            <Card className="relative overflow-hidden rounded-[22px] border-[#EEE3DD] bg-gradient-to-br from-[#FFF5F2] via-[#FFF7F4] to-[#FFF0EA] shadow-sm">
              {/* A low sun and two ridges, the same language as the brand card
                  below. Decorative only, and the first thing to go on a phone
                  where the badges and the name need the width. */}
              <div
                aria-hidden="true"
                className="pointer-events-none absolute right-6 top-5 hidden h-16 w-16 rounded-full bg-[#FFD98A]/45 blur-[2px] md:block"
              />
              <svg
                aria-hidden="true"
                viewBox="0 0 260 170"
                preserveAspectRatio="none"
                className="pointer-events-none absolute bottom-0 right-0 hidden h-full w-[30%] opacity-60 md:block"
              >
                <path d="M20 170 L96 66 L150 170 Z" fill="#E9BFB2" opacity=".5" />
                <path d="M110 170 L186 54 L260 170 Z" fill="#D9A392" opacity=".45" />
                <path d="M186 54 L186 20" stroke="#B91E21" strokeWidth="3" />
                <path d="M186 20 L214 30 L186 40 Z" fill="#D82727" />
              </svg>
              <div className="relative p-4 sm:p-6 md:p-8">
                <div className="flex flex-col items-center gap-6 md:flex-row md:items-start">
                  <div className="shrink-0">
                    {team.photoUrl ? (
                      <img
                        src={resolveStoredObjectUrl(team.photoUrl)}
                        alt={team.name}
                        className="h-20 w-20 rounded-[20px] object-cover shadow-md ring-4 ring-white/90 sm:h-[118px] sm:w-[118px] sm:rounded-3xl"
                      />
                    ) : (
                      <div className="flex h-20 w-20 items-center justify-center rounded-[20px] bg-gradient-to-br from-[#F5C9C8] to-[#FBE3E2] text-3xl font-extrabold text-primary shadow-md ring-4 ring-white/90 sm:h-[118px] sm:w-[118px] sm:rounded-3xl sm:text-[44px]">
                        {team.name.substring(0, 2).toUpperCase()}
                      </div>
                    )}
                  </div>

                  <div className="min-w-0 flex-1 text-center md:text-left">
                    <div className="mb-2 flex flex-wrap items-center justify-center gap-2 md:justify-start">
                      <Badge
                        variant={team.status === "active" ? "default" : "outline"}
                        className="gap-1 capitalize"
                      >
                        <ShieldCheck className="h-3 w-3" /> {team.status}
                      </Badge>
                      <Badge className="border border-[#F0E2B8] bg-[#FDF6E3] text-[#7A6320] hover:bg-[#FDF6E3]">
                        {team.campusName}
                      </Badge>
                      {isLeader ? (
                        <Badge className="gap-1 border border-[#F6D6AC] bg-[#FFF0DD] text-[#B4700F] hover:bg-[#FFF0DD]">
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
                    </div>
                    <h2 className="text-2xl font-bold tracking-tight sm:text-3xl md:text-[36px]">
                      <InlineEditField
                        value={team.name}
                        editable={isLeader}
                        required
                        maxLength={80}
                        ariaLabel="Team name"
                        testId="text-team-name"
                        className="text-2xl font-bold tracking-tight sm:text-3xl md:text-[36px]"
                        onSave={(next) => saveTeamField("name", next)}
                        onDraftChange={setNameDraft}
                        helper={
                          nameTaken ? (
                            <span className="text-destructive">
                              Other teams are already using this name — please choose
                              a unique team name.
                            </span>
                          ) : null
                        }
                      />
                    </h2>
                    {isLeader || team.tagline ? (
                      <p className="mt-1 text-sm text-muted-foreground sm:mt-1.5 md:text-[18px]">
                        <InlineEditField
                          value={team.tagline ?? ""}
                          editable={isLeader}
                          placeholder="Add a tagline…"
                          maxLength={120}
                          ariaLabel="Team tagline"
                          testId="text-team-tagline"
                          className="text-sm text-muted-foreground md:text-[18px]"
                          onSave={(next) => saveTeamField("tagline", next)}
                        />
                      </p>
                    ) : null}
                  </div>

                  <div className="flex flex-col items-center gap-3 md:items-end">
                    <div className="flex -space-x-2">
                      {team.members.slice(0, 5).map((m) => (
                        <Avatar
                          key={m.userId}
                          className="h-9 w-9 ring-2 ring-background"
                        >
                          <AvatarImage src={m.profileImage ?? undefined} />
                          <AvatarFallback className="text-xs">
                            {memberInitials(m.firstName, m.lastName, m.email)}
                          </AvatarFallback>
                        </Avatar>
                      ))}
                      {team.members.length > 5 && (
                        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-muted text-xs font-medium ring-2 ring-background">
                          +{team.members.length - 5}
                        </div>
                      )}
                    </div>
                    {isTeamFull ? (
                      <div
                        className="flex items-center gap-1.5 rounded-full border bg-muted/40 px-3 py-1.5 text-sm text-muted-foreground"
                        data-testid="text-team-full"
                      >
                        <Users className="h-3.5 w-3.5" />
                        Team is full ({memberCount}/{teamMemberLimit})
                      </div>
                    ) : (
                      <Button
                        size="sm"
                        onClick={() => setInviteOpen(true)}
                        data-testid="button-hero-invite"
                        className="gap-2"
                      >
                        <UserPlus className="h-4 w-4" /> Invite member
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            </Card>

            {/* ===================== STAT TILES ===================== */}
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
              <StatTile
                label="Members"
                value={`${memberCount}/${teamMemberLimit}`}
                helper="Build your dream team"
                icon={Users}
                accent="bg-[#FDEBEA] text-primary"
              />
              <StatTile
                label="Milestones"
                value={milestones?.length ?? 0}
                helper="Milestones achieved"
                icon={Flag}
                accent="bg-[#EFE7FF] text-[#7B48F5]"
              />
              <StatTile
                label="Member Since"
                value={team.createdAt ? formatDate(team.createdAt) : "—"}
                helper="Your team is active"
                icon={CalendarDays}
                accent="bg-[#E4F7F0] text-[#1EB985]"
              />
              <StatTile
                label="Your Role"
                value={isLeader ? "Leader" : "Member"}
                helper={isLeader ? "Leading the way" : "Part of the team"}
                icon={isLeader ? Crown : ShieldCheck}
                accent="bg-[#FFF0DD] text-[#EC921D]"
              />
            </div>

            <div className="grid grid-cols-1 gap-5 lg:grid-cols-[42fr_58fr]">
              {/* Invite code */}
              <Card className="rounded-2xl">
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <SectionIcon
                      icon={KeyRound}
                      className="bg-primary/10 text-primary"
                    />
                    Invite code
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <p className="text-xs text-muted-foreground sm:text-sm">
                    Share this code with your classmates so they can join your
                    team.
                  </p>
                  <div className="rounded-xl border border-dashed border-[#E9D6C6] bg-[#FFFCF9] px-3 py-4 text-center">
                    <p
                      className="break-all font-mono text-lg font-bold uppercase tracking-[0.28em] text-primary sm:text-[23px]"
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
                    {copied ? (
                      <>
                        <Check className="h-4 w-4" /> Copied
                      </>
                    ) : (
                      <>
                        <Copy className="h-4 w-4" /> Copy code
                      </>
                    )}
                  </Button>
                </CardContent>
              </Card>

              {/* Brand card. Replaces the dashboard filler this space used to
                  hold: one message, one image, nothing to maintain. */}
              <Card className="relative overflow-hidden rounded-[20px] border-[#EAE1D9] bg-gradient-to-br from-[#FFF8F2] via-[#FFF4EE] to-[#FDECE4]">
                <div
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-y-0 right-0 w-1/2"
                  style={{
                    background:
                      "radial-gradient(120% 90% at 100% 100%, rgba(120,86,70,.28) 0%, rgba(160,120,96,.14) 38%, rgba(255,244,238,0) 72%)",
                  }}
                />
                <svg
                  aria-hidden="true"
                  viewBox="0 0 320 150"
                  preserveAspectRatio="none"
                  className="pointer-events-none absolute bottom-0 right-0 h-[62%] w-[62%] opacity-70"
                >
                  <path d="M60 150 L150 44 L205 150 Z" fill="#B8A093" opacity=".55" />
                  <path d="M150 44 L172 70 L150 96 L128 70 Z" fill="#F3E7DF" opacity=".9" />
                  <path d="M150 150 L235 62 L320 150 Z" fill="#8E7566" opacity=".5" />
                  <path d="M235 62 L253 84 L235 106 L217 84 Z" fill="#F6ECE5" opacity=".85" />
                </svg>
                <CardContent className="relative p-5 sm:p-7">
                  <h2 className="max-w-[19ch] text-xl font-bold leading-snug text-foreground sm:text-[30px]">
                    Great teams
                    <br />
                    build extraordinary things.
                  </h2>
                  <span className="mt-2 block h-[3px] w-16 rounded-full bg-[#FFC525]" />
                  <p className="mt-3 max-w-[34ch] text-sm text-muted-foreground">
                    Keep collaborating, track your milestones and make an impact
                    together.
                  </p>
                </CardContent>
              </Card>
            </div>
          </>
        ) : null}

        {tab === "members" ? (
          <>
            {/* Requests summary strip — only shown when something needs action. */}
            {totalRequests > 0 && (
              <div className="flex items-center gap-2 rounded-2xl border border-primary/20 bg-primary/5 px-4 py-3 text-sm">
                <Inbox className="h-4 w-4 text-primary" />
                <span className="font-medium text-foreground">
                  {totalRequests} {totalRequests === 1 ? "request" : "requests"}{" "}
                  need your attention
                </span>
              </div>
            )}

            {pendingInvitations.length > 0 && (
              <Card className="rounded-2xl" data-testid="card-sent-invitations">
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <SectionIcon
                      icon={Mail}
                      className="bg-violet-500/10 text-violet-600"
                    />
                    Pending invitations sent
                    <span className="ml-1 text-xs font-normal text-muted-foreground">
                      ({pendingInvitations.length})
                    </span>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {pendingInvitations.map((inv) => (
                      <div
                        key={inv.id}
                        className="flex items-center justify-between gap-3 rounded-xl border bg-card p-3 transition-colors hover:border-primary/30"
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
                </CardContent>
              </Card>
            )}

            {pendingJoins.length > 0 && (
              <Card className="rounded-2xl" data-testid="card-join-requests">
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <SectionIcon
                      icon={UserPlus}
                      className="bg-emerald-500/10 text-emerald-600"
                    />
                    Join requests
                    <span className="ml-1 text-xs font-normal text-muted-foreground">
                      ({pendingJoins.length})
                    </span>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {pendingJoins.map((jr) => (
                      <div
                        key={jr.id}
                        className="flex items-start gap-3 rounded-xl border bg-card p-3 transition-colors hover:border-emerald-500/30"
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
                </CardContent>
              </Card>
            )}

            {isLeader && pendingLeaves.length > 0 && (
              <Card className="rounded-2xl" data-testid="card-leave-requests">
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <SectionIcon
                      icon={LogOut}
                      className="bg-orange-500/10 text-orange-600"
                    />
                    Leave requests
                    <span className="ml-1 text-xs font-normal text-muted-foreground">
                      ({pendingLeaves.length})
                    </span>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {pendingLeaves.map((lr) => (
                      <div
                        key={lr.id}
                        className="flex items-start gap-3 rounded-xl border bg-card p-3 transition-colors hover:border-orange-500/30"
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
                </CardContent>
              </Card>
            )}

            {/* Team members */}
            <Card className="rounded-2xl">
              <CardHeader className="flex flex-row items-center justify-between pb-3">
                <CardTitle className="flex items-center gap-2 text-base">
                  <SectionIcon
                    icon={Users}
                    className="bg-primary/10 text-primary"
                  />
                  Team Members
                  <span className="ml-1 text-xs font-normal text-muted-foreground">
                    ({team.members.length})
                  </span>
                </CardTitle>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 gap-1.5"
                  onClick={() => setInviteOpen(true)}
                  data-testid="button-open-invite"
                >
                  <UserPlus className="h-4 w-4" />
                  Invite member
                </Button>
              </CardHeader>
              <CardContent>
                <div className="space-y-1">
                  {team.members.map((member) => {
                    const memberName =
                      `${member.firstName} ${member.lastName}`.trim() ||
                      member.email;
                    const showLeaderMenu = isLeader && !member.isLeader;
                    return (
                      <div
                        key={member.userId}
                        className="-mx-2 flex items-center gap-3 rounded-xl p-2 transition-colors hover:bg-muted/50"
                        data-testid={`member-${member.userId}`}
                      >
                        <Avatar className="h-9 w-9">
                          <AvatarImage src={member.profileImage || undefined} />
                          <AvatarFallback className="text-xs">
                            {memberInitials(
                              member.firstName,
                              member.lastName,
                              member.email,
                            )}
                          </AvatarFallback>
                        </Avatar>
                        <div className="flex-1 overflow-hidden">
                          <p className="truncate text-sm font-medium">
                            {memberName}
                          </p>
                          <p className="truncate text-xs text-muted-foreground">
                            {member.niatId ?? member.email}
                          </p>
                        </div>
                        {member.isLeader && (
                          <Badge className="h-5 gap-1 border border-amber-500/30 bg-amber-500/15 px-1.5 text-[10px] text-amber-700 hover:bg-amber-500/15">
                            <Crown className="h-3 w-3" /> Leader
                          </Badge>
                        )}
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
                      </div>
                    );
                  })}
                </div>

                {!isLeader && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-4 w-full gap-2"
                    data-testid="button-open-leave"
                    onClick={() => setLeaveOpen(true)}
                  >
                    <LogOut className="h-4 w-4" /> Leave team
                  </Button>
                )}
              </CardContent>
            </Card>
          </>
        ) : null}

        {tab === "milestones" ? (
          <>
            {/* Milestone timeline */}
            <Card className="rounded-2xl">
              <CardHeader className="flex flex-row items-center justify-between pb-3">
                <div>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <SectionIcon
                      icon={Flag}
                      className="bg-primary/10 text-primary"
                    />
                    Milestone Timeline
                  </CardTitle>
                  <p className="ml-9 mt-1 text-xs text-muted-foreground">
                    Track your team's journey
                  </p>
                </div>
              </CardHeader>
              <CardContent>
                {milestonesLoading ? (
                  <div className="flex justify-center py-8">
                    <Spinner />
                  </div>
                ) : !milestones || milestones.length === 0 ? (
                  <div className="rounded-xl border-2 border-dashed py-12 text-center text-muted-foreground">
                    <Flag className="mx-auto mb-3 h-8 w-8 opacity-50" />
                    <p>No milestones yet.</p>
                  </div>
                ) : (
                  <div className="relative ml-3 space-y-6 border-l-2 border-muted pb-2">
                    {milestones.map((m) => (
                      <div key={m.id} className="relative pl-6">
                        <div className="absolute -left-[7.5px] top-2 h-3 w-3 rounded-full bg-primary ring-4 ring-background" />
                        <div className="rounded-xl border bg-muted/30 p-4 transition-colors hover:border-primary/40">
                          <div className="mb-1.5 flex items-center justify-between gap-3">
                            <h4 className="font-bold text-foreground">
                              {m.title}
                            </h4>
                            <div className="flex shrink-0 items-center text-xs text-muted-foreground">
                              <CalendarDays className="mr-1 h-3 w-3" />{" "}
                              {formatDate(m.date)}
                            </div>
                          </div>
                          {m.description && (
                            <p className="whitespace-pre-wrap text-sm text-muted-foreground">
                              {m.description}
                            </p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </>
        ) : null}

        {tab === "settings" ? (
          <>
            <Card className="rounded-2xl">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base">
                  <SectionIcon icon={Settings} className="bg-muted text-foreground" />
                  Team details
                </CardTitle>
              </CardHeader>
              <CardContent className="divide-y">
                <div className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0">
                  <span className="text-sm text-muted-foreground">Team name</span>
                  <span className="min-w-0 text-sm font-medium">
                    <InlineEditField
                      value={team.name}
                      editable={isLeader}
                      required
                      maxLength={80}
                      ariaLabel="Team name"
                      className="text-sm font-medium"
                      onSave={(next) => saveTeamField("name", next)}
                      onDraftChange={setNameDraft}
                    />
                  </span>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-3 py-3">
                  <span className="text-sm text-muted-foreground">Description</span>
                  <span className="min-w-0 text-sm font-medium">
                    <InlineEditField
                      value={team.tagline ?? ""}
                      editable={isLeader}
                      placeholder="Add a tagline…"
                      maxLength={120}
                      ariaLabel="Team tagline"
                      className="text-sm font-medium"
                      onSave={(next) => saveTeamField("tagline", next)}
                    />
                  </span>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-3 py-3">
                  <span className="text-sm text-muted-foreground">Invite code</span>
                  <span className="font-mono text-sm font-semibold tracking-[0.18em] text-primary">
                    {team.inviteCode}
                  </span>
                </div>
              </CardContent>
            </Card>

            {/* Danger zone */}
            {isLeader && (
              <Card className="rounded-2xl border-destructive/30 bg-destructive/[0.02]">
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2 text-base text-destructive">
                    <SectionIcon
                      icon={Trash2}
                      className="bg-destructive/10 text-destructive"
                    />
                    Danger zone
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <p className="text-xs text-muted-foreground">
                    Deleting the team removes all members, drafts, and the invite
                    code. You can only delete a team that has no submitted or
                    verified revenue or order book entries.
                  </p>
                  <Button
                    variant="destructive"
                    size="sm"
                    className="w-full gap-2"
                    onClick={() => setDeleteTeamOpen(true)}
                    data-testid="button-open-delete-team"
                  >
                    <Trash2 className="h-4 w-4" /> Delete team
                  </Button>
                </CardContent>
              </Card>
            )}
          </>
        ) : null}
      </div>


      <Link href="/browse-teams" className="hidden">
        browse
      </Link>

      {/* DIALOGS */}
      {/* Invite a teammate. Mounted here, outside the tab panels: the hero's
          own invite button lives on Overview while the members list is on
          another tab, and a dialog that is not rendered cannot open. */}
      <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Invite a teammate</DialogTitle>
          <DialogDescription>
            Search students at {team.campusName} who aren't on a team
            yet.
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
                  pendingInvitations.some(
                    (i) => i.inviteeId === s.id,
                  );
                const rowKey = s.id ?? `roster-${s.rosterId}`;
                return (
                  <div
                    key={rowKey}
                    className="flex items-center gap-3 rounded-lg p-2 hover:bg-muted/50"
                    data-testid={`student-${rowKey}`}
                  >
                    <Avatar className="h-8 w-8">
                      <AvatarImage
                        src={s.profileImage ?? undefined}
                      />
                      <AvatarFallback>
                        {memberInitials(
                          s.firstName,
                          s.lastName,
                          s.email,
                        )}
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
                      <Badge
                        variant="secondary"
                        className="text-[10px]"
                      >
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
