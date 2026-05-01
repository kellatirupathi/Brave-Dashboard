import { useParams, useLocation, Link } from "wouter";
import {
  useGetProject,
  getGetProjectQueryKey,
  useUnverifyRevenueEntry,
  useUnverifyOrderBookEntry,
  getGetAdminReviewQueueQueryKey,
} from "@workspace/api-client-react";
import { useAuth } from "@workspace/replit-auth-web";
import { formatINR, formatDate, formatDateTime } from "@/lib/format";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  ArrowLeft,
  Wallet,
  Activity,
  FolderKanban,
  Users,
  RotateCcw,
} from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { useState } from "react";

export default function AdminProjectDetail() {
  const params = useParams<{ id: string }>();
  const id = Number(params.id);
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const { data: project, isLoading } = useGetProject(id, {
    query: {
      queryKey: getGetProjectQueryKey(id),
      enabled: Number.isFinite(id),
    },
  });

  const backHref =
    user?.role === "admin" ? "/admin/projects" : "/coordinator/projects";

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }
  if (!project) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" size="sm" onClick={() => setLocation(backHref)}>
          <ArrowLeft className="w-4 h-4 mr-2" /> Back to Projects
        </Button>
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            Project not found.
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setLocation(backHref)}
          data-testid="button-project-detail-back"
        >
          <ArrowLeft className="w-4 h-4 mr-2" /> Back to Projects
        </Button>
        <Link href={`/teams/${project.teamId}`}>
          <Button variant="outline" size="sm" data-testid="link-project-team">
            <Users className="w-4 h-4 mr-2" /> View team
          </Button>
        </Link>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <FolderKanban className="w-4 h-4" />
                <span>{project.teamName}</span>
              </div>
              <CardTitle
                className="text-3xl mt-2"
                data-testid="text-project-title"
              >
                {project.title}
              </CardTitle>
              <p className="text-muted-foreground mt-2 max-w-2xl">
                {project.description}
              </p>
              {user?.role === "admin" && (
                <p
                  className="text-xs text-muted-foreground mt-2"
                  data-testid="text-project-last-updated"
                >
                  Last updated: {formatDateTime(project.updatedAt)}
                </p>
              )}
            </div>
            <Badge
              variant={project.status === "active" ? "default" : "secondary"}
              className={
                project.status === "active"
                  ? "capitalize bg-green-600 hover:bg-green-600 text-white dark:bg-green-500 dark:hover:bg-green-500 dark:text-white"
                  : "capitalize"
              }
            >
              {project.status}
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-muted/50 p-4 rounded-lg">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
                <Wallet className="w-3.5 h-3.5" /> Verified revenue
              </div>
              <div
                className="font-semibold text-lg"
                data-testid="text-project-revenue"
              >
                {formatINR(project.verifiedRevenue)}
              </div>
            </div>
            <div className="bg-muted/50 p-4 rounded-lg">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
                <Activity className="w-3.5 h-3.5" /> Verified order book
              </div>
              <div
                className="font-semibold text-lg"
                data-testid="text-project-orderbook"
              >
                {formatINR(project.verifiedOrderBook)}
              </div>
            </div>
            <div className="bg-muted/50 p-4 rounded-lg">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
                Last updated
              </div>
              <div className="font-medium text-sm">
                {formatDate(project.updatedAt)}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Order book entries</CardTitle>
        </CardHeader>
        <CardContent>
          {project.orderBookEntries.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No order book entries yet.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Client</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead className="text-right">Verified</TableHead>
                    <TableHead className="text-right">Created</TableHead>
                    {user?.role === "admin" ? (
                      <TableHead className="text-right">Actions</TableHead>
                    ) : null}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {project.orderBookEntries.map((e) => (
                    <TableRow key={e.id} data-testid={`row-orderbook-${e.id}`}>
                      <TableCell className="font-medium">
                        {e.clientName}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="capitalize">
                          {e.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        {formatINR(e.amount)}
                      </TableCell>
                      <TableCell className="text-right">
                        {formatINR(e.verifiedAmount ?? 0)}
                      </TableCell>
                      <TableCell className="text-right text-muted-foreground">
                        {formatDate(e.createdAt)}
                      </TableCell>
                      {user?.role === "admin" ? (
                        <TableCell className="text-right">
                          {e.status === "verified" ? (
                            <OrderBookUnverifyButton
                              entryId={e.id}
                              projectId={id}
                            />
                          ) : null}
                        </TableCell>
                      ) : null}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Revenue entries</CardTitle>
        </CardHeader>
        <CardContent>
          {project.revenueEntries.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No revenue entries yet.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Client</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead className="text-right">Verified</TableHead>
                    <TableHead className="text-right">Created</TableHead>
                    {user?.role === "admin" ? (
                      <TableHead className="text-right">Actions</TableHead>
                    ) : null}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {project.revenueEntries.map((e) => (
                    <TableRow key={e.id} data-testid={`row-revenue-${e.id}`}>
                      <TableCell className="font-medium">
                        {e.clientName}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="capitalize">
                          {e.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        {formatINR(e.amount)}
                      </TableCell>
                      <TableCell className="text-right">
                        {formatINR(e.verifiedAmount ?? 0)}
                      </TableCell>
                      <TableCell className="text-right text-muted-foreground">
                        {formatDate(e.createdAt)}
                      </TableCell>
                      {user?.role === "admin" ? (
                        <TableCell className="text-right">
                          {e.status === "verified" ? (
                            <UnverifyButton entryId={e.id} projectId={id} />
                          ) : null}
                        </TableCell>
                      ) : null}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function UnverifyButton({
  entryId,
  projectId,
}: {
  entryId: number;
  projectId: number;
}) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const unverify = useUnverifyRevenueEntry();
  const [open, setOpen] = useState(false);

  const onConfirm = () => {
    unverify.mutate(
      { id: entryId },
      {
        onSuccess: () => {
          toast({
            title: "Entry unverified",
            description:
              "The entry was moved back to the pending review queue.",
          });
          queryClient.invalidateQueries({
            queryKey: getGetProjectQueryKey(projectId),
          });
          queryClient.invalidateQueries({
            queryKey: getGetAdminReviewQueueQueryKey({
              type: "revenue",
              status: "submitted",
            }),
          });
          queryClient.invalidateQueries({
            queryKey: getGetAdminReviewQueueQueryKey({
              type: "revenue",
              status: "verified",
            }),
          });
          setOpen(false);
        },
        onError: (err: unknown) => {
          const message =
            err instanceof Error ? err.message : "Failed to unverify entry";
          toast({
            title: "Unverify failed",
            description: message,
            variant: "destructive",
          });
        },
      },
    );
  };

  return (
    <>
      <Button
        size="sm"
        variant="outline"
        onClick={() => setOpen(true)}
        data-testid={`button-unverify-entry-${entryId}`}
      >
        <RotateCcw className="w-3.5 h-3.5 mr-1" /> Unverify
      </Button>
      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Move entry back to review?</AlertDialogTitle>
            <AlertDialogDescription>
              This will clear the verified amount and admin notes, move the
              entry back to <strong>Pending review</strong>, and notify the team
              leader. You can re-verify or reject it from the pending tab.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={unverify.isPending}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={onConfirm}
              disabled={unverify.isPending}
              data-testid={`button-confirm-unverify-entry-${entryId}`}
            >
              {unverify.isPending && <Spinner className="w-4 h-4 mr-2" />}
              Unverify
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function OrderBookUnverifyButton({
  entryId,
  projectId,
}: {
  entryId: number;
  projectId: number;
}) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const unverify = useUnverifyOrderBookEntry();
  const [open, setOpen] = useState(false);

  const onConfirm = () => {
    unverify.mutate(
      { id: entryId },
      {
        onSuccess: () => {
          toast({
            title: "Entry unverified",
            description:
              "The entry was moved back to the pending review queue.",
          });
          queryClient.invalidateQueries({
            queryKey: getGetProjectQueryKey(projectId),
          });
          setOpen(false);
        },
        onError: (err: unknown) => {
          const message =
            err instanceof Error ? err.message : "Failed to unverify entry";
          toast({
            title: "Unverify failed",
            description: message,
            variant: "destructive",
          });
        },
      },
    );
  };

  return (
    <>
      <Button
        size="sm"
        variant="outline"
        onClick={() => setOpen(true)}
        data-testid={`button-unverify-orderbook-${entryId}`}
      >
        <RotateCcw className="w-3.5 h-3.5 mr-1" /> Unverify
      </Button>
      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Move entry back to review?</AlertDialogTitle>
            <AlertDialogDescription>
              This will clear the verified amount and admin notes, move the
              order book entry back to <strong>Pending review</strong>, and
              notify the team leader. You can re-verify or reject it from the
              pending tab.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={unverify.isPending}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={onConfirm}
              disabled={unverify.isPending}
              data-testid={`button-confirm-unverify-orderbook-${entryId}`}
            >
              {unverify.isPending && <Spinner className="w-4 h-4 mr-2" />}
              Unverify
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
