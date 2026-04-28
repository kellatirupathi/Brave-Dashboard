import { Link } from "wouter";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Bell } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

type ItemColor = "amber" | "orange" | "violet" | "rose";
type Severity = "ok" | "warn" | "danger";

const HOUR = 60 * 60 * 1000;

function severityFromAge(oldestAt: string | null, count: number): Severity {
  if (count === 0 || !oldestAt) return "ok";
  const ageMs = Date.now() - new Date(oldestAt).getTime();
  if (ageMs >= 48 * HOUR) return "danger";
  if (ageMs >= 24 * HOUR) return "warn";
  return "ok";
}

function dotClass(color: ItemColor, severity: Severity): string {
  if (severity === "danger") return "bg-destructive";
  if (severity === "warn") return "bg-amber-500";
  switch (color) {
    case "amber":
      return "bg-amber-400";
    case "orange":
      return "bg-orange-400";
    case "violet":
      return "bg-violet-400";
    case "rose":
      return "bg-rose-400";
  }
}

function ageLabel(oldestAt: string | null, count: number): string | null {
  if (count === 0 || !oldestAt) return null;
  return `oldest ${formatDistanceToNow(new Date(oldestAt), { addSuffix: false })}`;
}

interface ActionItem {
  key: string;
  label: string;
  count: number;
  oldestAt: string | null;
  href: string;
  color: ItemColor;
}

interface ActionCenterProps {
  items: ActionItem[];
}

export function ActionCenter({ items }: ActionCenterProps) {
  const totalPending = items.reduce((sum, it) => sum + it.count, 0);

  return (
    <Card data-testid="card-action-center">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Bell className="w-4 h-4" />
          <span>Action Center</span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {totalPending === 0 ? (
          <p
            className="text-sm text-muted-foreground py-8 text-center"
            data-testid="text-action-center-empty"
          >
            All clear — no pending decisions right now.
          </p>
        ) : (
          <ul className="divide-y">
            {items.map((item) => {
              const severity = severityFromAge(item.oldestAt, item.count);
              const isMuted = item.count === 0;
              const age = ageLabel(item.oldestAt, item.count);
              return (
                <li
                  key={item.key}
                  className="flex items-center gap-3 py-3"
                  data-testid={`row-action-${item.key}`}
                >
                  <span
                    className={`inline-block w-2.5 h-2.5 rounded-full shrink-0 ${dotClass(item.color, severity)} ${isMuted ? "opacity-40" : ""}`}
                    aria-hidden="true"
                  />
                  <div className="flex-1 min-w-0">
                    <div
                      className={`text-sm font-medium truncate ${isMuted ? "text-muted-foreground" : ""}`}
                    >
                      {item.label}
                    </div>
                    {age && (
                      <div
                        className={`text-xs mt-0.5 ${
                          severity === "danger"
                            ? "text-destructive font-medium"
                            : severity === "warn"
                              ? "text-amber-600 dark:text-amber-500"
                              : "text-muted-foreground"
                        }`}
                        data-testid={`text-age-${item.key}`}
                      >
                        {age}
                      </div>
                    )}
                  </div>
                  <div
                    className={`text-xl font-bold tabular-nums ${isMuted ? "text-muted-foreground" : ""}`}
                    data-testid={`text-count-${item.key}`}
                  >
                    {item.count}
                  </div>
                  {isMuted ? (
                    <span
                      className="text-xs text-muted-foreground px-3"
                      data-testid={`text-clear-${item.key}`}
                    >
                      All clear
                    </span>
                  ) : (
                    <Button
                      asChild
                      size="sm"
                      variant="outline"
                      data-testid={`button-review-${item.key}`}
                    >
                      <Link href={item.href}>Review</Link>
                    </Button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
