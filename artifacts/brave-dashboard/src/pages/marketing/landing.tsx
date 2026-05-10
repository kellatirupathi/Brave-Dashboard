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
  ExternalLink,
  BookOpen,
} from "lucide-react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { BraveLogo } from "@/components/brave-logo";
import { useAuth } from "@workspace/replit-auth-web";

type Resource = {
  id: number;
  title: string;
  description: string;
  docUrl: string;
};

/* ====================================================================
   ORIGINAL CONTENT — preserved as-is
   ==================================================================== */

const NAV_LINKS = [
  { label: "Case Studies", href: "#case-studies" },
  { label: "How it works", href: "#how-it-works" },
  { label: "Resources", href: "#resources" },
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

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 mb-4">
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

const cardClass =
  "group/card relative rounded-2xl bg-white border border-black/[0.06] p-7 flex flex-col gap-3 transition-all duration-300 hover:-translate-y-1 hover:border-[#C0392B]/25 hover:shadow-[0_20px_50px_-20px_rgba(192,57,43,0.25)]";
const cardShadow =
  "0 4px 20px -8px rgba(17,17,17,0.06), 0 0 24px rgba(255, 244, 219, 0.4)";

const sectionHeading: React.CSSProperties = {
  fontSize: "clamp(28px, 4.5vw, 44px)",
  lineHeight: 1.05,
  color: "#1f1f1f",
  letterSpacing: "-0.04em",
};

const cardTitleStyle: React.CSSProperties = {
  color: "#050a00",
  letterSpacing: "-0.5px",
  lineHeight: 1.4,
};

const cardBodyStyle: React.CSSProperties = {
  color: "#6b6b6b",
  lineHeight: 1.6,
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
        className={`flex items-center justify-between gap-6 px-5 py-2.5 rounded-2xl bg-white/85 backdrop-blur-xl border transition-all duration-300 w-full max-w-2xl ${
          scrolled
            ? "shadow-[0_12px_40px_-12px_rgba(17,17,17,0.18)] border-black/[0.08]"
            : "shadow-[0_4px_16px_-6px_rgba(17,17,17,0.08)] border-black/[0.04]"
        }`}
      >
        <Link href="/" data-testid="link-home" className="shrink-0">
          <BraveLogo className="text-[26px]" />
        </Link>
        <nav className="hidden md:flex items-center gap-1">
          {NAV_LINKS.map((l) => (
            <a
              key={l.href}
              href={l.href}
              data-testid={`nav-${l.href.slice(1)}`}
              className="px-3 py-2 rounded-md text-sm font-[family-name:var(--font-body)] font-medium text-[#5b5b5b] hover:text-[#C0392B] transition-colors"
            >
              {l.label}
            </a>
          ))}
        </nav>
        <Link
          href="/login"
          data-testid="nav-login"
          className="group inline-flex items-center gap-1.5 justify-center px-5 h-10 rounded-xl bg-[#111] text-white text-sm font-[family-name:var(--font-body)] font-semibold transition-all duration-200 hover:bg-[#000] hover:-translate-y-0.5 hover:shadow-[0_8px_20px_-6px_rgba(0,0,0,0.4)] shrink-0"
          style={{
            boxShadow:
              "0 4px 12px -4px rgba(0,0,0,0.2), inset 0 1px 0 rgba(255,255,255,0.08)",
          }}
        >
          Login
          <ArrowRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-0.5" />
        </Link>
      </div>
    </header>
  );
}

