import { useGetTeamDashboardSummary } from "@workspace/api-client-react";
import { formatINR } from "@/lib/format";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Trophy, Building2, Briefcase, FileText, CheckCircle, AlertCircle, Bell } from "lucide-react";
import { Spinner } from "@/components/ui/spinner";
import { Link } from "wouter";
import { NotificationsBell } from "@/components/notifications-bell";
import { PinnedAnnouncementBanner } from "@/components/pinned-announcement-banner";

export default function TeamDashboard() {
  const { data: summary, isLoading } = useGetTeamDashboardSummary();

  if (isLoading) {
    return <div className="flex h-64 items-center justify-center"><Spinner size="lg" /></div>;
  }

  if (!summary) {
    return <div>Failed to load dashboard</div>;
  }

  const demoDayThreshold = 200000;
  const progressPercent = Math.min((summary.totalRevenue / demoDayThreshold) * 100, 100);

  const cardLinkClass =
    "block rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background";

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <PinnedAnnouncementBanner />
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <Link
          href="/team"
          className="block rounded-md -mx-2 px-2 py-1 hover-elevate active-elevate-2 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          data-testid="link-team-header"
        >
          <h1 className="text-3xl font-bold tracking-tight text-foreground">{summary.team?.name || "Your Team"}</h1>
          <p className="text-muted-foreground">{summary.team?.tagline || "No tagline set"}</p>
        </Link>
        <div className="flex items-center gap-3 self-stretch sm:self-auto justify-end">
          {summary.demoEligible && (
            <Badge variant="default" className="px-4 py-2 text-sm bg-green-500 hover:bg-green-600 border-none text-white shadow-sm">
              <CheckCircle className="w-4 h-4 mr-2" />
              Demo Day Eligible!
            </Badge>
          )}
          <NotificationsBell />
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
        <Link href="/demo-day" className={cardLinkClass} data-testid="link-card-revenue">
          <Card className="hover-elevate active-elevate-2 transition-all cursor-pointer h-full">
            <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
              <CardTitle className="text-sm font-medium">Verified Revenue</CardTitle>
              <Trophy className="w-4 h-4 text-primary" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatINR(summary.totalRevenue)}</div>
              <Progress value={progressPercent} className="mt-3 h-2" />
              <p className="text-xs text-muted-foreground mt-2">
                {progressPercent.toFixed(1)}% of Demo Day goal
              </p>
            </CardContent>
          </Card>
        </Link>

        <Link href="/projects" className={cardLinkClass} data-testid="link-card-order-book">
          <Card className="hover-elevate active-elevate-2 transition-all cursor-pointer h-full">
            <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
              <CardTitle className="text-sm font-medium">Order Book</CardTitle>
              <Briefcase className="w-4 h-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatINR(summary.totalOrderBook)}</div>
              <p className="text-xs text-muted-foreground mt-2">
                Unverified or uncollected revenue
              </p>
            </CardContent>
          </Card>
        </Link>

        <Link href="/leaderboard" className={cardLinkClass} data-testid="link-card-national-rank">
          <Card className="hover-elevate active-elevate-2 transition-all cursor-pointer h-full">
            <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
              <CardTitle className="text-sm font-medium">National Rank</CardTitle>
              <Trophy className="w-4 h-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">#{summary.nationalRank || "—"}</div>
              <p className="text-xs text-muted-foreground mt-2">
                Across all campuses
              </p>
            </CardContent>
          </Card>
        </Link>

        <Link href="/leaderboard" className={cardLinkClass} data-testid="link-card-campus-rank">
          <Card className="hover-elevate active-elevate-2 transition-all cursor-pointer h-full">
            <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
              <CardTitle className="text-sm font-medium">Campus Rank</CardTitle>
              <Building2 className="w-4 h-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">#{summary.campusRank || "—"}</div>
              <p className="text-xs text-muted-foreground mt-2">
                At {summary.team?.campusName || "your campus"}
              </p>
            </CardContent>
          </Card>
        </Link>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Recent Announcements</CardTitle>
          </CardHeader>
          <CardContent>
            {summary.announcements.length > 0 ? (
              <div className="space-y-2">
                {summary.announcements.slice(0, 3).map((announcement) => (
                  <Link
                    key={announcement.id}
                    href="/notifications"
                    className="flex gap-4 rounded-md p-2 -mx-2 hover-elevate active-elevate-2 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    data-testid={`link-announcement-${announcement.id}`}
                  >
                    <div className="mt-1"><Bell className="w-5 h-5 text-primary" /></div>
                    <div>
                      <h4 className="font-semibold">{announcement.title}</h4>
                      <p className="text-sm text-muted-foreground line-clamp-2 mt-1">{announcement.body}</p>
                    </div>
                  </Link>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                No recent announcements
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Action Items</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <Link
                href="/projects"
                className="flex items-center gap-4 p-4 rounded-lg border hover-elevate active-elevate-2 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                data-testid="link-action-active-projects"
              >
                <FileText className="w-5 h-5 text-blue-500" />
                <div className="flex-1">
                  <h4 className="font-semibold">Active Projects</h4>
                  <p className="text-sm text-muted-foreground">{summary.activeProjects} projects running</p>
                </div>
              </Link>

              <Link
                href="/projects"
                className="flex items-center gap-4 p-4 rounded-lg border hover-elevate active-elevate-2 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                data-testid="link-action-pending-submissions"
              >
                <AlertCircle className="w-5 h-5 text-orange-500" />
                <div className="flex-1">
                  <h4 className="font-semibold">Pending Submissions</h4>
                  <p className="text-sm text-muted-foreground">{summary.pendingSubmissions} items awaiting review</p>
                </div>
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
