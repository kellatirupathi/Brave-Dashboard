import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, Mail, Smartphone, AlertTriangle, UserCog } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Spinner } from "@/components/ui/spinner";
import { useToast } from "@/hooks/use-toast";
import {
  getReminderSettings,
  updateReminderSettings,
  type ReminderSettings,
} from "@/lib/progress-api";

export function ReminderSettingsCard() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const QUERY_KEY = ["admin-reminder-settings"];

  const { data, isLoading } = useQuery({
    queryKey: QUERY_KEY,
    queryFn: getReminderSettings,
  });

  const mut = useMutation({
    mutationFn: updateReminderSettings,
    onSuccess: (settings) => {
      queryClient.setQueryData(QUERY_KEY, settings);
      toast({ title: "Reminder settings saved" });
    },
    onError: (err: Error) => {
      toast({
        title: "Save failed",
        description: err.message,
        variant: "destructive",
      });
      queryClient.invalidateQueries({ queryKey: QUERY_KEY });
    },
  });

  function setField(field: keyof ReminderSettings, value: boolean) {
    // Optimistic update so the switch flips instantly.
    if (data) {
      queryClient.setQueryData(QUERY_KEY, { ...data, [field]: value });
    }
    mut.mutate({ [field]: value });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Bell className="w-5 h-5 text-primary" />
          Notifications &amp; Reminders
        </CardTitle>
        <CardDescription>
          Master switches for the daily reminder service (Module 5). When a
          channel is OFF, neither the cron job nor the manual &quot;Remind&quot;
          button on the heatmap will send through that channel.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {isLoading || !data ? (
          <div className="flex justify-center py-6">
            <Spinner className="size-6" />
          </div>
        ) : (
          <>
            <div className="text-xs uppercase tracking-wide text-muted-foreground font-semibold pt-1">
              Student channels
            </div>

            <div className="flex items-center justify-between border p-4 rounded-lg">
              <div className="flex items-start gap-3 min-w-0">
                <Smartphone className="w-5 h-5 text-muted-foreground mt-0.5 shrink-0" />
                <div>
                  <p className="font-medium">Student in-app notifications</p>
                  <p className="text-sm text-muted-foreground">
                    Sends a bell-icon notification to silent team members at day
                    5 and day 7. Also gates the heatmap &quot;Remind&quot;
                    button.
                  </p>
                </div>
              </div>
              <Switch
                checked={data.notificationsEnabled}
                disabled={mut.isPending}
                onCheckedChange={(c) => setField("notificationsEnabled", c)}
                data-testid="reminder-notifications-toggle"
              />
            </div>

            <div className="flex items-center justify-between border p-4 rounded-lg">
              <div className="flex items-start gap-3 min-w-0">
                <Mail className="w-5 h-5 text-muted-foreground mt-0.5 shrink-0" />
                <div>
                  <p className="font-medium">Student email reminders</p>
                  <p className="text-sm text-muted-foreground">
                    Sends a Brevo email (from{" "}
                    <code className="text-xs">brave.niat@nxtwave.in</code>) to
                    team members at the day-7 silence threshold. No emails at
                    day 5 even when this is ON.
                  </p>
                </div>
              </div>
              <Switch
                checked={data.emailsEnabled}
                disabled={mut.isPending}
                onCheckedChange={(c) => setField("emailsEnabled", c)}
                data-testid="reminder-emails-toggle"
              />
            </div>

            <div className="text-xs uppercase tracking-wide text-muted-foreground font-semibold pt-1">
              Coordinator channel
            </div>

            <div className="flex items-center justify-between border p-4 rounded-lg">
              <div className="flex items-start gap-3 min-w-0">
                <UserCog className="w-5 h-5 text-muted-foreground mt-0.5 shrink-0" />
                <div>
                  <p className="font-medium">Coordinator silent-team alerts</p>
                  <p className="text-sm text-muted-foreground">
                    Pings the campus coordinator at the day-7 silence threshold
                    so they can intervene. Independent from student channels —
                    you can silence students without losing coordinator
                    visibility.
                  </p>
                </div>
              </div>
              <Switch
                checked={data.coordinatorNotificationsEnabled}
                disabled={mut.isPending}
                onCheckedChange={(c) =>
                  setField("coordinatorNotificationsEnabled", c)
                }
                data-testid="reminder-coordinator-toggle"
              />
            </div>

            {!data.notificationsEnabled &&
              !data.emailsEnabled &&
              !data.coordinatorNotificationsEnabled && (
                <div className="flex items-start gap-2 text-amber-700 bg-amber-50 border border-amber-200 rounded-md p-3 text-sm">
                  <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                  <span>
                    All channels are off — the daily reminder service is
                    effectively disabled. Silent teams won&apos;t be notified
                    and coordinators won&apos;t be alerted.
                  </span>
                </div>
              )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
