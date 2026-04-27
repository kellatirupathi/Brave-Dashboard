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
  useApproveJoinRequest,
  useDeclineJoinRequest,
  useRequestToLeaveTeam,
  useApproveLeaveRequest,
  useDeclineLeaveRequest,
  useRemoveTeamMember,
  useTransferTeamLeadership,
  useDeleteTeam,
  getListTeamInvitationsQueryKey,
  getListTeamJoinRequestsQueryKey,
  getListTeamLeaveRequestsQueryKey,
  getGetMyTeamQueryKey,
} from "@workspace/api-client-react";
import type { TeamDetail } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Spinner } from "@/components/ui/spinner";
import { CalendarDays, Flag, Plus, Copy, UserPlus, Check, X, LogOut, Users, KeyRound, MoreVertical, Crown, UserMinus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { formatDate } from "@/lib/format";
import { useToast } from "@/hooks/use-toast";

export default function TeamProfile() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const { data: team, isLoading: teamLoading } = useGetMyTeam({ query: { retry: false } });
  const { toast } = useToast();
  const queryClient = useQueryClient();

  if (teamLoading) return <div className="flex h-64 items-center justify-center"><Spinner size="lg" /></div>;
  if (!team) {
    setLocation("/get-started");
    return null;
  }

  return <TeamView team={team as TeamDetail} userId={user?.id ?? ""} toast={toast} queryClient={queryClient} setLocation={setLocation} />;
}

