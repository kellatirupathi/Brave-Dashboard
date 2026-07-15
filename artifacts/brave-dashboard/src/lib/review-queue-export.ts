// Frontend helper to download the Review Queue CSV for the current tab.
// Hand-written (bypasses Orval codegen). Streams the file from the API with
// credentials, then triggers a browser download. Mirrors the status/search/
// sort of the on-screen list so the export matches what the admin is viewing.

type ExportStatus = "submitted" | "verified" | "rejected";
type ExportSort =
  | "newest"
  | "oldest"
  | "amount_desc"
  | "amount_asc"
  | "entries_desc"
  | "entries_asc"
  | "team_sum_desc"
  | "team_sum_asc";

export async function downloadReviewQueueCsv(opts: {
  status: ExportStatus;
  search?: string;
  sort?: ExportSort;
}): Promise<void> {
  const params = new URLSearchParams({ type: "revenue", status: opts.status });
  if (opts.search) params.set("search", opts.search);
  if (opts.sort) params.set("sort", opts.sort);

  const res = await fetch(`/api/admin/review-queue/export.csv?${params}`, {
    credentials: "include",
  });
  if (!res.ok) {
    throw new Error(`Export failed (HTTP ${res.status})`);
  }
  const blob = await res.blob();

  // Prefer the server-provided filename; fall back to a sensible default.
  const disposition = res.headers.get("content-disposition") ?? "";
  const match = disposition.match(/filename="?([^"]+)"?/);
  const filename =
    match?.[1] ??
    `brave-review-queue-${opts.status}-${new Date()
      .toISOString()
      .slice(0, 10)}.csv`;

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
