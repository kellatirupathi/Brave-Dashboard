import { useGetDashboardSummary } from "@workspace/api-client-react";
import { formatINR } from "@/lib/format";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { Trophy, Users, CheckCircle, AlertCircle } from "lucide-react";
import { Link } from "wouter";

export default function AdminDashboard() {
  const { data: summary, isLoading } = useGetDashboardSummary();

  if (isLoading) return <div className="flex h-64 items-center justify-center"><Spinner size="lg" /></div>;
  if (!summary) return <div>Failed to load dashboard</div>;

  const cardLinkClass =
    "block rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background";

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">National Dashboard</h1>
          <p className="text-muted-foreground">High-level program overview</p>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
        <Link href="/admin/leaderboard" className={cardLinkClass} data-testid="link-card-revenue">
          <Card className="hover-elevate active-elevate-2 transition-all border-primary shadow-sm bg-primary/5 cursor-pointer h-full">
            <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
              <CardTitle className="text-sm font-medium">Total Verified Revenue</CardTitle>
              <Trophy className="w-4 h-4 text-primary" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-extrabold text-primary">{formatINR(summary.totalVerifiedRevenue)}</div>
              <p className="text-xs text-muted-foreground mt-2">+ {formatINR(summary.totalOrderBook)} pending</p>
            </CardContent>
          </Card>
        </Link>

        <Link href="/admin/teams" className={cardLinkClass} data-testid="link-card-teams">
          <Card className="hover-elevate active-elevate-2 transition-all cursor-pointer h-full">
            <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
              <CardTitle className="text-sm font-medium">Active Teams</CardTitle>
              <Users className="w-4 h-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{summary.activeTeams}</div>
              <p className="text-xs text-muted-foreground mt-2">Across {summary.totalCampuses} campuses</p>
            </CardContent>
          </Card>
        </Link>

        <Link href="/admin/demo-day" className={cardLinkClass} data-testid="link-card-demo-day">
          <Card className="hover-elevate active-elevate-2 transition-all cursor-pointer h-full">
            <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
              <CardTitle className="text-sm font-medium">Demo Day Eligible</CardTitle>
              <CheckCircle className="w-4 h-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{summary.demoEligibleTeams}</div>
              <p className="text-xs text-muted-foreground mt-2">Teams crossing ₹2L mark</p>
            </CardContent>
          </Card>
        </Link>

        <Link href="/admin/queue" className={cardLinkClass} data-testid="link-card-pending-reviews">
          <Card className="hover-elevate active-elevate-2 transition-all cursor-pointer h-full">
            <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
              <CardTitle className="text-sm font-medium">Pending Reviews</CardTitle>
              <AlertCircle className="w-4 h-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{summary.pendingReviewCount}</div>
              <p className="text-xs text-destructive mt-2 font-medium">{summary.overdueReviewCount} overdue</p>
            </CardContent>
          </Card>
        </Link>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Top Campuses</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {summary.topCampuses.map((campus, i) => (
                <Link
                  key={campus.id}
                  href="/admin/campuses"
                  className="flex items-center justify-between rounded-md p-2 -mx-2 hover-elevate active-elevate-2 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  data-testid={`link-top-campus-${campus.id}`}
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded bg-muted flex items-center justify-center font-bold text-muted-foreground text-sm">#{i+1}</div>
                    <div>
                      <p className="font-semibold">{campus.name}</p>
                      <p className="text-xs text-muted-foreground">{campus.activeTeams} Teams</p>
                    </div>
                  </div>
                  <div className="font-bold">{formatINR(campus.totalRevenue)}</div>
                </Link>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Recent Activity</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-1">
              {summary.recentActivity.map((log) => (
                <Link
                  key={log.id}
                  href="/admin/audit-log"
                  className="block text-sm border-b last:border-0 rounded-md p-2 -mx-2 hover-elevate active-elevate-2 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  data-testid={`link-recent-activity-${log.id}`}
                >
                  <span className="font-semibold">{log.actorName}</span> {log.action} <span className="font-medium">{log.targetType}</span>
                  <div className="text-xs text-muted-foreground mt-1">{new Date(log.createdAt).toLocaleString()}</div>
                </Link>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
