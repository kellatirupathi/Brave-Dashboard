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
  Flag,
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
    body: "If no one pays for it, it isn't a business. Chase real problems.",
  },
  {
    tag: "02 / Proof",
    icon: TrendingUp,
    title: "Revenue is the truth.",
    body: "Verified revenue is the only scoreboard. Everything else is noise.",
  },
  {
    tag: "03 / Leverage",
    icon: Zap,
    title: "Use AI as leverage.",
    body: "AI lets a small team ship like a big one. Speed is your edge.",
  },
  {
    tag: "04 / Momentum",
    icon: Rocket,
    title: "Start now. Iterate fast.",
    body: "You learn by shipping, not watching. Begin before you feel ready.",
  },
];

const STEPS = [
  {
    n: "01",
    icon: Search,
    title: "Hunt",
    body: "Walk out of the campus. Find a small business with a real, paid-for problem.",
  },
  {
    n: "02",
    icon: Cpu,
    title: "Build",
    body: "Use AI to ship a working fix in days, not months. Put it in their hands.",
  },
  {
    n: "03",
    icon: IndianRupee,
    title: "Earn",
    body: "Show the value. If it works, you get paid — and the revenue is logged.",
  },
];

const BUSINESSES = [
  {
    tag: "Retail Outlet",
    icon: Store,
    problem: "Customers never return after the first order.",
    fix: "Build a WhatsApp-based CRM that brings them back.",
  },
  {
    tag: "Clinic",
    icon: Stethoscope,
    problem: "Misses 30% of incoming patient calls.",
    fix: "Build an AI voice agent that answers every one.",
  },
  {
    tag: "Restaurant",
    icon: UtensilsCrossed,
    problem: "Orders pile up and break during the rush hour.",
    fix: "Build a simple AI order-tracking system.",
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
  --bd-red: #d4402f;
  --bd-orange: #f7ac2b;
  --bd-cream: #fff3df;
  --bd-muted: rgba(255,243,223,0.62);
  position: relative;
  overflow-x: hidden;
  color: var(--bd-cream);
  background:
    radial-gradient(900px 520px at 16% 0%, rgba(212,64,47,.30), transparent 70%),
    radial-gradient(760px 480px at 88% 12%, rgba(247,172,43,.16), transparent 70%),
    linear-gradient(180deg,#0b0403 0%,#150603 44%,#070201 100%);
}
.bd-display { font-family: Anton, Impact, "Arial Narrow", system-ui, sans-serif; font-weight: 400; }

/* texture + cursor overlays */
.bd-grid {
  position: fixed; inset: 0; pointer-events: none; z-index: 0;
  background-image:
    linear-gradient(rgba(255,255,255,.022) 1px, transparent 1px),
    linear-gradient(90deg, rgba(255,255,255,.016) 1px, transparent 1px);
  background-size: 58px 58px;
  -webkit-mask-image: linear-gradient(to bottom, black, transparent 95%);
  mask-image: linear-gradient(to bottom, black, transparent 95%);
}
.bd-cursor {
  position: fixed; inset: 0; pointer-events: none; z-index: 1; mix-blend-mode: screen;
  background: radial-gradient(360px 360px at var(--mx,50%) var(--my,30%), rgba(255,120,0,.10), transparent 70%);
}

/* loader */
.bd-loader {
  position: fixed; inset: 0; z-index: 200; display: grid; place-items: center;
  background: #070101; transition: opacity .7s ease, visibility .7s ease;
}
.bd-loader.hide { opacity: 0; visibility: hidden; }
.bd-loader-mark {
  font-size: clamp(76px, 16vw, 240px); letter-spacing: -.06em; color: var(--bd-red);
  animation: bdPunch 1.1s cubic-bezier(.2,.8,.2,1) both;
}
.bd-loader-mark i { color: var(--bd-orange); font-style: normal; }
@keyframes bdPunch {
  0% { transform: scale(.82); filter: blur(16px); opacity: 0; }
  55% { transform: scale(1.05); filter: blur(0); opacity: 1; }
  100% { transform: scale(1); }
}

.bd-progress {
  position: fixed; top: 0; left: 0; height: 3px; width: 0%;
  background: linear-gradient(90deg, var(--bd-red), var(--bd-orange));
  z-index: 120; box-shadow: 0 0 16px rgba(247,172,43,.7);
}

/* nav */
.bd-nav {
  position: fixed; top: 16px; left: 50%; transform: translateX(-50%);
  width: min(calc(100% - 24px), 1200px); z-index: 90;
  display: flex; align-items: center; justify-content: space-between;
  padding: 8px 8px 8px 22px; border-radius: 999px;
  border: 1px solid rgba(255,190,110,.16);
  background: linear-gradient(180deg, rgba(26,8,5,.86), rgba(12,4,3,.78));
  backdrop-filter: blur(22px); box-shadow: 0 22px 60px rgba(0,0,0,.5);
}
.bd-pill {
  display: inline-flex; align-items: center; gap: 7px;
  color: var(--bd-muted); border: 1px solid rgba(255,255,255,.09);
  background: rgba(255,255,255,.035); border-radius: 999px;
  padding: 9px 14px; font-size: 12.5px; font-weight: 600; white-space: nowrap;
}

/* buttons */
.bd-cta {
  position: relative; display: inline-flex; align-items: center; gap: 9px;
  min-height: 46px; padding: 0 22px; border-radius: 999px;
  font-weight: 800; font-size: 14.5px; color: #1a0500;
  border: 1px solid rgba(255,228,180,.5);
  background: linear-gradient(135deg, #f7ac2b 0%, #ec5b2b 52%, #d4402f 100%);
  box-shadow: 0 14px 34px rgba(212,64,47,.42), inset 0 1px 0 rgba(255,255,255,.4);
  transition: transform .22s ease, box-shadow .22s ease, filter .22s ease;
}
.bd-cta:hover { transform: translateY(-2px); filter: brightness(1.06); box-shadow: 0 22px 50px rgba(247,172,43,.4), inset 0 1px 0 rgba(255,255,255,.5); }
.bd-ghost {
  display: inline-flex; align-items: center; gap: 9px;
  min-height: 46px; padding: 0 22px; border-radius: 999px; font-weight: 700; font-size: 14.5px;
  color: var(--bd-cream); border: 1px solid rgba(255,243,223,.2);
  background: rgba(255,255,255,.035); transition: border-color .22s ease, transform .22s ease, background .22s ease;
}
.bd-ghost:hover { transform: translateY(-2px); border-color: rgba(247,172,43,.5); background: rgba(247,172,43,.07); }

/* section frame */
.bd-section { position: relative; z-index: 4; padding: 104px 22px; }
.bd-wrap { width: min(100%, 1200px); margin: 0 auto; position: relative; }
.bd-kicker {
  display: inline-flex; align-items: center; gap: 10px;
  color: var(--bd-orange); font-weight: 800; font-size: 12px;
  letter-spacing: .16em; text-transform: uppercase; margin-bottom: 18px;
}
.bd-kicker::before { content: ""; width: 30px; height: 2px; border-radius: 2px;
  background: linear-gradient(90deg, var(--bd-red), var(--bd-orange)); }
.bd-title {
  font-size: clamp(44px, 6.6vw, 96px); line-height: .9;
  letter-spacing: -.05em; text-transform: uppercase;
}
.bd-title .stroke { color: transparent; -webkit-text-stroke: 1.5px rgba(255,243,223,.32); }
.bd-copy {
  margin-top: 18px; max-width: 600px; color: var(--bd-muted);
  font-size: 16.5px; line-height: 1.62; font-weight: 500;
}
.bd-eyebrow {
  display: inline-flex; align-items: center; gap: 9px; width: fit-content;
  color: #ffdcab; border: 1px solid rgba(247,172,43,.32);
  background: rgba(255,132,0,.08); border-radius: 999px; padding: 9px 15px;
  font-size: 11.5px; font-weight: 800; letter-spacing: .12em; text-transform: uppercase;
}
.bd-eyebrow .dot { position: relative; width: 8px; height: 8px; }
.bd-eyebrow .dot::before, .bd-eyebrow .dot::after {
  content: ""; position: absolute; inset: 0; border-radius: 50%; background: var(--bd-orange);
}
.bd-eyebrow .dot::after { animation: bdPing 1.8s ease-out infinite; }
@keyframes bdPing { 0% { transform: scale(1); opacity: .8; } 100% { transform: scale(3); opacity: 0; } }

/* hero watermark */
.bd-watermark {
  position: absolute; pointer-events: none; z-index: 0; user-select: none;
  font-size: clamp(200px, 33vw, 560px); line-height: .72; letter-spacing: -.08em;
  color: transparent; -webkit-text-stroke: 1.5px rgba(212,64,47,.12);
}

/* ===== hero scene — framed mountain ===== */
.bd-scene {
  position: relative; min-height: 540px; border-radius: 30px; overflow: hidden;
  border: 1px solid rgba(247,172,43,.18);
  background: linear-gradient(180deg, #2a0a05 0%, #160604 46%, #0a0302 100%);
  box-shadow: 0 40px 100px rgba(0,0,0,.6), inset 0 0 90px rgba(0,0,0,.5);
}
.bd-stars {
  position: absolute; inset: 0;
  background-image:
    radial-gradient(1.6px 1.6px at 18% 16%, rgba(255,243,223,.95), transparent),
    radial-gradient(1.4px 1.4px at 72% 11%, rgba(255,243,223,.75), transparent),
    radial-gradient(1.1px 1.1px at 44% 26%, rgba(255,243,223,.6), transparent),
    radial-gradient(1.5px 1.5px at 86% 30%, rgba(255,243,223,.55), transparent),
    radial-gradient(1.1px 1.1px at 30% 8%, rgba(255,243,223,.7), transparent),
    radial-gradient(1.2px 1.2px at 58% 36%, rgba(255,243,223,.4), transparent),
    radial-gradient(1.3px 1.3px at 9% 32%, rgba(255,243,223,.5), transparent);
}
.bd-sun {
  position: absolute; left: 50%; top: 33%; transform: translate(-50%,-50%);
  width: 160px; height: 160px; border-radius: 50%;
  background: radial-gradient(circle, #ffe6a6 0%, #f7ac2b 34%, #ec5b2b 62%, transparent 74%);
  box-shadow: 0 0 130px 44px rgba(247,172,43,.5);
  animation: bdSun 5s ease-in-out infinite alternate;
}
@keyframes bdSun { from { transform: translate(-50%,-50%) scale(.94); } to { transform: translate(-50%,-50%) scale(1.06); } }
.bd-halo {
  position: absolute; left: 50%; top: 33%; transform: translate(-50%,-50%);
  border-radius: 50%; border: 1px solid rgba(247,172,43,.2);
}
.bd-halo.h1 { width: 250px; height: 250px; }
.bd-halo.h2 { width: 360px; height: 360px; border-color: rgba(247,172,43,.12); }
.bd-haze {
  position: absolute; left: 0; right: 0; bottom: 0; height: 62%;
  background: linear-gradient(180deg, transparent, rgba(212,64,47,.28) 55%, rgba(247,172,43,.16));
}
.bd-ridge { position: absolute; bottom: 0; left: 50%; transform: translateX(-50%); }
.bd-ridge.r4 { width: 150%; height: 38%; background: #4a160c;
  clip-path: polygon(0 100%,14% 52%,30% 78%,46% 38%,62% 70%,80% 30%,100% 66%,100% 100%); opacity: .55; }
.bd-ridge.r3 { width: 142%; height: 50%; background: #3a0f08;
  clip-path: polygon(0 100%,20% 44%,40% 74%,58% 26%,78% 60%,100% 36%,100% 100%); opacity: .8; }
.bd-ridge.r2 { width: 128%; height: 78%;
  background: linear-gradient(160deg, #6a1c0e 0%, #260805 64%);
  clip-path: polygon(0 100%, 50% 4%, 100% 100%); }
.bd-ridge.r1 { width: 128%; height: 78%;
  background: linear-gradient(120deg, rgba(247,172,43,.5) 0%, rgba(247,172,43,0) 30%);
  clip-path: polygon(0 100%, 50% 4%, 100% 100%); }
.bd-ridge.rim { width: 128%; height: 78%;
  background: linear-gradient(180deg, rgba(255,230,166,.9) 0 1.4%, transparent 2.6%);
  clip-path: polygon(0 100%, 50% 4%, 100% 100%); filter: blur(.4px); }
.bd-summit {
  position: absolute; left: 50%; bottom: 73%; transform: translateX(-50%);
  display: grid; place-items: center; width: 30px; height: 30px;
}
.bd-summit::before {
  content: ""; position: absolute; width: 30px; height: 30px; border-radius: 50%;
  background: radial-gradient(circle, rgba(255,230,166,.7), transparent 68%);
  animation: bdSun 3s ease-in-out infinite alternate;
}
.bd-glasscard {
  position: absolute; z-index: 3; border-radius: 16px; padding: 12px 14px;
  border: 1px solid rgba(255,243,223,.16);
  background: linear-gradient(160deg, rgba(30,9,6,.88), rgba(12,4,3,.7));
  backdrop-filter: blur(10px); box-shadow: 0 20px 44px rgba(0,0,0,.5);
}
.bd-badge {
  position: absolute; z-index: 3; left: 18px; top: 22px; width: 210px;
  border-radius: 20px; padding: 18px;
  border: 1px solid rgba(247,172,43,.3);
  background: linear-gradient(140deg, rgba(36,9,5,.94), rgba(88,15,7,.6));
  box-shadow: 0 28px 64px rgba(212,64,47,.3); backdrop-filter: blur(12px);
  animation: bdFloat 5.4s ease-in-out infinite;
}
@keyframes bdFloat { 0%,100%{transform:translateY(0) rotate(-2deg);} 50%{transform:translateY(-12px) rotate(1.5deg);} }
.bd-float-a { right: 20px; top: 30px; animation: bdFloat 6s ease-in-out infinite; }
.bd-float-b { right: 36px; bottom: 30px; animation: bdFloat 7s ease-in-out infinite reverse; }

/* cards */
.bd-card {
  position: relative; overflow: hidden; border-radius: 24px; padding: 28px;
  border: 1px solid rgba(255,164,32,.14);
  background: linear-gradient(160deg, rgba(34,9,6,.9), rgba(9,2,1,.78));
  box-shadow: 0 24px 60px rgba(0,0,0,.34);
  transition: transform .32s cubic-bezier(.2,.8,.2,1), border-color .32s ease, box-shadow .32s ease;
}
.bd-card::after {
  content: ""; position: absolute; top: 0; left: 0; right: 0; height: 2px;
  background: linear-gradient(90deg, var(--bd-red), var(--bd-orange));
  opacity: 0; transition: opacity .32s ease;
}
.bd-card::before {
  content: ""; position: absolute; inset: -100px auto auto -120px;
  width: 240px; height: 240px; opacity: .85;
  background: radial-gradient(circle, rgba(212,64,47,.26), transparent 64%);
}
.bd-card:hover {
  transform: translateY(-9px); border-color: rgba(247,172,43,.42);
  box-shadow: 0 36px 80px rgba(212,64,47,.24);
}
.bd-card:hover::after { opacity: 1; }
.bd-icon {
  position: relative; z-index: 1;
  width: 50px; height: 50px; border-radius: 14px; display: grid; place-items: center;
  border: 1px solid rgba(247,172,43,.32);
  background: linear-gradient(135deg, rgba(212,64,47,.24), rgba(247,172,43,.12));
  box-shadow: inset 0 1px 0 rgba(255,255,255,.08);
}
.bd-num {
  font-size: clamp(56px, 6.6vw, 92px); line-height: .76; letter-spacing: -.04em;
  color: transparent; -webkit-text-stroke: 1.8px rgba(247,172,43,.48);
}

/* faq */
.bd-faq-item {
  border: 1px solid rgba(255,164,32,.13); background: rgba(255,255,255,.03);
  border-radius: 16px; overflow: hidden; transition: border-color .25s ease, background .25s ease;
}
.bd-faq-item.open { border-color: rgba(247,172,43,.4); background: rgba(247,120,0,.06); }
.bd-faq-q {
  width: 100%; border: 0; background: transparent; color: var(--bd-cream);
  padding: 19px 20px; display: flex; justify-content: space-between; align-items: center;
  gap: 16px; text-align: left; cursor: pointer; font-size: 16px; font-weight: 800;
}
.bd-faq-icon {
  width: 30px; height: 30px; flex: 0 0 auto; border-radius: 50%; display: grid; place-items: center;
  background: rgba(247,172,43,.12); color: var(--bd-orange); transition: transform .28s ease;
}
.bd-faq-item.open .bd-faq-icon { transform: rotate(180deg); }
.bd-faq-a { max-height: 0; overflow: hidden; transition: max-height .35s ease; }
.bd-faq-a p { padding: 0 20px 20px; color: var(--bd-muted); line-height: 1.62; font-weight: 500; }

/* reveal */
.bd-reveal { opacity: 0; transform: translateY(40px); transition: opacity .8s cubic-bezier(.2,.8,.2,1), transform .8s cubic-bezier(.2,.8,.2,1); }
.bd-reveal.in { opacity: 1; transform: translateY(0); }

@media (max-width: 900px) {
  .bd-section { padding: 76px 16px; }
  .bd-nav { padding: 8px 8px 8px 16px; }
  .bd-nav .bd-pill { display: none; }
  .bd-scene { min-height: 420px; margin-top: 28px; }
  .bd-badge { width: 170px; padding: 14px; }
}
@media (prefers-reduced-motion: reduce) {
  .bd-reveal { opacity: 1; transform: none; }
  .bd-sun, .bd-badge, .bd-marquee-track, .bd-float-a, .bd-float-b, .bd-summit::before, .bd-eyebrow .dot::after { animation: none; }
}

/* marquee */
.bd-marquee {
  position: relative; z-index: 4; overflow: hidden;
  border-block: 1px solid rgba(247,172,43,.18);
  background: linear-gradient(180deg, rgba(247,172,43,.06), rgba(255,255,255,.02));
  transform: rotate(-1.4deg) scale(1.04);
}
.bd-marquee-track { display: flex; width: max-content; padding: 16px 0; animation: bdMarquee 26s linear infinite; }
.bd-marquee-track span {
  font-size: clamp(32px, 5.4vw, 72px); line-height: .9; text-transform: uppercase;
  padding-right: 34px; white-space: nowrap; color: transparent;
  -webkit-text-stroke: 1px rgba(255,243,223,.36);
}
.bd-marquee-track span:nth-child(even) { color: var(--bd-red); -webkit-text-stroke: 0; }
@keyframes bdMarquee { from { transform: translateX(0); } to { transform: translateX(-50%); } }
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
      { threshold: 0.12, rootMargin: "0px 0px -40px 0px" },
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
      style={{ paddingTop: 154, paddingBottom: 64 }}
    >
      <div
        className="bd-watermark bd-display"
        aria-hidden
        style={{ right: "-5vw", bottom: "-9vh" }}
      >
        BRAVE
      </div>
      <div className="bd-wrap grid lg:grid-cols-[1.04fr_.96fr] gap-12 items-center">
        <div className="bd-reveal">
          <div className="bd-eyebrow">
            <span className="dot" /> For NIAT students only
          </div>
          <h1
            className="bd-display bd-title mt-7"
            style={{ fontSize: "clamp(52px, 8.6vw, 128px)" }}
          >
            Boosting Revenue{" "}
            <span style={{ color: "var(--bd-red)" }}>through AI</span>{" "}
            <span style={{ color: "var(--bd-orange)" }}>Value Engineering</span>
          </h1>
          <p className="bd-copy" style={{ fontSize: 18.5, fontWeight: 600 }}>
            Find a small business. Increase their revenue with AI. Get them to
            pay you. Three months, one real business, built by you.
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
          <div className="flex flex-wrap gap-3 mt-10">
            {[
              { k: "Hunt", v: "Find a real business problem" },
              { k: "Build", v: "Ship an AI-powered fix" },
              { k: "Earn", v: "Win revenue from real clients" },
            ].map((s) => (
              <div
                key={s.k}
                className="rounded-2xl px-4 py-3 min-w-[168px] flex-1"
                style={{
                  border: "1px solid rgba(255,255,255,.09)",
                  background:
                    "linear-gradient(160deg, rgba(255,255,255,.05), rgba(255,255,255,.015))",
                }}
              >
                <p
                  className="bd-display"
                  style={{ fontSize: 27, color: "var(--bd-orange)" }}
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

        {/* Hero scene — framed CSS mountain */}
        <div className="bd-reveal">
          <div className="bd-scene">
            <div className="bd-stars" aria-hidden />
            <div className="bd-halo h2" aria-hidden />
            <div className="bd-halo h1" aria-hidden />
            <div className="bd-sun" aria-hidden />
            <div className="bd-haze" aria-hidden />
            <div className="bd-ridge r4" aria-hidden />
            <div className="bd-ridge r3" aria-hidden />
            <div className="bd-ridge r2" aria-hidden />
            <div className="bd-ridge r1" aria-hidden />
            <div className="bd-ridge rim" aria-hidden />
            <div className="bd-summit" aria-hidden>
              <Flag
                className="w-3.5 h-3.5 relative"
                style={{ color: "var(--bd-orange)" }}
              />
            </div>

            <div className="bd-badge">
              <p
                className="bd-display"
                style={{ fontSize: 38, color: "var(--bd-red)" }}
              >
                BRAVE
              </p>
              <p
                style={{
                  marginTop: 5,
                  fontSize: 12.5,
                  color: "var(--bd-muted)",
                  fontWeight: 600,
                  lineHeight: 1.4,
                }}
              >
                Open to all NIAT students · 15 Apr – 15 Jul.
              </p>
            </div>

            <div className="bd-glasscard bd-float-a">
              <p
                style={{
                  fontSize: 10,
                  fontWeight: 800,
                  letterSpacing: ".1em",
                  textTransform: "uppercase",
                  color: "var(--bd-muted)",
                }}
              >
                Verified revenue
              </p>
              <p
                className="bd-display"
                style={{ fontSize: 26, color: "var(--bd-orange)" }}
              >
                ₹ Real money
              </p>
            </div>

            <div className="bd-glasscard bd-float-b flex items-center gap-2">
              <span
                className="w-2 h-2 rounded-full"
                style={{
                  background: "#34d36a",
                  boxShadow: "0 0 10px #34d36a",
                }}
              />
              <span style={{ fontSize: 12.5, fontWeight: 700 }}>
                Reach the summit
              </span>
            </div>
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
              <div className="flex items-center justify-between">
                <div className="bd-icon">
                  <Icon
                    className="w-5 h-5"
                    style={{ color: "var(--bd-orange)" }}
                  />
                </div>
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 900,
                    letterSpacing: ".12em",
                    textTransform: "uppercase",
                    color: "var(--bd-orange)",
                  }}
                >
                  {tag}
                </span>
              </div>
              <h3
                className="bd-display mt-5"
                style={{
                  fontSize: "clamp(28px,3.3vw,40px)",
                  lineHeight: 0.98,
                }}
              >
                {title}
              </h3>
              <p
                className="mt-2.5"
                style={{
                  color: "var(--bd-muted)",
                  fontWeight: 500,
                  lineHeight: 1.55,
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
              className="bd-card bd-reveal flex flex-col"
              style={{ minHeight: 296 }}
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
                className="bd-display mt-6"
                style={{
                  fontSize: "clamp(40px,5vw,60px)",
                  lineHeight: 0.9,
                  color: "var(--bd-orange)",
                }}
              >
                {title}
              </h3>
              <p
                className="mt-3"
                style={{
                  color: "rgba(255,243,223,.8)",
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
              className="bd-card bd-reveal flex flex-col"
              style={{ minHeight: 300 }}
            >
              <div className="flex items-center gap-3">
                <div className="bd-icon">
                  <Icon
                    className="w-5 h-5"
                    style={{ color: "var(--bd-orange)" }}
                  />
                </div>
                <span
                  className="rounded-full px-3 py-1"
                  style={{
                    fontSize: 11,
                    fontWeight: 900,
                    letterSpacing: ".08em",
                    textTransform: "uppercase",
                    color: "var(--bd-orange)",
                    border: "1px solid rgba(255,255,255,.14)",
                    background: "rgba(255,255,255,.05)",
                  }}
                >
                  {tag}
                </span>
              </div>
              <p
                className="bd-display mt-5"
                style={{ fontSize: 27, lineHeight: 1.05 }}
              >
                {problem}
              </p>
              <p
                className="mt-auto pt-5 flex items-start gap-2"
                style={{
                  color: "rgba(255,243,223,.82)",
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
            borderRadius: 34,
            border: "1px solid rgba(247,172,43,.24)",
            background:
              "radial-gradient(640px 360px at 84% 14%, rgba(247,172,43,.24), transparent 70%), linear-gradient(135deg, rgba(116,14,6,.82), rgba(8,2,1,.9))",
            padding: "clamp(28px,5vw,62px)",
            boxShadow: "0 44px 110px rgba(0,0,0,.5)",
          }}
        >
          <div className="grid lg:grid-cols-2 gap-9 items-end">
            <div>
              <p className="bd-kicker">Demo Day</p>
              <h2
                className="bd-display"
                style={{
                  fontSize: "clamp(56px,10.5vw,144px)",
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
                  className="flex gap-4 rounded-2xl p-4"
                  style={{
                    border: "1px solid rgba(255,255,255,.12)",
                    background: "rgba(255,255,255,.05)",
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
                      style={{ fontSize: 23, color: "var(--bd-orange)" }}
                    >
                      {title}
                    </h3>
                    <p
                      style={{
                        marginTop: 3,
                        color: "var(--bd-muted)",
                        fontWeight: 600,
                        fontSize: 13.5,
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
      <div className="bd-wrap" style={{ maxWidth: 940 }}>
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
      <div className="bd-wrap grid lg:grid-cols-[.78fr_1.22fr] gap-10 items-start">
        <div className="bd-reveal lg:sticky lg:top-28">
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
                  style={{ maxHeight: isOpen ? 340 : 0 }}
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
      style={{ paddingTop: 110, paddingBottom: 124 }}
    >
      <div
        className="bd-watermark bd-display"
        aria-hidden
        style={{ left: "50%", transform: "translateX(-50%)", bottom: "-6vh" }}
      >
        TRY
      </div>
      <div className="bd-wrap bd-reveal" style={{ maxWidth: 800 }}>
        <h2
          className="bd-display"
          style={{
            fontSize: "clamp(54px,10.5vw,150px)",
            lineHeight: 0.86,
            letterSpacing: "-.06em",
            textTransform: "uppercase",
          }}
        >
          Are you <span style={{ color: "var(--bd-orange)" }}>brave</span>{" "}
          enough to try?
        </h2>
        <p className="bd-copy" style={{ marginInline: "auto", marginTop: 22 }}>
          Hunt a real problem, build with AI, prove the value, and earn from
          real businesses.
        </p>
        <div className="flex justify-center mt-9">
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
        borderTop: "1px solid rgba(247,172,43,.15)",
        background: "rgba(0,0,0,.5)",
      }}
    >
      <div className="bd-wrap flex flex-col md:flex-row items-center justify-between gap-4">
        <BraveLogo className="text-[24px]" />
        <p style={{ color: "var(--bd-muted)", fontSize: 13, fontWeight: 600 }}>
          Boosting Revenue through AI Value Engineering
        </p>
        <p style={{ color: "rgba(255,243,223,.4)", fontSize: 12.5 }}>
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
