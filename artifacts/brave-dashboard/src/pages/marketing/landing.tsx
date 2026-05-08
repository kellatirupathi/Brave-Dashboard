import { useEffect, useState } from "react";
import { Link } from "wouter";
import {
  ArrowRight,
  Users,
  Trophy,
  Sparkles,
  IndianRupee,
  Calendar,
  ChevronRight,
} from "lucide-react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { BraveLogo } from "@/components/brave-logo";

/* ====================================================================
   ORIGINAL CONTENT — preserved as-is
   ==================================================================== */

const NAV_LINKS = [
  { label: "Case Studies", href: "#case-studies" },
  { label: "How it works", href: "#how-it-works" },
  { label: "FAQ", href: "#faq" },
];

const VALUE_PILLARS = [
  {
    icon: Sparkles,
    title: "Build with AI",
    body: "Ship working tools fast using modern AI builders — no senior dev required.",
  },
  {
    icon: Users,
    title: "Find real SME clients",
    body: "Partner with small and medium businesses around your campus that need help growing.",
  },
  {
    icon: IndianRupee,
    title: "Generate real revenue",
    body: "Get paid by SMEs for the value you deliver — every rupee is tracked and verified.",
  },
  {
    icon: Trophy,
    title: "Pitch at Demo Day",
    body: "Present revenue, traction, and impact to a panel of investors at the national finale.",
  },
];

const STEPS = [
  {
    n: "01",
    title: "Build",
    body: "Form a small team, pick an SME, and build them a revenue-driving tool with AI.",
  },
  {
    n: "02",
    title: "Earn",
    body: "Ship work that SMEs pay for. Log every order; coordinators verify the revenue.",
  },
  {
    n: "03",
    title: "Prove",
    body: "Climb the national leaderboard and qualify for Demo Day to pitch investors.",
  },
];

const CASE_STUDIES = [
  {
    team: "Gooooo",
    sector: "Interior Designs and Architecture",
    score: 93,
    revenue: null as string | null,
    highlights: [
      "MVP Product",
      "High Scale & Replicability",
      "Excellent Pitch",
      "Advance Received",
    ],
  },
  {
    team: "BusinessGrp-1",
    sector: "Vasantha Lakshmi Women's PG Interior Designing",
    score: 85,
    revenue: "₹5,000",
    highlights: [
      "MVP Product",
      "Medium Scale",
      "Good Pitch",
      "Advance Received",
    ],
  },
  {
    team: "Chaloo Bharath",
    sector: "Conversations Into Clinical Care",
    score: 95,
    revenue: "₹40,000",
    highlights: [
      "MVP Product",
      "High Scale & Replicability",
      "Excellent Pitch",
      "Advance Received",
    ],
  },
  {
    team: "Let Make It Happen",
    sector: "Farmers Group Of India",
    score: 95,
    revenue: "₹1,75,000",
    highlights: [
      "MVP Product",
      "High Scale & Replicability",
      "Excellent Pitch",
      "Advance Received",
    ],
  },
];

const FAQS = [
  {
    q: "Who can participate?",
    a: "BRAVE is open to all NIAT students across our 20 campuses. No prior business experience needed.",
  },
  {
    q: "Do I need a team?",
    a: "Yes — small teams work best. You can form one with classmates or browse open teams once you log in.",
  },
  {
    q: "Do I need prior experience?",
    a: "No. If you're curious and willing to talk to SMEs and ship fast with AI tools, you're ready.",
  },
  {
    q: "What do I actually build?",
    a: "Anything that drives real revenue for an SME — a storefront, a WhatsApp flow, an automation, a campaign. The SME pays for the value.",
  },
];

/* ====================================================================
   NEW FRAMER-STYLE BUILDING BLOCKS
   ==================================================================== */

