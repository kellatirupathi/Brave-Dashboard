// Admin Config card: Projects submissions lock. Toggle stops students from
// adding order book entries and uploading/submitting BRDs for revenue on the
// Projects page; the message below is shown in a banner at the top of the
// student Projects pages while locked. Auto-loads on mount; explicit Save.
import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Spinner } from "@/components/ui/spinner";
import { Lock, Save } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { getProjectsLock, saveProjectsLock } from "@/lib/projects-lock-api";

export function ProjectsLockCard() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [loaded, setLoaded] = useState(false);
  const [locked, setLocked] = useState(false);
  const [message, setMessage] = useState("");
  const [resubmitEnabled, setResubmitEnabled] = useState(true);
  const [initial, setInitial] = useState<{
    locked: boolean;
    message: string;
    resubmitEnabled: boolean;
  }>({
    locked: false,
    message: "",
    resubmitEnabled: true,
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getProjectsLock()
      .then((data) => {
        if (cancelled) return;
        setLocked(data.locked);
        setMessage(data.message);
        setResubmitEnabled(data.rejectedResubmitEnabled);
        setInitial({
          locked: data.locked,
          message: data.message,
          resubmitEnabled: data.rejectedResubmitEnabled,
        });
        setLoaded(true);
      })
      .catch(() => {
        if (!cancelled) setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const dirty =
    locked !== initial.locked ||
    message.trim() !== initial.message.trim() ||
    resubmitEnabled !== initial.resubmitEnabled;

  const handleSave = async () => {
    setSaving(true);
    try {
      const data = await saveProjectsLock({
        locked,
        message: message.trim() || null,
        rejectedResubmitEnabled: resubmitEnabled,
      });
      setLocked(data.locked);
      setMessage(data.message);
      setResubmitEnabled(data.rejectedResubmitEnabled);
      setInitial({
        locked: data.locked,
        message: data.message,
        resubmitEnabled: data.rejectedResubmitEnabled,
      });
      queryClient.invalidateQueries({ queryKey: ["projects-lock"] });
      toast({
        title: data.locked
          ? "Project submissions locked"
          : "Project submissions open",
        description: data.locked
          ? "Students can no longer add orders or upload BRDs."
          : "Students can add orders and upload BRDs again.",
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
    <Card data-testid="card-projects-lock">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Lock className="w-5 h-5 text-primary" /> Projects Submissions Lock
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          When locked, students cannot add order book entries or upload/submit
          BRDs for revenue verification on the Projects page. The message below
          is shown at the top of their Projects page. Admins are never blocked.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between border p-4 rounded-lg">
          <div>
            <p className="font-medium">Lock project submissions</p>
            <p className="text-sm text-muted-foreground">
              Stops new orders, revenue entries and BRD submissions.
            </p>
          </div>
          <Switch
            checked={locked}
            onCheckedChange={setLocked}
            disabled={!loaded || saving}
            data-testid="switch-projects-lock"
          />
        </div>
        <div className="space-y-2">
          <label className="text-sm font-medium">
            Message shown to students
          </label>
          <Textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={3}
            maxLength={1000}
            disabled={!loaded || saving}
            placeholder="Submissions are temporarily paused…"
            data-testid="input-projects-lock-message"
          />
        </div>
        <div className="flex items-center justify-between border p-4 rounded-lg">
          <div>
            <p className="font-medium">
              Allow editing &amp; resubmitting rejected entries
            </p>
            <p className="text-sm text-muted-foreground">
              When off, the student "Edit &amp; fix" and "Resubmit for
              verification" buttons on rejected revenue entries are hidden.
            </p>
          </div>
          <Switch
            checked={resubmitEnabled}
            onCheckedChange={setResubmitEnabled}
            disabled={!loaded || saving}
            data-testid="switch-rejected-resubmit"
          />
        </div>
        <div className="flex justify-end">
          <Button
            size="sm"
            onClick={handleSave}
            disabled={!loaded || saving || !dirty}
            data-testid="button-save-projects-lock"
          >
            {saving ? (
              <Spinner className="w-4 h-4 mr-2" />
            ) : (
              <Save className="w-4 h-4 mr-2" />
            )}
            Save
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
