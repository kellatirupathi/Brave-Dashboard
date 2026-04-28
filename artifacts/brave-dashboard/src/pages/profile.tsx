import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@workspace/replit-auth-web";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { ArrowLeft } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useUpdateCurrentAuthUser } from "@workspace/api-client-react";
import { normalizeError } from "@/lib/api-error";

export default function Profile() {
  const { user, refresh: refreshAuth } = useAuth();
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const updateMe = useUpdateCurrentAuthUser();

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [niatId, setNiatId] = useState("");

  // Hydrate the form from the auth user as soon as we have it.
  useEffect(() => {
    if (!user) return;
    setFirstName(user.firstName ?? "");
    setLastName(user.lastName ?? "");
    setEmail(user.email ?? "");
    setNiatId(user.niatId ?? "");
  }, [user?.id]);

  if (!user) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const payload: Record<string, string> = {};
    if (firstName.trim() !== (user.firstName ?? "")) payload.firstName = firstName.trim();
    if (lastName.trim() !== (user.lastName ?? "")) payload.lastName = lastName.trim();
    if (email.trim() !== (user.email ?? "")) payload.email = email.trim();
    if (niatId.trim() !== (user.niatId ?? "")) payload.niatId = niatId.trim();

    if (Object.keys(payload).length === 0) {
      toast({ title: "No changes to save" });
      return;
    }

    updateMe.mutate(
      { data: payload },
      {
        onSuccess: async () => {
          await refreshAuth();
          await queryClient.invalidateQueries();
          toast({ title: "Profile updated" });
        },
        onError: (err: unknown) => {
          toast({
            title: "Couldn't update profile",
            description: normalizeError(err, "Please try again.").message,
            variant: "destructive",
          });
        },
      },
    );
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setLocation("/")}
        data-testid="button-profile-back"
      >
        <ArrowLeft className="w-4 h-4 mr-2" /> Back
      </Button>

      <div>
        <h1 className="text-3xl font-bold tracking-tight">Edit profile</h1>
        <p className="text-muted-foreground mt-1">
          Update the personal details associated with your BRAVE account.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Account details</CardTitle>
          <CardDescription>
            Your name and contact info are visible to your team and to campus coordinators.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="profile-first-name">First name</Label>
                <Input
                  id="profile-first-name"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  maxLength={60}
                  data-testid="input-profile-first-name"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="profile-last-name">Last name</Label>
                <Input
                  id="profile-last-name"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  maxLength={60}
                  data-testid="input-profile-last-name"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="profile-email">Email</Label>
              <Input
                id="profile-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                maxLength={200}
                data-testid="input-profile-email"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="profile-niat">NIAT ID</Label>
              <Input
                id="profile-niat"
                value={niatId}
                onChange={(e) => setNiatId(e.target.value)}
                maxLength={40}
                data-testid="input-profile-niat"
              />
            </div>

            <div className="pt-2">
              <Button
                type="submit"
                disabled={updateMe.isPending}
                data-testid="button-profile-save"
              >
                {updateMe.isPending ? <Spinner className="w-4 h-4 mr-2" /> : null}
                Save changes
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
