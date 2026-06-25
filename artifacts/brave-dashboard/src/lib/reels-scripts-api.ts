// Hand-written API for the admin Reel Scripts page (bypasses Orval codegen,
// like chatbot-history-api / reports-api). The library holds both imported
// reference scripts and ones generated daily by the Gemini cron.
import { customFetch } from "@workspace/api-client-react";

export type ReelScriptItem = {
  id: number;
  bucket: string;
  script: string;
  source: string; // 'imported' | 'generated'
  createdAt: string;
};

export type ReelScriptsResponse = {
  items: ReelScriptItem[];
  buckets: string[];
};

export function listReelScripts(): Promise<ReelScriptsResponse> {
  return customFetch<ReelScriptsResponse>("/api/admin/reels-scripts");
}

export function importReelScripts(
  rows: { bucket: string; script: string }[],
): Promise<{ inserted: number; skipped: number; total: number }> {
  return customFetch<{ inserted: number; skipped: number; total: number }>(
    "/api/admin/reels-scripts/import",
    {
      method: "POST",
      body: JSON.stringify({ rows }),
    },
  );
}
