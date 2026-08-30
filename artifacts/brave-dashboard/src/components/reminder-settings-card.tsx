import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Bell,
  Mail,
  Smartphone,
  AlertTriangle,
  UserCog,
  History,
  MailX,
  Lock,
} from "lucide-react";
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

// Per-category email kill switches — mirrors EMAIL_CATEGORIES on the server.
// Grouped the way emails are actually triggered. Default ON; super-admin only.
const EMAIL_CONTROL_GROUPS: {
  group: string;
  items: { key: string; label: string; description: string }[];
}[] = [
  {
    group: "Automatic emails (sent on a schedule)",
    items: [
      {
        key: "overdueReminders",
        label: "Overdue submission reminders",
        description:
          "Students with overdue work get an automatic reminder email.",
      },
      {
        key: "journalReminders",
        label: "Journal silence reminders (day-7)",
        description:
          "The scheduled day-7 journal reminder email to silent team members. Also requires the Student email reminders toggle above.",
      },
      {
        key: "journalEscalations",
        label: "Journal escalation reports",
        description:
          "Escalation and weekly journal report emails when journals stay pending (all levels).",
      },
    ],
  },
  {
    group: "Emails triggered by admin actions",
    items: [
      {
        key: "revenueVerified",
        label: "Revenue verified",
        description:
          "Email to the team when a revenue entry is approved in the Review Queue.",
      },
      {
        key: "revenueRejected",
        label: "Revenue rejected",
        description:
          "Email to the team when a revenue entry is rejected in the Review Queue.",
      },
      {
        key: "announcementEmails",
        label: "Announcement emails",
        description:
          "Email copy of announcements sent to the targeted students.",
      },
      {
        key: "submissionAccess",
        label: "Submission access decisions",
        description:
          "Emails when a team's submission access is enabled/disabled or an access request is declined (projects lock).",
      },
      {
        key: "accessRequestDecision",
        label: "Dashboard access decisions",
        description:
          "Emails when an admin approves or rejects a student's dashboard access request.",
      },
      {
        key: "teamNameDuplicate",
        label: "Duplicate team name notices",
        description:
          "Email to teams asked to rename because of a duplicate team name.",
      },
      {
        key: "finaleReview",
        label: "Finale review results",
        description:
          "Email to the team when their finale submission is verified or rejected.",
      },
      {
        key: "heatmapNudges",
        label: "Heatmap manual nudges",
        description:
          "Emails sent from the heatmap page (journal status reminders and log-in nudges).",
      },
    ],
  },
  {
    group: "Emails triggered by student actions",
    items: [
      {
        key: "teamMembership",
        label: "Team membership emails",
        description:
          "Emails when membership requests (join/add/leave/remove) are approved or rejected.",
      },
      {
        key: "pcaVotes",
        label: "People's Choice Award emails",
        description: "Vote receipt emails and voting-open announcements.",
      },
    ],
  },
];

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

  function setEmailControl(key: string, value: boolean) {
    if (data) {
      queryClient.setQueryData(QUERY_KEY, {
        ...data,
        emailControls: { ...data.emailControls, [key]: value },
      });
    }
    mut.mutate({ emailControls: { [key]: value } });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Bell className="w-5 h-5 text-primary" />
          Notifications &amp; Reminders
        </CardTitle>
        {/* These switches govern the LIVE season, whichever one that is, and
            are read the same way by sendEmail(). Said plainly here because an
            admin browsing an archived season would otherwise assume they were
            editing that season's switches. */}
        <CardDescription>
          These settings apply to the live season. Reminders and reports are
          only ever sent for the season currently running.
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

            <div className="text-xs uppercase tracking-wide text-muted-foreground font-semibold pt-1">
              Journal permissions
            </div>

            <div className="flex items-center justify-between border p-4 rounded-lg">
              <div className="flex items-start gap-3 min-w-0">
                <History className="w-5 h-5 text-muted-foreground mt-0.5 shrink-0" />
                <div>
                  <p className="font-medium">
                    Allow students to edit/delete past-week journals
                  </p>
                </div>
              </div>
              <Switch
                checked={data.allowPastWeekEdits}
                disabled={mut.isPending}
                onCheckedChange={(c) => setField("allowPastWeekEdits", c)}
                data-testid="allow-past-week-edits-toggle"
              />
            </div>

            <div className="flex items-center justify-between pt-3">
              <div className="text-xs uppercase tracking-wide text-muted-foreground font-semibold flex items-center gap-1.5">
                <MailX className="w-3.5 h-3.5" />
                Email controls (per email type)
              </div>
              {!data.callerIsSuperAdmin && (
                <span className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Lock className="w-3 h-3" /> Super admin only
                </span>
              )}
            </div>
            <p className="text-sm text-muted-foreground -mt-1">
              Turn any email type off to stop those emails app-wide. In-app
              notifications are not affected. All types are ON by default.
            </p>

            {EMAIL_CONTROL_GROUPS.map((g) => (
              <div key={g.group} className="space-y-2">
                <div className="text-xs font-semibold text-muted-foreground pt-1">
                  {g.group}
                </div>
                {g.items.map((item) => (
                  <div
                    key={item.key}
                    className="flex items-center justify-between border p-3 rounded-lg"
                  >
                    <div className="flex items-start gap-3 min-w-0">
                      <Mail className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />
                      <div>
                        <p className="font-medium text-sm">{item.label}</p>
                        <p className="text-xs text-muted-foreground">
                          {item.description}
                        </p>
                      </div>
                    </div>
                    <Switch
                      checked={data.emailControls?.[item.key] !== false}
                      disabled={mut.isPending || !data.callerIsSuperAdmin}
                      onCheckedChange={(c) => setEmailControl(item.key, c)}
                      data-testid={`email-control-${item.key}`}
                    />
                  </div>
                ))}
              </div>
            ))}

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
