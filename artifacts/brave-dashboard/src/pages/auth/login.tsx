import { useAuth } from "@workspace/replit-auth-web";
import { useEffect } from "react";
import { Link, useLocation } from "wouter";
import {
  ArrowRight,
  ArrowLeft,
  Search,
  Cpu,
  IndianRupee,
  Trophy,
  Users,
  ShieldCheck,
} from "lucide-react";
import { BraveLogo } from "@/components/brave-logo";

/* Dark "AI Value Engineering" theme — matches the landing page. */
function LoginStyles() {
  return (
    <style>{`
@import url('https://fonts.googleapis.com/css2?family=Anton&display=swap');

.bl-root {
  --bl-red: #c73a2e;
  --bl-orange: #f5a321;
  --bl-cream: #fff2db;
  --bl-muted: rgba(255,242,219,0.64);
  position: relative;
  overflow: hidden;
  color: var(--bl-cream);
  background:
    radial-gradient(circle at 16% 6%, rgba(197,32,23,.26), transparent 36%),
    radial-gradient(circle at 86% 90%, rgba(255,164,32,.12), transparent 32%),
    linear-gradient(180deg,#0a0302 0%,#130402 50%,#080201 100%);
}
.bl-display { font-family: Anton, Impact, "Arial Narrow", system-ui, sans-serif; }
.bl-grid {
  position: absolute; inset: 0; pointer-events: none; z-index: 0;
  background-image:
    linear-gradient(rgba(255,255,255,.025) 1px, transparent 1px),
    linear-gradient(90deg, rgba(255,255,255,.018) 1px, transparent 1px);
  background-size: 54px 54px;
  -webkit-mask-image: radial-gradient(ellipse 70% 60% at 30% 40%, black, transparent 85%);
  mask-image: radial-gradient(ellipse 70% 60% at 30% 40%, black, transparent 85%);
}
.bl-watermark {
  position: absolute; left: -6vw; bottom: -8vh; pointer-events: none; z-index: 0;
  font-size: clamp(220px, 36vw, 560px); line-height: .74; letter-spacing: -.08em;
  color: rgba(199,58,46,.07); transform: rotate(-4deg);
}
.bl-eyebrow {
  display: inline-flex; align-items: center; gap: 9px; width: fit-content;
  color: #ffd7ad; border: 1px solid rgba(255,164,32,.26);
  background: rgba(255,132,0,.07); border-radius: 999px; padding: 9px 14px;
  font-size: 11.5px; font-weight: 800; letter-spacing: .09em; text-transform: uppercase;
}
.bl-dot { width: 8px; height: 8px; border-radius: 50%; background: #34d36a; box-shadow: 0 0 14px #34d36a; }
.bl-cta {
  display: inline-flex; align-items: center; justify-content: center; gap: 8px;
  width: 100%; min-height: 52px; border-radius: 14px; font-weight: 800; font-size: 15px;
  color: #160100; border: 1px solid rgba(255,230,190,.24);
  background: linear-gradient(135deg, #d53d2f, #f2a11f);
  box-shadow: 0 16px 40px rgba(199,58,46,.32);
  transition: transform .2s ease, filter .2s ease;
}
.bl-cta:hover { transform: translateY(-2px); filter: saturate(1.18); }
.bl-cta:active { transform: scale(.99); }
.bl-back {
  display: inline-flex; align-items: center; gap: 7px;
  color: var(--bl-muted); font-size: 13px; font-weight: 600;
  transition: color .2s ease;
}
.bl-back:hover { color: var(--bl-cream); }
.bl-icon {
  width: 42px; height: 42px; border-radius: 12px; display: grid; place-items: center;
  border: 1px solid rgba(245,163,33,.3);
  background: linear-gradient(135deg, rgba(199,58,46,.18), rgba(245,163,33,.1));
}
.bl-card {
  border-radius: 26px; padding: 36px;
  border: 1px solid rgba(255,164,32,.18);
  background: linear-gradient(140deg, rgba(28,5,3,.92), rgba(9,2,1,.86));
  box-shadow: 0 40px 110px rgba(0,0,0,.5);
  backdrop-filter: blur(14px);
}
@media (prefers-reduced-motion: reduce) {
  .bl-cta { transition: none; }
}
`}</style>
  );
}

