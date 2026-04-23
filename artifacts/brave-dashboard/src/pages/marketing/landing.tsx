import { useEffect, useState } from "react";
import { Link } from "wouter";
import {
  ArrowRight,
  TrendingUp,
  Users,
  Target,
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
    sme: "Sample SME · Hyderabad",
    outcome: "+₹1.8L revenue in 6 weeks",
    summary:
      "A neighbourhood bakery doubled online orders after a student team built them a WhatsApp ordering flow.",
  },
  {
    sme: "Sample SME · Bengaluru",
    outcome: "+₹2.4L revenue in 8 weeks",
    summary:
      "A boutique fitness studio filled empty slots using an AI-assisted retention and reminder system.",
  },
  {
    sme: "Sample SME · Pune",
    outcome: "+₹3.1L revenue in 10 weeks",
    summary:
      "A regional D2C brand cleared dead inventory with an AI-generated campaign and storefront refresh.",
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

function Logo() {
  return (
    <Link href="/" data-testid="link-home" className="flex items-center gap-3">
      <div className="w-9 h-9 rounded-lg bg-[hsl(0_75%_45%)] flex items-center justify-center shadow-lg shadow-black/40">
        <span className="text-[hsl(45_95%_60%)] font-black text-sm">N</span>
      </div>
      <div className="leading-none">
        <p className="text-[hsl(45_80%_96%)] font-bold text-sm">NIAT India</p>
        <p className="text-[hsl(45_95%_60%)] text-[10px] font-bold tracking-[0.18em] uppercase mt-0.5">
          BRAVE
        </p>
      </div>
    </Link>
  );
}

function TopNav() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={`sticky top-0 z-50 transition-all duration-200 ${
        scrolled
          ? "bg-[hsl(0_65%_12%)]/90 backdrop-blur border-b border-[hsl(0_50%_30%)]/60"
          : "bg-transparent"
      }`}
    >
      <div className="max-w-7xl mx-auto px-6 lg:px-10 h-16 flex items-center justify-between">
        <Logo />
        <nav className="hidden md:flex items-center gap-1">
          {NAV_LINKS.map((l) => (
            <a
              key={l.href}
              href={l.href}
              data-testid={`nav-${l.href.slice(1)}`}
              className="px-3 py-2 rounded-md text-sm font-medium text-[hsl(45_70%_92%)]/80 hover:text-[hsl(45_95%_60%)] hover-elevate"
            >
              {l.label}
            </a>
          ))}
        </nav>
        <div className="flex items-center gap-2">
          <a
            href="#case-studies"
            data-testid="nav-case-studies-cta"
            className="hidden sm:inline-flex items-center px-4 py-2 rounded-lg text-sm font-semibold text-[hsl(45_80%_96%)] border border-[hsl(45_95%_60%)]/30 hover-elevate"
          >
            Case Studies
          </a>
          <Link
            href="/login"
            data-testid="nav-login"
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold bg-[hsl(0_75%_45%)] text-[hsl(45_60%_98%)] shadow-lg shadow-[hsl(0_75%_45%)]/30 hover-elevate"
          >
            Login
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </div>
    </header>
  );
}

