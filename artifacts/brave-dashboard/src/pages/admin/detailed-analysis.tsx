import {
  useListBrdAnalyses,
  useGetBrdAnalysisHistory,
  useReanalyseRevenueEntry,
  getListBrdAnalysesQueryKey,
  type BrdAnalysisListItem,
  type BrdAnalysisHistoryRecord,
  type BrdAiAnalysis,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { formatINR, formatDateTime } from "@/lib/format";
import {
  ArrowLeft,
  ChevronDown,
  ChevronRight,
  FileText,
  Bot,
  Sparkles,
  Users,
  RotateCw,
  Check,
  ChevronsUpDown,
  Download,
} from "lucide-react";
import { DocumentLinkButton } from "@/components/document-viewer";

function scoreColor(score: number | null | undefined): string {
  if (score == null) return "bg-muted text-muted-foreground";
  if (score >= 80) return "bg-emerald-100 text-emerald-800 border-emerald-200";
  if (score >= 50) return "bg-amber-100 text-amber-800 border-amber-200";
  return "bg-red-100 text-red-800 border-red-200";
}

function statusLabel(status: string): string {
  switch (status) {
    case "verified":
      return "Approved";
    case "rejected":
      return "Rejected";
    case "submitted":
      return "Pending";
    case "draft":
      return "Draft";
    default:
      return status;
  }
}

function csvCell(value: unknown): string {
  if (value == null) return "";
  let s = String(value);
  // Neutralize spreadsheet formula injection: if the value (ignoring leading
  // whitespace) starts with a formula trigger char, prefix it with a single
  // quote so Excel/Sheets treat it as text rather than a formula.
  if (/^[\s]*[=+\-@\t\r]/.test(s)) {
    s = `'${s}`;
  }
  // Quote when the value contains a comma, quote, or newline; escape inner quotes.
  if (/[",\n\r]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function exportAnalysesToCsv(rows: BrdAnalysisListItem[]): void {
  const headers = [
    "Team",
    "Campus",
    "Project",
    "Client",
    "Amount (INR)",
    "Status",
    "BRD File Link",
    "Relevancy Score",
    "Uniqueness Score",
    "Analysed At",
  ];

  const lines = [headers.map(csvCell).join(",")];
  for (const r of rows) {
    lines.push(
      [
        r.teamName,
        r.campusName,
        r.projectTitle,
        r.clientName,
        r.amount,
        statusLabel(r.status),
        r.brdUrl ?? "",
        r.brdScore ?? "",
        r.uniquenessScore ?? "",
        r.aiAnalysedAt ? formatDateTime(r.aiAnalysedAt) : "",
      ]
        .map(csvCell)
        .join(","),
    );
  }

  // Prepend a BOM so Excel reads UTF-8 correctly.
  const blob = new Blob(["\uFEFF" + lines.join("\r\n")], {
    type: "text/csv;charset=utf-8;",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const stamp = new Date().toISOString().slice(0, 10);
  a.href = url;
  a.download = `brd-analysis-${stamp}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function statusBadgeClass(status: string): string {
  switch (status) {
    case "verified":
      return "bg-emerald-100 text-emerald-800 border-emerald-200";
    case "rejected":
      return "bg-red-100 text-red-800 border-red-200";
    case "submitted":
      return "bg-amber-100 text-amber-800 border-amber-200";
    default:
      return "bg-muted text-muted-foreground";
  }
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

type CrossTeamUniqueness = {
  score?: number | null;
  flag?: string | null;
  summary?: string | null;
  compared_count?: number | null;
  matches?: Array<{
    entry_id?: number | null;
    team_id?: number | null;
    team_name?: string | null;
    client_name?: string | null;
    status?: string | null;
    brd_url?: string | null;
    match_flag?: "duplicate" | "suspicious" | null;
    reason?: string | null;
  }> | null;
};

// Unified uniqueness — ONE score comparing this BRD's stored summary against
// every approved BRD across ALL teams (the submitting team + every other team).
// Stored under the `uniqueness` key for analyses run from this feature onward.
// Read defensively: older analyses don't have it, so we fall back to the legacy
// Team / Across-Teams sections below.
type UnifiedUniqueness = {
  score?: number | null;
  flag?: string | null;
  summary?: string | null;
  compared_count?: number | null;
  matches?: Array<{
    entry_id?: number | null;
    team_id?: number | null;
    team_name?: string | null;
    client_name?: string | null;
    status?: string | null;
    brd_url?: string | null;
    same_team?: boolean | null;
    match_flag?: "duplicate" | "suspicious" | null;
    reason?: string | null;
  }> | null;
};

function UniquenessSection({ u }: { u: UnifiedUniqueness }) {
  const matches = u.matches ?? [];
  return (
    <section>
      <div className="flex items-center gap-2 mb-2">
        <Sparkles className="w-4 h-4 text-muted-foreground" />
        <h3 className="font-semibold">Uniqueness</h3>
        {u.score != null ? (
          <Badge variant="outline" className={scoreColor(u.score)}>
            {u.score}/100
          </Badge>
        ) : null}
      </div>
      {u.summary ? (
        <p className="text-sm italic text-muted-foreground mb-3">{u.summary}</p>
      ) : null}
      {matches.length === 0 ? (
        <div className="text-sm text-muted-foreground rounded-md border border-dashed p-3 italic">
          No approved BRD shares this payment&apos;s amount and date — unique
          across all teams.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-md border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr className="text-left">
                <th className="p-2 font-medium">Team</th>
                <th className="p-2 font-medium">Status</th>
                <th className="p-2 font-medium">BRD File</th>
                <th className="p-2 font-medium">Match</th>
                <th className="p-2 font-medium">Reason</th>
              </tr>
            </thead>
            <tbody>
              {matches.map((m, i) => (
                <tr
                  key={i}
                  className={
                    "border-t " +
                    (m.match_flag === "duplicate" ? "bg-red-50" : "bg-amber-50")
                  }
                >
                  <td className="p-2 align-top">
                    <div className="font-medium flex items-center gap-2">
                      {m.team_name ?? "—"}
                      {m.same_team ? (
                        <Badge
                          variant="outline"
                          className="bg-muted text-muted-foreground"
                        >
                          Same team
                        </Badge>
                      ) : null}
                    </div>
                    {m.client_name ? (
                      <div className="text-xs text-muted-foreground">
                        {m.client_name}
                      </div>
                    ) : null}
                    {m.entry_id ? (
                      <Link
                        href={`/admin/queue/detailed-analysis?entryId=${m.entry_id}`}
                        className="text-xs text-primary hover:underline"
                      >
                        Open analysis →
                      </Link>
                    ) : null}
                  </td>
                  <td className="p-2 align-top">
                    {m.status ? (
                      <Badge
                        variant="outline"
                        className={statusBadgeClass(m.status)}
                      >
                        {statusLabel(m.status)}
                      </Badge>
                    ) : (
                      <span className="text-xs text-muted-foreground italic">
                        —
                      </span>
                    )}
                  </td>
                  <td className="p-2 align-top">
                    {m.brd_url ? (
                      <DocumentLinkButton
                        url={m.brd_url}
                        label="BRD"
                        className="h-7 px-2.5 text-xs"
                        testId={`uniqueness-brd-${m.entry_id ?? i}`}
                      />
                    ) : (
                      <span className="text-xs text-muted-foreground italic">
                        —
                      </span>
                    )}
                  </td>
                  <td className="p-2 align-top">
                    <Badge
                      variant="outline"
                      className={
                        m.match_flag === "duplicate"
                          ? "bg-red-100 text-red-800 border-red-200"
                          : "bg-amber-100 text-amber-800 border-amber-200"
                      }
                    >
                      {m.match_flag ?? "match"}
                    </Badge>
                  </td>
                  <td className="p-2 align-top text-muted-foreground">
                    {m.reason ?? "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function AnalysisBody({ detail }: { detail: BrdAiAnalysis }) {
  const pdf = detail.brd_pdf_summary;
  const unified =
    (detail as BrdAiAnalysis & { uniqueness?: UnifiedUniqueness | null })
      .uniqueness ?? null;
  const crossTeam =
    (
      detail as BrdAiAnalysis & {
        cross_team_uniqueness?: CrossTeamUniqueness | null;
      }
    ).cross_team_uniqueness ?? null;
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

      {unified ? <UniquenessSection u={unified} /> : null}

      {!unified ? (
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
                    <th className="p-2 font-medium">Status</th>
                    <th className="p-2 font-medium">BRD File</th>
                    <th className="p-2 font-medium">Similarity</th>
                    <th className="p-2 font-medium">Flag</th>
                    <th className="p-2 font-medium">Reason</th>
                  </tr>
                </thead>
                <tbody>
                  {(detail.uniqueness_comparison ?? []).map((c, i) => {
                    // `compared_status` is attached at read time by the API
                    // (the compared entry's live verified/rejected status); it
                    // isn't in the generated type yet, so read it defensively.
                    const comparedStatus = (
                      c as { compared_status?: string | null }
                    ).compared_status;
                    return (
                      <tr
                        key={i}
                        className={
                          "border-t " +
                          (c.flag === "duplicate"
                            ? "bg-red-50"
                            : c.flag === "suspicious"
                              ? "bg-amber-50"
                              : "")
                        }
                      >
                        <td className="p-2 align-top">
                          <div>{c.entry_label ?? "—"}</div>
                          {c.compared_client_name ? (
                            <div className="text-xs text-muted-foreground">
                              {c.compared_client_name}
                            </div>
                          ) : null}
                          {c.compared_entry_id ? (
                            <Link
                              href={`/admin/queue/detailed-analysis?entryId=${c.compared_entry_id}`}
                              className="text-xs text-primary hover:underline"
                            >
                              Open analysis →
                            </Link>
                          ) : null}
                        </td>
                        <td className="p-2 align-top">
                          {comparedStatus ? (
                            <Badge
                              variant="outline"
                              className={statusBadgeClass(comparedStatus)}
                            >
                              {statusLabel(comparedStatus)}
                            </Badge>
                          ) : (
                            <span className="text-xs text-muted-foreground italic">
                              —
                            </span>
                          )}
                        </td>
                        <td className="p-2 align-top">
                          {c.compared_brd_url ? (
                            <DocumentLinkButton
                              url={c.compared_brd_url}
                              label="BRD"
                              className="h-7 px-2.5 text-xs"
                              testId={`compared-brd-${c.compared_entry_id ?? i}`}
                            />
                          ) : (
                            <span className="text-xs text-muted-foreground italic">
                              —
                            </span>
                          )}
                        </td>
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
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      ) : null}

      {!unified && crossTeam ? (
        <section>
          <div className="flex items-center gap-2 mb-2">
            <Users className="w-4 h-4 text-muted-foreground" />
            <h3 className="font-semibold">Across-Teams Uniqueness</h3>
            {crossTeam.score != null ? (
              <Badge variant="outline" className={scoreColor(crossTeam.score)}>
                {crossTeam.score}/100
              </Badge>
            ) : null}
          </div>
          {crossTeam.summary ? (
            <p className="text-sm italic text-muted-foreground mb-3">
              {crossTeam.summary}
            </p>
          ) : null}
          {(crossTeam.matches ?? []).length === 0 ? (
            <div className="text-sm text-muted-foreground rounded-md border border-dashed p-3 italic">
              No BRD from any other team matched this payment — unique across
              all teams.
            </div>
          ) : (
            <div className="overflow-x-auto rounded-md border">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr className="text-left">
                    <th className="p-2 font-medium">Team</th>
                    <th className="p-2 font-medium">Status</th>
                    <th className="p-2 font-medium">BRD File</th>
                    <th className="p-2 font-medium">Match</th>
                    <th className="p-2 font-medium">Reason</th>
                  </tr>
                </thead>
                <tbody>
                  {(crossTeam.matches ?? []).map((m, i) => (
                    <tr
                      key={i}
                      className={
                        "border-t " +
                        (m.match_flag === "duplicate"
                          ? "bg-red-50"
                          : "bg-amber-50")
                      }
                    >
                      <td className="p-2 align-top">
                        <div className="font-medium">{m.team_name ?? "—"}</div>
                        {m.client_name ? (
                          <div className="text-xs text-muted-foreground">
                            {m.client_name}
                          </div>
                        ) : null}
                        {m.entry_id ? (
                          <Link
                            href={`/admin/queue/detailed-analysis?entryId=${m.entry_id}`}
                            className="text-xs text-primary hover:underline"
                          >
                            Open analysis →
                          </Link>
                        ) : null}
                      </td>
                      <td className="p-2 align-top">
                        {m.status ? (
                          <Badge
                            variant="outline"
                            className={statusBadgeClass(m.status)}
                          >
                            {statusLabel(m.status)}
                          </Badge>
                        ) : (
                          <span className="text-xs text-muted-foreground italic">
                            —
                          </span>
                        )}
                      </td>
                      <td className="p-2 align-top">
                        {m.brd_url ? (
                          <DocumentLinkButton
                            url={m.brd_url}
                            label="BRD"
                            className="h-7 px-2.5 text-xs"
                            testId={`crossteam-brd-${m.entry_id ?? i}`}
                          />
                        ) : (
                          <span className="text-xs text-muted-foreground italic">
                            —
                          </span>
                        )}
                      </td>
                      <td className="p-2 align-top">
                        <Badge
                          variant="outline"
                          className={
                            m.match_flag === "duplicate"
                              ? "bg-red-100 text-red-800 border-red-200"
                              : "bg-amber-100 text-amber-800 border-amber-200"
                          }
                        >
                          {m.match_flag ?? "match"}
                        </Badge>
                      </td>
                      <td className="p-2 align-top text-muted-foreground">
                        {m.reason ?? "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      ) : null}
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

// Compact, expandable cell for the AI-extracted BRD summary. Shows a short
// preview with a "...more" toggle so long summaries don't bloat the row.
function SummaryCell({ text }: { text: string | null | undefined }) {
  const [open, setOpen] = useState(false);
  if (!text || !text.trim()) {
    return <span className="text-xs text-muted-foreground italic">—</span>;
  }
  const clean = text.trim();
  const LIMIT = 90;
  const isLong = clean.length > LIMIT;
  const shown = open || !isLong ? clean : clean.slice(0, LIMIT).trimEnd();
  return (
    <div className="max-w-[340px] text-xs text-muted-foreground">
      {shown}
      {isLong ? (
        <>
          {open ? " " : "… "}
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            className="font-medium text-primary hover:underline"
          >
            {open ? "less" : "...more"}
          </button>
        </>
      ) : null}
    </div>
  );
}

// Per-row "Regenerate" button. Re-runs the AI BRD auditor on this entry
// (extracts a fresh summary + relevancy, then re-checks uniqueness against all
// approved BRDs) and refreshes the list when done.
function RegenerateButton({ entryId }: { entryId: number }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { mutate, isPending } = useReanalyseRevenueEntry();
  return (
    <Button
      variant="outline"
      size="sm"
      disabled={isPending}
      data-testid={`button-regenerate-${entryId}`}
      onClick={() => {
        mutate(
          { id: entryId },
          {
            onSuccess: () => {
              toast({
                title: "Analysis regenerated",
                description:
                  "Summary, relevancy and uniqueness have been refreshed.",
              });
              queryClient.invalidateQueries({
                queryKey: getListBrdAnalysesQueryKey(),
              });
            },
            onError: () => {
              toast({
                variant: "destructive",
                title: "Regeneration failed",
                description: "Could not re-analyse this BRD. Try again.",
              });
            },
          },
        );
      }}
    >
      <RotateCw className={`size-4 ${isPending ? "animate-spin" : ""}`} />
      {isPending ? "Regenerating…" : "Regenerate"}
    </Button>
  );
}

function ListView() {
  const { data, isLoading, error } = useListBrdAnalyses();
  const items: BrdAnalysisListItem[] = data?.items ?? [];

  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [campusFilter, setCampusFilter] = useState<string>("all");
  const [campusOpen, setCampusOpen] = useState(false);

  // Unique campus names present in the data, for the campus filter dropdown.
  const campusOptions = useMemo(() => {
    const set = new Set<string>();
    for (const it of items) {
      if (it.campusName && it.campusName.trim()) set.add(it.campusName);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [items]);

  // Apply the status + campus filters. "Approved" maps to the verified status.
  const filtered = useMemo(() => {
    return items.filter((it) => {
      const statusOk =
        statusFilter === "all" ? true : it.status === statusFilter;
      const campusOk =
        campusFilter === "all" ? true : it.campusName === campusFilter;
      return statusOk && campusOk;
    });
  }, [items, statusFilter, campusFilter]);

  const byTeam = useMemo(() => {
    const groups = new Map<
      string,
      {
        teamId: number;
        teamName: string;
        campusName: string;
        rows: BrdAnalysisListItem[];
      }
    >();
    for (const it of filtered) {
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
  }, [filtered]);

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
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <TabsList>
          <TabsTrigger value="all" data-testid="tab-all-entries">
            All Entries
          </TabsTrigger>
          <TabsTrigger value="team" data-testid="tab-by-team">
            By Team
          </TabsTrigger>
        </TabsList>

        <div className="flex flex-wrap items-center gap-2">
          {/* Export entire dataset to CSV */}
          <Button
            variant="outline"
            onClick={() => exportAnalysesToCsv(items)}
            data-testid="button-export-csv"
          >
            <Download className="mr-2 size-4" />
            Export CSV
          </Button>

          {/* Status filter */}
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger
              className="w-[150px]"
              data-testid="select-status-filter"
            >
              <SelectValue placeholder="All status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All status</SelectItem>
              <SelectItem value="verified">Approved</SelectItem>
              <SelectItem value="rejected">Rejected</SelectItem>
            </SelectContent>
          </Select>

          {/* Campus filter — searchable + scrollable */}
          <Popover open={campusOpen} onOpenChange={setCampusOpen}>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                role="combobox"
                aria-expanded={campusOpen}
                className="w-[200px] justify-between font-normal"
                data-testid="select-campus-filter"
              >
                <span className="truncate">
                  {campusFilter === "all" ? "All campuses" : campusFilter}
                </span>
                <ChevronsUpDown className="ml-2 size-4 shrink-0 opacity-50" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[240px] p-0" align="end">
              <Command>
                <CommandInput placeholder="Search campus…" />
                <CommandList>
                  <CommandEmpty>No campus found.</CommandEmpty>
                  <CommandGroup>
                    <CommandItem
                      value="All campuses"
                      onSelect={() => {
                        setCampusFilter("all");
                        setCampusOpen(false);
                      }}
                    >
                      <Check
                        className={`mr-2 size-4 ${
                          campusFilter === "all" ? "opacity-100" : "opacity-0"
                        }`}
                      />
                      All campuses
                    </CommandItem>
                    {campusOptions.map((campus) => (
                      <CommandItem
                        key={campus}
                        value={campus}
                        onSelect={() => {
                          setCampusFilter(campus);
                          setCampusOpen(false);
                        }}
                      >
                        <Check
                          className={`mr-2 size-4 ${
                            campusFilter === campus
                              ? "opacity-100"
                              : "opacity-0"
                          }`}
                        />
                        <span className="truncate">{campus}</span>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
        </div>
      </div>

      <TabsContent value="all" className="mt-4">
        <Card className="p-0 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr className="text-left">
                  <th className="p-3 font-medium">Team</th>
                  <th className="p-3 font-medium">Campus</th>
                  <th className="p-3 font-medium">Project</th>
                  <th className="p-3 font-medium">Client</th>
                  <th className="p-3 font-medium">Summary</th>
                  <th className="p-3 font-medium">Status</th>
                  <th className="p-3 font-medium">BRD File</th>
                  <th className="p-3 font-medium">Relevancy</th>
                  <th className="p-3 font-medium">Uniqueness</th>
                  <th className="p-3 font-medium">Analysed at</th>
                  <th className="p-3 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr>
                    <td
                      colSpan={11}
                      className="p-6 text-center text-sm text-muted-foreground italic"
                    >
                      No entries match the selected filters.
                    </td>
                  </tr>
                ) : null}
                {filtered.map((it) => (
                  <tr
                    key={it.id}
                    className="border-t hover:bg-muted/30"
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
                    <td className="p-3 text-muted-foreground">
                      {it.clientName}
                    </td>
                    <td className="p-3 align-top">
                      <SummaryCell
                        text={
                          (
                            it as BrdAnalysisListItem & {
                              summary?: string | null;
                            }
                          ).summary
                        }
                      />
                    </td>
                    <td className="p-3">
                      <Badge
                        variant="outline"
                        className={statusBadgeClass(it.status)}
                      >
                        {statusLabel(it.status)}
                      </Badge>
                    </td>
                    <td className="p-3">
                      {it.brdUrl ? (
                        <DocumentLinkButton url={it.brdUrl} label="View BRD" />
                      ) : (
                        <span className="text-xs text-muted-foreground italic">
                          —
                        </span>
                      )}
                    </td>
                    <td className="p-3">
                      <Badge
                        variant="outline"
                        className={scoreColor(it.brdScore)}
                      >
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
                    <td className="p-3 text-right whitespace-nowrap">
                      <RegenerateButton entryId={it.id} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </TabsContent>

      <TabsContent value="team" className="mt-4 space-y-3">
        {byTeam.length === 0 ? (
          <Card className="p-6 text-sm text-muted-foreground italic">
            No entries match the selected filters.
          </Card>
        ) : (
          byTeam.map((g) => <TeamGroup key={g.teamId} group={g} />)
        )}
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
            <table className="w-full text-sm table-fixed">
              <colgroup>
                <col className="w-[18%]" />
                <col className="w-[16%]" />
                <col className="w-[12%]" />
                <col className="w-[12%]" />
                <col className="w-[12%]" />
                <col className="w-[12%]" />
                <col className="w-[18%]" />
              </colgroup>
              <thead className="bg-muted/30">
                <tr className="text-left">
                  <th className="p-2 font-medium">Project</th>
                  <th className="p-2 font-medium">Client</th>
                  <th className="p-2 font-medium">Status</th>
                  <th className="p-2 font-medium">BRD File</th>
                  <th className="p-2 font-medium">Relevancy</th>
                  <th className="p-2 font-medium">Uniqueness</th>
                  <th className="p-2 font-medium">Analysed at</th>
                </tr>
              </thead>
              <tbody>
                {group.rows.map((it) => (
                  <tr key={it.id} className="border-t hover:bg-muted/30">
                    <td className="p-2 align-middle truncate">
                      <Link
                        href={`/admin/queue/detailed-analysis?entryId=${it.id}`}
                        className="hover:underline font-medium"
                        title={it.projectTitle}
                      >
                        {it.projectTitle}
                      </Link>
                    </td>
                    <td
                      className="p-2 align-middle text-muted-foreground truncate"
                      title={it.clientName}
                    >
                      {it.clientName}
                    </td>
                    <td className="p-2 align-middle">
                      <Badge
                        variant="outline"
                        className={statusBadgeClass(it.status)}
                      >
                        {statusLabel(it.status)}
                      </Badge>
                    </td>
                    <td className="p-2 align-middle">
                      {it.brdUrl ? (
                        <DocumentLinkButton url={it.brdUrl} label="View BRD" />
                      ) : (
                        <span className="text-xs text-muted-foreground italic">
                          —
                        </span>
                      )}
                    </td>
                    <td className="p-2 align-middle">
                      <Badge
                        variant="outline"
                        className={scoreColor(it.brdScore)}
                      >
                        {it.brdScore ?? "?"}/100
                      </Badge>
                    </td>
                    <td className="p-2 align-middle">
                      <Badge
                        variant="outline"
                        className={scoreColor(it.uniquenessScore)}
                      >
                        {it.uniquenessScore ?? "?"}/100
                      </Badge>
                    </td>
                    <td className="p-2 align-middle text-muted-foreground whitespace-nowrap">
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
    <div className="space-y-4">
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