function TeamView({
  team, userId, toast, queryClient, setLocation,
}: {
  team: TeamDetail;
  userId: string;
  toast: ReturnType<typeof useToast>["toast"];
  queryClient: ReturnType<typeof useQueryClient>;
  setLocation: (to: string) => void;
}) {
  const isLeader = String(team.leaderId) === userId;
  const { data: milestones, isLoading: milestonesLoading } = useListMilestones({ teamId: team.id }, { query: { enabled: !!team.id } });
  const { data: sentInvitations } = useListTeamInvitations(team.id);
  const { data: joinRequests } = useListTeamJoinRequests(team.id);
  const { data: leaveRequests } = useListTeamLeaveRequests(team.id);

  const sendInvite = useSendTeamInvitation();
  const approveJoin = useApproveJoinRequest();
  const declineJoin = useDeclineJoinRequest();
  const requestLeave = useRequestToLeaveTeam();
  const approveLeave = useApproveLeaveRequest();
  const declineLeave = useDeclineLeaveRequest();
  const removeMember = useRemoveTeamMember();
  const transferLeadership = useTransferTeamLeadership();
  const deleteTeam = useDeleteTeam();

  const [inviteOpen, setInviteOpen] = useState(false);
  const [searchQ, setSearchQ] = useState("");
  const [leaveOpen, setLeaveOpen] = useState(false);
  const [leaveReason, setLeaveReason] = useState("");
  const [removeTarget, setRemoveTarget] = useState<{ userId: string; name: string } | null>(null);
  const [transferTarget, setTransferTarget] = useState<{ userId: string; name: string } | null>(null);
  const [deleteTeamOpen, setDeleteTeamOpen] = useState(false);

  const pendingInvitations = sentInvitations?.filter((i) => i.status === "pending") ?? [];
  const pendingJoins = joinRequests?.filter((j) => j.status === "pending") ?? [];
  const pendingLeaves = leaveRequests?.filter((l) => l.status === "pending") ?? [];
  const myLeaveRequest = pendingLeaves.find((l) => l.requesterId === userId);

  const { data: students = [] } = useSearchCampusStudents(
    { q: searchQ },
    { query: { enabled: searchQ.trim().length >= 2 } },
  );

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: getListTeamInvitationsQueryKey(team.id) });
    queryClient.invalidateQueries({ queryKey: getListTeamJoinRequestsQueryKey(team.id) });
    queryClient.invalidateQueries({ queryKey: getListTeamLeaveRequestsQueryKey(team.id) });
    queryClient.invalidateQueries({ queryKey: getGetMyTeamQueryKey() });
  };

  const copyInviteCode = async () => {
    try {
      await navigator.clipboard.writeText(team.inviteCode);
      toast({ title: "Invite code copied", description: team.inviteCode });
    } catch {
      toast({ title: "Could not copy", variant: "destructive" });
    }
  };

  const handleInvite = (inviteeId: string, name: string) => {
    sendInvite.mutate({ id: team.id, data: { inviteeId } }, {
      onSuccess: () => {
        toast({ title: "Invitation sent", description: `${name} will see it in their invitations.` });
        invalidateAll();
      },
      onError: (err: unknown) => {
        toast({ title: "Could not invite", description: (err as { message?: string })?.message ?? "Try again.", variant: "destructive" });
      },
    });
  };

  const handleApproveJoin = (id: number) => approveJoin.mutate({ id }, {
    onSuccess: () => { toast({ title: "Request approved" }); invalidateAll(); },
    onError: (err: unknown) => toast({ title: "Failed", description: (err as { message?: string })?.message, variant: "destructive" }),
  });
  const handleDeclineJoin = (id: number) => declineJoin.mutate({ id }, {
    onSuccess: () => { toast({ title: "Request declined" }); invalidateAll(); },
    onError: (err: unknown) => toast({ title: "Failed", description: (err as { message?: string })?.message, variant: "destructive" }),
  });

  const handleRequestLeave = () => {
    requestLeave.mutate({ id: team.id, data: { reason: leaveReason.trim() || undefined } }, {
      onSuccess: () => {
        toast({ title: "Leave request sent", description: "Your team leader will review it." });
        setLeaveOpen(false);
        setLeaveReason("");
        invalidateAll();
      },
      onError: (err: unknown) => toast({ title: "Failed", description: (err as { message?: string })?.message, variant: "destructive" }),
    });
  };

  const handleApproveLeave = (id: number) => approveLeave.mutate({ id }, {
    onSuccess: () => { toast({ title: "Leave approved" }); invalidateAll(); },
    onError: (err: unknown) => toast({ title: "Failed", description: (err as { message?: string })?.message, variant: "destructive" }),
  });
  const handleDeclineLeave = (id: number) => declineLeave.mutate({ id }, {
    onSuccess: () => { toast({ title: "Leave declined" }); invalidateAll(); },
    onError: (err: unknown) => toast({ title: "Failed", description: (err as { message?: string })?.message, variant: "destructive" }),
  });

  const handleConfirmRemove = () => {
    if (!removeTarget) return;
    const name = removeTarget.name;
    removeMember.mutate({ id: team.id, userId: removeTarget.userId }, {
      onSuccess: () => {
        toast({ title: "Member removed", description: `${name} is no longer on the team.` });
        setRemoveTarget(null);
        invalidateAll();
      },
      onError: (err: unknown) => toast({
        title: "Could not remove member",
        description: (err as { message?: string })?.message ?? "Try again.",
        variant: "destructive",
      }),
    });
  };

  const handleDeleteTeam = () => {
    deleteTeam.mutate({ id: team.id }, {
      onSuccess: () => {
        toast({ title: "Team deleted", description: `${team.name} and its drafts were removed.` });
        setDeleteTeamOpen(false);
        queryClient.invalidateQueries({ queryKey: getGetMyTeamQueryKey() });
        setLocation("/get-started");
      },
      onError: (err: unknown) => {
        const e = err as { status?: number; data?: { error?: string }; message?: string };
        const desc = e?.status === 409
          ? (e?.data?.error || "Team has submitted or verified entries — clear them first.")
          : (e?.data?.error || e?.message || "Try again.");
        toast({ title: "Could not delete team", description: desc, variant: "destructive" });
      },
    });
  };

  const handleConfirmTransfer = () => {
    if (!transferTarget) return;
    const name = transferTarget.name;
    transferLeadership.mutate({ id: team.id, data: { newLeaderId: transferTarget.userId } }, {
      onSuccess: () => {
        toast({ title: "Leadership transferred", description: `${name} is now the team leader.` });
        setTransferTarget(null);
        invalidateAll();
      },
      onError: (err: unknown) => toast({
        title: "Could not transfer leadership",
        description: (err as { message?: string })?.message ?? "Try again.",
        variant: "destructive",
      }),
    });
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <div className="flex flex-col md:flex-row gap-6">
        <div className="w-full md:w-1/3 space-y-6">
          <Card>
            <CardContent className="pt-6 text-center">
              {team.photoUrl ? (
                <img src={team.photoUrl} alt={team.name} className="w-32 h-32 rounded-full mx-auto object-cover border-4 border-background shadow-sm" />
              ) : (
                <div className="w-32 h-32 rounded-full bg-primary/10 text-primary flex items-center justify-center text-4xl font-bold mx-auto shadow-sm">
                  {team.name.substring(0, 2).toUpperCase()}
                </div>
              )}
              <h2 className="text-2xl font-bold mt-4" data-testid="text-team-name">{team.name}</h2>
              <p className="text-muted-foreground mt-1">{team.tagline}</p>
              <div className="flex justify-center gap-2 mt-4">
                <Badge variant="outline" className="capitalize">{team.status}</Badge>
                <Badge variant="secondary">{team.campusName}</Badge>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg flex items-center gap-2"><KeyRound className="w-4 h-4" /> Invite code</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2">
                <Input
                  readOnly
                  value={team.inviteCode}
                  className="font-mono tracking-widest text-center text-base uppercase"
                  data-testid="input-invite-code"
                />
                <Button size="icon" variant="outline" onClick={copyInviteCode} data-testid="button-copy-code"><Copy className="w-4 h-4" /></Button>
              </div>
              <p className="text-xs text-muted-foreground mt-2">Share this code with classmates so they can join your team.</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3 flex flex-row items-center justify-between">
              <CardTitle className="text-lg">Team Members ({team.members.length})</CardTitle>
              <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
                <DialogTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-8 w-8" data-testid="button-open-invite"><UserPlus className="w-4 h-4" /></Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Invite a teammate</DialogTitle>
                    <DialogDescription>Search students at {team.campusName} who aren't on a team yet.</DialogDescription>
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
                        <p className="text-sm text-muted-foreground p-2">Type at least 2 characters to search.</p>
                      ) : students.length === 0 ? (
                        <p className="text-sm text-muted-foreground p-2">No matching students.</p>
                      ) : students.map((s) => {
                        const alreadyInvited = pendingInvitations.some((i) => i.inviteeId === s.id);
                        return (
                          <div key={s.id} className="flex items-center gap-3 p-2 rounded hover:bg-muted/50" data-testid={`student-${s.id}`}>
                            <Avatar className="w-8 h-8">
                              <AvatarImage src={s.profileImage ?? undefined} />
                              <AvatarFallback>{s.firstName[0]}{s.lastName[0]}</AvatarFallback>
                            </Avatar>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium truncate">{s.firstName} {s.lastName}</p>
                              <p className="text-xs text-muted-foreground truncate">{s.email}</p>
                            </div>
                            {alreadyInvited ? (
                              <Badge variant="secondary" className="text-[10px]">Invited</Badge>
                            ) : (
                              <Button
                                size="sm"
                                onClick={() => handleInvite(s.id, `${s.firstName} ${s.lastName}`)}
                                disabled={sendInvite.isPending}
                                data-testid={`button-invite-${s.id}`}
                              >
                                Invite
                              </Button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </DialogContent>
              </Dialog>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {team.members.map((member) => {
                  const memberName = `${member.firstName} ${member.lastName}`.trim() || member.email;
                  const showLeaderMenu = isLeader && !member.isLeader;
                  return (
                    <div key={member.userId} className="flex items-center gap-3" data-testid={`member-${member.userId}`}>
                      <Avatar>
                        <AvatarImage src={member.profileImage || undefined} />
                        <AvatarFallback>{member.firstName[0]}{member.lastName[0]}</AvatarFallback>
                      </Avatar>
                      <div className="flex-1 overflow-hidden">
                        <p className="text-sm font-medium truncate">{memberName}</p>
                        <p className="text-xs text-muted-foreground truncate">{member.email}</p>
                      </div>
                      {member.isLeader && <Badge variant="secondary" className="text-[10px] px-1.5 h-5">Leader</Badge>}
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
                              onSelect={() => setTransferTarget({ userId: member.userId, name: memberName })}
                              data-testid={`menu-make-leader-${member.userId}`}
                            >
                              <Crown className="w-4 h-4 mr-2" /> Make leader
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onSelect={() => setRemoveTarget({ userId: member.userId, name: memberName })}
                              className="text-destructive focus:text-destructive"
                              data-testid={`menu-remove-${member.userId}`}
                            >
                              <UserMinus className="w-4 h-4 mr-2" /> Remove from team
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
                    <Button variant="outline" size="sm" className="w-full mt-4" data-testid="button-open-leave"><LogOut className="w-4 h-4 mr-1" /> Request to leave</Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Request to leave team</DialogTitle>
                      <DialogDescription>Your team leader will need to approve this. Tell them why (optional).</DialogDescription>
                    </DialogHeader>
                    <Textarea value={leaveReason} onChange={(e) => setLeaveReason(e.target.value)} rows={3} placeholder="Reason (optional)…" data-testid="input-leave-reason" />
                    <DialogFooter>
                      <Button variant="outline" onClick={() => setLeaveOpen(false)}>Cancel</Button>
                      <Button onClick={handleRequestLeave} disabled={requestLeave.isPending} data-testid="button-submit-leave">Send request</Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              )}

              {myLeaveRequest && (
                <p className="text-xs text-muted-foreground mt-4 p-2 bg-muted rounded" data-testid="text-leave-pending">
                  Your leave request is pending leader approval.
                </p>
              )}
            </CardContent>
          </Card>

          {isLeader && (
            <Card className="border-destructive/30">
              <CardHeader className="pb-3">
                <CardTitle className="text-base text-destructive flex items-center gap-2">
                  <Trash2 className="w-4 h-4" /> Danger zone
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-xs text-muted-foreground">
                  Deleting the team removes all members, drafts, and the invite code. You can only delete a team that has no submitted or verified revenue or order book entries.
                </p>
                <Button
                  variant="destructive"
                  size="sm"
                  className="w-full"
                  onClick={() => setDeleteTeamOpen(true)}
                  data-testid="button-open-delete-team"
                >
                  <Trash2 className="w-4 h-4 mr-2" /> Delete team
                </Button>
              </CardContent>
            </Card>
          )}
        </div>

        <div className="w-full md:w-2/3 space-y-6">
          {pendingInvitations.length > 0 && (
            <Card data-testid="card-sent-invitations">
              <CardHeader><CardTitle className="text-lg">Pending invitations sent ({pendingInvitations.length})</CardTitle></CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {pendingInvitations.map((inv) => (
                    <div key={inv.id} className="flex items-center justify-between gap-3 p-2 rounded border" data-testid={`sent-invite-${inv.id}`}>
                      <div>
                        <p className="text-sm font-medium">{inv.inviteeName}</p>
                        <p className="text-xs text-muted-foreground">{inv.inviteeEmail} • Invited by {inv.inviterName}</p>
                      </div>
                      <Badge variant="outline">Pending</Badge>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {pendingJoins.length > 0 && (
            <Card data-testid="card-join-requests">
              <CardHeader><CardTitle className="text-lg flex items-center gap-2"><Users className="w-4 h-4" /> Join requests ({pendingJoins.length})</CardTitle></CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {pendingJoins.map((jr) => (
                    <div key={jr.id} className="flex items-start gap-3 p-3 rounded border" data-testid={`join-request-${jr.id}`}>
                      <Avatar>
                        <AvatarImage src={jr.requesterProfileImage ?? undefined} />
                        <AvatarFallback>{jr.requesterName.split(" ").map((s) => s[0]).join("").slice(0, 2)}</AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium">{jr.requesterName}</p>
                        <p className="text-xs text-muted-foreground">{jr.requesterEmail}</p>
                        {jr.message && <p className="text-sm mt-2 italic">"{jr.message}"</p>}
                      </div>
                      <div className="flex gap-2">
                        <Button size="sm" className="bg-green-600 hover:bg-green-700 text-white" onClick={() => handleApproveJoin(jr.id)} disabled={approveJoin.isPending} data-testid={`button-approve-join-${jr.id}`}>
                          <Check className="w-4 h-4" />
                        </Button>
                        <Button size="sm" className="bg-red-400 hover:bg-red-500 text-white" onClick={() => handleDeclineJoin(jr.id)} disabled={declineJoin.isPending} data-testid={`button-decline-join-${jr.id}`}>
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
              <CardHeader><CardTitle className="text-lg">Leave requests ({pendingLeaves.length})</CardTitle></CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {pendingLeaves.map((lr) => (
                    <div key={lr.id} className="flex items-start gap-3 p-3 rounded border" data-testid={`leave-request-${lr.id}`}>
                      <Avatar>
                        <AvatarImage src={lr.requesterProfileImage ?? undefined} />
                        <AvatarFallback>{lr.requesterName.split(" ").map((s) => s[0]).join("").slice(0, 2)}</AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium">{lr.requesterName}</p>
                        <p className="text-xs text-muted-foreground">wants to leave the team</p>
                        {lr.reason && <p className="text-sm mt-2 italic">"{lr.reason}"</p>}
                      </div>
                      <div className="flex gap-2">
                        <Button size="sm" className="bg-green-600 hover:bg-green-700 text-white" onClick={() => handleApproveLeave(lr.id)} disabled={approveLeave.isPending} data-testid={`button-approve-leave-${lr.id}`}>
                          <Check className="w-4 h-4" />
                        </Button>
                        <Button size="sm" className="bg-red-400 hover:bg-red-500 text-white" onClick={() => handleDeclineLeave(lr.id)} disabled={declineLeave.isPending} data-testid={`button-decline-leave-${lr.id}`}>
                          <X className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>Milestone Timeline</CardTitle>
                <p className="text-sm text-muted-foreground mt-1">Track your team's journey</p>
              </div>
              <Button size="sm"><Plus className="w-4 h-4 mr-2" /> Add Update</Button>
            </CardHeader>
            <CardContent>
              {milestonesLoading ? (
                <div className="py-8 flex justify-center"><Spinner /></div>
              ) : !milestones || milestones.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground border-2 border-dashed rounded-lg">
                  <Flag className="w-8 h-8 mx-auto mb-3 opacity-50" />
                  <p>No milestones yet.</p>
                </div>
              ) : (
                <div className="relative border-l-2 border-muted ml-3 space-y-8 pb-4">
                  {milestones.map((m) => (
                    <div key={m.id} className="relative pl-6">
                      <div className="absolute w-3 h-3 bg-primary rounded-full -left-[7.5px] top-1.5 ring-4 ring-background" />
                      <div className="bg-muted/30 p-4 rounded-lg border">
                        <div className="flex items-center justify-between mb-2">
                          <h4 className="font-bold text-foreground">{m.title}</h4>
                          <div className="flex items-center text-xs text-muted-foreground">
                            <CalendarDays className="w-3 h-3 mr-1" /> {formatDate(m.date)}
                          </div>
                        </div>
                        {m.description && <p className="text-sm text-muted-foreground whitespace-pre-wrap">{m.description}</p>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
      <Link href="/browse-teams" className="hidden">browse</Link>

      <AlertDialog
        open={removeTarget !== null}
        onOpenChange={(open) => { if (!open) setRemoveTarget(null); }}
      >
        <AlertDialogContent data-testid="dialog-confirm-remove-member">
          <AlertDialogHeader>
            <AlertDialogTitle>Remove {removeTarget?.name} from the team?</AlertDialogTitle>
            <AlertDialogDescription>
              They'll lose access to this team immediately and will be notified that they were removed. This can't be undone — they'd need a new invite to come back.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-remove-member">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); handleConfirmRemove(); }}
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
        onOpenChange={(open) => { if (!open) setTransferTarget(null); }}
      >
        <AlertDialogContent data-testid="dialog-confirm-transfer-leader">
          <AlertDialogHeader>
            <AlertDialogTitle>Make {transferTarget?.name} the new team leader?</AlertDialogTitle>
            <AlertDialogDescription>
              {transferTarget?.name} will take over leadership immediately and gain leader-only controls. You'll become a regular member. Both of you will be notified.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-transfer-leader">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); handleConfirmTransfer(); }}
              disabled={transferLeadership.isPending}
              data-testid="button-confirm-transfer-leader"
            >
              {transferLeadership.isPending && <Spinner className="w-4 h-4 mr-2" />}
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
              This permanently removes the team, its invite code, all members, and any draft revenue or order book entries. This cannot be undone. If the team has any submitted or verified entries, the request will be blocked.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete-team">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); handleDeleteTeam(); }}
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
