import { useEffect, useState } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Spinner } from "@/components/ui/spinner";
import { Award, Save, Plus, Trash2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { normalizeError } from "@/lib/api-error";
import {
  getAdminGritConfig,
  updateAdminGritConfig,
  DEFAULT_GRIT_LEVELS,
  type GritLevel,
} from "@/lib/grit-config-api";

export const ADMIN_GRIT_CONFIG_QUERY_KEY = ["admin-grit-config"] as const;

export function GritConfigCard() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ADMIN_GRIT_CONFIG_QUERY_KEY,
    queryFn: getAdminGritConfig,
  });

  const [levels, setLevels] = useState<GritLevel[]>(DEFAULT_GRIT_LEVELS);
  const [deadline, setDeadline] = useState<string>("");
  const [escalationEnabled, setEscalationEnabled] = useState<boolean>(true);
  // Demo Day → GRIT Miles rollout toggles. Both default false = students keep
  // the previous Demo Day experience until explicitly switched on.
  const [gritMilesMenuEnabled, setGritMilesMenuEnabled] =
    useState<boolean>(false);
  const [gritMilesDashboardEnabled, setGritMilesDashboardEnabled] =
    useState<boolean>(false);
  // Independent of the GRIT flags above — controls the student Demo Day menu
  // item + /demo-day route visibility. Default true = visible.
  const [demoDayMenuEnabled, setDemoDayMenuEnabled] = useState<boolean>(true);

  useEffect(() => {
    if (!data) return;
    setLevels(data.levels.length ? data.levels : DEFAULT_GRIT_LEVELS);
    setDeadline(data.journalEditDeadline ?? "");
    setEscalationEnabled(data.escalationEnabled);
    setGritMilesMenuEnabled(data.gritMilesMenuEnabled);
    setGritMilesDashboardEnabled(data.gritMilesDashboardEnabled);
    setDemoDayMenuEnabled(data.demoDayMenuEnabled);
  }, [data]);

  const saveMut = useMutation({
    mutationFn: () =>
      updateAdminGritConfig({
        levels: levels.map((l, i) => ({
          level: i + 1,
          revenueTarget: Number(l.revenueTarget) || 0,
          miles: Number(l.miles) || 0,
          reward: l.reward?.trim() || undefined,
        })),
        journalEditDeadline: deadline.trim() === "" ? null : deadline.trim(),
        escalationEnabled,
        gritMilesMenuEnabled,
        gritMilesDashboardEnabled,
        demoDayMenuEnabled,
      }),
    onSuccess: (res) => {
      toast({ title: "GRIT settings saved" });
      queryClient.setQueryData(ADMIN_GRIT_CONFIG_QUERY_KEY, res);
      // Students read a separate endpoint — nudge it so their dashboard updates.
      queryClient.invalidateQueries({ queryKey: ["student-grit-config"] });
    },
    onError: (e: unknown) =>
      toast({
        title: "Couldn't save GRIT settings",
        description: normalizeError(e).message,
        variant: "destructive",
      }),
  });

  const updateLevel = (idx: number, field: keyof GritLevel, value: string) => {
    setLevels((prev) =>
      prev.map((l, i) =>
        i === idx
          ? {
              ...l,
              [field]:
                field === "reward" ? value : Number(value.replace(/\D/g, "")),
            }
          : l,
      ),
    );
  };

  const addLevel = () =>
    setLevels((prev) => [
      ...prev,
      { level: prev.length + 1, revenueTarget: 0, miles: 0 },
    ]);

  const removeLevel = (idx: number) =>
    setLevels((prev) => prev.filter((_, i) => i !== idx));

  return (
    <Card data-testid="card-grit-config">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Award className="w-5 h-5 text-primary" /> GRIT Miles & Journal Rules
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          The reward ladder students see, the journal edit deadline, and the
          weekly escalation switch.
        </p>
      </CardHeader>
      <CardContent className="space-y-5">
        {isLoading ? (
          <div className="flex h-24 items-center justify-center">
            <Spinner />
          </div>
        ) : (
          <>
            {/* Level ladder */}
            <div className="space-y-2">
              <div className="grid grid-cols-[auto_1fr_1fr_1fr_auto] gap-2 items-center text-[11px] font-medium uppercase tracking-wide text-muted-foreground px-1">
                <span className="w-10">Level</span>
                <span>Revenue ₹</span>
                <span>Miles</span>
                <span>Reward (optional)</span>
                <span />
              </div>
              {levels.map((lvl, idx) => (
                <div
                  key={idx}
                  className="grid grid-cols-[auto_1fr_1fr_1fr_auto] gap-2 items-center"
                  data-testid={`grit-level-row-${idx}`}
                >
                  <span className="w-10 text-center text-sm font-semibold tabular-nums">
                    {idx + 1}
                  </span>
                  <Input
                    inputMode="numeric"
                    value={String(lvl.revenueTarget)}
                    onChange={(e) =>
                      updateLevel(idx, "revenueTarget", e.target.value)
                    }
                    data-testid={`grit-revenue-${idx}`}
                  />
                  <Input
                    inputMode="numeric"
                    value={String(lvl.miles)}
                    onChange={(e) => updateLevel(idx, "miles", e.target.value)}
                    data-testid={`grit-miles-${idx}`}
                  />
                  <Input
                    value={lvl.reward ?? ""}
                    placeholder="—"
                    onChange={(e) => updateLevel(idx, "reward", e.target.value)}
                    data-testid={`grit-reward-${idx}`}
                  />
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8 text-destructive hover:text-destructive"
                    onClick={() => removeLevel(idx)}
                    disabled={levels.length <= 1}
                    aria-label="Remove level"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              ))}
              <Button
                size="sm"
                variant="outline"
                onClick={addLevel}
                data-testid="button-add-grit-level"
              >
                <Plus className="w-4 h-4 mr-1" /> Add level
              </Button>
            </div>

            {/* Journal edit deadline */}
            <div className="space-y-2">
              <label className="text-sm font-medium">
                Journal edit deadline
              </label>
              <Input
                type="date"
                value={deadline ? deadline.split("T")[0] : ""}
                onChange={(e) => setDeadline(e.target.value)}
                data-testid="input-journal-edit-deadline"
              />
              <p className="text-xs text-muted-foreground">
                Students see this date in the dashboard eligibility message.
                Leave blank to omit the date.
              </p>
            </div>

            {/* Escalation toggle */}
            <div className="flex items-center justify-between border p-4 rounded-lg">
              <div>
                <p className="font-medium">Journal escalation emails</p>
                <p className="text-sm text-muted-foreground">
                  Weekly Success Coach → COS → Admin chain (Wed/Thu/Fri 6 PM).
                </p>
              </div>
              <Switch
                checked={escalationEnabled}
                onCheckedChange={setEscalationEnabled}
                data-testid="switch-escalation-enabled"
              />
            </div>

            {/* Demo Day → GRIT Miles rollout (manager-gated). OFF = previous
                Demo Day experience; ON = new GRIT Miles. Independent toggles. */}
            <div className="flex items-center justify-between border p-4 rounded-lg">
              <div>
                <p className="font-medium">Student menu &amp; page: GRIT Miles</p>
                <p className="text-sm text-muted-foreground">
                  ON shows the “GRIT Miles” menu + ladder page to students. OFF
                  shows the previous “Demo Day” menu + 3-level page.
                </p>
              </div>
              <Switch
                checked={gritMilesMenuEnabled}
                onCheckedChange={setGritMilesMenuEnabled}
                data-testid="switch-grit-menu-enabled"
              />
            </div>

            <div className="flex items-center justify-between border p-4 rounded-lg">
              <div>
                <p className="font-medium">Student dashboard: new GRIT Miles UI</p>
                <p className="text-sm text-muted-foreground">
                  ON shows the new GRIT Miles dashboard. OFF shows the previous
                  Demo Day dashboard.
                </p>
              </div>
              <Switch
                checked={gritMilesDashboardEnabled}
                onCheckedChange={setGritMilesDashboardEnabled}
                data-testid="switch-grit-dashboard-enabled"
              />
            </div>

            {/* Demo Day sidebar visibility (independent of GRIT flags). */}
            <div className="flex items-center justify-between border p-4 rounded-lg">
              <div>
                <p className="font-medium">Show Demo Day in student sidebar</p>
                <p className="text-sm text-muted-foreground">
                  When off, students won't see the Demo Day menu item.
                </p>
              </div>
              <Switch
                checked={demoDayMenuEnabled}
                onCheckedChange={setDemoDayMenuEnabled}
                data-testid="switch-demo-day-menu-enabled"
              />
            </div>

            <div className="flex justify-end">
              <Button
                onClick={() => saveMut.mutate()}
                disabled={saveMut.isPending}
                data-testid="button-save-grit-config"
              >
                {saveMut.isPending ? (
                  <Spinner className="w-4 h-4 mr-2" />
                ) : (
                  <Save className="w-4 h-4 mr-2" />
                )}
                Save GRIT settings
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
