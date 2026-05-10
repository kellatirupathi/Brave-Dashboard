// Student-facing Resources library — read-only view of admin-curated
// project/solution docs. Students can read titles, expand long descriptions
// inline, and click "Open" to jump into the Google Doc in a new tab.
// No edit/delete/add UI is rendered for this role.

import { useEffect, useState } from "react";
import { ExternalLink, BookOpen } from "lucide-react";
import { Spinner } from "@/components/ui/spinner";

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

  return (
    <div className="max-w-5xl mx-auto px-4 py-6 md:py-8">
      <div className="mb-6">
        <h1
          className="text-2xl md:text-3xl font-bold tracking-tight"
          data-testid="text-resources-title"
        >
          Resources
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Curated project playbooks and step-by-step plans. Click "Open" to read
          the full doc.
        </p>
      </div>

      {loading ? (
        <div
          className="flex items-center justify-center py-16"
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
          className="rounded-2xl border border-border bg-card p-10 text-center text-muted-foreground"
          data-testid="resources-empty"
        >
          <BookOpen className="w-8 h-8 mx-auto mb-3 opacity-40" />
          No resources have been published yet. Check back soon!
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {resources.map((r) => {
            const isExpanded = expandedId === r.id;
            return (
              <article
                key={r.id}
                data-testid={`resource-${r.id}`}
                className="rounded-2xl border border-border bg-card p-5 md:p-6 flex flex-col md:flex-row md:items-center gap-4 md:gap-6 transition-all duration-200 hover:border-[#C0392B]/30 hover:shadow-[0_12px_32px_-16px_rgba(192,57,43,0.18)]"
              >
                <div className="flex-1 min-w-0">
                  <h3
                    className="font-semibold text-base md:text-lg mb-1.5 text-foreground"
                    data-testid={`resource-title-${r.id}`}
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
                      className="mt-1.5 text-xs font-semibold hover:underline"
                      style={{ color: "#C0392B" }}
                      data-testid={`resource-toggle-${r.id}`}
                    >
                      {isExpanded ? "Show less" : "Read more..."}
                    </button>
                  )}
                </div>
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
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
