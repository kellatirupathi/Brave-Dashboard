import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  BarChart3,
  Globe2,
  History,
  Percent,
  Smartphone,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import {
  getUserStats,
  type UserStats,
  type UserStatsPathRow,
} from "@/lib/page-views-api";

const RANGE_OPTIONS = [7, 30, 90] as const;
type RangeDays = (typeof RANGE_OPTIONS)[number];

function formatDate(value: string | null): string {
  if (!value) return "No app or web tracking data yet";
  return new Date(value).toLocaleDateString("en-IN", {
    year: "numeric",
    month: "short",
    day: "2-digit",
  });
}

function StatTile({
  label,
  value,
  detail,
  icon: Icon,
}: {
  label: string;
  value: string;
  detail: string;
  icon: typeof Smartphone;
}) {
  return (
    <div className="rounded-lg border bg-background p-4">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Icon className="h-4 w-4 text-primary" aria-hidden="true" />
        {label}
      </div>
      <p className="mt-2 text-2xl font-bold tabular-nums">{value}</p>
      <p className="mt-1 text-xs text-muted-foreground">{detail}</p>
    </div>
  );
}

function PathTable({ rows }: { rows: UserStatsPathRow[] }) {
  if (rows.length === 0) {
    return (
      <div className="p-8 text-center text-sm text-muted-foreground">
        No page views recorded for this date range.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="border-b bg-muted/20 text-left">
          <tr>
            <th className="px-4 py-3 font-medium">Screen</th>
            <th className="px-4 py-3 text-right font-medium">App</th>
            <th className="px-4 py-3 text-right font-medium">Web</th>
            <th className="px-4 py-3 text-right font-medium">Total</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {rows.map((row) => (
            <tr key={row.path} data-testid={`user-stats-path-${row.path}`}>
              <td className="max-w-[420px] px-4 py-3">
                <div className="truncate font-mono text-xs">{row.path}</div>
              </td>
              <td className="px-4 py-3 text-right tabular-nums">
                {row.appViews.toLocaleString()}
              </td>
              <td className="px-4 py-3 text-right tabular-nums">
                {row.webViews.toLocaleString()}
              </td>
              <td className="px-4 py-3 text-right font-semibold tabular-nums">
                {row.totalViews.toLocaleString()}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function UserStatsCard() {
  const [days, setDays] = useState<RangeDays>(30);
  const { data, isError, isLoading } = useQuery<UserStats>({
    queryKey: ["admin-user-stats", days],
    queryFn: () => getUserStats(days),
  });

  return (
    <Card data-testid="card-user-stats">
      <CardHeader className="border-b">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5 text-primary" />
              User Stats
            </CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              Compare dashboard usage between the BRAVE app and web.
            </p>
          </div>
          <div
            className="inline-flex w-fit rounded-md border bg-muted/40 p-1"
            aria-label="Usage date range"
          >
            {RANGE_OPTIONS.map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setDays(option)}
                className={`rounded px-3 py-1.5 text-xs font-medium transition-colors ${
                  days === option
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
                data-testid={`user-stats-range-${option}`}
              >
                {option} days
              </button>
            ))}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-5 p-4 sm:p-6">
        {isLoading ? (
          <div className="flex h-48 items-center justify-center">
            <Spinner size="lg" />
          </div>
        ) : isError || !data ? (
          <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-6 text-center text-sm text-destructive">
            Unable to load user stats. Please try again.
          </div>
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <StatTile
                label="App users"
                value={data.appUsers.toLocaleString()}
                detail={`Unique users in the last ${days} days`}
                icon={Smartphone}
              />
              <StatTile
                label="Web users"
                value={data.webUsers.toLocaleString()}
                detail={`Unique users in the last ${days} days`}
                icon={Globe2}
              />
              <StatTile
                label="App share"
                value={`${data.appShare.toFixed(1)}%`}
                detail="Of known app and web page views"
                icon={Percent}
              />
              <StatTile
                label="Ever opened the app"
                value={data.everOpenedApp.toLocaleString()}
                detail="Unique app users, all time"
                icon={History}
              />
            </div>

            <div className="rounded-lg border bg-muted/20 px-4 py-3 text-sm">
              <span className="font-medium">Tracking since:</span>{" "}
              <span className="text-muted-foreground">
                {formatDate(data.trackingSince)}
              </span>
            </div>

            <div className="overflow-hidden rounded-lg border">
              <div className="border-b bg-muted/20 px-4 py-3">
                <h3 className="font-semibold">Usage by screen</h3>
                <p className="mt-1 text-xs text-muted-foreground">
                  Page views for the selected {days}-day range, sorted by total.
                </p>
              </div>
              <PathTable rows={data.perPath} />
            </div>

            <p className="text-xs text-muted-foreground">
              Installations cannot be measured from the dashboard. “Ever opened
              the app” counts users who have opened the native app at least once.
              Older page views without a platform value remain unknown.
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}