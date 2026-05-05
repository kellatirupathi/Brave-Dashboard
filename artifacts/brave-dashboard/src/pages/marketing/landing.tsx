import { useEffect, useState } from "react";
import { Link } from "wouter";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

/* ---------- Inline BRAVE wordmark (matches Framer landing) ---------- */
function BraveWordmark({ className = "" }: { className?: string }) {
  return (
    <div className={`flex items-center gap-2 ${className}`}>
      {/* NIAT shield */}
      <svg
        viewBox="0 0 28 35"
        className="w-7 h-9 shrink-0"
        fill="none"
        aria-hidden
      >
        <path
          d="M0 4h28v17.5C28 28.4 21.7 35 14 35S0 28.4 0 21.5V4Z"
          fill="#1e0d01"
        />
        <text
          x="14"
          y="22"
          textAnchor="middle"
          fontFamily="Supreme, sans-serif"
          fontWeight="800"
          fontSize="11"
          fill="#fff"
          letterSpacing="-0.5"
        >
          NIAT
        </text>
      </svg>
      <span className="text-[#1e0d01] font-bold text-2xl tracking-tight font-[family-name:var(--font-display)] flex items-center gap-1">
        BRAVE
        <span
          className="inline-block w-2 h-2 rotate-45 ml-0.5"
          style={{ background: "var(--color-brave-accent)" }}
        />
      </span>
    </div>
  );
}

/* ---------- Top scrolling ticker ---------- */
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

/* ---------- Floating pill nav ---------- */
function TopNav() {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header className="sticky top-0 z-50 pt-4 pb-2 flex justify-center px-4">
      <div
        className={`flex items-center justify-between gap-6 px-5 py-3 rounded-2xl bg-white border border-black/5 transition-all duration-200 ${
          scrolled
            ? "shadow-[0_10px_30px_-10px_rgba(0,0,0,0.15)]"
            : "shadow-[0_2px_10px_-2px_rgba(0,0,0,0.08)]"
        }`}
        style={{ minWidth: "min(549px, 95vw)" }}
      >
        <Link href="/" data-testid="link-home">
          <BraveWordmark />
        </Link>
        <Link
          href="/login"
          data-testid="nav-login"
          className="inline-flex items-center justify-center px-5 h-10 rounded-xl bg-[#000] text-white text-sm font-[family-name:var(--font-body)] hover:opacity-90 transition-opacity"
          style={{ border: "1px solid rgba(33,33,33,0.53)" }}
        >
          Login
        </Link>
      </div>
    </header>
  );
}

/* ---------- Hero ---------- */
function Hero() {
  return (
    <section
      className="relative w-full overflow-hidden flex flex-col justify-end items-center pb-32 lg:pb-44 pt-16"
      style={{
        minHeight: "92vh",
        background: "linear-gradient(#d6d3ce 76%, #fafafa 100%)",
      }}
    >
      <h1
        className="text-center font-[family-name:var(--font-display)] uppercase font-extrabold tracking-tight"
        style={{
          color: "#1f1f1f",
          fontSize: "clamp(40px, 8vw, 66px)",
          lineHeight: 1.02,
        }}
      >
        Are you BRAVE
        <br />
        enough to try?
      </h1>
    </section>
  );
}

/* ---------- Section: A program where ... + Login CTA ---------- */
function ProgramTagline() {
  return (
    <section className="bg-[#fcfaf8] py-16 lg:py-24 px-6">
      <div className="max-w-3xl mx-auto flex flex-col items-center text-center gap-10">
        <p
          className="font-[family-name:var(--font-display)] font-medium tracking-tight text-balance"
          style={{
            fontSize: "clamp(24px, 4vw, 44px)",
            lineHeight: 1.15,
            color: "#1f1f1f",
            letterSpacing: "-0.04em",
          }}
        >
          A program where students build AI-powered ventures, find real clients,
          and generate real revenue.
        </p>
        <p className="font-[family-name:var(--font-body)] text-base md:text-lg text-[#1f1f1f]">
          India's SMBs need you. Your skills can transform their business.
        </p>
        <Link
          href="/login"
          data-testid="hero-login-cta"
          className="inline-flex items-center justify-center px-8 py-4 rounded-xl bg-[#000] text-white font-[family-name:var(--font-body)] text-base hover:opacity-90 transition-opacity"
          style={{ border: "1px solid rgba(33,33,33,0.53)" }}
        >
          Login to Dashboard
        </Link>
      </div>
    </section>
  );
}

