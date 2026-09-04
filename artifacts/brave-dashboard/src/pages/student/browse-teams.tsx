import { Link } from "wouter";
import {
  useBrowseCampusTeams,
  useRequestToJoinTeam,
  useGetMyTeam,
  getGetMyTeamQueryKey,
} from "@workspace/api-client-react";
import type { Team } from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import { ArrowLeft, Users } from "lucide-react";
import { resolveStoredObjectUrl } from "@/lib/storage-url";

const TEAM_MAX_MEMBERS = 5;
import { useToast } from "@/hooks/use-toast";
import { useState } from "react";
import { Textarea } from "@/components/ui/textarea";

export default function BrowseTeams() {
  const { data: teams, isLoading } = useBrowseCampusTeams();
  const { data: myTeam } = useGetMyTeam({
    query: { queryKey: getGetMyTeamQueryKey(), retry: false },
  });
  const requestJoin = useRequestToJoinTeam();
  const { toast } = useToast();
  const [openId, setOpenId] = useState<number | null>(null);
  const [message, setMessage] = useState("");
  const [requested, setRequested] = useState<Set<number>>(new Set());

  if (isLoading)
    return (
      <div className="flex h-64 items-center justify-center">
        <Spinner size="lg" />
      </div>
    );

  const handleRequest = (team: Team) => {
    requestJoin.mutate(
      { id: team.id, data: { message: message.trim() || undefined } },
      {
        onSuccess: () => {
          toast({
            title: "Request sent",
            description: `Members of ${team.name} will review your request.`,
          });
          setRequested((prev) => new Set([...prev, team.id]));
          setOpenId(null);
          setMessage("");
        },
        onError: (err: unknown) => {
          toast({
            title: "Could not send request",
            description: (err as { message?: string })?.message ?? "Try again.",
            variant: "destructive",
          });
        },
      },
    );
  };

  return (
    <div className="max-w-4xl mx-auto space-y-4">
      <Link href={myTeam ? "/team" : "/get-started"}>
        <Button variant="ghost" size="sm" data-testid="button-back">
          <ArrowLeft className="w-4 h-4 mr-1" /> Back
        </Button>
      </Link>
      <div className="mobile-page-heading">
        <h1 className="text-3xl font-bold tracking-tight">
          Browse campus teams
        </h1>
        <p className="text-muted-foreground mt-1">
          Teams currently active at your campus.
        </p>
      </div>

      {!teams || teams.length === 0 ? (
        <div className="text-center py-16 bg-card border rounded-xl border-dashed">
          <Users className="w-10 h-10 text-muted-foreground mx-auto mb-3 opacity-50" />
          <p className="text-muted-foreground">
            No teams found at your campus yet.
          </p>
        </div>
      ) : (
        <div className="grid gap-3">
          {teams.map((t) => {
            const isMine = myTeam?.id === t.id;
            const alreadyRequested = requested.has(t.id);
            const isFull = t.memberCount >= TEAM_MAX_MEMBERS;
            return (
              <Card key={t.id} data-testid={`team-${t.id}`}>
                <CardContent className="p-4">
                  <div className="flex items-center gap-4">
                    {t.photoUrl ? (
                      <img
                        src={resolveStoredObjectUrl(t.photoUrl)}
                        alt={t.name}
                        className="w-12 h-12 rounded-lg object-cover"
                      />
                    ) : (
                      <div className="w-12 h-12 rounded-lg bg-primary/10 text-primary flex items-center justify-center font-bold">
                        {t.name.slice(0, 2).toUpperCase()}
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-semibold truncate">{t.name}</p>
                        <Badge
                          variant="outline"
                          className="capitalize text-[10px]"
                        >
                          {t.status}
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground truncate">
                        {t.tagline || "No tagline"}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        Led by {t.leaderName} • {t.memberCount} member
                        {t.memberCount === 1 ? "" : "s"}
                      </p>
                    </div>
                    {isMine ? (
                      <Badge>Your team</Badge>
                    ) : myTeam ? (
                      <Badge variant="outline">Already on a team</Badge>
                    ) : isFull ? (
                      <Badge
                        variant="outline"
                        className="border-muted-foreground/30 text-muted-foreground"
                        data-testid={`badge-team-full-${t.id}`}
                      >
                        Team is full ({t.memberCount}/{TEAM_MAX_MEMBERS})
                      </Badge>
                    ) : alreadyRequested ? (
                      <Badge variant="secondary">Requested</Badge>
                    ) : openId === t.id ? null : (
                      <Button
                        size="sm"
                        onClick={() => setOpenId(t.id)}
                        data-testid={`button-request-${t.id}`}
                      >
                        Request to join
                      </Button>
                    )}
                  </div>
                  {openId === t.id && !myTeam && !isFull && (
                    <div className="mt-4 space-y-3 border-t pt-4">
                      <Textarea
                        placeholder="Optional message to the team…"
                        value={message}
                        onChange={(e) => setMessage(e.target.value)}
                        rows={3}
                        data-testid={`input-message-${t.id}`}
                      />
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          onClick={() => handleRequest(t)}
                          disabled={requestJoin.isPending}
                          data-testid={`button-submit-request-${t.id}`}
                        >
                          {requestJoin.isPending ? (
                            <Spinner className="mr-2 size-4" />
                          ) : null}
                          Send request
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setOpenId(null);
                            setMessage("");
                          }}
                        >
                          Cancel
                        </Button>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
