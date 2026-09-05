import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { BookLock, Save } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Spinner } from "@/components/ui/spinner";
import { useToast } from "@/hooks/use-toast";
import {
  getJournalSubmissionsLock,
  saveJournalSubmissionsLock,
} from "@/lib/journal-submissions-lock-api";
import { useSeason } from "@/lib/season-context";

export function JournalSubmissionsLockCard() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { viewing } = useSeason();
  const [loaded, setLoaded] = useState(false);
  const [locked, setLocked] = useState(false);
  const [message, setMessage] = useState("");
  const [initial, setInitial] = useState({ locked: false, message: "" });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoaded(false);
    getJournalSubmissionsLock()
      .then((data) => {
        if (cancelled) return;
        const next = { locked: data.locked, message: data.message };
        setLocked(next.locked);
        setMessage(next.message);
        setInitial(next);
      })
      .catch((err) => {
        if (!cancelled) {
          toast({
            title: "Could not load Journal lock",
            description: err instanceof Error ? err.message : "Please try again.",
            variant: "destructive",
          });
        }
      })
      .finally(() => {
        if (!cancelled) setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [toast, viewing?.id]);

  const dirty =
    locked !== initial.locked || message.trim() !== initial.message.trim();

  const save = async () => {
    setSaving(true);
    try {
      const data = await saveJournalSubmissionsLock({
        locked,
        message: message.trim() || null,
      });
      const next = { locked: data.locked, message: data.message };
      setLocked(next.locked);
      setMessage(next.message);
      setInitial(next);
      await queryClient.invalidateQueries({
        queryKey: ["journal", "permissions"],
      });
      toast({
        title: data.locked
          ? "Weekly Journal submissions locked"
          : "Weekly Journal submissions open",
        description: data.locked
          ? "Students can now view journals but cannot add, edit, or delete them."
          : "Students can submit and update journals again.",
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
    <Card data-testid="card-journal-submissions-lock">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <BookLock className="h-5 w-5 text-primary" />
          Weekly Journal Submissions Lock
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Controls the season being viewed. When locked, students can view past
          journals but cannot submit, edit, or delete entries. Admins and
          coordinators remain able to make corrections.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between rounded-lg border p-4">
          <div>
            <p className="font-medium">Lock Weekly Journal submissions</p>
            <p className="text-sm text-muted-foreground">
              Makes the student Weekly Journal page view-only.
            </p>
          </div>
          <Switch
            checked={locked}
            onCheckedChange={setLocked}
            disabled={!loaded || saving}
            data-testid="switch-journal-submissions-lock"
          />
        </div>
        <div className="space-y-2">
          <label className="text-sm font-medium">
            Message shown to students
          </label>
          <Textarea
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            rows={3}
            maxLength={1000}
            disabled={!loaded || saving}
            placeholder="Weekly Journal submissions are temporarily paused…"
            data-testid="input-journal-submissions-lock-message"
          />
        </div>
        <div className="flex justify-end">
          <Button
            size="sm"
            onClick={save}
            disabled={!loaded || saving || !dirty}
            data-testid="button-save-journal-submissions-lock"
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