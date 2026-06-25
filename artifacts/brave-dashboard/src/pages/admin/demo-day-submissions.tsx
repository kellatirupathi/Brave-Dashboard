// Admin: review the new Demo Day "best project" submissions and shortlist the
// ones to take forward. Isolated from the legacy admin Demo Day page
// (/admin/demo-day), which is untouched. Uses the hand-written submissions API.
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { formatINR } from "@/lib/format";
import {
  Rocket,
  CheckCircle2,
  XCircle,
  ExternalLink,
  FileText,
  Search,
} from "lucide-react";
import {
  listDemoDaySubmissions,
  reviewDemoDaySubmission,
  type DemoDaySubmission,
  type DemoDaySubmissionStatus,
} from "@/lib/demoday-submissions-api";

const STATUS_FILTERS: {
  key: "all" | DemoDaySubmissionStatus;
  label: string;
}[] = [
  { key: "all", label: "All" },
  { key: "submitted", label: "Submitted" },
  { key: "shortlisted", label: "Shortlisted" },
  { key: "rejected", label: "Not shortlisted" },
];

function StatusBadge({ status }: { status: DemoDaySubmissionStatus }) {
  if (status === "shortlisted")
    return (
      <Badge className="bg-green-500 hover:bg-green-600">
        <CheckCircle2 className="mr-1 h-3 w-3" /> Shortlisted
      </Badge>
    );
  if (status === "rejected")
    return <Badge variant="secondary">Not shortlisted</Badge>;
  return <Badge variant="outline">Submitted</Badge>;
}

export default function AdminDemoDaySubmissions() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<"all" | DemoDaySubmissionStatus>("all");
  const [search, setSearch] = useState("");
  const [detail, setDetail] = useState<DemoDaySubmission | null>(null);
  const [note, setNote] = useState("");

  const { data: rows, isLoading } = useQuery({
    queryKey: ["admin-demo-day-submissions"],
    queryFn: listDemoDaySubmissions,
  });

  const reviewMutation = useMutation({
    mutationFn: ({
      id,
      status,
      reviewNote,
    }: {
      id: number;
      status?: DemoDaySubmissionStatus;
      reviewNote?: string | null;
    }) => reviewDemoDaySubmission(id, { status, reviewNote }),
    onSuccess: (saved) => {
      queryClient.setQueryData<DemoDaySubmission[]>(
        ["admin-demo-day-submissions"],
        (prev) => (prev ?? []).map((r) => (r.id === saved.id ? saved : r)),
      );
      setDetail((d) => (d && d.id === saved.id ? saved : d));
      toast({ title: "Submission updated" });
    },
    onError: (err: unknown) => {
      toast({
        title: "Update failed",
        description: err instanceof Error ? err.message : "Please try again.",
        variant: "destructive",
      });
    },
  });

  const filtered = (rows ?? [])
    .filter((r) => filter === "all" || r.status === filter)
    .filter((r) => {
      if (!search.trim()) return true;
      const q = search.toLowerCase();
      return (
        r.title.toLowerCase().includes(q) ||
        r.teamName.toLowerCase().includes(q)
      );
    });

  const openDetail = (row: DemoDaySubmission) => {
    setDetail(row);
    setNote(row.reviewNote ?? "");
  };

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-3xl font-bold tracking-tight">
          <Rocket className="h-7 w-7 text-primary" /> Demo Day Submissions
        </h1>
        <p className="mt-1 text-muted-foreground">
          Best-project submissions from teams. Shortlist the ones to take
          forward for a presentation.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex gap-2">
          {STATUS_FILTERS.map((f) => (
            <Button
              key={f.key}
              size="sm"
              variant={filter === f.key ? "default" : "outline"}
              onClick={() => setFilter(f.key)}
              data-testid={`filter-${f.key}`}
            >
              {f.label}
            </Button>
          ))}
        </div>
        <div className="relative ml-auto w-full max-w-xs">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search team or title…"
            className="pl-8"
            data-testid="input-search-submissions"
          />
        </div>
      </div>

      {filtered.length === 0 ? (
        <Card>
          <CardContent className="p-10 text-center text-muted-foreground">
            No submissions found.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3">
          {filtered.map((row) => (
            <Card
              key={row.id}
              className="cursor-pointer transition-colors hover:border-primary/40"
              onClick={() => openDetail(row)}
              data-testid={`submission-${row.id}`}
            >
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center justify-between gap-3 text-base">
                  <span className="truncate">{row.title}</span>
                  <StatusBadge status={row.status} />
                </CardTitle>
              </CardHeader>
              <CardContent className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
                <span className="font-medium text-foreground">
                  {row.teamName}
                </span>
                <span>Verified revenue: {formatINR(row.totalRevenue)}</span>
                {row.link && (
                  <span className="flex items-center gap-1">
                    <ExternalLink className="h-3 w-3" /> Link
                  </span>
                )}
                {row.fileUrl && (
                  <span className="flex items-center gap-1">
                    <FileText className="h-3 w-3" /> File
                  </span>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Detail + review dialog */}
      <Dialog open={!!detail} onOpenChange={(o) => !o && setDetail(null)}>
        <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
          {detail && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center justify-between gap-3 pr-6">
                  <span>{detail.title}</span>
                  <StatusBadge status={detail.status} />
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-4 text-sm">
                <div>
                  <p className="font-medium">{detail.teamName}</p>
                  <p className="text-muted-foreground">
                    Verified revenue: {formatINR(detail.totalRevenue)}
                  </p>
                </div>
                <div>
                  <p className="mb-1 font-medium">Description</p>
                  <p className="whitespace-pre-wrap text-muted-foreground">
                    {detail.description}
                  </p>
                </div>
                {detail.link && (
                  <a
                    href={detail.link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-blue-600 underline"
                  >
                    <ExternalLink className="h-3.5 w-3.5" /> Open link
                  </a>
                )}
                {detail.fileUrl && (
                  <div>
                    <a
                      href={detail.fileUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-blue-600 underline"
                    >
                      <FileText className="h-3.5 w-3.5" /> View uploaded file
                    </a>
                  </div>
                )}
                <div className="space-y-1.5">
                  <label className="font-medium">Review note (optional)</label>
                  <Textarea
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    rows={2}
                    placeholder="Internal note / reason"
                  />
                </div>
                <div className="flex flex-wrap gap-2 pt-2">
                  <Button
                    size="sm"
                    className="bg-green-600 hover:bg-green-700"
                    disabled={reviewMutation.isPending}
                    onClick={() =>
                      reviewMutation.mutate({
                        id: detail.id,
                        status: "shortlisted",
                        reviewNote: note.trim() || null,
                      })
                    }
                    data-testid="button-shortlist"
                  >
                    <CheckCircle2 className="mr-1 h-4 w-4" /> Shortlist
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={reviewMutation.isPending}
                    onClick={() =>
                      reviewMutation.mutate({
                        id: detail.id,
                        status: "rejected",
                        reviewNote: note.trim() || null,
                      })
                    }
                    data-testid="button-reject"
                  >
                    <XCircle className="mr-1 h-4 w-4" /> Not shortlisted
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={reviewMutation.isPending}
                    onClick={() =>
                      reviewMutation.mutate({
                        id: detail.id,
                        status: "submitted",
                        reviewNote: note.trim() || null,
                      })
                    }
                  >
                    Reset to submitted
                  </Button>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
