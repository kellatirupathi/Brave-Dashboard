// Student-facing side of the admin "Projects submissions lock" toggle.
// `useProjectsLock` reads the current lock state; `ProjectsLockBanner` renders
// the admin-configured message at the top of the Projects pages while locked,
// plus a "Request to submit" button (team leader only) that files a request an
// admin reviews. The API also enforces the lock server-side.
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Lock, Send, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Spinner } from "@/components/ui/spinner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { getProjectsLock } from "@/lib/projects-lock-api";
import {
  createSubmissionRequest,
  getMySubmissionRequest,
} from "@/lib/team-submissions-api";

export function useProjectsLock(): {
  // Effective lock for THIS user's team: true only when the global lock is on
  // AND the team is NOT exempted. An exempted team (or admin) reads false, so
  // the banner is hidden and add/submit work normally.
  locked: boolean;
  message: string;
  // Whether students may edit + resubmit a rejected revenue entry. Defaults to
  // true (allowed) until the config loads, so buttons aren't hidden on a blip.
  rejectedResubmitEnabled: boolean;
  // Whether the "Request to submit" button is offered in the lock banner.
  // Defaults to false until the config loads so the button never flashes in
  // and then disappears when it's switched off.
  submissionRequestEnabled: boolean;
  // Raw flags: the global lock state and whether this team is exempted. Used to
  // show the "submit ASAP" nudge to exempted teams during a global lock.
  globalLocked: boolean;
  exempted: boolean;
} {
  const { data } = useQuery({
    queryKey: ["projects-lock"],
    queryFn: getProjectsLock,
    staleTime: 60_000,
  });
  const globalLocked = data?.locked ?? false;
  const exempted = data?.exempted ?? false;
  return {
    locked: globalLocked && !exempted,
    message: data?.message ?? "",
    rejectedResubmitEnabled: data?.rejectedResubmitEnabled ?? true,
    submissionRequestEnabled: data?.submissionRequestEnabled ?? false,
    globalLocked,
    exempted,
  };
}

// Shown to a team that is EXEMPTED while the global lock is ON — a one-row
// urgency nudge (they're allowed to submit during the lockdown, so they should
// do it quickly). Rendered at the top of the Projects and Dashboard pages.
export function SubmitAsapBanner() {
  const { globalLocked, exempted } = useProjectsLock();
  if (!(globalLocked && exempted)) return null;
  return (
    <div
      className="flex items-center gap-2 rounded-md border border-primary/40 bg-primary/10 px-4 py-2.5 text-sm text-foreground"
      data-testid="banner-submit-asap"
    >
      <Send className="h-4 w-4 shrink-0 text-primary" />
      <p className="leading-relaxed">
        <span className="font-semibold">Submissions close soon.</span> Your team
        can still add entries — please add your revenue &amp; order book entries
        as soon as possible.
      </p>
    </div>
  );
}

// `canRequest` = the current user is the team leader (only they may request).
// The button also requires the admin "Allow request to submit" Config toggle.
export function ProjectsLockBanner({
  canRequest = false,
}: {
  canRequest?: boolean;
}) {
  const { locked, message, submissionRequestEnabled } = useProjectsLock();
  if (!locked) return null;
  const showRequest = canRequest && submissionRequestEnabled;
  return (
    <div
      className="flex items-start gap-3 rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-200"
      data-testid="banner-projects-locked"
    >
      <Lock className="mt-0.5 h-4 w-4 shrink-0" />
      <div className="space-y-2">
        <p className="whitespace-pre-wrap leading-relaxed">{message}</p>
        {showRequest ? <RequestToSubmit /> : null}
      </div>
    </div>
  );
}

// The "Request to submit" button + modal. Shows a confirmation line once the
// team already has a pending request (also survives reload).
function RequestToSubmit() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [purpose, setPurpose] = useState("");

  const { data } = useQuery({
    queryKey: ["my-submission-request"],
    queryFn: getMySubmissionRequest,
    staleTime: 30_000,
  });
  const pending = data?.pending ?? false;

  const submit = useMutation({
    mutationFn: () => createSubmissionRequest(purpose.trim()),
    onSuccess: () => {
      toast({ title: "Request submitted" });
      setOpen(false);
      setPurpose("");
      queryClient.invalidateQueries({ queryKey: ["my-submission-request"] });
    },
    onError: (err: unknown) =>
      toast({
        title: "Could not send request",
        description: err instanceof Error ? err.message : "Please try again.",
        variant: "destructive",
      }),
  });

  if (pending) {
    return (
      <p
        className="flex items-center gap-1.5 text-xs font-medium text-emerald-700 dark:text-emerald-400"
        data-testid="text-request-submitted"
      >
        <CheckCircle2 className="h-3.5 w-3.5" />
        Request submitted — an admin will review your request.
      </p>
    );
  }

  return (
    <>
      <Button
        size="sm"
        variant="outline"
        className="h-8 border-amber-400 bg-white/60 text-amber-900 hover:bg-white dark:bg-transparent dark:text-amber-200"
        onClick={() => setOpen(true)}
        data-testid="button-request-to-submit"
      >
        <Send className="mr-1.5 h-3.5 w-3.5" /> Request to submit
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Request to submit</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Submissions are paused. Tell the admin what you need to upload and
              why, and they'll review your request.
            </p>
            <Textarea
              value={purpose}
              onChange={(e) => setPurpose(e.target.value)}
              rows={4}
              maxLength={1000}
              placeholder="e.g. We closed a new client and need to upload the BRD + revenue entry…"
              data-testid="input-request-purpose"
            />
            <div className="flex justify-end">
              <Button
                size="sm"
                onClick={() => submit.mutate()}
                disabled={submit.isPending}
                data-testid="button-send-request"
              >
                {submit.isPending ? (
                  <Spinner className="mr-2 h-4 w-4" />
                ) : (
                  <Send className="mr-2 h-4 w-4" />
                )}
                Submit request
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
