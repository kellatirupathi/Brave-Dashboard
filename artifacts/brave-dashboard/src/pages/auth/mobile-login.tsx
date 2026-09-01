// Native app sign-in screen (additive, isolated).
//
// The web login page is a marketing landing page: hero copy, feature grid,
// animated revenue chart. That is right for a browser, where the page has to
// SELL the programme to someone who arrived from a link. It is wrong for the
// installed app, where the student already tapped a BRAVE icon on their own
// home screen and wants one thing: to get in.
//
// So the app gets its own screen — one mark, one line, one button. Rendered
// ONLY when running inside the native shell; the web login is untouched.
//
// MOTION
// A single orchestrated entrance rather than scattered effects: mark, then
// wordmark, then the button, each a beat apart. It reads as an app launching
// rather than a page loading. All of it is skipped under
// prefers-reduced-motion.
//
// Deleting this file means removing its branch in pages/auth/login.tsx.
import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { ArrowRight, Loader2 } from "lucide-react";
import { useAuth } from "@workspace/replit-auth-web";
import { startNativeLogin } from "@/lib/native-auth";
import { setStatusBarContrast } from "@/lib/native-shell";
import { cn } from "@/lib/utils";

/** The BRAVE mark, drawn rather than imported so it animates as one piece. */
function Mark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 120 120"
      className={className}
      role="img"
      aria-label="BRAVE"
    >
      <rect width="120" height="120" rx="28" fill="#C0392B" />
      <text
        x="30"
        y="90"
        style={{ font: "800 84px 'Plus Jakarta Sans', system-ui, sans-serif" }}
        fill="#FFFFFF"
      >
        B
      </text>
      <rect x="86" y="74" width="16" height="16" rx="2" fill="#EF9F27" />
    </svg>
  );
}

export default function MobileLogin() {
  const { login, error, isAuthenticated, isLoading, user } = useAuth();
  const [, setLocation] = useLocation();
  const [busy, setBusy] = useState(false);
  // Drives the staged entrance. Starts at 0 and steps up on mount.
  const [stage, setStage] = useState(0);

  // Never strand a signed-in student on the sign-in screen.
  //
  // The happy path returns from the SSO to "/", which RootRedirect resolves on
  // its own — so this looks redundant until it isn't. It fires when Forms is
  // pointed at /login instead of /, when a student backs into this screen from
  // the dashboard, and when a session is restored while this route is mounted.
  // In every one of those cases the screen previously sat there offering to
  // sign in a student who already was, with no way forward. WebLogin has
  // carried the same guard all along; this is the app half of it.
  useEffect(() => {
    if (isLoading || !isAuthenticated || !user) return;
    if (user.role === "coordinator") setLocation("/coordinator");
    else if (user.role === "admin") setLocation("/admin");
    else setLocation("/");
  }, [isAuthenticated, isLoading, user, setLocation]);

  // This screen paints the cream ground behind a transparent status bar, where
  // every signed-in screen paints the dark header. Light icons would vanish
  // into it. Restored on the way out so the header gets its own contrast back.
  useEffect(() => {
    void setStatusBarContrast("dark-content");
    return () => {
      void setStatusBarContrast("light-content");
    };
  }, []);

  useEffect(() => {
    const reduce = window.matchMedia?.(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    if (reduce) {
      setStage(3);
      return;
    }
    const timers = [
      setTimeout(() => setStage(1), 80),
      setTimeout(() => setStage(2), 320),
      setTimeout(() => setStage(3), 560),
    ];
    return () => timers.forEach(clearTimeout);
  }, []);

  async function signIn() {
    setBusy(true);
    const loginUrl = (
      import.meta as unknown as { env?: Record<string, string | undefined> }
    ).env?.["VITE_FORMS_LOGIN_URL"];

    // Navigates this WebView to the NIAT SSO. A student already signed in to
    // Forms is bounced straight back with a token and never sees a form; one
    // who is not gets the mobile-number and OTP steps, in the app.
    if (loginUrl && (await startNativeLogin(loginUrl))) {
      // Deliberately leave `busy` latched. The navigation is in flight and
      // this page is about to be replaced; clearing the flag on a timer would
      // re-enable the button underneath a loading page and let a second tap
      // stack another navigation on top of the first.
      return;
    }

    login();
    // Only reached when there is no SSO URL to go to, which `login()` reports
    // as an error on this same screen. Release the button so it can be retried.
    setBusy(false);
  }

  const step = (n: number) =>
    cn(
      "transition-all duration-500 ease-out",
      stage >= n ? "translate-y-0 opacity-100" : "translate-y-3 opacity-0",
    );

  return (
    <div
      className="flex min-h-screen flex-col bg-background text-foreground"
      style={{
        paddingTop: "var(--safe-area-inset-top, 0px)",
        paddingBottom: "var(--safe-area-inset-bottom, 0px)",
      }}
    >
      {/* Centre block */}
      <div className="flex flex-1 flex-col items-center justify-center px-8">
        <div className={cn("flex flex-col items-center", step(1))}>
          <Mark className="h-24 w-24 drop-shadow-sm" />
        </div>

        <div className={cn("mt-7 text-center", step(2))}>
          <h1 className="text-3xl font-extrabold tracking-tight">
            BRAVE<span className="text-primary">.</span>
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Find a business. Build the fix. Get paid.
          </p>
        </div>
      </div>

      {/* Action block, thumb-height at the bottom */}
      <div className={cn("px-6 pb-10", step(3))}>
        {error && (
          <p
            role="alert"
            data-testid="auth-error"
            className="mb-3 rounded-lg bg-destructive/10 px-4 py-3 text-center text-sm text-destructive"
          >
            {error}
          </p>
        )}

        <button
          type="button"
          onClick={() => void signIn()}
          disabled={busy}
          data-testid="button-sign-in"
          className={cn(
            "flex min-h-[52px] w-full items-center justify-center gap-2",
            "rounded-xl bg-primary text-base font-semibold text-primary-foreground",
            "transition-transform active:scale-[0.98] disabled:opacity-70",
          )}
        >
          {busy ? (
            <>
              <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
              Opening sign-in…
            </>
          ) : (
            <>
              Sign in with NIAT
              <ArrowRight className="h-5 w-5" aria-hidden="true" />
            </>
          )}
        </button>

        <p className="mt-4 text-center text-xs text-muted-foreground">
          For NIAT students only
        </p>
      </div>
    </div>
  );
}
