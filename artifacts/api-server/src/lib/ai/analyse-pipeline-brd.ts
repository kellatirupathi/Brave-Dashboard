/**
 * AI audit of a Season 2 composed BRD (additive, isolated).
 *
 * Season 1's auditor takes the PDF a student uploaded. Season 2 has no PDF —
 * the document is assembled by the server from logged records — so this module
 * feeds Gemini the rendered prose plus the evidence images instead.
 *
 * ONE CALL, TWO VERDICTS. Season 1 makes a second, text-only round-trip for the
 * duplicate-payment check, because it needs the summary the first call
 * extracted. Here the approved-BRD summaries ride in the same prompt, and the
 * model compares the reference it has just extracted (TASK 3) against them
 * (TASK 4) in the same response. The uniqueness SEMANTICS are Season 1's to the
 * letter — reference is the only signal, score derived from the flag, matches
 * validated against the ids actually sent, rule-based fallback if the block is
 * missing — only the transport changed.
 *
 * IT WRITES THE SAME COLUMNS AS SEASON 1, in the same shape. `brd_score`,
 * `uniqueness_score`, `ai_analysis_detail` and the `brd_analysis_history` row
 * are what the review queue and the admin detailed-analysis page already read,
 * and neither needed a change to display a Season 2 audit. Keep the output
 * shape identical when editing this: the UI is shared.
 *
 * Never throws. A failed audit must leave the entry reviewable by a human.
 */
import {
  db,
  revenueEntriesTable,
  teamsTable,
  brdAnalysisHistoryTable,
  programmeConfigTable,
} from "@workspace/db";
import { and, eq, isNotNull, ne } from "drizzle-orm";
import { logger } from "../logger";
import { ObjectStorageService } from "../objectStorage";
import {
  generateBrdAnalysis,
  getGeminiApiKey,
  uploadFileToGemini,
  type GeminiUploadedFile,
} from "./gemini-client";
import { buildPipelinePromptForEntry } from "./pipeline-brd-prompt";
import type { UniquenessCandidateSummary } from "./brd-prompt";
import {
  asString,
  normText,
  ruleBasedUniqueness,
  summaryFieldsOf,
  type CandidateRow,
  type UniquenessMatch,
  type UniquenessResult,
} from "./analyse-brd";
import type { ComposedBrd } from "../brd-composer";

const objectStorage = new ObjectStorageService();

/**
 * How many images are sent in one audit.
 *
 * A lead can carry ten meet proofs and every interaction its own attachment, so
 * an uncapped audit would be both slow and expensive for no extra signal. The
 * ordering below puts the evidence that decides the score first, so the cap
 * only ever drops the least important images.
 */
const MAX_IMAGES = 8;

/** Gemini rejects what it cannot decode; only send types it accepts. */
const IMAGE_MIME: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
  heic: "image/heic",
  heif: "image/heif",
};

function mimeForPath(path: string): string | null {
  const ext = path.split("?")[0]?.split("#")[0]?.split(".").pop();
  if (!ext) return null;
  return IMAGE_MIME[ext.toLowerCase()] ?? null;
}

/** One image to send, with the label the prompt uses to identify it. */
type Candidate = { path: string; label: string };

/**
 * Collect the evidence images, most decisive first.
 *
 * Payment proof leads because the score is gated on it. Meet proofs come next —
 * they are what shows the business is real. Interaction attachments last: they
 * corroborate, but a missing one is not a verdict. Invoices are deliberately
 * excluded; the prompt does not audit them, so uploading them would only cost
 * tokens and invite findings the auditor is told not to make.
 */
