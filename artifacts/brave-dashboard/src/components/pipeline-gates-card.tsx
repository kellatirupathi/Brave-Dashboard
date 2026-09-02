// Admin Config card: Season 2 pipeline gate mode.
//
// Advisory (default): Gates A/B/C are evaluated and shown to students and
// reviewers, but never refuse an action — a team can convert, open a project
// and submit a BRD at any point. Enforced: the gates block as originally
// designed. Auto-saves on toggle; scoped to the season being viewed.
import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Spinner } from "@/components/ui/spinner";
import { ShieldCheck } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import {
  getPipelineGates,
  updatePipelineGates,
  useInvalidatePipelineGates,
} from "@/lib/pipeline-gates-api";

export function PipelineGatesCard() {
  const { toast } = useToast();
  const invalidate = useInvalidatePipelineGates();
  const [loaded, setLoaded] = useState(false);
  const [enforced, setEnforced] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getPipelineGates()
      .then((d) => {
        if (cancelled) return;
        setEnforced(d.enforced);
        setLoaded(true);
      })
      .catch(() => {
        if (!cancelled) setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const toggle = async (next: boolean) => {
    setSaving(true);
    const prev = enforced;
    setEnforced(next);
    try {
      const d = await updatePipelineGates({ enforced: next });
      setEnforced(d.enforced);
      invalidate();
      toast({
        title: d.enforced ? "Gates now block" : "Gates now advisory",
        description: d.enforced
          ? "Students must pass Gate A, B and C to move forward."
          : "Students can move step to step at any time; the checks are shown as recommendations.",
      });
    } catch (err) {
      setEnforced(prev);
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
    <Card data-testid="card-pipeline-gates">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <ShieldCheck className="h-4 w-4" />
          Pipeline gates (Leads → Project → BRD)
        </CardTitle>
      </CardHeader>
      <CardContent>
        {!loaded ? (
          <div className="flex justify-center py-4">
            <Spinner />
          </div>
        ) : (
          <div className="flex items-start justify-between gap-4">
            <div className="text-sm">
              <p className="font-medium">
                {enforced ? "Enforced — gates block" : "Advisory — gates are optional"}
              </p>
              <p className="mt-1 text-muted-foreground">
                Gate A (3 dated interactions over 7+ days before converting),
                Gate B (a project only from a converted lead) and Gate C (the
                BRD checklist before submitting) are always evaluated and shown.
                {enforced
                  ? " Right now they also refuse the action until met."
                  : " Right now they are recommendations only: students can convert, open a project and submit at any time, and reviewers see which checks were met."}
              </p>
            </div>
            <Switch
              checked={enforced}
              disabled={saving}
              onCheckedChange={(v) => void toggle(v)}
              aria-label="Enforce pipeline gates"
              data-testid="switch-pipeline-gates"
            />
          </div>
        )}
      </CardContent>
    </Card>
  );
}
