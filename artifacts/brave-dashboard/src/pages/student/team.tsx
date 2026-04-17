import { useState } from "react";
import { useLocation } from "wouter";
import {
  useGetMyTeam,
  useListMilestones,
  useListTeamInvitations,
  useListTeamJoinRequests,
  useListTeamLeaveRequests,
  useCreateTeamInvitation,
  useApproveJoinRequest,
  useDeclineJoinRequest,
  useApproveLeaveRequest,
  useDeclineLeaveRequest,
  useRequestToLeaveTeam,
  useSearchStudents,
  useGetCurrentAuthUser,
  getGetMyTeamQueryKey,
  getListTeamInvitationsQueryKey,
  getListTeamJoinRequestsQueryKey,
  getListTeamLeaveRequestsQueryKey,
  getGetCurrentAuthUserQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Spinner } from "@/components/ui/spinner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { CalendarDays, Flag, Plus, Users, Copy, Check, UserPlus, LogOut, Mail, Search } from "lucide-react";
import { formatDate } from "@/lib/format";

export default function TeamProfile() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const qc = useQueryClient();
  const { data: meResp } = useGetCurrentAuthUser();
  const me = meResp?.user;
  const { data: team, isLoading: teamLoading, error: teamError } = useGetMyTeam();

  // Hooks always called
  const teamId = team?.id ?? 0;
  const enabledTeam = !!team?.id;
  const enabledLeader = enabledTeam && String(team?.leaderId ?? "") === (me?.id ?? "");
  const { data: milestones, isLoading: milestonesLoading } = useListMilestones({ teamId }, { query: { enabled: enabledTeam } as any });
  const { data: invitations = [] } = useListTeamInvitations(teamId, { query: { enabled: enabledTeam } as any });
  const { data: joinRequests = [] } = useListTeamJoinRequests(teamId, { query: { enabled: enabledTeam } as any });
  const { data: leaveRequests = [] } = useListTeamLeaveRequests(teamId, { query: { enabled: enabledLeader } as any });

  if (teamLoading) return <div className="flex h-64 items-center justify-center"><Spinner className="size-10" /></div>;
  if (!team || teamError) {
    // Redirect to get-started for users without team
    navigate("/get-started");
    return <div className="flex h-64 items-center justify-center"><Spinner className="size-10" /></div>;
  }

  const isLeader = String(team.leaderId ?? "") === (me?.id ?? "");
  const pendingInvites = invitations.filter(i => i.status === "pending");
  const pendingJoinReqs = joinRequests.filter(r => r.status === "pending");
  const pendingLeaveReqs = leaveRequests.filter(r => r.status === "pending");

  const refreshTeam = () => {
    qc.invalidateQueries({ queryKey: getGetMyTeamQueryKey() });
    qc.invalidateQueries({ queryKey: getGetCurrentAuthUserQueryKey() });
    qc.invalidateQueries({ queryKey: getListTeamInvitationsQueryKey(teamId) });
    qc.invalidateQueries({ queryKey: getListTeamJoinRequestsQueryKey(teamId) });
    qc.invalidateQueries({ queryKey: getListTeamLeaveRequestsQueryKey(teamId) });
  };

  return (
    <div className="space-y-6 max-w-6xl mx-auto" data-testid="page-team">
      <div className="flex flex-col md:flex-row gap-6">
        {/* Left column */}
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
              <div className="flex justify-center gap-2 mt-4 flex-wrap">
                <Badge variant="outline" className="capitalize">{team.status}</Badge>
                <Badge variant="secondary">{team.campusName}</Badge>
              </div>
              <InviteCodeBlock code={team.inviteCode ?? null} />
            </CardContent>
          </Card>

          <MembersCard team={team as any} isLeader={isLeader} meId={me?.id ?? null} onChanged={refreshTeam} />
        </div>

        {/* Right column */}
        <div className="w-full md:w-2/3 space-y-6">
          <Tabs defaultValue="manage" className="w-full">
            <TabsList>
              <TabsTrigger value="manage" data-testid="tab-manage">
                Manage
                {(pendingJoinReqs.length + pendingInvites.length + (isLeader ? pendingLeaveReqs.length : 0)) > 0 && (
                  <Badge variant="destructive" className="ml-2 h-5 px-1.5 text-[10px]">
                    {pendingJoinReqs.length + pendingInvites.length + (isLeader ? pendingLeaveReqs.length : 0)}
                  </Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="milestones" data-testid="tab-milestones">Milestones</TabsTrigger>
            </TabsList>

            <TabsContent value="manage" className="space-y-6 mt-4">
              <InvitePeopleCard teamId={team.id} onInvited={refreshTeam} />
              <PendingJoinRequestsCard requests={pendingJoinReqs} onChanged={refreshTeam} />
              <PendingInvitationsCard invitations={pendingInvites} />
              {isLeader && pendingLeaveReqs.length > 0 && (
                <PendingLeaveRequestsCard requests={pendingLeaveReqs} onChanged={refreshTeam} />
              )}
            </TabsContent>

            <TabsContent value="milestones" className="mt-4">
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
                      <p>No milestones yet. Post your first update!</p>
                    </div>
                  ) : (
                    <div className="relative border-l-2 border-muted ml-3 space-y-8 pb-4">
                      {milestones.map((m, i) => (
                        <div key={m.id} className="relative pl-6">
                          <div className="absolute w-3 h-3 bg-primary rounded-full -left-[7.5px] top-1.5 ring-4 ring-background" />
                          <div className="bg-muted/30 p-4 rounded-lg border">
                            <div className="flex items-center justify-between mb-2">
                              <h4 className="font-bold text-foreground">{m.title}</h4>
                              <div className="flex items-center text-xs text-muted-foreground">
                                <CalendarDays className="w-3 h-3 mr-1" />
                                {formatDate(m.date)}
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
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
}

function InviteCodeBlock({ code }: { code: string | null }) {
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);
  if (!code) return null;
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      toast({ title: "Copied", description: "Invite code copied to clipboard." });
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast({ title: "Copy failed", variant: "destructive" });
    }
  };
  return (
    <div className="mt-6 p-3 rounded-md bg-muted/40 border" data-testid="block-invite-code">
      <p className="text-xs text-muted-foreground mb-1">Invite code</p>
      <div className="flex items-center gap-2">
        <code className="font-mono font-bold text-base flex-1 tracking-widest" data-testid="text-invite-code">{code}</code>
        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={copy} data-testid="button-copy-code">
          {copied ? <Check className="w-3 h-3 text-green-600" /> : <Copy className="w-3 h-3" />}
        </Button>
      </div>
    </div>
  );
}

function MembersCard({ team, isLeader, meId, onChanged }: {
  team: { id: number; name: string; leaderId: string; members: Array<{ userId: string; email: string; firstName: string; lastName: string; profileImage: string | null; isLeader: boolean }> };
  isLeader: boolean;
  meId: string | null;
  onChanged: () => void;
}) {
  const { toast } = useToast();
  const requestLeave = useRequestToLeaveTeam();
  const [reason, setReason] = useState("");
  const [open, setOpen] = useState(false);

  const submitLeave = async () => {
    try {
      await requestLeave.mutateAsync({ id: team.id, data: { reason: reason.trim() || undefined } });
      toast({ title: "Leave request sent", description: "Your team leader will review it." });
      setOpen(false);
      setReason("");
      onChanged();
    } catch (e: any) {
      toast({ title: "Could not send request", description: e?.message ?? "Please try again", variant: "destructive" });
    }
  };

  const meIsMember = team.members.some(m => m.userId === meId);
  const meIsLeaderOnly = isLeader; // Leader has separate transfer flow

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center gap-2">
          <Users className="w-4 h-4" />Team Members ({team.members.length})
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {team.members.map(member => (
            <div key={member.userId} className="flex items-center gap-3" data-testid={`member-${member.userId}`}>
              <Avatar>
                <AvatarImage src={member.profileImage || undefined} />
                <AvatarFallback>{(member.firstName?.[0] ?? "?").toUpperCase()}{(member.lastName?.[0] ?? "").toUpperCase()}</AvatarFallback>
              </Avatar>
              <div className="flex-1 overflow-hidden">
                <p className="text-sm font-medium truncate">{member.firstName} {member.lastName}</p>
                <p className="text-xs text-muted-foreground truncate">{member.email}</p>
              </div>
              {member.isLeader && <Badge variant="secondary" className="text-[10px] px-1.5 h-5">Leader</Badge>}
            </div>
          ))}
        </div>
        {meIsMember && !meIsLeaderOnly && (
          <div className="mt-6 pt-4 border-t">
            <AlertDialog open={open} onOpenChange={setOpen}>
              <AlertDialogTrigger asChild>
                <Button variant="outline" size="sm" className="w-full" data-testid="button-request-leave">
                  <LogOut className="w-3 h-3 mr-2" />Request to leave team
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Request to leave the team?</AlertDialogTitle>
                  <AlertDialogDescription>Your team leader must approve this request before you can leave. Add an optional note.</AlertDialogDescription>
                </AlertDialogHeader>
                <Textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Why are you leaving? (optional)" rows={3} data-testid="textarea-leave-reason" />
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={submitLeave} disabled={requestLeave.isPending} data-testid="button-confirm-leave">Send request</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        )}
        {meIsLeaderOnly && (
          <p className="mt-4 text-xs text-muted-foreground border-t pt-3">As leader, you must transfer leadership before leaving the team.</p>
        )}
      </CardContent>
    </Card>
  );
}

function InvitePeopleCard({ teamId, onInvited }: { teamId: number; onInvited: () => void }) {
  const { toast } = useToast();
  const [q, setQ] = useState("");
  const debouncedQ = q.trim();
  const { data: results = [], isLoading } = useSearchStudents(
    { q: debouncedQ },
    { query: { enabled: debouncedQ.length >= 2 } as any }
  );
  const createInv = useCreateTeamInvitation();

  const invite = async (userId: string | null, name: string) => {
    if (!userId) {
      toast({ title: "Cannot invite yet", description: `${name} hasn't logged in yet. Share your invite code with them instead.`, variant: "destructive" });
      return;
    }
    try {
      await createInv.mutateAsync({ id: teamId, data: { inviteeUserId: userId } });
      toast({ title: "Invitation sent", description: `${name} will see it in their dashboard.` });
      onInvited();
    } catch (e: any) {
      toast({ title: "Could not invite", description: e?.message ?? "Please try again", variant: "destructive" });
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base"><UserPlus className="w-4 h-4" />Invite teammates</CardTitle>
        <CardDescription>Search by name or NIAT ID. Only students from your campus appear.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Type at least 2 characters..." className="pl-9" data-testid="input-search-students" />
        </div>
        {debouncedQ.length >= 2 && (
          <div className="border rounded-md divide-y max-h-64 overflow-auto">
            {isLoading ? (
              <div className="p-4 flex justify-center"><Spinner /></div>
            ) : results.length === 0 ? (
              <p className="p-4 text-sm text-muted-foreground text-center">No matching students available</p>
            ) : (
              results.map((r) => (
                <div key={r.rosterId} className="p-3 flex items-center justify-between gap-2" data-testid={`search-result-${r.rosterId}`}>
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{r.fullName}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      {r.niatId ?? "—"} · {r.batchSectionName ?? ""}
                      {!r.hasAccount && " · Hasn't logged in yet"}
                    </p>
                  </div>
                  <Button size="sm" variant="outline" disabled={!r.hasAccount || createInv.isPending} onClick={() => invite(r.userId ?? null, r.fullName)} data-testid={`button-invite-${r.rosterId}`}>
                    <Mail className="w-3 h-3 mr-1.5" />Invite
                  </Button>
                </div>
              ))
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function PendingJoinRequestsCard({ requests, onChanged }: { requests: any[]; onChanged: () => void }) {
  const { toast } = useToast();
  const approve = useApproveJoinRequest();
  const decline = useDeclineJoinRequest();
  if (requests.length === 0) return null;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Join requests ({requests.length})</CardTitle>
        <CardDescription>Students asking to join your team.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {requests.map((r) => (
          <div key={r.id} className="p-3 border rounded-md" data-testid={`join-request-${r.id}`}>
            <div className="flex justify-between items-start gap-2">
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm">{r.requesterName}</p>
                {r.message && <p className="text-sm text-muted-foreground mt-1 italic">"{r.message}"</p>}
              </div>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" disabled={decline.isPending} data-testid={`button-decline-jr-${r.id}`}
                  onClick={async () => {
                    try {
                      await decline.mutateAsync({ id: r.id });
                      onChanged();
                    } catch (e: any) { toast({ title: "Failed", description: e?.message, variant: "destructive" }); }
                  }}>Decline</Button>
                <Button size="sm" disabled={approve.isPending} data-testid={`button-approve-jr-${r.id}`}
                  onClick={async () => {
                    try {
                      await approve.mutateAsync({ id: r.id });
                      toast({ title: "Member added", description: `${r.requesterName} has joined the team.` });
                      onChanged();
                    } catch (e: any) { toast({ title: "Failed", description: e?.message, variant: "destructive" }); }
                  }}>Approve</Button>
              </div>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function PendingInvitationsCard({ invitations }: { invitations: any[] }) {
  if (invitations.length === 0) return null;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Sent invitations ({invitations.length})</CardTitle>
        <CardDescription>Awaiting a response.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {invitations.map((inv) => (
          <div key={inv.id} className="flex items-center justify-between text-sm p-2 border rounded-md" data-testid={`sent-invitation-${inv.id}`}>
            <div>
              <p className="font-medium">{inv.inviteeName}</p>
              <p className="text-xs text-muted-foreground">Invited by {inv.inviterName}</p>
            </div>
            <Badge variant="secondary">Pending</Badge>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function PendingLeaveRequestsCard({ requests, onChanged }: { requests: any[]; onChanged: () => void }) {
  const { toast } = useToast();
  const approve = useApproveLeaveRequest();
  const decline = useDeclineLeaveRequest();
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Leave requests ({requests.length})</CardTitle>
        <CardDescription>Members asking to leave the team.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {requests.map((r) => (
          <div key={r.id} className="p-3 border rounded-md" data-testid={`leave-request-${r.id}`}>
            <div className="flex justify-between items-start gap-2">
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm">{r.memberName}</p>
                {r.reason && <p className="text-sm text-muted-foreground mt-1 italic">"{r.reason}"</p>}
              </div>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" disabled={decline.isPending} data-testid={`button-decline-lr-${r.id}`}
                  onClick={async () => {
                    try { await decline.mutateAsync({ id: r.id }); onChanged(); }
                    catch (e: any) { toast({ title: "Failed", description: e?.message, variant: "destructive" }); }
                  }}>Decline</Button>
                <Button size="sm" variant="destructive" disabled={approve.isPending} data-testid={`button-approve-lr-${r.id}`}
                  onClick={async () => {
                    try {
                      await approve.mutateAsync({ id: r.id });
                      toast({ title: "Member removed" });
                      onChanged();
                    } catch (e: any) { toast({ title: "Failed", description: e?.message, variant: "destructive" }); }
                  }}>Approve removal</Button>
              </div>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
