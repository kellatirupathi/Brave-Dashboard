import { useMemo, useState } from "react";
import { useListFeedback } from "@workspace/api-client-react";
import { Star, MessageSquare, Search } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";

function StarRow({ rating }: { rating: number }) {
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((n) => (
        <Star
          key={n}
          className={cn(
            "h-4 w-4",
            n <= rating
              ? "fill-yellow-400 text-yellow-400"
              : "text-muted-foreground/30",
          )}
        />
      ))}
    </div>
  );
}

export default function AdminFeedback() {
  const { data, isLoading, error } = useListFeedback();
  const [query, setQuery] = useState("");
  const [ratingFilter, setRatingFilter] = useState<number | null>(null);

  const filtered = useMemo(() => {
    if (!data) return [];
    const q = query.trim().toLowerCase();
    return data.filter((f) => {
      if (ratingFilter && f.rating !== ratingFilter) return false;
      if (!q) return true;
      return (
        f.userName.toLowerCase().includes(q) ||
        f.userEmail.toLowerCase().includes(q) ||
        (f.niatId ?? "").toLowerCase().includes(q) ||
        (f.comments ?? "").toLowerCase().includes(q)
      );
    });
  }, [data, query, ratingFilter]);

  const stats = useMemo(() => {
    if (!data || data.length === 0) {
      return { total: 0, avg: 0, byRating: [0, 0, 0, 0, 0] };
    }
    const byRating = [0, 0, 0, 0, 0];
    let sum = 0;
    for (const f of data) {
      sum += f.rating;
      if (f.rating >= 1 && f.rating <= 5) byRating[f.rating - 1]++;
    }
    return {
      total: data.length,
      avg: sum / data.length,
      byRating,
    };
  }, [data]);

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <MessageSquare className="h-6 w-6 text-primary" />
          Platform Feedback
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Submitted feedback from students, coordinators, and admins. This page
          is hidden from the sidebar.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Total submissions</CardDescription>
            <CardTitle className="text-3xl">{stats.total}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Average rating</CardDescription>
            <CardTitle className="text-3xl">
              {stats.avg.toFixed(2)}{" "}
              <span className="text-base text-muted-foreground font-normal">
                / 5
              </span>
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Distribution</CardDescription>
            <div className="space-y-1 mt-2">
              {[5, 4, 3, 2, 1].map((r) => {
                const count = stats.byRating[r - 1];
                const pct = stats.total ? (count / stats.total) * 100 : 0;
                return (
                  <div key={r} className="flex items-center gap-2 text-xs">
                    <span className="w-6 tabular-nums">{r}★</span>
                    <div className="flex-1 h-2 bg-muted rounded overflow-hidden">
                      <div
                        className="h-full bg-yellow-400"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <span className="w-8 text-right tabular-nums text-muted-foreground">
                      {count}
                    </span>
                  </div>
                );
              })}
            </div>
          </CardHeader>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>All feedback</CardTitle>
          <CardDescription>
            {filtered.length} of {data?.length ?? 0} entries shown
          </CardDescription>
          <div className="flex flex-col sm:flex-row gap-2 pt-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by name, email, NIAT ID or comment..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="pl-9"
                data-testid="feedback-search"
              />
            </div>
            <div className="flex gap-1">
              <button
                type="button"
                onClick={() => setRatingFilter(null)}
                className={cn(
                  "px-3 py-1.5 text-xs rounded-md border transition-colors",
                  ratingFilter === null
                    ? "bg-primary text-primary-foreground border-primary"
                    : "hover:bg-accent",
                )}
              >
                All
              </button>
              {[5, 4, 3, 2, 1].map((r) => (
                <button
                  type="button"
                  key={r}
                  onClick={() => setRatingFilter(r)}
                  className={cn(
                    "px-3 py-1.5 text-xs rounded-md border transition-colors",
                    ratingFilter === r
                      ? "bg-primary text-primary-foreground border-primary"
                      : "hover:bg-accent",
                  )}
                >
                  {r}★
                </button>
              ))}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading && (
            <div className="flex justify-center py-12">
              <Spinner className="size-8" />
            </div>
          )}
          {error && (
            <div className="text-sm text-destructive py-6 text-center">
              Failed to load feedback. Please try again.
            </div>
          )}
          {!isLoading && !error && filtered.length === 0 && (
            <div className="text-sm text-muted-foreground py-12 text-center">
              No feedback submissions yet.
            </div>
          )}
          {!isLoading && filtered.length > 0 && (
            <div className="space-y-3">
              {filtered.map((f) => (
                <div
                  key={f.id}
                  className="border rounded-lg p-4 hover:bg-accent/30 transition-colors"
                  data-testid={`feedback-row-${f.id}`}
                >
                  <div className="flex flex-wrap items-start justify-between gap-2 mb-2">
                    <div>
                      <div className="font-medium text-sm">{f.userName}</div>
                      <div className="text-xs text-muted-foreground flex flex-wrap gap-x-2">
                        <span>{f.userEmail}</span>
                        {f.niatId && (
                          <>
                            <span>•</span>
                            <span>NIAT: {f.niatId}</span>
                          </>
                        )}
                        <Badge variant="outline" className="capitalize text-xs">
                          {f.userRole}
                        </Badge>
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <StarRow rating={f.rating} />
                      <span className="text-xs text-muted-foreground">
                        {new Date(f.createdAt).toLocaleString()}
                      </span>
                    </div>
                  </div>
                  {f.comments && (
                    <p className="text-sm text-foreground/90 whitespace-pre-wrap mt-2 pl-1 border-l-2 border-primary/30 pl-3">
                      {f.comments}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