// Thin wrapper around the shared BraveLogo so existing call sites in this
// page (nav, footer, mobile menu) keep working unchanged. NIAT shield was
// removed per brand decision — the BRAVE wordmark stands on its own.
function BraveWordmark({ className = "" }: { className?: string }) {
  return (
    <div className={`flex items-center ${className}`}>
      <BraveLogo className="text-2xl" />
    </div>
  );
}

function Ticker() {
  const items = Array.from({ length: 8 });
  return (
    <div className="w-full overflow-hidden" style={{ background: "#111111" }}>
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

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 mb-4">
      <span className="text-[#111111] text-[10px]">❯</span>
      <span
        className="font-bold uppercase text-xs tracking-[0.3em]"
        style={{
          color: "#111111",
          fontFamily: "var(--font-brave-ui)",
        }}
      >
        {children}
      </span>
      <span className="text-[#111111] text-[10px]">❮</span>
    </div>
  );
}

// 2026 BRAVE brand: outlined cards, sharp/minimal corners, no drop shadow.
// Strict 4-color palette (red / black / bone-white / amber).
const cardClass = "bg-white border border-black p-7 flex flex-col gap-3";
const cardShadow = "none";

// Display headlines — Bebas Neue, ALL CAPS, ultra-tight tracking. Per the
// brand guide, "All caps" is mandatory for headlines.
const sectionHeading: React.CSSProperties = {
  fontSize: "clamp(32px, 5vw, 56px)",
  lineHeight: 0.95,
  color: "#111111",
  letterSpacing: "-0.03em",
  fontFamily: "var(--font-brave-display)",
  textTransform: "uppercase",
};

const cardTitleStyle: React.CSSProperties = {
  color: "#111111",
  letterSpacing: "-0.02em",
  lineHeight: 1.05,
  fontFamily: "var(--font-brave-display)",
  textTransform: "uppercase",
};

const cardBodyStyle: React.CSSProperties = {
  color: "#5b5b5b",
  lineHeight: 1.6,
  fontFamily: "var(--font-brave-ui)",
};

/* ====================================================================
   SECTIONS — original content, restyled
   ==================================================================== */

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
        className={`flex items-center justify-between gap-6 px-5 py-3 rounded-2xl bg-white border border-black/5 transition-all duration-200 w-full max-w-2xl ${
          scrolled
            ? "shadow-[0_10px_30px_-10px_rgba(0,0,0,0.15)]"
            : "shadow-[0_2px_10px_-2px_rgba(0,0,0,0.08)]"
        }`}
      >
        <Link href="/" data-testid="link-home">
          <BraveWordmark />
        </Link>
        <nav className="hidden md:flex items-center gap-1">
          {NAV_LINKS.map((l) => (
            <a
              key={l.href}
              href={l.href}
              data-testid={`nav-${l.href.slice(1)}`}
              className="px-3 py-2 rounded-md text-sm font-[family-name:var(--font-brave-ui)] text-[#5b5b5b] hover:text-black transition-colors"
            >
              {l.label}
            </a>
          ))}
        </nav>
        <Link
          href="/login"
          data-testid="nav-login"
          className="inline-flex items-center justify-center px-5 h-10 text-white text-sm font-[family-name:var(--font-brave-ui)] hover:opacity-90 transition-opacity shrink-0 uppercase tracking-[0.2em]"
          style={{ background: "#111111" }}
        >
          Login
        </Link>
      </div>
    </header>
  );
}

