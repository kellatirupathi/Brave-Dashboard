import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@workspace/replit-auth-web";
import { BraveLogo } from "@/components/brave-logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { Card } from "@/components/ui/card";
import { Eye, EyeOff, ShieldCheck, ArrowLeft } from "lucide-react";

/**
 * Staff sign-in via email + password. Runs **alongside** the existing Forms
 * SSO login at /login — never replaces it. Only admin and coordinator
 * accounts that have a password set can use this page. Students must use
 * SSO and are rejected by the API if they attempt password login.
 */
export default function AdminLogin() {
  const { isAuthenticated, isLoading, user, login } = useAuth();
  const [, setLocation] = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isLoading || !isAuthenticated || !user) return;
    if (user.role === "admin") setLocation("/admin");
    else if (user.role === "coordinator") setLocation("/coordinator");
    else setLocation("/");
  }, [isAuthenticated, isLoading, user, setLocation]);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (submitting) return;
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/auth/password-login", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), password }),
      });
      if (!res.ok) {
        let message = "Invalid email or password.";
        try {
          const data = (await res.json()) as { error?: string };
          if (data?.error) message = data.error;
        } catch {
          // ignore parse errors
        }
        setError(message);
        setSubmitting(false);
        return;
      }
      // Read the role from the response so we can route immediately, and
      // do a full-page navigation. The fresh load reinitializes useAuth
      // via /api/auth/user — no need for an internal refresh hook.
      let nextPath = "/";
      try {
        const data = (await res.json()) as {
          user?: { role?: string } | null;
        };
        const role = data?.user?.role;
        if (role === "admin") nextPath = "/admin";
        else if (role === "coordinator") nextPath = "/coordinator";
      } catch {
        // ignore parse errors — fall back to root
      }
      window.location.assign(nextPath);
    } catch {
      setError("Network error. Please try again.");
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[hsl(0_65%_14%)] p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-6">
          <BraveLogo className="text-3xl text-white inline-block" />
          <p className="text-xs text-white/60 uppercase tracking-widest mt-2">
            Staff sign-in
          </p>
        </div>

        <Card className="p-6 md:p-8 space-y-5">
          <div className="space-y-1">
            <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-primary" />
              Admin / Coordinator login
            </h1>
            <p className="text-sm text-muted-foreground">
              Sign in with the email and password set by an administrator.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4" noValidate>
            <div className="space-y-1.5">
              <Label htmlFor="login-email">Email</Label>
              <Input
                id="login-email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={submitting}
                data-testid="input-admin-login-email"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="login-password">Password</Label>
              <div className="relative">
                <Input
                  id="login-password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={submitting}
                  className="pr-10"
                  data-testid="input-admin-login-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  data-testid="button-toggle-admin-login-password"
                  tabIndex={-1}
                >
                  {showPassword ? (
                    <EyeOff className="w-4 h-4" />
                  ) : (
                    <Eye className="w-4 h-4" />
                  )}
                </button>
              </div>
            </div>

            {error && (
              <p
                className="text-sm text-destructive"
                role="alert"
                data-testid="text-admin-login-error"
              >
                {error}
              </p>
            )}

            <Button
              type="submit"
              className="w-full gap-2"
              disabled={submitting || !email || !password}
              data-testid="button-admin-login-submit"
            >
              {submitting && <Spinner className="w-4 h-4" />}
              Sign in
            </Button>
          </form>

          <div className="pt-2 border-t flex items-center justify-between text-xs">
            <button
              type="button"
              onClick={() => setLocation("/")}
              className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
              data-testid="link-admin-login-back-home"
            >
              <ArrowLeft className="w-3 h-3" /> Back home
            </button>
            <button
              type="button"
              onClick={() => login()}
              className="text-muted-foreground hover:text-foreground"
              data-testid="link-admin-login-sso"
            >
              Use Forms SSO instead →
            </button>
          </div>
        </Card>
      </div>
    </div>
  );
}
