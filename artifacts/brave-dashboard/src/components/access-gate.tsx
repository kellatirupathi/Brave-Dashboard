// Full-screen gate shown to authenticated students who are not yet on the
// BRAVE roster. Drives the new-user access flow: no request -> form,
// pending -> waiting screen, rejected -> rejected screen. While the gate is
// rendered, the student cannot reach any other page in the app.
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@workspace/replit-auth-web";
import {
  getMyAccessRequest,
  submitAccessRequest,
  listCampusOptions,
  type SubmitAccessRequestInput,
} from "@/lib/access-api";
import { normalizeError } from "@/lib/api-error";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Clock, LogOut, ShieldAlert, RefreshCw } from "lucide-react";

const MY_REQUEST_KEY = ["access-request", "me"];

function GateShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-6">
      <div className="max-w-lg w-full space-y-8">{children}</div>
    </div>
  );
}

function LogoutLink() {
  const { logout } = useAuth();
  return (
    <div className="text-center">
      <button
        onClick={() => logout()}
        className="text-sm text-muted-foreground hover:text-foreground transition-colors underline underline-offset-4"
      >
        Log out and try a different account
      </button>
    </div>
  );
}

function AccessRequestForm() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const { data: campuses, isLoading: campusesLoading } = useQuery({
    queryKey: ["access-request", "campuses"],
    queryFn: listCampusOptions,
  });

  const [fullName, setFullName] = useState(
    user ? `${user.firstName ?? ""} ${user.lastName ?? ""}`.trim() : "",
  );
  const [email] = useState(user?.email ?? "");
  const [campusId, setCampusId] = useState<string>("");
  const [mobileNumber, setMobileNumber] = useState("");
  const [sectionName, setSectionName] = useState("");
  const [niatId, setNiatId] = useState("");
  const [error, setError] = useState("");

  const submit = useMutation({
    mutationFn: (input: SubmitAccessRequestInput) => submitAccessRequest(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: MY_REQUEST_KEY });
    },
    onError: (err) => setError(normalizeError(err).message),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    const id = Number(campusId);
    if (!Number.isInteger(id) || id <= 0) {
      setError("Please select your campus.");
      return;
    }
    submit.mutate({
      fullName: fullName.trim(),
      campusId: id,
      mobileNumber: mobileNumber.trim(),
      sectionName: sectionName.trim(),
      niatId: niatId.trim() || undefined,
    });
  };

  return (
    <GateShell>
      <div className="text-center space-y-3">
        <div className="inline-flex items-center gap-2 bg-amber-500/10 text-amber-600 dark:text-amber-400 px-4 py-1.5 rounded-full text-sm font-medium border border-amber-500/20">
          <span className="w-2 h-2 rounded-full bg-amber-500 inline-block" />
          Access Required
        </div>
        <h1 className="text-2xl font-bold tracking-tight">
          BRAVE Programme Dashboard
        </h1>
        <p className="text-muted-foreground leading-relaxed">
          We couldn&apos;t find you on the BRAVE roster yet. Request access below
          and a programme administrator will review it.
        </p>
      </div>

      <div className="bg-card border border-border rounded-xl p-6 shadow-sm space-y-5">
        <h2 className="font-semibold text-lg">Request Access</h2>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="fullName">Full Name</Label>
            <Input
              id="fullName"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Your full name"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="email">Email Address</Label>
            <Input
              id="email"
              type="email"
              value={email}
              disabled
              readOnly
            />
            <p className="text-xs text-muted-foreground">
              Linked to your signed-in account.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="niatId">NIAT ID</Label>
              <Input
                id="niatId"
                value={niatId}
                onChange={(e) => setNiatId(e.target.value)}
                placeholder="e.g. NIAT2024001"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="mobileNumber">Mobile Number</Label>
              <Input
                id="mobileNumber"
                value={mobileNumber}
                onChange={(e) => setMobileNumber(e.target.value)}
                placeholder="10-digit mobile number"
                required
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="sectionName">Section</Label>
            <Input
              id="sectionName"
              value={sectionName}
              onChange={(e) => setSectionName(e.target.value)}
              placeholder="e.g. CSE-A 2024"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="campus">Campus</Label>
            <Select
              value={campusId}
              onValueChange={setCampusId}
              disabled={campusesLoading}
            >
              <SelectTrigger id="campus">
                <SelectValue
                  placeholder={
                    campusesLoading ? "Loading campuses…" : "Select your campus"
                  }
                />
              </SelectTrigger>
              <SelectContent>
                {(campuses ?? []).map((c) => (
                  <SelectItem key={c.id} value={String(c.id)}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <Button
            type="submit"
            className="w-full"
            disabled={
              submit.isPending ||
              !campusId ||
              !fullName.trim() ||
              !mobileNumber.trim() ||
              !sectionName.trim()
            }
          >
            {submit.isPending && <Spinner className="w-4 h-4 mr-2" />}
            Submit Access Request
          </Button>
        </form>
      </div>

      <LogoutLink />
    </GateShell>
  );
}

export function AccessGate() {
  const { data, isLoading } = useQuery({
    queryKey: MY_REQUEST_KEY,
    queryFn: getMyAccessRequest,
  });

  if (isLoading) {
    return (
      <div className="min-h-screen w-full flex items-center justify-center bg-background">
        <Spinner className="size-10" />
      </div>
    );
  }

  const request = data?.request ?? null;

  if (request?.status === "pending") {
    return (
      <GateShell>
        <div className="max-w-md w-full mx-auto text-center space-y-6">
          <div className="flex justify-center">
            <div className="rounded-full bg-amber-500/10 border border-amber-500/20 p-4">
              <Clock className="w-12 h-12 text-amber-500" />
            </div>
          </div>
          <div>
            <h1 className="text-2xl font-bold">Request Under Review</h1>
            <p className="text-muted-foreground mt-2 leading-relaxed">
              Your access request has been sent to the BRAVE programme
              administrators. You&apos;ll be able to sign in once it&apos;s
              approved.
            </p>
          </div>
          <p className="text-sm text-muted-foreground">
            Requests are typically reviewed within 24–48 hours.
          </p>
          <LogoutLink />
        </div>
      </GateShell>
    );
  }

  if (request?.status === "rejected") {
    return (
      <GateShell>
        <div className="max-w-md w-full mx-auto text-center space-y-6">
          <div className="flex justify-center">
            <div className="rounded-full bg-destructive/10 border border-destructive/20 p-4">
              <ShieldAlert className="w-12 h-12 text-destructive" />
            </div>
          </div>
          <div>
            <h1 className="text-2xl font-bold">Access Not Approved</h1>
            <p className="text-muted-foreground mt-2 leading-relaxed">
              Your access request was not approved. If you believe this is a
              mistake, please contact your campus coordinator.
            </p>
          </div>
          {request.notes && (
            <div className="text-sm text-left bg-muted/50 border border-border rounded-lg p-3">
              <span className="font-medium">Note from admin: </span>
              {request.notes}
            </div>
          )}
          <LogoutLink />
        </div>
      </GateShell>
    );
  }

  if (request?.status === "approved") {
    return (
      <GateShell>
        <div className="max-w-md w-full mx-auto text-center space-y-6">
          <div>
            <h1 className="text-2xl font-bold">Access Approved</h1>
            <p className="text-muted-foreground mt-2 leading-relaxed">
              Your access has been approved. Reload the page to enter the
              dashboard.
            </p>
          </div>
          <Button onClick={() => window.location.reload()} className="gap-2">
            <RefreshCw className="w-4 h-4" /> Reload
          </Button>
        </div>
      </GateShell>
    );
  }

  return <AccessRequestForm />;
}
