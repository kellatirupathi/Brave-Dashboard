// Admin Config card: BRAVE Finale Submissions. Controls whether students see
// the menu/page at all, the verified-revenue bar a team must clear to get in,
// the submissions lock (banner replaces the upload form), and the content shown
// in the page's right-hand column. Auto-loads on mount; explicit Save.
import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Spinner } from "@/components/ui/spinner";
import { Label } from "@/components/ui/label";
import { Save, Trophy } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { formatINR } from "@/lib/format";
import {
  getFinaleConfig,
  saveFinaleConfig,
  type FinaleConfig,
} from "@/lib/finale-api";

export function FinaleConfigCard() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<FinaleConfig>({
    finaleMenuEnabled: false,
    finaleMinVerifiedRevenue: 200000,
    finaleSubmissionsLocked: false,
    finaleLockMessage: "",
    finaleContent: "",
  });
  const [initial, setInitial] = useState<FinaleConfig>(form);

  useEffect(() => {
    let cancelled = false;
    getFinaleConfig()
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
  const set = <K extends keyof FinaleConfig>(key: K, value: FinaleConfig[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const handleSave = async () => {
    setSaving(true);
    try {
      const data = await saveFinaleConfig(form);
      setForm(data);
      setInitial(data);
      // The student page + sidebar read this config.
      queryClient.invalidateQueries({ queryKey: ["finale-me"] });
      toast({ title: "Finale settings saved" });
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
    <Card data-testid="card-finale-config">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Trophy className="h-5 w-5 text-primary" /> BRAVE Finale Submissions
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Students whose team has cleared the verified-revenue bar get a "BRAVE
          Finale Submissions" page. Only the team leader can upload a deck;
          members see the page and their team's submissions read-only.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between rounded-lg border p-4">
          <div>
            <p className="font-medium">Enable Finale Submissions</p>
            <p className="text-sm text-muted-foreground">
              Shows the menu + page for eligible students.
            </p>
          </div>
          <Switch
            checked={form.finaleMenuEnabled}
            onCheckedChange={(v) => set("finaleMenuEnabled", v)}
            disabled={!loaded || saving}
            data-testid="switch-finale-enabled"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="finale-threshold">
            Minimum verified revenue to unlock
          </Label>
          <Input
            id="finale-threshold"
            type="number"
            min={0}
            step={10000}
            value={form.finaleMinVerifiedRevenue}
            onChange={(e) =>
              set("finaleMinVerifiedRevenue", Number(e.target.value) || 0)
            }
            disabled={!loaded || saving}
            data-testid="input-finale-threshold"
          />
          <p className="text-xs text-muted-foreground">
            Currently {formatINR(form.finaleMinVerifiedRevenue)}. Teams below
            this don't see the page.
          </p>
        </div>

        <div className="flex items-center justify-between rounded-lg border p-4">
          <div>
            <p className="font-medium">Lock pptx submissions</p>
            <p className="text-sm text-muted-foreground">
              Hides the file upload + remarks box and shows the message below.
              The rest of the page still works.
            </p>
          </div>
          <Switch
            checked={form.finaleSubmissionsLocked}
            onCheckedChange={(v) => set("finaleSubmissionsLocked", v)}
            disabled={!loaded || saving}
            data-testid="switch-finale-lock"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="finale-lock-message">Locked message</Label>
          <Textarea
            id="finale-lock-message"
            value={form.finaleLockMessage}
            onChange={(e) => set("finaleLockMessage", e.target.value)}
            rows={2}
            maxLength={1000}
            disabled={!loaded || saving}
            data-testid="input-finale-lock-message"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="finale-content">
            Page content (shown on the right of the student page)
          </Label>
          <Textarea
            id="finale-content"
            value={form.finaleContent}
            onChange={(e) => set("finaleContent", e.target.value)}
            rows={6}
            maxLength={5000}
            disabled={!loaded || saving}
            placeholder="Guidelines, deadline, what the deck must cover…"
            data-testid="input-finale-content"
          />
        </div>

        <div className="flex justify-end">
          <Button
            size="sm"
            onClick={handleSave}
            disabled={!loaded || saving || !dirty}
            data-testid="button-save-finale-config"
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