const FEATURES = [
  { icon: Search, label: "Hunt a real business problem" },
  { icon: Cpu, label: "Build an AI-powered fix" },
  { icon: IndianRupee, label: "Earn verified revenue" },
  { icon: Trophy, label: "Pitch at Demo Day" },
];

const STATS = [
  { value: "7,500+", label: "NIAT students" },
  { value: "19+", label: "Campuses" },
  { value: "15 Jul", label: "Demo Day" },
];

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
    <div className="bl-root min-h-screen flex flex-col lg:flex-row">
      <LoginStyles />

      {/* Left — dark hero panel */}
      <div className="relative hidden lg:flex flex-col justify-between lg:w-[56%] xl:w-[58%] px-12 py-12 overflow-hidden">
        <div className="bl-grid" aria-hidden />
        <div className="bl-watermark bl-display" aria-hidden>
          BRAVE
        </div>

        <div className="relative z-10 flex items-center justify-between">
          <Link href="/" data-testid="link-back-home">
            <BraveLogo className="text-[24px]" />
          </Link>
          <Link href="/" data-testid="link-back-landing" className="bl-back">
            <ArrowLeft className="w-4 h-4" />
            Back to site
          </Link>
        </div>

        <div className="relative z-10 max-w-xl">
          <div className="bl-eyebrow">
            <span className="bl-dot" /> BRAVE 2026 · 15 Apr – 15 Jul
          </div>
          <h1
            className="bl-display mt-6"
            style={{
              fontSize: "clamp(48px, 5.4vw, 92px)",
              lineHeight: 0.88,
              letterSpacing: "-.055em",
              textTransform: "uppercase",
            }}
          >
            Boosting Revenue{" "}
            <span style={{ color: "var(--bl-red)" }}>through AI</span>{" "}
            <span style={{ color: "var(--bl-orange)" }}>Value Engineering</span>
          </h1>
          <p
            className="mt-5"
            style={{
              maxWidth: 480,
              color: "var(--bl-muted)",
              fontSize: 16.5,
              fontWeight: 600,
              lineHeight: 1.6,
            }}
          >
            Find a small business. Increase their revenue with AI. Get them to
            pay you. Log in to track your team, projects, and verified revenue.
          </p>

          <div className="flex flex-col gap-2.5 mt-8">
            {FEATURES.map(({ icon: Icon, label }) => (
              <div key={label} className="flex items-center gap-3">
                <div className="bl-icon">
                  <Icon
                    className="w-[18px] h-[18px]"
                    style={{ color: "var(--bl-orange)" }}
                  />
                </div>
                <span style={{ fontWeight: 700, fontSize: 14.5 }}>{label}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="relative z-10 flex items-center gap-9">
          {STATS.map((s) => (
            <div key={s.label}>
              <p
                className="bl-display"
                style={{ fontSize: 34, color: "var(--bl-orange)" }}
              >
                {s.value}
              </p>
              <p
                style={{
                  marginTop: 2,
                  fontSize: 12.5,
                  fontWeight: 600,
                  color: "var(--bl-muted)",
                }}
              >
                {s.label}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* Right — login panel */}
      <div className="relative flex items-center justify-center w-full lg:w-[44%] xl:w-[42%] px-6 py-12">
        <div className="bl-grid lg:hidden" aria-hidden />
        <div className="relative z-10 w-full max-w-md">
          <div className="bl-card">
            <Link
              href="/"
              data-testid="link-mobile-home"
              className="flex lg:hidden items-center justify-between mb-8"
            >
              <BraveLogo className="text-[24px]" />
              <span className="bl-back">
                <ArrowLeft className="w-4 h-4" />
                Back
              </span>
            </Link>

            <div
              className="inline-flex items-center gap-2 rounded-full px-3 py-1 mb-6"
              style={{
                background: "rgba(245,163,33,.1)",
                border: "1px solid rgba(245,163,33,.3)",
              }}
            >
              <ShieldCheck
                className="w-3.5 h-3.5"
                style={{ color: "var(--bl-orange)" }}
              />
              <span
                style={{
                  fontSize: 10,
                  fontWeight: 800,
                  letterSpacing: ".09em",
                  textTransform: "uppercase",
                  color: "var(--bl-orange)",
                }}
              >
                Secure NIAT login
              </span>
            </div>

            <h2
              className="bl-display"
              style={{
                fontSize: "clamp(32px, 4vw, 44px)",
                lineHeight: 0.92,
                letterSpacing: "-.04em",
                textTransform: "uppercase",
              }}
            >
              Login to <span style={{ color: "var(--bl-orange)" }}>BRAVE</span>
            </h2>
            <p
              className="mt-2.5"
              style={{
                color: "var(--bl-muted)",
                fontSize: 14,
                fontWeight: 500,
                lineHeight: 1.55,
              }}
            >
              Access your dashboard to log orders, see verified revenue, and
              follow the national leaderboard.
            </p>

            <div className="mt-7">
              {isLoading ? (
                <div
                  className="flex items-center justify-center gap-3 h-[52px]"
                  style={{ color: "var(--bl-muted)", fontSize: 14 }}
                  data-testid="signing-in-spinner"
                >
                  <span
                    className="w-4 h-4 rounded-full animate-spin"
                    style={{
                      border: "2px solid rgba(255,242,219,.2)",
                      borderTopColor: "var(--bl-orange)",
                    }}
                  />
                  Logging you in…
                </div>
              ) : (
                <>
                  {error && (
                    <div
                      className="mb-4 p-3 rounded-xl"
                      style={{
                        fontSize: 13.5,
                        background: "rgba(199,58,46,.14)",
                        border: "1px solid rgba(199,58,46,.4)",
                        color: "#ffb9a8",
                      }}
                      data-testid="auth-error"
                    >
                      {error}
                    </div>
                  )}
                  <button
                    onClick={() => login()}
                    data-testid="button-sign-in"
                    className="bl-cta group"
                  >
                    Login to Dashboard
                    <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5" />
                  </button>
                </>
              )}
            </div>

            <div className="grid grid-cols-3 gap-2 mt-6">
              {[
                { icon: Users, label: "Students" },
                { icon: ShieldCheck, label: "Coordinators" },
                { icon: Trophy, label: "Admins" },
              ].map(({ icon: Icon, label }) => (
                <div
                  key={label}
                  className="flex flex-col items-center gap-1.5 rounded-xl px-2 py-3"
                  style={{
                    background: "rgba(255,255,255,.04)",
                    border: "1px solid rgba(255,164,32,.14)",
                  }}
                >
                  <Icon
                    className="w-4 h-4"
                    style={{ color: "var(--bl-orange)" }}
                  />
                  <span
                    style={{
                      fontSize: 10.5,
                      fontWeight: 700,
                      color: "var(--bl-muted)",
                    }}
                  >
                    {label}
                  </span>
                </div>
              ))}
            </div>

            <p
              className="mt-6 text-center"
              style={{
                fontSize: 11.5,
                lineHeight: 1.6,
                color: "rgba(255,242,219,.4)",
              }}
            >
              By logging in, you agree to the NIAT code of conduct and BRAVE
              programme terms.
            </p>
          </div>

          <p
            className="text-center mt-6"
            style={{ fontSize: 12, color: "rgba(255,242,219,.38)" }}
          >
            NIAT India · BRAVE — Boosting Revenue through AI Value Engineering
          </p>
        </div>
      </div>
    </div>
  );
}
