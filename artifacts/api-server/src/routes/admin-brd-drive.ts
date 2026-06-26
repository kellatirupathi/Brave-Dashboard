/**
 * Admin-only, MANUAL migration of BRD files from Google Cloud Storage into a
 * shareable Google Drive folder.
 *
 * Endpoints (hand-written, bypass Orval — additive/isolated):
 *   GET  /api/admin/brd-drive/status   — counts (total / migrated / pending / failed) + configured flag
 *   POST /api/admin/brd-drive/migrate  — process pending BRDs one-by-one, skipping already-migrated
 *
 * Idempotency: a revenue entry is "already migrated" iff `brd_drive_file_id` is
 * not null. The migrate run only picks rows that have a brdUrl AND no file id —
 * i.e. never-migrated OR previously-failed — so re-clicking retries failures and
 * leaves successes untouched (exactly as requested).
 *
 * This is triggered ONLY by an admin clicking the button in /admin/config. It is
 * never wired into cron or bootstrap. An in-memory lock prevents a double-click
 * (or two admins) from processing the same rows concurrently.
 */
import { Router, type IRouter, type Request, type Response } from "express";
import { and, eq, isNull, isNotNull, sql } from "drizzle-orm";
import { db, revenueEntriesTable, uploadedFilesTable } from "@workspace/db";
import { ObjectStorageService } from "../lib/objectStorage";
import { isDriveConfigured, uploadBrdToDrive } from "../lib/drive/drive-client";

const router: IRouter = Router();
const objectStorage = new ObjectStorageService();

// Cap a single migrate click so one request can't run unbounded for hours. The
// admin simply clicks again to continue with the next batch; already-migrated
// rows are skipped, so it resumes cleanly.
const MIGRATE_BATCH_LIMIT = 200;

// In-memory guard against concurrent runs (double-click / two admins). Lost on
// restart, which is fine — a fresh run just resumes from the remaining rows.
let migrating = false;

function requireAdmin(req: Request, res: Response): boolean {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return false;
  }
  if (req.user.role !== "admin") {
    res.status(403).json({ error: "Forbidden" });
    return false;
  }
  return true;
}

async function getCounts(): Promise<{
  total: number;
  migrated: number;
  failed: number;
  pending: number;
}> {
  // total   = revenue entries that have a BRD file at all
  // migrated = have a Drive file id
  // failed  = no Drive file id but a recorded migration error
  // pending = no Drive file id and no error (never attempted) + failed (retryable)
  const [row] = await db
    .select({
      total: sql<number>`count(*) filter (where ${revenueEntriesTable.brdUrl} is not null and ${revenueEntriesTable.brdUrl} <> '')`,
      migrated: sql<number>`count(*) filter (where ${revenueEntriesTable.brdDriveFileId} is not null)`,
      failed: sql<number>`count(*) filter (where ${revenueEntriesTable.brdDriveFileId} is null and ${revenueEntriesTable.brdDriveMigrationError} is not null and ${revenueEntriesTable.brdUrl} is not null and ${revenueEntriesTable.brdUrl} <> '')`,
    })
    .from(revenueEntriesTable);
  const total = Number(row?.total ?? 0);
  const migrated = Number(row?.migrated ?? 0);
  const failed = Number(row?.failed ?? 0);
  // Pending = everything with a BRD that isn't migrated yet (includes failed,
  // since a re-run retries them).
  const pending = Math.max(0, total - migrated);
  return { total, migrated, failed, pending };
}

// GET /admin/brd-drive/status
router.get(
  "/admin/brd-drive/status",
  async (req: Request, res: Response): Promise<void> => {
    if (!requireAdmin(req, res)) return;
    try {
      const counts = await getCounts();
      res.json({
        configured: isDriveConfigured(),
        running: migrating,
        ...counts,
      });
    } catch (err) {
      req.log.error({ err }, "[admin/brd-drive/status] failed");
      res.status(500).json({ error: "Failed to read migration status" });
    }
  },
);

