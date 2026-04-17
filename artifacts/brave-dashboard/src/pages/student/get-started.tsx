import { useState } from "react";
import {
  useBrowseTeams,
  useJoinByCode,
  useListMyInvitations,
  useListMyJoinRequests,
  useAcceptInvitation,
  useDeclineInvitation,
  useRequestToJoinTeam,
  useCreateTeam,
  useGetCurrentAuthUser,
  getGetMyTeamQueryKey,
  getListMyInvitationsQueryKey,
  getListMyJoinRequestsQueryKey,
  getBrowseTeamsQueryKey,
  getGetCurrentAuthUserQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Plus, Users, KeyRound, Search, Mail, Send, Hourglass } from "lucide-react";

export default function GetStarted() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const { data: meResp } = useGetCurrentAuthUser();
  const me = meResp?.user;
  const { data: invitations = [], isLoading: invLoading } = useListMyInvitations();
  const { data: outgoingRequests = [], isLoading: orLoading } = useListMyJoinRequests();

  const acceptInv = useAcceptInvitation();
  const declineInv = useDeclineInvitation();
  const joinByCode = useJoinByCode();

  const [code, setCode] = useState("");

  const refreshAll = () => {
    qc.invalidateQueries({ queryKey: getGetMyTeamQueryKey() });
    qc.invalidateQueries({ queryKey: getGetCurrentAuthUserQueryKey() });
    qc.invalidateQueries({ queryKey: getListMyInvitationsQueryKey() });
    qc.invalidateQueries({ queryKey: getListMyJoinRequestsQueryKey() });
    qc.invalidateQueries({ queryKey: getBrowseTeamsQueryKey() });
  };

  const handleAccept = async (id: number) => {
    try {
      await acceptInv.mutateAsync({ id });
      toast({ title: "Joined team", description: "Welcome to your new team." });
      // Hard reload so the auth context picks up the new teamId
      window.location.assign("/team");
    } catch (e: any) {
      toast({ title: "Could not accept", description: e?.message ?? "Please try again", variant: "destructive" });
    }
  };
  const handleDecline = async (id: number) => {
    try {
      await declineInv.mutateAsync({ id });
      refreshAll();
    } catch (e: any) {
      toast({ title: "Could not decline", description: e?.message ?? "Please try again", variant: "destructive" });
    }
  };
  const handleJoinByCode = async () => {
    const c = code.trim().toUpperCase();
    if (!c) return;
    try {
      await joinByCode.mutateAsync({ data: { code: c } });
      toast({ title: "Joined team", description: "You're in." });
      window.location.assign("/team");
    } catch (e: any) {
      toast({ title: "Invalid code", description: e?.message ?? "Check the code and try again", variant: "destructive" });
    }
  };

  return (
    <div className="space-y-8 max-w-5xl mx-auto" data-testid="page-get-started">
      <div>
        <h1 className="text-3xl font-bold">Get started with your team</h1>
        <p className="text-muted-foreground mt-2">
          Welcome to BRAVE{me?.firstName ? `, ${me.firstName}` : ""}. Form a team with your campus mates to start your 3-month entrepreneurship journey.
        </p>
      </div>

      {/* Pending invitations callout */}
      {!invLoading && invitations.length > 0 && (
        <Card className="border-primary/40 bg-primary/5">
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Mail className="w-5 h-5 text-primary" /> You have {invitations.length} team invitation{invitations.length > 1 ? "s" : ""}</CardTitle>
            <CardDescription>Accept one to join the team. Accepting one will automatically decline your other pending invitations.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {invitations.map((inv) => (
              <div key={inv.id} className="flex items-center justify-between p-3 rounded-md border bg-background">
                <div>
                  <p className="font-medium">{inv.teamName}</p>
                  <p className="text-xs text-muted-foreground">Invited by {inv.inviterName}</p>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => handleDecline(inv.id)} disabled={declineInv.isPending} data-testid={`button-decline-${inv.id}`}>Decline</Button>
                  <Button size="sm" onClick={() => handleAccept(inv.id)} disabled={acceptInv.isPending} data-testid={`button-accept-${inv.id}`}>Accept</Button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <Tabs defaultValue="create" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="create" data-testid="tab-create"><Plus className="w-4 h-4 mr-2" />Create a team</TabsTrigger>
          <TabsTrigger value="browse" data-testid="tab-browse"><Users className="w-4 h-4 mr-2" />Browse teams</TabsTrigger>
          <TabsTrigger value="code" data-testid="tab-code"><KeyRound className="w-4 h-4 mr-2" />Join by code</TabsTrigger>
        </TabsList>

        <TabsContent value="create" className="mt-6">
          <CreateTeamForm onCreated={refreshAll} />
        </TabsContent>

        <TabsContent value="browse" className="mt-6">
          <BrowseTeamsList outgoingRequests={outgoingRequests.filter(r => r.status === "pending")} onChanged={refreshAll} />
        </TabsContent>

        <TabsContent value="code" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Join by invite code</CardTitle>
              <CardDescription>Enter the BRAVE-XXXXX code shared by a team member.</CardDescription>
            </CardHeader>
            <CardContent className="flex gap-2 max-w-md">
              <Input
                placeholder="BRAVE-XXXXX"
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                className="font-mono uppercase tracking-widest"
                data-testid="input-invite-code"
              />
              <Button onClick={handleJoinByCode} disabled={joinByCode.isPending || !code.trim()} data-testid="button-join-by-code">Join</Button>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Outgoing pending join requests */}
      {!orLoading && outgoingRequests.filter(r => r.status === "pending").length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base"><Hourglass className="w-4 h-4" />Pending join requests you sent</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {outgoingRequests.filter(r => r.status === "pending").map(r => (
              <div key={r.id} className="flex items-center justify-between text-sm">
                <span>{r.teamName}</span>
                <Badge variant="secondary">Awaiting team approval</Badge>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function CreateTeamForm({ onCreated }: { onCreated: () => void }) {
  const { toast } = useToast();
  const { data: meResp } = useGetCurrentAuthUser();
  const me = meResp?.user;
  const createTeam = useCreateTeam();
  const [name, setName] = useState("");
  const [tagline, setTagline] = useState("");

  const submit = async () => {
    if (!name.trim()) {
      toast({ title: "Team name is required", variant: "destructive" });
      return;
    }
    if (!me?.campusId) {
      toast({ title: "No campus assigned", description: "Contact your coordinator to fix your roster entry.", variant: "destructive" });
      return;
    }
    try {
      await createTeam.mutateAsync({
        data: {
          name: name.trim(),
          tagline: tagline.trim() || undefined,
          campusId: me.campusId,
          memberEmails: [],
        },
      });
      toast({ title: "Team created", description: "Share your invite code to bring on teammates." });
      // Hard reload so auth context picks up the new teamId before nav re-renders
      window.location.assign("/team");
    } catch (e: any) {
      toast({ title: "Could not create team", description: e?.message ?? "Please try again", variant: "destructive" });
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Start a new team</CardTitle>
        <CardDescription>You will become the team leader. After creating, share your invite code or accept join requests.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 max-w-xl">
        <div className="space-y-2">
          <label className="text-sm font-medium">Team name *</label>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g., Innovators Hub" data-testid="input-team-name" />
        </div>
        <div className="space-y-2">
          <label className="text-sm font-medium">Tagline (optional)</label>
          <Input value={tagline} onChange={(e) => setTagline(e.target.value)} placeholder="What does your team do?" data-testid="input-team-tagline" />
        </div>
        <Button onClick={submit} disabled={createTeam.isPending} data-testid="button-create-team">
          <Plus className="w-4 h-4 mr-2" />Create my team
        </Button>
      </CardContent>
    </Card>
  );
}

function BrowseTeamsList({ outgoingRequests, onChanged }: { outgoingRequests: { id: number; teamId: number }[]; onChanged: () => void }) {
  const { toast } = useToast();
  const { data: teams = [], isLoading } = useBrowseTeams();
  const requestJoin = useRequestToJoinTeam();
  const [openId, setOpenId] = useState<number | null>(null);
  const [message, setMessage] = useState("");

  const pendingTeamIds = new Set(outgoingRequests.map(r => r.teamId));

  const submit = async () => {
    if (openId == null) return;
    try {
      await requestJoin.mutateAsync({ id: openId, data: { message: message.trim() || undefined } });
      toast({ title: "Request sent", description: "The team will be notified." });
      setOpenId(null);
      setMessage("");
      onChanged();
    } catch (e: any) {
      toast({ title: "Could not send request", description: e?.message ?? "Please try again", variant: "destructive" });
    }
  };

  if (isLoading) return <div className="flex justify-center py-12"><Spinner /></div>;

  if (teams.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-muted-foreground">
          <Users className="w-8 h-8 mx-auto mb-3 opacity-50" />
          <p>No teams have been created at your campus yet. Be the first!</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <div className="grid gap-3 md:grid-cols-2">
        {teams.map((team) => {
          const requested = pendingTeamIds.has(team.id);
          return (
            <Card key={team.id} data-testid={`card-team-${team.id}`}>
              <CardContent className="pt-6">
                <div className="flex gap-4 items-start">
                  {team.photoUrl ? (
                    <img src={team.photoUrl} alt={team.name} className="w-14 h-14 rounded-full object-cover" />
                  ) : (
                    <div className="w-14 h-14 rounded-full bg-primary/10 text-primary flex items-center justify-center text-lg font-bold flex-shrink-0">
                      {team.name.substring(0, 2).toUpperCase()}
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold truncate">{team.name}</p>
                    {team.tagline && <p className="text-sm text-muted-foreground line-clamp-2">{team.tagline}</p>}
                    <div className="flex gap-2 mt-2">
                      <Badge variant="outline" className="text-[10px]">{team.memberCount} members</Badge>
                      <Badge variant="secondary" className="text-[10px] capitalize">{team.status}</Badge>
                    </div>
                  </div>
                </div>
                <div className="mt-4 flex justify-end">
                  {requested ? (
                    <Button size="sm" variant="outline" disabled>Request sent</Button>
                  ) : (
                    <Button size="sm" onClick={() => setOpenId(team.id)} data-testid={`button-request-join-${team.id}`}>
                      <Send className="w-3 h-3 mr-2" />Request to join
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
      <Dialog open={openId != null} onOpenChange={(o) => { if (!o) { setOpenId(null); setMessage(""); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Request to join</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">Send a short note (optional) to the team.</p>
          <Textarea value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Hi, I'd love to join your team because..." rows={4} data-testid="textarea-join-message" />
          <DialogFooter>
            <Button variant="outline" onClick={() => { setOpenId(null); setMessage(""); }}>Cancel</Button>
            <Button onClick={submit} disabled={requestJoin.isPending} data-testid="button-submit-join">Send request</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
