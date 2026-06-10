import {
  db,
  revenueEntriesTable,
  teamsTable,
  brdAnalysisHistoryTable,
} from "@workspace/db";
import { and, eq, isNotNull, lte, ne, sql } from "drizzle-orm";
import { logger } from "../logger";
import { ObjectStorageService } from "../objectStorage";
import {
  generateBrdAnalysis,
  getGeminiApiKey,
  uploadPdfToGemini,
} from "./gemini-client";
import { buildPromptForEntry } from "./brd-prompt";

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
 * Only the CURRENT BRD PDF is sent to Gemini (relevancy + structured summary).
 * Uniqueness is computed cheaply in code by comparing this BRD's extracted
 * summary against the STORED summaries of every approved BRD — no previous PDFs
 * are ever re-uploaded.
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

    // Upload ONLY the current BRD. Previous BRDs are never re-uploaded —
    // uniqueness is computed from stored summaries below.
    const currentUpload = await uploadPdfToGemini(
      apiKey,
      currentBytes,
      `brave-current-entry-${entry.id}.pdf`,
    );

    const prompt = buildPromptForEntry({
      currentEntryClaimedAmount: entry.amount,
      currentEntryClientName: entry.clientName,
      currentEntryPaymentDate: entry.paymentDate,
      teamName,
    });

    const raw = await generateBrdAnalysis(apiKey, [currentUpload], prompt);

    const parsed = (raw ?? {}) as Record<string, unknown>;
    const brdScore = toScore(parsed["brd_score"]);

    // Unified uniqueness — cheap, token-free DB fingerprint across ALL teams
    // (same team + every other team). Compares this BRD's extracted summary
    // against the STORED summaries of every approved BRD. Yields the single
    // uniqueness score persisted on the entry + stored in the JSON blob.
    let uniquenessScore: number | null = null;
    try {
      const uniqueness = await computeUniqueness(
        {
          id: entry.id,
          teamId: entry.teamId,
          amount: entry.amount,
          paymentDate: entry.paymentDate,
        },
        parsed,
      );
      parsed["uniqueness"] = uniqueness;
      uniquenessScore = uniqueness.score;
    } catch (uErr) {
      logger.warn(
        { err: uErr, entryId },
        "[brd-ai] uniqueness check failed (continuing)",
      );
    }

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

type UniquenessMatch = {
  entry_id: number;
  team_id: number;
  team_name: string;
  client_name: string | null;
  status: string;
  brd_url: string | null;
  same_team: boolean;
  match_flag: "duplicate" | "suspicious";
  reason: string;
};

/**
 * Cheap, token-free uniqueness check across ALL teams (the submitting team and
 * every other team). Compares this entry's payment fingerprint — amount +
 * payment date (indexed columns) plus the AI-extracted reference id / payer /
 * payee from the stored `brd_summary` — against every APPROVED (verified) BRD.
 * No LLM call and no PDF re-upload, so it scales to any number of BRDs.
 *
 * A shared reference/UTR, or a shared payer/payee, on top of the same amount +
 * date reads as a likely reused payment proof (duplicate). The same amount +
 * date alone is suspicious and flagged for admin review. Returns a single
 * 0–100 score + the matching entries.
 */
async function computeUniqueness(
  entry: { id: number; teamId: number; amount: number; paymentDate: string },
  parsed: Record<string, unknown>,
): Promise<{
  score: number;
  flag: "unique" | "suspicious" | "duplicate";
  summary: string;
  compared_count: number;
  matches: UniquenessMatch[];
}> {
  const summaryObj =
    parsed["brd_summary"] && typeof parsed["brd_summary"] === "object"
      ? (parsed["brd_summary"] as Record<string, unknown>)
      : {};
  const norm = (v: unknown): string =>
    typeof v === "string" ? v.replace(/\s+/g, "").toLowerCase() : "";
  const curRef = norm(summaryObj["reference_id"]);
  const curPayer = norm(summaryObj["payer_name"]);
  const curPayee = norm(summaryObj["payee_name"]);

  // Candidate set: same amount AND same payment date, from any team (including
  // the submitting team), that is APPROVED (verified) and has a BRD attached.
  // We compare against EVERY such approved BRD (no row cap) so the score is
  // computed against all approved BRDs as required. The exact amount + exact
  // payment-date prefilter keeps this set naturally small. We exclude only the
  // entry being analysed itself.
  const candidates = await db
    .select({
      id: revenueEntriesTable.id,
      teamId: revenueEntriesTable.teamId,
      teamName: teamsTable.name,
      clientName: revenueEntriesTable.clientName,
      status: revenueEntriesTable.status,
      brdUrl: revenueEntriesTable.brdUrl,
      detail: revenueEntriesTable.aiAnalysisDetail,
    })
    .from(revenueEntriesTable)
    .leftJoin(teamsTable, eq(teamsTable.id, revenueEntriesTable.teamId))
    .where(
      and(
        ne(revenueEntriesTable.id, entry.id),
        eq(revenueEntriesTable.status, "verified"),
        eq(revenueEntriesTable.amount, entry.amount),
        eq(revenueEntriesTable.paymentDate, entry.paymentDate),
        isNotNull(revenueEntriesTable.brdUrl),
      ),
    );

  const matches: UniquenessMatch[] = [];
  let worst: "unique" | "suspicious" | "duplicate" = "unique";
  for (const c of candidates) {
    const cSummary =
      c.detail && typeof c.detail === "object"
        ? ((c.detail as Record<string, unknown>)["brd_summary"] as
            | Record<string, unknown>
            | undefined)
        : undefined;
    const cRef = norm(cSummary?.["reference_id"]);
    const cPayer = norm(cSummary?.["payer_name"]);
    const cPayee = norm(cSummary?.["payee_name"]);
    const sameTeam = c.teamId === entry.teamId;
    let reason: string;
    let matchFlag: "duplicate" | "suspicious";
    if (curRef && cRef && curRef === cRef) {
      reason = "Same reference/UTR + same amount & date";
      matchFlag = "duplicate";
      worst = "duplicate";
    } else if (curPayer && cPayer && curPayer === cPayer) {
      reason = "Same payer + same amount & date";
      matchFlag = "duplicate";
      worst = "duplicate";
    } else if (curPayee && cPayee && curPayee === cPayee) {
      reason = "Same payee + same amount & date";
      matchFlag = "duplicate";
      worst = "duplicate";
    } else {
      reason = "Same amount & payment date";
      matchFlag = "suspicious";
      if (worst !== "duplicate") worst = "suspicious";
    }
    matches.push({
      entry_id: c.id,
      team_id: c.teamId,
      team_name: c.teamName ?? `Team #${c.teamId}`,
      client_name: c.clientName,
      status: c.status,
      brd_url: c.brdUrl,
      same_team: sameTeam,
      match_flag: matchFlag,
      reason,
    });
  }

  const score = worst === "duplicate" ? 8 : worst === "suspicious" ? 45 : 100;
  const summary =
    matches.length === 0
      ? "No approved BRD shares this payment's amount and date — unique across all teams."
      : worst === "duplicate"
        ? `Likely duplicate: ${matches.length} approved BRD(s) share this payment's reference/payer/payee, amount and date.`
        : `${matches.length} approved BRD(s) share this payment's amount and date — review for a possibly reused payment proof.`;

  return {
    score,
    flag: worst,
    summary,
    compared_count: candidates.length,
    matches,
  };
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
