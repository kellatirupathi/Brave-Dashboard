import { useAuth } from "@workspace/replit-auth-web";
import { Button } from "@/components/ui/button";
import { useEffect } from "react";
import { useLocation } from "wouter";

export default function Login() {
  const { login, isAuthenticated, isLoading, user } = useAuth();
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (isAuthenticated && !isLoading && user) {
      if (user.role === "student") setLocation("/");
      else if (user.role === "coordinator") setLocation("/coordinator");
      else if (user.role === "admin") setLocation("/admin");
    }
  }, [isAuthenticated, isLoading, user, setLocation]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="max-w-md w-full animate-in fade-in zoom-in duration-500">
        <div className="text-center mb-10">
          <div className="w-16 h-16 bg-primary rounded-2xl mx-auto mb-6 flex items-center justify-center shadow-lg shadow-primary/20">
            <span className="text-2xl font-bold text-primary-foreground">B</span>
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight text-foreground mb-2">
            BRAVE Program
          </h1>
          <p className="text-muted-foreground text-sm font-medium uppercase tracking-widest">
            National Dashboard
          </p>
        </div>

        <div className="bg-card p-8 rounded-xl border shadow-sm text-center">
          <p className="text-muted-foreground mb-8">
            Sign in with your Replit account to access your dashboard, track revenue, and view the national leaderboard.
          </p>

          <Button 
            size="lg" 
            className="w-full h-12 text-base font-semibold shadow-md"
            onClick={() => login()}
            disabled={isLoading}
          >
            {isLoading ? "Signing in..." : "Continue with Replit"}
          </Button>
          
          <p className="mt-6 text-xs text-muted-foreground/60 text-center">
            Secured via Replit Auth
          </p>
        </div>
      </div>
    </div>
  );
}
