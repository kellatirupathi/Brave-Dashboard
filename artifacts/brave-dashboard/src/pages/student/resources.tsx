// Student-facing Resources library — read-only view of admin-curated
// project/solution docs. Premium card design with depth, brand accents,
// and a polished empty state. Students read titles, expand long descriptions
// inline ("Read more..."), and click "Open" to jump into the Google Doc in a
// new tab. No edit/delete/add UI is rendered for this role.

import { useEffect, useMemo, useState } from "react";
import { ExternalLink, BookOpen, Sparkles, Search } from "lucide-react";
import { Spinner } from "@/components/ui/spinner";
import { Input } from "@/components/ui/input";

type Resource = {
  id: number;
  title: string;
  description: string;
  docUrl: string;
};

export default function StudentResourcesLibrary() {
  const [resources, setResources] = useState<Resource[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  useEffect(() => {
    let cancelled = false;
    fetch("/api/resources", { credentials: "include" })
      .then(async (r) => {
        if (!r.ok) throw new Error("Failed to load resources");
        return r.json();
      })
      .then((data: Resource[]) => {
        if (!cancelled) setResources(Array.isArray(data) ? data : []);
      })
      .catch((e: Error) => {
        if (!cancelled) setError(e.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return resources;
    return resources.filter(
      (r) =>
        r.title.toLowerCase().includes(q) ||
        r.description.toLowerCase().includes(q),
    );
  }, [resources, query]);

  return (
    <div className="w-full px-4 md:px-8 py-6 md:py-10">
      {/* Header card with gradient accent */}
      <div
        className="relative overflow-hidden rounded-3xl border border-border bg-card p-6 md:p-8 mb-8"
        style={{
          backgroundImage:
            "radial-gradient(ellipse 80% 60% at 0% 0%, rgba(192,57,43,0.08) 0%, transparent 60%), radial-gradient(ellipse 60% 50% at 100% 100%, rgba(239,159,39,0.07) 0%, transparent 60%)",
        }}
      >
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-5">
          <div className="flex items-start gap-4">
            <div
              className="shrink-0 w-12 h-12 rounded-2xl flex items-center justify-center"
              style={{
                background:
                  "linear-gradient(135deg, rgba(192,57,43,0.12) 0%, rgba(239,159,39,0.1) 100%)",
                border: "1px solid rgba(192,57,43,0.22)",
              }}
            >
              <BookOpen className="w-5 h-5" style={{ color: "#C0392B" }} />
            </div>
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span
                  className="text-[10px] font-bold tracking-[0.12em] uppercase"
                  style={{ color: "#C0392B" }}
                >
                  Library
                </span>
                <span
                  className="hidden sm:inline-block w-1 h-1 rounded-full"
                  style={{ background: "#C0392B", opacity: 0.4 }}
                />
                <span className="hidden sm:inline text-[10px] font-medium tracking-wide uppercase text-muted-foreground">
                  {resources.length}{" "}
                  {resources.length === 1 ? "resource" : "resources"}
                </span>
              </div>
              <h1
                className="text-2xl md:text-3xl font-bold tracking-tight"
                data-testid="text-resources-title"
                style={{ letterSpacing: "-0.02em" }}
              >
                Resources
              </h1>
              <p className="text-sm text-muted-foreground mt-1.5 max-w-xl">
                Curated project playbooks and step-by-step plans. Open any doc
                to read the full plan.
              </p>
            </div>
          </div>

          {/* Search */}
          {!loading && resources.length > 0 && (
            <div className="relative w-full md:w-72 shrink-0">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search resources…"
                className="pl-9"
                data-testid="input-resources-search"
              />
            </div>
          )}
        </div>
      </div>

      {/* Body */}
      {loading ? (
        <div
          className="flex items-center justify-center py-20"
          data-testid="resources-loading"
        >
          <Spinner className="size-6" />
        </div>
      ) : error ? (
        <div
          className="rounded-2xl border border-destructive/30 bg-destructive/5 p-6 text-sm text-destructive"
          role="alert"
          data-testid="resources-error"
        >
          {error}
        </div>
      ) : resources.length === 0 ? (
        <div
          className="relative overflow-hidden rounded-3xl border border-border bg-card p-12 md:p-16 text-center"
          data-testid="resources-empty"
        >
          <div
            className="absolute inset-0 opacity-40 pointer-events-none"
            style={{
              backgroundImage:
                "radial-gradient(circle, rgba(192,57,43,0.08) 1px, transparent 1px)",
              backgroundSize: "20px 20px",
              maskImage:
                "radial-gradient(ellipse 60% 50% at 50% 50%, black 30%, transparent 80%)",
              WebkitMaskImage:
                "radial-gradient(ellipse 60% 50% at 50% 50%, black 30%, transparent 80%)",
            }}
          />
          <div className="relative">
            <div
              className="w-14 h-14 mx-auto mb-4 rounded-2xl flex items-center justify-center"
              style={{
                background:
                  "linear-gradient(135deg, rgba(192,57,43,0.1) 0%, rgba(239,159,39,0.08) 100%)",
                border: "1px solid rgba(192,57,43,0.18)",
              }}
            >
              <Sparkles className="w-6 h-6" style={{ color: "#C0392B" }} />
            </div>
            <h3 className="font-semibold text-lg mb-1">Coming soon</h3>
            <p className="text-sm text-muted-foreground max-w-sm mx-auto">
              No resources have been published yet. Check back soon for project
              playbooks and step-by-step guides.
            </p>
          </div>
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-2xl border border-border bg-card p-10 text-center text-muted-foreground">
          No resources match{" "}
          <span className="font-medium text-foreground">"{query}"</span>.
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {filtered.map((r, idx) => {
            const isExpanded = expandedId === r.id;
            const number = String(idx + 1).padStart(2, "0");
            return (
              <article
                key={r.id}
                data-testid={`resource-${r.id}`}
                className="group relative rounded-2xl border border-border bg-card transition-all duration-300 hover:-translate-y-0.5 hover:border-[#C0392B]/30 hover:shadow-[0_20px_50px_-20px_rgba(192,57,43,0.22)] overflow-hidden"
              >
                {/* Left accent bar — shows on hover */}
                <div
                  aria-hidden
                  className="absolute left-0 top-0 bottom-0 w-1 opacity-0 group-hover:opacity-100 transition-opacity duration-300"
                  style={{
                    background:
                      "linear-gradient(180deg, #C0392B 0%, #EF9F27 100%)",
                  }}
                />
                <div className="flex flex-col md:flex-row md:items-center gap-4 md:gap-6 p-5 md:p-6">
                  {/* Number badge */}
                  <div
                    className="hidden md:flex shrink-0 w-12 h-12 rounded-xl items-center justify-center font-extrabold text-base transition-transform duration-300 group-hover:scale-110"
                    style={{
                      background:
                        "linear-gradient(135deg, rgba(192,57,43,0.08) 0%, rgba(239,159,39,0.06) 100%)",
                      border: "1px solid rgba(192,57,43,0.15)",
                      color: "#C0392B",
                      letterSpacing: "-0.02em",
                    }}
                  >
                    {number}
                  </div>

                  {/* Body */}
                  <div className="flex-1 min-w-0">
                    <h3
                      className="font-semibold text-base md:text-lg mb-1.5 text-foreground tracking-tight"
                      data-testid={`resource-title-${r.id}`}
                      style={{ letterSpacing: "-0.01em" }}
                    >
                      {r.title}
                    </h3>
                    <p
                      className={`text-sm text-muted-foreground leading-relaxed ${
                        isExpanded ? "" : "line-clamp-2"
                      }`}
                      data-testid={`resource-description-${r.id}`}
                    >
                      {r.description}
                    </p>
                    {r.description.length > 120 && (
                      <button
                        type="button"
                        onClick={() => setExpandedId(isExpanded ? null : r.id)}
                        className="mt-2 inline-flex items-center gap-1 text-xs font-semibold hover:underline transition-colors"
                        style={{ color: "#C0392B" }}
                        data-testid={`resource-toggle-${r.id}`}
                      >
                        {isExpanded ? "Show less" : "Read more..."}
                      </button>
                    )}
                  </div>

                  {/* Open CTA */}
                  <a
                    href={r.docUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="group/btn shrink-0 inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold bg-[#111] text-white transition-all duration-200 hover:bg-black hover:-translate-y-0.5 hover:shadow-[0_8px_20px_-6px_rgba(0,0,0,0.4)]"
                    style={{
                      boxShadow:
                        "0 4px 12px -4px rgba(0,0,0,0.2), inset 0 1px 0 rgba(255,255,255,0.08)",
                    }}
                    data-testid={`resource-open-${r.id}`}
                  >
                    Open
                    <ExternalLink className="w-3.5 h-3.5 transition-transform group-hover/btn:translate-x-0.5" />
                  </a>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
