import { useGetDashboardSummary } from "@workspace/api-client-react";
import { formatINR } from "@/lib/format";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { Trophy, Users, CheckCircle, AlertCircle, Megaphone } from "lucide-react";
import { Link } from "wouter";

export default function CoordinatorDashboard() {
  const { data: summary, isLoading } = useGetDashboardSummary();

  if (isLoading) return <div className="flex h-64 items-center justify-center"><Spinner size="lg" /></div>;
  if (!summary) return <div>Failed to load dashboard</div>;

  const cardLinkClass =
    "block rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background";

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Campus Dashboard</h1>
          <p className="text-muted-foreground">Overview of your campus performance</p>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
        <Link href="/coordinator/leaderboard" className={cardLinkClass} data-testid="link-card-revenue">
          <Card className="hover-elevate active-elevate-2 transition-all cursor-pointer h-full">
            <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
              <CardTitle className="text-sm font-medium">Verified Revenue</CardTitle>
              <Trophy className="w-4 h-4 text-primary" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatINR(summary.totalVerifiedRevenue)}</div>
            </CardContent>
          </Card>
        </Link>

        <Link href="/coordinator/teams" className={cardLinkClass} data-testid="link-card-teams">
          <Card className="hover-elevate active-elevate-2 transition-all cursor-pointer h-full">
            <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
              <CardTitle className="text-sm font-medium">Active Teams</CardTitle>
              <Users className="w-4 h-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{summary.activeTeams}</div>
              <p className="text-xs text-muted-foreground mt-2">
                {summary.pendingTeams} pending approval
              </p>
            </CardContent>
          </Card>
        </Link>

        <Link href="/coordinator/leaderboard" className={cardLinkClass} data-testid="link-card-demo-eligible">
          <Card className="hover-elevate active-elevate-2 transition-all cursor-pointer h-full">
            <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
              <CardTitle className="text-sm font-medium">Demo Eligible</CardTitle>
              <CheckCircle className="w-4 h-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{summary.demoEligibleTeams}</div>
              <p className="text-xs text-muted-foreground mt-2">
                Teams crossed ₹2,00,000
              </p>
            </CardContent>
          </Card>
        </Link>

        <Link href="/coordinator/teams" className={cardLinkClass} data-testid="link-card-pending-reviews">
          <Card className="hover-elevate active-elevate-2 transition-all cursor-pointer h-full">
            <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
              <CardTitle className="text-sm font-medium">Pending Reviews</CardTitle>
              <AlertCircle className="w-4 h-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{summary.pendingReviewCount}</div>
              <p className="text-xs text-muted-foreground mt-2 text-destructive">
                {summary.overdueReviewCount} overdue
              </p>
            </CardContent>
          </Card>
        </Link>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Quick Links</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-3">
            <Link
              href="/coordinator/teams"
              className="flex items-center gap-4 p-4 rounded-lg border hover-elevate active-elevate-2 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              data-testid="link-quick-teams"
            >
              <Users className="w-5 h-5 text-blue-500" />
              <div className="flex-1">
                <h4 className="font-semibold">Manage Teams</h4>
                <p className="text-sm text-muted-foreground">Approve and review campus teams</p>
              </div>
            </Link>
            <Link
              href="/coordinator/leaderboard"
              className="flex items-center gap-4 p-4 rounded-lg border hover-elevate active-elevate-2 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              data-testid="link-quick-leaderboard"
            >
              <Trophy className="w-5 h-5 text-primary" />
              <div className="flex-1">
                <h4 className="font-semibold">Campus Leaderboard</h4>
                <p className="text-sm text-muted-foreground">See team rankings</p>
              </div>
            </Link>
            <Link
              href="/coordinator/announcements"
              className="flex items-center gap-4 p-4 rounded-lg border hover-elevate active-elevate-2 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              data-testid="link-quick-announcements"
            >
              <Megaphone className="w-5 h-5 text-orange-500" />
              <div className="flex-1">
                <h4 className="font-semibold">Announcements</h4>
                <p className="text-sm text-muted-foreground">Post updates to your campus</p>
              </div>
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
