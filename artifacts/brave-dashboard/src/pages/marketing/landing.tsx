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
  Instagram,
} from "lucide-react";
import { BraveLogo } from "@/components/brave-logo";
import { INSTAGRAM_URL } from "@/components/instagram-link";
import { Chatbot } from "@/components/chatbot";
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
   Fonts: Sora (display) + Inter (body). Tuned for smooth scrolling.
   ==================================================================== */

function BraveStyles() {
  return (
    <style>{`
@import url('https://fonts.googleapis.com/css2?family=Sora:wght@500;600;700;800&family=Inter:wght@400;500;600;700&display=swap');

.bd-root {
  --bd-red: #d4402f;
  --bd-orange: #f7ac2b;
  --bd-cream: #fff3df;
  --bd-muted: rgba(255,243,223,0.76);
  position: relative;
  overflow-x: clip;
  color: var(--bd-cream);
  font-family: 'Inter', system-ui, -apple-system, "Segoe UI", sans-serif;
  background:
    radial-gradient(900px 520px at 16% 0%, rgba(212,64,47,.30), transparent 70%),
    radial-gradient(760px 480px at 88% 12%, rgba(247,172,43,.16), transparent 70%),
    linear-gradient(180deg,#0b0403 0%,#150603 44%,#070201 100%);
}
.bd-display { font-family: 'Sora', 'Inter', system-ui, sans-serif; font-weight: 800; letter-spacing: -.022em; }

/* texture overlay (static — no scroll cost) */
.bd-grid {
  position: fixed; inset: 0; pointer-events: none; z-index: 0;
  background-image:
    linear-gradient(rgba(255,255,255,.02) 1px, transparent 1px),
    linear-gradient(90deg, rgba(255,255,255,.015) 1px, transparent 1px);
  background-size: 60px 60px;
  -webkit-mask-image: linear-gradient(to bottom, black, transparent 95%);
  mask-image: linear-gradient(to bottom, black, transparent 95%);
}

/* loader */
.bd-loader {
  position: fixed; inset: 0; z-index: 200; display: grid; place-items: center;
  background: #070101; transition: opacity .6s ease, visibility .6s ease;
}
.bd-loader.hide { opacity: 0; visibility: hidden; }
.bd-loader-mark {
  font-size: clamp(56px, 11vw, 142px); letter-spacing: -.03em; color: var(--bd-red);
  animation: bdPunch 1s cubic-bezier(.2,.8,.2,1) both;
}
.bd-loader-mark i { color: var(--bd-orange); font-style: normal; }
@keyframes bdPunch {
  0% { transform: scale(.86); opacity: 0; }
  55% { transform: scale(1.04); opacity: 1; }
  100% { transform: scale(1); }
}

.bd-progress {
  position: fixed; top: 0; left: 0; height: 3px; width: 0%;
  background: linear-gradient(90deg, var(--bd-red), var(--bd-orange));
  z-index: 120; box-shadow: 0 0 14px rgba(247,172,43,.6);
}

/* nav */
.bd-nav {
  position: fixed; top: 16px; left: 50%; transform: translateX(-50%);
  width: min(calc(100% - 24px), 1200px); z-index: 90;
  display: flex; align-items: center; justify-content: space-between;
  padding: 8px 8px 8px 22px; border-radius: 999px;
  border: 1px solid rgba(255,190,110,.16);
  background: linear-gradient(180deg, rgba(26,8,5,.95), rgba(12,4,3,.92));
  box-shadow: 0 18px 44px rgba(0,0,0,.5);
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
  font-weight: 700; font-size: 14.5px; color: #1a0500;
  border: 1px solid rgba(255,228,180,.5);
  background: linear-gradient(135deg, #f7ac2b 0%, #ec5b2b 52%, #d4402f 100%);
  box-shadow: 0 12px 28px rgba(212,64,47,.38), inset 0 1px 0 rgba(255,255,255,.4);
  transition: transform .2s ease, box-shadow .2s ease, filter .2s ease;
}
.bd-cta:hover { transform: translateY(-2px); filter: brightness(1.06); box-shadow: 0 18px 40px rgba(247,172,43,.36), inset 0 1px 0 rgba(255,255,255,.5); }
.bd-ghost {
  display: inline-flex; align-items: center; gap: 9px;
  min-height: 46px; padding: 0 22px; border-radius: 999px; font-weight: 600; font-size: 14.5px;
  color: var(--bd-cream); border: 1px solid rgba(255,243,223,.2);
  background: rgba(255,255,255,.035); transition: border-color .2s ease, transform .2s ease, background .2s ease;
}
.bd-ghost:hover { transform: translateY(-2px); border-color: rgba(247,172,43,.5); background: rgba(247,172,43,.07); }

/* section frame */
.bd-section { position: relative; z-index: 4; padding: 96px 22px; }
.bd-wrap { width: min(100%, 1200px); margin: 0 auto; position: relative; }
.bd-kicker {
  display: inline-flex; align-items: center; gap: 10px;
  color: var(--bd-orange); font-weight: 700; font-size: 12px;
  letter-spacing: .14em; text-transform: uppercase; margin-bottom: 16px;
}
.bd-kicker::before { content: ""; width: 28px; height: 2px; border-radius: 2px;
  background: linear-gradient(90deg, var(--bd-red), var(--bd-orange)); }
.bd-title {
  font-size: clamp(32px, 4.3vw, 60px); line-height: 1.06;
  letter-spacing: -.022em;
}
.bd-title .stroke { color: transparent; -webkit-text-stroke: 1.4px rgba(255,243,223,.34); }
.bd-copy {
  margin-top: 16px; max-width: 600px; color: var(--bd-muted);
  font-size: 16px; line-height: 1.68; font-weight: 400;
}
.bd-eyebrow {
  display: inline-flex; align-items: center; gap: 9px; width: fit-content;
  color: #ffdcab; border: 1px solid rgba(247,172,43,.32);
  background: rgba(255,132,0,.08); border-radius: 999px; padding: 8px 15px;
  font-size: 11.5px; font-weight: 700; letter-spacing: .1em; text-transform: uppercase;
}
.bd-eyebrow .dot { position: relative; width: 8px; height: 8px; }
.bd-eyebrow .dot::before, .bd-eyebrow .dot::after {
  content: ""; position: absolute; inset: 0; border-radius: 50%; background: var(--bd-orange);
}
.bd-eyebrow .dot::after { animation: bdPing 2s ease-out infinite; }
@keyframes bdPing { 0% { transform: scale(1); opacity: .8; } 100% { transform: scale(3); opacity: 0; } }

/* hero watermark */
.bd-watermark {
  position: absolute; pointer-events: none; z-index: 0; user-select: none;
  font-size: clamp(130px, 21vw, 320px); line-height: .72; letter-spacing: -.03em;
  color: transparent; -webkit-text-stroke: 1.4px rgba(212,64,47,.12);
}

/* ===== hero scene — animated "Revenue Ascent" ===== */
.bd-scene {
  position: relative; min-height: 520px; border-radius: 28px; overflow: hidden;
  border: 1px solid rgba(247,172,43,.2);
  background:
    radial-gradient(440px 320px at 84% 16%, rgba(247,172,43,.18), transparent 70%),
    linear-gradient(180deg, #220804 0%, #140503 52%, #080201 100%);
  box-shadow: 0 32px 80px rgba(0,0,0,.55), inset 0 1px 0 rgba(255,255,255,.04);
}
.bd-scene-head {
  position: absolute; z-index: 6; left: 22px; top: 18px;
  display: flex; align-items: center; gap: 9px;
  font-size: 10.5px; font-weight: 700; letter-spacing: .15em;
  text-transform: uppercase; color: var(--bd-muted);
}
.bd-live { position: relative; width: 7px; height: 7px; border-radius: 50%; background: #34d36a; }
.bd-live::after {
  content: ""; position: absolute; inset: 0; border-radius: 50%; background: #34d36a;
  animation: bdPing 2s ease-out infinite;
}
.bd-asc-svg { position: absolute; inset: 0; width: 100%; height: 100%; display: block; }

/* svg motion choreography */
.bd-asc-grid { opacity: 0; animation: bdAppear 1s ease-out .1s forwards; }
.bd-asc-bar {
  transform-box: fill-box; transform-origin: 50% 100%; transform: scaleY(0);
  animation: bdBar 1s cubic-bezier(.2,.8,.2,1) forwards;
}
.bd-asc-area { opacity: 0; animation: bdAppear 1.3s ease-out 1.5s forwards; }
.bd-asc-line {
  stroke-dasharray: 720; stroke-dashoffset: 720;
  filter: drop-shadow(0 3px 9px rgba(247,172,43,.5));
  animation: bdDraw 2.3s cubic-bezier(.4,0,.2,1) .4s forwards;
}
.bd-asc-mile {
  transform-box: fill-box; transform-origin: center; transform: scale(0);
  animation: bdPop .55s cubic-bezier(.34,1.5,.5,1) forwards;
}
.bd-asc-ring {
  transform-box: fill-box; transform-origin: center; opacity: 0;
  animation: bdRing 2.6s ease-out infinite;
}
.bd-asc-flag {
  transform-box: fill-box; transform-origin: 50% 100%; transform: scale(0);
  animation: bdPop .6s cubic-bezier(.34,1.5,.5,1) 2.7s forwards;
}
.bd-asc-label { opacity: 0; animation: bdAppear .6s ease-out 2.5s forwards; }
.bd-asc-comet {
  opacity: 0; animation: bdAppear .5s ease-out 2.5s forwards;
  filter: drop-shadow(0 0 7px rgba(255,230,166,.9));
}
.bd-asc-sun {
  transform-box: fill-box; transform-origin: center;
  animation: bdGlow 5s ease-in-out infinite alternate;
}
@keyframes bdDraw { to { stroke-dashoffset: 0; } }
@keyframes bdAppear { to { opacity: 1; } }
@keyframes bdBar { to { transform: scaleY(1); } }
@keyframes bdPop { to { transform: scale(1); } }
@keyframes bdRing { 0% { transform: scale(.5); opacity: .85; } 70%,100% { transform: scale(2.7); opacity: 0; } }
@keyframes bdGlow { from { opacity: .55; } to { opacity: 1; } }

/* floating info chips */
.bd-chip {
  position: absolute; z-index: 5; border-radius: 16px;
  border: 1px solid rgba(247,172,43,.26);
  background: linear-gradient(155deg, rgba(42,13,8,.98), rgba(14,5,4,.97));
  box-shadow: 0 18px 40px rgba(0,0,0,.55);
  will-change: transform;
}
.bd-chip-a { right: 22px; bottom: 22px; padding: 14px 16px; animation: bdFloat 6s ease-in-out infinite; }
.bd-chip-b { left: 22px; top: 58px; padding: 9px 13px; animation: bdFloat 7.4s ease-in-out infinite reverse; }
@keyframes bdFloat { 0%,100%{transform:translateY(0);} 50%{transform:translateY(-9px);} }

/* rising ember particles */
.bd-ember {
  position: absolute; bottom: 14%; width: 3px; height: 3px; border-radius: 50%;
  background: var(--bd-orange); box-shadow: 0 0 8px rgba(247,172,43,.9);
  will-change: transform, opacity; animation: bdEmber 6.5s linear infinite;
}
@keyframes bdEmber {
  0% { transform: translateY(0) scale(1); opacity: 0; }
  14% { opacity: .95; }
  78% { opacity: .45; }
  100% { transform: translateY(-300px) scale(.35); opacity: 0; }
}

/* cards */
.bd-card {
  position: relative; overflow: hidden; border-radius: 22px; padding: 28px;
  border: 1px solid rgba(255,164,32,.14);
  background: linear-gradient(160deg, rgba(34,9,6,.9), rgba(9,2,1,.78));
  box-shadow: 0 16px 40px rgba(0,0,0,.3);
  transition: transform .26s cubic-bezier(.2,.8,.2,1), border-color .26s ease, box-shadow .26s ease;
}
.bd-card::after {
  content: ""; position: absolute; top: 0; left: 0; right: 0; height: 2px;
  background: linear-gradient(90deg, var(--bd-red), var(--bd-orange));
  opacity: 0; transition: opacity .26s ease;
}
.bd-card::before {
  content: ""; position: absolute; inset: -100px auto auto -120px;
  width: 240px; height: 240px; opacity: .8;
  background: radial-gradient(circle, rgba(212,64,47,.24), transparent 64%);
}
.bd-card:hover {
  transform: translateY(-6px); border-color: rgba(247,172,43,.42);
  box-shadow: 0 26px 56px rgba(212,64,47,.2);
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
  font-size: clamp(46px, 5.2vw, 70px); line-height: .8; letter-spacing: -.03em;
  color: transparent; -webkit-text-stroke: 1.6px rgba(247,172,43,.46);
}

/* faq */
.bd-faq-item {
  border: 1px solid rgba(255,164,32,.13); background: rgba(255,255,255,.03);
  border-radius: 16px; overflow: hidden; transition: border-color .22s ease, background .22s ease;
}
.bd-faq-item.open { border-color: rgba(247,172,43,.4); background: rgba(247,120,0,.06); }
.bd-faq-q {
  width: 100%; border: 0; background: transparent; color: var(--bd-cream);
  padding: 19px 20px; display: flex; justify-content: space-between; align-items: center;
  gap: 16px; text-align: left; cursor: pointer; font-size: 15.5px; font-weight: 700;
  font-family: 'Inter', sans-serif;
}
.bd-faq-icon {
  width: 30px; height: 30px; flex: 0 0 auto; border-radius: 50%; display: grid; place-items: center;
  background: rgba(247,172,43,.12); color: var(--bd-orange); transition: transform .26s ease;
}
.bd-faq-item.open .bd-faq-icon { transform: rotate(180deg); }
.bd-faq-a { max-height: 0; overflow: hidden; transition: max-height .3s ease; }
.bd-faq-a p { padding: 0 20px 20px; color: var(--bd-muted); line-height: 1.66; font-weight: 400; }

/* reveal */
.bd-reveal { opacity: 0; transform: translateY(28px); transition: opacity .6s ease, transform .6s ease; }
.bd-reveal.in { opacity: 1; transform: translateY(0); }

@media (max-width: 900px) {
  .bd-section { padding: 70px 16px; }
  .bd-nav { padding: 8px 8px 8px 16px; }
  .bd-nav .bd-pill { display: none; }
  .bd-scene { min-height: 380px; margin-top: 26px; }
  .bd-chip-a { padding: 11px 13px; }
}
@media (prefers-reduced-motion: reduce) {
  .bd-reveal { opacity: 1; transform: none; }
  .bd-marquee-track, .bd-chip-a, .bd-chip-b, .bd-ember, .bd-asc-sun, .bd-asc-ring,
  .bd-eyebrow .dot::after, .bd-live::after { animation: none; }
  .bd-asc-line { stroke-dashoffset: 0; animation: none; }
  .bd-asc-area, .bd-asc-grid, .bd-asc-label, .bd-asc-comet { opacity: 1; animation: none; }
  .bd-asc-bar, .bd-asc-mile, .bd-asc-flag { transform: none; animation: none; }
}

/* marquee */
.bd-marquee {
  position: relative; z-index: 4; overflow: hidden;
  border-block: 1px solid rgba(247,172,43,.18);
  background: linear-gradient(180deg, rgba(247,172,43,.06), rgba(255,255,255,.02));
  transform: rotate(-1.4deg) scale(1.04);
}
.bd-marquee-track {
  display: flex; width: max-content; padding: 16px 0;
  will-change: transform; animation: bdMarquee 30s linear infinite;
}
.bd-marquee-track span {
  font-size: clamp(24px, 3.6vw, 50px); line-height: .9; text-transform: uppercase;
  padding-right: 34px; white-space: nowrap; color: transparent;
  -webkit-text-stroke: 1px rgba(255,243,223,.36); letter-spacing: -.01em;
}
.bd-marquee-track span:nth-child(even) { color: var(--bd-red); -webkit-text-stroke: 0; }
@keyframes bdMarquee { from { transform: translateX(0); } to { transform: translateX(-50%); } }
`}</style>
  );
}

