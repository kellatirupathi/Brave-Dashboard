import { useEffect, useMemo, useState, type ComponentType } from "react";
import {
  BookOpen,
  Search,
  Lightbulb,
  AlertTriangle,
  ShieldAlert,
  CheckCircle2,
  Quote,
  HelpCircle,
  Clock,
  ChevronLeft,
  ChevronRight,
  Rocket,
  Megaphone,
  Target,
  IndianRupee,
  FileText,
  Trophy,
  Activity,
  Sparkles,
  ShieldCheck,
  HeartHandshake,
  Scale,
  BookMarked,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { GUIDEBOOK_MODULES, type GbBlock, type GbModule } from "./content";

// ── Guidebook has its OWN visual identity (a light, editorial "book" look) ──
// deliberately different from the dashboard chrome: warm paper background,
// white surfaces, numbered chapters and coral accents. Colours are hard-coded
// (not theme tokens) so the book reads the same regardless of app light/dark.
const CORAL = "#db4750";
const CORAL_SOFT = "#fdecec";

// Chapter icon keys (set in content.ts) → lucide icons. Keeps content.ts free
// of React imports. Unknown keys fall back to the book icon.
const ICONS: Record<string, ComponentType<{ className?: string }>> = {
  rocket: Rocket,
  search: Search,
  pitch: Megaphone,
  target: Target,
  rupee: IndianRupee,
  brd: FileText,
  trophy: Trophy,
  track: Activity,
  spark: Sparkles,
  faq: HelpCircle,
  shield: ShieldCheck,
  rejection: HeartHandshake,
  conduct: Scale,
  reference: BookMarked,
};
const iconFor = (key: string): ComponentType<{ className?: string }> =>
  ICONS[key] ?? BookOpen;

// Chapter groups for the navigation — gives the guide a clear learning arc
// instead of one long flat list. Slugs not listed here fall under "More".
const GROUPS: { label: string; slugs: string[] }[] = [
  { label: "Get started", slugs: ["start-here"] },
  {
    label: "Win your first client",
    slugs: [
      "find-first-client",
      "field-visits-safety",
      "pitch",
      "handle-rejection",
    ],
  },
  {
    label: "Build, price & prove",
    slugs: ["what-to-build", "pricing", "brd-and-revenue"],
  },
  {
    label: "Grow & stay on track",
    slugs: ["leaderboard-demo-day", "teams-and-journals", "mindset-and-habits"],
  },
  {
    label: "Conduct & reference",
    slugs: ["conduct-integrity", "student-faq", "quick-reference-glossary"],
  },
];

// Flatten a block to plain text so search can match across everything.
function blockText(b: GbBlock): string {
  switch (b.kind) {
    case "p":
    case "h":
    case "tip":
    case "warn":
    case "danger":
      return b.text;
    case "list":
    case "steps":
    case "checklist":
      return b.items.join(" ");
    case "example":
      return `${b.title} ${b.text}`;
    case "table":
      return `${b.columns.join(" ")} ${b.rows.map((r) => r.join(" ")).join(" ")}`;
    case "faq":
      return b.items.map((i) => `${i.q} ${i.a}`).join(" ");
    default:
      return "";
  }
}

function moduleMatches(m: GbModule, q: string): boolean {
  if (!q) return true;
  if (m.title.toLowerCase().includes(q) || m.tagline.toLowerCase().includes(q))
    return true;
  return m.sections.some(
    (sec) =>
      sec.heading?.toLowerCase().includes(q) ||
      sec.blocks.some((b) => blockText(b).toLowerCase().includes(q)),
  );
}

function Callout({
  tone,
  icon: Icon,
  text,
}: {
  tone: "tip" | "warn" | "danger";
  icon: ComponentType<{ className?: string }>;
  text: string;
}) {
  const styles = {
    tip: {
      box: "border-emerald-200 bg-emerald-50",
      icon: "text-emerald-600",
      text: "text-emerald-900",
    },
    warn: {
      box: "border-amber-200 bg-amber-50",
      icon: "text-amber-600",
      text: "text-amber-900",
    },
    danger: {
      box: "border-red-200 bg-red-50",
      icon: "text-red-600",
      text: "text-red-900",
    },
  }[tone];
  return (
    <div className={cn("flex gap-2.5 rounded-lg border p-3.5", styles.box)}>
      <Icon className={cn("mt-0.5 h-4 w-4 shrink-0", styles.icon)} />
      <p className={cn("text-[15px] leading-relaxed", styles.text)}>{text}</p>
    </div>
  );
}

function Block({ block }: { block: GbBlock }) {
  switch (block.kind) {
    case "p":
      return (
        <p className="text-[15px] leading-7 text-stone-600">{block.text}</p>
      );
    case "h":
      return (
        <h4 className="text-[15px] font-semibold text-stone-900">
          {block.text}
        </h4>
      );
    case "list":
      return (
        <ul className="space-y-2">
          {block.items.map((it, i) => (
            <li key={i} className="flex gap-3 text-[15px] text-stone-600">
              <span
                className="mt-[9px] h-1.5 w-1.5 shrink-0 rounded-full"
                style={{ backgroundColor: CORAL }}
              />
              <span className="leading-7">{it}</span>
            </li>
          ))}
        </ul>
      );
    case "steps":
      return (
        <ol className="space-y-3">
          {block.items.map((it, i) => (
            <li key={i} className="flex gap-3.5 text-[15px] text-stone-600">
              <span
                className="grid h-6 w-6 shrink-0 place-items-center rounded-full text-xs font-bold text-white"
                style={{ backgroundColor: CORAL }}
              >
                {i + 1}
              </span>
              <span className="pt-0.5 leading-7">{it}</span>
            </li>
          ))}
        </ol>
      );
    case "tip":
      return <Callout tone="tip" icon={Lightbulb} text={block.text} />;
    case "warn":
      return <Callout tone="warn" icon={AlertTriangle} text={block.text} />;
    case "danger":
      return <Callout tone="danger" icon={ShieldAlert} text={block.text} />;
    case "example":
      return (
        <div className="rounded-xl border border-stone-200 bg-stone-50 p-4">
          <div className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-stone-700">
            <Quote className="h-3.5 w-3.5" style={{ color: CORAL }} />
            {block.title}
          </div>
          <p className="text-[15px] italic leading-7 text-stone-600">
            {block.text}
          </p>
        </div>
      );
    case "checklist":
      return (
        <ul className="space-y-2">
          {block.items.map((it, i) => (
            <li key={i} className="flex gap-3 text-[15px] text-stone-600">
              <CheckCircle2 className="mt-1 h-4 w-4 shrink-0 text-emerald-600" />
              <span className="leading-7">{it}</span>
            </li>
          ))}
        </ul>
      );
    case "table":
      return (
        <div className="overflow-x-auto rounded-xl border border-stone-200">
          <table className="w-full border-collapse text-[14px]">
            <thead>
              <tr style={{ backgroundColor: CORAL_SOFT }}>
                {block.columns.map((c, i) => (
                  <th
                    key={i}
                    className="border-b border-stone-200 px-3.5 py-2.5 text-left text-[13px] font-bold"
                    style={{ color: CORAL }}
                  >
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {block.rows.map((r, ri) => (
                <tr
                  key={ri}
                  className="align-top odd:bg-white even:bg-stone-50/60"
                >
                  {r.map((cell, ci) => (
                    <td
                      key={ci}
                      className={cn(
                        "border-b border-stone-100 px-3.5 py-2.5 leading-6 text-stone-600",
                        ci === 0 && "font-medium text-stone-800",
                      )}
                    >
                      {cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    case "faq":
      return (
        <div className="space-y-2.5">
          {block.items.map((it, i) => (
            <div
              key={i}
              className="rounded-xl border border-stone-200 bg-white p-4"
            >
              <p className="flex gap-2 text-[15px] font-semibold text-stone-900">
                <HelpCircle
                  className="mt-0.5 h-4 w-4 shrink-0"
                  style={{ color: CORAL }}
                />
                {it.q}
              </p>
              <p className="mt-2 pl-6 text-[15px] leading-7 text-stone-600">
                {it.a}
              </p>
            </div>
          ))}
        </div>
      );
    default:
      return null;
  }
}

export default function Guidebook() {
  const [active, setActive] = useState(GUIDEBOOK_MODULES[0].slug);
  const [search, setSearch] = useState("");
  const [progress, setProgress] = useState(0);
  const total = GUIDEBOOK_MODULES.length;
  const q = search.trim().toLowerCase();

  const totalMinutes = useMemo(
    () => GUIDEBOOK_MODULES.reduce((sum, m) => sum + m.minutes, 0),
    [],
  );

  const visible = useMemo(
    () => GUIDEBOOK_MODULES.filter((m) => moduleMatches(m, q)),
    [q],
  );

  const selected =
    GUIDEBOOK_MODULES.find((m) => m.slug === active) ?? GUIDEBOOK_MODULES[0];
  const shown = visible.some((m) => m.slug === active)
    ? selected
    : (visible[0] ?? selected);
  const shownIdx = GUIDEBOOK_MODULES.findIndex((m) => m.slug === shown.slug);
  const prev = shownIdx > 0 ? GUIDEBOOK_MODULES[shownIdx - 1] : null;
  const next = shownIdx < total - 1 ? GUIDEBOOK_MODULES[shownIdx + 1] : null;
  const HeroIcon = iconFor(shown.icon);

  // Reading-progress bar — tracks how far down the current chapter you've read.
  useEffect(() => {
    const onScroll = () => {
      const el = document.documentElement;
      const max = el.scrollHeight - el.clientHeight;
      setProgress(max > 0 ? Math.min(100, (el.scrollTop / max) * 100) : 0);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener("scroll", onScroll);
  }, [shown.slug]);

  // Build grouped nav from the visible modules (search-aware).
  const visibleSlugs = new Set(visible.map((m) => m.slug));
  const groupedNav = GROUPS.map((g) => ({
    label: g.label,
    modules: g.slugs
      .filter((s) => visibleSlugs.has(s))
      .map((s) => GUIDEBOOK_MODULES.find((m) => m.slug === s)!)
      .filter(Boolean),
  })).filter((g) => g.modules.length > 0);

  const go = (slug: string) => {
    setActive(slug);
    if (typeof window !== "undefined") {
      window.scrollTo({ top: 0, behavior: "smooth" });
      document.getElementById("gb-main")?.scrollTo({ top: 0 });
    }
  };

  const tocSections = shown.sections.filter((s) => s.heading);

  return (
    <div className="min-h-screen bg-[#faf9f7] text-stone-900">
      {/* ===================== TOP HEADER ===================== */}
      <header className="sticky top-0 z-20 border-b border-stone-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-col gap-3 px-5 py-3 sm:flex-row sm:items-center sm:gap-6">
          <div className="flex items-center gap-3">
            <div
              className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-white"
              style={{ backgroundColor: CORAL }}
            >
              <BookOpen className="h-5 w-5" />
            </div>
            <div className="leading-tight">
              <div className="text-[15px] font-extrabold tracking-tight">
                BRAVE <span style={{ color: CORAL }}>Guidebook</span>
              </div>
              <div className="text-[11px] text-stone-400">
                Field guide for student entrepreneurs
              </div>
            </div>
          </div>
          <div className="relative sm:ml-auto sm:w-96">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search the guidebook…"
              className="w-full rounded-full border border-stone-200 bg-stone-50 py-2.5 pl-10 pr-4 text-sm text-stone-800 placeholder:text-stone-400 focus:border-stone-300 focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#db4750]/20"
              data-testid="guidebook-search"
            />
          </div>
        </div>
        {/* Reading progress */}
        <div className="h-0.5 w-full bg-stone-100">
          <div
            className="h-full transition-[width] duration-150 ease-out"
            style={{ width: `${progress}%`, backgroundColor: CORAL }}
          />
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-6xl">
        {/* ===================== CHAPTER NAV ===================== */}
        <aside className="hidden w-72 shrink-0 border-r border-stone-200 md:block">
          <div className="sticky top-[57px] max-h-[calc(100vh-57px)] overflow-y-auto px-3 py-6">
            <p className="px-3 pb-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-stone-400">
              {q
                ? `${visible.length} result${visible.length === 1 ? "" : "s"}`
                : `${total} chapters · ~${totalMinutes} min`}
            </p>
            {groupedNav.length === 0 ? (
              <p className="px-3 py-6 text-sm text-stone-400">
                No chapters match “{search}”.
              </p>
            ) : (
              <nav className="space-y-5">
                {groupedNav.map((group) => (
                  <div key={group.label}>
                    <p className="px-3 pb-1.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-stone-400/80">
                      {group.label}
                    </p>
                    <div className="space-y-0.5">
                      {group.modules.map((m) => {
                        const n = GUIDEBOOK_MODULES.findIndex(
                          (x) => x.slug === m.slug,
                        );
                        const isActive = m.slug === shown.slug;
                        const Icon = iconFor(m.icon);
                        return (
                          <button
                            key={m.slug}
                            type="button"
                            onClick={() => go(m.slug)}
                            className={cn(
                              "group flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors",
                              isActive ? "" : "hover:bg-stone-100",
                            )}
                            style={
                              isActive
                                ? { backgroundColor: CORAL_SOFT }
                                : undefined
                            }
                          >
                            <span
                              className={cn(
                                "grid h-7 w-7 shrink-0 place-items-center rounded-full transition-colors",
                                isActive
                                  ? "text-white"
                                  : "bg-stone-100 text-stone-500 group-hover:bg-stone-200",
                              )}
                              style={
                                isActive
                                  ? { backgroundColor: CORAL }
                                  : undefined
                              }
                            >
                              <Icon className="h-3.5 w-3.5" />
                            </span>
                            <span className="min-w-0 flex-1">
                              <span
                                className={cn(
                                  "block truncate text-sm font-medium",
                                  isActive ? "" : "text-stone-700",
                                )}
                                style={isActive ? { color: CORAL } : undefined}
                              >
                                {m.title}
                              </span>
                              <span className="block text-[11px] text-stone-400">
                                Ch. {n + 1} · {m.minutes} min
                              </span>
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </nav>
            )}
          </div>
        </aside>

        {/* ===================== CONTENT ===================== */}
        <main id="gb-main" className="min-w-0 flex-1 px-5 py-8 sm:px-10">
          {/* Mobile chapter switcher */}
          <div className="-mx-1 mb-6 flex gap-2 overflow-x-auto px-1 pb-1 md:hidden">
            {visible.map((m) => {
              const n = GUIDEBOOK_MODULES.findIndex((x) => x.slug === m.slug);
              const isActive = m.slug === shown.slug;
              const Icon = iconFor(m.icon);
              return (
                <button
                  key={m.slug}
                  type="button"
                  onClick={() => go(m.slug)}
                  className={cn(
                    "flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium",
                    isActive
                      ? "border-transparent text-white"
                      : "border-stone-200 bg-white text-stone-600",
                  )}
                  style={isActive ? { backgroundColor: CORAL } : undefined}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {m.title}
                </button>
              );
            })}
          </div>

          <div className="mx-auto max-w-2xl">
            {/* Chapter hero */}
            <div className="mb-8">
              <div className="flex items-center gap-4">
                <span
                  className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl"
                  style={{ backgroundColor: CORAL_SOFT, color: CORAL }}
                >
                  <HeroIcon className="h-7 w-7" />
                </span>
                <div className="min-w-0">
                  <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-stone-400">
                    <span>
                      Chapter {shownIdx + 1} of {total}
                    </span>
                    <span className="text-stone-300">•</span>
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {shown.minutes} min read
                    </span>
                  </div>
                  <h1 className="mt-1 text-3xl font-extrabold tracking-tight text-stone-900">
                    {shown.title}
                  </h1>
                </div>
              </div>
              <p className="mt-3 text-lg text-stone-500">{shown.tagline}</p>
              <div className="mt-6 h-px bg-stone-200" />
            </div>

            {/* In this chapter (jump links) */}
            {tocSections.length > 1 && (
              <div className="mb-8 rounded-xl border border-stone-200 bg-white p-4">
                <p className="mb-2.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-stone-400">
                  In this chapter
                </p>
                <div className="flex flex-wrap gap-2">
                  {shown.sections.map((sec, si) =>
                    sec.heading ? (
                      <button
                        key={si}
                        type="button"
                        onClick={() =>
                          document
                            .getElementById(`gb-sec-${si}`)
                            ?.scrollIntoView({
                              behavior: "smooth",
                              block: "start",
                            })
                        }
                        className="rounded-full border border-stone-200 px-3 py-1 text-xs text-stone-600 transition-colors hover:border-stone-300 hover:bg-stone-50"
                      >
                        {sec.heading}
                      </button>
                    ) : null,
                  )}
                </div>
              </div>
            )}

            {/* Sections */}
            <div className="space-y-9">
              {shown.sections.map((sec, si) => (
                <section
                  key={si}
                  id={`gb-sec-${si}`}
                  className="scroll-mt-24 space-y-3.5"
                >
                  {sec.heading ? (
                    <h2 className="text-lg font-bold tracking-tight text-stone-900">
                      {sec.heading}
                    </h2>
                  ) : null}
                  <div className="space-y-3.5">
                    {sec.blocks.map((b, bi) => (
                      <Block key={bi} block={b} />
                    ))}
                  </div>
                </section>
              ))}
            </div>

            {/* Prev / Next */}
            <div className="mt-10 flex items-stretch justify-between gap-3 border-t border-stone-200 pt-6">
              {prev ? (
                <button
                  type="button"
                  onClick={() => go(prev.slug)}
                  className="flex max-w-[48%] items-center gap-2 rounded-xl border border-stone-200 bg-white px-4 py-3 text-left transition-colors hover:border-stone-300 hover:bg-stone-50"
                >
                  <ChevronLeft className="h-4 w-4 shrink-0 text-stone-400" />
                  <span className="min-w-0">
                    <span className="block text-[10px] uppercase tracking-wide text-stone-400">
                      Previous
                    </span>
                    <span className="block truncate text-sm font-medium text-stone-700">
                      {prev.title}
                    </span>
                  </span>
                </button>
              ) : (
                <span />
              )}
              {next ? (
                <button
                  type="button"
                  onClick={() => go(next.slug)}
                  className="ml-auto flex max-w-[48%] items-center gap-2 rounded-xl border border-stone-200 bg-white px-4 py-3 text-right transition-colors hover:border-stone-300 hover:bg-stone-50"
                >
                  <span className="min-w-0">
                    <span className="block text-[10px] uppercase tracking-wide text-stone-400">
                      Next
                    </span>
                    <span className="block truncate text-sm font-medium text-stone-700">
                      {next.title}
                    </span>
                  </span>
                  <ChevronRight className="h-4 w-4 shrink-0 text-stone-400" />
                </button>
              ) : (
                <span />
              )}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
