import {
  useGetProgrammeConfig,
  useUpdateProgrammeConfig,
  getGetProgrammeConfigQueryKey,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Spinner } from "@/components/ui/spinner";
import {
  Settings,
  Calendar,
  Save,
  RotateCcw,
  AlertTriangle,
} from "lucide-react";
import { useState, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { ProgrammeWeeksManager } from "@/components/programme-weeks-manager";
import { ReminderSettingsCard } from "@/components/reminder-settings-card";
import { regenerateProgrammeWeeks } from "@/lib/progress-api";

export default function AdminConfig() {
  const { data: config, isLoading } = useGetProgrammeConfig();
  const updateConfig = useUpdateProgrammeConfig();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [formData, setFormData] = useState<any>({});
  const [devEnabled, setDevEnabled] = useState<boolean>(false);
  const [reseeding, setReseeding] = useState<boolean>(false);
  const [reseedResult, setReseedResult] = useState<
    | { ok: true; durationMs: number; at: number }
    | { ok: false; error: string; at: number }
    | null
  >(null);

  useEffect(() => {
    if (config) setFormData(config);
  }, [config]);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/dev/enabled")
      .then((r) => {
        if (!cancelled) setDevEnabled(r.ok);
      })
      .catch(() => {
        if (!cancelled) setDevEnabled(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleReseed = async () => {
    setReseeding(true);
    setReseedResult(null);
    try {
      const res = await fetch("/api/admin/dev/reseed", {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error || `Reseed failed (HTTP ${res.status})`);
      }
      const data = await res.json();
      setReseedResult({
        ok: true,
        durationMs: data.durationMs,
        at: Date.now(),
      });
      toast({
        title: "Demo data reset",
        description: `Re-seeded in ${(data.durationMs / 1000).toFixed(1)}s. Refresh other tabs to see new data.`,
        duration: 8000,
      });
      // Refresh data on this page (and any other live queries) so the user sees the new seed.
      queryClient.invalidateQueries();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setReseedResult({ ok: false, error: message, at: Date.now() });
      toast({
        title: "Reset failed",
        description: message,
        variant: "destructive",
        duration: 8000,
      });
    } finally {
      setReseeding(false);
    }
  };

  const handleChange = (field: string, value: any) => {
    setFormData((prev: any) => ({ ...prev, [field]: value }));
  };

  const handleSave = () => {
    // Detect whether the programme date range changed so we can auto-rebuild
    // programme_weeks afterwards. We compare the date strings (ignoring any
    // timestamp the API may have returned).
    const datesChanged =
      (config?.startDate ?? "").split("T")[0] !==
        (formData.startDate ?? "").split("T")[0] ||
      (config?.endDate ?? "").split("T")[0] !==
        (formData.endDate ?? "").split("T")[0];

    updateConfig.mutate(
      { data: formData },
      {
        onSuccess: async () => {
          toast({ title: "Configuration saved" });
          queryClient.invalidateQueries({
            queryKey: getGetProgrammeConfigQueryKey(),
          });
          if (datesChanged) {
            try {
              const result = await regenerateProgrammeWeeks();
              toast({
                title: "Programme weeks rebuilt",
                description: `${result.total} weeks · +${result.created} created · ${result.updated} updated · ${result.removed} removed`,
              });
              queryClient.invalidateQueries({
                queryKey: ["admin-programme-weeks"],
              });
            } catch (err) {
              const message = err instanceof Error ? err.message : String(err);
              toast({
                title: "Couldn't rebuild weeks",
                description: `${message}. Click "Regenerate from dates" in the Programme Weeks card.`,
                variant: "destructive",
              });
            }
          }
        },
      },
    );
  };

  if (isLoading)
    return (
      <div className="flex h-64 items-center justify-center">
        <Spinner size="lg" />
      </div>
    );

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">
          Programme Configuration
        </h1>
        <p className="text-muted-foreground">
          Manage global settings for the BRAVE programme
        </p>
      </div>

      {/* SECTION 1 — Programme schedule (saved by the bottom Save button) */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="w-5 h-5 text-primary" /> Key Dates & Deadlines
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Start Date</label>
              <Input
                type="date"
                value={formData.startDate?.split("T")[0] || ""}
                onChange={(e) => handleChange("startDate", e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">End Date</label>
              <Input
                type="date"
                value={formData.endDate?.split("T")[0] || ""}
                onChange={(e) => handleChange("endDate", e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Demo Day Date</label>
              <Input
                type="date"
                value={formData.demoDayDate?.split("T")[0] || ""}
                onChange={(e) => handleChange("demoDayDate", e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">
                Application Deadline
              </label>
              <Input
                type="date"
                value={formData.demoDayApplicationDeadline?.split("T")[0] || ""}
                onChange={(e) =>
                  handleChange("demoDayApplicationDeadline", e.target.value)
                }
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* SECTION 2 — Programme thresholds & visibility (saved by the bottom Save button) */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings className="w-5 h-5 text-primary" /> Thresholds & Toggles
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-2">
            <label className="text-sm font-medium">
              Demo Eligibility Threshold (₹)
            </label>
            <Input
              type="number"
              value={formData.demoEligibilityThreshold || ""}
              onChange={(e) =>
                handleChange("demoEligibilityThreshold", Number(e.target.value))
              }
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">
              Team Members Count Limit
            </label>
            <Input
              type="number"
              min={1}
              value={formData.teamMemberLimit ?? ""}
              onChange={(e) =>
                handleChange("teamMemberLimit", Number(e.target.value))
              }
              data-testid="input-team-member-limit"
            />
            <p className="text-xs text-muted-foreground">
              Maximum number of students allowed on a single team. New invites,
              join requests, and acceptances will be rejected once a team
              reaches this limit.
            </p>
          </div>

          <div className="flex items-center justify-between border p-4 rounded-lg">
            <div>
              <p className="font-medium">Leaderboard Frozen</p>
              <p className="text-sm text-muted-foreground">
                Hide the leaderboard from students to build suspense.
              </p>
            </div>
            <Switch
              checked={formData.leaderboardFrozen || false}
              onCheckedChange={(c) => handleChange("leaderboardFrozen", c)}
            />
          </div>

          <div className="flex items-center justify-between border p-4 rounded-lg">
            <div>
              <p className="font-medium">Demo Day Applications Open</p>
              <p className="text-sm text-muted-foreground">
                Allow eligible teams to submit their pitches.
              </p>
            </div>
            <Switch
              checked={formData.demoDayApplicationsOpen || false}
              onCheckedChange={(c) =>
                handleChange("demoDayApplicationsOpen", c)
              }
            />
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={updateConfig.isPending}>
          {updateConfig.isPending ? (
            <Spinner className="w-4 h-4 mr-2" />
          ) : (
            <Save className="w-4 h-4 mr-2" />
          )}
          Save Configuration
        </Button>
      </div>

      {/* SECTION 3 — Programme weeks (auto-saves per row, depends on dates above). */}
      <ProgrammeWeeksManager />

      {/* SECTION 4 — Reminder service master toggles (auto-saves per toggle). */}
      <ReminderSettingsCard />

      {devEnabled && (
        <Card
          className="border-amber-300/60 bg-amber-50/40 dark:bg-amber-950/10"
          data-testid="card-dev-tools"
        >
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-amber-900 dark:text-amber-200">
              <AlertTriangle className="w-5 h-5" /> Developer Tools
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-start justify-between gap-4 border border-amber-200 dark:border-amber-900/40 p-4 rounded-lg bg-background">
              <div className="space-y-1">
                <p className="font-medium">Reset demo data</p>
                <p className="text-sm text-muted-foreground">
                  Wipes all seeded users, teams, and entries (those tagged
                  <code className="mx-1 px-1 rounded bg-muted text-xs">
                    @brave.seed
                  </code>
                  ) and re-runs the canonical seed. Real users and their data
                  are not touched. This action is hidden in production.
                </p>
              </div>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    variant="outline"
                    disabled={reseeding}
                    data-testid="button-reseed"
                  >
                    {reseeding ? (
                      <Spinner className="w-4 h-4 mr-2" />
                    ) : (
                      <RotateCcw className="w-4 h-4 mr-2" />
                    )}
                    Reset demo data
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Reset demo data?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This will delete every seeded user, team, project, order,
                      revenue entry, milestone, demo-day application,
                      announcement, and notification, then re-create the
                      canonical demo dataset. Real (non-seed) users and data
                      will not be affected. The seed typically takes a few
                      seconds.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={handleReseed}
                      data-testid="button-reseed-confirm"
                    >
                      Yes, reset demo data
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
            {reseedResult?.ok === true && (
              <p
                className="text-sm text-emerald-700 dark:text-emerald-400"
                data-testid="text-reseed-success"
              >
                Demo data reset — re-seeded in{" "}
                {(reseedResult.durationMs / 1000).toFixed(1)}s.
              </p>
            )}
            {reseedResult?.ok === false && (
              <p
                className="text-sm text-destructive"
                data-testid="text-reseed-error"
              >
                Reset failed: {reseedResult.error}
              </p>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
