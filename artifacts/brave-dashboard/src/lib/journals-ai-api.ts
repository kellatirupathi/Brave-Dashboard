// Frontend API helpers for the AI journal auditor (admin journals redesign).
// Bypasses Orval/OpenAPI codegen on purpose — isolated additive feature, same
// pattern as progress-api.ts / membership-api.ts / access-api.ts.
import { customFetch } from "@workspace/api-client-react";
import type {
  BlockerPriority,
  BlockerStatus,
  JournalAiAnalysis,
} from "./progress-api";

// Subset of journal fields returned after an analyse / blocker-update call.
export type JournalAiFields = {
  id: number;
  aiAnalysis?: JournalAiAnalysis | null;
  aiAnalysedAt?: string | null;
  blockerPriority?: BlockerPriority | null;
  blockerPriorityManual?: boolean;
  blockerStatus?: BlockerStatus;
  blockerNote?: string | null;
  blockerUpdatedAt?: string | null;
};

// Run / re-run the Gemini auditor on one journal. Resolves once analysis has
// completed server-side, returning the refreshed AI fields.
export function analyseJournalNow(
  id: number,
): Promise<{ ok: boolean; journal: JournalAiFields | null }> {
  return customFetch<{ ok: boolean; journal: JournalAiFields | null }>(
    `/api/admin/journals/${id}/analyse`,
    { method: "POST" },
  );
}

// Subset of reel-scan fields returned after a reel-scan call.
export type JournalReelFields = {
  id: number;
  reelWorthy?: boolean | null;
  reelBucket?: string | null;
  reelScript?: string | null;
  reelReason?: string | null;
  reelAnalysedAt?: string | null;
};

// Run / re-run the per-journal reel scan. Resolves once it has completed
// server-side, returning the refreshed reel fields.
export function runJournalReelScan(
  id: number,
): Promise<{ ok: boolean; journal: JournalReelFields | null }> {
  return customFetch<{ ok: boolean; journal: JournalReelFields | null }>(
    `/api/admin/journals/${id}/reel-scan`,
    { method: "POST" },
  );
}

// Update blocker triage (manual priority override / status / note).
export function updateJournalBlocker(
  id: number,
  body: {
    priority?: BlockerPriority;
    status?: BlockerStatus;
    note?: string | null;
  },
): Promise<JournalAiFields> {
  return customFetch<JournalAiFields>(`/api/admin/journals/${id}/blocker`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}
