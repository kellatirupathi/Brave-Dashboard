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
} from "lucide-react";

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
    <div className="min-h-screen flex bg-[hsl(0_65%_14%)]">
      {/* Left — Hero Panel */}
      <div className="hidden lg:flex flex-col justify-between flex-1 relative overflow-hidden px-12 py-10">
        <div className="absolute inset-0 bg-gradient-to-br from-[hsl(0_65%_16%)] via-[hsl(0_70%_22%)] to-[hsl(0_70%_14%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_60%_at_60%_40%,rgba(245,180,40,0.10),transparent)]" />
        <div
          className="absolute inset-0 opacity-[0.04]"
          style={{
            backgroundImage:
              "linear-gradient(rgba(255,230,170,1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,230,170,1) 1px, transparent 1px)",
            backgroundSize: "60px 60px",
          }}
        />
        <div className="absolute top-1/4 left-1/4 w-64 h-64 rounded-full bg-[hsl(0_85%_45%)]/15 blur-3xl" />
        <div className="absolute bottom-1/3 right-1/4 w-80 h-80 rounded-full bg-[hsl(45_95%_55%)]/10 blur-3xl" />

        <div className="relative z-10 flex items-center justify-between">
          <Link
            href="/"
            data-testid="link-back-home"
            className="flex items-center gap-3 hover-elevate rounded-lg px-2 py-1 -ml-2"
          >
            <div className="w-9 h-9 rounded-lg bg-[hsl(0_75%_45%)] flex items-center justify-center shadow-lg shadow-black/40">
              <span className="text-[hsl(45_95%_60%)] font-black text-sm">N</span>
            </div>
            <span className="text-[hsl(45_80%_96%)]/85 font-semibold text-sm tracking-wide">
              NIAT India
            </span>
            <span className="text-[hsl(45_80%_96%)]/25 mx-1">|</span>
            <span className="text-[hsl(45_95%_60%)] font-bold text-sm tracking-widest uppercase">
              BRAVE
            </span>
          </Link>
        </div>

        <div className="relative z-10 max-w-lg">
          <div className="inline-flex items-center gap-2 bg-[hsl(0_70%_18%)]/80 border border-[hsl(0_60%_38%)]/50 rounded-full px-4 py-1.5 mb-8">
            <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
            <span className="text-[hsl(45_90%_75%)] text-xs font-semibold tracking-wider uppercase">
              BRAVE 2026 — Boost SME revenue
            </span>
          </div>

          <h1 className="text-5xl font-black text-[hsl(45_80%_96%)] leading-[1.1] mb-6">
            Boost real revenue
            <br />
            for{" "}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-[hsl(0_85%_55%)] to-[hsl(45_95%_60%)]">
              India's SMEs.
            </span>
          </h1>

          <p className="text-[hsl(45_60%_92%)]/65 text-lg leading-relaxed mb-10">
            Sign in to track your team's progress, log SME orders, see verified
            revenue, and climb the national leaderboard across 20 NIAT campuses.
          </p>

          <div className="flex flex-wrap gap-3">
            {[
              { icon: Sparkles, label: "Build with AI" },
              { icon: Users, label: "Real SME clients" },
              { icon: IndianRupee, label: "Verified revenue" },
              { icon: Trophy, label: "Demo Day finale" },
            ].map(({ icon: Icon, label }) => (
              <div
                key={label}
                className="flex items-center gap-2 bg-[hsl(0_60%_28%)]/40 border border-[hsl(45_70%_50%)]/20 rounded-full px-4 py-2"
              >
                <Icon className="w-3.5 h-3.5 text-[hsl(45_95%_60%)]" />
                <span className="text-[hsl(45_70%_92%)]/75 text-xs font-medium">
                  {label}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="relative z-10 flex items-center gap-8">
          {[
            { value: "7,500+", label: "NIAT Students" },
            { value: "20", label: "Campuses" },
            { value: "₹5 Cr", label: "Funding pool" },
          ].map(({ value, label }) => (
            <div key={label}>
              <p className="text-2xl font-black text-[hsl(45_80%_96%)]">{value}</p>
              <p className="text-[hsl(45_60%_88%)]/55 text-xs mt-0.5">{label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Right — Login Card */}
      <div className="flex items-center justify-center w-full lg:w-[480px] px-8 py-10 relative">
        <div className="absolute inset-0 bg-[hsl(0_70%_12%)] lg:border-l border-[hsl(0_50%_30%)]/40" />

        <div className="relative z-10 w-full max-w-sm">
          <Link
            href="/"
            data-testid="link-back-marketing"
            className="hidden lg:inline-flex items-center gap-1.5 text-[hsl(45_70%_92%)]/60 hover:text-[hsl(45_95%_60%)] text-xs font-medium mb-5"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Back to BRAVE
          </Link>

          <div className="bg-[hsl(0_65%_16%)] border border-[hsl(0_50%_30%)]/50 rounded-2xl p-8 shadow-2xl shadow-black/60">
            <Link
              href="/"
              data-testid="link-mobile-home"
              className="flex lg:hidden items-center gap-3 mb-8 hover-elevate rounded-lg p-1 -m-1"
            >
              <div className="w-9 h-9 rounded-lg bg-[hsl(0_75%_45%)] flex items-center justify-center">
                <span className="text-[hsl(45_95%_60%)] font-black text-sm">N</span>
              </div>
              <div>
                <p className="text-[hsl(45_80%_96%)] font-bold text-sm leading-none">
                  NIAT India
                </p>
                <p className="text-[hsl(45_95%_60%)] text-xs font-semibold tracking-widest uppercase mt-0.5">
                  BRAVE
                </p>
              </div>
            </Link>

            <div className="mb-8">
              <h2 className="text-[hsl(45_80%_96%)] text-2xl font-black mb-2">
                Sign in to BRAVE
              </h2>
              <p className="text-[hsl(45_60%_92%)]/60 text-sm leading-relaxed">
                Access your dashboard to log SME orders, see verified revenue,
                and follow the national leaderboard.
              </p>
            </div>

            {isLoading ? (
              <div
                className="w-full h-12 flex items-center justify-center gap-3 text-[hsl(45_70%_92%)]/80 text-sm"
                data-testid="signing-in-spinner"
              >
                <span className="w-4 h-4 border-2 border-[hsl(45_95%_60%)]/30 border-t-[hsl(45_95%_60%)] rounded-full animate-spin" />
                Signing you in…
              </div>
            ) : (
              <>
                {error && (
                  <div
                    className="mb-4 p-3 rounded-lg bg-[hsl(0_80%_22%)]/60 border border-[hsl(0_85%_55%)]/40 text-[hsl(0_90%_85%)] text-sm"
                    data-testid="auth-error"
                  >
                    {error}
                  </div>
                )}
                <button
                  onClick={() => login()}
                  data-testid="button-sign-in"
                  className="w-full h-12 bg-[hsl(0_75%_45%)] hover:bg-[hsl(0_80%_50%)] text-[hsl(45_60%_98%)] font-semibold rounded-xl flex items-center justify-center gap-2 transition-all duration-200 shadow-lg shadow-[hsl(0_75%_45%)]/30 hover:shadow-[hsl(45_95%_55%)]/40 hover:-translate-y-0.5 active:translate-y-0 group"
                >
                  Sign In
                  <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
                </button>
              </>
            )}

            <p className="mt-5 text-xs text-[hsl(45_60%_88%)]/40 text-center leading-relaxed">
              By signing in, you agree to the NIAT code of conduct and BRAVE
              program terms.
            </p>
          </div>

          <p className="text-center text-[hsl(45_60%_88%)]/35 text-xs mt-6">
            NIAT India · BRAVE — Boosting revenue for India's SMEs
          </p>
        </div>
      </div>
    </div>
  );
}
