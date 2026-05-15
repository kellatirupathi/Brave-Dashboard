import { useAuth } from "@workspace/replit-auth-web";
import { useEffect } from "react";
import { Link, useLocation } from "wouter";
import {
  ArrowRight,
  Search,
  Cpu,
  IndianRupee,
  Trophy,
  Users,
  ShieldCheck,
  Flag,
} from "lucide-react";
import { BraveLogo } from "@/components/brave-logo";

/* Dark "AI Value Engineering" theme — matches the landing page. */
function LoginStyles() {
  return (
    <style>{`
@import url('https://fonts.googleapis.com/css2?family=Anton&display=swap');

.bl-root {
  --bl-red: #d4402f;
  --bl-orange: #f7ac2b;
  --bl-cream: #fff3df;
  --bl-muted: rgba(255,243,223,0.62);
  position: relative;
  overflow: hidden;
  color: var(--bl-cream);
  background:
    radial-gradient(820px 520px at 14% 0%, rgba(212,64,47,.3), transparent 70%),
    radial-gradient(720px 460px at 92% 100%, rgba(247,172,43,.16), transparent 70%),
    linear-gradient(180deg,#0b0403 0%,#150603 50%,#070201 100%);
}
.bl-display { font-family: Anton, Impact, "Arial Narrow", system-ui, sans-serif; font-weight: 400; }
.bl-grid {
  position: absolute; inset: 0; pointer-events: none; z-index: 0;
  background-image:
    linear-gradient(rgba(255,255,255,.022) 1px, transparent 1px),
    linear-gradient(90deg, rgba(255,255,255,.016) 1px, transparent 1px);
  background-size: 58px 58px;
  -webkit-mask-image: radial-gradient(ellipse 70% 60% at 30% 36%, black, transparent 86%);
  mask-image: radial-gradient(ellipse 70% 60% at 30% 36%, black, transparent 86%);
}
.bl-cursor {
  position: absolute; inset: 0; pointer-events: none; z-index: 1; mix-blend-mode: screen;
  background: radial-gradient(320px 320px at var(--blx,50%) var(--bly,40%), rgba(255,120,0,.1), transparent 70%);
}
.bl-watermark {
  position: absolute; left: -7vw; bottom: -10vh; pointer-events: none; z-index: 0; user-select: none;
  font-size: clamp(240px, 40vw, 600px); line-height: .72; letter-spacing: -.08em;
  color: transparent; -webkit-text-stroke: 1.5px rgba(212,64,47,.12); transform: rotate(-4deg);
}
.bl-eyebrow {
  display: inline-flex; align-items: center; gap: 9px; width: fit-content;
  color: #ffdcab; border: 1px solid rgba(247,172,43,.32);
  background: rgba(255,132,0,.08); border-radius: 999px; padding: 9px 15px;
  font-size: 11px; font-weight: 800; letter-spacing: .12em; text-transform: uppercase;
}
.bl-dot { position: relative; width: 8px; height: 8px; }
.bl-dot::before, .bl-dot::after { content: ""; position: absolute; inset: 0; border-radius: 50%; background: #34d36a; }
.bl-dot::after { animation: blPing 1.8s ease-out infinite; }
@keyframes blPing { 0% { transform: scale(1); opacity: .8; } 100% { transform: scale(3); opacity: 0; } }
.bl-cta {
  position: relative; display: inline-flex; align-items: center; justify-content: center; gap: 9px;
  width: 100%; min-height: 54px; border-radius: 14px; font-weight: 800; font-size: 15px;
  color: #1a0500; border: 1px solid rgba(255,228,180,.5);
  background: linear-gradient(135deg, #f7ac2b 0%, #ec5b2b 52%, #d4402f 100%);
  box-shadow: 0 16px 38px rgba(212,64,47,.42), inset 0 1px 0 rgba(255,255,255,.4);
  transition: transform .2s ease, filter .2s ease, box-shadow .2s ease;
}
.bl-cta:hover { transform: translateY(-2px); filter: brightness(1.06); box-shadow: 0 22px 52px rgba(247,172,43,.4), inset 0 1px 0 rgba(255,255,255,.5); }
.bl-cta:active { transform: scale(.99); }
.bl-icon {
  width: 44px; height: 44px; border-radius: 12px; display: grid; place-items: center;
  border: 1px solid rgba(247,172,43,.3); flex: 0 0 auto;
  background: linear-gradient(135deg, rgba(212,64,47,.22), rgba(247,172,43,.12));
  box-shadow: inset 0 1px 0 rgba(255,255,255,.07);
}
.bl-card {
  position: relative; border-radius: 28px; padding: 38px;
  border: 1px solid rgba(247,172,43,.2);
  background: linear-gradient(150deg, rgba(38,10,6,.95), rgba(10,3,2,.9));
  box-shadow: 0 44px 120px rgba(0,0,0,.6);
  backdrop-filter: blur(16px); overflow: hidden;
}
.bl-card::after {
  content: ""; position: absolute; top: 0; left: 0; right: 0; height: 2px;
  background: linear-gradient(90deg, var(--bl-red), var(--bl-orange));
}

/* mini hero scene */
.bl-scene {
  position: relative; width: 100%; min-height: 240px; border-radius: 24px; overflow: hidden;
  border: 1px solid rgba(247,172,43,.18);
  background: linear-gradient(180deg, #2a0a05 0%, #160604 48%, #0a0302 100%);
  box-shadow: 0 30px 80px rgba(0,0,0,.5), inset 0 0 70px rgba(0,0,0,.5);
}
.bl-stars {
  position: absolute; inset: 0;
  background-image:
    radial-gradient(1.5px 1.5px at 20% 22%, rgba(255,243,223,.9), transparent),
    radial-gradient(1.3px 1.3px at 70% 14%, rgba(255,243,223,.7), transparent),
    radial-gradient(1.1px 1.1px at 46% 30%, rgba(255,243,223,.55), transparent),
    radial-gradient(1.4px 1.4px at 86% 28%, rgba(255,243,223,.5), transparent),
    radial-gradient(1.1px 1.1px at 12% 12%, rgba(255,243,223,.65), transparent);
}
.bl-sun {
  position: absolute; left: 50%; top: 38%; transform: translate(-50%,-50%);
  width: 120px; height: 120px; border-radius: 50%;
  background: radial-gradient(circle, #ffe6a6 0%, #f7ac2b 34%, #ec5b2b 62%, transparent 74%);
  box-shadow: 0 0 100px 34px rgba(247,172,43,.5);
  animation: blSun 5s ease-in-out infinite alternate;
}
@keyframes blSun { from { transform: translate(-50%,-50%) scale(.94); } to { transform: translate(-50%,-50%) scale(1.06); } }
.bl-haze {
  position: absolute; left: 0; right: 0; bottom: 0; height: 60%;
  background: linear-gradient(180deg, transparent, rgba(212,64,47,.3) 56%, rgba(247,172,43,.16));
}
.bl-ridge { position: absolute; bottom: 0; left: 50%; transform: translateX(-50%); }
.bl-ridge.r3 { width: 150%; height: 46%; background: #3a0f08;
  clip-path: polygon(0 100%,20% 44%,40% 74%,58% 26%,78% 60%,100% 36%,100% 100%); opacity: .8; }
.bl-ridge.r2 { width: 130%; height: 80%;
  background: linear-gradient(160deg, #6a1c0e 0%, #260805 64%);
  clip-path: polygon(0 100%, 50% 6%, 100% 100%); }
.bl-ridge.r1 { width: 130%; height: 80%;
  background: linear-gradient(120deg, rgba(247,172,43,.5) 0%, rgba(247,172,43,0) 32%);
  clip-path: polygon(0 100%, 50% 6%, 100% 100%); }
.bl-ridge.rim { width: 130%; height: 80%;
  background: linear-gradient(180deg, rgba(255,230,166,.9) 0 1.6%, transparent 3%);
  clip-path: polygon(0 100%, 50% 6%, 100% 100%); }
.bl-summit {
  position: absolute; left: 50%; bottom: 74%; transform: translateX(-50%);
  display: grid; place-items: center; width: 26px; height: 26px;
}
.bl-summit::before {
  content: ""; position: absolute; width: 26px; height: 26px; border-radius: 50%;
  background: radial-gradient(circle, rgba(255,230,166,.7), transparent 68%);
  animation: blSun 3s ease-in-out infinite alternate;
}
@media (prefers-reduced-motion: reduce) {
  .bl-cta { transition: none; }
  .bl-sun, .bl-summit::before, .bl-dot::after { animation: none; }
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

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      document.body.style.setProperty("--blx", `${e.clientX}px`);
      document.body.style.setProperty("--bly", `${e.clientY}px`);
    };
    window.addEventListener("pointermove", onMove);
    return () => window.removeEventListener("pointermove", onMove);
  }, []);

  return (
    <div className="bl-root min-h-screen flex flex-col lg:flex-row">
      <LoginStyles />
      <div className="bl-cursor" aria-hidden />

      {/* Left — dark hero panel */}
      <div className="relative hidden lg:flex flex-col justify-between lg:w-[55%] xl:w-[57%] px-12 py-12 overflow-hidden">
        <div className="bl-grid" aria-hidden />
        <div className="bl-watermark bl-display" aria-hidden>
          BRAVE
        </div>

        <div className="relative z-10">
          <Link href="/" data-testid="link-home">
            <BraveLogo className="text-[24px]" />
          </Link>
        </div>

        <div className="relative z-10 max-w-xl">
          <div className="bl-eyebrow">
            <span className="bl-dot" /> BRAVE 2026 · 15 Apr – 15 Jul
          </div>
          <h1
            className="bl-display mt-6"
            style={{
              fontSize: "clamp(46px, 5vw, 86px)",
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
              maxWidth: 470,
              color: "var(--bl-muted)",
              fontSize: 16,
              fontWeight: 600,
              lineHeight: 1.6,
            }}
          >
            Find a small business. Increase their revenue with AI. Get them to
            pay you. Log in to track your team, projects, and verified revenue.
          </p>

          <div className="grid grid-cols-2 gap-2.5 mt-8">
            {FEATURES.map(({ icon: Icon, label }) => (
              <div
                key={label}
                className="flex items-center gap-3 rounded-2xl px-3.5 py-3"
                style={{
                  border: "1px solid rgba(255,164,32,.14)",
                  background:
                    "linear-gradient(160deg, rgba(255,255,255,.045), rgba(255,255,255,.012))",
                }}
              >
                <div className="bl-icon" style={{ width: 38, height: 38 }}>
                  <Icon
                    className="w-[17px] h-[17px]"
                    style={{ color: "var(--bl-orange)" }}
                  />
                </div>
                <span style={{ fontWeight: 700, fontSize: 13.5 }}>{label}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="relative z-10 flex items-center gap-8">
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
                  fontSize: 12,
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
      <div className="relative flex items-center justify-center w-full lg:w-[45%] xl:w-[43%] px-6 py-12">
        <div className="bl-grid lg:hidden" aria-hidden />
        <div className="relative z-10 w-full max-w-md">
          {/* mobile logo */}
          <Link
            href="/"
            data-testid="link-mobile-home"
            className="flex lg:hidden justify-center mb-7"
          >
            <BraveLogo className="text-[26px]" />
          </Link>

          <div className="bl-card">
            {/* mini mountain scene */}
            <div className="bl-scene mb-7" aria-hidden>
              <div className="bl-stars" />
              <div className="bl-sun" />
              <div className="bl-haze" />
              <div className="bl-ridge r3" />
              <div className="bl-ridge r2" />
              <div className="bl-ridge r1" />
              <div className="bl-ridge rim" />
              <div className="bl-summit">
                <Flag
                  className="w-3 h-3 relative"
                  style={{ color: "var(--bl-orange)" }}
                />
              </div>
            </div>

            <div
              className="inline-flex items-center gap-2 rounded-full px-3 py-1 mb-5"
              style={{
                background: "rgba(247,172,43,.1)",
                border: "1px solid rgba(247,172,43,.3)",
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
                  letterSpacing: ".1em",
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
                fontSize: "clamp(32px, 4vw, 46px)",
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
                  className="flex items-center justify-center gap-3"
                  style={{
                    height: 54,
                    color: "var(--bl-muted)",
                    fontSize: 14,
                  }}
                  data-testid="signing-in-spinner"
                >
                  <span
                    className="w-4 h-4 rounded-full animate-spin"
                    style={{
                      border: "2px solid rgba(255,243,223,.2)",
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
                        background: "rgba(212,64,47,.14)",
                        border: "1px solid rgba(212,64,47,.4)",
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
                color: "rgba(255,243,223,.4)",
              }}
            >
              By logging in, you agree to the NIAT code of conduct and BRAVE
              programme terms.
            </p>
          </div>

          <p
            className="text-center mt-6"
            style={{ fontSize: 12, color: "rgba(255,243,223,.38)" }}
          >
            NIAT India · Boosting Revenue through AI Value Engineering
          </p>
        </div>
      </div>
    </div>
  );
}
