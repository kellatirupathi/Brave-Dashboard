// Admin Config — toggle that controls whether the Resources sidebar entry
// (and the /resources-library route) is visible to students. Admin's own
// /admin/resources page is always reachable regardless of this flag.
//
// Auto-saves on toggle (no Save button), mirroring ReminderSettingsCard.

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BookOpen } from "lucide-react";
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

type ResourcesSettings = { enabledForStudents: boolean };

const QUERY_KEY = ["admin-resources-settings"];

async function fetchResourcesSettings(): Promise<ResourcesSettings> {
  const res = await fetch("/api/resources-settings", {
    credentials: "include",
  });
  if (!res.ok) throw new Error("Failed to load resources settings");
  return res.json();
}

async function saveResourcesSettings(
  body: ResourcesSettings,
): Promise<ResourcesSettings> {
  const res = await fetch("/api/admin/resources-settings", {
    method: "PATCH",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(data.error || "Save failed");
  }
  return res.json();
}

export function ResourcesSettingsCard() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: QUERY_KEY,
    queryFn: fetchResourcesSettings,
  });

  const mut = useMutation({
    mutationFn: saveResourcesSettings,
    onSuccess: (settings) => {
      queryClient.setQueryData(QUERY_KEY, settings);
      // Also nudge the public settings query students use, so any open
      // student tabs pick up the change on next refocus / refresh.
      queryClient.invalidateQueries({
        queryKey: ["public-resources-settings"],
      });
      toast({ title: "Resources visibility saved" });
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

  function setEnabled(value: boolean) {
    if (data) {
      // Optimistic update so the switch flips instantly.
      queryClient.setQueryData(QUERY_KEY, { enabledForStudents: value });
    }
    mut.mutate({ enabledForStudents: value });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <BookOpen className="w-5 h-5 text-primary" />
          Student Resources Library
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading || !data ? (
          <div className="flex justify-center py-6">
            <Spinner className="size-6" />
          </div>
        ) : (
          <div className="flex items-center justify-between border p-4 rounded-lg">
            <div className="pr-4">
              <p className="font-medium">Show Resources to students</p>
              <p className="text-sm text-muted-foreground">
                When OFF, the Resources sidebar entry is hidden and the
                /resources-library URL redirects students away.
              </p>
            </div>
            <Switch
              checked={data.enabledForStudents}
              onCheckedChange={setEnabled}
              data-testid="switch-resources-enabled-for-students"
            />
          </div>
        )}
      </CardContent>
    </Card>
  );
}
