// Daily reel-script generator. Pulls weekly journals submitted in a time window
// (default: the last 24h, i.e. 6 PM yesterday → 6 PM today when the cron runs at
// 6 PM), asks Gemini for one reel script per reel-worthy journal in the BRAVE
// house style, dedupes against what already exists, and stores the new ones.
// Additive + isolated — nothing else reads the reel_scripts table.
import {
  db,
  weeklyJournalsTable,
  teamsTable,
  reelScriptsTable,
} from "@workspace/db";
import { and, gte, lt, desc, eq } from "drizzle-orm";
import { getGeminiApiKey, generateBrdAnalysis } from "./gemini-client";
import { logger } from "../logger";
import {
  buildReelsPrompt,
  REEL_BUCKETS,
  type ReelJournalInput,
} from "./reels-prompt";

const WINDOW_HOURS = 24;
const MAX_JOURNALS = 80; // bound the prompt size
const MAX_EXISTING_FOR_PROMPT = 120;
const MAX_INSERTS_PER_RUN = 100; // safety cap

// Normalized form of a script used to detect duplicates: lowercase, strip
// punctuation, collapse whitespace, cap length.
export function reelDedupeKey(script: string): string {
  return script
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 300);
}

function firstSentence(script: string): string {
  const s = script.trim().replace(/\s+/g, " ");
  return s.length > 160 ? s.slice(0, 160) + "…" : s;
}

type GenResult = {
  ok: boolean;
  reason?: string;
  journals?: number;
  candidates?: number;
  inserted?: number;
  skippedDuplicates?: number;
};

export async function generateReelsForWindow(end: Date): Promise<GenResult> {
  const apiKey = getGeminiApiKey();
  if (!apiKey) {
    logger.warn("[reels-ai] GEMINI_API_KEY not set — skipping generation");
    return { ok: false, reason: "no_api_key" };
  }

  const start = new Date(end.getTime() - WINDOW_HOURS * 3_600_000);

  const journalRows = await db
    .select({
      id: weeklyJournalsTable.id,
      teamId: weeklyJournalsTable.teamId,
      teamName: teamsTable.name,
      weekStartDate: weeklyJournalsTable.weekStartDate,
      weekEndDate: weeklyJournalsTable.weekEndDate,
      whatWeDid: weeklyJournalsTable.whatWeDid,
      blockers: weeklyJournalsTable.blockers,
      nextWeekPlan: weeklyJournalsTable.nextWeekPlan,
      clientsVisited: weeklyJournalsTable.clientsVisited,
      activeConversations: weeklyJournalsTable.activeConversations,
      projectsStarted: weeklyJournalsTable.projectsStarted,
      projectsClosed: weeklyJournalsTable.projectsClosed,
    })
    .from(weeklyJournalsTable)
    .leftJoin(teamsTable, eq(teamsTable.id, weeklyJournalsTable.teamId))
    .where(
      and(
        gte(weeklyJournalsTable.submittedAt, start),
        lt(weeklyJournalsTable.submittedAt, end),
      ),
    )
    .orderBy(desc(weeklyJournalsTable.submittedAt))
    .limit(MAX_JOURNALS);

  if (journalRows.length === 0) {
    logger.info(
      { start, end },
      "[reels-ai] no journals submitted in window — nothing to generate",
    );
    return { ok: true, reason: "no_journals", journals: 0, inserted: 0 };
  }

  const journals: ReelJournalInput[] = journalRows.map((j) => ({
    journalId: j.id,
    teamName: j.teamName ?? `Team #${j.teamId}`,
    weekStartDate: j.weekStartDate,
    weekEndDate: j.weekEndDate,
    whatWeDid: (j.whatWeDid ?? "").slice(0, 1500),
    blockers: j.blockers ? j.blockers.slice(0, 800) : null,
    nextWeekPlan: j.nextWeekPlan ? j.nextWeekPlan.slice(0, 600) : null,
    clientsVisited: j.clientsVisited,
    activeConversations: j.activeConversations,
    projectsStarted: j.projectsStarted,
    projectsClosed: j.projectsClosed,
  }));

  // Existing scripts: used both to seed the "don't repeat" list in the prompt
  // and to dedupe on insert.
  const existingRows = await db
    .select({
      script: reelScriptsTable.script,
      dedupeKey: reelScriptsTable.dedupeKey,
    })
    .from(reelScriptsTable)
    .orderBy(desc(reelScriptsTable.createdAt))
    .limit(500);

  const existingKeys = new Set(
    existingRows.map((r) => r.dedupeKey).filter((k): k is string => !!k),
  );
  const existingForPrompt = existingRows
    .slice(0, MAX_EXISTING_FOR_PROMPT)
    .map((r) => firstSentence(r.script));

  const teamIdByJournal = new Map(journalRows.map((j) => [j.id, j.teamId]));

  const prompt = buildReelsPrompt(journals, existingForPrompt);

  let raw: unknown;
  try {
    raw = await generateBrdAnalysis(apiKey, [], prompt);
  } catch (err) {
    logger.error({ err }, "[reels-ai] Gemini generation failed");
    return { ok: false, reason: "gemini_failed", journals: journals.length };
  }

  const candidates = Array.isArray((raw as { scripts?: unknown })?.scripts)
    ? ((raw as { scripts: unknown[] }).scripts as unknown[])
    : [];

  const seenThisRun = new Set<string>();
  const toInsert: (typeof reelScriptsTable.$inferInsert)[] = [];
  let skippedDuplicates = 0;

  for (const c of candidates) {
    const obj = c as {
      sourceJournalId?: unknown;
      bucket?: unknown;
      script?: unknown;
    };
    const script = typeof obj.script === "string" ? obj.script.trim() : "";
    if (!script) continue;

    const bucketRaw =
      typeof obj.bucket === "string" ? obj.bucket.trim().toUpperCase() : "";
    const bucket = (REEL_BUCKETS as readonly string[]).includes(bucketRaw)
      ? bucketRaw
      : "INFORMATIVE";

    const key = reelDedupeKey(script);
    if (existingKeys.has(key) || seenThisRun.has(key)) {
      skippedDuplicates += 1;
      continue;
    }
    seenThisRun.add(key);

    const sourceJournalId =
      typeof obj.sourceJournalId === "number" ? obj.sourceJournalId : null;
    const teamId =
      sourceJournalId != null
        ? (teamIdByJournal.get(sourceJournalId) ?? null)
        : null;

    toInsert.push({
      bucket,
      script,
      source: "generated",
      dedupeKey: key,
      sourceJournalId,
      teamId,
      meta: {
        windowStart: start.toISOString(),
        windowEnd: end.toISOString(),
      },
    });

    if (toInsert.length >= MAX_INSERTS_PER_RUN) break;
  }

  if (toInsert.length > 0) {
    // DB-level dedup: even though we filtered against existingKeys above, that
    // set only covers the newest 500 rows and a concurrent run could race us.
    // The unique index on dedupe_key makes duplicate rows a no-op insert.
    await db
      .insert(reelScriptsTable)
      .values(toInsert)
      .onConflictDoNothing({ target: reelScriptsTable.dedupeKey });
  }

  logger.info(
    {
      journals: journals.length,
      candidates: candidates.length,
      inserted: toInsert.length,
      skippedDuplicates,
    },
    "[reels-ai] generation complete",
  );

  return {
    ok: true,
    journals: journals.length,
    candidates: candidates.length,
    inserted: toInsert.length,
    skippedDuplicates,
  };
}
