// Season switcher chip — sits in each role's dashboard top bar.
//
// Self-gating: renders nothing while the season list is loading, and nothing at
// all when there is only one season. So on a deployment that has never opened
// Season 2, this component is invisible and the dashboards look exactly as they
// did before.
//
// Switching swaps BOTH the sidebar menu set and every figure on screen in one
// action, because useSeason() drives the API header and drops the query cache.
import { useSeason } from "@/lib/season-context";
import { cn } from "@/lib/utils";

export function SeasonSwitcher({ className }: { className?: string }) {
  const { seasons, viewing, switchTo, isLoading } = useSeason();

  // Nothing useful to offer until we know the seasons, and nothing to switch
  // between when there is only one.
  if (isLoading || !viewing || seasons.length < 2) return null;

  const others = seasons.filter((s) => s.id !== viewing.id);

  return (
    <div
      data-testid="season-switcher"
      className={cn(
        "inline-flex items-center gap-1 rounded-full border border-border bg-card py-1 pl-3 pr-1 text-xs",
        className,
      )}
    >
      <span className="font-medium text-muted-foreground">
        Viewing {viewing.slug}
      </span>
      {others.map((s) => (
        <button
          key={s.id}
          type="button"
          onClick={() => switchTo(s.id)}
          title={
            s.isReadOnly
              ? `Switch to ${s.name} — read-only archive`
              : `Switch to ${s.name}`
          }
          data-testid={`season-switch-to-${s.slug}`}
          className={cn(
            "rounded-full px-2.5 py-1 text-[11px] font-bold tracking-wide transition-colors",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            // The live season is the emphasised destination; an archive reads
            // as the quieter option, matching the sidebar badge.
            s.isReadOnly
              ? "bg-muted text-muted-foreground hover:bg-muted/80"
              : "bg-primary text-primary-foreground hover:bg-primary/90",
          )}
        >
          {s.slug}
        </button>
      ))}
    </div>
  );
}
