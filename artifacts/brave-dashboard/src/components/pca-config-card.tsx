// Admin Config card: People's Choice Award voting. Turning it ON emails every
// eligible voter, shows the banner on every student page, and unhides the vote
// page. Auto-loads on mount; explicit Save.
import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Spinner } from "@/components/ui/spinner";
import { Label } from "@/components/ui/label";
import { Save, Trophy } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { formatINR } from "@/lib/format";
import { getPcaConfig, savePcaConfig, type PcaConfig } from "@/lib/pca-api";

export function PcaConfigCard() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<PcaConfig>({
    pcaVotingEnabled: false,
    pcaMinVerifiedRevenue: 200000,
  });
  const [initial, setInitial] = useState<PcaConfig>(form);

  useEffect(() => {
    let cancelled = false;
    getPcaConfig()
      .then((data) => {
        if (cancelled) return;
        setForm(data);
        setInitial(data);
        setLoaded(true);
      })
      .catch(() => {
        if (!cancelled) setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const dirty = JSON.stringify(form) !== JSON.stringify(initial);
  // Turning voting on fires the emails — worth saying out loud before saving.
  const willEmail = form.pcaVotingEnabled && !initial.pcaVotingEnabled;

  const handleSave = async () => {
    setSaving(true);
    try {
      const data = await savePcaConfig(form);
      setForm(data);
      setInitial(data);
      queryClient.invalidateQueries({ queryKey: ["pca-me"] });
      toast({
        title: "Voting settings saved",
        description: willEmail
          ? "Eligible teams are being emailed now."
          : undefined,
      });
    } catch (err) {
      toast({
        title: "Could not save",
        description: err instanceof Error ? err.message : "Please try again.",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card data-testid="card-pca-config">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Trophy className="h-5 w-5 text-primary" /> People's Choice Award
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Leaders and members of teams above the bar below can vote for one
          other team — never their own, and one vote each. Turning voting on
          emails every eligible voter and puts a banner on their pages.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between rounded-lg border p-4">
          <div>
            <p className="font-medium">Open voting</p>
            <p className="text-sm text-muted-foreground">
              Shows the banner + vote page, and emails eligible teams.
            </p>
          </div>
          <Switch
            checked={form.pcaVotingEnabled}
            onCheckedChange={(v) =>
              setForm((f) => ({ ...f, pcaVotingEnabled: v }))
            }
            disabled={!loaded || saving}
            data-testid="switch-pca-enabled"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="pca-threshold">
            Minimum verified revenue to take part
          </Label>
          <Input
            id="pca-threshold"
            type="number"
            min={0}
            step={10000}
            value={form.pcaMinVerifiedRevenue}
            onChange={(e) =>
              setForm((f) => ({
                ...f,
                pcaMinVerifiedRevenue: Number(e.target.value) || 0,
              }))
            }
            disabled={!loaded || saving}
            data-testid="input-pca-threshold"
          />
          <p className="text-xs text-muted-foreground">
            Currently {formatINR(form.pcaMinVerifiedRevenue)}. Separate from the
            Finale threshold — changing one never affects the other.
          </p>
        </div>

        {willEmail ? (
          <p className="rounded-md border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-200">
            Saving now will email every leader and member of every eligible
            team.
          </p>
        ) : null}

        <div className="flex justify-end">
          <Button
            size="sm"
            onClick={handleSave}
            disabled={!loaded || saving || !dirty}
            data-testid="button-save-pca-config"
          >
            {saving ? (
              <Spinner className="mr-2 h-4 w-4" />
            ) : (
              <Save className="mr-2 h-4 w-4" />
            )}
            Save
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