function Hero() {
  return (
    <section
      className="relative overflow-hidden"
      style={{
        background:
          "radial-gradient(ellipse 90% 70% at 50% 0%, #fff 0%, #f4f1ec 55%, #ebe6dd 100%)",
      }}
    >
      {/* Dotted grid texture */}
      <div
        className="absolute inset-0 opacity-[0.35] pointer-events-none"
        style={{
          backgroundImage:
            "radial-gradient(circle, rgba(17,17,17,0.18) 1px, transparent 1px)",
          backgroundSize: "22px 22px",
          maskImage:
            "radial-gradient(ellipse 70% 60% at 50% 40%, black 30%, transparent 80%)",
          WebkitMaskImage:
            "radial-gradient(ellipse 70% 60% at 50% 40%, black 30%, transparent 80%)",
        }}
      />
      {/* Brand red accent blob */}
      <div
        className="absolute top-[10%] right-[-8%] w-[620px] h-[340px] rounded-full opacity-25 blur-[110px] pointer-events-none"
        style={{ background: "#C0392B" }}
      />
      {/* Amber spark blob */}
      <div
        className="absolute bottom-[-10%] left-[8%] w-[480px] h-[300px] rounded-full opacity-20 blur-[110px] pointer-events-none"
        style={{ background: "#EF9F27" }}
      />

      <div className="relative max-w-6xl mx-auto px-6 lg:px-10 pt-16 pb-28 lg:pt-24 lg:pb-36">
        <div className="max-w-3xl mx-auto text-center">
          <div
            className="inline-flex items-center gap-2 bg-white/80 backdrop-blur-md border rounded-full px-4 py-1.5 mb-8 shadow-[0_4px_20px_-8px_rgba(192,57,43,0.15)]"
            style={{ borderColor: "rgba(192,57,43,0.18)" }}
          >
            <span className="relative flex w-2 h-2">
              <span className="absolute inset-0 rounded-full bg-green-500 animate-ping opacity-75" />
              <span className="relative w-2 h-2 rounded-full bg-green-500" />
            </span>
            <span
              className="text-xs font-[family-name:var(--font-body)] font-bold tracking-[0.1em] uppercase"
              style={{ color: "#3d3d3d" }}
            >
              Cohort opens April 15, 2026
            </span>
          </div>

          <h1
            className="font-[family-name:var(--font-display)] font-extrabold tracking-tight mb-7"
            style={{
              ...sectionHeading,
              fontSize: "clamp(44px, 7.5vw, 80px)",
              lineHeight: 1.02,
              letterSpacing: "-0.045em",
            }}
          >
            Boost revenue for{" "}
            <span
              className="relative inline-block"
              style={{ color: "#C0392B" }}
            >
              India's SMEs.
              <span
                aria-hidden
                className="absolute left-0 right-0 -bottom-1 h-[6px] rounded-full opacity-60"
                style={{
                  background:
                    "linear-gradient(90deg, transparent 0%, #EF9F27 50%, transparent 100%)",
                }}
              />
            </span>
          </h1>

          <p
            className="font-[family-name:var(--font-body)] text-base md:text-lg leading-relaxed mb-10 max-w-2xl mx-auto"
            style={{ color: "#4a4a4a", lineHeight: 1.7 }}
          >
            BRAVE is a NIAT program where students partner with small and medium
            businesses to boost their revenue and help them become ready for the
            AI era.
          </p>

          <div className="flex flex-wrap items-center justify-center gap-3">
            <Link
              href="/login"
              data-testid="hero-login"
              className="group inline-flex items-center gap-2 px-7 py-4 rounded-xl text-base font-[family-name:var(--font-body)] font-semibold bg-[#111111] text-white transition-all duration-200 hover:bg-[#000] hover:-translate-y-0.5 hover:shadow-[0_12px_30px_-10px_rgba(0,0,0,0.4)]"
              style={{
                boxShadow:
                  "0 8px 24px -8px rgba(0,0,0,0.25), inset 0 1px 0 rgba(255,255,255,0.08)",
              }}
            >
              Login
              <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
            </Link>
            <a
              href="#case-studies"
              data-testid="hero-case-studies"
              className="group inline-flex items-center gap-2 px-7 py-4 rounded-xl text-base font-[family-name:var(--font-body)] font-semibold bg-white text-[#1f1f1f] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_12px_30px_-10px_rgba(0,0,0,0.12)]"
              style={{
                border: "1px solid rgba(17,17,17,0.1)",
                boxShadow: "0 2px 8px -2px rgba(0,0,0,0.04)",
              }}
            >
              See Case Studies
              <ChevronRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
            </a>
          </div>

          <div
            className="mt-10 inline-flex items-center gap-2 text-sm font-[family-name:var(--font-body)]"
            style={{ color: "#5b5b5b" }}
          >
            <Calendar
              className="w-4 h-4"
              style={{ color: "var(--color-brave-accent)" }}
            />
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
      className="relative bg-[#fcfaf8] py-20 lg:py-28 border-t border-[#e5e5e5] scroll-mt-20 overflow-hidden"
    >
      <div
        className="absolute top-0 right-[-5%] w-[400px] h-[400px] rounded-full opacity-[0.08] blur-[100px] pointer-events-none"
        style={{ background: "#C0392B" }}
      />
      <div className="relative max-w-7xl mx-auto px-6 lg:px-10">
        <div className="mb-14 lg:mb-16 max-w-2xl">
          <SectionLabel>Case Studies</SectionLabel>
          <h2
            className="font-[family-name:var(--font-display)] font-bold tracking-tight mb-4"
            style={sectionHeading}
          >
            Real SMEs. Real revenue. Real students.
          </h2>
          <p
            className="font-[family-name:var(--font-body)] text-base md:text-lg"
            style={{ color: "#5b5b5b", lineHeight: 1.65 }}
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
                  className="inline-flex items-center rounded-full px-2.5 py-1 text-[10px] font-[family-name:var(--font-body)] font-bold tracking-widest uppercase"
                  style={{
                    background: "rgba(219, 71, 80, 0.08)",
                    border: "1px solid rgba(219, 71, 80, 0.25)",
                    color: "var(--color-brave-accent)",
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
                    className="font-[family-name:var(--font-display)] font-bold text-xl leading-none mt-0.5"
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
                className="font-[family-name:var(--font-display)] font-medium text-lg"
                style={cardTitleStyle}
              >
                {c.team}
              </h3>
              <p
                className="font-[family-name:var(--font-body)] text-sm"
                style={{ color: "#6b6b6b", lineHeight: 1.5 }}
              >
                {c.sector}
              </p>
              <p
                className="font-[family-name:var(--font-body)] text-xs font-semibold mt-2"
                style={{ color: "#5b5b5b" }}
              >
                Approval + Advance Payment
              </p>
              {c.revenue && (
                <p
                  className="font-[family-name:var(--font-display)] font-bold text-base"
                  style={{ color: "var(--color-brave-accent)" }}
                >
                  Revenue earned: {c.revenue}
                </p>
              )}
              <ul className="mt-auto flex flex-wrap gap-1.5 pt-2">
                {c.highlights.map((h) => (
                  <li
                    key={h}
                    className="rounded-full px-2.5 py-1 text-[11px] font-[family-name:var(--font-body)] font-medium"
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
    <section className="relative bg-white py-20 lg:py-28 border-t border-[#e5e5e5] overflow-hidden">
      <div className="relative max-w-7xl mx-auto px-6 lg:px-10">
        <div className="mb-14 max-w-3xl">
          <SectionLabel>What is BRAVE</SectionLabel>
          <h2
            className="font-[family-name:var(--font-display)] font-bold tracking-tight mb-4"
            style={sectionHeading}
          >
            A program designed to boost revenues for SMEs.
          </h2>
          <p
            className="font-[family-name:var(--font-body)] text-lg"
            style={{ color: "#5b5b5b", lineHeight: 1.7 }}
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
                className="w-12 h-12 rounded-xl flex items-center justify-center transition-transform duration-300 group-hover/card:scale-110 group-hover/card:rotate-3"
                style={{
                  background:
                    "linear-gradient(135deg, rgba(192,57,43,0.1) 0%, rgba(239,159,39,0.08) 100%)",
                  border: "1px solid rgba(192,57,43,0.18)",
                }}
              >
                <Icon className="w-5 h-5" style={{ color: "#C0392B" }} />
              </div>
              <h3
                className="font-[family-name:var(--font-display)] font-semibold text-xl mt-3"
                style={cardTitleStyle}
              >
                {title}
              </h3>
              <p
                className="font-[family-name:var(--font-body)] text-sm"
                style={{ ...cardBodyStyle, lineHeight: 1.65 }}
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
      className="relative bg-[#fcfaf8] py-20 lg:py-28 border-t border-[#e5e5e5] scroll-mt-20 overflow-hidden"
    >
      <div
        className="absolute top-1/3 right-[-10%] w-[600px] h-[300px] rounded-full opacity-15 blur-[120px] pointer-events-none"
        style={{ background: "#C0392B" }}
      />
      <div
        className="absolute bottom-[10%] left-[-5%] w-[400px] h-[280px] rounded-full opacity-10 blur-[100px] pointer-events-none"
        style={{ background: "#EF9F27" }}
      />

      <div className="relative max-w-7xl mx-auto px-6 lg:px-10">
        <div className="mb-14 max-w-2xl">
          <SectionLabel>How it works</SectionLabel>
          <h2
            className="font-[family-name:var(--font-display)] font-bold tracking-tight"
            style={sectionHeading}
          >
            Three steps from idea to income.
          </h2>
        </div>

        <div className="grid md:grid-cols-3 gap-5">
          {STEPS.map((s, idx) => (
            <div
              key={s.n}
              className={cardClass}
              style={{ boxShadow: cardShadow }}
            >
              <div className="flex items-center justify-between mb-1">
                <p
                  className="font-[family-name:var(--font-display)] font-extrabold text-4xl leading-none"
                  style={{
                    background:
                      "linear-gradient(135deg, #C0392B 0%, #EF9F27 100%)",
                    WebkitBackgroundClip: "text",
                    WebkitTextFillColor: "transparent",
                    backgroundClip: "text",
                  }}
                >
                  {s.n}
                </p>
                {idx < STEPS.length - 1 && (
                  <ArrowRight
                    className="w-5 h-5 hidden md:block opacity-30"
                    style={{ color: "#C0392B" }}
                  />
                )}
              </div>
              <h3
                className="font-[family-name:var(--font-display)] font-semibold text-2xl"
                style={cardTitleStyle}
              >
                {s.title}
              </h3>
              <p
                className="font-[family-name:var(--font-body)] text-sm"
                style={{ ...cardBodyStyle, lineHeight: 1.65 }}
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
    <section className="relative bg-white py-20 lg:py-28 border-t border-[#e5e5e5] overflow-hidden">
      <div
        className="absolute top-1/3 left-1/4 w-[600px] h-[389px] rounded-full opacity-15 blur-[120px] pointer-events-none"
        style={{ background: "#C0392B" }}
      />
      <div
        className="absolute bottom-0 right-[5%] w-[400px] h-[300px] rounded-full opacity-15 blur-[110px] pointer-events-none"
        style={{ background: "#EF9F27" }}
      />
      <div className="relative max-w-7xl mx-auto px-6 lg:px-10">
        <div className="mb-14 max-w-3xl">
          <SectionLabel>Demo Day</SectionLabel>
          <h2
            className="font-[family-name:var(--font-display)] font-bold tracking-tight mb-4"
            style={sectionHeading}
          >
            Pitch real revenue to real investors.
          </h2>
          <p
            className="font-[family-name:var(--font-body)] text-lg"
            style={{ color: "#5b5b5b", lineHeight: 1.7 }}
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
                className="font-[family-name:var(--font-display)] font-extrabold text-5xl mb-2 leading-none"
                style={{
                  background:
                    "linear-gradient(135deg, #111111 0%, #C0392B 100%)",
                  WebkitBackgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                  backgroundClip: "text",
                  letterSpacing: "-0.03em",
                }}
              >
                {s.value}
              </p>
              <p
                className="font-[family-name:var(--font-body)] text-sm"
                style={{ ...cardBodyStyle, lineHeight: 1.6 }}
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

  // Logged-in users go straight to their dashboard's resources page;
  // logged-out users get sent to login first.
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

  return (
    <section
      id="resources"
      className="relative bg-[#fcfaf8] py-20 lg:py-28 border-t border-[#e5e5e5] scroll-mt-20 overflow-hidden"
    >
      <div
        className="absolute top-1/4 right-[-8%] w-[500px] h-[300px] rounded-full opacity-[0.1] blur-[110px] pointer-events-none"
        style={{ background: "#C0392B" }}
      />
      <div className="relative max-w-5xl mx-auto px-6 lg:px-10">
        <div className="mb-12 max-w-3xl">
          <SectionLabel>Resources</SectionLabel>
          <h2
            className="font-[family-name:var(--font-display)] font-bold tracking-tight mb-4"
            style={sectionHeading}
          >
            Projects & solutions to learn from.
          </h2>
          <p
            className="font-[family-name:var(--font-body)] text-base md:text-lg"
            style={{ color: "#5b5b5b", lineHeight: 1.7 }}
          >
            Curated step-by-step playbooks, project breakdowns, and reference
            builds — open any one to see the full plan.
          </p>
        </div>

        {loading ? (
          <div
            className="rounded-2xl bg-white border border-black/[0.06] p-8 text-center"
            style={{ color: "#9b9b9b" }}
          >
            Loading resources…
          </div>
        ) : preview.length === 0 ? (
          <div
            className="rounded-2xl bg-white border border-black/[0.06] p-8 text-center font-[family-name:var(--font-body)]"
            style={{ color: "#6b6b6b" }}
          >
            <BookOpen
              className="w-8 h-8 mx-auto mb-3"
              style={{ color: "#C0392B", opacity: 0.5 }}
            />
            New resources coming soon.
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {preview.map((r) => {
              const isExpanded = expandedId === r.id;
              return (
                <article
                  key={r.id}
                  data-testid={`landing-resource-${r.id}`}
                  className="group/card relative rounded-2xl bg-white border border-black/[0.06] p-6 md:p-7 flex flex-col md:flex-row md:items-center gap-4 md:gap-6 transition-all duration-300 hover:-translate-y-0.5 hover:border-[#C0392B]/25 hover:shadow-[0_20px_50px_-20px_rgba(192,57,43,0.22)]"
                  style={{
                    boxShadow:
                      "0 4px 20px -8px rgba(17,17,17,0.06), 0 0 24px rgba(255, 244, 219, 0.4)",
                  }}
                >
                  <div className="flex-1 min-w-0">
                    <h3
                      className="font-[family-name:var(--font-display)] font-semibold text-lg md:text-xl mb-1.5"
                      style={cardTitleStyle}
                    >
                      {r.title}
                    </h3>
                    <p
                      className={`font-[family-name:var(--font-body)] text-sm ${
                        isExpanded ? "" : "line-clamp-2"
                      }`}
                      style={{ ...cardBodyStyle, lineHeight: 1.6 }}
                    >
                      {r.description}
                    </p>
                    {r.description.length > 120 && (
                      <button
                        type="button"
                        onClick={() => setExpandedId(isExpanded ? null : r.id)}
                        className="mt-1.5 text-xs font-semibold font-[family-name:var(--font-body)] hover:underline"
                        style={{ color: "#C0392B" }}
                      >
                        {isExpanded ? "Show less" : "Read more..."}
                      </button>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => handleOpen(r.docUrl)}
                    data-testid={`landing-resource-open-${r.id}`}
                    className="group/btn shrink-0 inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold font-[family-name:var(--font-body)] bg-[#111] text-white transition-all duration-200 hover:bg-[#000] hover:-translate-y-0.5 hover:shadow-[0_8px_20px_-6px_rgba(0,0,0,0.4)]"
                    style={{
                      boxShadow:
                        "0 4px 12px -4px rgba(0,0,0,0.2), inset 0 1px 0 rgba(255,255,255,0.08)",
                    }}
                  >
                    Open
                    <ExternalLink className="w-3.5 h-3.5 transition-transform group-hover/btn:translate-x-0.5" />
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
              className="group inline-flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-semibold font-[family-name:var(--font-body)] bg-white border border-black/[0.08] text-[#1f1f1f] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_12px_30px_-10px_rgba(0,0,0,0.12)] hover:border-[#C0392B]/30 hover:text-[#C0392B]"
            >
              See all resources
              <ChevronRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
            </Link>
          </div>
        )}
      </div>
    </section>
  );
}

function FAQ() {
  return (
    <section
      id="faq"
      className="bg-[#fcfaf8] py-20 lg:py-28 border-t border-[#e5e5e5] scroll-mt-20"
    >
      <div className="max-w-3xl mx-auto px-6 lg:px-10">
        <div className="mb-12 text-center">
          <SectionLabel>FAQ</SectionLabel>
          <h2
            className="font-[family-name:var(--font-display)] font-bold tracking-tight"
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
              className="rounded-2xl bg-white border border-black/[0.06] px-6 transition-all duration-300 hover:border-[#C0392B]/25 data-[state=open]:border-[#C0392B]/30 data-[state=open]:shadow-[0_12px_40px_-16px_rgba(192,57,43,0.2)]"
              data-testid={`faq-${i}`}
            >
              <AccordionTrigger className="text-left hover:no-underline py-5 font-[family-name:var(--font-body)] font-semibold text-[17px] text-[#0a0a0a] hover:text-[#C0392B] transition-colors">
                {f.q}
              </AccordionTrigger>
              <AccordionContent
                className="font-[family-name:var(--font-body)] text-base pb-5"
                style={{ color: "#5b5b5b", lineHeight: 1.75 }}
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
    <footer
      className="relative py-14 px-6 overflow-hidden"
      style={{ background: "var(--color-brave-footer)" }}
    >
      <div
        aria-hidden
        className="absolute top-0 left-0 right-0 h-px"
        style={{
          background:
            "linear-gradient(90deg, transparent 0%, rgba(192,57,43,0.6) 30%, rgba(239,159,39,0.6) 70%, transparent 100%)",
        }}
      />
      <div
        className="absolute bottom-[-30%] right-[-5%] w-[400px] h-[260px] rounded-full opacity-[0.12] blur-[100px] pointer-events-none"
        style={{ background: "#C0392B" }}
      />
      <div className="relative max-w-7xl mx-auto flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
        <div className="flex flex-col gap-2.5">
          <BraveLogo className="text-[26px]" />
          <p className="text-white/65 text-sm font-[family-name:var(--font-body)] font-light tracking-wide">
            Boosting real revenue for India's SMEs.
          </p>
        </div>
        <p className="text-white/50 text-xs font-[family-name:var(--font-body)] tracking-wide">
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
      className="min-h-screen font-[family-name:var(--font-body)]"
      style={{ background: "var(--color-brave-cream)", color: "#1f1f1f" }}
    >
      <Ticker />
      <TopNav />
      <main>
        <Hero />
        <CaseStudies />
        <WhatIsBrave />
        <HowItWorks />
        <DemoDay />
        <ResourcesSection />
        <FAQ />
      </main>
      <Footer />
    </div>
  );
}
