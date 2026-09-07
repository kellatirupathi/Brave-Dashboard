// Config → Ticket Support (additive, isolated).
//
// Two decisions live here. Whether students see the feature at all, and what
// they may do with it once they do. Both are season-scoped, so switching it on
// for Season 2 leaves Season 1 exactly as it was.
//
// The permission rows are deliberately narrower than the Leads matrix. Edit
// and delete are off by default because a ticket is a record of what someone
// asked and what they were told — letting a student rewrite it afterwards
// changes the history a staff reply was written against.
import { useEffect, useState } from "react";
import { LifeBuoy, Save } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Spinner } from "@/components/ui/spinner";
import { useToast } from "@/hooks/use-toast";
import {
  getTicketsControl,
  updateTicketsControl,
  type TicketsControlState,
} from "@/lib/tickets-api";

const ACTIONS = ["add", "view", "edit", "delete"] as const;

const LABELS: Record<(typeof ACTIONS)[number], string> = {
  add: "Raise tickets",
  view: "See their tickets",
  edit: "Edit a raised ticket",
  delete: "Delete a raised ticket",
};

export function TicketsControlCard() {
  const { toast } = useToast();
  const [state, setState] = useState<TicketsControlState | null>(null);
  const [initial, setInitial] = useState<TicketsControlState | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getTicketsControl()
      .then((data) => {
        if (!cancelled) {
          setState(data);
          setInitial(data);
        }
      })
      .catch((err: Error) => {
        if (!cancelled) {
          toast({
            title: "Could not load ticket settings",
            description: err.message,
            variant: "destructive",
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [toast]);

  const dirty =
    !!state && !!initial && JSON.stringify(state) !== JSON.stringify(initial);

  const save = async (): Promise<void> => {
    if (!state) return;
    setSaving(true);
    try {
      const saved = await updateTicketsControl(state);
      setState(saved);
      setInitial(saved);
      toast({ title: "Ticket settings saved" });
    } catch (err) {
      toast({
        title: "Could not save",
        description: (err as Error).message,
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <LifeBuoy className="w-4 h-4 text-primary" />
          Ticket Support
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        {!state ? (
          <div className="flex justify-center py-6">
            <Spinner />
          </div>
        ) : (
          <>
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-medium">
                  Show Ticket Support to students
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Adds the entry to the student sidebar. Off means the page is
                  hidden for this season.
                </p>
              </div>
              <Switch
                checked={state.menuEnabled}
                onCheckedChange={(v) => setState({ ...state, menuEnabled: v })}
                data-testid="switch-tickets-menu"
              />
            </div>

            <div>
              <p className="text-sm font-medium">What students can do</p>
              <div className="grid sm:grid-cols-2 gap-2.5 mt-2">
                {ACTIONS.map((action) => (
                  <label
                    key={action}
                    className="flex items-center gap-2.5 text-sm cursor-pointer"
                  >
                    <Checkbox
                      checked={state.permissions[action]}
                      onCheckedChange={(v) =>
                        setState({
                          ...state,
                          permissions: {
                            ...state.permissions,
                            [action]: v === true,
                          },
                        })
                      }
                      data-testid={`checkbox-tickets-${action}`}
                    />
                    {LABELS[action]}
                  </label>
                ))}
              </div>
            </div>

            <div className="flex justify-end">
              <Button
                onClick={() => void save()}
                disabled={!dirty || saving}
                data-testid="button-save-tickets-control"
              >
                <Save className="w-4 h-4 mr-1.5" />
                {saving ? "Saving…" : "Save"}
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
