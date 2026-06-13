import { useState, type ComponentType } from "react";
import {
  Rocket,
  Search,
  Presentation,
  Target,
  IndianRupee,
  ClipboardCheck,
  Trophy,
  CalendarCheck,
  BookOpen,
  Lightbulb,
  AlertTriangle,
  CheckCircle2,
  Clock,
  ChevronLeft,
  ChevronRight,
  Quote,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { GUIDEBOOK_MODULES, type GbBlock } from "./content";

// Map the content's string icon keys to lucide components (keeps content.ts
// free of React imports).
const ICONS: Record<string, ComponentType<{ className?: string }>> = {
  rocket: Rocket,
  search: Search,
  pitch: Presentation,
  target: Target,
  rupee: IndianRupee,
  brd: ClipboardCheck,
  trophy: Trophy,
  track: CalendarCheck,
};

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
    default:
      return null;
  }
}

export default function Guidebook() {
  const [active, setActive] = useState(GUIDEBOOK_MODULES[0].slug);
  const total = GUIDEBOOK_MODULES.length;
  const idx = Math.max(
    0,
    GUIDEBOOK_MODULES.findIndex((m) => m.slug === active),
  );
  const mod = GUIDEBOOK_MODULES[idx] ?? GUIDEBOOK_MODULES[0];
  const ModIcon = ICONS[mod.icon] ?? BookOpen;
  const prev = idx > 0 ? GUIDEBOOK_MODULES[idx - 1] : null;
  const next = idx < total - 1 ? GUIDEBOOK_MODULES[idx + 1] : null;

  const go = (slug: string) => {
    setActive(slug);
    if (typeof window !== "undefined") {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="rounded-lg bg-primary/10 p-2">
          <BookOpen className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Guidebook</h1>
          <p className="text-sm text-muted-foreground">
            Your field guide to finding clients, pitching, choosing what to
            build, pricing, and turning real payments into verified revenue.
          </p>
        </div>
      </div>

      {/* Mobile module switcher */}
      <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 lg:hidden">
        {GUIDEBOOK_MODULES.map((m) => {
          const Icon = ICONS[m.icon] ?? BookOpen;
          const isActive = m.slug === active;
          return (
            <button
              key={m.slug}
              type="button"
              onClick={() => go(m.slug)}
              className={cn(
                "flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
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

      <div className="grid gap-6 lg:grid-cols-[260px_1fr]">
        {/* Desktop module nav */}
        <aside className="hidden lg:block">
          <div className="sticky top-6 space-y-1">
            {GUIDEBOOK_MODULES.map((m, i) => {
              const Icon = ICONS[m.icon] ?? BookOpen;
              const isActive = m.slug === active;
              return (
                <button
                  key={m.slug}
                  type="button"
                  onClick={() => go(m.slug)}
                  className={cn(
                    "flex w-full items-start gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors",
                    isActive
                      ? "border-primary/40 bg-primary/5"
                      : "border-transparent hover:bg-muted",
                  )}
                >
                  <span
                    className={cn(
                      "flex h-7 w-7 shrink-0 items-center justify-center rounded-md",
                      isActive
                        ? "bg-primary/15 text-primary"
                        : "bg-muted text-muted-foreground",
                    )}
                  >
                    <Icon className="h-4 w-4" />
                  </span>
                  <span className="min-w-0">
                    <span
                      className={cn(
                        "block text-sm font-medium leading-snug",
                        isActive ? "text-foreground" : "text-foreground/80",
                      )}
                    >
                      {m.title}
                    </span>
                    <span className="mt-0.5 block text-xs text-muted-foreground">
                      Module {i + 1} · {m.minutes} min
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        </aside>

        {/* Content */}
        <div className="min-w-0 space-y-6">
          <Card className="p-5 sm:p-6">
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
                <h2 className="mt-1.5 text-xl font-semibold tracking-tight">
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
          </Card>

          {/* Prev / Next */}
          <div className="flex items-center justify-between gap-3">
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