function Hero() {
  return (
    <section className="relative overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-br from-[hsl(0_65%_14%)] via-[hsl(0_70%_18%)] to-[hsl(0_70%_12%)]" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_70%_50%_at_60%_30%,rgba(245,180,40,0.12),transparent)]" />
      <div
        className="absolute inset-0 opacity-[0.05]"
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,230,170,1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,230,170,1) 1px, transparent 1px)",
          backgroundSize: "60px 60px",
        }}
      />
      <div className="absolute -top-20 left-1/4 w-96 h-96 rounded-full bg-[hsl(0_85%_45%)]/15 blur-3xl" />
      <div className="absolute bottom-0 right-1/4 w-[28rem] h-[28rem] rounded-full bg-[hsl(45_95%_55%)]/10 blur-3xl" />

      <div className="relative max-w-7xl mx-auto px-6 lg:px-10 pt-16 pb-24 lg:pt-24 lg:pb-32">
        <div className="max-w-3xl">
          <div className="inline-flex items-center gap-2 bg-[hsl(0_70%_18%)]/80 border border-[hsl(0_60%_38%)]/50 rounded-full px-4 py-1.5 mb-7">
            <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
            <span className="text-[hsl(45_90%_75%)] text-xs font-semibold tracking-wider uppercase">
              Cohort opens April 15, 2026
            </span>
          </div>
          <h1 className="text-5xl md:text-6xl lg:text-7xl font-black text-[hsl(45_80%_96%)] leading-[1.05] mb-6">
            Boost real revenue for{" "}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-[hsl(0_85%_60%)] to-[hsl(45_95%_60%)]">
              India's SMEs.
            </span>
          </h1>
          <p className="text-lg md:text-xl text-[hsl(45_60%_92%)]/70 leading-relaxed mb-10 max-w-2xl">
            BRAVE is a NIAT program where students partner with small and medium
            businesses to boost their revenue and help them become ready for the
            AI era.
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <Link
              href="/login"
              data-testid="hero-login"
              className="inline-flex items-center gap-2 px-6 py-3 rounded-xl text-base font-semibold bg-[hsl(0_75%_45%)] text-[hsl(45_60%_98%)] shadow-xl shadow-[hsl(0_75%_45%)]/30 hover-elevate"
            >
              Login
              <ArrowRight className="w-4 h-4" />
            </Link>
            <a
              href="#case-studies"
              data-testid="hero-case-studies"
              className="inline-flex items-center gap-2 px-6 py-3 rounded-xl text-base font-semibold text-[hsl(45_80%_96%)] border border-[hsl(45_95%_60%)]/30 hover-elevate"
            >
              See Case Studies
              <ChevronRight className="w-4 h-4" />
            </a>
          </div>

          <div className="mt-10 inline-flex items-center gap-2 text-sm text-[hsl(45_70%_92%)]/65">
            <Calendar className="w-4 h-4 text-[hsl(45_95%_60%)]" />
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
      className="relative py-20 lg:py-28 bg-[hsl(0_30%_8%)] border-t border-[hsl(0_50%_30%)]/40 scroll-mt-20"
    >
      <div className="max-w-7xl mx-auto px-6 lg:px-10">
        <div className="flex items-end justify-between flex-wrap gap-4 mb-12">
          <div className="max-w-2xl">
            <p className="text-[hsl(45_95%_60%)] text-xs font-bold tracking-[0.2em] uppercase mb-3">
              Case Studies
            </p>
            <h2 className="text-3xl md:text-4xl font-black text-[hsl(45_80%_96%)] mb-3">
              Real SMEs. Real revenue. Real students.
            </h2>
            <p className="text-[hsl(45_60%_92%)]/65">
              The cards below are illustrative placeholders. Real BRAVE 2026
              cohort stories will land here once Demo Day wraps.
            </p>
          </div>
        </div>

        <div className="grid md:grid-cols-3 gap-5">
          {CASE_STUDIES.map((c, i) => (
            <article
              key={i}
              data-testid={`case-study-${i}`}
              className="group relative rounded-2xl bg-[hsl(0_30%_12%)] border border-[hsl(0_25%_22%)] p-6 hover-elevate"
            >
              <div className="flex items-center justify-between mb-5">
                <div className="w-12 h-12 rounded-xl bg-[hsl(0_60%_28%)]/60 border border-[hsl(45_70%_50%)]/20 flex items-center justify-center text-[hsl(45_95%_60%)] font-black">
                  SME
                </div>
                <span className="text-[10px] font-bold tracking-widest uppercase text-[hsl(45_60%_88%)]/40">
                  Placeholder
                </span>
              </div>
              <h3 className="text-[hsl(45_80%_96%)] font-bold text-base mb-1">
                {c.sme}
              </h3>
              <p className="text-[hsl(45_95%_60%)] font-bold text-lg mb-3">
                {c.outcome}
              </p>
              <p className="text-[hsl(45_60%_92%)]/65 text-sm leading-relaxed mb-5">
                {c.summary}
              </p>
              <a
                href="#case-studies"
                aria-disabled="true"
                data-testid={`case-study-${i}-link`}
                className="inline-flex items-center gap-1 text-sm font-semibold text-[hsl(45_95%_60%)] hover:text-[hsl(45_95%_70%)]"
              >
                Read story
                <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
              </a>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

function WhatIsBrave() {
  return (
    <section className="relative py-20 lg:py-28 bg-[hsl(0_70%_12%)] border-t border-[hsl(0_50%_30%)]/40">
      <div className="max-w-7xl mx-auto px-6 lg:px-10">
        <div className="max-w-3xl mb-14">
          <p className="text-[hsl(45_95%_60%)] text-xs font-bold tracking-[0.2em] uppercase mb-3">
            What is BRAVE
          </p>
          <h2 className="text-3xl md:text-4xl font-black text-[hsl(45_80%_96%)] mb-4">
            A program designed to boost revenues for SMEs.
          </h2>
          <p className="text-[hsl(45_60%_92%)]/70 text-lg leading-relaxed">
            BRAVE pairs NIAT students with real small and medium businesses.
            Teams build with AI, ship work that earns money for the SME, and
            log verified revenue — all the way to a national Demo Day.
          </p>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {VALUE_PILLARS.map(({ icon: Icon, title, body }) => (
            <div
              key={title}
              className="rounded-2xl bg-[hsl(0_65%_16%)] border border-[hsl(0_50%_30%)]/50 p-6 hover-elevate"
            >
              <div className="w-10 h-10 rounded-lg bg-[hsl(0_75%_45%)]/30 border border-[hsl(45_95%_60%)]/20 flex items-center justify-center mb-4">
                <Icon className="w-5 h-5 text-[hsl(45_95%_60%)]" />
              </div>
              <h3 className="text-[hsl(45_80%_96%)] font-bold mb-2">{title}</h3>
              <p className="text-[hsl(45_60%_92%)]/65 text-sm leading-relaxed">
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
      className="relative py-20 lg:py-28 bg-[hsl(0_30%_8%)] border-t border-[hsl(0_50%_30%)]/40 scroll-mt-20"
    >
      <div className="max-w-7xl mx-auto px-6 lg:px-10">
        <div className="max-w-2xl mb-12">
          <p className="text-[hsl(45_95%_60%)] text-xs font-bold tracking-[0.2em] uppercase mb-3">
            How it works
          </p>
          <h2 className="text-3xl md:text-4xl font-black text-[hsl(45_80%_96%)]">
            Three steps from idea to income.
          </h2>
        </div>

        <div className="grid md:grid-cols-3 gap-5">
          {STEPS.map((s) => (
            <div
              key={s.n}
              className="relative rounded-2xl bg-[hsl(0_30%_12%)] border border-[hsl(0_25%_22%)] p-7 hover-elevate"
            >
              <p className="text-[hsl(45_95%_60%)]/40 font-black text-3xl mb-4">
                {s.n}
              </p>
              <h3 className="text-[hsl(45_80%_96%)] font-bold text-xl mb-2">
                {s.title}
              </h3>
              <p className="text-[hsl(45_60%_92%)]/70 text-sm leading-relaxed">
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
    <section className="relative py-20 lg:py-28 bg-[hsl(0_70%_12%)] border-t border-[hsl(0_50%_30%)]/40 overflow-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_60%_50%_at_50%_50%,rgba(245,180,40,0.08),transparent)]" />
      <div className="relative max-w-7xl mx-auto px-6 lg:px-10">
        <div className="max-w-3xl mb-12">
          <p className="text-[hsl(45_95%_60%)] text-xs font-bold tracking-[0.2em] uppercase mb-3">
            Demo Day
          </p>
          <h2 className="text-3xl md:text-4xl font-black text-[hsl(45_80%_96%)] mb-4">
            Pitch real revenue to real investors.
          </h2>
          <p className="text-[hsl(45_60%_92%)]/70 text-lg leading-relaxed">
            Top teams qualify for the national Demo Day finale — and then move
            into GRIT, NIAT's long-form mentorship and capital track.
          </p>
        </div>

        <div className="grid sm:grid-cols-3 gap-5">
          {stats.map((s) => (
            <div
              key={s.label}
              className="rounded-2xl bg-[hsl(0_65%_16%)] border border-[hsl(0_50%_30%)]/50 p-6"
            >
              <p className="text-4xl font-black text-transparent bg-clip-text bg-gradient-to-r from-[hsl(0_85%_60%)] to-[hsl(45_95%_60%)] mb-2">
                {s.value}
              </p>
              <p className="text-[hsl(45_60%_92%)]/65 text-sm">{s.label}</p>
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
      className="relative py-20 lg:py-28 bg-[hsl(0_30%_8%)] border-t border-[hsl(0_50%_30%)]/40 scroll-mt-20"
    >
      <div className="max-w-3xl mx-auto px-6 lg:px-10">
        <div className="mb-10">
          <p className="text-[hsl(45_95%_60%)] text-xs font-bold tracking-[0.2em] uppercase mb-3">
            FAQ
          </p>
          <h2 className="text-3xl md:text-4xl font-black text-[hsl(45_80%_96%)]">
            Quick answers.
          </h2>
        </div>

        <Accordion
          type="single"
          collapsible
          className="rounded-2xl border border-[hsl(0_25%_22%)] bg-[hsl(0_30%_12%)] divide-y divide-[hsl(0_25%_22%)] overflow-hidden"
        >
          {FAQS.map((f, i) => (
            <AccordionItem
              key={i}
              value={`item-${i}`}
              className="border-0 px-5"
              data-testid={`faq-${i}`}
            >
              <AccordionTrigger className="text-left text-[hsl(45_80%_96%)] hover:no-underline py-5">
                {f.q}
              </AccordionTrigger>
              <AccordionContent className="text-[hsl(45_60%_92%)]/70 leading-relaxed pb-5">
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
    <footer className="bg-[hsl(0_40%_8%)] border-t border-[hsl(0_50%_30%)]/40 py-10">
      <div className="max-w-7xl mx-auto px-6 lg:px-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-[hsl(0_75%_45%)] flex items-center justify-center">
            <span className="text-[hsl(45_95%_60%)] font-black text-sm">N</span>
          </div>
          <div className="leading-none">
            <p className="text-[hsl(45_80%_96%)] font-bold text-sm">
              NIAT India · BRAVE
            </p>
            <p className="text-[hsl(45_60%_88%)]/55 text-xs mt-1">
              Boosting real revenue for India's SMEs.
            </p>
          </div>
        </div>
        <p className="text-[hsl(45_60%_88%)]/40 text-xs">
          © {new Date().getFullYear()} NIAT India. All rights reserved.
        </p>
      </div>
    </footer>
  );
}

export default function Landing() {
  return (
    <div className="min-h-screen bg-[hsl(0_65%_14%)] text-[hsl(45_80%_96%)]">
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
