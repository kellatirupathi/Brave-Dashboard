import { useGetAuditLog } from "@workspace/api-client-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { ClipboardList, User } from "lucide-react";
import { formatDate } from "@/lib/format";

export default function AdminAuditLog() {
  const { data: logs, isLoading } = useGetAuditLog({ limit: 100 });

  if (isLoading)
    return (
      <div className="flex h-64 items-center justify-center">
        <Spinner size="lg" />
      </div>
    );

  return (
    <div className="space-y-6 max-w-6xl mx-auto w-full">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">System Audit Log</h1>
        <p className="text-muted-foreground mt-1">
          Immutable record of critical system actions
        </p>
      </div>

      <Card className="overflow-hidden">
        <CardHeader className="border-b bg-muted/20">
          <CardTitle className="text-lg flex items-center">
            <ClipboardList className="w-5 h-5 mr-2 text-primary" /> Activity
            Trail
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="divide-y">
            {logs?.map((log) => (
              <div
                key={log.id}
                className="p-4 sm:p-5 flex gap-3 sm:gap-4 hover:bg-muted/10 transition-colors"
              >
                <div className="w-10 h-10 rounded-full bg-secondary flex items-center justify-center shrink-0">
                  <User className="w-5 h-5 text-muted-foreground" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-1 sm:gap-4">
                    <p className="text-sm leading-relaxed break-words">
                      <span className="font-semibold text-foreground">
                        {log.actorName}
                      </span>{" "}
                      <span className="text-muted-foreground">
                        {log.action.replace(/_/g, " ")}
                      </span>{" "}
                      <span className="font-medium text-foreground">
                        {log.targetType}
                      </span>
                      {log.targetId ? ` #${log.targetId}` : ""}
                    </p>
                    <span className="text-xs text-muted-foreground whitespace-nowrap shrink-0">
                      {new Date(log.createdAt).toLocaleString("en-IN")}
                    </span>
                  </div>
                  {log.details && (
                    <div className="mt-2 text-xs bg-muted/40 p-3 rounded-md text-muted-foreground font-mono whitespace-pre-wrap break-all max-h-60 overflow-auto">
                      {log.details}
                    </div>
                  )}
                </div>
              </div>
            ))}
            {logs?.length === 0 && (
              <div className="p-8 text-center text-muted-foreground">
                No activity logged yet.
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