/* ====================================================================
   PAGE-LEVEL EFFECTS — rAF-throttled, no per-frame repaint overlays
   ==================================================================== */

function useBraveEffects() {
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const t = window.setTimeout(() => setLoaded(true), 800);

    const progress = document.getElementById("bd-progress");
    let raf = 0;
    const onScroll = () => {
      if (raf) return;
      raf = window.requestAnimationFrame(() => {
        raf = 0;
        if (!progress) return;
        const top = window.scrollY;
        const h = document.documentElement.scrollHeight - window.innerHeight;
        progress.style.width = `${Math.max(0, Math.min(100, (top / h) * 100))}%`;
      });
    };
    window.addEventListener("scroll", onScroll, { passive: true });
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
      { threshold: 0.1, rootMargin: "0px 0px -40px 0px" },
    );
    document.querySelectorAll(".bd-reveal").forEach((el) => io.observe(el));

    return () => {
      window.clearTimeout(t);
      if (raf) window.cancelAnimationFrame(raf);
      window.removeEventListener("scroll", onScroll);
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
      style={{ paddingTop: 150, paddingBottom: 60 }}
    >
      <div
        className="bd-watermark bd-display"
        aria-hidden
        style={{ right: "-4vw", bottom: "-7vh" }}
      >
        BRAVE
      </div>
      <div className="bd-wrap grid lg:grid-cols-[1.04fr_.96fr] gap-12 items-center">
        <div className="bd-reveal">
          <div className="bd-eyebrow">
            <span className="dot" /> For NIAT students only
          </div>
          <h1
            className="bd-display mt-6"
            style={{
              fontSize: "clamp(36px, 5vw, 74px)",
              lineHeight: 1.04,
              letterSpacing: "-.022em",
            }}
          >
            Boosting Revenue{" "}
            <span style={{ color: "var(--bd-red)" }}>through AI</span>{" "}
            <span style={{ color: "var(--bd-orange)" }}>Value Engineering</span>
          </h1>
          <p className="bd-copy" style={{ fontSize: 17, fontWeight: 500 }}>
            Find a small business. Increase their revenue with AI. Get them to
            pay you. Three months, one real business, built by you.
          </p>
          <div className="flex flex-wrap gap-3 mt-8">
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
                className="rounded-2xl px-4 py-3 min-w-[168px] flex-1"
                style={{
                  border: "1px solid rgba(255,255,255,.09)",
                  background:
                    "linear-gradient(160deg, rgba(255,255,255,.05), rgba(255,255,255,.015))",
                }}
              >
                <p
                  className="bd-display"
                  style={{ fontSize: 21, color: "var(--bd-orange)" }}
                >
                  {s.k}
                </p>
                <p
                  style={{
                    fontSize: 12.5,
                    color: "var(--bd-muted)",
                    fontWeight: 500,
                    marginTop: 2,
                  }}
                >
                  {s.v}
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* Hero scene — animated "Revenue Ascent" */}
        <div className="bd-reveal">
          <div className="bd-scene">
            <div className="bd-scene-head">
              <span className="bd-live" /> Revenue ascent · Live
            </div>

            <svg
              className="bd-asc-svg"
              viewBox="0 0 500 520"
              preserveAspectRatio="xMidYMid slice"
              aria-hidden
            >
              <defs>
                <linearGradient id="bdStroke" x1="0" y1="1" x2="1" y2="0">
                  <stop offset="0" stopColor="#d4402f" />
                  <stop offset="0.55" stopColor="#f7ac2b" />
                  <stop offset="1" stopColor="#ffe6a6" />
                </linearGradient>
                <linearGradient id="bdArea" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0" stopColor="rgba(247,172,43,.4)" />
                  <stop offset="1" stopColor="rgba(247,172,43,0)" />
                </linearGradient>
                <linearGradient id="bdBarG" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0" stopColor="rgba(247,172,43,.32)" />
                  <stop offset="1" stopColor="rgba(212,64,47,.04)" />
                </linearGradient>
                <radialGradient id="bdSunG">
                  <stop offset="0" stopColor="#ffe7a8" />
                  <stop offset="0.4" stopColor="#f7ac2b" />
                  <stop offset="0.72" stopColor="rgba(236,91,43,.42)" />
                  <stop offset="1" stopColor="rgba(236,91,43,0)" />
                </radialGradient>
              </defs>

              {/* sun behind the summit */}
              <circle
                className="bd-asc-sun"
                cx="452"
                cy="92"
                r="96"
                fill="url(#bdSunG)"
              />

              {/* grid */}
              <g
                className="bd-asc-grid"
                stroke="rgba(255,243,223,.07)"
                strokeWidth="1"
              >
                <line x1="40" y1="130" x2="468" y2="130" />
                <line x1="40" y1="226" x2="468" y2="226" />
                <line x1="40" y1="322" x2="468" y2="322" />
                <line x1="40" y1="418" x2="468" y2="418" />
              </g>

              {/* revenue bars */}
              <g>
                {[
                  { x: 80, h: 70 },
                  { x: 162, h: 112 },
                  { x: 244, h: 92 },
                  { x: 326, h: 158 },
                  { x: 408, h: 232 },
                ].map((b, i) => (
                  <rect
                    key={i}
                    className="bd-asc-bar"
                    x={b.x - 20}
                    y={466 - b.h}
                    width="40"
                    height={b.h}
                    rx="6"
                    fill="url(#bdBarG)"
                    style={{ animationDelay: `${0.15 + i * 0.13}s` }}
                  />
                ))}
              </g>

              {/* area under the ascent line */}
              <path
                className="bd-asc-area"
                d="M44 452 L120 384 L172 410 L256 286 L312 312 L388 178 L456 86 L456 466 L44 466 Z"
                fill="url(#bdArea)"
              />

              {/* self-drawing ascent line */}
              <path
                className="bd-asc-line"
                d="M44 452 L120 384 L172 410 L256 286 L312 312 L388 178 L456 86"
                fill="none"
                stroke="url(#bdStroke)"
                strokeWidth="4"
                strokeLinejoin="round"
                strokeLinecap="round"
              />

              {/* milestones */}
              <circle
                className="bd-asc-ring"
                cx="120"
                cy="384"
                r="9"
                fill="none"
                stroke="#f7ac2b"
                strokeWidth="1.5"
                style={{ animationDelay: "2.2s" }}
              />
              <g className="bd-asc-mile" style={{ animationDelay: "1.9s" }}>
                <circle
                  cx="120"
                  cy="384"
                  r="5.5"
                  fill="#1a0604"
                  stroke="#f7ac2b"
                  strokeWidth="2.4"
                />
              </g>
              <text
                className="bd-asc-label"
                x="120"
                y="366"
                textAnchor="middle"
                fill="rgba(255,243,223,.78)"
                style={{ font: "700 12px Inter, sans-serif" }}
              >
                ₹50K
              </text>

              <circle
                className="bd-asc-ring"
                cx="256"
                cy="286"
                r="9"
                fill="none"
                stroke="#f7ac2b"
                strokeWidth="1.5"
                style={{ animationDelay: "2.6s" }}
              />
              <g className="bd-asc-mile" style={{ animationDelay: "2.15s" }}>
                <circle
                  cx="256"
                  cy="286"
                  r="5.5"
                  fill="#1a0604"
                  stroke="#f7ac2b"
                  strokeWidth="2.4"
                />
              </g>
              <text
                className="bd-asc-label"
                x="256"
                y="268"
                textAnchor="middle"
                fill="rgba(255,243,223,.82)"
                style={{ font: "700 12px Inter, sans-serif" }}
              >
                ₹1L
              </text>

              {/* summit milestone + flag */}
              <circle
                className="bd-asc-ring"
                cx="456"
                cy="86"
                r="11"
                fill="none"
                stroke="#ffe6a6"
                strokeWidth="1.8"
                style={{ animationDelay: "3s" }}
              />
              <g className="bd-asc-mile" style={{ animationDelay: "2.4s" }}>
                <circle
                  cx="456"
                  cy="86"
                  r="6.5"
                  fill="#ffe6a6"
                  stroke="#f7ac2b"
                  strokeWidth="2.4"
                />
              </g>
              <g className="bd-asc-flag">
                <line
                  x1="456"
                  y1="86"
                  x2="456"
                  y2="52"
                  stroke="#ffe6a6"
                  strokeWidth="2.4"
                  strokeLinecap="round"
                />
                <path d="M456 53 L484 61 L456 70 Z" fill="#f7ac2b" />
              </g>
              <text
                className="bd-asc-label"
                x="438"
                y="44"
                textAnchor="end"
                fill="#ffe6a6"
                style={{
                  font: "800 12px Sora, sans-serif",
                  letterSpacing: ".06em",
                }}
              >
                DEMO DAY
              </text>

              {/* comet travelling the ascent */}
              <g className="bd-asc-comet">
                <circle r="11" fill="rgba(247,172,43,.34)" />
                <circle r="4.2" fill="#fff3df" />
                <animateMotion
                  dur="5.6s"
                  repeatCount="indefinite"
                  path="M44 452 L120 384 L172 410 L256 286 L312 312 L388 178 L456 86"
                />
              </g>
            </svg>

            {/* rising embers */}
            {[16, 34, 53, 71, 88].map((left, i) => (
              <span
                key={i}
                className="bd-ember"
                style={{ left: `${left}%`, animationDelay: `${i * 1.2}s` }}
                aria-hidden
              />
            ))}

            {/* floating chips */}
            <div className="bd-chip bd-chip-a">
              <div className="flex items-center gap-2">
                <span
                  className="grid place-items-center rounded-md"
                  style={{
                    width: 22,
                    height: 22,
                    background:
                      "linear-gradient(135deg, rgba(212,64,47,.3), rgba(247,172,43,.18))",
                    border: "1px solid rgba(247,172,43,.34)",
                  }}
                >
                  <TrendingUp
                    className="w-3 h-3"
                    style={{ color: "var(--bd-orange)" }}
                  />
                </span>
                <span
                  style={{
                    fontSize: 9.5,
                    fontWeight: 700,
                    letterSpacing: ".11em",
                    textTransform: "uppercase",
                    color: "var(--bd-muted)",
                  }}
                >
                  Total verified
                </span>
              </div>
              <p
                className="bd-display"
                style={{
                  fontSize: 26,
                  color: "var(--bd-orange)",
                  marginTop: 7,
                }}
              >
                ₹2,00,000
              </p>
              <p
                style={{
                  marginTop: 2,
                  fontSize: 11,
                  fontWeight: 500,
                  color: "var(--bd-muted)",
                }}
              >
                Demo Day threshold cleared
              </p>
            </div>

            <div className="bd-chip bd-chip-b flex items-center gap-2">
              <Flag
                className="w-3.5 h-3.5"
                style={{ color: "var(--bd-orange)" }}
              />
              <span style={{ fontSize: 12, fontWeight: 600 }}>
                Summit in sight
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
        <div className="grid sm:grid-cols-2 gap-4 mt-10">
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
                    fontWeight: 700,
                    letterSpacing: ".1em",
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
                  fontSize: "clamp(21px,2.4vw,28px)",
                  lineHeight: 1.12,
                }}
              >
                {title}
              </h3>
              <p
                className="mt-2.5"
                style={{
                  color: "var(--bd-muted)",
                  fontWeight: 400,
                  lineHeight: 1.6,
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
        <div className="grid md:grid-cols-3 gap-4 mt-10">
          {STEPS.map(({ n, icon: Icon, title, body }) => (
            <article
              key={n}
              className="bd-card bd-reveal flex flex-col"
              style={{ minHeight: 280 }}
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
                  fontSize: "clamp(28px,3.2vw,40px)",
                  lineHeight: 1,
                  color: "var(--bd-orange)",
                }}
              >
                {title}
              </h3>
              <p
                className="mt-3"
                style={{
                  color: "var(--bd-muted)",
                  fontWeight: 400,
                  lineHeight: 1.6,
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
        <div className="grid md:grid-cols-3 gap-4 mt-10">
          {BUSINESSES.map(({ tag, icon: Icon, problem, fix }) => (
            <article
              key={tag}
              className="bd-card bd-reveal flex flex-col"
              style={{ minHeight: 286 }}
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
                    fontWeight: 700,
                    letterSpacing: ".07em",
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
                style={{ fontSize: 21, lineHeight: 1.2 }}
              >
                {problem}
              </p>
              <p
                className="mt-auto pt-5 flex items-start gap-2"
                style={{
                  color: "var(--bd-muted)",
                  fontWeight: 400,
                  lineHeight: 1.55,
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
            borderRadius: 30,
            border: "1px solid rgba(247,172,43,.24)",
            background:
              "radial-gradient(640px 360px at 84% 14%, rgba(247,172,43,.22), transparent 70%), linear-gradient(135deg, rgba(116,14,6,.85), rgba(8,2,1,.92))",
            padding: "clamp(28px,5vw,58px)",
            boxShadow: "0 32px 80px rgba(0,0,0,.45)",
          }}
        >
          <div className="grid lg:grid-cols-2 gap-9 items-end">
            <div>
              <p className="bd-kicker">Demo Day</p>
              <h2
                className="bd-display"
                style={{
                  fontSize: "clamp(44px,6.2vw,92px)",
                  lineHeight: 1,
                  letterSpacing: "-.022em",
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
                      style={{ fontSize: 18, color: "var(--bd-orange)" }}
                    >
                      {title}
                    </h3>
                    <p
                      style={{
                        marginTop: 3,
                        color: "var(--bd-muted)",
                        fontWeight: 400,
                        fontSize: 13.5,
                        lineHeight: 1.5,
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
            className="bd-card bd-reveal mt-9 text-center"
            style={{ color: "var(--bd-muted)" }}
          >
            Loading resources…
          </div>
        ) : (
          <div className="flex flex-col gap-3 mt-9">
            {preview.map((r) => {
              const isExpanded = expandedId === r.id;
              return (
                <article
                  key={r.id}
                  data-testid={`landing-resource-${r.id}`}
                  className="bd-card bd-reveal flex flex-col md:flex-row md:items-center gap-4"
                >
                  <div className="flex-1 min-w-0">
                    <h3 className="bd-display" style={{ fontSize: 18 }}>
                      {r.title}
                    </h3>
                    <p
                      className={isExpanded ? "" : "line-clamp-2"}
                      style={{
                        marginTop: 6,
                        color: "var(--bd-muted)",
                        fontWeight: 400,
                        lineHeight: 1.6,
                      }}
                    >
                      {r.description}
                    </p>
                    {r.description.length > 120 && (
                      <button
                        type="button"
                        onClick={() => setExpandedId(isExpanded ? null : r.id)}
                        className="mt-1.5 text-xs font-semibold hover:underline"
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
      style={{ paddingTop: 100, paddingBottom: 116 }}
    >
      <div
        className="bd-watermark bd-display"
        aria-hidden
        style={{ left: "50%", transform: "translateX(-50%)", bottom: "-5vh" }}
      >
        TRY
      </div>
      <div className="bd-wrap bd-reveal" style={{ maxWidth: 800 }}>
        <h2
          className="bd-display"
          style={{
            fontSize: "clamp(40px,5.4vw,84px)",
            lineHeight: 1.04,
            letterSpacing: "-.022em",
          }}
        >
          Are you <span style={{ color: "var(--bd-orange)" }}>brave</span>{" "}
          enough to try?
        </h2>
        <p className="bd-copy" style={{ marginInline: "auto", marginTop: 18 }}>
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
        borderTop: "1px solid rgba(247,172,43,.15)",
        background: "rgba(0,0,0,.5)",
      }}
    >
      <div className="bd-wrap flex flex-col md:flex-row items-center justify-between gap-4">
        <BraveLogo className="text-[24px]" />
        <p style={{ color: "var(--bd-muted)", fontSize: 13, fontWeight: 500 }}>
          Boosting Revenue through AI Value Engineering
        </p>
        <div className="flex flex-col items-center gap-2.5 md:items-end">
          <a
            href={INSTAGRAM_URL}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Follow BRAVE on Instagram (opens in a new tab)"
            className="grid h-9 w-9 place-items-center rounded-full text-white shadow-sm transition-all duration-300 hover:-translate-y-0.5 hover:scale-110 hover:rotate-3"
            style={{
              background: "linear-gradient(45deg, #f59e0b, #ec4899, #8b5cf6)",
            }}
          >
            <Instagram className="h-[18px] w-[18px]" />
          </a>
          <p style={{ color: "rgba(255,243,223,.45)", fontSize: 12.5 }}>
            © {new Date().getFullYear()} NIAT India. All rights reserved.
          </p>
        </div>
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
      <Chatbot variant="dark" />
    </div>
  );
}
