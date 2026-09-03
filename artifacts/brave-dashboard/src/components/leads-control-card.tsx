import { useEffect, useState } from "react";
import { Save, SlidersHorizontal } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Spinner } from "@/components/ui/spinner";
import { useToast } from "@/hooks/use-toast";
import {
  getLeadsControl,
  LEADS_CONTROL_SECTIONS,
  saveLeadsControl,
  useInvalidateLeadsControl,
  type LeadsControlPermissions,
  type LeadsControlState,
} from "@/lib/leads-control-api";

const LABELS: Record<(typeof LEADS_CONTROL_SECTIONS)[number], string> = {
  leads: "Leads",
  projects: "Projects",
  phases: "Phases",
  payments: "Payments",
  interactions: "Interactions",
};

export function LeadsControlCard() {
  const { toast } = useToast();
  const invalidate = useInvalidateLeadsControl();
  const [state, setState] = useState<LeadsControlState | null>(null);
  const [initial, setInitial] = useState<LeadsControlState | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getLeadsControl()
      .then((data) => {
        if (!cancelled) {
          setState(data);
          setInitial(data);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          toast({
            title: "Could not load Leads controls",
            description: err instanceof Error ? err.message : "Please try again.",
            variant: "destructive",
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [toast]);

  if (!state) {
    return (
      <div className="flex justify-center py-12">
        <Spinner />
      </div>
    );
  }

  const setPermission = (
    section: keyof Omit<LeadsControlPermissions, "submitForReview">,
    action: "add" | "edit" | "delete",
    checked: boolean,
  ) =>
    setState((current) =>
      current
        ? {
            ...current,
            permissions: {
              ...current.permissions,
              [section]: {
                ...current.permissions[section],
                [action]: checked,
              },
            },
          }
        : current,
    );

  const dirty = JSON.stringify(state) !== JSON.stringify(initial);

  const save = async () => {
    setSaving(true);
    try {
      const updated = await saveLeadsControl({
        locked: state.locked,
        message: state.message.trim() || null,
        permissions: state.permissions,
      });
      setState(updated);
      setInitial(updated);
      invalidate();
      toast({
        title: "Leads controls saved",
        description: updated.locked
          ? "All student Leads changes and submissions are paused."
          : "The section permissions are now active.",
      });
    } catch (err) {
      toast({
        title: "Could not save Leads controls",
        description: err instanceof Error ? err.message : "Please try again.",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <SlidersHorizontal className="h-5 w-5 text-primary" />
          Leads Control
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Controls student actions for the season being viewed. Admins are the
          only users who bypass these settings.
        </p>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="flex items-center justify-between gap-4 rounded-lg border p-4">
          <div>
            <p className="font-medium">Leads submission lock</p>
            <p className="text-sm text-muted-foreground">
              Stops every add, edit and delete action, stage changes, and Submit
              for review.
            </p>
          </div>
          <Switch
            checked={state.locked}
            onCheckedChange={(locked) =>
              setState((current) => (current ? { ...current, locked } : current))
            }
            disabled={saving}
          />
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium">Message shown to students</label>
          <Textarea
            value={state.message}
            onChange={(event) =>
              setState((current) =>
                current ? { ...current, message: event.target.value } : current,
              )
            }
            maxLength={1000}
            rows={3}
            disabled={saving}
          />
        </div>

        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="px-4 py-3 text-left font-medium">Section</th>
                <th className="px-4 py-3 text-center font-medium">Add</th>
                <th className="px-4 py-3 text-center font-medium">Edit</th>
                <th className="px-4 py-3 text-center font-medium">Delete</th>
              </tr>
            </thead>
            <tbody>
              {LEADS_CONTROL_SECTIONS.map((section) => (
                <tr key={section} className="border-t">
                  <td className="px-4 py-3 font-medium">{LABELS[section]}</td>
                  {(["add", "edit", "delete"] as const).map((action) => (
                    <td key={action} className="px-4 py-3 text-center">
                      <Checkbox
                        checked={state.permissions[section][action]}
                        onCheckedChange={(value) =>
                          setPermission(section, action, value === true)
                        }
                        disabled={saving}
                        aria-label={`${action} ${LABELS[section]}`}
                      />
                    </td>
                  ))}
                </tr>
              ))}
              <tr className="border-t">
                <td className="px-4 py-3 font-medium">Submit for review</td>
                <td className="px-4 py-3 text-center">
                  <Checkbox
                    checked={state.permissions.submitForReview}
                    onCheckedChange={(value) =>
                      setState((current) =>
                        current
                          ? {
                              ...current,
                              permissions: {
                                ...current.permissions,
                                submitForReview: value === true,
                              },
                            }
                          : current,
                      )
                    }
                    disabled={saving}
                    aria-label="Allow Submit for review"
                  />
                </td>
                <td
                  className="px-4 py-3 text-center text-muted-foreground"
                  colSpan={2}
                >
                  Add column means Allow
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <div className="flex justify-end">
          <Button onClick={() => void save()} disabled={!dirty || saving}>
            {saving ? <Spinner className="mr-2 h-4 w-4" /> : <Save className="mr-2 h-4 w-4" />}
            Save
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}