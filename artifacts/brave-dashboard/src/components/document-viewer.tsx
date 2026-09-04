import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Download, ExternalLink, FileText, FileWarning, Paperclip } from "lucide-react";
import {
  useGetUploadedFileMetadata,
  getGetUploadedFileMetadataQueryKey,
} from "@workspace/api-client-react";
import { resolveStoredObjectUrl } from "@/lib/storage-url";

export type DocumentViewerProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  url: string | null | undefined;
  filename?: string;
  mimeType?: string;
  title?: string;
};

type PreviewKind = "pdf" | "image" | "unknown";

function resolveStorageUrl(url: string): string {
  if (!url) return url;
  const storedObjectUrl = resolveStoredObjectUrl(url);
  if (storedObjectUrl !== url) return storedObjectUrl;
  if (url.startsWith("/")) return `/api${url}`;
  return url;
}

function isStorageUrl(url: string): boolean {
  return url.startsWith("/");
}

function inferKind(url: string, mimeType?: string): PreviewKind {
  const mt = (mimeType || "").toLowerCase();
  if (mt.startsWith("image/")) return "image";
  if (mt === "application/pdf") return "pdf";
  const lower = url.toLowerCase().split("?")[0];
  if (lower.endsWith(".pdf")) return "pdf";
  if (/\.(png|jpe?g|gif|webp|bmp|svg|avif)$/.test(lower)) return "image";
  return "unknown";
}

function withQuery(url: string, params: Record<string, string>): string {
  const hasQuery = url.includes("?");
  const qs = new URLSearchParams(params).toString();
  return `${url}${hasQuery ? "&" : "?"}${qs}`;
}