function collectImages(brd: ComposedBrd): Candidate[] {
  const out: Candidate[] = [];

  brd.payments.forEach((p, i) => {
    if (p.paymentProof) {
      out.push({
        path: p.paymentProof,
        label: `Payment proof for "${p.phaseName}" — claimed ₹${p.amount.toLocaleString("en-IN")} on ${p.date} (payment ${i + 1})`,
      });
    }
  });

  brd.clientEvidence.forEach((path, i) => {
    out.push({
      path,
      label: `Meet proof ${i + 1} — photo taken when the client was captured`,
    });
  });

  brd.interactionTrail.forEach((interaction) => {
    interaction.attachments.forEach((path) => {
      out.push({
        path,
        label: `Attachment on the ${interaction.date} ${interaction.type} interaction`,
      });
    });
  });

  // Two records can reference one upload; sending it twice teaches nothing.
  const seen = new Set<string>();
  return out.filter((c) => {
    if (seen.has(c.path)) return false;
    seen.add(c.path);
    return true;
  });
}

/** Fetch bytes for a stored object path. Null when unreadable. */
async function downloadObject(path: string): Promise<Buffer | null> {
  try {
    if (!path.startsWith("/objects/")) return null;
    const file = await objectStorage.getObjectEntityFile(path);
    const [contents] = await file.download();
    return contents;
  } catch (err) {
    logger.warn({ path, err }, "[pipeline-brd-ai] could not download evidence");
    return null;
  }
}

/**
 * Upload the evidence images to Gemini, skipping whatever cannot be read or is
 * not an image. Returns the uploads alongside the manifest lines describing
 * them, so the prompt and the file list can never fall out of step.
 */
async function uploadEvidence(
  apiKey: string,
  candidates: Candidate[],
): Promise<{ files: GeminiUploadedFile[]; manifest: string[] }> {
  const files: GeminiUploadedFile[] = [];
  const manifest: string[] = [];

  for (const candidate of candidates) {
    if (files.length >= MAX_IMAGES) break;
    const mimeType = mimeForPath(candidate.path);
    if (!mimeType) {
      // A PDF invoice or a document link. Named in the prose already; the
      // auditor is told not to score invoices, so nothing is lost.
      continue;
    }
    const bytes = await downloadObject(candidate.path);
    if (!bytes || bytes.length === 0) continue;
    try {
      const uploaded = await uploadFileToGemini(
        apiKey,
        bytes,
        mimeType,
        `brave-s2-evidence-${files.length + 1}`,
      );
      files.push(uploaded);
      manifest.push(candidate.label);
    } catch (err) {
      logger.warn(
        { err, path: candidate.path },
        "[pipeline-brd-ai] evidence upload failed; continuing without it",
      );
    }
  }

  return { files, manifest };
}

function toScore(v: unknown): number | null {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  if (!Number.isFinite(n)) return null;
  return Math.max(0, Math.min(100, Math.round(n)));
}

/** Digits only, so "₹10,000" and 10000 compare equal for relevance sorting. */
const digitsOf = (v: unknown): string =>
  typeof v === "number" ? String(v) : asString(v).replace(/\D+/g, "");

/**
 * The approved corpus to check this payment against.
 *
 * Season 1's own query filters on `brdUrl IS NOT NULL`, which silently keeps
 * every composed Season 2 entry out of the comparison. This query drops that
 * filter, so the corpus is every verified BRD with a stored summary — uploaded
 * or composed, either season. That is deliberate: a team reusing last
 * season's receipt is exactly the reuse this check exists to catch. Season 1's
 * query is left untouched.
 *
 * Same `usable` rule as Season 1 (at least one identifying field), and the
 * same relevance ordering — but against the CLAIMED amount and date, because
 * in a single call the extracted summary does not exist yet when the prompt is
 * built. Ordering only affects position in the list, never coverage.
 */
async function loadCandidates(entry: {
  id: number;
  amount: number;
  paymentDate: string;
}): Promise<CandidateRow[]> {
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
        isNotNull(revenueEntriesTable.aiAnalysisDetail),
      ),
    );

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

  const claimedAmount = digitsOf(entry.amount);
  const claimedDate = normText(entry.paymentDate);
  const relevance = (r: CandidateRow): number => {
    const s = summaryFieldsOf(r.detail);
    let score = 0;
    if (claimedAmount && digitsOf(s["amount"]) === claimedAmount) score += 2;
    if (claimedDate && normText(s["payment_date"]) === claimedDate) score += 1;
    return score;
  };
  return [...usable].sort((a, b) => relevance(b) - relevance(a));
}

