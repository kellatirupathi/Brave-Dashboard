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
} from "lucide-react";
import { BraveLogo } from "@/components/brave-logo";

/* Dark "AI Value Engineering" theme — Sora + Inter, tuned for smooth render. */
function LoginStyles() {
  return (
    <style>{`
@import url('https://fonts.googleapis.com/css2?family=Sora:wght@500;600;700;800&family=Inter:wght@400;500;600;700&display=swap');

.bl-root {
  --bl-red: #d4402f;
  --bl-orange: #f7ac2b;
  --bl-cream: #fff3df;
  --bl-muted: rgba(255,243,223,0.76);
  position: relative;
  overflow-x: clip;
  color: var(--bl-cream);
  font-family: 'Inter', system-ui, -apple-system, "Segoe UI", sans-serif;
  background:
    radial-gradient(820px 520px at 14% 0%, rgba(212,64,47,.3), transparent 70%),
    radial-gradient(720px 460px at 92% 100%, rgba(247,172,43,.16), transparent 70%),
    linear-gradient(180deg,#0b0403 0%,#150603 50%,#070201 100%);
}
.bl-display { font-family: 'Sora', 'Inter', system-ui, sans-serif; font-weight: 800; letter-spacing: -.022em; }
.bl-grid {
  position: absolute; inset: 0; pointer-events: none; z-index: 0;
  background-image:
    linear-gradient(rgba(255,255,255,.02) 1px, transparent 1px),
    linear-gradient(90deg, rgba(255,255,255,.015) 1px, transparent 1px);
  background-size: 60px 60px;
  -webkit-mask-image: radial-gradient(ellipse 70% 60% at 30% 36%, black, transparent 86%);
  mask-image: radial-gradient(ellipse 70% 60% at 30% 36%, black, transparent 86%);
}
.bl-watermark {
  position: absolute; left: -6vw; bottom: -8vh; pointer-events: none; z-index: 0; user-select: none;
  font-size: clamp(150px, 26vw, 360px); line-height: .72; letter-spacing: -.03em;
  color: transparent; -webkit-text-stroke: 1.4px rgba(212,64,47,.12); transform: rotate(-4deg);
}
.bl-eyebrow {
  display: inline-flex; align-items: center; gap: 9px; width: fit-content;
  color: #ffdcab; border: 1px solid rgba(247,172,43,.32);
  background: rgba(255,132,0,.08); border-radius: 999px; padding: 8px 15px;
  font-size: 11px; font-weight: 700; letter-spacing: .1em; text-transform: uppercase;
}
.bl-dot { position: relative; width: 8px; height: 8px; }
.bl-dot::before, .bl-dot::after { content: ""; position: absolute; inset: 0; border-radius: 50%; background: #34d36a; }
.bl-dot::after { animation: blPing 2s ease-out infinite; }
@keyframes blPing { 0% { transform: scale(1); opacity: .8; } 100% { transform: scale(3); opacity: 0; } }
.bl-cta {
  position: relative; display: inline-flex; align-items: center; justify-content: center; gap: 9px;
  width: 100%; min-height: 54px; border-radius: 14px; font-weight: 700; font-size: 15px;
  color: #1a0500; border: 1px solid rgba(255,228,180,.5);
  background: linear-gradient(135deg, #f7ac2b 0%, #ec5b2b 52%, #d4402f 100%);
  box-shadow: 0 14px 32px rgba(212,64,47,.38), inset 0 1px 0 rgba(255,255,255,.4);
  transition: transform .2s ease, filter .2s ease, box-shadow .2s ease;
}
.bl-cta:hover { transform: translateY(-2px); filter: brightness(1.06); box-shadow: 0 20px 44px rgba(247,172,43,.36), inset 0 1px 0 rgba(255,255,255,.5); }
.bl-cta:active { transform: scale(.99); }
.bl-icon {
  width: 44px; height: 44px; border-radius: 12px; display: grid; place-items: center;
  border: 1px solid rgba(247,172,43,.3); flex: 0 0 auto;
  background: linear-gradient(135deg, rgba(212,64,47,.22), rgba(247,172,43,.12));
  box-shadow: inset 0 1px 0 rgba(255,255,255,.07);
}
.bl-card {
  position: relative; border-radius: 26px; padding: 28px;
  border: 1px solid rgba(247,172,43,.2);
  background: linear-gradient(150deg, rgba(40,11,7,.98), rgba(12,4,3,.96));
  box-shadow: 0 32px 90px rgba(0,0,0,.55); overflow: hidden;
}
.bl-card::after {
  content: ""; position: absolute; top: 0; left: 0; right: 0; height: 2px;
  background: linear-gradient(90deg, var(--bl-red), var(--bl-orange));
}

/* mini "revenue ascent" scene */
.bl-scene {
  position: relative; width: 100%; min-height: 184px; border-radius: 20px; overflow: hidden;
  border: 1px solid rgba(247,172,43,.2);
  background:
    radial-gradient(260px 180px at 84% 22%, rgba(247,172,43,.2), transparent 70%),
    linear-gradient(180deg, #240904 0%, #150503 54%, #090201 100%);
  box-shadow: 0 22px 56px rgba(0,0,0,.45), inset 0 1px 0 rgba(255,255,255,.04);
}
.bl-scene-head {
  position: absolute; z-index: 4; left: 14px; top: 12px;
  display: flex; align-items: center; gap: 7px;
  font-size: 8.5px; font-weight: 700; letter-spacing: .15em;
  text-transform: uppercase; color: var(--bl-muted);
}
.bl-live { position: relative; width: 6px; height: 6px; border-radius: 50%; background: #34d36a; }
.bl-live::after {
  content: ""; position: absolute; inset: 0; border-radius: 50%; background: #34d36a;
  animation: blPing 2s ease-out infinite;
}
.bl-asc-svg { position: absolute; inset: 0; width: 100%; height: 100%; display: block; }
.bl-asc-grid { opacity: 0; animation: blAppear .9s ease-out .1s forwards; }
.bl-asc-bar {
  transform-box: fill-box; transform-origin: 50% 100%; transform: scaleY(0);
  animation: blBar .9s cubic-bezier(.2,.8,.2,1) forwards;
}
.bl-asc-area { opacity: 0; animation: blAppear 1.1s ease-out 1.3s forwards; }
.bl-asc-line {
  stroke-dasharray: 460; stroke-dashoffset: 460;
  filter: drop-shadow(0 2px 7px rgba(247,172,43,.5));
  animation: blDraw 2s cubic-bezier(.4,0,.2,1) .35s forwards;
}
.bl-asc-mile {
  transform-box: fill-box; transform-origin: center; transform: scale(0);
  animation: blPop .5s cubic-bezier(.34,1.5,.5,1) forwards;
}
.bl-asc-ring {
  transform-box: fill-box; transform-origin: center; opacity: 0;
  animation: blRing 2.6s ease-out infinite;
}
.bl-asc-flag {
  transform-box: fill-box; transform-origin: 50% 100%; transform: scale(0);
  animation: blPop .55s cubic-bezier(.34,1.5,.5,1) 2.35s forwards;
}
.bl-asc-label { opacity: 0; animation: blAppear .55s ease-out 2.3s forwards; }
.bl-asc-comet {
  opacity: 0; animation: blAppear .5s ease-out 2.2s forwards;
  filter: drop-shadow(0 0 6px rgba(255,230,166,.9));
}
.bl-asc-sun {
  transform-box: fill-box; transform-origin: center;
  animation: blGlow 5s ease-in-out infinite alternate;
}
@keyframes blDraw { to { stroke-dashoffset: 0; } }
@keyframes blAppear { to { opacity: 1; } }
@keyframes blBar { to { transform: scaleY(1); } }
@keyframes blPop { to { transform: scale(1); } }
@keyframes blRing { 0% { transform: scale(.5); opacity: .85; } 70%,100% { transform: scale(2.6); opacity: 0; } }
@keyframes blGlow { from { opacity: .55; } to { opacity: 1; } }
@media (prefers-reduced-motion: reduce) {
  .bl-cta { transition: none; }
  .bl-dot::after, .bl-live::after, .bl-asc-sun, .bl-asc-ring { animation: none; }
  .bl-asc-line { stroke-dashoffset: 0; animation: none; }
  .bl-asc-area, .bl-asc-grid, .bl-asc-label, .bl-asc-comet { opacity: 1; animation: none; }
  .bl-asc-bar, .bl-asc-mile, .bl-asc-flag { transform: none; animation: none; }
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
    <div className="bl-root min-h-screen lg:h-screen lg:overflow-hidden flex flex-col lg:flex-row">
      <LoginStyles />

      {/* Left — dark hero panel */}
      <div className="relative hidden lg:flex flex-col justify-between lg:w-[55%] xl:w-[57%] px-12 py-10 overflow-hidden">
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
              fontSize: "clamp(32px, 3.6vw, 56px)",
              lineHeight: 1.08,
              letterSpacing: "-.022em",
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
              fontSize: 15.5,
              fontWeight: 400,
              lineHeight: 1.66,
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
                <span style={{ fontWeight: 600, fontSize: 13.5 }}>{label}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="relative z-10 flex items-center gap-8">
          {STATS.map((s) => (
            <div key={s.label}>
              <p
                className="bl-display"
                style={{ fontSize: 27, color: "var(--bl-orange)" }}
              >
                {s.value}
              </p>
              <p
                style={{
                  marginTop: 2,
                  fontSize: 12,
                  fontWeight: 500,
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
      <div className="relative flex items-center justify-center w-full lg:w-[45%] xl:w-[43%] px-6 py-8">
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
            {/* mini "revenue ascent" scene */}
            <div className="bl-scene mb-6" aria-hidden>
              <div className="bl-scene-head">
                <span className="bl-live" /> Revenue ascent
              </div>
              <svg
                className="bl-asc-svg"
                viewBox="0 0 400 184"
                preserveAspectRatio="xMidYMid slice"
              >
                <defs>
                  <linearGradient id="blStroke" x1="0" y1="1" x2="1" y2="0">
                    <stop offset="0" stopColor="#d4402f" />
                    <stop offset="0.55" stopColor="#f7ac2b" />
                    <stop offset="1" stopColor="#ffe6a6" />
                  </linearGradient>
                  <linearGradient id="blArea" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0" stopColor="rgba(247,172,43,.4)" />
                    <stop offset="1" stopColor="rgba(247,172,43,0)" />
                  </linearGradient>
                  <linearGradient id="blBarG" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0" stopColor="rgba(247,172,43,.3)" />
                    <stop offset="1" stopColor="rgba(212,64,47,.04)" />
                  </linearGradient>
                  <radialGradient id="blSunG">
                    <stop offset="0" stopColor="#ffe7a8" />
                    <stop offset="0.4" stopColor="#f7ac2b" />
                    <stop offset="0.72" stopColor="rgba(236,91,43,.42)" />
                    <stop offset="1" stopColor="rgba(236,91,43,0)" />
                  </radialGradient>
                </defs>

                <circle
                  className="bl-asc-sun"
                  cx="344"
                  cy="40"
                  r="58"
                  fill="url(#blSunG)"
                />

                <g
                  className="bl-asc-grid"
                  stroke="rgba(255,243,223,.07)"
                  strokeWidth="1"
                >
                  <line x1="24" y1="70" x2="376" y2="70" />
                  <line x1="24" y1="118" x2="376" y2="118" />
                </g>

                <g>
                  {[
                    { x: 56, h: 28 },
                    { x: 124, h: 50 },
                    { x: 192, h: 40 },
                    { x: 260, h: 74 },
                    { x: 328, h: 104 },
                  ].map((b, i) => (
                    <rect
                      key={i}
                      className="bl-asc-bar"
                      x={b.x - 15}
                      y={158 - b.h}
                      width="30"
                      height={b.h}
                      rx="5"
                      fill="url(#blBarG)"
                      style={{ animationDelay: `${0.15 + i * 0.12}s` }}
                    />
                  ))}
                </g>

                <path
                  className="bl-asc-area"
                  d="M28 150 L96 116 L150 126 L226 72 L278 84 L344 34 L344 158 L28 158 Z"
                  fill="url(#blArea)"
                />
                <path
                  className="bl-asc-line"
                  d="M28 150 L96 116 L150 126 L226 72 L278 84 L344 34"
                  fill="none"
                  stroke="url(#blStroke)"
                  strokeWidth="3.4"
                  strokeLinejoin="round"
                  strokeLinecap="round"
                />

                {/* mid milestone */}
                <circle
                  className="bl-asc-ring"
                  cx="226"
                  cy="72"
                  r="8"
                  fill="none"
                  stroke="#f7ac2b"
                  strokeWidth="1.4"
                  style={{ animationDelay: "2.2s" }}
                />
                <g className="bl-asc-mile" style={{ animationDelay: "1.95s" }}>
                  <circle
                    cx="226"
                    cy="72"
                    r="4.6"
                    fill="#1a0604"
                    stroke="#f7ac2b"
                    strokeWidth="2.2"
                  />
                </g>

                {/* summit + flag */}
                <circle
                  className="bl-asc-ring"
                  cx="344"
                  cy="34"
                  r="10"
                  fill="none"
                  stroke="#ffe6a6"
                  strokeWidth="1.6"
                  style={{ animationDelay: "2.6s" }}
                />
                <g className="bl-asc-mile" style={{ animationDelay: "2.15s" }}>
                  <circle
                    cx="344"
                    cy="34"
                    r="5.6"
                    fill="#ffe6a6"
                    stroke="#f7ac2b"
                    strokeWidth="2.2"
                  />
                </g>
                <g className="bl-asc-flag">
                  <line
                    x1="344"
                    y1="34"
                    x2="344"
                    y2="12"
                    stroke="#ffe6a6"
                    strokeWidth="2.2"
                    strokeLinecap="round"
                  />
                  <path d="M344 13 L366 19 L344 25 Z" fill="#f7ac2b" />
                </g>
                <text
                  className="bl-asc-label"
                  x="330"
                  y="50"
                  textAnchor="end"
                  fill="#ffe6a6"
                  style={{
                    font: "800 10px Sora, sans-serif",
                    letterSpacing: ".06em",
                  }}
                >
                  DEMO DAY
                </text>

                {/* travelling comet */}
                <g className="bl-asc-comet">
                  <circle r="9" fill="rgba(247,172,43,.34)" />
                  <circle r="3.6" fill="#fff3df" />
                  <animateMotion
                    dur="5s"
                    repeatCount="indefinite"
                    path="M28 150 L96 116 L150 126 L226 72 L278 84 L344 34"
                  />
                </g>
              </svg>
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
                  fontWeight: 700,
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
                fontSize: "clamp(26px, 2.8vw, 36px)",
                lineHeight: 1.1,
                letterSpacing: "-.022em",
              }}
            >
              Login to <span style={{ color: "var(--bl-orange)" }}>BRAVE</span>
            </h2>
            <p
              className="mt-2.5"
              style={{
                color: "var(--bl-muted)",
                fontSize: 14,
                fontWeight: 400,
                lineHeight: 1.6,
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
                      fontWeight: 600,
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
                color: "rgba(255,243,223,.45)",
              }}
            >
              By logging in, you agree to the NIAT code of conduct and BRAVE
              programme terms.
            </p>
          </div>

          <p
            className="text-center mt-6"
            style={{ fontSize: 12, color: "rgba(255,243,223,.42)" }}
          >
            NIAT India · Boosting Revenue through AI Value Engineering
          </p>
        </div>
      </div>
    </div>
  );
}
