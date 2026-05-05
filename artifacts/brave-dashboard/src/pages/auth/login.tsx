import { useAuth } from "@workspace/replit-auth-web";
import { useEffect } from "react";
import { Link, useLocation } from "wouter";

/* ---------- Inline BRAVE wordmark (matches Framer landing) ---------- */
function BraveWordmark() {
  return (
    <div className="flex items-center gap-2">
      <svg
        viewBox="0 0 28 35"
        className="w-7 h-9 shrink-0"
        fill="none"
        aria-hidden
      >
        <path
          d="M0 4h28v17.5C28 28.4 21.7 35 14 35S0 28.4 0 21.5V4Z"
          fill="#1e0d01"
        />
        <text
          x="14"
          y="22"
          textAnchor="middle"
          fontFamily="Supreme, sans-serif"
          fontWeight="800"
          fontSize="11"
          fill="#fff"
          letterSpacing="-0.5"
        >
          NIAT
        </text>
      </svg>
      <span className="text-[#1e0d01] font-bold text-2xl tracking-tight font-[family-name:var(--font-display)] flex items-center gap-1">
        BRAVE
        <span
          className="inline-block w-2 h-2 rotate-45 ml-0.5"
          style={{ background: "var(--color-brave-accent)" }}
        />
      </span>
    </div>
  );
}

/* ---------- Top scrolling ticker ---------- */
function Ticker() {
  const items = Array.from({ length: 8 });
  return (
    <div
      className="w-full overflow-hidden"
      style={{ background: "var(--color-brave-ink)" }}
    >
      <div className="flex whitespace-nowrap py-1.5 animate-[brave-ticker_35s_linear_infinite]">
        {items.concat(items).map((_, i) => (
          <div
            key={i}
            className="flex items-center gap-3 px-8 text-[12px] font-[family-name:var(--font-ticker)] font-light tracking-tight"
          >
            <span className="text-white">April 15 – July 15, 2026</span>
            <span className="text-white/50">· Open to All NIAT Students</span>
          </div>
        ))}
      </div>
      <style>{`@keyframes brave-ticker { from { transform: translateX(0); } to { transform: translateX(-50%); } }`}</style>
    </div>
  );
}

export default function Login() {
  const { login, isAuthenticated, isLoading, user, error } = useAuth();
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (isAuthenticated && !isLoading && user) {
      if (user.role === "student") setLocation("/");
      else if (user.role === "coordinator") setLocation("/coordinator");
      else if (user.role === "admin") setLocation("/admin");
    }
  }, [isAuthenticated, isLoading, user, setLocation]);

  return (
    <div
      className="min-h-screen flex flex-col font-[family-name:var(--font-body)]"
      style={{ background: "var(--color-brave-cream)" }}
    >
      <Ticker />

      {/* Hero gradient backdrop */}
      <div
        className="relative flex-1 flex flex-col items-center justify-center px-4 py-12 overflow-hidden"
        style={{
          background:
            "linear-gradient(180deg, #d6d3ce 0%, #e6e0d8 60%, #fafafa 100%)",
        }}
      >
        {/* Soft accent blurs (match Framer) */}
        <div
          className="absolute top-1/4 right-[-10%] w-[600px] h-[300px] rounded-full opacity-20 blur-[100px] pointer-events-none"
          style={{ background: "var(--color-brave-coral)" }}
        />
        <div
          className="absolute bottom-0 left-[10%] w-[500px] h-[300px] rounded-full opacity-15 blur-[100px] pointer-events-none"
          style={{ background: "rgba(254,131,242,0.4)" }}
        />

        {/* Top brand */}
        <div className="relative z-10 mb-10">
          <Link href="/" data-testid="link-home">
            <BraveWordmark />
          </Link>
        </div>

        {/* Login card */}
        <div
          className="relative z-10 w-full max-w-md bg-white rounded-3xl p-10 border border-black/[0.04]"
          style={{
            boxShadow:
              "0 10px 60px -10px rgba(0,0,0,0.15), 0 0 24px rgba(255, 244, 219, 0.4)",
          }}
        >
          <div className="text-center mb-8">
            <h1
              className="font-[family-name:var(--font-display)] font-bold tracking-tight mb-3"
              style={{
                fontSize: "clamp(28px, 4vw, 36px)",
                lineHeight: 1.1,
                color: "#1f1f1f",
                letterSpacing: "-0.04em",
              }}
            >
              Welcome to BRAVE
            </h1>
            <p
              className="font-[family-name:var(--font-body)] text-[15px]"
              style={{ color: "#5b5b5b", lineHeight: 1.6 }}
            >
              Login to your dashboard to track your team, log revenue, and
              follow the leaderboard.
            </p>
          </div>

          {isLoading ? (
            <div
              className="w-full h-13 flex items-center justify-center gap-3 text-[#5b5b5b] text-sm"
              data-testid="signing-in-spinner"
            >
              <span className="w-4 h-4 border-2 border-black/20 border-t-black rounded-full animate-spin" />
              Logging you in…
            </div>
          ) : (
            <>
              {error && (
                <div
                  className="mb-4 p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm font-[family-name:var(--font-body)]"
                  data-testid="auth-error"
                >
                  {error}
                </div>
              )}
              <button
                onClick={() => login()}
                data-testid="button-sign-in"
                className="w-full h-13 py-4 bg-[#000] text-white font-[family-name:var(--font-body)] font-medium rounded-xl flex items-center justify-center gap-2 hover:opacity-90 active:scale-[0.99] transition-all"
                style={{ border: "1px solid rgba(33,33,33,0.53)" }}
              >
                Login with NIAT
              </button>
            </>
          )}

          <p
            className="mt-6 text-[12px] text-center font-[family-name:var(--font-body)]"
            style={{ color: "#a6a6a6", lineHeight: 1.6 }}
          >
            By logging in, you agree to the NIAT code of conduct and BRAVE
            program terms.
          </p>
        </div>

        {/* Sub-tagline (matches Framer "A program where..." style) */}
        <p
          className="relative z-10 mt-10 max-w-md text-center font-[family-name:var(--font-body)] text-sm"
          style={{ color: "#5b5b5b" }}
        >
          A program where students build AI-powered ventures, find real clients,
          and generate real revenue.
        </p>

        <p
          className="relative z-10 mt-3 text-[11px] font-[family-name:var(--font-ticker)] tracking-tight"
          style={{ color: "#a6a6a6" }}
        >
          BRAVE {new Date().getFullYear()} · NIAT India
        </p>
      </div>
    </div>
  );
}
