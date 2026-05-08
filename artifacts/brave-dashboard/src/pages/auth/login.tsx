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
import { BraveLogo } from "@/components/brave-logo";

/* ---------- BRAVE wordmark ---------- */
// Thin wrapper around the shared BraveLogo so existing call sites in this
// page (header + mobile card) keep working unchanged. NIAT shield was
// removed per brand decision — the BRAVE wordmark stands on its own.
function BraveWordmark() {
  return <BraveLogo className="text-2xl" />;
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

  // 2026 BRAVE brand: 4-color palette only (red, black, white, amber). No
  // gradients, no drop shadows, no extra colors. Headlines uppercase in
  // Bebas Neue; body text in Montserrat.
  return (
    <div
      className="min-h-screen flex flex-col relative"
      style={{
        background: "#F4F1EC",
        color: "#111111",
        fontFamily: "var(--font-brave-ui)",
      }}
    >
      <Ticker />

      {/* Page-level back nav — anchored top-left, just below ticker */}

      <div className="flex-1 flex flex-col lg:flex-row">
        {/* Left — Hero Panel (solid Bone White, no gradient, no blurs) */}
        <div
          className="hidden lg:flex flex-col justify-between lg:w-[58%] xl:w-[60%] relative overflow-hidden px-12 py-12 border-r border-black/10"
          style={{ background: "#F4F1EC" }}
        >
          <div className="relative z-10">
            <Link href="/" data-testid="link-back-home">
              <BraveWordmark />
            </Link>
          </div>

          <div className="relative z-10 max-w-lg">
            <div
              className="inline-flex items-center gap-2 px-4 py-1.5 mb-8"
              style={{
                background: "#FFFFFF",
                border: "1px solid #111111",
              }}
            >
              <span
                className="w-2 h-2 rounded-full animate-pulse"
                style={{ background: "#C0392B" }}
              />
              <span
                className="text-xs font-bold tracking-[0.3em] uppercase"
                style={{ color: "#111111", fontFamily: "var(--font-brave-ui)" }}
              >
                BRAVE 2026 — Boost SME revenue
              </span>
            </div>

            <h1
              className="mb-6 uppercase"
              style={{
                fontFamily: "var(--font-brave-display)",
                fontSize: "clamp(40px, 5vw, 64px)",
                lineHeight: 0.95,
                color: "#111111",
                letterSpacing: "-0.03em",
              }}
            >
              Boost real revenue
              <br />
              for <span style={{ color: "#C0392B" }}>India's SMEs.</span>
            </h1>

            <p
              className="text-lg mb-10"
              style={{
                color: "#5b5b5b",
                lineHeight: 1.65,
                fontFamily: "var(--font-brave-ui)",
              }}
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
                  className="flex items-center gap-2 px-4 py-2"
                  style={{
                    background: "#FFFFFF",
                    border: "1px solid #111111",
                  }}
                >
                  <Icon className="w-3.5 h-3.5" style={{ color: "#C0392B" }} />
                  <span
                    className="text-xs font-medium uppercase tracking-wider"
                    style={{
                      color: "#111111",
                      fontFamily: "var(--font-brave-ui)",
                    }}
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
                  className="text-3xl"
                  style={{
                    color: "#111111",
                    fontFamily: "var(--font-brave-display)",
                    letterSpacing: "-0.02em",
                    lineHeight: 1,
                  }}
                >
                  {value}
                </p>
                <p
                  className="text-xs mt-1 uppercase tracking-[0.2em]"
                  style={{
                    color: "#5b5b5b",
                    fontFamily: "var(--font-brave-ui)",
                  }}
                >
                  {label}
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* Right — Login Panel (solid background, no shadow, sharper border) */}
        <div
          className="flex items-center justify-center w-full lg:w-[42%] xl:w-[40%] px-6 py-10 relative"
          style={{ background: "#F4F1EC" }}
        >
          <div className="relative z-10 w-full max-w-md">
            <div
              className="bg-white p-10"
              style={{ border: "1px solid #111111" }}
            >
              <Link
                href="/"
                data-testid="link-mobile-home"
                className="flex lg:hidden items-center mb-8"
              >
                <BraveWordmark />
              </Link>

              <div
                className="inline-flex items-center gap-2 px-3 py-1 mb-6"
                style={{
                  background: "rgba(192, 57, 43, 0.06)",
                  border: "1px solid #C0392B",
                }}
              >
                <ShieldCheck
                  className="w-3.5 h-3.5"
                  style={{ color: "#C0392B" }}
                />
                <span
                  className="text-[10px] font-bold tracking-[0.3em] uppercase"
                  style={{
                    color: "#C0392B",
                    fontFamily: "var(--font-brave-ui)",
                  }}
                >
                  Secure NIAT login
                </span>
              </div>

              <div className="mb-8">
                <h2
                  className="mb-2 uppercase"
                  style={{
                    fontFamily: "var(--font-brave-display)",
                    fontSize: "clamp(28px, 3.2vw, 36px)",
                    lineHeight: 1,
                    color: "#111111",
                    letterSpacing: "-0.03em",
                  }}
                >
                  Login to <span style={{ color: "#C0392B" }}>BRAVE</span>
                </h2>
                <p
                  className="text-sm"
                  style={{
                    color: "#5b5b5b",
                    lineHeight: 1.6,
                    fontFamily: "var(--font-brave-ui)",
                  }}
                >
                  Access your dashboard to log SME orders, see verified revenue,
                  and follow the national leaderboard.
                </p>
              </div>

              {isLoading ? (
                <div
                  className="w-full h-12 flex items-center justify-center gap-3 text-sm"
                  style={{
                    color: "#5b5b5b",
                    fontFamily: "var(--font-brave-ui)",
                  }}
                  data-testid="signing-in-spinner"
                >
                  <span className="w-4 h-4 border-2 border-black/20 border-t-black rounded-full animate-spin" />
                  Logging you in…
                </div>
              ) : (
                <>
                  {error && (
                    <div
                      className="mb-4 p-3 text-sm"
                      style={{
                        background: "rgba(192, 57, 43, 0.08)",
                        border: "1px solid #C0392B",
                        color: "#C0392B",
                        fontFamily: "var(--font-brave-ui)",
                      }}
                      data-testid="auth-error"
                    >
                      {error}
                    </div>
                  )}
                  <button
                    onClick={() => login()}
                    data-testid="button-sign-in"
                    className="w-full h-12 text-white font-medium flex items-center justify-center gap-2 transition-all hover:opacity-90 active:scale-[0.99] group uppercase tracking-[0.2em]"
                    style={{
                      background: "#111111",
                      fontFamily: "var(--font-brave-ui)",
                    }}
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
                    className="flex flex-col items-center gap-1 px-2 py-2.5"
                    style={{
                      background: "#F4F1EC",
                      border: "1px solid #111111",
                    }}
                  >
                    <Icon
                      className="w-3.5 h-3.5"
                      style={{ color: "#C0392B" }}
                    />
                    <span
                      className="text-[10px] uppercase tracking-[0.2em]"
                      style={{
                        color: "#5b5b5b",
                        fontFamily: "var(--font-brave-ui)",
                      }}
                    >
                      {label}
                    </span>
                  </div>
                ))}
              </div>

              <p
                className="mt-6 text-xs text-center leading-relaxed"
                style={{
                  color: "#a6a6a6",
                  fontFamily: "var(--font-brave-ui)",
                }}
              >
                By logging in, you agree to the NIAT code of conduct and BRAVE
                program terms.
              </p>
            </div>

            <p
              className="text-center text-xs mt-6 uppercase tracking-[0.2em]"
              style={{ color: "#a6a6a6", fontFamily: "var(--font-brave-ui)" }}
            >
              NIAT India · BRAVE — Boosting revenue for India's SMEs
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
