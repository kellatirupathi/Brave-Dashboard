import { useQuery } from "@tanstack/react-query";
import { useParams } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { FileBarChart, CheckCircle2, AlertCircle } from "lucide-react";
import { getReportByToken } from "@/lib/reports-api";

type TeamStatus = {
  teamId: number;
  teamName: string;
  submitted: boolean;
  submittedByRole: string | null;
};

type CampusReport = {
  campusId: number;
  campusName: string;
  totalTeams: number;
  submittedCount: number;
  notSubmittedCount: number;
  teams: TeamStatus[];
};

function CampusBlock({ c }: { c: CampusReport }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between gap-2 text-lg">
          <span>{c.campusName}</span>
          <Badge variant="outline">
            {c.submittedCount}/{c.totalTeams} submitted
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {c.teams.map((t) => (
          <div
            key={t.teamId}
            className="flex items-center justify-between rounded-md border p-2.5"
          >
            <span className="font-medium truncate">{t.teamName}</span>
            {t.submitted ? (
              <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100">
                <CheckCircle2 className="w-3 h-3 mr-1" />
                {t.submittedByRole === "coordinator"
                  ? "Coordinator"
                  : t.submittedByRole === "admin"
                    ? "Admin"
                    : "Student"}
              </Badge>
            ) : (
              <Badge className="bg-amber-100 text-amber-700 hover:bg-amber-100">
                <AlertCircle className="w-3 h-3 mr-1" /> Not submitted
              </Badge>
            )}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

export default function ReportView() {
  const params = useParams();
  const token = (params as { token?: string }).token ?? "";

  const { data, isLoading, error } = useQuery({
    queryKey: ["report-view", token],
    queryFn: () => getReportByToken(token),
    retry: false,
  });

  if (isLoading)
    return (
      <div className="flex h-64 items-center justify-center">
        <Spinner size="lg" />
      </div>
    );

  if (error || !data?.report)
    return (
      <div className="max-w-2xl mx-auto py-16 text-center text-muted-foreground">
        <FileBarChart className="w-10 h-10 mx-auto mb-3 opacity-40" />
        <p className="font-medium text-foreground">Report not available</p>
        <p className="text-sm">
          The link may be invalid, or you don't have access to this campus.
        </p>
      </div>
    );

  const report = data.report;
  const payload = (report.payload ?? {}) as any;

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <FileBarChart className="w-6 h-6 text-primary" /> {report.title}
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          {[report.seasonName ?? report.seasonSlug, report.weekLabel]
            .filter(Boolean)
            .join(" · ")}
        </p>
      </div>

      {/* Single-campus escalation report */}
      {payload.campus && <CampusBlock c={payload.campus as CampusReport} />}

      {/* Admin all-campuses escalation report */}
      {Array.isArray(payload.campuses) && (
        <div className="space-y-4">
          {(payload.campuses as CampusReport[]).map((c) => (
            <CampusBlock key={c.campusId} c={c} />
          ))}
        </div>
      )}

      {/* Weekly admin report: campus summary + week grid */}
      {Array.isArray(payload.campusSummary) && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Campus summary</CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Campus</TableHead>
                  <TableHead className="text-center">Total teams</TableHead>
                  <TableHead className="text-center">Filled</TableHead>
                  <TableHead className="text-center">Pending</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(
                  payload.campusSummary as Array<{
                    campusName: string;
                    totalTeams: number;
                    submitted: number;
                    pending: number;
                  }>
                ).map((c, i) => (
                  <TableRow key={i}>
                    <TableCell className="font-medium">
                      {c.campusName}
                    </TableCell>
                    <TableCell className="text-center tabular-nums">
                      {c.totalTeams}
                    </TableCell>
                    <TableCell className="text-center tabular-nums text-emerald-600">
                      {c.submitted}
                    </TableCell>
                    <TableCell className="text-center tabular-nums text-amber-600">
                      {c.pending}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {payload.grid?.rows && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">
              Journal status (team × week)
            </CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="sticky left-0 bg-background">
                    Team
                  </TableHead>
                  {(payload.grid.weeks as Array<{ weekNumber: number }>).map(
                    (w) => (
                      <TableHead key={w.weekNumber} className="text-center">
                        W{w.weekNumber}
                      </TableHead>
                    ),
                  )}
                </TableRow>
              </TableHeader>
              <TableBody>
                {(
                  payload.grid.rows as Array<{
                    teamId: number;
                    teamName: string;
                    perWeek: boolean[];
                  }>
                ).map((row) => (
                  <TableRow key={row.teamId}>
                    <TableCell className="font-medium sticky left-0 bg-background">
                      {row.teamName}
                    </TableCell>
                    {row.perWeek.map((ok, i) => (
                      <TableCell key={i} className="text-center">
                        {ok ? (
                          <span className="text-emerald-600">✓</span>
                        ) : (
                          <span className="text-muted-foreground/40">✗</span>
                        )}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
