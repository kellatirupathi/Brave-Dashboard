// Role documentation — PUBLIC pages, one per role per season:
//   /docs/student/1.0   /docs/coordinator/1.0   /docs/admin/1.0
//   /docs/student/2.0   /docs/coordinator/2.0   /docs/admin/2.0
//
// Renders the data in ./content. No auth hooks are used here on purpose: the
// links are shared as plain URLs and must open in a fresh browser.
//
// Layout: maroon top bar (BRAVE logo + season pill + role/version switchers),
// a sticky section index on the left with scroll-spy, and the content on the
// right where every section fades and lifts in as it enters the viewport.
import { useEffect, useMemo, useRef, useState, type ComponentType } from "react";
import { Link, useParams } from "wouter";
import { motion } from "framer-motion";
import {
  BookOpen,
  LogIn,
  Users,
  LayoutDashboard,
  IndianRupee,
  Layers,
  Upload,
  CheckCircle2,
  BookOpenCheck,
  ShieldCheck,
  Trophy,
  PlayCircle,
  FolderKanban,
  Activity,
  Megaphone,
  UserCog,
  Clock,
  Table2,
  ClipboardList,
  Building2,
  Settings,
  Sparkles,
  Route,
  Target,
  FileText,
  Bell,
  Award,
  BarChart3,
  CalendarDays,
  Menu,
  X,
  ArrowUpRight,
  Check,
  XCircle,
  Info,
  AlertTriangle,
  Lightbulb,
} from "lucide-react";
import { BraveLogo } from "@/components/brave-logo";
import { cn } from "@/lib/utils";
import type { DocBlock, DocRole, DocVersion, RoleDoc } from "./content/types";
import { STUDENT_1 } from "./content/student-1";
import { STUDENT_2 } from "./content/student-2";
import { COORDINATOR_1 } from "./content/coordinator-1";
import { COORDINATOR_2 } from "./content/coordinator-2";
import { ADMIN_1 } from "./content/admin-1";
import { ADMIN_2 } from "./content/admin-2";

const DOCS: Record<DocRole, Record<DocVersion, RoleDoc>> = {
  student: { "1.0": STUDENT_1, "2.0": STUDENT_2 },
  coordinator: { "1.0": COORDINATOR_1, "2.0": COORDINATOR_2 },
  admin: { "1.0": ADMIN_1, "2.0": ADMIN_2 },
};

const ROLES: DocRole[] = ["student", "coordinator", "admin"];
const VERSIONS: DocVersion[] = ["1.0", "2.0"];
const ROLE_LABEL: Record<DocRole, string> = {
  student: "Student",
  coordinator: "Coordinator",
  admin: "Admin",
};

const ICONS: Record<string, ComponentType<{ className?: string }>> = {
  login: LogIn,
  users: Users,
  layout: LayoutDashboard,
  rupee: IndianRupee,
  layers: Layers,
  upload: Upload,
  check: CheckCircle2,
  journal: BookOpenCheck,
  shield: ShieldCheck,
  trophy: Trophy,
  play: PlayCircle,
  folder: FolderKanban,
  activity: Activity,
  megaphone: Megaphone,
  user: UserCog,
  clock: Clock,
  table: Table2,
  clipboard: ClipboardList,
  building: Building2,
  settings: Settings,
  sparkles: Sparkles,
  route: Route,
  target: Target,
  file: FileText,
  bell: Bell,
  award: Award,
  chart: BarChart3,
  calendar: CalendarDays,
};

// Brand constants — hard-coded so the public page reads the same regardless
// of the viewer's theme. Same values the app uses for its sidebar and pill.
const MAROON = "#5D1414";
const MAROON_DEEP = "#3B0D0D";
const AMBER = "#EF9F27";
const RED = "#C0392B";

// ── Inline markup: **bold**, `code` ─────────────────────────────────────────