/** Season 1's exact mapping from a stored row to the line the model reads. */
function toCandidateSummary(c: CandidateRow): UniquenessCandidateSummary {
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
}

/**
 * Read the TASK 4 block out of the combined response, with Season 1's rules:
 * two verdicts only, score derived from the flag so the two can never
 * contradict, and a match accepted only if its entry_id was actually in the
 * list sent — a hallucinated id is dropped, never trusted. Throws when the
 * block is absent or malformed so the caller can fall back to the rule-based
 * check, exactly as a failed batch does in Season 1.
 */
function parseUniqueness(
  aiRaw: Record<string, unknown>,
  sent: CandidateRow[],
  entry: { id: number; teamId: number },
): UniquenessResult {
  const block = aiRaw["uniqueness"];
  if (!block || typeof block !== "object") {
    throw new Error("uniqueness block missing from combined response");
  }
  const u = block as Record<string, unknown>;

  const byId = new Map<number, CandidateRow>();
  for (const c of sent) byId.set(c.id, c);

  const flag: "unique" | "duplicate" =
    asString(u["flag"]).toLowerCase() === "duplicate" ? "duplicate" : "unique";
  const score = flag === "duplicate" ? 8 : 100;

  const aiMatches =
    flag === "duplicate" && Array.isArray(u["matches"])
      ? (u["matches"] as Array<Record<string, unknown>>)
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
    matches.push({
      entry_id: row.id,
      team_id: row.teamId,
      team_name: row.teamName ?? `Team #${row.teamId}`,
      client_name: row.clientName,
      status: row.status,
      brd_url: row.brdUrl,
      same_team: row.teamId === entry.teamId,
      match_flag: "duplicate",
      reason: asString(m["reason"]) || "Same reference",
    });
  }

  // The model said duplicate but named nothing we sent: that is not evidence.
  const isDuplicate = flag === "duplicate" && matches.length > 0;
  return {
    score: isDuplicate ? 8 : 100,
    flag: isDuplicate ? "duplicate" : "unique",
    summary:
      asString(u["summary"]) ||
      (isDuplicate
        ? `Likely duplicate — ${matches.length} approved BRD(s) reuse this payment's reference.`
        : "AI found no approved BRD reusing this payment's reference — unique across all teams."),
    compared_count: sent.length,
    matches: isDuplicate ? matches : [],
  };
}

/**
 * Audit one Season 2 revenue entry. The caller has already established that the
 * entry carries a composed BRD rather than an uploaded PDF.
 */
