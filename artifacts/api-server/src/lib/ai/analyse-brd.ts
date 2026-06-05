import {
  db,
  revenueEntriesTable,
  teamsTable,
  brdAnalysisHistoryTable,
} from "@workspace/db";
import { and, desc, eq, isNotNull, lte, ne, sql } from "drizzle-orm";
import { logger } from "../logger";
import { ObjectStorageService } from "../objectStorage";
import {
  generateBrdAnalysis,
  getGeminiApiKey,
  uploadPdfToGemini,
  type GeminiUploadedFile,
} from "./gemini-client";
import { buildPromptForEntry } from "./brd-prompt";

const MAX_PREVIOUS_BRDS = 10;

const objectStorage = new ObjectStorageService();

/**
 * Download a BRD file from object storage given the stored path (typically
 * "/objects/<entityId>"). Returns the raw bytes or null if not retrievable.
 */
async function downloadBrdBytes(brdUrl: string): Promise<Buffer | null> {
  try {
    if (!brdUrl.startsWith("/objects/")) {
      logger.warn(
        { brdUrl },
        "[brd-ai] Skipping BRD with unsupported URL shape (not /objects/...)",
      );
      return null;
    }
    const file = await objectStorage.getObjectEntityFile(brdUrl);
    const [contents] = await file.download();
    return contents;
  } catch (err) {
    logger.warn({ brdUrl, err }, "[brd-ai] Failed to download BRD bytes");
    return null;
  }
}

/**
 * Only PDFs are analysed. The Gemini Files API is told every upload is
 * `application/pdf`, so a non-PDF (Word doc, image) or an empty/corrupt file
 * makes generateContent fail with "The document has no pages". This is a cheap
 * structural guard: a real PDF begins with the `%PDF-` magic header. We scan
 * the first 1KB (not just byte 0) to tolerate a leading BOM / stray bytes that
 * some generators emit.
 */
function isLikelyPdf(bytes: Buffer | null | undefined): boolean {
  if (!bytes || bytes.length < 5) return false;
  return bytes.subarray(0, 1024).toString("latin1").includes("%PDF-");
}

/**
 * Run the AI auditor on a single revenue entry by id. Idempotent. Safe to
 * call even if no Gemini key is configured (becomes a silent no-op).
 *
 * Never throws — all failures are logged. The caller (scheduler, route, or
 * startup catch-up) should not let a single bad entry break anything.
 */
