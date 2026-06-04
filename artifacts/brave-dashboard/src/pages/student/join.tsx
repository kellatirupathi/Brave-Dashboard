import { useState } from "react";
import { useLocation, Link } from "wouter";
import { useJoinTeamByCode } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@workspace/replit-auth-web";
import { invalidateMembershipQueries } from "@/lib/queries";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { ArrowLeft, KeyRound } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export default function JoinByCode() {
  const [code, setCode] = useState("");
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const { refresh: refreshAuth } = useAuth();
  const { toast } = useToast();
  const join = useJoinTeamByCode();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // Bug 2 fix: trim + uppercase before sending. The input already uppercases
    // on change, but a paste with whitespace would otherwise slip through.
    const trimmed = code.trim().toUpperCase();
    if (!trimmed) return;
    join.mutate({ data: { code: trimmed } }, {
      onSuccess: async (res) => {
        // The server now gates joins behind admin approval: it returns a
        // pending-approval payload instead of the joined team.
        const message =
          (res as { message?: string } | undefined)?.message ??
          "Your request to join has been sent for admin approval.";
        toast({ title: "Awaiting admin approval", description: message });
        await refreshAuth();
        invalidateMembershipQueries(queryClient);
        setLocation("/get-started");
      },
      onError: (err: unknown) => {
        const e = err as {
          status?: number;
          data?: { error?: string };
          message?: string;
        };
        toast({
          title: "Could not join team",
          description: e?.data?.error ?? e?.message ?? "Check your code and try again.",
          variant: "destructive",
        });
      },
    });
  };

  return (
    <div className="max-w-md mx-auto space-y-4">
      <Link href="/get-started">
        <Button variant="ghost" size="sm" data-testid="button-back"><ArrowLeft className="w-4 h-4 mr-1" /> Back</Button>
      </Link>
      <Card>
        <CardHeader>
          <div className="w-10 h-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center"><KeyRound className="w-5 h-5" /></div>
          <CardTitle className="mt-3">Join a team with an invite code</CardTitle>
          <CardDescription>Enter the code shared by a member of the team. Codes are 8 characters and case-insensitive.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="invite-code">Invite code</Label>
              <Input
                id="invite-code"
                data-testid="input-invite-code"
                placeholder="e.g. AB3K9PQR"
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                maxLength={16}
                autoComplete="off"
                className="font-mono tracking-widest text-lg uppercase"
              />
            </div>
            <Button type="submit" disabled={join.isPending || !code.trim()} className="w-full" data-testid="button-submit-join">
              {join.isPending ? <Spinner className="mr-2 size-4" /> : null}
              Join team
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
