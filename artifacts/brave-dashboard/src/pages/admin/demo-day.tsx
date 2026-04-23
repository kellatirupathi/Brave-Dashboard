import { useListDemoDayApplications } from "@workspace/api-client-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { FileText } from "lucide-react";
import { formatINR } from "@/lib/format";

export default function AdminDemoDay() {
  const { data: applications, isLoading } = useListDemoDayApplications();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Demo Day Manager</h1>
          <p className="text-muted-foreground">Review Demo Day applications from eligible teams</p>
        </div>
      </div>

      <Card>
        {isLoading ? (
          <div className="flex h-64 items-center justify-center"><Spinner size="lg" /></div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Team</TableHead>
                <TableHead>Revenue</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Submitted</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {applications?.map(app => (
                <TableRow key={app.id}>
                  <TableCell className="font-semibold">{app.teamName}</TableCell>
                  <TableCell className="font-medium text-primary">{formatINR(app.totalRevenue)}</TableCell>
                  <TableCell>
                    <Badge variant={app.status === 'shortlisted' ? 'default' : 'secondary'} className="capitalize">
                      {app.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {app.submittedAt ? new Date(app.submittedAt).toLocaleDateString() : '-'}
                  </TableCell>
                </TableRow>
              ))}
              {applications?.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="h-24 text-center text-muted-foreground">
                    <FileText className="w-8 h-8 mx-auto mb-2 opacity-50" />
                    No applications submitted yet.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        )}
      </Card>
    </div>
  );
}
