// Frontend API helpers for the admin BRD → Google Drive migration (Config page
// button). Bypasses Orval/OpenAPI codegen on purpose — isolated additive
// feature, same pattern as page-views-api.ts / chatbot-history-api.ts.
import { customFetch } from "@workspace/api-client-react";

export type BrdDriveStatus = {
  configured: boolean;
  running: boolean;
  total: number;
  migrated: number;
  failed: number;
  pending: number;
};

export type BrdDriveMigrateResult = {
  ok: true;
  // Per-run counts (this click).
  processed: number;
  succeeded: number;
  failed: number;
  batchLimit: number;
  moreRemaining: boolean;
  // Overall totals across all BRDs.
  total: number;
  migrated: number;
  pending: number;
  failedTotal: number;
};

export function getBrdDriveStatus(): Promise<BrdDriveStatus> {
  return customFetch<BrdDriveStatus>("/api/admin/brd-drive/status");
}

// Kick off one migration batch. Resolves with the batch result; the route
// processes up to its batch limit, skipping already-migrated rows, so the
// caller can re-invoke while `moreRemaining` is true.
export function runBrdDriveMigration(): Promise<BrdDriveMigrateResult> {
  return customFetch<BrdDriveMigrateResult>("/api/admin/brd-drive/migrate", {
    method: "POST",
  });
}
