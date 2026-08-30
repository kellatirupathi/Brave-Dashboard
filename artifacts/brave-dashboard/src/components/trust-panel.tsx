// Trust standing for a team: the tier, the score, the ledger, and the published
// rules that produced it.
//
// The rules table is shown in the same panel as the score on purpose. A team
// must be able to account for its own number without asking anyone — a score
// you cannot explain reads as arbitrary, and teams stop trying to influence it.
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ShieldCheck, ChevronDown, Minus, Plus } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";
import { formatDate } from "@/lib/format";
import { useSeason } from "@/lib/season-context";
import {
  getTrustRules,
  getTrustSummary,
  trustKeys,
  type TrustTier,
} from "@/lib/trust-api";

const TIER_TONE: Record<TrustTier, string> = {
  gold: "border-amber-300 bg-amber-50 text-amber-900",
  silver: "border-slate-300 bg-slate-50 text-slate-800",
  bronze: "border-orange-200 bg-orange-50 text-orange-900",
  watch: "border-rose-300 bg-rose-50 text-rose-900",
};

export function TrustPanel({ teamId }: { teamId?: number }) {
  const { viewingId: seasonId } = useSeason();
  const [showRules, setShowRules] = useState(false);

  const summary = useQuery({
    queryKey: trustKeys.summary(seasonId, teamId),
    queryFn: () => getTrustSummary(teamId),
  });
  const rules = useQuery({
    queryKey: trustKeys.rules(),
    queryFn: () => getTrustRules(),
    enabled: showRules,
    staleTime: Infinity,
  });

  if (summary.isLoading) {
    return (
      <Card className="flex justify-center p-8">
        <Spinner />
      </Card>
    );
  }
  // A team with no events yet is not an error — say so plainly rather than
  // showing a broken panel.
  if (summary.isError || !summary.data) {
    return (
      <Card className="p-5 text-sm text-muted-foreground">
        Trust standing is not available yet.
      </Card>
    );
  }

  const d = summary.data;
  const earned = d.events.filter((e) => e.points > 0);
  const lost = d.events.filter((e) => e.points < 0);

  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-2.5">
          <ShieldCheck
            className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground"
            aria-hidden="true"
          />
          <div>
            <h2 className="font-semibold">Trust standing</h2>
            <p className="text-sm text-muted-foreground">{d.tierMeaning}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className={cn("text-sm", TIER_TONE[d.tier])}>
            {d.tierLabel}
          </Badge>
          <span className="font-mono text-lg font-semibold tabular-nums">
            {d.score}
          </span>
        </div>
      </div>

      {d.eventCount === 0 ? (
        <p className="mt-4 text-sm text-muted-foreground">
          Nothing on your ledger yet. Trust builds as your revenue is verified
          and your clients confirm their payments — every team starts here.
        </p>
      ) : (
        <>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div className="rounded-md border p-3">
              <p className="text-xs text-muted-foreground">Earned</p>
              <p className="font-mono text-base font-semibold tabular-nums text-emerald-700">
                +{earned.reduce((n, e) => n + e.points, 0)}
              </p>
              <p className="text-xs text-muted-foreground">
                {earned.length} event{earned.length === 1 ? "" : "s"}
              </p>
            </div>
            <div className="rounded-md border p-3">
              <p className="text-xs text-muted-foreground">Lost</p>
              <p className="font-mono text-base font-semibold tabular-nums text-rose-700">
                {lost.reduce((n, e) => n + e.points, 0) || 0}
              </p>
              <p className="text-xs text-muted-foreground">
                {lost.length} event{lost.length === 1 ? "" : "s"}
              </p>
            </div>
          </div>

          <ul className="mt-4 divide-y">
            {d.events.map((e) => (
              <li
                key={e.id}
                className="flex items-start justify-between gap-3 py-2.5 text-sm"
              >
                <div className="min-w-0">
                  <p>{e.label}</p>
                  {e.reason ? (
                    <p className="text-xs text-muted-foreground">{e.reason}</p>
                  ) : null}
                  <p className="text-xs text-muted-foreground">
                    {formatDate(e.createdAt)}
                  </p>
                </div>
                <span
                  className={cn(
                    "shrink-0 font-mono font-semibold tabular-nums",
                    e.points > 0 ? "text-emerald-700" : "text-rose-700",
                  )}
                >
                  {e.points > 0 ? `+${e.points}` : e.points}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}

      <div className="mt-4 border-t pt-3">
        <Button
          variant="ghost"
          size="sm"
          className="-ml-2"
          onClick={() => setShowRules((v) => !v)}
          aria-expanded={showRules}
        >
          <ChevronDown
            className={cn(
              "mr-1.5 h-3.5 w-3.5 transition-transform",
              showRules && "rotate-180",
            )}
            aria-hidden="true"
          />
          How trust is scored
        </Button>

        {showRules ? (
          rules.isLoading ? (
            <div className="flex justify-center py-6">
              <Spinner />
            </div>
          ) : rules.data ? (
            <div className="mt-3 space-y-4">
              <ul className="space-y-2">
                {rules.data.rules
                  .filter((r) => r.kind !== "manual_adjustment")
                  .sort((a, b) => b.points - a.points)
                  .map((r) => (
                    <li key={r.kind} className="flex items-start gap-2.5 text-sm">
                      <span
                        className={cn(
                          "mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full",
                          r.points > 0
                            ? "bg-emerald-100 text-emerald-700"
                            : "bg-rose-100 text-rose-700",
                        )}
                      >
                        {r.points > 0 ? (
                          <Plus className="h-2.5 w-2.5" aria-hidden="true" />
                        ) : (
                          <Minus className="h-2.5 w-2.5" aria-hidden="true" />
                        )}
                      </span>
                      <div>
                        <p>
                          {r.label}{" "}
                          <span className="font-mono text-xs tabular-nums text-muted-foreground">
                            {r.points > 0 ? `+${r.points}` : r.points}
                          </span>
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {r.rationale}
                        </p>
                      </div>
                    </li>
                  ))}
              </ul>

              <div className="rounded-md bg-muted/40 p-3">
                <p className="text-xs font-medium text-muted-foreground">
                  Tiers
                </p>
                <ul className="mt-1.5 space-y-1 text-sm">
                  <li>
                    <span className="font-medium">
                      {rules.data.watch.label}
                    </span>{" "}
                    <span className="text-muted-foreground">
                      — below zero. {rules.data.watch.meaning}
                    </span>
                  </li>
                  {rules.data.tiers.map((t) => (
                    <li key={t.tier}>
                      <span className="font-medium">{t.label}</span>{" "}
                      <span className="text-muted-foreground">
                        — from {t.floor}. {t.meaning}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          ) : (
            <p className="mt-3 text-sm text-muted-foreground">
              Could not load the rules just now.
            </p>
          )
        ) : null}
      </div>
    </Card>
  );
}
