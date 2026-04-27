import {
  useListDemoDayApplications,
  useUpdateDemoDayApplicationAdmin,
  getListDemoDayApplicationsQueryKey,
  UpdateDemoDayApplicationBodyStatus,
  type UpdateDemoDayApplicationBody,
} from "@workspace/api-client-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { FileText } from "lucide-react";
import { formatINR } from "@/lib/format";
import { useState } from "react";

type DemoDayStatus = NonNullable<UpdateDemoDayApplicationBody["status"]>;

const STATUS_OPTIONS: { value: DemoDayStatus; label: string }[] = [
  { value: UpdateDemoDayApplicationBodyStatus.draft, label: "Draft" },
  { value: UpdateDemoDayApplicationBodyStatus.submitted, label: "Submitted" },
  { value: UpdateDemoDayApplicationBodyStatus.shortlisted, label: "Shortlisted" },
  { value: UpdateDemoDayApplicationBodyStatus.rejected, label: "Rejected" },
];

function statusVariant(s: string): "default" | "secondary" | "destructive" | "outline" {
  if (s === "shortlisted") return "default";
  if (s === "rejected") return "destructive";
  if (s === "submitted") return "secondary";
  return "outline";
}

export default function AdminDemoDay() {
  const { data: applications, isLoading } = useListDemoDayApplications();
  const updateApplication = useUpdateDemoDayApplicationAdmin();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [pendingId, setPendingId] = useState<number | null>(null);

  const handleStatusChange = (id: number, status: DemoDayStatus) => {
    setPendingId(id);
    updateApplication.mutate(
      { id, data: { status } },
      {
        onSuccess: () => {
          toast({ title: `Application marked ${status}` });
          queryClient.invalidateQueries({
            queryKey: getListDemoDayApplicationsQueryKey(),
          });
          setPendingId(null);
        },
        onError: (err) => {
          toast({
            title: "Update failed",
            description: err instanceof Error ? err.message : "Please try again.",
            variant: "destructive",
          });
          setPendingId(null);
        },
      },
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Demo Day Manager</h1>
          <p className="text-muted-foreground">
            Review Demo Day applications from eligible teams
          </p>
        </div>
      </div>

      <Card>
        {isLoading ? (
          <div className="flex h-64 items-center justify-center">
            <Spinner size="lg" />
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Team</TableHead>
                <TableHead>Revenue</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Submitted</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {applications?.map((app) => (
                <TableRow key={app.id} data-testid={`row-application-${app.id}`}>
                  <TableCell className="font-semibold">{app.teamName}</TableCell>
                  <TableCell className="font-medium text-primary">
                    {formatINR(app.totalRevenue)}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={statusVariant(app.status)}
                      className="capitalize"
                    >
                      {app.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {app.submittedAt
                      ? new Date(app.submittedAt).toLocaleDateString()
                      : "-"}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-2">
                      {pendingId === app.id && (
                        <Spinner className="w-4 h-4" />
                      )}
                      <Select
                        value={app.status}
                        onValueChange={(v) =>
                          handleStatusChange(app.id, v as DemoDayStatus)
                        }
                        disabled={pendingId === app.id}
                      >
                        <SelectTrigger
                          className="w-[150px] ml-auto"
                          data-testid={`select-status-${app.id}`}
                        >
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {STATUS_OPTIONS.map((opt) => (
                            <SelectItem
                              key={opt.value}
                              value={opt.value}
                              data-testid={`select-status-option-${opt.value}-${app.id}`}
                            >
                              {opt.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {applications?.length === 0 && (
                <TableRow>
                  <TableCell
                    colSpan={5}
                    className="h-24 text-center text-muted-foreground"
                  >
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
