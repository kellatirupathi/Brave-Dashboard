import { useGetAuditLog } from "@workspace/api-client-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { ClipboardList, User } from "lucide-react";
import { formatDate } from "@/lib/format";

export default function AdminAuditLog() {
  const { data: logs, isLoading } = useGetAuditLog({ limit: 100 });

  if (isLoading) return <div className="flex h-64 items-center justify-center"><Spinner size="lg" /></div>;

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">System Audit Log</h1>
        <p className="text-muted-foreground mt-1">Immutable record of critical system actions</p>
      </div>

      <Card>
        <CardHeader className="border-b bg-muted/20">
          <CardTitle className="text-lg flex items-center"><ClipboardList className="w-5 h-5 mr-2 text-primary" /> Activity Trail</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="divide-y">
            {logs?.map((log) => (
              <div key={log.id} className="p-4 flex gap-4 hover:bg-muted/10 transition-colors">
                <div className="w-10 h-10 rounded-full bg-secondary flex items-center justify-center shrink-0">
                  <User className="w-5 h-5 text-muted-foreground" />
                </div>
                <div className="flex-1">
                  <div className="flex items-start justify-between">
                    <p className="text-sm">
                      <span className="font-semibold text-foreground">{log.actorName}</span>
                      {' '}
                      <span className="text-muted-foreground">{log.action.replace(/_/g, ' ')}</span>
                      {' '}
                      <span className="font-medium text-foreground">{log.targetType}</span>
                      {log.targetId ? ` #${log.targetId}` : ''}
                    </p>
                    <span className="text-xs text-muted-foreground whitespace-nowrap ml-4">
                      {new Date(log.createdAt).toLocaleString('en-IN')}
                    </span>
                  </div>
                  {log.details && (
                    <div className="mt-2 text-xs bg-muted/40 p-2 rounded text-muted-foreground font-mono">
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