// POST /admin/brd-drive/migrate
router.post(
  "/admin/brd-drive/migrate",
  async (req: Request, res: Response): Promise<void> => {
    if (!requireAdmin(req, res)) return;

    if (!isDriveConfigured()) {
      res.status(400).json({
        error:
          "Google Drive is not configured. Set GDRIVE_SERVICE_ACCOUNT_JSON and GDRIVE_BRD_FOLDER_ID, then try again.",
      });
      return;
    }

    if (migrating) {
      res.status(409).json({ error: "A migration is already running." });
      return;
    }

    migrating = true;
    let processed = 0;
    let succeeded = 0;
    let failed = 0;
    try {
      // Pick rows that have a BRD file but no Drive file id yet (never migrated
      // OR previously failed). Ordered oldest-first for deterministic batches.
      const candidates = await db
        .select({
          id: revenueEntriesTable.id,
          brdUrl: revenueEntriesTable.brdUrl,
        })
        .from(revenueEntriesTable)
        .where(
          and(
            isNotNull(revenueEntriesTable.brdUrl),
            sql`${revenueEntriesTable.brdUrl} <> ''`,
            isNull(revenueEntriesTable.brdDriveFileId),
          ),
        )
        .orderBy(revenueEntriesTable.id)
        .limit(MIGRATE_BATCH_LIMIT);

      for (const entry of candidates) {
        const brdUrl = entry.brdUrl;
        if (!brdUrl) continue;
        processed++;
        try {
          // Only in-app object-storage paths can be mirrored. If a BRD is
          // already an external link (legacy free-text), record that and skip.
          if (!brdUrl.startsWith("/objects/")) {
            throw new Error(
              "BRD is not an in-app storage object; cannot mirror to Drive.",
            );
          }

          // Resolve the original filename (falls back to a generated name).
          const [meta] = await db
            .select({ filename: uploadedFilesTable.filename })
            .from(uploadedFilesTable)
            .where(eq(uploadedFilesTable.objectPath, brdUrl))
            .limit(1);
          const filename =
            meta?.filename && meta.filename.trim().length > 0
              ? meta.filename
              : `BRD-revenue-${entry.id}.pdf`;

          // Stream the GCS object straight into Drive (no full buffering).
          const file = await objectStorage.getObjectEntityFile(brdUrl);
          const [gcsMeta] = await file.getMetadata();
          const mimeType =
            (gcsMeta.contentType as string | undefined) || "application/pdf";
          const stream = file.createReadStream();

          const result = await uploadBrdToDrive(stream, filename, mimeType);

          await db
            .update(revenueEntriesTable)
            .set({
              brdDriveUrl: result.webViewLink,
              brdDriveFileId: result.fileId,
              brdDriveMigratedAt: new Date(),
              brdDriveMigrationError: null,
            })
            .where(eq(revenueEntriesTable.id, entry.id));
          succeeded++;
        } catch (err) {
          failed++;
          const message =
            err instanceof Error ? err.message : "Unknown migration error";
          req.log.warn(
            { err, revenueEntryId: entry.id },
            "[admin/brd-drive/migrate] entry failed",
          );
          // Record the error so a re-run retries it and the admin can see why.
          await db
            .update(revenueEntriesTable)
            .set({
              brdDriveMigrationError: message.slice(0, 500),
              brdDriveMigratedAt: new Date(),
            })
            .where(eq(revenueEntriesTable.id, entry.id))
            .catch(() => undefined);
        }
      }

      const counts = await getCounts();
      res.json({
        ok: true,
        // Per-run counts (this click).
        processed,
        succeeded,
        failed,
        batchLimit: MIGRATE_BATCH_LIMIT,
        // True when files still remain — the admin should click again.
        moreRemaining: counts.pending > 0,
        // Overall totals across all BRDs (note: counts.failed is the running
        // total of failed rows, distinct from this run's `failed`).
        total: counts.total,
        migrated: counts.migrated,
        pending: counts.pending,
        failedTotal: counts.failed,
      });
    } catch (err) {
      req.log.error({ err }, "[admin/brd-drive/migrate] failed");
      res
        .status(500)
        .json({ error: "Migration failed", processed, succeeded, failed });
    } finally {
      migrating = false;
    }
  },
);

export default router;
