import { Eye, Lock } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useLeadsControl } from "@/lib/leads-control-api";

export function LeadsLockBanner() {
  const { locked, message, isLeadsWriter, isLoading } = useLeadsControl();

  if (locked) {
    return (
      <Alert className="border-amber-300 bg-amber-50 text-amber-950">
        <Lock className="h-4 w-4" />
        <AlertTitle>Leads submissions locked</AlertTitle>
        <AlertDescription>{message}</AlertDescription>
      </Alert>
    );
  }

  // A member sees no Add or Edit controls anywhere in Leads, so say why once
  // rather than leaving them hunting for a button that is not there.
  if (!isLoading && !isLeadsWriter) {
    return (
      <Alert className="border-sky-300 bg-sky-50 text-sky-950">
        <Eye className="h-4 w-4" />
        <AlertTitle>You are viewing your team's leads</AlertTitle>
        <AlertDescription>
          Your team leader captures clients and runs the projects. Everything
          they record shows up here for you.
        </AlertDescription>
      </Alert>
    );
  }

  return null;
}
