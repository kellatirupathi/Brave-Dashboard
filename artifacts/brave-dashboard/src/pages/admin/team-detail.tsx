import { useParams, Link } from "wouter";
import {
  useGetTeam,
  useListOrderBookEntries,
  useListRevenueEntries,
} from "@workspace/api-client-react";
import { formatINR } from "@/lib/format";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
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
import { ArrowLeft, Users, FolderKanban, IndianRupee, ListChecks } from "lucide-react";

export default function AdminTeamDetail() {
  const params = useParams<{ id: string }>();
  const teamId = Number(params.id);

  const { data: team, isLoading: teamLoading } = useGetTeam(teamId, {
    query: { enabled: Number.isFinite(teamId) },
  });
  const { data: orderBook = [] } = useListOrderBookEntries(
    { teamId },
    { query: { enabled: Number.isFinite(teamId) } },
  );
  const { data: revenue = [] } = useListRevenueEntries(
    { teamId },
    { query: { enabled: Number.isFinite(teamId) } },
  );

  if (teamLoading || !team) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  const projects = (team as any).projects ?? [];
  const statusVariant =
    team.status === "active"
      ? "default"
      : team.status === "pending"
        ? "secondary"
        : "destructive";

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/admin/teams">
          <Button variant="ghost" size="sm" data-testid="button-back-to-teams">
            <ArrowLeft className="w-4 h-4 mr-1" /> Back to Teams
          </Button>
        </Link>
      </div>

      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight" data-testid="text-team-name">
            {team.name}
          </h1>
          <p className="text-muted-foreground mt-1">
            {team.tagline || "—"} · {team.campusName}
          </p>
        </div>
        <Badge variant={statusVariant as any} className="text-xs uppercase tracking-wide">
          {team.status}
        </Badge>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard
          icon={<Users className="w-4 h-4" />}
          label="Members"
          value={String(team.memberCount ?? team.members?.length ?? 0)}
        />
        <StatCard
          icon={<FolderKanban className="w-4 h-4" />}
          label="Projects"
          value={String(team.projectCount ?? projects.length)}
        />
        <StatCard
          icon={<IndianRupee className="w-4 h-4" />}
          label="Verified Revenue"
          value={formatINR(team.totalRevenue ?? 0)}
        />
        <StatCard
          icon={<ListChecks className="w-4 h-4" />}
          label="Verified Order Book"
          value={formatINR(team.totalOrderBook ?? 0)}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Members ({team.members?.length ?? 0})</CardTitle>
        </CardHeader>
        <CardContent>
          {team.members?.length ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {team.members.map((m: any) => (
                <div
                  key={m.userId}
                  className="flex items-center gap-3 p-3 rounded-md border"
                  data-testid={`member-${m.userId}`}
                >
                  <Avatar>
                    <AvatarImage src={m.profileImage || undefined} />
                    <AvatarFallback>
                      {(m.firstName?.[0] ?? "?")}
                      {(m.lastName?.[0] ?? "")}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">
                      {m.firstName} {m.lastName}
                    </p>
                    <p className="text-xs text-muted-foreground truncate">{m.email}</p>
                  </div>
                  {m.isLeader && (
                    <Badge variant="secondary" className="text-[10px]">
                      Leader
                    </Badge>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No members yet.</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Projects ({projects.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {projects.length === 0 ? (
            <p className="text-sm text-muted-foreground">No projects submitted yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Project</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Verified Revenue</TableHead>
                  <TableHead className="text-right">Verified Order Book</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {projects.map((p: any) => (
                  <TableRow key={p.id} data-testid={`project-${p.id}`}>
                    <TableCell>
                      <div className="font-medium">{p.title}</div>
                      {p.description && (
                        <div className="text-xs text-muted-foreground truncate max-w-[400px]">
                          {p.description}
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-[10px] capitalize">
                        {p.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right font-medium">
                      {formatINR(p.verifiedRevenue ?? 0)}
                    </TableCell>
                    <TableCell className="text-right font-medium">
                      {formatINR(p.verifiedOrderBook ?? 0)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Order Book Entries ({orderBook.length})</CardTitle>
          </CardHeader>
          <CardContent>
            {orderBook.length === 0 ? (
              <p className="text-sm text-muted-foreground">No entries.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Client</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {orderBook.map((e: any) => (
                    <TableRow key={e.id} data-testid={`ob-${e.id}`}>
                      <TableCell className="text-sm">{e.clientName ?? "—"}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-[10px] capitalize">
                          {e.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        {formatINR(e.verifiedAmount ?? e.amount ?? 0)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Revenue Entries ({revenue.length})</CardTitle>
          </CardHeader>
          <CardContent>
            {revenue.length === 0 ? (
              <p className="text-sm text-muted-foreground">No entries.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Client</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {revenue.map((e: any) => (
                    <TableRow key={e.id} data-testid={`rev-${e.id}`}>
                      <TableCell className="text-sm">{e.clientName ?? "—"}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-[10px] capitalize">
                          {e.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        {formatINR(e.verifiedAmount ?? e.amount ?? 0)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
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