function Hero() {
  return (
    <section
      className="relative overflow-hidden"
      style={{ background: "#F4F1EC" }}
    >
      <div className="relative max-w-6xl mx-auto px-6 lg:px-10 pt-14 pb-24 lg:pt-20 lg:pb-32">
        <div className="max-w-3xl mx-auto text-center">
          <div
            className="inline-flex items-center gap-2 px-4 py-1.5 mb-7"
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
              style={{
                color: "#111111",
                fontFamily: "var(--font-brave-ui)",
              }}
            >
              Cohort opens April 15, 2026
            </span>
          </div>

          <h1
            className="mb-6"
            style={{
              ...sectionHeading,
              fontSize: "clamp(48px, 8vw, 88px)",
              lineHeight: 0.92,
            }}
          >
            Boost revenue for{" "}
            <span style={{ color: "#C0392B" }}>India's SMEs.</span>
          </h1>

          <p
            className="text-base md:text-lg leading-relaxed mb-10 max-w-2xl mx-auto"
            style={{
              color: "#5b5b5b",
              fontFamily: "var(--font-brave-ui)",
            }}
          >
            BRAVE is a NIAT program where students partner with small and medium
            businesses to boost their revenue and help them become ready for the
            AI era.
          </p>

          <div className="flex flex-wrap items-center justify-center gap-3">
            <Link
              href="/login"
              data-testid="hero-login"
              className="inline-flex items-center gap-2 px-6 py-3.5 text-base font-medium text-white hover:opacity-90 transition-opacity uppercase tracking-[0.2em]"
              style={{
                background: "#111111",
                fontFamily: "var(--font-brave-ui)",
              }}
            >
              Login
              <ArrowRight className="w-4 h-4" />
            </Link>
            <a
              href="#case-studies"
              data-testid="hero-case-studies"
              className="inline-flex items-center gap-2 px-6 py-3.5 text-base font-medium hover:bg-[#F4F1EC] transition-colors uppercase tracking-[0.2em]"
              style={{
                background: "#FFFFFF",
                border: "1px solid #111111",
                color: "#111111",
                fontFamily: "var(--font-brave-ui)",
              }}
            >
              See Case Studies
              <ChevronRight className="w-4 h-4" />
            </a>
          </div>

          <div
            className="mt-10 inline-flex items-center gap-2 text-sm uppercase tracking-[0.2em]"
            style={{
              color: "#5b5b5b",
              fontFamily: "var(--font-brave-ui)",
            }}
          >
            <Calendar className="w-4 h-4" style={{ color: "#C0392B" }} />
            April 15 – July 15, 2026 · Open to all NIAT students
          </div>
        </div>
      </div>
    </section>
  );
}

