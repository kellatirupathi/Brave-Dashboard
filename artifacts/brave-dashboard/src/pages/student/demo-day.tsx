import { useGetTeamDashboardSummary } from "@workspace/api-client-react";
import { useQuery } from "@tanstack/react-query";
import { formatINR } from "@/lib/format";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import { Progress } from "@/components/ui/progress";
import { CheckCircle, Lock, Award, Trophy } from "lucide-react";
import {
  getStudentGritConfig,
  computeGritProgress,
  DEFAULT_GRIT_LEVELS,
} from "@/lib/grit-config-api";

export default function GritMiles() {
  const { data: summary, isLoading } = useGetTeamDashboardSummary();
  const { data: gritConfig } = useQuery({
    queryKey: ["student-grit-config"],
    queryFn: getStudentGritConfig,
  });

  if (isLoading)
    return (
      <div className="flex h-64 items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  if (!summary) return <div>Failed to load data</div>;

  const revenue = summary.totalRevenue ?? 0;
  const levels = gritConfig?.levels?.length
    ? gritConfig.levels
    : DEFAULT_GRIT_LEVELS;
  const grit = computeGritProgress(revenue, levels);

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div className="mobile-page-heading">
        <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
          <Award className="w-7 h-7 text-amber-500" /> GRIT Miles
        </h1>
        <p className="text-muted-foreground mt-1">
          Climb the levels by growing your verified revenue and unlock GRIT
          Miles rewards.
        </p>
      </div>

      {grit.nextLevel ? (
        <Card className="border-amber-500/40 bg-amber-500/5">
          <CardContent className="p-5 flex items-center gap-3">
            <Trophy className="w-8 h-8 text-amber-600 shrink-0" />
            <div>
              <p className="font-semibold">
                {formatINR(grit.revenueToNext)} more required to unlock{" "}
                {grit.nextLevel.miles} GRIT Miles
              </p>
              <p className="text-sm text-muted-foreground">
                You're at Level {grit.currentLevel} · {formatINR(revenue)}{" "}
                verified so far.
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card className="border-green-500/50 bg-green-500/5">
          <CardContent className="p-5 flex items-center gap-3">
            <Trophy className="w-8 h-8 text-green-600 shrink-0" />
            <div>
              <p className="font-semibold">
                You've unlocked every GRIT Miles reward!
              </p>
              <p className="text-sm text-muted-foreground">
                Verified revenue so far: {formatINR(revenue)}
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Level ladder. Each level unlocks once the previous is cleared. */}
      <div className="grid gap-4">
        {levels.map((level, idx) => {
          const cleared = revenue >= level.revenueTarget;
          const prevTarget = idx > 0 ? levels[idx - 1].revenueTarget : 0;
          const prevCleared = idx === 0 || revenue >= prevTarget;
          const lockedBehindPrevious = !cleared && !prevCleared;
          const remaining = Math.max(level.revenueTarget - revenue, 0);
          const progressPercent = Math.min(
            (revenue / level.revenueTarget) * 100,
            100,
          );

          return (
            <Card
              key={level.level}
              className={
                cleared ? "border-green-500/50 bg-green-500/5" : "opacity-95"
              }
              data-testid={`grit-level-${level.level}`}
            >
              <CardHeader>
                <CardTitle className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-2">
                    {cleared ? (
                      <CheckCircle className="w-5 h-5 text-green-600" />
                    ) : (
                      <Lock className="w-5 h-5 text-muted-foreground" />
                    )}
                    Level {level.level}
                    <span className="text-sm font-normal text-muted-foreground">
                      · Target {formatINR(level.revenueTarget)} · {level.miles}{" "}
                      GRIT Miles
                      {level.reward ? ` · ${level.reward}` : ""}
                    </span>
                  </span>
                  {cleared ? (
                    <Badge className="bg-green-500 hover:bg-green-600">
                      <CheckCircle className="w-3 h-3 mr-1" /> Unlocked
                    </Badge>
                  ) : (
                    <Badge variant="secondary">
                      <Lock className="w-3 h-3 mr-1" /> Locked
                    </Badge>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {lockedBehindPrevious ? (
                  <p className="text-sm text-muted-foreground text-center">
                    Clear Level {idx} to unlock
                  </p>
                ) : (
                  <>
                    <div className="flex justify-between text-sm mb-2 font-medium">
                      <span>Verified Revenue: {formatINR(revenue)}</span>
                      <span>Target: {formatINR(level.revenueTarget)}</span>
                    </div>
                    <Progress value={progressPercent} className="h-3" />
                    <p className="text-sm text-muted-foreground mt-3 text-center">
                      {cleared
                        ? `Cleared! You unlocked ${level.miles} GRIT Miles.`
                        : `${formatINR(remaining)} more to unlock ${level.miles} GRIT Miles.`}
                    </p>
                  </>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
