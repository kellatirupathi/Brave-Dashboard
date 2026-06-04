import { useQuery } from "@tanstack/react-query";
import { listMyMembershipRequests } from "@/lib/membership-api";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Clock } from "lucide-react";

export const MY_MEMBERSHIP_REQUESTS_KEY = [
  "membership-requests",
  "mine",
] as const;

// Shows an "Awaiting admin approval" banner whenever the signed-in student has
// a pending membership request (join / leave / removal). Polls so the banner
// clears shortly after an admin decides.
export function PendingMembershipBanner() {
  const { data } = useQuery({
    queryKey: MY_MEMBERSHIP_REQUESTS_KEY,
    queryFn: listMyMembershipRequests,
    refetchInterval: 20000,
  });

  const pending = data ?? [];
  if (pending.length === 0) return null;

  return (
    <div className="space-y-2">
      {pending.map((mr) => {
        const isRemoval = mr.type === "leave" || mr.type === "leader_remove";
        return (
          <Alert key={mr.id} className="border-amber-300 bg-amber-50">
            <Clock className="h-4 w-4 text-amber-600" />
            <AlertTitle className="text-amber-900">
              Awaiting admin approval
            </AlertTitle>
            <AlertDescription className="text-amber-800">
              {isRemoval
                ? mr.type === "leave"
                  ? `Your request to leave "${mr.teamName}" is pending admin approval. You're still a member until it's approved.`
                  : `A request to remove ${mr.targetName} from "${mr.teamName}" is pending admin approval.`
                : `Your request to join "${mr.teamName}" is pending admin approval. You'll be notified once it's reviewed.`}
            </AlertDescription>
          </Alert>
        );
      })}
    </div>
  );
}
