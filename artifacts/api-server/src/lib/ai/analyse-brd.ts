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
import {
  buildPromptForEntry,
  buildUniquenessPrompt,
  type UniquenessCandidateSummary,
} from "./brd-prompt";

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

    // Unified uniqueness — AI-driven comparison across ALL teams (same team +
    // every other team). Sends this BRD's extracted summary + the STORED text
    // summaries of every approved BRD to Gemini (text only, no PDFs) and asks it
    // to decide whether the current payment proof duplicates any approved one.
    // Falls back to a rule-based check if the AI call fails. Yields the single
    // uniqueness score persisted on the entry + stored in the JSON blob.
    let uniquenessScore: number | null = null;
    try {
      const uniqueness = await computeUniqueness(
        apiKey,
        {
          id: entry.id,
          teamId: entry.teamId,
          amount: entry.amount,
          paymentDate: entry.paymentDate,
          clientName: entry.clientName,
          teamName,
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

type UniquenessResult = {
  score: number;
  flag: "unique" | "suspicious" | "duplicate";
  summary: string;
  compared_count: number;
  matches: UniquenessMatch[];
};

type CandidateRow = {
  id: number;
  teamId: number;
  teamName: string | null;
  clientName: string | null;
  status: string;
  brdUrl: string | null;
  detail: unknown;
};

// How many approved summaries we send to Gemini in a SINGLE call. We compare
// against ALL approved BRDs; when there are more than this, we split them into
// multiple batches and merge the results so coverage is always complete. Each
// summary is one short line, so a batch this size stays well within the model's
// context window.
const AI_BATCH_SIZE = 400;

const normText = (v: unknown): string =>
  typeof v === "string" ? v.replace(/\s+/g, "").toLowerCase() : "";

function summaryFieldsOf(detail: unknown): Record<string, unknown> {
  if (detail && typeof detail === "object") {
    const s = (detail as Record<string, unknown>)["brd_summary"];
    if (s && typeof s === "object") return s as Record<string, unknown>;
  }
  return {};
}

function asString(v: unknown): string {
  return typeof v === "string" ? v : "";
}

/**
 * Unified uniqueness check across ALL teams (the submitting team and every
 * other team). The current BRD's extracted payment summary plus the STORED
 * summaries of every approved (verified) BRD are sent to Gemini as TEXT — never
 * as PDFs — and the model decides whether the current payment proof duplicates
 * or reuses any approved one. If the AI call fails (or no key), we fall back to
 * the deterministic rule-based check so a result is always produced.
 *
 * Returns a single 0–100 score + the matching entries.
 */
async function computeUniqueness(
  apiKey: string,
  entry: {
    id: number;
    teamId: number;
    amount: number;
    paymentDate: string;
    clientName: string;
    teamName: string;
  },
  parsed: Record<string, unknown>,
): Promise<UniquenessResult> {
  const curSummary = summaryFieldsOf(parsed);

  // Candidate set: EVERY approved (verified) BRD across all teams (including the
  // submitting team) that has a stored AI summary to compare against. Exclude
  // only the entry being analysed itself. We compare against ALL of them — they
  // are split into batches (AI_BATCH_SIZE) so prompt size stays bounded while
  // still covering the full corpus.
  const rows: CandidateRow[] = await db
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
        isNotNull(revenueEntriesTable.brdUrl),
        isNotNull(revenueEntriesTable.aiAnalysisDetail),
      ),
    );

  // Keep every approved BRD that has at least one identifying field in its
  // stored summary (amount, reference, payer, payee, or client). Only rows whose
  // summary is entirely blank — i.e. AI extraction produced nothing to compare —
  // are skipped. This keeps the comparison against ALL approved summaries.
  const usable = rows.filter((r) => {
    const s = summaryFieldsOf(r.detail);
    return (
      asString(s["amount"]) !== "" ||
      asString(s["reference_id"]) !== "" ||
      asString(s["payer_name"]) !== "" ||
      asString(s["payee_name"]) !== "" ||
      asString(s["client_name"]) !== ""
    );
  });

  // Prioritise the most relevant candidates first (same amount or same date) so
  // the strongest potential matches land early. We still compare against ALL of
  // them — ordering only affects batch packing, never coverage.
  const curAmountStr = normText(curSummary["amount"]);
  const curDateStr = normText(curSummary["payment_date"]);
  const relevance = (r: CandidateRow): number => {
    const s = summaryFieldsOf(r.detail);
    let score = 0;
    if (curAmountStr && normText(s["amount"]) === curAmountStr) score += 2;
    if (curDateStr && normText(s["payment_date"]) === curDateStr) score += 1;
    return score;
  };
  const candidates = [...usable].sort((a, b) => relevance(b) - relevance(a));

  // No approved BRDs to compare against → trivially unique.
  if (candidates.length === 0) {
    return {
      score: 100,
      flag: "unique",
      summary:
        "No approved BRD is available to compare against — unique across all teams.",
      compared_count: 0,
      matches: [],
    };
  }

  const current = {
    team_name: entry.teamName,
    business_name: asString(curSummary["business_name"]),
    client_name: asString(curSummary["client_name"]) || entry.clientName,
    payer_name: asString(curSummary["payer_name"]),
    payee_name: asString(curSummary["payee_name"]),
    amount: asString(curSummary["amount"]),
    payment_date: asString(curSummary["payment_date"]),
    reference_id: asString(curSummary["reference_id"]),
    project: asString(curSummary["project"]),
  };

  // Compare against EVERY approved BRD by splitting into batches and merging the
  // results. A batch that fails the AI call falls back to the deterministic
  // rule-based check for just that batch, so coverage is never lost.
  const batches: CandidateRow[][] = [];
  for (let i = 0; i < candidates.length; i += AI_BATCH_SIZE) {
    batches.push(candidates.slice(i, i + AI_BATCH_SIZE));
  }

  const mergedMatches = new Map<number, UniquenessMatch>();
  let worst: "unique" | "suspicious" | "duplicate" = "unique";
  let anyAiSucceeded = false;

  for (const batch of batches) {
    let batchResult: UniquenessResult;
    try {
      batchResult = await runAiUniquenessBatch(
        apiKey,
        current,
        batch,
        entry,
      );
      anyAiSucceeded = true;
    } catch (err) {
      logger.warn(
        { err, entryId: entry.id, batchSize: batch.length },
        "[brd-ai] AI uniqueness batch failed — falling back to rule-based for this batch",
      );
      batchResult = ruleBasedUniqueness(entry, curSummary, batch);
    }
    worst = worseFlag(worst, batchResult.flag);
    for (const m of batchResult.matches) {
      if (!mergedMatches.has(m.entry_id)) mergedMatches.set(m.entry_id, m);
    }
  }

  // Derive the final score deterministically from the worst flag across all
  // batches so the score and flag can never contradict each other.
  const score = worst === "duplicate" ? 8 : worst === "suspicious" ? 45 : 100;
  const matches = [...mergedMatches.values()];
  const summary = anyAiSucceeded
    ? worst === "duplicate"
      ? `AI flagged this BRD as a likely duplicate — ${matches.length} approved BRD(s) match across all teams.`
      : worst === "suspicious"
        ? `AI flagged this BRD as suspicious — ${matches.length} approved BRD(s) share this payment; review for a reused proof.`
        : "AI found no approved BRD matching this payment — unique across all teams."
    : worst === "duplicate"
      ? `Likely duplicate: ${matches.length} approved BRD(s) share this payment's reference/payer/payee, amount and date.`
      : worst === "suspicious"
        ? `${matches.length} approved BRD(s) share this payment's amount and date — review for a possibly reused payment proof.`
        : "No approved BRD shares this payment's amount and date — unique across all teams.";

  return {
    score,
    flag: worst,
    summary,
    compared_count: candidates.length,
    matches,
  };
}

/** Rank flags so we can keep the worst one seen across batches. */
function worseFlag(
  a: "unique" | "suspicious" | "duplicate",
  b: "unique" | "suspicious" | "duplicate",
): "unique" | "suspicious" | "duplicate" {
  const rank = { unique: 0, suspicious: 1, duplicate: 2 } as const;
  return rank[b] > rank[a] ? b : a;
}

/**
 * Run the AI uniqueness comparison for ONE batch of approved candidates. Sends
 * the current summary + this batch's summaries (text only) to Gemini and maps
 * the returned matches back to the candidate rows. Throws on any AI/parse error
 * so the caller can fall back to the rule-based check for this batch.
 */
async function runAiUniquenessBatch(
  apiKey: string,
  current: {
    team_name: string;
    business_name: string;
    client_name: string;
    payer_name: string;
    payee_name: string;
    amount: string;
    payment_date: string;
    reference_id: string;
    project: string;
  },
  batch: CandidateRow[],
  entry: { id: number; teamId: number },
): Promise<UniquenessResult> {
  // Validate AI-returned matches against THIS batch's IDs only — never a global
  // map — so a hallucinated entry_id that happens to be a real candidate in
  // another batch can't be accepted as a match here.
  const byId = new Map<number, CandidateRow>();
  for (const c of batch) byId.set(c.id, c);

  const candidateSummaries: UniquenessCandidateSummary[] = batch.map((c) => {
    const s = summaryFieldsOf(c.detail);
    return {
      entry_id: c.id,
      team_name: c.teamName ?? `Team #${c.teamId}`,
      business_name: asString(s["business_name"]),
      client_name: asString(s["client_name"]) || (c.clientName ?? ""),
      payer_name: asString(s["payer_name"]),
      payee_name: asString(s["payee_name"]),
      amount: asString(s["amount"]),
      payment_date: asString(s["payment_date"]),
      reference_id: asString(s["reference_id"]),
      project: asString(s["project"]),
    };
  });

  const prompt = buildUniquenessPrompt(current, candidateSummaries);

  // Text-only Gemini call (no PDF files attached).
  const aiRaw = (await generateBrdAnalysis(apiKey, [], prompt)) as Record<
    string,
    unknown
  >;

  const flagRaw = asString(aiRaw["flag"]).toLowerCase();
  const flag: "unique" | "suspicious" | "duplicate" =
    flagRaw === "duplicate"
      ? "duplicate"
      : flagRaw === "suspicious"
        ? "suspicious"
        : "unique";

  let score = toScore(aiRaw["uniqueness_score"]);
  if (score == null) {
    score = flag === "duplicate" ? 8 : flag === "suspicious" ? 45 : 100;
  }

  const aiMatches = Array.isArray(aiRaw["matches"])
    ? (aiRaw["matches"] as Array<Record<string, unknown>>)
    : [];
  const matches: UniquenessMatch[] = [];
  for (const m of aiMatches) {
    const id =
      typeof m["entry_id"] === "number"
        ? (m["entry_id"] as number)
        : Number(m["entry_id"]);
    if (!Number.isFinite(id)) continue;
    const row = byId.get(id);
    if (!row) continue;
    const mf = asString(m["match_flag"]).toLowerCase();
    matches.push({
      entry_id: row.id,
      team_id: row.teamId,
      team_name: row.teamName ?? `Team #${row.teamId}`,
      client_name: row.clientName,
      status: row.status,
      brd_url: row.brdUrl,
      same_team: row.teamId === entry.teamId,
      match_flag: mf === "duplicate" ? "duplicate" : "suspicious",
      reason: asString(m["reason"]) || "Flagged by AI comparison",
    });
  }

  return {
    score,
    flag,
    summary: asString(aiRaw["summary"]),
    compared_count: batch.length,
    matches,
  };
}

/**
 * Deterministic fallback used only when the AI uniqueness call fails. Flags an
 * approved BRD as a duplicate when it shares the same amount + date AND a
 * reference/payer/payee with the current BRD; same amount + date alone is
 * suspicious.
 */
function ruleBasedUniqueness(
  entry: { id: number; teamId: number },
  curSummary: Record<string, unknown>,
  candidates: CandidateRow[],
): UniquenessResult {
  const curRef = normText(curSummary["reference_id"]);
  const curPayer = normText(curSummary["payer_name"]);
  const curPayee = normText(curSummary["payee_name"]);
  const curAmount = normText(curSummary["amount"]);
  const curDate = normText(curSummary["payment_date"]);

  const matches: UniquenessMatch[] = [];
  let worst: "unique" | "suspicious" | "duplicate" = "unique";
  for (const c of candidates) {
    const s = summaryFieldsOf(c.detail);
    const cAmount = normText(s["amount"]);
    const cDate = normText(s["payment_date"]);
    const cRef = normText(s["reference_id"]);
    const cPayer = normText(s["payer_name"]);
    const cPayee = normText(s["payee_name"]);

    const refMatch = !!curRef && curRef === cRef;
    const sameAmountDate =
      !!curAmount && curAmount === cAmount && !!curDate && curDate === cDate;
    if (!refMatch && !sameAmountDate) continue;

    let reason: string;
    let matchFlag: "duplicate" | "suspicious";
    if (refMatch) {
      reason = "Same reference/UTR";
      matchFlag = "duplicate";
      worst = "duplicate";
    } else if (curPayer && curPayer === cPayer) {
      reason = "Same payer + same amount & date";
      matchFlag = "duplicate";
      worst = "duplicate";
    } else if (curPayee && curPayee === cPayee) {
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
      same_team: c.teamId === entry.teamId,
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
