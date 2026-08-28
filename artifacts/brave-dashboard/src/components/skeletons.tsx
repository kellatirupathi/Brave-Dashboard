// Loading skeletons (additive, isolated).
//
// A spinner says "wait"; a skeleton says "here is what is arriving". Apps use
// the latter because the screen keeps its shape — nothing jumps when the data
// lands, and the wait feels shorter because there is something to read.
//
// Native only. On the web a spinner is conventional and the pages already use
// one, so these render null there rather than changing familiar behaviour.
//
// Deleting this file means reverting the two isLoading branches that use it.
import { isNativeApp } from "@/lib/native-auth";

/** One grey bar. Width is a percentage so rows look naturally ragged. */
function Bar({ w = "100%", h = "0.875rem" }: { w?: string; h?: string }) {
  return <div className="skeleton" style={{ width: w, height: h }} />;
}

/**
 * Stand-in for a list of cards — leads, projects, journals. Three rows is
 * enough to fill a phone screen without implying a specific count.
 */
export function ListSkeleton({ rows = 3 }: { rows?: number }) {
  if (!isNativeApp()) return null;
  return (
    <div className="space-y-3" data-testid="skeleton-list" aria-hidden="true">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="rounded-2xl border bg-card p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1 space-y-2">
              <Bar w="55%" h="1rem" />
              <Bar w="35%" />
            </div>
            <Bar w="4rem" h="1.25rem" />
          </div>
          <div className="mt-3 space-y-2">
            <Bar w="90%" />
            <Bar w="70%" />
          </div>
        </div>
      ))}
    </div>
  );
}

/** Stand-in for the four-up KPI strip on the dashboard. */
export function StatsSkeleton() {
  if (!isNativeApp()) return null;
  return (
    <div
      className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border bg-border"
      data-testid="skeleton-stats"
      aria-hidden="true"
    >
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="space-y-3 bg-card p-4">
          <Bar w="60%" h="0.75rem" />
          <Bar w="80%" h="1.5rem" />
          <Bar w="70%" h="0.75rem" />
        </div>
      ))}
    </div>
  );
}
