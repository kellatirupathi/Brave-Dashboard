import {
  useListBrdAnalyses,
  useGetBrdAnalysisHistory,
  type BrdAnalysisListItem,
  type BrdAnalysisHistoryRecord,
  type BrdAiAnalysis,
} from "@workspace/api-client-react";
import { Link, useSearch } from "wouter";
import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { formatINR, formatDateTime } from "@/lib/format";
import {
  ArrowLeft,
  ChevronDown,
  ChevronRight,
  FileText,
  Bot,
  Sparkles,
} from "lucide-react";
import { DocumentLinkButton } from "@/components/document-viewer";

function scoreColor(score: number | null | undefined): string {
  if (score == null) return "bg-muted text-muted-foreground";
  if (score >= 80) return "bg-emerald-100 text-emerald-800 border-emerald-200";
  if (score >= 50) return "bg-amber-100 text-amber-800 border-amber-200";
  return "bg-red-100 text-red-800 border-red-200";
}

function scoreRingColor(score: number | null | undefined): string {
  if (score == null) return "text-muted-foreground";
  if (score >= 80) return "text-emerald-600";
  if (score >= 50) return "text-amber-600";
  return "text-red-600";
}

function ScoreCircle({
  label,
  score,
}: {
  label: string;
  score: number | null | undefined;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-lg border bg-card p-6 min-w-[160px]">
      <div className="text-xs uppercase tracking-wide text-muted-foreground mb-1">
        {label}
      </div>
      <div className={`text-5xl font-bold ${scoreRingColor(score)}`}>
        {score ?? "—"}
      </div>
      <div className="text-xs text-muted-foreground mt-1">/ 100</div>
    </div>
  );
}

function findingIcon(line: string): string {
  const trimmed = line.trim();
  if (/^[✅⚠️❌]/.test(trimmed)) return "";
  return "• ";
}

