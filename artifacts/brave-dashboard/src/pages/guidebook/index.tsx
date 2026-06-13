import { useMemo, useState, type ComponentType } from "react";
import {
  Rocket,
  Search,
  Presentation,
  Target,
  IndianRupee,
  ClipboardCheck,
  Trophy,
  CalendarCheck,
  Sparkles,
  HelpCircle,
  BookOpen,
  Lightbulb,
  AlertTriangle,
  CheckCircle2,
  Clock,
  ChevronLeft,
  ChevronRight,
  Quote,
  ArrowLeft,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { BraveLogo } from "@/components/brave-logo";
import { GUIDEBOOK_MODULES, type GbBlock, type GbModule } from "./content";

// Map the content's string icon keys to lucide components.
const ICONS: Record<string, ComponentType<{ className?: string }>> = {
  rocket: Rocket,
  search: Search,
  pitch: Presentation,
  target: Target,
  rupee: IndianRupee,
  brd: ClipboardCheck,
  trophy: Trophy,
  track: CalendarCheck,
  spark: Sparkles,
  faq: HelpCircle,
};

const DASHBOARD_HREF = import.meta.env.BASE_URL || "/";

// Flatten a block to plain text so the search can match across everything.
function blockText(b: GbBlock): string {
  switch (b.kind) {
    case "p":
    case "h":
    case "tip":
    case "warn":
      return b.text;
    case "list":
    case "steps":
    case "checklist":
      return b.items.join(" ");
    case "example":
      return `${b.title} ${b.text}`;
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
  tone: "tip" | "warn";
  icon: ComponentType<{ className?: string }>;
  text: string;
}) {
  return (
    <div
      className={cn(
        "flex gap-2.5 rounded-lg border p-3",
        tone === "tip"
          ? "border-emerald-500/30 bg-emerald-500/5"
          : "border-amber-500/30 bg-amber-500/5",
      )}
    >
      <Icon
        className={cn(
          "mt-0.5 h-4 w-4 shrink-0",
          tone === "tip" ? "text-emerald-600" : "text-amber-600",
        )}
      />
      <p className="text-sm leading-relaxed text-foreground/80">{text}</p>
    </div>
  );
}

function Block({ block }: { block: GbBlock }) {
  switch (block.kind) {
    case "p":
      return (
        <p className="text-sm leading-relaxed text-muted-foreground">
          {block.text}
        </p>
      );
    case "h":
      return (
        <h4 className="text-sm font-semibold text-foreground">{block.text}</h4>
      );
    case "list":
      return (
        <ul className="space-y-1.5">
          {block.items.map((it, i) => (
            <li key={i} className="flex gap-2.5 text-sm text-muted-foreground">
              <span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-primary/60" />
              <span className="leading-relaxed">{it}</span>
            </li>
          ))}
        </ul>
      );
    case "steps":
      return (
        <ol className="space-y-2.5">
          {block.items.map((it, i) => (
            <li key={i} className="flex gap-3 text-sm text-muted-foreground">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[11px] font-semibold text-primary">
                {i + 1}
              </span>
              <span className="pt-px leading-relaxed">{it}</span>
            </li>
          ))}
        </ol>
      );
    case "tip":
      return <Callout tone="tip" icon={Lightbulb} text={block.text} />;
    case "warn":
      return <Callout tone="warn" icon={AlertTriangle} text={block.text} />;
    case "example":
      return (
        <div className="rounded-lg border bg-muted/40 p-3">
          <div className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-foreground">
            <Quote className="h-3.5 w-3.5 text-primary" />
            {block.title}
          </div>
          <p className="text-sm italic leading-relaxed text-muted-foreground">
            {block.text}
          </p>
        </div>
      );
    case "checklist":
      return (
        <ul className="space-y-1.5">
          {block.items.map((it, i) => (
            <li key={i} className="flex gap-2.5 text-sm text-muted-foreground">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
              <span className="leading-relaxed">{it}</span>
            </li>
          ))}
        </ul>
      );
    case "faq":
      return (
        <div className="divide-y rounded-lg border">
          {block.items.map((it, i) => (
            <div key={i} className="p-3.5">
              <p className="flex gap-2 text-sm font-semibold text-foreground">
                <HelpCircle className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                {it.q}
              </p>
              <p className="mt-1.5 pl-6 text-sm leading-relaxed text-muted-foreground">
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

// A single module's full content (header + sections), shared by desktop + mobile.
function ModuleContent({
  mod,
  idx,
  total,
}: {
  mod: GbModule;
  idx: number;
  total: number;
}) {
  const ModIcon = ICONS[mod.icon] ?? BookOpen;
  return (
    <article className="rounded-xl border bg-card p-5 sm:p-7">
      <div className="flex items-start gap-3 border-b pb-4">
        <div className="rounded-lg bg-primary/10 p-2.5">
          <ModIcon className="h-5 w-5 text-primary" />
        </div>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary" className="text-[10px]">
              Module {idx + 1} of {total}
            </Badge>
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <Clock className="h-3 w-3" />
              {mod.minutes} min read
            </span>
          </div>
          <h2 className="mt-1.5 text-xl font-semibold tracking-tight sm:text-2xl">
            {mod.title}
          </h2>
          <p className="text-sm text-muted-foreground">{mod.tagline}</p>
        </div>
      </div>

      <div className="space-y-7 pt-5">
        {mod.sections.map((sec, si) => (
          <section key={si} className="space-y-3">
            {sec.heading ? (
              <h3 className="text-base font-semibold tracking-tight text-foreground">
                {sec.heading}
              </h3>
            ) : null}
            <div className="space-y-3">
              {sec.blocks.map((b, bi) => (
                <Block key={bi} block={b} />
              ))}
            </div>
          </section>
        ))}
      </div>
    </article>
  );
}

export default function Guidebook() {
  const [active, setActive] = useState(GUIDEBOOK_MODULES[0].slug);
  const [search, setSearch] = useState("");
  const total = GUIDEBOOK_MODULES.length;
  const q = search.trim().toLowerCase();

  const visible = useMemo(
    () => GUIDEBOOK_MODULES.filter((m) => moduleMatches(m, q)),
    [q],
  );

  // The module to display: the selected one, unless it's filtered out by the
  // search — then fall back to the first match.
  const selected =
    GUIDEBOOK_MODULES.find((m) => m.slug === active) ?? GUIDEBOOK_MODULES[0];
  const shown = visible.some((m) => m.slug === active)
    ? selected
    : (visible[0] ?? selected);
  const shownIdx = GUIDEBOOK_MODULES.findIndex((m) => m.slug === shown.slug);
  const prev = shownIdx > 0 ? GUIDEBOOK_MODULES[shownIdx - 1] : null;
  const next = shownIdx < total - 1 ? GUIDEBOOK_MODULES[shownIdx + 1] : null;

  const go = (slug: string) => {
    setActive(slug);
    if (typeof window !== "undefined") {
      window.scrollTo({ top: 0, behavior: "smooth" });
      document
        .getElementById("gb-content")
        ?.scrollTo({ top: 0, behavior: "smooth" });
    }
  };

  return (
    <div className="flex h-screen w-full overflow-hidden bg-background text-foreground">
      {/* ===================== SIDEBAR ===================== */}
      <aside className="hidden w-80 shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground md:flex">
        {/* Logo / brand */}
        <div className="flex items-center gap-2 px-6 pb-3 pt-6">
          <BraveLogo className="text-2xl" />
        </div>
        <div className="flex items-center gap-2 px-6 pb-4">
          <BookOpen className="h-3.5 w-3.5 text-sidebar-foreground/60" />
          <span className="text-xs uppercase tracking-widest text-sidebar-foreground/60">
            Guidebook
          </span>
        </div>

        {/* Search */}
        <div className="px-4 pb-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-sidebar-foreground/50" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search the guidebook…"
              className="w-full rounded-md border border-sidebar-border bg-sidebar-accent/40 py-2 pl-9 pr-3 text-sm text-sidebar-foreground placeholder:text-sidebar-foreground/50 focus:outline-none focus:ring-2 focus:ring-sidebar-ring"
              data-testid="guidebook-search"
            />
          </div>
        </div>

        {/* Module nav */}
        <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-3">
          {visible.length === 0 ? (
            <p className="px-3 py-6 text-center text-sm text-sidebar-foreground/60">
              No modules match “{search}”.
            </p>
          ) : (
            visible.map((m) => {
              const Icon = ICONS[m.icon] ?? BookOpen;
              const isActive = m.slug === shown.slug;
              const n = GUIDEBOOK_MODULES.findIndex((x) => x.slug === m.slug);
              return (
                <button
                  key={m.slug}
                  type="button"
                  onClick={() => go(m.slug)}
                  className={cn(
                    "flex w-full items-start gap-3 rounded-md px-3 py-2.5 text-left transition-colors",
                    isActive
                      ? "bg-sidebar-primary text-sidebar-primary-foreground shadow-sm"
                      : "text-sidebar-foreground/75 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                  )}
                >
                  <span
                    className={cn(
                      "flex h-7 w-7 shrink-0 items-center justify-center rounded-md",
                      isActive
                        ? "bg-black/10"
                        : "bg-sidebar-accent/60 text-sidebar-foreground/70",
                    )}
                  >
                    <Icon className="h-4 w-4" />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-medium leading-snug">
                      {m.title}
                    </span>
                    <span
                      className={cn(
                        "mt-0.5 block text-xs",
                        isActive
                          ? "text-sidebar-primary-foreground/80"
                          : "text-sidebar-foreground/50",
                      )}
                    >
                      Module {n + 1} · {m.minutes} min
                    </span>
                  </span>
                </button>
              );
            })
          )}
        </nav>

        {/* Back to dashboard */}
        <div className="border-t border-sidebar-border p-3">
          <a
            href={DASHBOARD_HREF}
            className="flex items-center gap-2 rounded-md px-3 py-2 text-sm text-sidebar-foreground/70 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Dashboard
          </a>
        </div>
      </aside>

      {/* ===================== CONTENT ===================== */}
      <div id="gb-content" className="flex-1 overflow-y-auto">
        {/* Mobile top bar */}
        <div className="sticky top-0 z-10 border-b bg-background/95 px-4 py-3 backdrop-blur md:hidden">
          <div className="flex items-center justify-between gap-2">
            <BraveLogo className="text-lg" />
            <a
              href={DASHBOARD_HREF}
              className="flex items-center gap-1 text-xs text-muted-foreground"
            >
              <ArrowLeft className="h-3.5 w-3.5" /> Dashboard
            </a>
          </div>
          <div className="relative mt-2.5">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search the guidebook…"
              className="w-full rounded-md border bg-muted/40 py-2 pl-9 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          <div className="-mx-1 mt-2.5 flex gap-2 overflow-x-auto px-1 pb-1">
            {visible.map((m) => {
              const Icon = ICONS[m.icon] ?? BookOpen;
              const isActive = m.slug === shown.slug;
              return (
                <button
                  key={m.slug}
                  type="button"
                  onClick={() => go(m.slug)}
                  className={cn(
                    "flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium",
                    isActive
                      ? "border-primary bg-primary/10 text-primary"
                      : "text-muted-foreground hover:bg-muted",
                  )}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {m.title}
                </button>
              );
            })}
          </div>
        </div>

        <div className="mx-auto max-w-3xl px-5 py-6 sm:px-8 sm:py-8">
          {/* Page header (desktop) */}
          <div className="mb-6 hidden items-center gap-3 md:flex">
            <div className="rounded-lg bg-primary/10 p-2">
              <BookOpen className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">
                BRAVE Guidebook
              </h1>
              <p className="text-sm text-muted-foreground">
                Your field guide to finding clients, pitching, choosing what to
                build, pricing, and turning real payments into verified revenue.
              </p>
            </div>
          </div>

          <ModuleContent mod={shown} idx={shownIdx} total={total} />

          {/* Prev / Next */}
          <div className="mt-6 flex items-center justify-between gap-3">
            {prev ? (
              <Button
                variant="outline"
                className="h-auto max-w-[48%] gap-1.5 py-2"
                onClick={() => go(prev.slug)}
              >
                <ChevronLeft className="h-4 w-4 shrink-0" />
                <span className="truncate text-left">
                  <span className="block text-[10px] uppercase tracking-wide text-muted-foreground">
                    Previous
                  </span>
                  <span className="block truncate">{prev.title}</span>
                </span>
              </Button>
            ) : (
              <span />
            )}
            {next ? (
              <Button
                variant="outline"
                className="ml-auto h-auto max-w-[48%] gap-1.5 py-2"
                onClick={() => go(next.slug)}
              >
                <span className="truncate text-right">
                  <span className="block text-[10px] uppercase tracking-wide text-muted-foreground">
                    Next
                  </span>
                  <span className="block truncate">{next.title}</span>
                </span>
                <ChevronRight className="h-4 w-4 shrink-0" />
              </Button>
            ) : (
              <span />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