export async function analysePipelineBrd(entryId: number): Promise<void> {
  const apiKey = getGeminiApiKey();
  if (!apiKey) {
    logger.debug(
      { entryId },
      "[pipeline-brd-ai] GEMINI_API_KEY not set — skipping",
    );
    return;
  }

  try {
    const [entry] = await db
      .select()
      .from(revenueEntriesTable)
      .where(eq(revenueEntriesTable.id, entryId));
    if (!entry) {
      logger.warn({ entryId }, "[pipeline-brd-ai] entry not found");
      return;
    }
    const brd = entry.brdComposed as ComposedBrd | null;
    if (!brd || !entry.brdText) {
      logger.debug(
        { entryId },
        "[pipeline-brd-ai] no composed BRD on entry — skipping",
      );
      return;
    }

    // Snapshot the submission state. A re-submission while this slow call is in
    // flight must win, so the final UPDATE is guarded on it.
    const submittedAtSnapshot = entry.submittedAt;

    const [team] = await db
      .select()
      .from(teamsTable)
      .where(eq(teamsTable.id, entry.teamId));
    const teamName = team?.name ?? `Team #${entry.teamId}`;

    // Judge the claim against ITS OWN season's start date — a Season 2 entry
    // must not be measured against Season 1's calendar.
    const [cfg] = await db
      .select({ startDate: programmeConfigTable.startDate })
      .from(programmeConfigTable)
      .where(eq(programmeConfigTable.seasonId, entry.seasonId))
      .limit(1);
    const programmeStartDate =
      cfg?.startDate && /^\d{4}-\d{2}-\d{2}$/.test(cfg.startDate)
        ? cfg.startDate
        : "2026-04-15";

    // Evidence and the approved corpus are independent lookups.
    const imageCandidates = collectImages(brd);
    const [{ files, manifest }, candidates] = await Promise.all([
      uploadEvidence(apiKey, imageCandidates),
      loadCandidates({
        id: entry.id,
        amount: entry.amount,
        paymentDate: entry.paymentDate,
      }),
    ]);

    const prompt = buildPipelinePromptForEntry({
      claimedAmount: entry.amount,
      clientName: entry.clientName,
      paymentDate: entry.paymentDate,
      teamName,
      programmeStartDate,
      brdText: entry.brdText,
      imageManifest: manifest,
      candidates: candidates.map(toCandidateSummary),
    });

    // The single call: score, findings, summary AND the duplicate verdict.
    const raw = await generateBrdAnalysis(apiKey, files, prompt);
    const parsed = (raw ?? {}) as Record<string, unknown>;
    const brdScore = toScore(parsed["brd_score"]);

    // Uniqueness from the same response. Season 1's fallback applies the same
    // way it does to a failed batch there: if the block is missing or broken,
    // the deterministic reference check runs on the summary this call
    // extracted, so a verdict is always produced and coverage is never lost.
    let uniqueness: UniquenessResult;
    if (candidates.length === 0) {
      uniqueness = {
        score: 100,
        flag: "unique",
        summary:
          "No approved BRD is available to compare against — unique across all teams.",
        compared_count: 0,
        matches: [],
      };
    } else {
      try {
        uniqueness = parseUniqueness(parsed, candidates, {
          id: entry.id,
          teamId: entry.teamId,
        });
      } catch (uErr) {
        logger.warn(
          { err: uErr, entryId, candidates: candidates.length },
          "[pipeline-brd-ai] uniqueness block unusable — falling back to rule-based",
        );
        uniqueness = ruleBasedUniqueness(
          { id: entry.id, teamId: entry.teamId },
          summaryFieldsOf(parsed),
          candidates,
        );
      }
    }
    parsed["uniqueness"] = uniqueness;
    const uniquenessScore = uniqueness.score;

    // Record what the audit actually saw, so a reviewer reading a low score can
    // tell "no proof was attached" from "the proof did not support the claim".
    parsed["evidence_analysed"] = {
      images_sent: files.length,
      images_available: imageCandidates.length,
      manifest,
    };
    parsed["source"] = "composed";

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
          submittedAtSnapshot
            ? eq(revenueEntriesTable.submittedAt, submittedAtSnapshot)
            : isNotNull(revenueEntriesTable.submittedAt),
        ),
      )
      .returning({ id: revenueEntriesTable.id });

    if (written.length === 0) {
      logger.info(
        { entryId },
        "[pipeline-brd-ai] stale run — entry changed while analysing; discarded",
      );
      return;
    }

    // Append-only history, exactly as Season 1 does: every run is its own row.
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
        "[pipeline-brd-ai] history append failed (latest snapshot still saved)",
      );
    }

    logger.info(
      {
        entryId,
        brdScore,
        uniquenessScore,
        images: files.length,
        compared: candidates.length,
      },
      "[pipeline-brd-ai] analysis stored",
    );
  } catch (err) {
    logger.error({ err, entryId }, "[pipeline-brd-ai] analysis failed");
  }
}
