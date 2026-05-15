import { useEffect, useState } from "react";
import { Link } from "wouter";
import {
  ArrowRight,
  ArrowUpRight,
  ChevronDown,
  ExternalLink,
  BookOpen,
  Target,
  TrendingUp,
  Zap,
  Rocket,
  Search,
  Cpu,
  IndianRupee,
  Store,
  Stethoscope,
  UtensilsCrossed,
  Trophy,
  Mic,
  ShieldCheck,
} from "lucide-react";
import { BraveLogo } from "@/components/brave-logo";
import { useAuth } from "@workspace/replit-auth-web";

type Resource = {
  id: number;
  title: string;
  description: string;
  docUrl: string;
};

/* ====================================================================
   CONTENT
   ==================================================================== */

const MARQUEE_ITEMS = [
  "The BRAVE mindset",
  "Solve something real.",
  "Revenue is the truth.",
  "Use AI as leverage.",
  "Start now. Iterate fast.",
];

const MINDSET = [
  {
    tag: "01 / Reality",
    icon: Target,
    title: "Solve something real.",
    body: "If no one pays, it's not a business.",
  },
  {
    tag: "02 / Proof",
    icon: TrendingUp,
    title: "Revenue is the truth.",
    body: "Everything else is noise.",
  },
  {
    tag: "03 / Leverage",
    icon: Zap,
    title: "Use AI as leverage.",
    body: "Speed is your unfair advantage.",
  },
  {
    tag: "04 / Momentum",
    icon: Rocket,
    title: "Start now. Iterate fast.",
    body: "You learn by doing, not watching.",
  },
];

const STEPS = [
  {
    n: "01",
    icon: Search,
    title: "Hunt",
    body: "Walk out of the campus. Find a small business with a real problem.",
  },
  {
    n: "02",
    icon: Cpu,
    title: "Build",
    body: "Use AI to ship a working fix in days, not months.",
  },
  {
    n: "03",
    icon: IndianRupee,
    title: "Earn",
    body: "Show real value. If it works, you get paid.",
  },
];

const BUSINESSES = [
  {
    tag: "Retail Outlet",
    icon: Store,
    problem: "Customers never return after the first order.",
    fix: "You build a WhatsApp-based CRM tool.",
  },
  {
    tag: "Clinic",
    icon: Stethoscope,
    problem: "Misses 30% of incoming voice calls.",
    fix: "You build an AI voice agent.",
  },
  {
    tag: "Restaurant",
    icon: UtensilsCrossed,
    problem: "Orders pile up during the rush hour.",
    fix: "You build a simple order-tracking system.",
  },
];

const REWARDS = [
  {
    icon: Trophy,
    title: "GRIT Finale Ticket",
    body: "Top 10 teams get a chance to qualify for the GRIT finale.",
  },
  {
    icon: Mic,
    title: "Pitch Competition",
    body: "Pitch your build in front of seasoned investors.",
  },
  {
    icon: ShieldCheck,
    title: "Your client, your revenue",
    body: "NIAT takes no equity, no IP, and no cut. The business stays yours.",
  },
];

const FAQS = [
  {
    q: "How big is the team?",
    a: "Teams of 2–4 work best, and a team can have up to 5 members. Solo is allowed too.",
  },
  {
    q: "Is there a fee?",
    a: "No. BRAVE is completely free for all NIAT students.",
  },
  {
    q: "Do I need to know AI already?",
    a: "No. You'll learn as you build — the goal is to use AI as leverage, not to be an expert first.",
  },
  {
    q: 'What counts as "AI in the build"?',
    a: "Your solution must use AI as the working mechanism — voice agents, automation, AI-powered chat, AI-built apps, and so on. A simple website with no AI doesn't count. If you're unsure, your mentor will tell you.",
  },
  {
    q: "How do I start?",
    a: "Walk into a small business near you. Tell them you're a student building things and ask what's slowing them down. That's day one. That's the hunt.",
  },
  {
    q: "What about my classes?",
    a: "BRAVE runs alongside your classes, not instead of them. Plan your work so both move forward.",
  },
  {
    q: 'Is this like "make money online" challenges?',
    a: "No. The customer is a real local business paying for real software. That's what makes it real.",
  },
  {
    q: "What if I don't make the Top 10?",
    a: "You still walk away with everything you built, every customer you signed, and every rupee you earned. The business is yours. The skills are yours.",
  },
  {
    q: "Will NIAT take equity?",
    a: "No. NIAT takes no equity, no IP, and no cut of your revenue.",
  },
  {
    q: "Can I keep working on it after?",
    a: "Yes. The business is yours — keep serving the client and improving the product.",
  },
];

