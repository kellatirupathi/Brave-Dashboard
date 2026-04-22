import { useAuth } from "@workspace/replit-auth-web";
import { useEffect } from "react";
import { useLocation } from "wouter";
import { ArrowRight, TrendingUp, Trophy, Users, Calendar } from "lucide-react";

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
    <div className="min-h-screen flex bg-[#0a0a0f]">
      {/* Left — Hero Panel */}
      <div className="hidden lg:flex flex-col justify-between flex-1 relative overflow-hidden px-12 py-10">
        <div className="absolute inset-0 bg-gradient-to-br from-[#0a0a0f] via-[#0d0d1a] to-[#0a0a0f]" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_60%_at_60%_40%,rgba(99,102,241,0.12),transparent)]" />
        <div
          className="absolute inset-0 opacity-[0.04]"
          style={{
            backgroundImage:
              "linear-gradient(rgba(255,255,255,1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,1) 1px, transparent 1px)",
            backgroundSize: "60px 60px",
          }}
        />
        <div className="absolute top-1/4 left-1/4 w-64 h-64 rounded-full bg-indigo-600/5 blur-3xl" />
        <div className="absolute bottom-1/3 right-1/4 w-80 h-80 rounded-full bg-violet-600/5 blur-3xl" />

        <div className="relative z-10 flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-indigo-600 flex items-center justify-center shadow-lg">
            <span className="text-white font-black text-sm">N</span>
          </div>
          <span className="text-white/80 font-semibold text-sm tracking-wide">
            NIAT India
          </span>
          <span className="text-white/20 mx-1">|</span>
          <span className="text-indigo-400 font-bold text-sm tracking-widest uppercase">
            BRAVE
          </span>
        </div>

        <div className="relative z-10 max-w-lg">
          <div className="inline-flex items-center gap-2 bg-indigo-950/80 border border-indigo-500/30 rounded-full px-4 py-1.5 mb-8">
            <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
            <span className="text-indigo-300 text-xs font-semibold tracking-wider uppercase">
              BRAVE 2025 Programme — Live
            </span>
          </div>

          <h1 className="text-5xl font-black text-white leading-[1.1] mb-6">
            Build Real
            <br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 to-violet-400">
              Ventures.
            </span>
            <br />
            Earn Real Revenue.
          </h1>

          <p className="text-white/50 text-lg leading-relaxed mb-10">
            Track your team's journey from idea to income. Log orders, verify revenue,
            and compete on the national leaderboard across 20 NIAT campuses.
          </p>

          <div className="flex flex-wrap gap-3">
            {[
              { icon: TrendingUp, label: "Revenue Tracking" },
              { icon: Trophy, label: "National Leaderboard" },
              { icon: Users, label: "Team Management" },
              { icon: Calendar, label: "Demo Day" },
            ].map(({ icon: Icon, label }) => (
              <div
                key={label}
                className="flex items-center gap-2 bg-white/5 border border-white/10 rounded-full px-4 py-2"
              >
                <Icon className="w-3.5 h-3.5 text-indigo-400" />
                <span className="text-white/60 text-xs font-medium">{label}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="relative z-10 flex items-center gap-8">
          {[
            { value: "7,500+", label: "Student Entrepreneurs" },
            { value: "20", label: "NIAT Campuses" },
            { value: "3", label: "Month Programme" },
          ].map(({ value, label }) => (
            <div key={label}>
              <p className="text-2xl font-black text-white">{value}</p>
              <p className="text-white/40 text-xs mt-0.5">{label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Right — Login Card */}
      <div className="flex items-center justify-center w-full lg:w-[480px] px-8 py-10 relative">
        <div className="absolute inset-0 bg-[#0d0d1a] lg:border-l border-white/[0.06]" />

        <div className="relative z-10 w-full max-w-sm">
          <div className="bg-[#13131f] border border-white/[0.08] rounded-2xl p-8 shadow-2xl shadow-black/60">
            <div className="flex lg:hidden items-center gap-3 mb-8">
              <div className="w-9 h-9 rounded-lg bg-indigo-600 flex items-center justify-center">
                <span className="text-white font-black text-sm">N</span>
              </div>
              <div>
                <p className="text-white font-bold text-sm leading-none">NIAT India</p>
                <p className="text-indigo-400 text-xs font-semibold tracking-widest uppercase mt-0.5">
                  BRAVE
                </p>
              </div>
            </div>

            <div className="mb-8">
              <h2 className="text-white text-2xl font-black mb-2">
                BRAVE Programme
              </h2>
              <p className="text-white/40 text-sm leading-relaxed">
                Access your dashboard, track revenue, and view the national leaderboard for the BRAVE entrepreneurship programme.
              </p>
            </div>

            {isLoading ? (
              <div
                className="w-full h-12 flex items-center justify-center gap-3 text-white/70 text-sm"
                data-testid="signing-in-spinner"
              >
                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Signing you in…
              </div>
            ) : (
              <>
                {error && (
                  <div
                    className="mb-4 p-3 rounded-lg bg-red-950/40 border border-red-500/30 text-red-300 text-sm"
                    data-testid="auth-error"
                  >
                    {error}
                  </div>
                )}
                <button
                  onClick={() => login()}
                  data-testid="button-sign-in"
                  className="w-full h-12 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold rounded-xl flex items-center justify-center gap-2 transition-all duration-200 shadow-lg shadow-indigo-600/30 hover:shadow-indigo-500/40 hover:-translate-y-0.5 active:translate-y-0 group"
                >
                  Sign In
                  <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
                </button>
              </>
            )}

            <p className="mt-5 text-xs text-white/20 text-center leading-relaxed">
              By signing in, you agree to the NIAT code of conduct and BRAVE programme terms.
            </p>
          </div>

          <p className="text-center text-white/20 text-xs mt-6">
            NIAT India &mdash; BRAVE Entrepreneurship Programme
          </p>
        </div>
      </div>
    </div>
  );
}
