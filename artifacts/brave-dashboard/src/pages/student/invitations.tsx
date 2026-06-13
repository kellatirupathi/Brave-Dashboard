import {
  useListMyInvitations,
  useAcceptInvitation,
  useDeclineInvitation,
  getListMyInvitationsQueryKey,
  getGetMyTeamQueryKey,
} from "@workspace/api-client-react";
import type { TeamInvitation } from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Spinner } from "@/components/ui/spinner";
import { Mail, Check, X } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";
import { formatDate } from "@/lib/format";

export default function Invitations() {
  const { data: invitations, isLoading } = useListMyInvitations();
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const accept = useAcceptInvitation();
  const decline = useDeclineInvitation();

  if (isLoading)
    return (
      <div className="flex h-64 items-center justify-center">
        <Spinner size="lg" />
      </div>
    );

  const pending = invitations?.filter((i) => i.status === "pending") ?? [];
  const past = invitations?.filter((i) => i.status !== "pending") ?? [];

  const onAccept = (inv: TeamInvitation) => {
    accept.mutate(
      { id: inv.id },
      {
        onSuccess: (res) => {
          // Accepting auto-approves unless gated; the server signals which via
          // `status` ("applied" = joined now, "pending_approval" = needs admin).
          const r = res as { status?: string; message?: string } | undefined;
          const applied = r?.status === "applied";
          toast({
            title: applied ? "Joined team" : "Awaiting admin approval",
            description:
              r?.message ??
              (applied
                ? `You've joined ${inv.teamName}.`
                : `Your request to join ${inv.teamName} has been sent for admin approval.`),
          });
          queryClient.invalidateQueries({
            queryKey: getListMyInvitationsQueryKey(),
          });
          queryClient.invalidateQueries({ queryKey: getGetMyTeamQueryKey() });
        },
        onError: (err: unknown) => {
          const e = err as { data?: { error?: string }; message?: string };
          toast({
            title: "Could not accept",
            description: e?.data?.error ?? e?.message ?? "Try again.",
            variant: "destructive",
          });
        },
      },
    );
  };

  const onDecline = (inv: TeamInvitation) => {
    decline.mutate(
      { id: inv.id },
      {
        onSuccess: () => {
          toast({ title: "Invitation declined" });
          queryClient.invalidateQueries({
            queryKey: getListMyInvitationsQueryKey(),
          });
        },
        onError: (err: unknown) => {
          toast({
            title: "Could not decline",
            description: (err as { message?: string })?.message ?? "Try again.",
            variant: "destructive",
          });
        },
      },
    );
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Team invitations</h1>
        <p className="text-muted-foreground mt-1">
          Accept an invitation to join a team. Accepting one cancels any other
          pending invitations.
        </p>
      </div>

      <section>
        <h2 className="text-lg font-semibold mb-3">Pending</h2>
        {pending.length === 0 ? (
          <div className="text-center py-12 bg-card border rounded-xl border-dashed">
            <Mail className="w-10 h-10 text-muted-foreground mx-auto mb-3 opacity-50" />
            <p className="text-muted-foreground">No pending invitations.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {pending.map((inv) => (
              <Card key={inv.id} data-testid={`invitation-${inv.id}`}>
                <CardContent className="p-4 flex items-center gap-4">
                  <Avatar>
                    <AvatarImage src={inv.teamPhotoUrl ?? undefined} />
                    <AvatarFallback>
                      {inv.teamName.slice(0, 2).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1">
                    <p className="font-semibold">{inv.teamName}</p>
                    <p className="text-sm text-muted-foreground">
                      Invited by {inv.inviterName} • {formatDate(inv.createdAt)}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    onClick={() => onAccept(inv)}
                    disabled={accept.isPending}
                    data-testid={`button-accept-${inv.id}`}
                  >
                    <Check className="w-4 h-4 mr-1" /> Accept
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => onDecline(inv)}
                    disabled={decline.isPending}
                    data-testid={`button-decline-${inv.id}`}
                  >
                    <X className="w-4 h-4 mr-1" /> Decline
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </section>

      {past.length > 0 && (
        <section>
          <h2 className="text-lg font-semibold mb-3">History</h2>
          <div className="space-y-2">
            {past.map((inv) => (
              <Card key={inv.id} className="opacity-75">
                <CardContent className="p-3 flex items-center gap-3">
                  <Avatar className="w-8 h-8">
                    <AvatarImage src={inv.teamPhotoUrl ?? undefined} />
                    <AvatarFallback>
                      {inv.teamName.slice(0, 2).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1">
                    <p className="text-sm font-medium">{inv.teamName}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatDate(inv.createdAt)}
                    </p>
                  </div>
                  <Badge variant="outline" className="capitalize">
                    {inv.status}
                  </Badge>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