/* ---------- Section heading label with chevron decorations ---------- */
function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-center gap-2 mb-4">
      <span className="text-[#707070] text-[10px]">❯</span>
      <span
        className="font-[family-name:var(--font-body)] font-bold uppercase text-xs tracking-[0.08em]"
        style={{ color: "#707070" }}
      >
        {children}
      </span>
      <span className="text-[#707070] text-[10px]">❮</span>
    </div>
  );
}

/* ---------- "What is BRAVE?" — 4 numbered cards ---------- */
const VALUE_CARDS = [
  {
    n: 1,
    title: "Its Not a workshop, It's a venture",
    body: "Build something real that solves a real customer problem",
  },
  {
    n: 2,
    title: "Its Not a project, It's real clients",
    body: "The market is right outside your campus gate",
  },
  {
    n: 3,
    title: "Its Not a grade, It's revenue",
    body: "Real Revenue, Real Proof",
  },
  {
    n: 4,
    title: "It's not selective, Every NIATian is in",
    body: "Every NIAT student, Solo or team.",
  },
];

function WhatIsBrave() {
  return (
    <section className="bg-[#fcfaf8] py-16 lg:py-24 border-t border-[#e5e5e5]">
      <div className="max-w-7xl mx-auto px-6 lg:px-8">
        <div className="text-center mb-12 lg:mb-16">
          <h2
            className="font-[family-name:var(--font-display)] font-bold tracking-tight text-balance"
            style={{
              fontSize: "clamp(28px, 4.5vw, 44px)",
              lineHeight: 1.05,
              color: "#1f1f1f",
              letterSpacing: "-0.04em",
            }}
          >
            What is BRAVE?
          </h2>
          <p className="mt-4 font-[family-name:var(--font-body)] text-base md:text-lg text-[#1f1f1f] max-w-xl mx-auto">
            Build an AI startup, Generate real revenue, Pitch to 10 investors at
            Demo Day with upto ₹5 Crore in funding on the table.
          </p>
        </div>

        <div className="grid sm:grid-cols-2 gap-6 lg:gap-8">
          {VALUE_CARDS.map((c) => (
            <article
              key={c.n}
              className="rounded-2xl bg-white p-8 flex flex-col gap-6 border border-black/[0.04]"
              style={{ boxShadow: "0 0 24px rgba(255, 244, 219, 0.25)" }}
              data-testid={`value-card-${c.n}`}
            >
              <div
                className="w-8 h-8 rounded-full flex items-center justify-center bg-white"
                style={{ border: "1px solid rgba(34,34,34,0.1)" }}
              >
                <span className="font-[family-name:var(--font-body)] font-medium text-sm text-[#0a0a0a]">
                  {c.n}
                </span>
              </div>
              <div>
                <h3
                  className="font-[family-name:var(--font-display)] font-medium text-2xl mb-2"
                  style={{
                    color: "#050a00",
                    letterSpacing: "-0.5px",
                    lineHeight: 1.4,
                  }}
                >
                  {c.title}
                </h3>
                <p
                  className="font-[family-name:var(--font-body)] font-medium text-base"
                  style={{ color: "#6b6b6b", lineHeight: 1.6 }}
                >
                  {c.body}
                </p>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ---------- Philosophy / Mindset — vertical timeline ---------- */
const MINDSET = [
  {
    n: 1,
    title: "Create value. Capture value.",
    body: "Find a real problem. Solve it well. When a customer pays you, that is value created and captured. That is the foundation of every business",
  },
  {
    n: 2,
    title: "Think like an entrepreneur.",
    body: "Spot an opportunity. Make a move. That's what separates entrepreneurs from everyone else.",
  },
  {
    n: 3,
    title: "Build it with AI.",
    body: "AI is not the product. It's your unfair advantage. Use it to build faster, solve better, reach more customers.",
  },
  {
    n: 4,
    title: "Do your thing.",
    body: "The only way to find out if you can build something is to go build it. No one is going to do it for you.",
  },
];

function Philosophy() {
  return (
    <section className="relative bg-[#fcfaf8] py-16 lg:py-24 border-t border-[#e5e5e5] overflow-hidden">
      <div
        className="absolute top-1/3 right-[-10%] w-[864px] h-[322px] rounded-full opacity-20 blur-[78px] pointer-events-none"
        style={{ background: "var(--color-brave-coral)" }}
      />
      <div
        className="absolute bottom-0 left-[58px] w-[600px] h-[389px] rounded-full blur-[78px] pointer-events-none"
        style={{ background: "rgba(254,131,242,0.1)" }}
      />

      <div className="relative max-w-7xl mx-auto px-6 lg:px-8 grid lg:grid-cols-2 gap-12 lg:gap-24">
        <div>
          <SectionLabel>Philosophy</SectionLabel>
          <h2
            className="font-[family-name:var(--font-display)] font-bold tracking-tight text-center lg:text-left"
            style={{
              fontSize: "clamp(28px, 4.5vw, 44px)",
              lineHeight: 1.05,
              color: "#1f1f1f",
              letterSpacing: "-0.04em",
            }}
          >
            The BRAVE mindset
          </h2>
        </div>

        <div className="flex flex-col">
          {MINDSET.map((item, i) => (
            <div key={item.n} className="flex gap-5">
              <div className="flex flex-col items-center">
                <div
                  className="w-8 h-8 rounded-full bg-white flex items-center justify-center shrink-0"
                  style={{ border: "1px solid rgba(34,34,34,0.1)" }}
                >
                  <span className="font-[family-name:var(--font-body)] text-sm font-medium text-[#0a0a0a]">
                    {item.n}
                  </span>
                </div>
                {i < MINDSET.length - 1 && (
                  <div className="w-px flex-1 bg-[#d6d6d6] mt-2" />
                )}
              </div>
              <div className="pb-10">
                <h3
                  className="font-[family-name:var(--font-display)] font-medium text-2xl mb-2"
                  style={{
                    color: "#050a00",
                    letterSpacing: "-0.5px",
                    lineHeight: 1.4,
                  }}
                >
                  {item.title}
                </h3>
                <p
                  className="font-[family-name:var(--font-body)] text-base"
                  style={{ color: "#545454", lineHeight: "26px" }}
                >
                  {item.body}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ---------- How It Works — 3 steps ---------- */
const STEPS = [
  {
    title: "Build",
    body: "Pick a real problem around you. Use AI to build a solution for it.",
  },
  {
    title: "Earn",
    body: "Go find your first customer. When they pay you, you've created & captured value.",
  },
  {
    title: "Prove",
    body: "Real invoices, Real payments, your proof of business will be your ticket to the Demo Day.",
  },
];

function HowItWorks() {
  return (
    <section className="bg-[#fcfaf8] py-16 lg:py-24 border-t border-[#e5e5e5]">
      <div className="max-w-7xl mx-auto px-6 lg:px-8">
        <div className="text-center mb-12 lg:mb-16">
          <SectionLabel>How it works</SectionLabel>
          <h2
            className="font-[family-name:var(--font-display)] font-bold tracking-tight text-balance"
            style={{
              fontSize: "clamp(28px, 4.5vw, 44px)",
              lineHeight: 1.05,
              color: "#1f1f1f",
              letterSpacing: "-0.04em",
            }}
          >
            Three steps. No ceremony.
          </h2>
        </div>

        <div className="grid md:grid-cols-3 gap-6">
          {STEPS.map((s) => (
            <article
              key={s.title}
              className="rounded-2xl bg-white p-8 flex flex-col gap-3 border border-black/[0.04]"
              style={{ boxShadow: "0 0 24px rgba(255, 244, 219, 0.25)" }}
            >
              <h3
                className="font-[family-name:var(--font-display)] font-medium text-2xl"
                style={{
                  color: "#050a00",
                  letterSpacing: "-0.5px",
                  lineHeight: 1.4,
                }}
              >
                {s.title}
              </h3>
              <p
                className="font-[family-name:var(--font-body)] font-medium text-base"
                style={{ color: "#6b6b6b", lineHeight: 1.6 }}
              >
                {s.body}
              </p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ---------- Demo Day grid ---------- */
const DEMO_CARDS = [
  {
    title: "₹2L",
    body: "Generate ₹2 lakh in verified revenue as a team. That's your ticket in.",
  },
  {
    title: "10",
    body: "Pitch your venture to 10 real investors who write real cheques",
  },
  {
    title: "Upto ₹5 Cr",
    body: "The top ventures walk away with actual investment, not just applause.",
  },
  {
    title: "GRIT",
    body: "Top performers earn direct entry to GRIT Finale, NIAT's fully sponsored global immersion program.",
  },
  {
    title: "Mentorship",
    body: "You're not doing this alone. Mentors guide you through the 90 days.",
  },
];

function DemoDay() {
  return (
    <section className="relative bg-[#fcfaf8] py-16 lg:py-24 border-t border-[#e5e5e5] overflow-hidden">
      <div
        className="absolute top-1/3 left-1/3 w-[600px] h-[389px] rounded-full opacity-30 blur-[78px] pointer-events-none"
        style={{ background: "rgba(254,131,242,0.1)" }}
      />
      <div className="relative max-w-7xl mx-auto px-6 lg:px-8">
        <div className="text-center mb-12 lg:mb-16">
          <SectionLabel>Big picture</SectionLabel>
          <h2
            className="font-[family-name:var(--font-display)] font-bold tracking-tight"
            style={{
              fontSize: "clamp(28px, 4.5vw, 44px)",
              lineHeight: 1.05,
              color: "#1f1f1f",
              letterSpacing: "-0.04em",
            }}
          >
            Demo Day
          </h2>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {DEMO_CARDS.map((c) => (
            <article
              key={c.title}
              className="rounded-2xl bg-white p-8 flex flex-col gap-3 border border-black/[0.04]"
              style={{ boxShadow: "0 0 24px rgba(255, 244, 219, 0.25)" }}
            >
              <h3
                className="font-[family-name:var(--font-display)] font-medium text-2xl"
                style={{
                  color: "#050a00",
                  letterSpacing: "-0.5px",
                  lineHeight: 1.4,
                }}
              >
                {c.title}
              </h3>
              <p
                className="font-[family-name:var(--font-body)] font-medium text-base"
                style={{ color: "#6b6b6b", lineHeight: 1.6 }}
              >
                {c.body}
              </p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ---------- FAQ ---------- */
const FAQS = [
  {
    q: "Who can participate?",
    a: "All NIAT students across all 19 campuses. No selection process. No application. If you're a NIAT student, you're eligible.",
  },
  {
    q: "Do I need a team?",
    a: "Yes — small teams work best. You can form one with classmates or browse open teams once you log in.",
  },
  {
    q: "Do I need prior experience?",
    a: "No. If you're curious and willing to talk to clients and ship fast with AI tools, you're ready.",
  },
  {
    q: "What do I actually build?",
    a: "Anything that drives real revenue for a real customer — a storefront, a WhatsApp flow, an automation, a campaign. The customer pays for the value.",
  },
  {
    q: "How does Demo Day work?",
    a: "Teams that hit the ₹2 lakh verified-revenue threshold qualify to pitch a panel of investors at the national finale.",
  },
];

function FAQ() {
  return (
    <section
      id="faq"
      className="bg-[#fcfaf8] py-16 lg:py-24 border-t border-[#e5e5e5] scroll-mt-20"
    >
      <div className="max-w-3xl mx-auto px-6 lg:px-8">
        <div className="text-center mb-10 lg:mb-12">
          <SectionLabel>F.A.Q</SectionLabel>
          <h2
            className="font-[family-name:var(--font-display)] font-bold tracking-tight"
            style={{
              fontSize: "clamp(28px, 4.5vw, 44px)",
              lineHeight: 1.05,
              color: "#221f1f",
              letterSpacing: "-0.04em",
            }}
          >
            Questions? Answered.
          </h2>
        </div>

        <Accordion type="single" collapsible className="flex flex-col gap-4">
          {FAQS.map((f, i) => (
            <AccordionItem
              key={i}
              value={`item-${i}`}
              className="rounded-2xl bg-white border border-black/[0.06] px-6 data-[state=open]:shadow-[0_4px_20px_-8px_rgba(0,0,0,0.1)]"
              data-testid={`faq-${i}`}
            >
              <AccordionTrigger className="text-left hover:no-underline py-5 font-[family-name:var(--font-body)] font-semibold text-[18px] text-[#0a0a0a]">
                {f.q}
              </AccordionTrigger>
              <AccordionContent
                className="font-[family-name:var(--font-body)] text-base pb-5"
                style={{ color: "#5b5b5b", lineHeight: 1.7 }}
              >
                {f.a}
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </div>
    </section>
  );
}

/* ---------- Footer ---------- */
function Footer() {
  return (
    <footer
      className="py-12 lg:py-16 px-6"
      style={{ background: "var(--color-brave-footer)" }}
    >
      <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
        <div className="flex flex-col gap-3">
          <span className="text-white font-bold text-2xl tracking-tight font-[family-name:var(--font-display)] flex items-center gap-1">
            BRAVE
            <span
              className="inline-block w-2 h-2 rotate-45 ml-0.5"
              style={{ background: "var(--color-brave-accent)" }}
            />
          </span>
          <p className="text-white/80 text-sm font-[family-name:var(--font-body)] font-light">
            Boosting Revenue through AI Value Engineering
          </p>
        </div>
        <p className="text-white/70 text-xs font-[family-name:var(--font-body)]">
          BRAVE {new Date().getFullYear()}. All rights reserved.
        </p>
      </div>
    </footer>
  );
}

/* ---------- Page ---------- */
export default function Landing() {
  return (
    <div
      className="min-h-screen font-[family-name:var(--font-body)]"
      style={{ background: "var(--color-brave-cream)" }}
    >
      <Ticker />
      <TopNav />
      <main>
        <Hero />
        <ProgramTagline />
        <WhatIsBrave />
        <Philosophy />
        <HowItWorks />
        <DemoDay />
        <FAQ />
      </main>
      <Footer />
    </div>
  );
}
