// Student "BRAVE Finale Submissions" page. Two columns: the upload form on the
// left, the admin-authored content on the right. Only the team LEADER sees the
// form — members get the same page read-only. Every team member sees the decks
// their leader submitted.
//
// After a submit the form collapses to a thank-you message (this is also the
// state on reload, since the team already has a submission), with a small
// "Submit another pptx" text button that re-opens the form.
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useRequestUploadUrl } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import {
  CheckCircle2,
  FileUp,
  Lock,
  Presentation,
  Trophy,
  Upload,
  X,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { formatDateTime, formatINR } from "@/lib/format";
import {
  createFinaleSubmission,
  getFinaleMe,
  type FinaleSubmissionItem,
} from "@/lib/finale-api";

const FINALE_KEY = ["finale-me"];

const PPTX_MIME =
  "application/vnd.openxmlformats-officedocument.presentationml.presentation";
const PPT_MIME = "application/vnd.ms-powerpoint";

function isPptx(file: File): boolean {
  return (
    file.type === PPTX_MIME ||
    file.type === PPT_MIME ||
    /\.pptx?$/i.test(file.name)
  );
}

export default function FinalePage() {
  const { data, isLoading } = useQuery({
    queryKey: FINALE_KEY,
    queryFn: getFinaleMe,
  });

  // Once the team has at least one deck we show the thank-you state by
  // default; this flag re-opens the form ("Submit another pptx").
  const [formOpen, setFormOpen] = useState(false);

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  if (!data) return null;

  const hasSubmitted = data.items.length > 0;
  const showForm = data.canUpload && (!hasSubmitted || formOpen);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-3xl font-bold tracking-tight">
          <Trophy className="h-7 w-7 text-primary" />
          BRAVE Finale Submissions
        </h1>
        <p className="text-muted-foreground">
          Submit your final pitch deck for the BRAVE Finale.
        </p>
      </div>

      {/* Teams below the verified-revenue bar can reach the page by URL — the
          server blocks the submit either way, this explains why. */}
      {!data.eligible ? (
        <FinaleLockedForRevenue
          threshold={data.threshold}
          verifiedRevenue={data.verifiedRevenue}
        />
      ) : null}

      {/* Lock banner — replaces the form, the rest of the page still renders. */}
      {data.locked && data.eligible ? (
        <div
          className="flex items-start gap-3 rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-200"
          data-testid="banner-finale-locked"
        >
          <Lock className="mt-0.5 h-4 w-4 shrink-0" />
          <p className="whitespace-pre-wrap leading-relaxed">
            {data.lockMessage}
          </p>
        </div>
      ) : null}

      {/* 25% form / 75% guidelines. */}
      <div className="grid gap-6 lg:grid-cols-[1fr_3fr] items-start">
        {/* LEFT — form / thank-you / read-only notice */}
        <div className="space-y-6">
          {showForm ? (
            <SubmitForm
              onDone={() => setFormOpen(false)}
              canCancel={hasSubmitted}
            />
          ) : hasSubmitted ? (
            <ThankYou
              canUpload={data.canUpload}
              onAnother={() => setFormOpen(true)}
            />
          ) : !data.isLeader ? (
            <Card>
              <CardContent className="py-8 text-center text-sm text-muted-foreground">
                <Presentation className="mx-auto mb-3 h-8 w-8 opacity-40" />
                Your team leader submits the Finale deck. Anything they submit
                will show up here for the whole team.
              </CardContent>
            </Card>
          ) : null}

          {data.items.length > 0 ? (
            <SubmissionsList items={data.items} />
          ) : null}
        </div>

        {/* RIGHT — admin-authored content, rendered as markdown */}
        <Card data-testid="card-finale-content">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Guidelines</CardTitle>
          </CardHeader>
          <CardContent>
            <MarkdownContent value={data.content} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

/**
 * Admin-authored guidelines, rendered as markdown.
 *
 * Admins paste this straight out of WhatsApp, where *single asterisks* mean
 * bold — but markdown reads that as italic. We upgrade a `*…*` span to `**…**`
 * when it looks like WhatsApp bold (single asterisks, no spaces hugging the
 * text, all on one line) so the intent survives. Text already using `**bold**`
 * is untouched, since the `[^*]` bounds can't match the inner asterisks.
 *
 * react-markdown escapes raw HTML by default, so admin content can't inject
 * markup into the page.
 */
function MarkdownContent({ value }: { value: string }) {
  const normalized = value.replace(
    /(^|[^*])\*([^*\s][^*\n]*[^*\s]|[^*\s])\*(?!\*)/g,
    "$1**$2**",
  );
  return (
    <div
      className="prose prose-sm dark:prose-invert max-w-none text-muted-foreground prose-headings:text-foreground prose-strong:text-foreground prose-a:text-primary break-words"
      data-testid="finale-content-markdown"
    >
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{normalized}</ReactMarkdown>
    </div>
  );
}

// The thank-you state shown once the team has submitted at least one deck.
function ThankYou({
  canUpload,
  onAnother,
}: {
  canUpload: boolean;
  onAnother: () => void;
}) {
  return (
    <Card data-testid="card-finale-thanks">
      <CardContent className="space-y-3 py-8 text-center">
        <CheckCircle2 className="mx-auto h-10 w-10 text-emerald-600" />
        <p className="font-medium">Thank you for submitting!</p>
        <p className="text-sm text-muted-foreground">
          Your deck has been received — an admin will review it shortly.
        </p>
        {canUpload ? (
          <button
            type="button"
            onClick={onAnother}
            className="text-sm font-medium text-primary underline-offset-4 hover:underline"
            data-testid="button-submit-another"
          >
            Submit another pptx
          </button>
        ) : null}
      </CardContent>
    </Card>
  );
}

// Upload + remarks + submit. Uploads to object storage via a presigned URL
// (same 3-step flow as the BRD upload), then records the object path.
function SubmitForm({
  onDone,
  canCancel,
}: {
  onDone: () => void;
  canCancel: boolean;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const requestUpload = useRequestUploadUrl();

  const [file, setFile] = useState<File | null>(null);
  const [fileUrl, setFileUrl] = useState<string | null>(null);
  const [remarks, setRemarks] = useState("");
  const [uploading, setUploading] = useState(false);

  const handleFile = async (picked: File | undefined) => {
    if (!picked) return;
    if (!isPptx(picked)) {
      toast({
        title: "Only .pptx files",
        description: "Please upload your deck as a PowerPoint (.pptx) file.",
        variant: "destructive",
      });
      return;
    }
    setUploading(true);
    try {
      const presigned = await requestUpload.mutateAsync({
        data: {
          name: picked.name,
          size: picked.size,
          contentType: picked.type || PPTX_MIME,
        },
      });
      const put = await fetch(presigned.uploadURL, {
        method: "PUT",
        headers: { "Content-Type": picked.type || PPTX_MIME },
        body: picked,
      });
      if (!put.ok) throw new Error("Upload failed");
      setFile(picked);
      setFileUrl(presigned.objectPath);
    } catch (err) {
      toast({
        title: "Could not upload",
        description: err instanceof Error ? err.message : "Please try again.",
        variant: "destructive",
      });
    } finally {
      setUploading(false);
    }
  };

  const submit = useMutation({
    mutationFn: () =>
      createFinaleSubmission({
        fileUrl: fileUrl!,
        fileName: file?.name,
        remarks: remarks.trim() || undefined,
      }),
    onSuccess: () => {
      toast({ title: "Submitted" });
      setFile(null);
      setFileUrl(null);
      setRemarks("");
      queryClient.invalidateQueries({ queryKey: FINALE_KEY });
      onDone();
    },
    onError: (err: unknown) =>
      toast({
        title: "Could not submit",
        description: err instanceof Error ? err.message : "Please try again.",
        variant: "destructive",
      }),
  });

  return (
    <Card data-testid="card-finale-form">
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Upload your deck</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="finale-file">Pitch deck (.pptx)</Label>
          {fileUrl && file ? (
            <div className="flex items-center gap-2 rounded-md border bg-muted/30 p-3 text-sm">
              <FileUp className="h-4 w-4 shrink-0 text-primary" />
              <span className="flex-1 truncate">{file.name}</span>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setFile(null);
                  setFileUrl(null);
                }}
                data-testid="button-clear-file"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          ) : (
            <label
              htmlFor="finale-file"
              className="flex cursor-pointer items-center justify-center gap-2 rounded-md border border-dashed p-6 text-sm text-muted-foreground hover:bg-muted/30"
            >
              {uploading ? (
                <>
                  <Spinner className="h-4 w-4" /> Uploading…
                </>
              ) : (
                <>
                  <Upload className="h-4 w-4" /> Choose a .pptx file
                </>
              )}
              <input
                id="finale-file"
                type="file"
                accept=".ppt,.pptx"
                className="hidden"
                disabled={uploading}
                onChange={(e) => void handleFile(e.target.files?.[0])}
                data-testid="input-finale-file"
              />
            </label>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="finale-remarks">Remarks</Label>
          <Textarea
            id="finale-remarks"
            value={remarks}
            onChange={(e) => setRemarks(e.target.value)}
            rows={4}
            maxLength={2000}
            placeholder="Anything you'd like the reviewers to know about your deck…"
            data-testid="input-finale-remarks"
          />
        </div>

        <div className="flex justify-end gap-2">
          {canCancel ? (
            <Button
              variant="outline"
              size="sm"
              onClick={onDone}
              data-testid="button-cancel-finale"
            >
              Cancel
            </Button>
          ) : null}
          <Button
            size="sm"
            onClick={() => submit.mutate()}
            disabled={!fileUrl || uploading || submit.isPending}
            data-testid="button-submit-finale"
          >
            {submit.isPending ? (
              <Spinner className="mr-2 h-4 w-4" />
            ) : (
              <Upload className="mr-2 h-4 w-4" />
            )}
            Submit
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// Every deck this team has submitted — visible to the leader AND all members.
function SubmissionsList({ items }: { items: FinaleSubmissionItem[] }) {
  return (
    <Card data-testid="card-finale-submissions">
      <CardHeader className="pb-3">
        <CardTitle className="text-base">
          Your team's submissions ({items.length})
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {items.map((item) => (
          <div
            key={item.id}
            className="rounded-md border p-3"
            data-testid={`finale-submission-${item.id}`}
          >
            <div className="flex items-start gap-2">
              <Presentation className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              <div className="min-w-0 flex-1">
                <a
                  href={`/api/storage${item.fileUrl}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block truncate text-sm font-medium hover:underline"
                >
                  {item.fileName || "Pitch deck"}
                </a>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {formatDateTime(item.createdAt)} · by {item.submitterName}
                </p>
                {item.remarks ? (
                  <p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">
                    {item.remarks}
                  </p>
                ) : null}
              </div>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

// Shown when the team hasn't hit the verified-revenue bar yet.
function FinaleLockedForRevenue({
  threshold,
  verifiedRevenue,
}: {
  threshold: number;
  verifiedRevenue: number;
}) {
  return (
    <Card>
      <CardContent className="py-10 text-center">
        <Trophy className="mx-auto mb-3 h-8 w-8 opacity-40" />
        <p className="font-medium">Not unlocked yet</p>
        <p className="mt-1 text-sm text-muted-foreground">
          The BRAVE Finale opens for teams with at least {formatINR(threshold)}{" "}
          in verified revenue. Your team is at {formatINR(verifiedRevenue)}.
        </p>
      </CardContent>
    </Card>
  );
}
