import { Lock } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useLeadsControl } from "@/lib/leads-control-api";

export function LeadsLockBanner() {
  const { locked, message } = useLeadsControl();
  if (!locked) return null;
  return (
    <Alert className="border-amber-300 bg-amber-50 text-amber-950">
      <Lock className="h-4 w-4" />
      <AlertTitle>Leads submissions locked</AlertTitle>
      <AlertDescription>{message}</AlertDescription>
    </Alert>
  );
}