import { useState } from "react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@workspace/replit-auth-web";
import {
  useGetMyTeam,
  useCreateTeam,
  useListMyInvitations,
  useListCampuses,
  getGetMyTeamQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { invalidateMembershipQueries } from "@/lib/queries";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Plus, KeyRound, Search, ArrowRight, Mail } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { SupportBanner } from "@/components/support-banner";
import { PendingMembershipBanner } from "@/components/pending-membership-banner";

export default function GetStarted() {
  const { user, refresh: refreshAuth } = useAuth();
  const [, setLocation] = useLocation();
  const { data: team, isLoading: teamLoading } = useGetMyTeam({
    query: { queryKey: getGetMyTeamQueryKey(), retry: false },
  });
  const { data: invitations } = useListMyInvitations();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const createTeam = useCreateTeam();
  const { data: campuses, isLoading: campusesLoading } = useListCampuses();
  const [name, setName] = useState("");
  const [tagline, setTagline] = useState("");
  const [campusId, setCampusId] = useState<string>("");
  const [showCreate, setShowCreate] = useState(false);
  const [fullName, setFullName] = useState("");
  const [emailInput, setEmailInput] = useState("");
  const [niatIdInput, setNiatIdInput] = useState("");

  // Detect missing profile bits so we can prompt for them inline. We treat the
  // synthetic "<sub>@replit.user" placeholder address from SSO as "missing".
  const missingFullName = !user?.firstName?.trim() || !user?.lastName?.trim();
  const missingEmail =
    !user?.email?.trim() || user.email.endsWith("@replit.user");
  const missingNiat = !user?.niatId?.trim();
  const needsProfileCapture = missingFullName || missingEmail || missingNiat;

  if (teamLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }
  if (team) {
    setLocation("/team");
    return null;
  }

  const pendingInvitations =
    invitations?.filter((i) => i.status === "pending") ?? [];

  const effectiveCampusId =
    user?.campusId ?? (campusId ? Number(campusId) : undefined);
  const needsCampusPick = !user?.campusId;

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    if (!effectiveCampusId) {
      toast({
        title: "Choose a campus",
        description: "Pick the campus your team belongs to.",
        variant: "destructive",
      });
      return;
    }
    if (missingFullName && !fullName.trim()) {
      toast({
        title: "Tell us your full name",
        description: "We need your full name before we create your team.",
        variant: "destructive",
      });
      return;
    }
    if (missingEmail && !emailInput.trim()) {
      toast({
        title: "Add your email",
        description: "We need an email address for your account.",
        variant: "destructive",
      });
      return;
    }
    if (missingNiat && !niatIdInput.trim()) {
      toast({
        title: "Add your NIAT ID",
        description: "Your NIAT ID links your account to your campus records.",
        variant: "destructive",
      });
      return;
    }
    createTeam.mutate(
      {
        data: {
          name: name.trim(),
          tagline: tagline.trim() || undefined,
          campusId: effectiveCampusId,
          ...(missingFullName && fullName.trim()
            ? { fullName: fullName.trim() }
            : {}),
          ...(missingEmail && emailInput.trim()
            ? { email: emailInput.trim() }
            : {}),
          ...(missingNiat && niatIdInput.trim()
            ? { niatId: niatIdInput.trim() }
            : {}),
        },
      },
      {
        onSuccess: async (created) => {
          toast({
            title: "Team created",
            description: "Share your invite code with teammates.",
          });
          // Refresh the auth user so the sidebar (which depends on user.teamId)
          // shows the full student nav (Dashboard, Projects, Leaderboard,
          // My Team, Demo Day) immediately — no page reload needed.
          await refreshAuth();
          invalidateMembershipQueries(queryClient, {
            teamId: created?.id ?? null,
          });
          setLocation("/team");
        },
        onError: (err: unknown) => {
          const msg =
            (err as { message?: string })?.message ?? "Failed to create team";
          toast({
            title: "Could not create team",
            description: msg,
            variant: "destructive",
          });
        },
      },
    );
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">
          Get started with a team
        </h1>
        <p className="text-muted-foreground mt-1">
          You aren't on a team yet. Create one, join with a code, or browse
          teams at your campus.
        </p>
      </div>
      <PendingMembershipBanner />

      {pendingInvitations.length > 0 && (
        <Card
          className="border-primary/40 bg-primary/5"
          data-testid="card-pending-invitations"
        >
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Mail className="w-5 h-5" /> You have{" "}
                {pendingInvitations.length} team invitation
                {pendingInvitations.length === 1 ? "" : "s"}
              </CardTitle>
              <CardDescription>
                Review and respond to invitations from other teams.
              </CardDescription>
            </div>
            <Link href="/invitations">
              <Button data-testid="button-view-invitations">
                View invitations <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            </Link>
          </CardHeader>
        </Card>
      )}

      <div className="grid gap-4 md:grid-cols-3">
        <Card
          className="cursor-pointer hover:border-primary/50 transition"
          onClick={() => setShowCreate((v) => !v)}
          data-testid="card-create-team"
        >
          <CardHeader>
            <div className="w-10 h-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
              <Plus className="w-5 h-5" />
            </div>
            <CardTitle className="mt-3">Create a team</CardTitle>
            <CardDescription>
              Start a brand-new team and become its leader.
            </CardDescription>
          </CardHeader>
        </Card>

        <Link href="/join">
          <Card
            className="cursor-pointer hover:border-primary/50 transition h-full"
            data-testid="card-join-by-code"
          >
            <CardHeader>
              <div className="w-10 h-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
                <KeyRound className="w-5 h-5" />
              </div>
              <CardTitle className="mt-3">Join with a code</CardTitle>
              <CardDescription>
                Enter an invite code shared by a team member.
              </CardDescription>
            </CardHeader>
          </Card>
        </Link>

        <Link href="/browse-teams">
          <Card
            className="cursor-pointer hover:border-primary/50 transition h-full"
            data-testid="card-browse-teams"
          >
            <CardHeader>
              <div className="w-10 h-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
                <Search className="w-5 h-5" />
              </div>
              <CardTitle className="mt-3">Browse campus teams</CardTitle>
              <CardDescription>
                See teams at your campus and request to join.
              </CardDescription>
            </CardHeader>
          </Card>
        </Link>
      </div>

      {showCreate && (
        <Card data-testid="card-create-form">
          <CardHeader>
            <CardTitle>Create your team</CardTitle>
            <CardDescription>
              You'll be the team leader. Share the invite code with teammates
              afterwards.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleCreate} className="space-y-4 max-w-2xl">
              {needsCampusPick ? (
                <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
                  <div className="space-y-2 md:col-span-2">
                    <Label htmlFor="team-name">Team name</Label>
                    <Input
                      id="team-name"
                      data-testid="input-team-name"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      maxLength={60}
                      required
                    />
                  </div>
                  <div className="space-y-2 md:col-span-3">
                    <Label htmlFor="team-campus">Campus</Label>
                    <Select value={campusId} onValueChange={setCampusId}>
                      <SelectTrigger
                        id="team-campus"
                        data-testid="select-team-campus"
                        className="w-full"
                      >
                        <SelectValue
                          placeholder={
                            campusesLoading
                              ? "Loading campuses…"
                              : "Select your campus"
                          }
                        />
                      </SelectTrigger>
                      <SelectContent
                        style={{ maxHeight: "18rem" }}
                        className="overflow-y-auto"
                      >
                        {(campuses ?? []).map((c) => (
                          <SelectItem
                            key={c.id}
                            value={String(c.id)}
                            data-testid={`option-campus-${c.id}`}
                          >
                            {c.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">
                      We'll save this campus to your profile so future teammates
                      show up correctly.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="space-y-2 max-w-md">
                  <Label htmlFor="team-name">Team name</Label>
                  <Input
                    id="team-name"
                    data-testid="input-team-name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    maxLength={60}
                    required
                  />
                </div>
              )}
              <div className="space-y-2">
                <Label htmlFor="team-tagline">Tagline (optional)</Label>
                <Textarea
                  id="team-tagline"
                  data-testid="input-team-tagline"
                  value={tagline}
                  onChange={(e) => setTagline(e.target.value)}
                  maxLength={120}
                  rows={2}
                />
              </div>
              {needsProfileCapture && (
                <div className="space-y-4 rounded-md border bg-muted/30 p-4">
                  <div>
                    <p className="text-sm font-medium">Confirm your details</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      We need a few extra details to set up your account. These
                      will be saved to your profile.
                    </p>
                  </div>
                  {missingFullName && (
                    <div className="space-y-2">
                      <Label htmlFor="profile-fullname">Full name</Label>
                      <Input
                        id="profile-fullname"
                        data-testid="input-profile-fullname"
                        value={fullName}
                        onChange={(e) => setFullName(e.target.value)}
                        maxLength={120}
                        placeholder="e.g. Aanya Sharma"
                        required
                      />
                    </div>
                  )}
                  {missingEmail && (
                    <div className="space-y-2">
                      <Label htmlFor="profile-email-input">Email</Label>
                      <Input
                        id="profile-email-input"
                        type="email"
                        data-testid="input-profile-email"
                        value={emailInput}
                        onChange={(e) => setEmailInput(e.target.value)}
                        maxLength={200}
                        placeholder="you@niat.tech"
                        required
                      />
                    </div>
                  )}
                  {missingNiat && (
                    <div className="space-y-2">
                      <Label htmlFor="profile-niat-input">NIAT ID</Label>
                      <Input
                        id="profile-niat-input"
                        data-testid="input-profile-niatid"
                        value={niatIdInput}
                        onChange={(e) => setNiatIdInput(e.target.value)}
                        maxLength={40}
                        placeholder="e.g. NIAT-12345"
                        required
                      />
                    </div>
                  )}
                </div>
              )}
              <Button
                type="submit"
                disabled={
                  createTeam.isPending || !name.trim() || !effectiveCampusId
                }
                data-testid="button-submit-create"
              >
                {createTeam.isPending ? (
                  <Spinner className="mr-2 size-4" />
                ) : null}
                Create team
              </Button>
            </form>
          </CardContent>
        </Card>
      )}

      <Avatar className="hidden">
        <AvatarImage src="" />
        <AvatarFallback>?</AvatarFallback>
      </Avatar>
      <Badge className="hidden">x</Badge>

      <SupportBanner />
    </div>
  );
}