/* ====================================================================
   DESIGN SYSTEM — dark "AI Value Engineering" theme, CSS-only
   ==================================================================== */

function BraveStyles() {
  return (
    <style>{`
@import url('https://fonts.googleapis.com/css2?family=Anton&display=swap');

.bd-root {
  --bd-red: #c73a2e;
  --bd-red2: #8f160e;
  --bd-orange: #f5a321;
  --bd-orange2: #ff6a00;
  --bd-cream: #fff2db;
  --bd-muted: rgba(255,242,219,0.64);
  --bd-line: rgba(255,139,43,0.16);
  position: relative;
  overflow-x: hidden;
  color: var(--bd-cream);
  background:
    radial-gradient(circle at 18% 6%, rgba(197,32,23,.26), transparent 34%),
    radial-gradient(circle at 84% 20%, rgba(255,164,32,.12), transparent 30%),
    linear-gradient(180deg,#0a0302 0%,#130402 46%,#080201 100%);
}
.bd-display { font-family: Anton, Impact, "Arial Narrow", system-ui, sans-serif; }

/* texture overlays */
.bd-grid {
  position: fixed; inset: 0; pointer-events: none; z-index: 0;
  background-image:
    linear-gradient(rgba(255,255,255,.025) 1px, transparent 1px),
    linear-gradient(90deg, rgba(255,255,255,.018) 1px, transparent 1px);
  background-size: 54px 54px;
  -webkit-mask-image: linear-gradient(to bottom, black, transparent 94%);
  mask-image: linear-gradient(to bottom, black, transparent 94%);
}
.bd-cursor {
  position: fixed; inset: 0; pointer-events: none; z-index: 1;
  mix-blend-mode: screen;
  background: radial-gradient(circle at var(--mx,50%) var(--my,32%), rgba(255,108,0,.13), transparent 20%);
}

/* loader */
.bd-loader {
  position: fixed; inset: 0; z-index: 200; display: grid; place-items: center;
  background: #060101; transition: opacity .7s ease, visibility .7s ease;
}
.bd-loader.hide { opacity: 0; visibility: hidden; }
.bd-loader-mark {
  font-size: clamp(72px, 16vw, 230px); letter-spacing: -.06em; color: var(--bd-red);
  animation: bdPunch 1.1s cubic-bezier(.2,.8,.2,1) both;
}
.bd-loader-mark i { color: var(--bd-orange); font-style: normal; }
@keyframes bdPunch {
  0% { transform: scale(.82); filter: blur(14px); opacity: 0; }
  55% { transform: scale(1.04); filter: blur(0); opacity: 1; }
  100% { transform: scale(1); }
}

/* progress */
.bd-progress {
  position: fixed; top: 0; left: 0; height: 3px; width: 0%;
  background: linear-gradient(90deg, var(--bd-red), var(--bd-orange));
  z-index: 120; box-shadow: 0 0 18px rgba(245,163,33,.7);
}

/* nav */
.bd-nav {
  position: fixed; top: 16px; left: 50%; transform: translateX(-50%);
  width: min(calc(100% - 24px), 1180px); z-index: 90;
  display: flex; align-items: center; justify-content: space-between;
  padding: 9px 9px 9px 20px; border-radius: 999px;
  border: 1px solid rgba(255,189,103,.15); background: rgba(10,3,2,.72);
  backdrop-filter: blur(20px); box-shadow: 0 20px 60px rgba(0,0,0,.4);
}
.bd-pill {
  color: var(--bd-muted); border: 1px solid rgba(255,255,255,.1);
  background: rgba(255,255,255,.04); border-radius: 999px;
  padding: 9px 14px; font-size: 12.5px; font-weight: 600; white-space: nowrap;
}
.bd-cta {
  display: inline-flex; align-items: center; gap: 8px;
  min-height: 44px; padding: 0 20px; border-radius: 999px; font-weight: 800;
  color: #160100; border: 1px solid rgba(255,230,190,.24);
  background: linear-gradient(135deg, #d53d2f, #f2a11f);
  box-shadow: 0 16px 40px rgba(199,58,46,.32);
  transition: transform .22s ease, filter .22s ease, box-shadow .22s ease;
}
.bd-cta:hover { transform: translateY(-2px); filter: saturate(1.18); box-shadow: 0 22px 56px rgba(245,163,33,.34); }
.bd-ghost {
  display: inline-flex; align-items: center; gap: 8px;
  min-height: 44px; padding: 0 20px; border-radius: 999px; font-weight: 700;
  color: var(--bd-cream); border: 1px solid rgba(255,242,219,.18);
  background: rgba(255,255,255,.04); transition: border-color .22s ease, transform .22s ease;
}
.bd-ghost:hover { transform: translateY(-2px); border-color: rgba(245,163,33,.4); }

/* section frame */
.bd-section { position: relative; z-index: 4; padding: 110px 22px; }
.bd-wrap { width: min(100%, 1180px); margin: 0 auto; position: relative; }
.bd-kicker {
  color: var(--bd-orange); font-weight: 800; font-size: 12px;
  letter-spacing: .14em; text-transform: uppercase; margin-bottom: 14px;
}
.bd-title {
  font-size: clamp(46px, 7.6vw, 104px); line-height: .9;
  letter-spacing: -.055em; text-transform: uppercase;
}
.bd-title .stroke { color: transparent; -webkit-text-stroke: 1.4px rgba(255,242,219,.34); }
.bd-copy {
  margin-top: 16px; max-width: 620px; color: var(--bd-muted);
  font-size: 17px; line-height: 1.6; font-weight: 500;
}
.bd-eyebrow {
  display: inline-flex; align-items: center; gap: 9px; width: fit-content;
  color: #ffd7ad; border: 1px solid rgba(255,164,32,.26);
  background: rgba(255,132,0,.07); border-radius: 999px; padding: 9px 14px;
  font-size: 12px; font-weight: 800; letter-spacing: .09em; text-transform: uppercase;
}
.bd-eyebrow .dot { width: 8px; height: 8px; border-radius: 50%; background: var(--bd-orange); box-shadow: 0 0 14px var(--bd-orange); }

/* hero watermark */
.bd-watermark {
  position: absolute; right: -5vw; bottom: -6vh; pointer-events: none; z-index: 0;
  font-size: clamp(180px, 32vw, 540px); line-height: .74; letter-spacing: -.08em;
  color: rgba(199,58,46,.08); transform: rotate(-3deg);
}

/* hero art — CSS-only peak */
.bd-art { position: relative; min-height: 460px; }
.bd-sun {
  position: absolute; left: 50%; top: 20%; width: 300px; height: 300px;
  transform: translateX(-50%); border-radius: 50%;
  background: radial-gradient(circle, rgba(245,163,33,.95), rgba(255,106,0,.5) 38%, transparent 70%);
  filter: blur(2px); animation: bdPulse 4.4s ease-in-out infinite alternate;
}
@keyframes bdPulse { from { transform: translateX(-50%) scale(.92); opacity:.8; } to { transform: translateX(-50%) scale(1.07); opacity:1; } }
.bd-peak {
  position: absolute; left: 0; right: 0; bottom: 0; height: 78%;
}
.bd-peak span {
  position: absolute; bottom: 0; left: 50%; transform: translateX(-50%);
}
.bd-peak .l1 { width: 150%; height: 64%; background: linear-gradient(180deg,#3a0a05,#0a0201);
  clip-path: polygon(0 100%, 26% 24%, 50% 60%, 74% 10%, 100% 100%); opacity:.85; }
.bd-peak .l2 { width: 115%; height: 92%; background: linear-gradient(180deg,#7c1a0d,#1a0402);
  clip-path: polygon(0 100%, 50% 0, 100% 100%); }
.bd-peak .l3 { width: 115%; height: 92%;
  background: linear-gradient(180deg,transparent 0%, transparent 46%, rgba(245,163,33,.5) 47%, rgba(245,163,33,0) 52%);
  clip-path: polygon(0 100%, 50% 0, 100% 100%); }
.bd-figure {
  position: absolute; left: 50%; bottom: 70%; transform: translateX(-50%);
  width: 14px; height: 30px; border-radius: 8px 8px 3px 3px;
  background: #0a0201; box-shadow: 0 0 22px 6px rgba(245,163,33,.55);
}
.bd-badge {
  position: absolute; left: 0; top: 40px; width: 220px; border-radius: 24px; padding: 20px;
  border: 1px solid rgba(255,164,32,.28);
  background: linear-gradient(140deg, rgba(22,3,2,.92), rgba(69,9,4,.6));
  box-shadow: 0 28px 70px rgba(199,58,46,.24); backdrop-filter: blur(12px);
  animation: bdFloat 5s ease-in-out infinite;
}
@keyframes bdFloat { 0%,100%{transform:translateY(0) rotate(-2deg);} 50%{transform:translateY(-12px) rotate(2deg);} }

/* marquee */
.bd-marquee {
  position: relative; z-index: 4; overflow: hidden;
  border-block: 1px solid rgba(255,164,32,.18); background: rgba(255,255,255,.025);
  transform: rotate(-1deg) scale(1.03);
}
.bd-marquee-track { display: flex; width: max-content; padding: 16px 0; animation: bdMarquee 22s linear infinite; }
.bd-marquee-track span {
  font-size: clamp(34px, 6vw, 78px); line-height: .9; text-transform: uppercase;
  padding-right: 36px; white-space: nowrap; color: transparent;
  -webkit-text-stroke: 1px rgba(255,242,219,.4);
}
.bd-marquee-track span:nth-child(even) { color: var(--bd-red); -webkit-text-stroke: 0; }
@keyframes bdMarquee { from { transform: translateX(0); } to { transform: translateX(-50%); } }

/* cards */
.bd-card {
  position: relative; overflow: hidden; border-radius: 26px; padding: 28px;
  border: 1px solid rgba(255,164,32,.16);
  background: linear-gradient(135deg, rgba(28,5,3,.86), rgba(7,1,1,.74));
  box-shadow: 0 22px 60px rgba(0,0,0,.3);
  transition: transform .32s ease, border-color .32s ease;
}
.bd-card:hover { transform: translateY(-8px); border-color: rgba(245,163,33,.44); }
.bd-card::before {
  content: ""; position: absolute; inset: -90px auto auto -110px;
  width: 220px; height: 220px; opacity: .9;
  background: radial-gradient(circle, rgba(199,58,46,.24), transparent 64%);
}
.bd-icon {
  width: 48px; height: 48px; border-radius: 14px; display: grid; place-items: center;
  border: 1px solid rgba(245,163,33,.3);
  background: linear-gradient(135deg, rgba(199,58,46,.18), rgba(245,163,33,.1));
}
.bd-num {
  font-size: clamp(46px, 6vw, 78px); line-height: .8; letter-spacing: -.04em;
  color: transparent; -webkit-text-stroke: 1.6px rgba(245,163,33,.5);
}

/* faq */
.bd-faq-item {
  border: 1px solid rgba(255,164,32,.14); background: rgba(255,255,255,.035);
  border-radius: 18px; overflow: hidden; transition: border-color .25s ease, background .25s ease;
}
.bd-faq-item.open { border-color: rgba(245,163,33,.4); background: rgba(255,119,0,.06); }
.bd-faq-q {
  width: 100%; border: 0; background: transparent; color: var(--bd-cream);
  padding: 20px; display: flex; justify-content: space-between; align-items: center;
  gap: 16px; text-align: left; cursor: pointer; font-size: 16.5px; font-weight: 800;
}
.bd-faq-icon {
  width: 30px; height: 30px; flex: 0 0 auto; border-radius: 50%; display: grid; place-items: center;
  background: rgba(255,255,255,.07); color: var(--bd-orange); transition: transform .25s ease;
}
.bd-faq-item.open .bd-faq-icon { transform: rotate(180deg); }
.bd-faq-a { max-height: 0; overflow: hidden; transition: max-height .35s ease; }
.bd-faq-a p { padding: 0 20px 20px; color: var(--bd-muted); line-height: 1.6; font-weight: 500; }

/* reveal */
.bd-reveal { opacity: 0; transform: translateY(38px); transition: opacity .8s cubic-bezier(.2,.8,.2,1), transform .8s cubic-bezier(.2,.8,.2,1); }
.bd-reveal.in { opacity: 1; transform: translateY(0); }

@media (max-width: 900px) {
  .bd-section { padding: 80px 16px; }
  .bd-nav .bd-pill { display: none; }
  .bd-art { min-height: 360px; margin-top: 24px; }
  .bd-badge { width: 180px; padding: 16px; top: 8px; }
  .bd-watermark { font-size: 40vw; }
}
@media (prefers-reduced-motion: reduce) {
  .bd-reveal { opacity: 1; transform: none; }
  .bd-sun, .bd-badge, .bd-marquee-track { animation: none; }
}
`}</style>
  );
}