export function DocumentViewer({
  open,
  onOpenChange,
  url,
  filename,
  mimeType,
  title,
}: DocumentViewerProps) {
  const resolved = useMemo(() => (url ? resolveStorageUrl(url) : ""), [url]);
  const isStorage = useMemo(() => (url ? isStorageUrl(url) : false), [url]);

  // Look up the original filename / mime type recorded at upload time so the
  // viewer shows real names instead of the random UUID object id.
  const metadataQuery = useGetUploadedFileMetadata(
    { path: url ?? "" },
    {
      query: {
        queryKey: getGetUploadedFileMetadataQueryKey({ path: url ?? "" }),
        enabled: open && !!url && isStorage,
        staleTime: 5 * 60 * 1000,
        retry: false,
      },
    },
  );
  const storedMeta = metadataQuery.data;
  const effectiveFilename = filename || storedMeta?.filename;
  const effectiveMime = mimeType || storedMeta?.contentType;

  const initialKind = useMemo(
    () => (url ? inferKind(url, effectiveMime) : "unknown"),
    [url, effectiveMime],
  );
  const [detectedMime, setDetectedMime] = useState<string | undefined>(effectiveMime);
  const [probing, setProbing] = useState(false);

  useEffect(() => {
    setDetectedMime(effectiveMime);
  }, [effectiveMime, url]);

  useEffect(() => {
    if (!open || !url || !isStorage) return;
    if (initialKind !== "unknown") return;
    if (detectedMime) return;
    if (metadataQuery.isLoading) return;
    let cancelled = false;
    setProbing(true);
    fetch(resolved, { method: "HEAD" })
      .then((r) => {
        if (cancelled) return;
        const ct = r.headers.get("Content-Type") || undefined;
        setDetectedMime(ct);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setProbing(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, url, isStorage, initialKind, detectedMime, resolved, metadataQuery.isLoading]);

  const kind: PreviewKind = useMemo(() => {
    if (!url) return "unknown";
    if (initialKind !== "unknown") return initialKind;
    if (detectedMime) return inferKind(url, detectedMime);
    return "unknown";
  }, [url, initialKind, detectedMime]);

  const previewUrl = resolved;
  const downloadUrl = isStorage
    ? withQuery(resolved, {
        download: "1",
        ...(effectiveFilename ? { filename: effectiveFilename } : {}),
      })
    : resolved;
  const openUrl = resolved;

  const displayTitle = title || effectiveFilename || "Document";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl w-[95vw] h-[90vh] p-0 gap-0 flex flex-col">
        <DialogHeader className="px-4 py-3 border-b shrink-0">
          <div className="flex items-center justify-between gap-3">
            <DialogTitle className="flex items-center gap-2 text-base truncate">
              <FileText className="w-4 h-4 shrink-0 text-muted-foreground" />
              <span className="truncate" data-testid="document-viewer-title">{displayTitle}</span>
            </DialogTitle>
            <div className="flex items-center gap-2 shrink-0 mr-8">
              <Button
                size="sm"
                variant="outline"
                asChild
                data-testid="document-viewer-open-new-tab"
              >
                <a href={openUrl} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="w-4 h-4 mr-1" /> Open in new tab
                </a>
              </Button>
              <Button
                size="sm"
                asChild
                data-testid="document-viewer-download"
              >
                <a href={downloadUrl} download={filename ?? ""}>
                  <Download className="w-4 h-4 mr-1" /> Download
                </a>
              </Button>
            </div>
          </div>
        </DialogHeader>
        <div className="flex-1 min-h-0 bg-muted/30 overflow-hidden">
          {!url ? (
            <div className="h-full flex items-center justify-center text-sm text-muted-foreground">
              No document.
            </div>
          ) : probing && kind === "unknown" ? (
            <div className="h-full flex items-center justify-center text-sm text-muted-foreground" data-testid="document-viewer-probing">
              Loading preview…
            </div>
          ) : kind === "pdf" ? (
            <iframe
              src={previewUrl}
              title={displayTitle}
              className="w-full h-full border-0 bg-white"
              data-testid="document-viewer-pdf"
            />
          ) : kind === "image" ? (
            <div className="w-full h-full overflow-auto flex items-center justify-center p-4">
              <img
                src={previewUrl}
                alt={displayTitle}
                className="max-w-full max-h-full object-contain"
                data-testid="document-viewer-image"
              />
            </div>
          ) : (
            <div className="h-full flex flex-col items-center justify-center gap-3 p-8 text-center">
              <FileWarning className="w-10 h-10 text-muted-foreground" />
              <div className="space-y-1">
                <p className="text-sm font-medium" data-testid="document-viewer-no-preview">
                  No preview available
                </p>
                <p className="text-xs text-muted-foreground">
                  This file type can't be previewed in the browser.
                  {filename ? ` (${filename})` : ""}
                </p>
              </div>
              <Button asChild size="sm">
                <a href={downloadUrl} download={filename ?? ""}>
                  <Download className="w-4 h-4 mr-1" /> Download file
                </a>
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

type DocumentLinkButtonProps = {
  url: string | null | undefined;
  label: string;
  filename?: string;
  mimeType?: string;
  variant?: "button" | "outline-button" | "inline";
  className?: string;
  testId?: string;
  icon?: React.ReactNode;
};

/**
 * Replacement for raw <a target="_blank"> document links. Renders a clickable
 * trigger that opens the in-app DocumentViewer modal.
 */
export function DocumentLinkButton({
  url,
  label,
  filename,
  mimeType,
  variant = "outline-button",
  className,
  testId,
  icon,
}: DocumentLinkButtonProps) {
  const [open, setOpen] = useState(false);
  if (!url) return null;

  const trigger =
    variant === "inline" ? (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={
          className ||
          "inline-flex items-center gap-1 text-xs text-primary underline underline-offset-2 hover:opacity-80"
        }
        data-testid={testId}
      >
        {icon ?? <Paperclip className="w-3 h-3" />}
        {label}
      </button>
    ) : (
      <Button
        type="button"
        variant={variant === "outline-button" ? "outline" : "default"}
        className={className || "w-full justify-start"}
        onClick={() => setOpen(true)}
        data-testid={testId}
      >
        {icon ?? <FileText className="w-4 h-4 mr-2" />}
        {label}
      </Button>
    );

  return (
    <>
      {trigger}
      <DocumentViewer
        open={open}
        onOpenChange={setOpen}
        url={url}
        filename={filename}
        mimeType={mimeType}
        title={label}
      />
    </>
  );
}