export async function analyseRevenueEntryBrd(entryId: number): Promise<void> {
  const apiKey = getGeminiApiKey();
  if (!apiKey) {
    logger.debug(
      { entryId },
      "[brd-ai] GEMINI_API_KEY not set — skipping analysis",
    );
    return;
  }

  try {
    const [entry] = await db
      .select()
      .from(revenueEntriesTable)
      .where(eq(revenueEntriesTable.id, entryId));
    if (!entry) {
      logger.warn({ entryId }, "[brd-ai] entry not found");
      return;
    }
    if (!entry.brdUrl || entry.brdUrl.trim() === "") {
      logger.debug({ entryId }, "[brd-ai] no brdUrl on entry — skipping");
      return;
    }
    // Snapshot the submission state. If the student re-submits while this
    // (slow) Gemini run is in flight, the WHERE-clause guard on the final
    // UPDATE will refuse to overwrite the newer state with our stale result.
    const submittedAtSnapshot = entry.submittedAt;
    const brdUrlSnapshot = entry.brdUrl;

    const [team] = await db
      .select()
      .from(teamsTable)
      .where(eq(teamsTable.id, entry.teamId));
    const teamName = team?.name ?? `Team #${entry.teamId}`;

    // Fetch up to MAX_PREVIOUS_BRDS most-recent previously APPROVED BRDs from
    // the same team. Uniqueness is only compared against verified entries —
    // rejected and not-yet-approved (draft/submitted) BRDs are excluded.
    const previousEntries = await db
      .select({
        id: revenueEntriesTable.id,
        brdUrl: revenueEntriesTable.brdUrl,
        amount: revenueEntriesTable.amount,
        clientName: revenueEntriesTable.clientName,
        paymentDate: revenueEntriesTable.paymentDate,
      })
      .from(revenueEntriesTable)
      .where(
        and(
          eq(revenueEntriesTable.teamId, entry.teamId),
          ne(revenueEntriesTable.id, entry.id),
          eq(revenueEntriesTable.status, "verified"),
          isNotNull(revenueEntriesTable.brdUrl),
        ),
      )
      .orderBy(desc(revenueEntriesTable.createdAt))
      .limit(MAX_PREVIOUS_BRDS);

    // Download current BRD bytes.
    const currentBytes = await downloadBrdBytes(entry.brdUrl);
    if (!currentBytes) {
      logger.warn(
        { entryId, brdUrl: entry.brdUrl },
        "[brd-ai] Current BRD bytes unavailable — aborting analysis",
      );
      return;
    }
    // Only PDFs are analysed. If the attached BRD isn't a real PDF (a Word doc,
    // an image, or an empty/corrupt file), skip the Gemini call entirely —
    // sending it would only fail with "The document has no pages".
    if (!isLikelyPdf(currentBytes)) {
      logger.warn(
        { entryId, brdUrl: entry.brdUrl },
        "[brd-ai] BRD is not a valid PDF — skipping analysis (only PDFs are analysed)",
      );
      return;
    }

    // Upload current first.
    const currentUpload = await uploadPdfToGemini(
      apiKey,
      currentBytes,
      `brave-current-entry-${entry.id}.pdf`,
    );

    // Upload each previous in parallel; tolerate individual failures.
    const previousUploads: GeminiUploadedFile[] = [];
    const previousLabels: string[] = [];
    const uploadResults = await Promise.allSettled(
      previousEntries.map(async (prev) => {
        if (!prev.brdUrl) return null;
        const bytes = await downloadBrdBytes(prev.brdUrl);
        if (!bytes) return null;
        // Skip non-PDF previous BRDs too — one bad file in the comparison set
        // would otherwise fail the whole generateContent call.
        if (!isLikelyPdf(bytes)) {
          logger.warn(
            { entryId, previousEntryId: prev.id, brdUrl: prev.brdUrl },
            "[brd-ai] previous BRD is not a valid PDF — excluded from comparison",
          );
          return null;
        }
        const uploaded = await uploadPdfToGemini(
          apiKey,
          bytes,
          `brave-prev-entry-${prev.id}.pdf`,
        );
        return {
          uploaded,
          label: `Entry #${prev.id} — ${prev.clientName} (₹${prev.amount.toLocaleString("en-IN")}, ${prev.paymentDate})`,
        };
      }),
    );
    for (const r of uploadResults) {
      if (r.status === "fulfilled" && r.value) {
        previousUploads.push(r.value.uploaded);
        previousLabels.push(r.value.label);
      } else if (r.status === "rejected") {
        logger.warn(
          { err: r.reason, entryId },
          "[brd-ai] previous BRD upload failed (continuing)",
        );
      }
    }

    const prompt = buildPromptForEntry({
      currentEntryClaimedAmount: entry.amount,
      currentEntryClientName: entry.clientName,
      currentEntryPaymentDate: entry.paymentDate,
      teamName,
      previousBrdLabels: previousLabels,
    });

    const raw = await generateBrdAnalysis(
      apiKey,
      [currentUpload, ...previousUploads],
      prompt,
    );

    const parsed = (raw ?? {}) as Record<string, unknown>;
    const brdScore = toScore(parsed["brd_score"]);
    const uniquenessScore = toScore(parsed["uniqueness_score"]);

    // Tie each AI comparison row back to the REAL revenue entry it compared
    // against, so the admin UI can open that entry's actual BRD. The AI's
    // free-text `entry_label` ("Entry #45 — ...") is unreliable for linking,
    // so we resolve the real id/url/client from `previousEntries` (the exact
    // set we uploaded). Match by the `#<id>` embedded in the label; fall back
    // to positional order when the label is missing/garbled.
    const prevById = new Map(previousEntries.map((p) => [p.id, p]));
    const rawComparison = Array.isArray(parsed["uniqueness_comparison"])
      ? (parsed["uniqueness_comparison"] as Record<string, unknown>[])
      : [];
    const enrichedComparison = rawComparison.map((row, idx) => {
      const label = typeof row?.entry_label === "string" ? row.entry_label : "";
      const idMatch = label.match(/#(\d+)/);
      let matched = idMatch ? prevById.get(Number(idMatch[1])) : undefined;
      // Positional fallback: the AI is asked to compare in upload order.
      if (!matched && previousEntries[idx]) matched = previousEntries[idx];
      return {
        ...row,
        compared_entry_id: matched?.id ?? null,
        compared_brd_url: matched?.brdUrl ?? null,
        compared_client_name: matched?.clientName ?? null,
      };
    });
    parsed["uniqueness_comparison"] = enrichedComparison;

    // Guarded write: only persist if the entry's submission state hasn't
    // changed since we started. Prevents an older, slower run from clobbering
    // results from a newer re-submission/re-analyse.
    const written = await db
      .update(revenueEntriesTable)
      .set({
        brdScore,
        uniquenessScore,
        aiAnalysisDetail: parsed,
        aiAnalysedAt: new Date(),
      })
      .where(
        and(
          eq(revenueEntriesTable.id, entry.id),
          eq(revenueEntriesTable.brdUrl, brdUrlSnapshot),
          submittedAtSnapshot
            ? eq(revenueEntriesTable.submittedAt, submittedAtSnapshot)
            : isNotNull(revenueEntriesTable.submittedAt),
        ),
      )
      .returning({ id: revenueEntriesTable.id });

    if (written.length === 0) {
      logger.info(
        { entryId },
        "[brd-ai] stale run — entry was re-submitted while analysis was in flight; results discarded",
      );
      return;
    }

    // Append a history row. Never overwrites — each run is its own record.
    try {
      await db.insert(brdAnalysisHistoryTable).values({
        revenueEntryId: entry.id,
        brdScore,
        uniquenessScore,
        analysisJson: parsed,
      });
    } catch (histErr) {
      logger.error(
        { err: histErr, entryId },
        "[brd-ai] failed to append history record (latest snapshot still saved)",
      );
    }

    logger.info(
      {
        entryId,
        brdScore,
        uniquenessScore,
        previousCount: previousUploads.length,
      },
      "[brd-ai] analysis stored",
    );
  } catch (err) {
    logger.error({ err, entryId }, "[brd-ai] analysis failed");
  }
}

function toScore(v: unknown): number | null {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  if (!Number.isFinite(n)) return null;
  return Math.max(0, Math.min(100, Math.round(n)));
}

/**
 * One-shot sweep run at server boot. Picks up any entries with a BRD that
 * were submitted more than 5 minutes ago but never analysed (e.g. because a
 * setTimeout was lost across a redeploy). Fires-and-forgets analysis for
 * each one with a small concurrency cap so we don't slam Gemini.
 */
export async function catchUpPendingBrdAnalyses(): Promise<void> {
  if (!getGeminiApiKey()) {
    logger.debug("[brd-ai] catch-up: GEMINI_API_KEY not set, skipping");
    return;
  }
  try {
    const cutoff = new Date(Date.now() - 5 * 60 * 1000);
    const rows = await db
      .select({ id: revenueEntriesTable.id })
      .from(revenueEntriesTable)
      .where(
        and(
          isNotNull(revenueEntriesTable.brdUrl),
          sql`${revenueEntriesTable.brdUrl} <> ''`,
          sql`${revenueEntriesTable.aiAnalysedAt} IS NULL`,
          isNotNull(revenueEntriesTable.submittedAt),
          lte(revenueEntriesTable.submittedAt, cutoff),
        ),
      )
      .limit(50);
    if (rows.length === 0) {
      logger.info("[brd-ai] catch-up: nothing pending");
      return;
    }
    logger.info(
      { count: rows.length },
      "[brd-ai] catch-up: analysing pending BRDs from missed setTimeouts",
    );
    // Serial loop to avoid hammering Gemini on a backlog. Each call is
    // wrapped in its own try/catch inside analyseRevenueEntryBrd already.
    for (const r of rows) {
      await analyseRevenueEntryBrd(r.id);
    }
  } catch (err) {
    logger.error({ err }, "[brd-ai] catch-up sweep failed");
  }
}