function CaseStudies() {
  return (
    <section
      id="case-studies"
      className="bg-[#F4F1EC] py-16 lg:py-24 border-t border-[#e5e5e5] scroll-mt-20"
    >
      <div className="max-w-7xl mx-auto px-6 lg:px-10">
        <div className="mb-12 lg:mb-14 max-w-2xl">
          <SectionLabel>Case Studies</SectionLabel>
          <h2
            className="font-[family-name:var(--font-brave-display)] font-bold tracking-tight mb-3"
            style={sectionHeading}
          >
            Real SMEs. Real revenue. Real students.
          </h2>
          <p
            className="font-[family-name:var(--font-brave-ui)] text-base"
            style={{ color: "#5b5b5b", lineHeight: 1.6 }}
          >
            Gold-tier teams from the BRAVE cohort that won SME approval and
            advance payment.
          </p>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {CASE_STUDIES.map((c, i) => (
            <article
              key={c.team}
              data-testid={`case-study-${i}`}
              className={cardClass}
              style={{ boxShadow: cardShadow }}
            >
              <div className="flex items-center justify-between mb-2">
                <span
                  className="inline-flex items-center rounded-full px-2.5 py-1 text-[10px] font-[family-name:var(--font-brave-ui)] font-bold tracking-widest uppercase"
                  style={{
                    background: "rgba(219, 71, 80, 0.08)",
                    border: "1px solid rgba(219, 71, 80, 0.25)",
                    color: "#C0392B",
                  }}
                >
                  Gold Tier
                </span>
                <div className="text-right">
                  <p
                    className="text-[10px] font-bold tracking-widest uppercase"
                    style={{ color: "#a6a6a6" }}
                  >
                    Score
                  </p>
                  <p
                    className="font-[family-name:var(--font-brave-display)] font-bold text-xl leading-none mt-0.5"
                    style={{ color: "#1f1f1f" }}
                  >
                    {c.score}
                    <span
                      className="text-xs font-medium"
                      style={{ color: "#a6a6a6" }}
                    >
                      /100
                    </span>
                  </p>
                </div>
              </div>
              <h3
                className="font-[family-name:var(--font-brave-display)] font-medium text-lg"
                style={cardTitleStyle}
              >
                {c.team}
              </h3>
              <p
                className="font-[family-name:var(--font-brave-ui)] text-sm"
                style={{ color: "#6b6b6b", lineHeight: 1.5 }}
              >
                {c.sector}
              </p>
              <p
                className="font-[family-name:var(--font-brave-ui)] text-xs font-semibold mt-2"
                style={{ color: "#5b5b5b" }}
              >
                Approval + Advance Payment
              </p>
              {c.revenue && (
                <p
                  className="font-[family-name:var(--font-brave-display)] font-bold text-base"
                  style={{ color: "#C0392B" }}
                >
                  Revenue earned: {c.revenue}
                </p>
              )}
              <ul className="mt-auto flex flex-wrap gap-1.5 pt-2">
                {c.highlights.map((h) => (
                  <li
                    key={h}
                    className="rounded-full px-2.5 py-1 text-[11px] font-[family-name:var(--font-brave-ui)] font-medium"
                    style={{
                      background: "#f5f5f5",
                      border: "1px solid rgba(34,34,34,0.06)",
                      color: "#5b5b5b",
                    }}
                  >
                    {h}
                  </li>
                ))}
              </ul>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

function WhatIsBrave() {
  return (
    <section className="bg-[#F4F1EC] py-16 lg:py-24 border-t border-[#e5e5e5]">
      <div className="max-w-7xl mx-auto px-6 lg:px-10">
        <div className="mb-12 max-w-3xl">
          <SectionLabel>What is BRAVE</SectionLabel>
          <h2
            className="font-[family-name:var(--font-brave-display)] font-bold tracking-tight mb-4"
            style={sectionHeading}
          >
            A program designed to boost revenues for SMEs.
          </h2>
          <p
            className="font-[family-name:var(--font-brave-ui)] text-lg"
            style={{ color: "#5b5b5b", lineHeight: 1.65 }}
          >
            NIAT students find their own small and medium business partners,
            build with AI, ship work that earns money for the SME, and log
            verified revenue — all the way to a national Demo Day.
          </p>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {VALUE_PILLARS.map(({ icon: Icon, title, body }) => (
            <div
              key={title}
              className={cardClass}
              style={{ boxShadow: cardShadow }}
            >
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center"
                style={{
                  background: "rgba(219, 71, 80, 0.08)",
                  border: "1px solid rgba(219, 71, 80, 0.2)",
                }}
              >
                <Icon className="w-5 h-5" style={{ color: "#C0392B" }} />
              </div>
              <h3
                className="font-[family-name:var(--font-brave-display)] font-medium text-xl mt-2"
                style={cardTitleStyle}
              >
                {title}
              </h3>
              <p
                className="font-[family-name:var(--font-brave-ui)] text-sm"
                style={{ ...cardBodyStyle, lineHeight: 1.6 }}
              >
                {body}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function HowItWorks() {
  return (
    <section
      id="how-it-works"
      className="relative bg-[#F4F1EC] py-16 lg:py-24 border-t border-[#e5e5e5] scroll-mt-20 overflow-hidden"
    >
      <div className="relative max-w-7xl mx-auto px-6 lg:px-10">
        <div className="mb-12 max-w-2xl">
          <SectionLabel>How it works</SectionLabel>
          <h2
            className="font-[family-name:var(--font-brave-display)] font-bold tracking-tight"
            style={sectionHeading}
          >
            Three steps from idea to income.
          </h2>
        </div>

        <div className="grid md:grid-cols-3 gap-5">
          {STEPS.map((s) => (
            <div
              key={s.n}
              className={cardClass}
              style={{ boxShadow: cardShadow }}
            >
              <p
                className="font-[family-name:var(--font-brave-display)] font-extrabold text-3xl"
                style={{ color: "rgba(219, 71, 80, 0.4)" }}
              >
                {s.n}
              </p>
              <h3
                className="font-[family-name:var(--font-brave-display)] font-medium text-2xl"
                style={cardTitleStyle}
              >
                {s.title}
              </h3>
              <p
                className="font-[family-name:var(--font-brave-ui)] text-sm"
                style={{ ...cardBodyStyle, lineHeight: 1.6 }}
              >
                {s.body}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function DemoDay() {
  const stats = [
    { value: "₹2L", label: "Revenue ticket per qualifying team" },
    { value: "10", label: "Investors on the Demo Day panel" },
    { value: "₹5 Cr", label: "Funding pool available to top teams" },
  ];

  return (
    <section className="relative bg-[#F4F1EC] py-16 lg:py-24 border-t border-[#e5e5e5] overflow-hidden">
      <div className="relative max-w-7xl mx-auto px-6 lg:px-10">
        <div className="mb-12 max-w-3xl">
          <SectionLabel>Demo Day</SectionLabel>
          <h2
            className="font-[family-name:var(--font-brave-display)] font-bold tracking-tight mb-4"
            style={sectionHeading}
          >
            Pitch real revenue to real investors.
          </h2>
          <p
            className="font-[family-name:var(--font-brave-ui)] text-lg"
            style={{ color: "#5b5b5b", lineHeight: 1.65 }}
          >
            Top teams qualify for the national Demo Day finale — and then move
            into GRIT, NIAT's long-form mentorship and capital track.
          </p>
        </div>

        <div className="grid sm:grid-cols-3 gap-5">
          {stats.map((s) => (
            <div
              key={s.label}
              className={cardClass}
              style={{ boxShadow: cardShadow }}
            >
              <p
                className="font-[family-name:var(--font-brave-display)] font-extrabold text-4xl mb-1"
                style={{ color: "#1f1f1f" }}
              >
                {s.value}
              </p>
              <p
                className="font-[family-name:var(--font-brave-ui)] text-sm"
                style={{ ...cardBodyStyle, lineHeight: 1.55 }}
              >
                {s.label}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function FAQ() {
  return (
    <section
      id="faq"
      className="bg-[#F4F1EC] py-16 lg:py-24 border-t border-[#e5e5e5] scroll-mt-20"
    >
      <div className="max-w-3xl mx-auto px-6 lg:px-10">
        <div className="mb-10">
          <SectionLabel>FAQ</SectionLabel>
          <h2
            className="font-[family-name:var(--font-brave-display)] font-bold tracking-tight"
            style={sectionHeading}
          >
            Quick answers.
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
              <AccordionTrigger className="text-left hover:no-underline py-5 font-[family-name:var(--font-brave-ui)] font-semibold text-[17px] text-[#0a0a0a]">
                {f.q}
              </AccordionTrigger>
              <AccordionContent
                className="font-[family-name:var(--font-brave-ui)] text-base pb-5"
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

function Footer() {
  return (
    <footer className="py-10 px-6" style={{ background: "#111111" }}>
      <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
        <div className="flex flex-col gap-2">
          <BraveWordmark />
          <p className="text-white/70 text-xs font-[family-name:var(--font-brave-ui)] font-light uppercase tracking-[0.2em]">
            Boosting real revenue for India's SMEs.
          </p>
        </div>
        <p className="text-white/60 text-xs font-[family-name:var(--font-brave-ui)] uppercase tracking-[0.2em]">
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
  return (
    <div
      className="min-h-screen font-[family-name:var(--font-brave-ui)]"
      style={{ background: "#F4F1EC", color: "#1f1f1f" }}
    >
      <Ticker />
      <TopNav />
      <main>
        <Hero />
        <CaseStudies />
        <WhatIsBrave />
        <HowItWorks />
        <DemoDay />
        <FAQ />
      </main>
      <Footer />
    </div>
  );
}
