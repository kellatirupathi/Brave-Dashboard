// Student popup shown when the admin has flagged the student's team to rename
// because its name duplicates another team's. It re-appears on every mount
// (dashboard visit / reload) until the leader renames the team to a unique
// name (which clears the server-side flag). See team-name-uniqueness-api.
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@workspace/replit-auth-web";
import { useLocation } from "wouter";
import { getMyTeamNameFlag } from "@/lib/team-name-uniqueness-api";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { AlertTriangle } from "lucide-react";

export function TeamNameDuplicatePopup() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const [dismissed, setDismissed] = useState(false);

  const { data } = useQuery({
    queryKey: ["my-team-name-flag"],
    queryFn: getMyTeamNameFlag,
    enabled: user?.role === "student",
    staleTime: 30_000,
  });

  if (user?.role !== "student" || dismissed || !data?.flagged) return null;

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) setDismissed(true);
      }}
    >
      <DialogContent data-testid="dialog-team-name-duplicate">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-500" />
            Please rename your team
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-2 text-sm text-muted-foreground">
          <p>
            Your team name{" "}
            <strong className="text-foreground">
              &ldquo;{data.teamName}&rdquo;
            </strong>{" "}
            is already being used by another team. Team names need to be unique
            across the BRAVE Programme.
          </p>
          {data.isLeader ? (
            <p>
              As the team leader, please choose a new, unique name on your team
              page. We&apos;ll warn you if a name is already taken.
            </p>
          ) : (
            <p>
              Please ask your team leader to change the team name — only the
              team leader can rename the team.
            </p>
          )}
        </div>
        <DialogFooter className="gap-2 sm:gap-2">
          <Button
            variant="outline"
            onClick={() => setDismissed(true)}
            data-testid="button-team-name-later"
          >
            Later
          </Button>
          {data.isLeader && (
            <Button
              onClick={() => {
                setDismissed(true);
                setLocation("/team");
              }}
              data-testid="button-team-name-rename"
            >
              Rename team
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
