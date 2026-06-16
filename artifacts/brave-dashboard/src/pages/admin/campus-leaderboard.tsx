import { useState } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { customFetch } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { formatINR } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Trophy, Search, ArrowLeft } from "lucide-react";

type CampusRow = {
  rank: number;
  id: number;
  name: string;
  city: string;
  state: string;
  totalTeams: number;
  activeTeams: number;
  totalRevenue: number;
};

export default function AdminCampusLeaderboard() {
  const [q, setQ] = useState("");
  const { data, isLoading, isError } = useQuery<{ campuses: CampusRow[] }>({
    queryKey: ["admin-campus-leaderboard"],
    queryFn: () =>
      customFetch<{ campuses: CampusRow[] }>("/api/admin/campus-leaderboard"),
  });

  const campuses = data?.campuses ?? [];
  const term = q.trim().toLowerCase();
  const filtered = term
    ? campuses.filter(
        (c) =>
          c.name.toLowerCase().includes(term) ||
          (c.city ?? "").toLowerCase().includes(term) ||
          (c.state ?? "").toLowerCase().includes(term),
      )
    : campuses;

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <Link
        href="/admin"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        data-testid="link-back-dashboard"
      >
        <ArrowLeft className="h-4 w-4" /> Back to dashboard
      </Link>

      <div className="flex items-center gap-3">
        <div className="rounded-lg bg-primary/10 p-2">
          <Trophy className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Campus Leaderboard
          </h1>
          <p className="text-sm text-muted-foreground">
            All campuses ranked by verified revenue.
          </p>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search campus, city or state"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              className="pl-9"
              data-testid="campus-leaderboard-search"
            />
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center py-12">
              <Spinner />
            </div>
          ) : isError ? (
            <p className="py-10 text-center text-sm text-destructive">
              Failed to load the campus leaderboard.
            </p>
          ) : filtered.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">
              {campuses.length === 0
                ? "No campuses yet."
                : "No campuses match your search."}
            </p>
          ) : (
            <div className="space-y-1">
              {filtered.map((c) => (
                <Link
                  key={c.id}
                  href={`/admin/campuses/${c.id}`}
                  className="-mx-2 flex items-center justify-between rounded-md p-2 transition-colors hover:bg-muted/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  data-testid={`link-campus-${c.id}`}
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <div
                      className={cn(
                        "flex h-9 w-9 shrink-0 items-center justify-center rounded text-sm font-bold",
                        c.rank <= 3
                          ? "bg-primary/15 text-primary"
                          : "bg-muted text-muted-foreground",
                      )}
                    >
                      #{c.rank}
                    </div>
                    <div className="min-w-0">
                      <p className="truncate font-semibold">{c.name}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {c.activeTeams} active · {c.totalTeams} team
                        {c.totalTeams === 1 ? "" : "s"}
                        {c.city ? ` · ${c.city}` : ""}
                      </p>
                    </div>
                  </div>
                  <div className="shrink-0 pl-3 font-bold">
                    {formatINR(c.totalRevenue)}
                  </div>
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