function Inline({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`|\*[^*]+\*)/g).filter(Boolean);
  return (
    <>
      {parts.map((p, i) => {
        if (p.startsWith("**") && p.endsWith("**"))
          return (
            <strong key={i} className="font-semibold text-foreground">
              {p.slice(2, -2)}
            </strong>
          );
        if (p.startsWith("`") && p.endsWith("`"))
          return (
            <code
              key={i}
              className="rounded bg-muted px-1.5 py-0.5 font-mono text-[0.85em] text-foreground"
            >
              {p.slice(1, -1)}
            </code>
          );
        if (p.startsWith("*") && p.endsWith("*") && p.length > 2)
          return (
            <em key={i} className="italic">
              {p.slice(1, -1)}
            </em>
          );
        return <span key={i}>{p}</span>;
      })}
    </>
  );
}

// ── Blocks ──────────────────────────────────────────────────────────────────

const CALLOUT: Record<
  "info" | "warn" | "success" | "danger",
  { icon: ComponentType<{ className?: string }>; cls: string; iconCls: string }
> = {
  info: {
    icon: Info,
    cls: "border-sky-200 bg-sky-50 text-sky-950",
    iconCls: "text-sky-600",
  },
  warn: {
    icon: AlertTriangle,
    cls: "border-amber-200 bg-amber-50 text-amber-950",
    iconCls: "text-amber-600",
  },
  success: {
    icon: Lightbulb,
    cls: "border-emerald-200 bg-emerald-50 text-emerald-950",
    iconCls: "text-emerald-600",
  },
  danger: {
    icon: AlertTriangle,
    cls: "border-rose-200 bg-rose-50 text-rose-950",
    iconCls: "text-rose-600",
  },
};

function Block({ block }: { block: DocBlock }) {
  switch (block.type) {
    case "p":
      return (
        <p className="leading-relaxed text-muted-foreground">
          <Inline text={block.text} />
        </p>
      );
    case "h3":
      return (
        <h3 className="mt-2 text-base font-semibold tracking-tight">
          <Inline text={block.text} />
        </h3>
      );
    case "list": {
      const Tag = block.ordered ? "ol" : "ul";
      return (
        <Tag
          className={cn(
            "space-y-1.5 pl-5 text-muted-foreground",
            block.ordered ? "list-decimal" : "list-disc marker:text-primary",
          )}
        >
          {block.items.map((it, i) => (
            <li key={i} className="leading-relaxed">
              <Inline text={it} />
            </li>
          ))}
        </Tag>
      );
    }
    case "table":
      return (
        <div className="overflow-x-auto rounded-xl border">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-primary/[0.07] text-left">
                {block.columns.map((c, i) => (
                  <th
                    key={i}
                    className="whitespace-nowrap px-3 py-2.5 font-semibold text-foreground"
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
                  className={cn("border-t", ri % 2 === 1 && "bg-muted/30")}
                >
                  {r.map((cell, ci) => (
                    <td
                      key={ci}
                      className={cn(
                        "px-3 py-2.5 align-top text-muted-foreground",
                        ci === 0 && "font-medium text-foreground",
                      )}
                    >
                      <Inline text={cell} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    case "callout": {
      const c = CALLOUT[block.tone];
      const Icon = c.icon;
      return (
        <div className={cn("flex gap-3 rounded-xl border p-4", c.cls)}>
          <Icon className={cn("mt-0.5 h-5 w-5 shrink-0", c.iconCls)} />
          <div className="text-sm leading-relaxed">
            {block.title ? (
              <p className="mb-0.5 font-semibold">{block.title}</p>
            ) : null}
            <Inline text={block.text} />
          </div>
        </div>
      );
    }
    case "steps":
      return (
        <ol className="relative space-y-4 border-l-2 border-primary/20 pl-6">
          {block.items.map((s, i) => (
            <motion.li
              key={i}
              initial={{ opacity: 0, x: -8 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true, margin: "-40px" }}
              transition={{ duration: 0.35, delay: i * 0.05 }}
              className="relative"
            >
              <span
                className="absolute -left-[31px] top-0.5 flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-bold text-white"
                style={{ background: RED }}
              >
                {i + 1}
              </span>
              <p className="font-medium">
                <Inline text={s.title} />
              </p>
              {s.text ? (
                <p className="mt-0.5 text-sm leading-relaxed text-muted-foreground">
                  <Inline text={s.text} />
                </p>
              ) : null}
            </motion.li>
          ))}
        </ol>
      );
    case "checklist":
      return (
        <ul className="space-y-2">
          {block.items.map((it, i) => (
            <li key={i} className="flex items-start gap-2.5 text-sm">
              <span className="mt-0.5 flex h-4.5 w-4.5 shrink-0 items-center justify-center rounded border-2 border-primary/50">
                <Check className="h-3 w-3 text-primary" />
              </span>
              <span className="leading-relaxed text-muted-foreground">
                <Inline text={it} />
              </span>
            </li>
          ))}
        </ul>
      );
    case "cando":
      return (
        <div className="grid gap-4 md:grid-cols-2">
          <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-4">
            <p className="mb-2 text-xs font-bold uppercase tracking-wider text-emerald-700">
              Can
            </p>
            <ul className="space-y-1.5">
              {block.can.map((it, i) => (
                <li key={i} className="flex items-start gap-2 text-sm">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                  <span>
                    <Inline text={it} />
                  </span>
                </li>
              ))}
            </ul>
          </div>
          <div className="rounded-xl border border-rose-200 bg-rose-50/60 p-4">
            <p className="mb-2 text-xs font-bold uppercase tracking-wider text-rose-700">
              Cannot
            </p>
            <ul className="space-y-1.5">
              {block.cannot.map((it, i) => (
                <li key={i} className="flex items-start gap-2 text-sm">
                  <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-600" />
                  <span>
                    <Inline text={it} />
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      );
    default:
      return null;
  }
}

// ── Page ────────────────────────────────────────────────────────────────────

function isRole(v: string | undefined): v is DocRole {
  return !!v && (ROLES as string[]).includes(v);
}
function isVersion(v: string | undefined): v is DocVersion {
  return !!v && (VERSIONS as string[]).includes(v);
}

export default function DocsPage() {
  const params = useParams<{ role?: string; version?: string }>();
  const role: DocRole = isRole(params.role) ? params.role : "student";
  const version: DocVersion = isVersion(params.version)
    ? params.version
    : "2.0";
  const doc = DOCS[role][version];

  const [active, setActive] = useState<string>(doc.sections[0]?.id ?? "");
  const [navOpen, setNavOpen] = useState(false);
  const sectionIds = useMemo(() => doc.sections.map((s) => s.id), [doc]);
  const observer = useRef<IntersectionObserver | null>(null);

  // Public page: stamp the tab title, start at the top on every doc change.
  useEffect(() => {
    document.title = `${ROLE_LABEL[role]} docs · BRAVE ${version}`;
    window.scrollTo({ top: 0 });
    setActive(doc.sections[0]?.id ?? "");
  }, [role, version, doc]);

  // Scroll-spy: the section nearest the top of the viewport is active.
  useEffect(() => {
    observer.current?.disconnect();
    const visible = new Map<string, number>();
    observer.current = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) visible.set(e.target.id, e.boundingClientRect.top);
          else visible.delete(e.target.id);
        }
        if (visible.size === 0) return;
        const top = [...visible.entries()].sort((a, b) => a[1] - b[1])[0];
        if (top) setActive(top[0]);
      },
      { rootMargin: "-96px 0px -60% 0px", threshold: [0, 0.2] },
    );
    for (const id of sectionIds) {
      const el = document.getElementById(id);
      if (el) observer.current.observe(el);
    }
    return () => observer.current?.disconnect();
  }, [sectionIds]);

  const jump = (id: string) => {
    setNavOpen(false);
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const SideNav = (
    <nav aria-label="Sections" className="space-y-0.5">
      {doc.sections.map((s, i) => {
        const Icon = ICONS[s.icon ?? ""] ?? BookOpen;
        const isActive = active === s.id;
        return (
          <button
            key={s.id}
            type="button"
            onClick={() => jump(s.id)}
            className={cn(
              "group flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-sm transition-colors",
              isActive
                ? "bg-primary/10 font-semibold text-primary"
                : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            <span
              className={cn(
                "flex h-5 w-5 shrink-0 items-center justify-center rounded text-[10px] font-bold tabular-nums",
                isActive
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground group-hover:bg-background",
              )}
            >
              {i + 1}
            </span>
            <Icon className="h-3.5 w-3.5 shrink-0 opacity-70" />
            <span className="truncate">{s.title}</span>
          </button>
        );
      })}
    </nav>
  );

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* ── Top bar ────────────────────────────────────────────────────── */}
      <header
        className="sticky top-0 z-40 border-b border-black/20 text-white shadow-md"
        style={{ background: `linear-gradient(90deg, ${MAROON_DEEP}, ${MAROON})` }}
      >
        <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-3 sm:px-6">
          <button
            type="button"
            className="rounded-md p-1.5 hover:bg-white/10 lg:hidden"
            onClick={() => setNavOpen((v) => !v)}
            aria-label="Toggle sections"
          >
            {navOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
          <Link href={`/docs/${role}/${version}`} className="flex items-center gap-2">
            <BraveLogo className="text-2xl" />
            <span
              className="rounded-full px-2 py-0.5 text-[11px] font-extrabold tracking-wide"
              style={{ background: AMBER, color: MAROON_DEEP }}
            >
              {version}
            </span>
          </Link>
          <span className="hidden text-sm text-white/60 sm:inline">/ Documentation</span>

          <div className="ml-auto flex items-center gap-2">
            {/* Role switcher */}
            <div className="hidden items-center rounded-lg bg-white/10 p-0.5 sm:flex">
              {ROLES.map((r) => (
                <Link
                  key={r}
                  href={`/docs/${r}/${version}`}
                  className={cn(
                    "rounded-md px-3 py-1 text-xs font-semibold transition-colors",
                    r === role ? "bg-white text-[#3B0D0D]" : "text-white/80 hover:bg-white/10",
                  )}
                >
                  {ROLE_LABEL[r]}
                </Link>
              ))}
            </div>
            {/* Version switcher */}
            <div className="flex items-center rounded-lg bg-white/10 p-0.5">
              {VERSIONS.map((v) => (
                <Link
                  key={v}
                  href={`/docs/${role}/${v}`}
                  className={cn(
                    "rounded-md px-2.5 py-1 text-xs font-bold tabular-nums transition-colors",
                    v === version ? "text-[#3B0D0D]" : "text-white/80 hover:bg-white/10",
                  )}
                  style={v === version ? { background: AMBER } : undefined}
                >
                  {v}
                </Link>
              ))}
            </div>
            <a
              href="/"
              className="hidden items-center gap-1 rounded-md px-2.5 py-1.5 text-xs font-medium text-white/80 hover:bg-white/10 hover:text-white md:inline-flex"
            >
              Open dashboard
              <ArrowUpRight className="h-3.5 w-3.5" />
            </a>
          </div>
        </div>
        {/* Mobile role switcher */}
        <div className="flex gap-1 overflow-x-auto px-4 pb-2 sm:hidden">
          {ROLES.map((r) => (
            <Link
              key={r}
              href={`/docs/${r}/${version}`}
              className={cn(
                "shrink-0 rounded-full px-3 py-1 text-xs font-semibold",
                r === role ? "bg-white text-[#3B0D0D]" : "bg-white/10 text-white/80",
              )}
            >
              {ROLE_LABEL[r]}
            </Link>
          ))}
        </div>
      </header>

      {/* ── Hero ───────────────────────────────────────────────────────── */}
      <motion.section
        key={`${role}-${version}-hero`}
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45 }}
        className="border-b bg-gradient-to-b from-primary/[0.06] to-transparent"
      >
        <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:py-14">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-primary">
            BRAVE Season {version} · {ROLE_LABEL[role]} role
          </p>
          <h1 className="mt-2 text-3xl font-extrabold tracking-tight sm:text-4xl lg:text-5xl">
            {doc.title}
          </h1>
          <p className="mt-3 max-w-3xl text-base leading-relaxed text-muted-foreground sm:text-lg">
            {doc.subtitle}
          </p>
          <div className="mt-6">
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Sidebar this role sees
            </p>
            <div className="flex flex-wrap gap-1.5">
              {doc.menu.map((m, i) => (
                <motion.span
                  key={m}
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 0.15 + i * 0.04, duration: 0.25 }}
                  className="rounded-full border bg-background px-3 py-1 text-xs font-medium shadow-sm"
                >
                  {m}
                </motion.span>
              ))}
            </div>
          </div>
        </div>
      </motion.section>

      {/* ── Body ───────────────────────────────────────────────────────── */}
      <div className="mx-auto flex max-w-7xl gap-10 px-4 py-8 sm:px-6">
        {/* Section index — sticky on desktop, drawer on mobile */}
        <aside
          className={cn(
            "fixed inset-x-0 top-[57px] z-30 max-h-[calc(100vh-57px)] overflow-y-auto border-b bg-background p-4 shadow-lg lg:static lg:block lg:w-64 lg:shrink-0 lg:border-0 lg:bg-transparent lg:p-0 lg:shadow-none",
            navOpen ? "block" : "hidden",
          )}
        >
          <div className="lg:sticky lg:top-24">
            <p className="mb-2 px-2.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              On this page
            </p>
            {SideNav}
            <p className="mt-6 px-2.5 text-[11px] text-muted-foreground">
              {doc.sections.length} sections · {doc.updated}
            </p>
          </div>
        </aside>

        {/* Content */}
        <main className="min-w-0 flex-1 space-y-10 pb-24">
          {doc.sections.map((s, i) => {
            const Icon = ICONS[s.icon ?? ""] ?? BookOpen;
            return (
              <motion.section
                key={s.id}
                id={s.id}
                initial={{ opacity: 0, y: 18 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-60px" }}
                transition={{ duration: 0.45, ease: "easeOut" }}
                className="scroll-mt-24 rounded-2xl border bg-card p-5 shadow-sm sm:p-7"
              >
                <div className="mb-4 flex items-start gap-3">
                  <span
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-white"
                    style={{ background: RED }}
                  >
                    <Icon className="h-4.5 w-4.5" />
                  </span>
                  <div className="min-w-0">
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                      Section {i + 1}
                    </p>
                    <h2 className="text-xl font-bold tracking-tight sm:text-2xl">
                      {s.title}
                    </h2>
                    {s.intro ? (
                      <p className="mt-1 text-sm text-muted-foreground">
                        <Inline text={s.intro} />
                      </p>
                    ) : null}
                  </div>
                </div>
                <div className="space-y-4 text-[15px]">
                  {s.blocks.map((b, bi) => (
                    <Block key={bi} block={b} />
                  ))}
                </div>
              </motion.section>
            );
          })}

          <footer className="flex flex-col items-start justify-between gap-3 border-t pt-6 text-xs text-muted-foreground sm:flex-row sm:items-center">
            <span>
              BRAVE Programme Dashboard · {ROLE_LABEL[role]} documentation ·
              Season {version}
            </span>
            <div className="flex gap-3">
              {VERSIONS.filter((v) => v !== version).map((v) => (
                <Link
                  key={v}
                  href={`/docs/${role}/${v}`}
                  className="font-medium text-primary hover:underline"
                >
                  Read the {v} version →
                </Link>
              ))}
            </div>
          </footer>
        </main>
      </div>
    </div>
  );
}
