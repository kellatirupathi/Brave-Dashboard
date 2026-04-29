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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Spinner } from "@/components/ui/spinner";
import {
  CalendarDays,
  Flag,
  Plus,
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
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
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

function StatTile({
  label,
  value,
  icon: Icon,
  accent,
}: {
  label: string;
  value: number | string;
  icon: React.ComponentType<{ className?: string }>;
  accent: string;
}) {
  return (
    <Card className="p-4">
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-[11px] text-muted-foreground uppercase tracking-wider font-semibold">
          {label}
        </span>
        <div
          className={`w-7 h-7 rounded-md flex items-center justify-center ${accent}`}
        >
          <Icon className="w-3.5 h-3.5" />
        </div>
      </div>
      <div className="text-2xl font-bold tracking-tight">{value}</div>
    </Card>
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
  const [leaveReason, setLeaveReason] = useState("");
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
  const myLeaveRequest = pendingLeaves.find((l) => l.requesterId === userId);

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
        onSuccess: () => {
          toast({ title: "Request approved" });
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

  const handleRequestLeave = () => {
    requestLeave.mutate(
      { id: team.id, data: { reason: leaveReason.trim() || undefined } },
      {
        onSuccess: () => {
          toast({
            title: "Leave request sent",
            description: "Your team leader will review it.",
          });
          setLeaveOpen(false);
          setLeaveReason("");
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
        onSuccess: () => {
          toast({
            title: "Member removed",
            description: `${name} is no longer on the team.`,
          });
          setRemoveTarget(null);
          invalidateAll();
        },
        onError: (err: unknown) =>
          toast({
            title: "Could not remove member",
            description: (err as { message?: string })?.message ?? "Try again.",
            variant: "destructive",
          }),
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
    <div className="space-y-6 max-w-6xl mx-auto pb-12">
      {/* HERO */}
      <Card className="relative overflow-hidden border-0 shadow-sm">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/15 via-primary/5 to-transparent pointer-events-none" />
        <div className="relative p-6 md:p-8">
          <div className="flex flex-col md:flex-row gap-6 items-center md:items-start">
            <div className="shrink-0">
              {team.photoUrl ? (
                <img
                  src={team.photoUrl}
                  alt={team.name}
                  className="w-28 h-28 rounded-2xl object-cover ring-4 ring-background shadow-lg"
                />
              ) : (
                <div className="w-28 h-28 rounded-2xl bg-gradient-to-br from-primary/25 to-primary/5 text-primary flex items-center justify-center text-4xl font-extrabold ring-4 ring-background shadow-lg">
                  {team.name.substring(0, 2).toUpperCase()}
                </div>
              )}
            </div>

            <div className="flex-1 text-center md:text-left min-w-0">
              <div className="flex flex-wrap items-center justify-center md:justify-start gap-2 mb-2">
                <Badge
                  variant={team.status === "active" ? "default" : "outline"}
                  className="capitalize gap-1"
                >
                  <ShieldCheck className="w-3 h-3" /> {team.status}
                </Badge>
                <Badge variant="secondary">{team.campusName}</Badge>
                {isLeader ? (
                  <Badge className="bg-amber-500/15 text-amber-700 border border-amber-500/30 hover:bg-amber-500/15 gap-1">
                    <Crown className="w-3 h-3" /> Leader
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
              <h1 className="text-3xl md:text-4xl font-bold tracking-tight">
                <InlineEditField
                  value={team.name}
                  editable={isLeader}
                  required
                  maxLength={80}
                  ariaLabel="Team name"
                  testId="text-team-name"
                  className="text-3xl md:text-4xl font-bold tracking-tight"
                  onSave={(next) => saveTeamField("name", next)}
                />
              </h1>
              {isLeader || team.tagline ? (
                <p className="text-muted-foreground mt-1.5 text-base md:text-lg">
                  <InlineEditField
                    value={team.tagline ?? ""}
                    editable={isLeader}
                    placeholder="Add a tagline…"
                    maxLength={120}
                    ariaLabel="Team tagline"
                    testId="text-team-tagline"
                    className="text-base md:text-lg text-muted-foreground"
                    onSave={(next) => saveTeamField("tagline", next)}
                  />
                </p>
              ) : null}
              <div className="flex flex-wrap justify-center md:justify-start items-center gap-x-4 gap-y-1 mt-4 text-sm text-muted-foreground">
                <span className="flex items-center gap-1.5">
                  <Users className="w-4 h-4" /> {team.members.length}{" "}
                  {team.members.length === 1 ? "member" : "members"}
                </span>
                {team.createdAt && (
                  <span className="flex items-center gap-1.5">
                    <CalendarDays className="w-4 h-4" /> Since{" "}
                    {formatDate(team.createdAt)}
                  </span>
                )}
                <span className="flex items-center gap-1.5">
                  <Flag className="w-4 h-4" /> {milestones?.length ?? 0}{" "}
                  milestones
                </span>
              </div>
            </div>

            <div className="flex flex-col items-center md:items-end gap-3">
              <div className="flex -space-x-2">
                {team.members.slice(0, 5).map((m) => (
                  <Avatar
                    key={m.userId}
                    className="ring-2 ring-background w-9 h-9"
                  >
                    <AvatarImage src={m.profileImage ?? undefined} />
                    <AvatarFallback className="text-xs">
                      {memberInitials(m.firstName, m.lastName, m.email)}
                    </AvatarFallback>
                  </Avatar>
                ))}
                {team.members.length > 5 && (
                  <div className="w-9 h-9 rounded-full bg-muted flex items-center justify-center text-xs font-medium ring-2 ring-background">
                    +{team.members.length - 5}
                  </div>
                )}
              </div>
              {isTeamFull ? (
                <div
                  className="text-sm text-muted-foreground rounded-md border px-3 py-2"
                  data-testid="text-team-full"
                >
                  Team is full ({memberCount}/{teamMemberLimit} members)
                </div>
              ) : (
                <Button
                  size="sm"
                  onClick={() => setInviteOpen(true)}
                  data-testid="button-hero-invite"
                  className="gap-2"
                >
                  <UserPlus className="w-4 h-4" /> Invite member
                </Button>
              )}
            </div>
          </div>
        </div>
      </Card>

      {/* MAIN GRID */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* LEFT COLUMN */}
        <div className="lg:col-span-1 space-y-6">
          {/* Invite code */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <KeyRound className="w-4 h-4 text-primary" /> Invite code
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="bg-muted/40 border-2 border-dashed rounded-lg py-4 px-3 text-center">
                <p
                  className="font-mono text-2xl font-bold tracking-[0.25em] text-primary uppercase break-all"
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
                <Copy className="w-4 h-4" /> Copy code
              </Button>
              <p className="text-xs text-muted-foreground text-center">
                Share with classmates so they can join your team.
              </p>
            </CardContent>
          </Card>

          {/* Team members */}
          <Card>
            <CardHeader className="pb-3 flex flex-row items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <Users className="w-4 h-4 text-primary" />
                Team Members
                <span className="text-xs font-normal text-muted-foreground ml-1">
                  ({team.members.length})
                </span>
              </CardTitle>
              <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
                <DialogTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    data-testid="button-open-invite"
                  >
                    <UserPlus className="w-4 h-4" />
                  </Button>
                </DialogTrigger>
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
                    <div className="max-h-72 overflow-y-auto space-y-1">
                      {searchQ.trim().length < 2 ? (
                        <p className="text-sm text-muted-foreground p-2">
                          Type at least 2 characters to search.
                        </p>
                      ) : students.length === 0 ? (
                        <p className="text-sm text-muted-foreground p-2">
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
                              className="flex items-center gap-3 p-2 rounded hover:bg-muted/50"
                              data-testid={`student-${rowKey}`}
                            >
                              <Avatar className="w-8 h-8">
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
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium truncate">
                                  {s.firstName} {s.lastName}
                                </p>
                                <p className="text-xs text-muted-foreground truncate">
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
                      className="flex items-center gap-3 p-2 -mx-2 rounded-lg hover:bg-muted/40 transition-colors"
                      data-testid={`member-${member.userId}`}
                    >
                      <Avatar className="w-9 h-9">
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
                        <p className="text-sm font-medium truncate">
                          {memberName}
                        </p>
                        <p className="text-xs text-muted-foreground truncate">
                          {member.niatId ?? member.email}
                        </p>
                      </div>
                      {member.isLeader && (
                        <Badge className="bg-amber-500/15 text-amber-700 border border-amber-500/30 hover:bg-amber-500/15 text-[10px] px-1.5 h-5 gap-1">
                          <Crown className="w-3 h-3" /> Leader
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
                              <MoreVertical className="w-4 h-4" />
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
                              <Crown className="w-4 h-4 mr-2" /> Make leader
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
                              <UserMinus className="w-4 h-4 mr-2" /> Remove from
                              team
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}
                    </div>
                  );
                })}
              </div>

              {!isLeader && !myLeaveRequest && (
                <Dialog open={leaveOpen} onOpenChange={setLeaveOpen}>
                  <DialogTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full mt-4 gap-2"
                      data-testid="button-open-leave"
                    >
                      <LogOut className="w-4 h-4" /> Request to leave
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Request to leave team</DialogTitle>
                      <DialogDescription>
                        Your team leader will need to approve this. Tell them
                        why (optional).
                      </DialogDescription>
                    </DialogHeader>
                    <Textarea
                      value={leaveReason}
                      onChange={(e) => setLeaveReason(e.target.value)}
                      rows={3}
                      placeholder="Reason (optional)…"
                      data-testid="input-leave-reason"
                    />
                    <DialogFooter>
                      <Button
                        variant="outline"
                        onClick={() => setLeaveOpen(false)}
                      >
                        Cancel
                      </Button>
                      <Button
                        onClick={handleRequestLeave}
                        disabled={requestLeave.isPending}
                        data-testid="button-submit-leave"
                      >
                        Send request
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              )}

              {myLeaveRequest && (
                <p
                  className="text-xs text-muted-foreground mt-4 p-2 bg-muted rounded"
                  data-testid="text-leave-pending"
                >
                  Your leave request is pending leader approval.
                </p>
              )}
            </CardContent>
          </Card>

          {/* Danger zone */}
          {isLeader && (
            <Card className="border-destructive/30">
              <CardHeader className="pb-3">
                <CardTitle className="text-base text-destructive flex items-center gap-2">
                  <Trash2 className="w-4 h-4" /> Danger zone
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
                  <Trash2 className="w-4 h-4" /> Delete team
                </Button>
              </CardContent>
            </Card>
          )}
        </div>

        {/* RIGHT COLUMN */}
        <div className="lg:col-span-2 space-y-6">
          {pendingInvitations.length > 0 && (
            <Card data-testid="card-sent-invitations">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Mail className="w-4 h-4 text-violet-600" />
                  Pending invitations sent
                  <span className="text-xs font-normal text-muted-foreground ml-1">
                    ({pendingInvitations.length})
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {pendingInvitations.map((inv) => (
                    <div
                      key={inv.id}
                      className="flex items-center justify-between gap-3 p-3 rounded-lg border bg-card"
                      data-testid={`sent-invite-${inv.id}`}
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">
                          {inv.inviteeName}
                        </p>
                        <p className="text-xs text-muted-foreground truncate">
                          {inv.inviteeNiatId ?? inv.inviteeEmail} • Invited by{" "}
                          {inv.inviterName}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
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
            <Card data-testid="card-join-requests">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <UserPlus className="w-4 h-4 text-emerald-600" />
                  Join requests
                  <span className="text-xs font-normal text-muted-foreground ml-1">
                    ({pendingJoins.length})
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {pendingJoins.map((jr) => (
                    <div
                      key={jr.id}
                      className="flex items-start gap-3 p-3 rounded-lg border bg-card"
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
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium">
                          {jr.requesterName}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {jr.requesterNiatId ?? jr.requesterEmail}
                        </p>
                        {jr.message && (
                          <p className="text-sm mt-2 italic">"{jr.message}"</p>
                        )}
                      </div>
                      <div className="flex gap-2 shrink-0">
                        <Button
                          size="sm"
                          className="bg-green-600 hover:bg-green-700 text-white"
                          onClick={() => handleApproveJoin(jr.id)}
                          disabled={approveJoin.isPending}
                          data-testid={`button-approve-join-${jr.id}`}
                        >
                          <Check className="w-4 h-4" />
                        </Button>
                        <Button
                          size="sm"
                          className="bg-red-400 hover:bg-red-500 text-white"
                          onClick={() => handleDeclineJoin(jr.id)}
                          disabled={declineJoin.isPending}
                          data-testid={`button-decline-join-${jr.id}`}
                        >
                          <X className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {isLeader && pendingLeaves.length > 0 && (
            <Card data-testid="card-leave-requests">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <LogOut className="w-4 h-4 text-orange-600" />
                  Leave requests
                  <span className="text-xs font-normal text-muted-foreground ml-1">
                    ({pendingLeaves.length})
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {pendingLeaves.map((lr) => (
                    <div
                      key={lr.id}
                      className="flex items-start gap-3 p-3 rounded-lg border bg-card"
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
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium">
                          {lr.requesterName}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          wants to leave the team
                        </p>
                        {lr.reason && (
                          <p className="text-sm mt-2 italic">"{lr.reason}"</p>
                        )}
                      </div>
                      <div className="flex gap-2 shrink-0">
                        <Button
                          size="sm"
                          className="bg-green-600 hover:bg-green-700 text-white"
                          onClick={() => handleApproveLeave(lr.id)}
                          disabled={approveLeave.isPending}
                          data-testid={`button-approve-leave-${lr.id}`}
                        >
                          <Check className="w-4 h-4" />
                        </Button>
                        <Button
                          size="sm"
                          className="bg-red-400 hover:bg-red-500 text-white"
                          onClick={() => handleDeclineLeave(lr.id)}
                          disabled={declineLeave.isPending}
                          data-testid={`button-decline-leave-${lr.id}`}
                        >
                          <X className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Milestone timeline */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <div>
                <CardTitle className="text-base flex items-center gap-2">
                  <Flag className="w-4 h-4 text-primary" /> Milestone Timeline
                </CardTitle>
                <p className="text-xs text-muted-foreground mt-1">
                  Track your team's journey
                </p>
              </div>
            </CardHeader>
            <CardContent>
              {milestonesLoading ? (
                <div className="py-8 flex justify-center">
                  <Spinner />
                </div>
              ) : !milestones || milestones.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground border-2 border-dashed rounded-lg">
                  <Flag className="w-8 h-8 mx-auto mb-3 opacity-50" />
                  <p>No milestones yet.</p>
                </div>
              ) : (
                <div className="relative border-l-2 border-muted ml-3 space-y-6 pb-2">
                  {milestones.map((m, idx) => (
                    <div key={m.id} className="relative pl-6">
                      <div
                        className={`absolute w-3 h-3 rounded-full -left-[7.5px] top-2 ring-4 ring-background ${
                          idx === 0 ? "bg-primary" : "bg-muted-foreground/40"
                        }`}
                      />
                      <div className="bg-muted/30 p-4 rounded-lg border hover:border-primary/40 transition-colors">
                        <div className="flex items-center justify-between mb-1.5 gap-3">
                          <h4 className="font-bold text-foreground">
                            {m.title}
                          </h4>
                          <div className="flex items-center text-xs text-muted-foreground shrink-0">
                            <CalendarDays className="w-3 h-3 mr-1" />{" "}
                            {formatDate(m.date)}
                          </div>
                        </div>
                        {m.description && (
                          <p className="text-sm text-muted-foreground whitespace-pre-wrap">
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
        </div>
      </div>

      <Link href="/browse-teams" className="hidden">
        browse
      </Link>

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
