import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import {
  BookOpenCheck,
  Flame,
  Clock,
  Calendar,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";
import { getProgressSummary } from "@/lib/progress-api";

function daysAgo(iso: string): number {
  return Math.max(
    0,
    Math.floor((Date.now() - new Date(iso).getTime()) / (1000 * 60 * 60 * 24)),
  );
}

function relativeFromIso(iso: string | null): string {
  if (!iso) return "Never";
  const d = daysAgo(iso);
  if (d === 0) return "Today";
  if (d === 1) return "Yesterday";
  return `${d} days ago`;
}

function journalHealth(
  iso: string | null,
  submittedThisWeek: boolean,
): {
  tone: "good" | "warn" | "bad";
  label: string;
} {
  if (submittedThisWeek) return { tone: "good", label: "On track" };
  if (!iso) return { tone: "bad", label: "Never submitted" };
  const d = daysAgo(iso);
  if (d <= 7) return { tone: "warn", label: "Catch up this week" };
  return { tone: "bad", label: "Falling behind" };
}

function toneClasses(tone: "good" | "warn" | "bad"): {
  badge: string;
  ring: string;
} {
  switch (tone) {
    case "good":
      return {
        badge: "bg-emerald-100 text-emerald-700 hover:bg-emerald-100",
        ring: "ring-emerald-200",
      };
    case "warn":
      return {
        badge: "bg-amber-100 text-amber-700 hover:bg-amber-100",
        ring: "ring-amber-200",
      };
    case "bad":
      return {
        badge: "bg-red-100 text-red-700 hover:bg-red-100",
        ring: "ring-red-200",
      };
  }
}

export function ProgressWidgets() {
  const { data, isLoading } = useQuery({
    queryKey: ["progress-summary"],
    queryFn: getProgressSummary,
  });

  if (isLoading) {
    return (
      <div className="flex justify-center py-8">
        <Spinner className="size-6" />
      </div>
    );
  }
  if (!data) return null;

  const journalTone = journalHealth(
    data.journal.lastJournalAt,
    data.journal.submittedThisWeek,
  );

  return (
    <div className="grid gap-4 md:grid-cols-3">
      {/* Card 1: Weekly Journal Status */}
      <Card className={cn("ring-1", toneClasses(journalTone.tone).ring)}>
        <CardContent className="p-5">
          <div className="flex items-start justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-md bg-primary/10 text-primary">
                <BookOpenCheck className="w-4 h-4" />
              </div>
              <span className="text-xs uppercase tracking-wide text-muted-foreground font-semibold">
                Weekly Journal
              </span>
            </div>
            {data.journal.submittedThisWeek ? (
              <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100">
                <CheckCircle2 className="w-3 h-3 mr-1" />
                Submitted
              </Badge>
            ) : (
              <Badge className="bg-amber-100 text-amber-700 hover:bg-amber-100">
                Pending
              </Badge>
            )}
          </div>
          <div className="text-sm text-muted-foreground flex items-center gap-1 mb-2">
            <Calendar className="w-3.5 h-3.5" />
            {data.journal.weekStart} → {data.journal.weekEnd}
          </div>
          <p className="text-sm mb-4">
            {data.journal.submittedThisWeek
              ? "Nice — you're covered for this week."
              : "Submit a short 3-field journal by Sunday EOD to stay on track."}
          </p>
          <Button
            asChild
            size="sm"
            variant={data.journal.submittedThisWeek ? "outline" : "default"}
            data-testid="widget-journal-cta"
          >
            <Link href="/journal">
              {data.journal.submittedThisWeek
                ? "View / edit"
                : "Submit journal"}
            </Link>
          </Button>
        </CardContent>
      </Card>

      {/* Card 2: Journal Streak (consecutive weeks submitted) */}
      <Card>
        <CardContent className="p-5">
          <div className="flex items-start justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-md bg-orange-100 text-orange-600">
                <Flame className="w-4 h-4" />
              </div>
              <span className="text-xs uppercase tracking-wide text-muted-foreground font-semibold">
                Journal streak
              </span>
            </div>
          </div>
          <div className="flex items-baseline gap-2 mb-2">
            <span
              className={cn(
                "text-4xl font-bold",
                data.streak === 0
                  ? "text-muted-foreground"
                  : data.streak >= 4
                    ? "text-orange-600"
                    : "text-foreground",
              )}
              data-testid="widget-streak-count"
            >
              {data.streak}
            </span>
            <span className="text-sm text-muted-foreground">
              week{data.streak === 1 ? "" : "s"} in a row
            </span>
          </div>
          <p className="text-sm text-muted-foreground mb-4">
            {data.streak === 0
              ? "Submit this week's journal to start a streak."
              : data.streak >= 4
                ? "Consistent. This is what coordinators look for."
                : "Keep going — submit again this Sunday to extend the streak."}
          </p>
          <Button
            asChild
            size="sm"
            variant="outline"
            data-testid="widget-streak-cta"
          >
            <Link href="/journal">Open journal</Link>
          </Button>
        </CardContent>
      </Card>

      {/* Card 3: Last journal indicator */}
      <Card>
        <CardContent className="p-5">
          <div className="flex items-start justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-md bg-primary/10 text-primary">
                <Clock className="w-4 h-4" />
              </div>
              <span className="text-xs uppercase tracking-wide text-muted-foreground font-semibold">
                Recent activity
              </span>
            </div>
          </div>
          <div className="space-y-3">
            <div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Last journal</span>
                <Badge className={toneClasses(journalTone.tone).badge}>
                  {journalTone.tone === "bad" && (
                    <AlertCircle className="w-3 h-3 mr-1" />
                  )}
                  {data.journal.submittedThisWeek
                    ? "This week"
                    : relativeFromIso(data.journal.lastJournalAt)}
                </Badge>
              </div>
            </div>
            <div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Status</span>
                <Badge className={toneClasses(journalTone.tone).badge}>
                  {journalTone.label}
                </Badge>
              </div>
            </div>
            <div className="pt-2 text-xs text-muted-foreground">
              {data.totalJournals} journal{data.totalJournals === 1 ? "" : "s"}{" "}
              submitted in total
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