/* ====================================================================
   PAGE-LEVEL EFFECTS
   ==================================================================== */

function useBraveEffects() {
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const t = window.setTimeout(() => setLoaded(true), 850);

    const progress = document.getElementById("bd-progress");
    const onScroll = () => {
      if (!progress) return;
      const top = window.scrollY;
      const h = document.documentElement.scrollHeight - window.innerHeight;
      progress.style.width = `${Math.max(0, Math.min(100, (top / h) * 100))}%`;
    };
    const onMove = (e: PointerEvent) => {
      document.body.style.setProperty("--mx", `${e.clientX}px`);
      document.body.style.setProperty("--my", `${e.clientY}px`);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("pointermove", onMove);
    onScroll();

    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("in");
            io.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.14, rootMargin: "0px 0px -40px 0px" },
    );
    document.querySelectorAll(".bd-reveal").forEach((el) => io.observe(el));

    return () => {
      window.clearTimeout(t);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("pointermove", onMove);
      io.disconnect();
    };
  }, []);

  return loaded;
}

/* ====================================================================
   SECTIONS
   ==================================================================== */

function Nav() {
  return (
    <nav className="bd-nav">
      <Link href="/" data-testid="link-home" className="shrink-0">
        <BraveLogo className="text-[24px]" />
      </Link>
      <div className="flex items-center gap-2">
        <span className="bd-pill">15 Apr – 15 Jul</span>
        <span className="bd-pill">For NIAT students only</span>
        <Link href="/login" data-testid="nav-login" className="bd-cta">
          Login to Dashboard
          <ArrowRight className="w-4 h-4" />
        </Link>
      </div>
    </nav>
  );
}

