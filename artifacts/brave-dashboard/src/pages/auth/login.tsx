import { useAuth } from "@workspace/replit-auth-web";
import { useEffect } from "react";
import { Link, useLocation } from "wouter";
import {
  ArrowRight,
  ArrowLeft,
  IndianRupee,
  Users,
  Trophy,
  Sparkles,
  ShieldCheck,
} from "lucide-react";

/* ---------- Inline BRAVE wordmark ---------- */
function BraveWordmark({ dark = false }: { dark?: boolean }) {
  const ink = dark ? "#fff" : "#1e0d01";
  const shieldFill = dark ? "#fff" : "#1e0d01";
  const shieldText = dark ? "#1e0d01" : "#fff";
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
          fill={shieldFill}
        />
        <text
          x="14"
          y="22"
          textAnchor="middle"
          fontFamily="Supreme, sans-serif"
          fontWeight="800"
          fontSize="11"
          fill={shieldText}
          letterSpacing="-0.5"
        >
          NIAT
        </text>
      </svg>
      <span
        className="font-bold text-2xl tracking-tight font-[family-name:var(--font-display)] flex items-center gap-1"
        style={{ color: ink }}
      >
        BRAVE
        <span
          className="inline-block w-2 h-2 rotate-45 ml-0.5"
          style={{ background: "var(--color-brave-accent)" }}
        />
      </span>
    </div>
  );
}

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
      style={{ background: "var(--color-brave-cream)", color: "#1f1f1f" }}
    >
      <Ticker />

      <div className="flex-1 flex flex-col lg:flex-row">
        {/* Left — Hero Panel */}
        <div
          className="hidden lg:flex flex-col justify-between lg:w-[58%] xl:w-[60%] relative overflow-hidden px-12 py-12"
          style={{
            background:
              "linear-gradient(180deg, #d6d3ce 0%, #e6e0d8 60%, #fafafa 100%)",
          }}
        >
          {/* Soft accent blurs */}
          <div
            className="absolute top-1/4 right-[-10%] w-[500px] h-[280px] rounded-full opacity-25 blur-[100px] pointer-events-none"
            style={{ background: "var(--color-brave-coral)" }}
          />
          <div
            className="absolute bottom-1/4 left-[-5%] w-[480px] h-[280px] rounded-full opacity-20 blur-[100px] pointer-events-none"
            style={{ background: "rgba(254,131,242,0.4)" }}
          />

          <div className="relative z-10">
            <Link href="/" data-testid="link-back-home">
              <BraveWordmark />
            </Link>
          </div>

          <div className="relative z-10 max-w-lg">
            <div className="inline-flex items-center gap-2 bg-white/80 backdrop-blur border border-black/[0.06] rounded-full px-4 py-1.5 mb-8">
              <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
              <span
                className="text-xs font-[family-name:var(--font-body)] font-bold tracking-[0.08em] uppercase"
                style={{ color: "#5b5b5b" }}
              >
                BRAVE 2026 — Boost SME revenue
              </span>
            </div>

            <h1
              className="font-[family-name:var(--font-display)] font-extrabold tracking-tight mb-6"
              style={{
                fontSize: "clamp(36px, 4.5vw, 56px)",
                lineHeight: 1.05,
                color: "#1f1f1f",
                letterSpacing: "-0.04em",
              }}
            >
              Boost real revenue
              <br />
              for{" "}
              <span style={{ color: "var(--color-brave-accent)" }}>
                India's SMEs.
              </span>
            </h1>

            <p
              className="font-[family-name:var(--font-body)] text-lg mb-10"
              style={{ color: "#5b5b5b", lineHeight: 1.65 }}
            >
              Login to track your team's progress, log SME orders, see verified
              revenue, and climb the national leaderboard across 20 NIAT
              campuses.
            </p>

            <div className="flex flex-wrap gap-2.5">
              {[
                { icon: Sparkles, label: "Build with AI" },
                { icon: Users, label: "Real SME clients" },
                { icon: IndianRupee, label: "Verified revenue" },
                { icon: Trophy, label: "Demo Day finale" },
              ].map(({ icon: Icon, label }) => (
                <div
                  key={label}
                  className="flex items-center gap-2 bg-white border border-black/[0.06] rounded-full px-4 py-2"
                  style={{ boxShadow: "0 0 16px rgba(255, 244, 219, 0.3)" }}
                >
                  <Icon
                    className="w-3.5 h-3.5"
                    style={{ color: "var(--color-brave-accent)" }}
                  />
                  <span
                    className="text-xs font-[family-name:var(--font-body)] font-medium"
                    style={{ color: "#1f1f1f" }}
                  >
                    {label}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="relative z-10 flex items-center gap-10">
            {[
              { value: "7,500+", label: "NIAT Students" },
              { value: "20", label: "Campuses" },
              { value: "₹5 Cr", label: "Funding pool" },
            ].map(({ value, label }) => (
              <div key={label}>
                <p
                  className="font-[family-name:var(--font-display)] font-extrabold text-2xl"
                  style={{ color: "#1f1f1f" }}
                >
                  {value}
                </p>
                <p
                  className="text-xs mt-0.5 font-[family-name:var(--font-body)]"
                  style={{ color: "#6b6b6b" }}
                >
                  {label}
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* Right — Login Panel */}
        <div
          className="flex items-center justify-center w-full lg:w-[42%] xl:w-[40%] px-6 py-10 relative"
          style={{ background: "#fcfaf8" }}
        >
          <div className="relative z-10 w-full max-w-md">
            <Link
              href="/"
              data-testid="link-back-marketing"
              className="hidden lg:inline-flex items-center gap-1.5 text-xs font-[family-name:var(--font-body)] font-medium mb-5 hover:opacity-70 transition-opacity"
              style={{ color: "#5b5b5b" }}
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              Back to BRAVE
            </Link>

            <div
              className="bg-white border border-black/[0.04] rounded-3xl p-10"
              style={{
                boxShadow:
                  "0 10px 60px -10px rgba(0,0,0,0.12), 0 0 24px rgba(255, 244, 219, 0.4)",
              }}
            >
              <Link
                href="/"
                data-testid="link-mobile-home"
                className="flex lg:hidden items-center mb-8"
              >
                <BraveWordmark />
              </Link>

              <div
                className="inline-flex items-center gap-2 rounded-full px-3 py-1 mb-6"
                style={{
                  background: "rgba(219, 71, 80, 0.06)",
                  border: "1px solid rgba(219, 71, 80, 0.2)",
                }}
              >
                <ShieldCheck
                  className="w-3.5 h-3.5"
                  style={{ color: "var(--color-brave-accent)" }}
                />
                <span
                  className="text-[10px] font-[family-name:var(--font-body)] font-bold tracking-[0.08em] uppercase"
                  style={{ color: "var(--color-brave-accent)" }}
                >
                  Secure NIAT login
                </span>
              </div>

              <div className="mb-8">
                <h2
                  className="font-[family-name:var(--font-display)] font-bold tracking-tight mb-2"
                  style={{
                    fontSize: "clamp(26px, 3vw, 32px)",
                    lineHeight: 1.1,
                    color: "#1f1f1f",
                    letterSpacing: "-0.04em",
                  }}
                >
                  Login to{" "}
                  <span style={{ color: "var(--color-brave-accent)" }}>
                    BRAVE
                  </span>
                </h2>
                <p
                  className="font-[family-name:var(--font-body)] text-sm"
                  style={{ color: "#5b5b5b", lineHeight: 1.6 }}
                >
                  Access your dashboard to log SME orders, see verified revenue,
                  and follow the national leaderboard.
                </p>
              </div>

              {isLoading ? (
                <div
                  className="w-full h-12 flex items-center justify-center gap-3 text-sm font-[family-name:var(--font-body)]"
                  style={{ color: "#5b5b5b" }}
                  data-testid="signing-in-spinner"
                >
                  <span className="w-4 h-4 border-2 border-black/20 border-t-black rounded-full animate-spin" />
                  Logging you in…
                </div>
              ) : (
                <>
                  {error && (
                    <div
                      className="mb-4 p-3 rounded-xl text-sm font-[family-name:var(--font-body)]"
                      style={{
                        background: "rgba(219, 71, 80, 0.08)",
                        border: "1px solid rgba(219, 71, 80, 0.3)",
                        color: "var(--color-brave-accent)",
                      }}
                      data-testid="auth-error"
                    >
                      {error}
                    </div>
                  )}
                  <button
                    onClick={() => login()}
                    data-testid="button-sign-in"
                    className="w-full h-12 bg-[#000] text-white font-[family-name:var(--font-body)] font-medium rounded-xl flex items-center justify-center gap-2 transition-all hover:opacity-90 active:scale-[0.99] group"
                    style={{ border: "1px solid rgba(33,33,33,0.53)" }}
                  >
                    Login
                    <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
                  </button>
                </>
              )}

              <div className="mt-6 grid grid-cols-3 gap-2">
                {[
                  { icon: Users, label: "Students" },
                  { icon: ShieldCheck, label: "Coordinators" },
                  { icon: Trophy, label: "Admins" },
                ].map(({ icon: Icon, label }) => (
                  <div
                    key={label}
                    className="flex flex-col items-center gap-1 rounded-xl px-2 py-2.5"
                    style={{
                      background: "#fcfaf8",
                      border: "1px solid rgba(34,34,34,0.06)",
                    }}
                  >
                    <Icon
                      className="w-3.5 h-3.5"
                      style={{ color: "var(--color-brave-accent)" }}
                    />
                    <span
                      className="text-[10px] font-[family-name:var(--font-body)] font-medium"
                      style={{ color: "#5b5b5b" }}
                    >
                      {label}
                    </span>
                  </div>
                ))}
              </div>

              <p
                className="mt-6 text-xs text-center leading-relaxed font-[family-name:var(--font-body)]"
                style={{ color: "#a6a6a6" }}
              >
                By logging in, you agree to the NIAT code of conduct and BRAVE
                program terms.
              </p>
            </div>

            <p
              className="text-center text-xs mt-6 font-[family-name:var(--font-body)]"
              style={{ color: "#a6a6a6" }}
            >
              NIAT India · BRAVE — Boosting revenue for India's SMEs
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