function AnalysisBody({ detail }: { detail: BrdAiAnalysis }) {
  const pdf = detail.brd_pdf_summary;
  return (
    <div className="space-y-6">
      <section>
        <div className="flex items-center gap-2 mb-2">
          <FileText className="w-4 h-4 text-muted-foreground" />
          <h3 className="font-semibold">BRD Relevancy</h3>
        </div>
        {pdf ? (
          <div className="text-sm text-muted-foreground mb-3 rounded-md border bg-muted/30 p-2">
            Total pages: <b>{pdf.total_pages ?? "?"}</b> · Images detected:{" "}
            <b>{pdf.images_detected ?? "?"}</b> · Amount match:{" "}
            <b>{pdf.amount_match ?? "?"}</b>
          </div>
        ) : null}
        <ul className="space-y-1 text-sm">
          {(detail.brd_findings ?? []).map((f, i) => (
            <li key={i} className="leading-relaxed">
              {findingIcon(f)}
              {f}
            </li>
          ))}
          {(detail.brd_findings ?? []).length === 0 ? (
            <li className="text-muted-foreground italic">No findings.</li>
          ) : null}
        </ul>
      </section>

      <section>
        <div className="flex items-center gap-2 mb-2">
          <Sparkles className="w-4 h-4 text-muted-foreground" />
          <h3 className="font-semibold">Team Uniqueness</h3>
        </div>
        {detail.uniqueness_summary ? (
          <p className="text-sm italic text-muted-foreground mb-3">
            {detail.uniqueness_summary}
          </p>
        ) : null}
        {(detail.uniqueness_findings ?? []).length > 0 ? (
          <ul className="space-y-1 text-sm mb-3">
            {(detail.uniqueness_findings ?? []).map((f, i) => (
              <li key={i} className="leading-relaxed">
                {findingIcon(f)}
                {f}
              </li>
            ))}
          </ul>
        ) : null}

        {(detail.uniqueness_comparison ?? []).length === 0 ? (
          <div className="text-sm text-muted-foreground rounded-md border border-dashed p-3 italic">
            First BRD submission — no previous BRDs to compare.
          </div>
        ) : (
          <div className="overflow-x-auto rounded-md border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr className="text-left">
                  <th className="p-2 font-medium">Entry</th>
                  <th className="p-2 font-medium">Similarity</th>
                  <th className="p-2 font-medium">Flag</th>
                  <th className="p-2 font-medium">Reason</th>
                </tr>
              </thead>
              <tbody>
                {(detail.uniqueness_comparison ?? []).map((c, i) => (
                  <tr key={i} className="border-t">
                    <td className="p-2 align-top">{c.entry_label ?? "—"}</td>
                    <td className="p-2 align-top whitespace-nowrap">
                      {c.similarity_percent ?? 0}%
                    </td>
                    <td className="p-2 align-top">
                      <Badge
                        variant="outline"
                        className={
                          c.flag === "duplicate"
                            ? "bg-red-100 text-red-800 border-red-200"
                            : c.flag === "suspicious"
                              ? "bg-amber-100 text-amber-800 border-amber-200"
                              : "bg-emerald-100 text-emerald-800 border-emerald-200"
                        }
                      >
                        {c.flag ?? "?"}
                      </Badge>
                    </td>
                    <td className="p-2 align-top text-muted-foreground">
                      {c.reason ?? "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function HistoryRow({ rec }: { rec: BrdAnalysisHistoryRecord }) {
  const [open, setOpen] = useState(false);
  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger asChild>
        <button
          type="button"
          className="w-full flex items-center gap-3 p-3 hover:bg-muted/40 text-left"
          data-testid={`history-row-${rec.id}`}
        >
          {open ? (
            <ChevronDown className="w-4 h-4 text-muted-foreground" />
          ) : (
            <ChevronRight className="w-4 h-4 text-muted-foreground" />
          )}
          <span className="text-sm flex-1">
            {formatDateTime(rec.analysedAt)}
          </span>
          <Badge variant="outline" className={scoreColor(rec.brdScore)}>
            Relevancy {rec.brdScore ?? "?"}/100
          </Badge>
          <Badge variant="outline" className={scoreColor(rec.uniquenessScore)}>
            Uniqueness {rec.uniquenessScore ?? "?"}/100
          </Badge>
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="p-4 border-t bg-muted/20">
          {rec.analysisJson ? (
            <AnalysisBody detail={rec.analysisJson as BrdAiAnalysis} />
          ) : (
            <div className="text-sm italic text-muted-foreground">
              No analysis JSON stored for this run.
            </div>
          )}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

function DetailView({ entryId }: { entryId: number }) {
  const { data, isLoading, error } = useGetBrdAnalysisHistory(entryId);

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <Spinner className="size-8" />
      </div>
    );
  }
  if (error || !data) {
    return (
      <Card className="p-6 text-sm text-destructive">
        Failed to load analysis details.
      </Card>
    );
  }

  const { entry, history } = data;
  const detail = entry.aiAnalysisDetail as BrdAiAnalysis | null;

  return (
    <div className="space-y-6">
      {/* SECTION A: Entry Info Header */}
      <Card className="p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-1">
            <div className="text-xs uppercase tracking-wide text-muted-foreground">
              Revenue Entry #{entry.id}
            </div>
            <h2 className="text-2xl font-bold">{entry.teamName}</h2>
            <div className="text-sm text-muted-foreground">
              {entry.campusName} · Project:{" "}
              <span className="font-medium text-foreground">
                {entry.projectTitle}
              </span>
            </div>
            <div className="text-sm text-muted-foreground">
              Client:{" "}
              <span className="font-medium text-foreground">
                {entry.clientName}
              </span>{" "}
              · Amount claimed:{" "}
              <span className="font-medium text-foreground">
                {formatINR(entry.amount)}
              </span>{" "}
              · Status: <Badge variant="outline">{entry.status}</Badge>
            </div>
          </div>
          {entry.brdUrl ? (
            <DocumentLinkButton url={entry.brdUrl} label="View BRD" />
          ) : null}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-4 text-sm">
          <div>
            <div className="text-xs text-muted-foreground">Payment date</div>
            <div>{entry.paymentDate}</div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">Submitted</div>
            <div>
              {entry.submittedAt ? formatDateTime(entry.submittedAt) : "—"}
            </div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">
              AI last analysed
            </div>
            <div>
              {entry.aiAnalysedAt ? formatDateTime(entry.aiAnalysedAt) : "—"}
            </div>
          </div>
        </div>
      </Card>

      {/* SECTION B + C: Scores + analysis */}
      <Card className="p-5">
        <div className="flex flex-wrap items-center gap-4 mb-5">
          <ScoreCircle label="BRD Relevancy" score={entry.brdScore} />
          <ScoreCircle label="Uniqueness" score={entry.uniquenessScore} />
          <div className="text-xs text-muted-foreground italic ml-auto">
            Showing latest analysis snapshot
          </div>
        </div>
        {detail ? (
          <AnalysisBody detail={detail} />
        ) : (
          <div className="text-sm italic text-muted-foreground">
            No analysis available yet.
          </div>
        )}
      </Card>

      {/* SECTION D: Analysis History */}
      <Card className="p-0 overflow-hidden">
        <div className="p-4 border-b">
          <h3 className="font-semibold flex items-center gap-2">
            <Bot className="w-4 h-4" />
            Analysis History
          </h3>
          <p className="text-xs text-muted-foreground mt-1">
            Every analysis run is recorded. Click a row to expand the full
            findings from that run.
          </p>
        </div>
        {history.length === 0 ? (
          <div className="p-6 text-sm text-muted-foreground italic">
            No history records yet — runs prior to this feature aren't stored.
          </div>
        ) : (
          <div className="divide-y">
            {history.map((rec) => (
              <HistoryRow key={rec.id} rec={rec} />
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

function ListView() {
  const { data, isLoading, error } = useListBrdAnalyses();
  const items: BrdAnalysisListItem[] = data?.items ?? [];

  const byTeam = useMemo(() => {
    const groups = new Map<
      string,
      { teamId: number; teamName: string; campusName: string; rows: BrdAnalysisListItem[] }
    >();
    for (const it of items) {
      const key = `${it.teamId}`;
      const g = groups.get(key);
      if (g) {
        g.rows.push(it);
      } else {
        groups.set(key, {
          teamId: it.teamId,
          teamName: it.teamName,
          campusName: it.campusName,
          rows: [it],
        });
      }
    }
    return Array.from(groups.values()).sort((a, b) =>
      a.teamName.localeCompare(b.teamName),
    );
  }, [items]);

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <Spinner className="size-8" />
      </div>
    );
  }
  if (error) {
    return (
      <Card className="p-6 text-sm text-destructive">
        Failed to load analyses.
      </Card>
    );
  }
  if (items.length === 0) {
    return (
      <Card className="p-6 text-sm text-muted-foreground italic">
        No analysed entries yet.
      </Card>
    );
  }

  return (
    <Tabs defaultValue="all">
      <TabsList>
        <TabsTrigger value="all" data-testid="tab-all-entries">
          All Entries
        </TabsTrigger>
        <TabsTrigger value="team" data-testid="tab-by-team">
          By Team
        </TabsTrigger>
      </TabsList>

      <TabsContent value="all" className="mt-4">
        <Card className="p-0 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr className="text-left">
                  <th className="p-3 font-medium">Team</th>
                  <th className="p-3 font-medium">Campus</th>
                  <th className="p-3 font-medium">Project</th>
                  <th className="p-3 font-medium">BRD Relevancy</th>
                  <th className="p-3 font-medium">Uniqueness</th>
                  <th className="p-3 font-medium">Analysed at</th>
                </tr>
              </thead>
              <tbody>
                {items.map((it) => (
                  <tr
                    key={it.id}
                    className="border-t hover:bg-muted/30 cursor-pointer"
                    data-testid={`row-entry-${it.id}`}
                  >
                    <td className="p-3">
                      <Link
                        href={`/admin/queue/detailed-analysis?entryId=${it.id}`}
                        className="block hover:underline font-medium"
                      >
                        {it.teamName}
                      </Link>
                    </td>
                    <td className="p-3 text-muted-foreground">
                      {it.campusName}
                    </td>
                    <td className="p-3">{it.projectTitle}</td>
                    <td className="p-3">
                      <Badge variant="outline" className={scoreColor(it.brdScore)}>
                        {it.brdScore ?? "?"}/100
                      </Badge>
                    </td>
                    <td className="p-3">
                      <Badge
                        variant="outline"
                        className={scoreColor(it.uniquenessScore)}
                      >
                        {it.uniquenessScore ?? "?"}/100
                      </Badge>
                    </td>
                    <td className="p-3 text-muted-foreground whitespace-nowrap">
                      {it.aiAnalysedAt ? formatDateTime(it.aiAnalysedAt) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </TabsContent>

      <TabsContent value="team" className="mt-4 space-y-3">
        {byTeam.map((g) => (
          <TeamGroup key={g.teamId} group={g} />
        ))}
      </TabsContent>
    </Tabs>
  );
}

function TeamGroup({
  group,
}: {
  group: {
    teamId: number;
    teamName: string;
    campusName: string;
    rows: BrdAnalysisListItem[];
  };
}) {
  const [open, setOpen] = useState(true);
  return (
    <Card className="p-0 overflow-hidden">
      <Collapsible open={open} onOpenChange={setOpen}>
        <CollapsibleTrigger asChild>
          <button
            type="button"
            className="w-full flex items-center gap-3 p-3 hover:bg-muted/40 text-left"
            data-testid={`team-group-${group.teamId}`}
          >
            {open ? (
              <ChevronDown className="w-4 h-4 text-muted-foreground" />
            ) : (
              <ChevronRight className="w-4 h-4 text-muted-foreground" />
            )}
            <div className="font-semibold flex-1">{group.teamName}</div>
            <div className="text-xs text-muted-foreground">
              {group.campusName}
            </div>
            <Badge variant="outline">{group.rows.length} entries</Badge>
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="overflow-x-auto border-t">
            <table className="w-full text-sm">
              <thead className="bg-muted/30">
                <tr className="text-left">
                  <th className="p-2 font-medium">Project</th>
                  <th className="p-2 font-medium">Client</th>
                  <th className="p-2 font-medium">BRD</th>
                  <th className="p-2 font-medium">Uniqueness</th>
                  <th className="p-2 font-medium">Analysed at</th>
                </tr>
              </thead>
              <tbody>
                {group.rows.map((it) => (
                  <tr key={it.id} className="border-t hover:bg-muted/30">
                    <td className="p-2">
                      <Link
                        href={`/admin/queue/detailed-analysis?entryId=${it.id}`}
                        className="hover:underline"
                      >
                        {it.projectTitle}
                      </Link>
                    </td>
                    <td className="p-2 text-muted-foreground">
                      {it.clientName}
                    </td>
                    <td className="p-2">
                      <Badge variant="outline" className={scoreColor(it.brdScore)}>
                        {it.brdScore ?? "?"}
                      </Badge>
                    </td>
                    <td className="p-2">
                      <Badge
                        variant="outline"
                        className={scoreColor(it.uniquenessScore)}
                      >
                        {it.uniquenessScore ?? "?"}
                      </Badge>
                    </td>
                    <td className="p-2 text-muted-foreground whitespace-nowrap">
                      {it.aiAnalysedAt ? formatDateTime(it.aiAnalysedAt) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}

export default function DetailedAnalysisPage() {
  const search = useSearch();
  const params = new URLSearchParams(search);
  const entryIdRaw = params.get("entryId");
  const entryId = entryIdRaw ? Number(entryIdRaw) : null;
  const validEntryId = entryId && Number.isInteger(entryId) ? entryId : null;

  return (
    <div className="p-4 sm:p-6 max-w-6xl mx-auto space-y-4">
      <div className="flex items-center justify-between">
        <Link
          href="/admin/queue"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          data-testid="link-back-to-queue"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Review Queue
        </Link>
        {validEntryId ? (
          <Link href="/admin/queue/detailed-analysis">
            <Button variant="outline" size="sm">
              View all analyses
            </Button>
          </Link>
        ) : null}
      </div>

      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Bot className="w-6 h-6" />
          Detailed AI BRD Analysis
        </h1>
        <p className="text-sm text-muted-foreground">
          {validEntryId
            ? "Full analysis details + every past run for this entry."
            : "Every analysed revenue entry across all teams, most recent first."}
        </p>
      </div>

      {validEntryId ? <DetailView entryId={validEntryId} /> : <ListView />}
    </div>
  );
}
