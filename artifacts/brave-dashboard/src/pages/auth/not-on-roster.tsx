import { useState } from "react";
import { useAuth } from "@workspace/replit-auth-web";
import { useSubmitAccessRequest } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { CheckCircle2, LogOut } from "lucide-react";

const CAMPUSES = [
  "AMET University",
  "Ajeenkya DY Patil University",
  "Annamacharya University",
  "Aurora Deemed University",
  "Chaitanya – Deemed to be University",
  "Chalapathi Institute of Engineering and Technology",
  "Chalapathi Institute of Technology, Autonomous",
  "Crescent University",
  "Malla Reddy Vishwavidyapeeth",
  "NIAT - Chevella",
  "NIAT - KKH",
  "NRI Institute of Technology",
  "NSRIT - Nadimpalli Satyanarayana Raju Institute of Technology",
  "Noida International University",
  "S-VYASA University",
  "Sanjay Ghodawat University",
  "Takshashila University",
  "Vivekananda Global University",
  "Yenepoya University",
];

export default function NotOnRoster() {
  const { user, logout } = useAuth();
  const submitRequest = useSubmitAccessRequest();

  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");

  const [fullName, setFullName] = useState(user ? `${user.firstName ?? ""} ${user.lastName ?? ""}`.trim() : "");
  const [email, setEmail] = useState(user?.email ?? "");
  const [batch, setBatch] = useState("");
  const [niatId, setNiatId] = useState("");
  const [campusName, setCampusName] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    submitRequest.mutate(
      { data: { fullName, email, batch: batch || undefined, niatId: niatId || undefined, campusName } },
      {
        onSuccess: () => setSubmitted(true),
        onError: (err) => setError(err instanceof Error ? err.message : "Failed to submit request"),
      }
    );
  };

  if (submitted) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <div className="max-w-md w-full text-center space-y-6">
          <div className="flex justify-center">
            <CheckCircle2 className="w-16 h-16 text-green-500" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Request Submitted</h1>
            <p className="text-muted-foreground mt-2">
              Your access request has been sent to the BRAVE programme administrators.
              You will receive a notification once it is reviewed.
            </p>
          </div>
          <p className="text-sm text-muted-foreground">
            Requests are typically reviewed within 24–48 hours.
          </p>
          <Button variant="outline" onClick={() => logout()} className="gap-2">
            <LogOut className="w-4 h-4" /> Log out
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-6">
      <div className="max-w-lg w-full space-y-8">
        <div className="text-center space-y-3">
          <div className="inline-flex items-center gap-2 bg-amber-500/10 text-amber-600 dark:text-amber-400 px-4 py-1.5 rounded-full text-sm font-medium border border-amber-500/20">
            <span className="w-2 h-2 rounded-full bg-amber-500 inline-block" />
            Access Required
          </div>
          <h1 className="text-2xl font-bold tracking-tight">BRAVE Programme Dashboard</h1>
          <p className="text-muted-foreground leading-relaxed">
            This dashboard is only available for NIAT students who have registered for the BRAVE programme.
            You can request access below and a campus coordinator will review your request.
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
                onChange={e => setFullName(e.target.value)}
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
                onChange={e => setEmail(e.target.value)}
                placeholder="your@email.com"
                required
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="niatId">NIAT ID</Label>
                <Input
                  id="niatId"
                  value={niatId}
                  onChange={e => setNiatId(e.target.value)}
                  placeholder="e.g. NIAT2024001"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="batch">Batch / Section</Label>
                <Input
                  id="batch"
                  value={batch}
                  onChange={e => setBatch(e.target.value)}
                  placeholder="e.g. CSE-A 2024"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="campus">Campus</Label>
              <Select value={campusName} onValueChange={setCampusName} required>
                <SelectTrigger id="campus">
                  <SelectValue placeholder="Select your campus" />
                </SelectTrigger>
                <SelectContent>
                  {CAMPUSES.map(c => (
                    <SelectItem key={c} value={c}>{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {error && (
              <p className="text-sm text-destructive">{error}</p>
            )}

            <Button type="submit" className="w-full" disabled={submitRequest.isPending || !campusName}>
              {submitRequest.isPending && <Spinner className="w-4 h-4 mr-2" />}
              Submit Access Request
            </Button>
          </form>
        </div>

        <div className="text-center">
          <button
            onClick={() => logout()}
            className="text-sm text-muted-foreground hover:text-foreground transition-colors underline underline-offset-4"
          >
            Log out and try a different account
          </button>
        </div>
      </div>
    </div>
  );
}