function Hero() {
  return (
    <section
      className="bd-section"
      style={{ paddingTop: 150, paddingBottom: 70 }}
    >
      <div className="bd-watermark bd-display" aria-hidden>
        BRAVE
      </div>
      <div className="bd-wrap grid lg:grid-cols-[1.05fr_.95fr] gap-10 items-center">
        <div className="bd-reveal">
          <div className="bd-eyebrow">
            <span className="dot" /> For NIAT students only
          </div>
          <h1
            className="bd-display bd-title mt-6"
            style={{ fontSize: "clamp(54px, 9vw, 132px)" }}
          >
            Boosting Revenue{" "}
            <span style={{ color: "var(--bd-red)" }}>through AI</span>{" "}
            <span style={{ color: "var(--bd-orange)" }}>Value Engineering</span>
          </h1>
          <p className="bd-copy" style={{ fontSize: 19, fontWeight: 600 }}>
            Find a small business. Increase their revenue with AI. Get them to
            pay you.
          </p>
          <div className="flex flex-wrap gap-3 mt-9">
            <Link href="/login" data-testid="hero-login" className="bd-cta">
              Login to Dashboard
              <ArrowRight className="w-4 h-4" />
            </Link>
            <a href="#program" className="bd-ghost">
              Explore the programme
            </a>
          </div>
          <div className="flex flex-wrap gap-3 mt-9">
            {[
              { k: "Hunt", v: "Find a real business problem" },
              { k: "Build", v: "Ship an AI-powered fix" },
              { k: "Earn", v: "Win revenue from real clients" },
            ].map((s) => (
              <div
                key={s.k}
                className="rounded-2xl px-4 py-3 min-w-[170px]"
                style={{
                  border: "1px solid rgba(255,255,255,.1)",
                  background: "rgba(255,255,255,.035)",
                }}
              >
                <p
                  className="bd-display"
                  style={{ fontSize: 28, color: "var(--bd-orange)" }}
                >
                  {s.k}
                </p>
                <p
                  style={{
                    fontSize: 12.5,
                    color: "var(--bd-muted)",
                    fontWeight: 600,
                  }}
                >
                  {s.v}
                </p>
              </div>
            ))}
          </div>
        </div>

        <div className="bd-art bd-reveal">
          <div className="bd-sun" />
          <div className="bd-peak">
            <span className="l1" />
            <span className="l2" />
            <span className="l3" />
          </div>
          <div className="bd-figure" />
          <div className="bd-badge">
            <p
              className="bd-display"
              style={{ fontSize: 40, color: "var(--bd-red)" }}
            >
              BRAVE
            </p>
            <p
              style={{
                marginTop: 6,
                fontSize: 13,
                color: "var(--bd-muted)",
                fontWeight: 600,
                lineHeight: 1.4,
              }}
            >
              Open to all NIAT students · 15 Apr – 15 Jul.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

function Marquee() {
  const loop = [...MARQUEE_ITEMS, ...MARQUEE_ITEMS];
  return (
    <div className="bd-marquee" aria-hidden>
      <div className="bd-marquee-track bd-display">
        {loop.map((t, i) => (
          <span key={i}>{t}</span>
        ))}
      </div>
    </div>
  );
}

function Mindset() {
  return (
    <section className="bd-section" id="mindset">
      <div className="bd-wrap">
        <div className="bd-reveal">
          <p className="bd-kicker">The BRAVE mindset</p>
          <h2 className="bd-display bd-title">
            The <span className="stroke">BRAVE</span> mindset
          </h2>
          <p className="bd-copy">
            Four rules that decide whether what you build is a real business —
            or just noise.
          </p>
        </div>
        <div className="grid sm:grid-cols-2 gap-4 mt-12">
          {MINDSET.map(({ tag, icon: Icon, title, body }) => (
            <article key={tag} className="bd-card bd-reveal">
              <div className="bd-icon">
                <Icon
                  className="w-5 h-5"
                  style={{ color: "var(--bd-orange)" }}
                />
              </div>
              <p
                className="mt-4"
                style={{
                  fontSize: 11,
                  fontWeight: 900,
                  letterSpacing: ".12em",
                  textTransform: "uppercase",
                  color: "var(--bd-orange)",
                }}
              >
                {tag}
              </p>
              <h3
                className="bd-display mt-2"
                style={{ fontSize: "clamp(28px,3.4vw,42px)", lineHeight: 0.96 }}
              >
                {title}
              </h3>
              <p
                className="mt-2"
                style={{
                  color: "var(--bd-muted)",
                  fontWeight: 500,
                  lineHeight: 1.5,
                }}
              >
                {body}
              </p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

function Program() {
  return (
    <section className="bd-section" id="program">
      <div className="bd-wrap">
        <div className="bd-reveal">
          <p className="bd-kicker">Shape of the programme</p>
          <h2 className="bd-display bd-title">
            Hunt. <span className="stroke">Build.</span> Earn.
          </h2>
          <p className="bd-copy">
            Walk out, find a problem, ship a working fix with AI, and prove the
            value through real revenue.
          </p>
        </div>
        <div className="grid md:grid-cols-3 gap-4 mt-12">
          {STEPS.map(({ n, icon: Icon, title, body }) => (
            <article
              key={n}
              className="bd-card bd-reveal"
              style={{ minHeight: 260 }}
            >
              <div className="flex items-start justify-between">
                <span className="bd-display bd-num">{n}</span>
                <div className="bd-icon">
                  <Icon
                    className="w-5 h-5"
                    style={{ color: "var(--bd-orange)" }}
                  />
                </div>
              </div>
              <h3
                className="bd-display mt-5"
                style={{
                  fontSize: "clamp(40px,5vw,62px)",
                  lineHeight: 0.9,
                  color: "var(--bd-orange)",
                }}
              >
                {title}
              </h3>
              <p
                className="mt-3"
                style={{
                  color: "rgba(255,242,219,.82)",
                  fontWeight: 600,
                  lineHeight: 1.5,
                }}
              >
                {body}
              </p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

function Businesses() {
  return (
    <section className="bd-section" id="businesses">
      <div className="bd-wrap">
        <div className="bd-reveal">
          <p className="bd-kicker">Businesses around you</p>
          <h2 className="bd-display bd-title">
            Businesses <span className="stroke">around</span> you
          </h2>
          <p className="bd-copy">
            Real problems sit a short walk from your campus. Each one is a
            paying client waiting for an AI fix.
          </p>
        </div>
        <div className="grid md:grid-cols-3 gap-4 mt-12">
          {BUSINESSES.map(({ tag, icon: Icon, problem, fix }) => (
            <article
              key={tag}
              className="bd-card bd-reveal"
              style={{ minHeight: 280 }}
            >
              <div className="bd-icon">
                <Icon
                  className="w-5 h-5"
                  style={{ color: "var(--bd-orange)" }}
                />
              </div>
              <span
                className="inline-flex w-fit mt-4 rounded-full px-3 py-1"
                style={{
                  fontSize: 11,
                  fontWeight: 900,
                  letterSpacing: ".08em",
                  textTransform: "uppercase",
                  color: "var(--bd-orange)",
                  border: "1px solid rgba(255,255,255,.16)",
                  background: "rgba(255,255,255,.06)",
                }}
              >
                {tag}
              </span>
              <p
                className="bd-display mt-3"
                style={{ fontSize: 26, lineHeight: 1.04 }}
              >
                {problem}
              </p>
              <p
                className="mt-3 flex items-start gap-2"
                style={{
                  color: "rgba(255,242,219,.82)",
                  fontWeight: 600,
                  lineHeight: 1.5,
                }}
              >
                <ArrowUpRight
                  className="w-4 h-4 mt-0.5 shrink-0"
                  style={{ color: "var(--bd-orange)" }}
                />
                {fix}
              </p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

function DemoDay() {
  return (
    <section className="bd-section" id="demo-day">
      <div className="bd-wrap">
        <div
          className="bd-reveal relative overflow-hidden"
          style={{
            borderRadius: 36,
            border: "1px solid rgba(245,163,33,.22)",
            background:
              "radial-gradient(circle at 82% 18%, rgba(245,163,33,.22), transparent 32%), linear-gradient(135deg, rgba(101,10,4,.78), rgba(7,1,1,.86))",
            padding: "clamp(28px,5vw,60px)",
            boxShadow: "0 40px 110px rgba(0,0,0,.42)",
          }}
        >
          <div className="grid lg:grid-cols-2 gap-8 items-end">
            <div>
              <p className="bd-kicker">Demo Day</p>
              <h2
                className="bd-display"
                style={{
                  fontSize: "clamp(56px,11vw,150px)",
                  lineHeight: 0.82,
                  letterSpacing: "-.06em",
                  textTransform: "uppercase",
                }}
              >
                Demo <span style={{ color: "var(--bd-orange)" }}>Day</span>
              </h2>
              <p className="bd-copy">
                Reach the verified-revenue threshold and the Top 10 teams pitch
                real client work, real builds, and real revenue proof.
              </p>
            </div>
            <div className="grid gap-3">
              {REWARDS.map(({ icon: Icon, title, body }) => (
                <div
                  key={title}
                  className="flex gap-3.5 rounded-2xl p-4"
                  style={{
                    border: "1px solid rgba(255,255,255,.12)",
                    background: "rgba(255,255,255,.055)",
                    backdropFilter: "blur(10px)",
                  }}
                >
                  <div className="bd-icon shrink-0">
                    <Icon
                      className="w-5 h-5"
                      style={{ color: "var(--bd-orange)" }}
                    />
                  </div>
                  <div>
                    <h3
                      className="bd-display"
                      style={{ fontSize: 24, color: "var(--bd-orange)" }}
                    >
                      {title}
                    </h3>
                    <p
                      style={{
                        marginTop: 3,
                        color: "var(--bd-muted)",
                        fontWeight: 600,
                        fontSize: 14,
                        lineHeight: 1.45,
                      }}
                    >
                      {body}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function ResourcesSection() {
  const { isAuthenticated, user } = useAuth();
  const [resources, setResources] = useState<Resource[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/resources", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : []))
      .then((data: Resource[]) => {
        if (!cancelled) setResources(Array.isArray(data) ? data : []);
      })
      .catch(() => {
        if (!cancelled) setResources([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const preview = resources.slice(0, 4);
  const seeAllHref = !isAuthenticated
    ? "/login"
    : user?.role === "admin"
      ? "/admin/resources"
      : "/resources-library";

  const handleOpen = (docUrl: string) => {
    if (isAuthenticated) {
      window.open(docUrl, "_blank", "noopener,noreferrer");
    } else {
      window.location.href = "/login";
    }
  };

  if (!loading && preview.length === 0) return null;

  return (
    <section className="bd-section" id="resources">
      <div className="bd-wrap" style={{ maxWidth: 920 }}>
        <div className="bd-reveal">
          <p className="bd-kicker">Resources</p>
          <h2 className="bd-display bd-title">
            Builds <span className="stroke">to learn</span> from
          </h2>
          <p className="bd-copy">
            Curated playbooks and project breakdowns — open any one to see the
            full plan.
          </p>
        </div>

        {loading ? (
          <div
            className="bd-card bd-reveal mt-10 text-center"
            style={{ color: "var(--bd-muted)" }}
          >
            Loading resources…
          </div>
        ) : (
          <div className="flex flex-col gap-3 mt-10">
            {preview.map((r) => {
              const isExpanded = expandedId === r.id;
              return (
                <article
                  key={r.id}
                  data-testid={`landing-resource-${r.id}`}
                  className="bd-card bd-reveal flex flex-col md:flex-row md:items-center gap-4"
                >
                  <div className="flex-1 min-w-0">
                    <h3 className="bd-display" style={{ fontSize: 22 }}>
                      {r.title}
                    </h3>
                    <p
                      className={isExpanded ? "" : "line-clamp-2"}
                      style={{
                        marginTop: 6,
                        color: "var(--bd-muted)",
                        fontWeight: 500,
                        lineHeight: 1.55,
                      }}
                    >
                      {r.description}
                    </p>
                    {r.description.length > 120 && (
                      <button
                        type="button"
                        onClick={() => setExpandedId(isExpanded ? null : r.id)}
                        className="mt-1.5 text-xs font-bold hover:underline"
                        style={{ color: "var(--bd-orange)" }}
                      >
                        {isExpanded ? "Show less" : "Read more…"}
                      </button>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => handleOpen(r.docUrl)}
                    data-testid={`landing-resource-open-${r.id}`}
                    className="bd-cta shrink-0"
                  >
                    Open
                    <ExternalLink className="w-3.5 h-3.5" />
                  </button>
                </article>
              );
            })}
          </div>
        )}

        {resources.length > 4 && (
          <div className="mt-8 flex justify-center">
            <Link
              href={seeAllHref}
              data-testid="landing-resources-see-all"
              className="bd-ghost"
            >
              <BookOpen className="w-4 h-4" />
              See all resources
            </Link>
          </div>
        )}
      </div>
    </section>
  );
}

function FAQ() {
  const [open, setOpen] = useState<number | null>(0);
  return (
    <section className="bd-section" id="faq">
      <div className="bd-wrap grid lg:grid-cols-[.8fr_1.2fr] gap-10 items-start">
        <div className="bd-reveal">
          <p className="bd-kicker">Got questions?</p>
          <h2 className="bd-display bd-title">
            Got <span className="stroke">questions?</span>
          </h2>
          <p className="bd-copy">
            Everything a NIAT student asks before going BRAVE.
          </p>
        </div>
        <div className="grid gap-2.5 bd-reveal">
          {FAQS.map((f, i) => {
            const isOpen = open === i;
            return (
              <div
                key={f.q}
                className={`bd-faq-item ${isOpen ? "open" : ""}`}
                data-testid={`faq-${i}`}
              >
                <button
                  type="button"
                  className="bd-faq-q"
                  onClick={() => setOpen(isOpen ? null : i)}
                >
                  <span>{f.q}</span>
                  <span className="bd-faq-icon">
                    <ChevronDown className="w-4 h-4" />
                  </span>
                </button>
                <div
                  className="bd-faq-a"
                  style={{ maxHeight: isOpen ? 320 : 0 }}
                >
                  <p>{f.a}</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function FinalCTA() {
  return (
    <section
      className="bd-section text-center"
      style={{ paddingTop: 120, paddingBottom: 130 }}
    >
      <div
        className="bd-watermark bd-display"
        aria-hidden
        style={{ left: "-4vw", right: "auto" }}
      >
        TRY
      </div>
      <div className="bd-wrap bd-reveal" style={{ maxWidth: 760 }}>
        <h2
          className="bd-display"
          style={{
            fontSize: "clamp(54px,11vw,150px)",
            lineHeight: 0.86,
            letterSpacing: "-.06em",
            textTransform: "uppercase",
          }}
        >
          Are you <span style={{ color: "var(--bd-orange)" }}>brave</span>{" "}
          enough to try?
        </h2>
        <p
          className="bd-copy mx-auto"
          style={{ marginInline: "auto", marginTop: 22 }}
        >
          Hunt a real problem, build with AI, prove the value, and earn from
          real businesses.
        </p>
        <div className="flex justify-center mt-8">
          <Link href="/login" data-testid="final-login" className="bd-cta">
            Login to Dashboard
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer
      className="relative z-[4] px-6 py-9"
      style={{
        borderTop: "1px solid rgba(255,164,32,.15)",
        background: "rgba(0,0,0,.5)",
      }}
    >
      <div className="bd-wrap flex flex-col md:flex-row items-center justify-between gap-4">
        <BraveLogo className="text-[24px]" />
        <p style={{ color: "var(--bd-muted)", fontSize: 13, fontWeight: 600 }}>
          Boosting Revenue through AI Value Engineering
        </p>
        <p style={{ color: "rgba(255,242,219,.4)", fontSize: 12.5 }}>
          © {new Date().getFullYear()} NIAT India. All rights reserved.
        </p>
      </div>
    </footer>
  );
}

/* ====================================================================
   PAGE
   ==================================================================== */

export default function Landing() {
  const loaded = useBraveEffects();

  return (
    <div className="bd-root min-h-screen">
      <BraveStyles />
      <div className={`bd-loader ${loaded ? "hide" : ""}`}>
        <span className="bd-loader-mark bd-display">
          BRAVE<i>.</i>
        </span>
      </div>
      <div id="bd-progress" className="bd-progress" />
      <div className="bd-grid" aria-hidden />
      <div className="bd-cursor" aria-hidden />

      <Nav />
      <main>
        <Hero />
        <Marquee />
        <Mindset />
        <Program />
        <Businesses />
        <DemoDay />
        <ResourcesSection />
        <FAQ />
        <FinalCTA />
      </main>
      <Footer />
    </div>
  );
}
