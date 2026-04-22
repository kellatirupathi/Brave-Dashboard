import { useGetTeamDashboardSummary } from "@workspace/api-client-react";
import { formatINR } from "@/lib/format";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import { Progress } from "@/components/ui/progress";
import { CheckCircle, Lock, Trophy } from "lucide-react";

type Level = {
  num: 1 | 2 | 3;
  threshold: number;
  title: string;
  unlockedMessage: string;
  lockedMessage: string;
};

const LEVELS: Level[] = [
  {
    num: 1,
    threshold: 200000,
    title: "Level 1",
    unlockedMessage: "Congratulations! You have cleared Level 1.",
    lockedMessage: "Cross ₹2,00,000 in verified revenue to clear Level 1.",
  },
  {
    num: 2,
    threshold: 500000,
    title: "Level 2",
    unlockedMessage: "Congratulations! You have cleared Level 2.",
    lockedMessage: "Generate more revenue to unlock Level 2.",
  },
  {
    num: 3,
    threshold: 2000000,
    title: "Level 3",
    unlockedMessage: "Congratulations! You have cleared Level 3.",
    lockedMessage: "Generate more revenue to unlock Level 3.",
  },
];

export default function DemoDay() {
  const { data: summary, isLoading } = useGetTeamDashboardSummary();

  if (isLoading)
    return (
      <div className="flex h-64 items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  if (!summary) return <div>Failed to load data</div>;

  const revenue = summary.totalRevenue ?? 0;
  const highestCleared = LEVELS.filter((l) => revenue >= l.threshold).pop();

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Demo Day</h1>
        <p className="text-muted-foreground mt-1">
          Climb the levels by growing your verified revenue.
        </p>
      </div>

      {highestCleared && (
        <Card className="border-green-500/50 bg-green-500/5">
          <CardContent className="p-5 flex items-center gap-3">
            <Trophy className="w-8 h-8 text-green-600 shrink-0" />
            <div>
              <p className="font-semibold">
                {highestCleared.unlockedMessage}
              </p>
              <p className="text-sm text-muted-foreground">
                Verified revenue so far: {formatINR(revenue)}
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4">
        {LEVELS.map((level) => {
          const cleared = revenue >= level.threshold;
          const remaining = Math.max(level.threshold - revenue, 0);
          const progressPercent = Math.min(
            (revenue / level.threshold) * 100,
            100,
          );

          return (
            <Card
              key={level.num}
              className={
                cleared ? "border-green-500/50 bg-green-500/5" : "opacity-95"
              }
              data-testid={`level-${level.num}`}
            >
              <CardHeader>
                <CardTitle className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-2">
                    {cleared ? (
                      <CheckCircle className="w-5 h-5 text-green-600" />
                    ) : (
                      <Lock className="w-5 h-5 text-muted-foreground" />
                    )}
                    {level.title}
                    <span className="text-sm font-normal text-muted-foreground">
                      · Target {formatINR(level.threshold)}
                    </span>
                  </span>
                  {cleared ? (
                    <Badge className="bg-green-500 hover:bg-green-600">
                      <CheckCircle className="w-3 h-3 mr-1" /> Cleared
                    </Badge>
                  ) : (
                    <Badge variant="secondary">
                      <Lock className="w-3 h-3 mr-1" /> Locked
                    </Badge>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex justify-between text-sm mb-2 font-medium">
                  <span>Verified Revenue: {formatINR(revenue)}</span>
                  <span>Target: {formatINR(level.threshold)}</span>
                </div>
                <Progress value={progressPercent} className="h-3" />
                <p className="text-sm text-muted-foreground mt-3 text-center">
                  {cleared
                    ? level.unlockedMessage
                    : remaining > 0
                      ? `${level.lockedMessage} ${formatINR(remaining)} to go.`
                      : level.lockedMessage}
                </p>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
