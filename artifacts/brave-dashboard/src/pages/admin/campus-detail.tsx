import { Link, useLocation, useParams } from "wouter";
import {
  useGetCampus,
  useListTeams,
  useGetAuditLog,
} from "@workspace/api-client-react";
import { formatINR } from "@/lib/format";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  ArrowLeft,
  Building2,
  Users,
  IndianRupee,
  ListChecks,
  UserCog,
} from "lucide-react";

export default function AdminCampusDetail() {
  const params = useParams<{ id: string }>();
  const campusId = Number(params.id);
  const enabled = Number.isFinite(campusId);
  const [, setLocation] = useLocation();

  const {
    data: campus,
    isLoading: campusLoading,
    isError: campusError,
  } = useGetCampus(campusId, {
    query: { enabled },
  });
  const { data: teams = [], isLoading: teamsLoading } = useListTeams(
    { campusId },
    { query: { enabled } },
  );
  const { data: auditLog = [] } = useGetAuditLog(
    { limit: 200 },
    { query: { enabled } },
  );

  if (campusLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  if (!enabled || campusError || !campus) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <Link href="/admin/campuses">
            <Button
              variant="ghost"
              size="sm"
              data-testid="button-back-to-campuses"
            >
              <ArrowLeft className="w-4 h-4 mr-1" /> Back to Campuses
            </Button>
          </Link>
        </div>
        <Card>
          <CardContent className="py-12 text-center space-y-3">
            <Building2 className="w-10 h-10 mx-auto opacity-40" />
            <p className="text-lg font-semibold">Campus not found</p>
            <p className="text-sm text-muted-foreground">
              We couldn&apos;t find a campus with id {params.id}. It may have
              been removed or the link is incorrect.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const teamIds = new Set((teams as any[]).map((t) => t.id));
  const recentActivity = (auditLog as any[])
    .filter((log) => {
      if (log.targetType === "campus" && log.targetId === campus.id) return true;
      if (log.targetType === "team" && log.targetId && teamIds.has(log.targetId)) return true;
      return false;
    })
    .slice(0, 15);

  const totalOrderBook = (teams as any[]).reduce(
    (acc, t) => acc + (t.totalOrderBook ?? 0),
    0,
  );
  const totalRevenueFromTeams = (teams as any[]).reduce(
    (acc, t) => acc + (t.totalRevenue ?? 0),
    0,
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/admin/campuses">
          <Button
            variant="ghost"
            size="sm"
            data-testid="button-back-to-campuses"
          >
            <ArrowLeft className="w-4 h-4 mr-1" /> Back to Campuses
          </Button>
        </Link>
      </div>

      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div>
          <h1
            className="text-3xl font-bold tracking-tight flex items-center gap-2"
            data-testid="text-campus-name"
          >
            <Building2 className="w-7 h-7 text-primary" />
            {campus.name}
          </h1>
          <p className="text-muted-foreground mt-1">
            {campus.city}, {campus.state}
          </p>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <UserCog className="w-4 h-4 text-muted-foreground" />
          <span className="text-muted-foreground">Coordinator:</span>
          <span className="font-medium" data-testid="text-coordinator-name">
            {campus.coordinatorName || "Unassigned"}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard
          icon={<Users className="w-4 h-4" />}
          label="Active Teams"
          value={`${campus.activeTeams} / ${campus.totalTeams}`}
        />
        <StatCard
          icon={<IndianRupee className="w-4 h-4" />}
          label="Verified Revenue"
          value={formatINR(campus.totalRevenue)}
        />
        <StatCard
          icon={<ListChecks className="w-4 h-4" />}
          label="Verified Order Book"
          value={formatINR(totalOrderBook)}
        />
        <StatCard
          icon={<IndianRupee className="w-4 h-4" />}
          label="Avg Revenue / Team"
          value={
            campus.totalTeams > 0
              ? formatINR(Math.round(totalRevenueFromTeams / campus.totalTeams))
              : formatINR(0)
          }
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Teams ({teams.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {teamsLoading ? (
            <div className="flex h-32 items-center justify-center">
              <Spinner />
            </div>
          ) : teams.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No teams have been registered at this campus yet.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Team</TableHead>
                  <TableHead>Leader</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Members</TableHead>
                  <TableHead className="text-right">Revenue</TableHead>
                  <TableHead className="text-right">Order Book</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {[...(teams as any[])]
                  .sort((a, b) => (b.totalRevenue ?? 0) - (a.totalRevenue ?? 0))
                  .map((t) => {
                    const variant =
                      t.status === "active"
                        ? "default"
                        : t.status === "pending"
                          ? "secondary"
                          : "destructive";
                    return (
                      <TableRow
                        key={t.id}
                        className="cursor-pointer hover-elevate"
                        onClick={() => setLocation(`/admin/teams/${t.id}`)}
                        data-testid={`row-team-${t.id}`}
                      >
                        <TableCell className="font-semibold">
                          <Link
                            href={`/admin/teams/${t.id}`}
                            className="hover:underline"
                            data-testid={`link-team-${t.id}`}
                            onClick={(e) => e.stopPropagation()}
                          >
                            {t.name}
                          </Link>
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {t.leaderName}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant={variant as any}
                            className="text-[10px] capitalize"
                          >
                            {t.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          {t.memberCount}
                        </TableCell>
                        <TableCell className="text-right font-medium text-primary">
                          {formatINR(t.totalRevenue ?? 0)}
                        </TableCell>
                        <TableCell className="text-right text-muted-foreground">
                          {formatINR(t.totalOrderBook ?? 0)}
                        </TableCell>
                      </TableRow>
                    );
                  })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Recent Activity</CardTitle>
        </CardHeader>
        <CardContent>
          {recentActivity.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No recent activity for this campus.
            </p>
          ) : (
            <div className="space-y-1">
              {recentActivity.map((log) => (
                <div
                  key={log.id}
                  className="text-sm border-b last:border-0 p-2 -mx-2"
                  data-testid={`row-activity-${log.id}`}
                >
                  <span className="font-semibold">{log.actorName}</span>{" "}
                  {log.action}{" "}
                  <span className="font-medium">{log.targetType}</span>
                  <div className="text-xs text-muted-foreground mt-1">
                    {new Date(log.createdAt).toLocaleString()}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
          {icon}
          {label}
        </div>
        <div className="text-2xl font-bold tracking-tight">{value}</div>
      </CardContent>
    </Card>
  );
}
