// Prompt builder for the weekly-journal AI auditor (Gemini 2.5 Flash, text
// only). Each weekly journal has three free-text fields — "What did your team
// do this week", "Blockers", and "Plan for next week" — plus four numeric
// counters. The model reads them and returns a single structured JSON object
// that powers the admin journals redesign: clean per-section formatting, a
// fixed-set category classification, and a blocker triage (priority + summary)
// the admin acts on.
//
// Keep the fixed category set in sync with the frontend analytics breakdown.
export const JOURNAL_CATEGORIES = [
  "Product Development",
  "Client Meetings",
  "Sales/Outreach",
  "Payments/Revenue",
  "Testing/QA",
  "Planning",
  "Hiring/Team",
  "Marketing",
  "Other",
] as const;

export type JournalAnalysisInput = {
  teamName: string;
  weekStartDate: string;
  weekEndDate: string;
  whatWeDid: string;
  blockers: string | null;
  nextWeekPlan: string | null;
  clientsVisited: number;
  activeConversations: number;
  projectsStarted: number;
  projectsClosed: number;
};

// Reel buckets for the merged reel-scan half. Kept identical to the old
// standalone reel scan so stored rows and the reels library stay consistent.
export const REEL_BUCKETS = [
  "STORY",
  "INFORMATIVE",
  "PAIN POINT",
  "STUDENT QUESTION",
] as const;

// A compact view of one of THIS team's earlier journals, used as context so
// the model can judge whether the new entry contains something genuinely new.
export type ReelContextJournal = {
  weekStartDate: string;
  weekEndDate: string;
  whatWeDid: string;
  blockers: string | null;
  nextWeekPlan: string | null;
  clientsVisited: number;
  activeConversations: number;
  projectsStarted: number;
  projectsClosed: number;
};

export type JournalMergedInput = JournalAnalysisInput & {
  // This team's earlier journals (most recent first), context for the reel
  // worthiness decision only.
  previous: ReelContextJournal[];
};

function safe(text: string | null | undefined): string {
  const t = (text ?? "").trim();
  return t === "" ? "(none provided)" : t;
}

export function buildJournalAnalysisPrompt(
  input: JournalAnalysisInput,
): string {
  const categoryList = JOURNAL_CATEGORIES.join(", ");
  return `You are an operations analyst for the BRAVE entrepreneurship programme.
You are given ONE team's weekly journal. Read it carefully and return a single
JSON object that restructures it into a clean, scannable format and triages any
blockers for an admin who must assign and resolve them.

CONTEXT
- Team: ${input.teamName}
- Week: ${input.weekStartDate} to ${input.weekEndDate}
- Numeric counters the team reported (already accurate — do NOT recompute,
  just use them to judge effort): clients_visited=${input.clientsVisited},
  active_conversations=${input.activeConversations},
  projects_started=${input.projectsStarted}, projects_closed=${input.projectsClosed}

THE THREE JOURNAL SECTIONS
1) WHAT DID YOUR TEAM DO THIS WEEK:
"""
${safe(input.whatWeDid)}
"""
2) BLOCKERS:
"""
${safe(input.blockers)}
"""
3) PLAN FOR NEXT WEEK:
"""
${safe(input.nextWeekPlan)}
"""

INSTRUCTIONS
- Rewrite each of the three sections into short, clear bullet points. Do NOT
  invent facts — only restructure what is written. If a section is empty, return
  an empty bullets array and an empty summary string for it.
- Classify "what we did" into one or more categories from THIS FIXED SET ONLY
  (never invent a category): ${categoryList}. Pick "Other" only if nothing fits.
- Choose ONE primary_category that best describes the week's main focus.
- BLOCKER TRIAGE (most important — the admin uses this to act):
  - priority: "high" if the blocker is actively stopping progress, involves
    money/payments/legal/external approvals, or explicitly asks for help;
    "medium" if it slows the team but they can keep working; "low" for minor
    or self-resolvable issues; "none" if there is no real blocker.
  - priority_reason: one short sentence justifying the priority.
  - needs_admin: true if an admin/coordinator must intervene to unblock them.
  - summary: a single crisp sentence summarising the blocker (or "" if none).
  - items: each distinct blocker as a short bullet string.
- overall_summary: 1–2 sentences summarising the whole week.

Return ONLY this JSON (no markdown, no commentary):
{
  "what_we_did": { "summary": string, "bullets": string[], "categories": string[] },
  "blockers": {
    "summary": string,
    "priority": "high" | "medium" | "low" | "none",
    "priority_reason": string,
    "needs_admin": boolean,
    "items": string[]
  },
  "next_week": { "summary": string, "bullets": string[] },
  "primary_category": string,
  "overall_summary": string
}`;
}

function reelJournalToText(j: ReelContextJournal): string {
  const lines = [
    `Week: ${j.weekStartDate} → ${j.weekEndDate}`,
    `What they did: ${j.whatWeDid}`,
  ];
  if (j.blockers) lines.push(`Blockers / questions: ${j.blockers}`);
  if (j.nextWeekPlan) lines.push(`Next week plan: ${j.nextWeekPlan}`);
  lines.push(
    `Metrics: clientsVisited=${j.clientsVisited}, activeConversations=${j.activeConversations}, projectsStarted=${j.projectsStarted}, projectsClosed=${j.projectsClosed}`,
  );
  return lines.join("\n");
}

/**
 * MERGED prompt: journal analysis + reel scan in ONE Gemini call. The
 * "analysis" half is behaviourally identical to buildJournalAnalysisPrompt;
 * the "reel" half is behaviourally identical to the old standalone reel scan
 * (strict worthiness judgement using this team's previous journals as
 * context, script only when worthy). Returns one combined JSON object:
 * { "analysis": {...}, "reel": {...} }.
 */
export function buildJournalMergedPrompt(input: JournalMergedInput): string {
  const categoryList = JOURNAL_CATEGORIES.join(", ");
  const previousBlock =
    input.previous.length > 0
      ? input.previous
          .slice(0, 8)
          .map((j) => reelJournalToText(j))
          .join("\n\n---\n\n")
      : "(this is the team's first journal — no previous entries)";

  return `You are an operations analyst AND the reel-scout AI for "BRAVE", a 3-month student-entrepreneur programme run by NIAT where teams build AI software for real local businesses and get paid in rupees.

You are given ONE team's newly submitted weekly journal. You must do TWO independent jobs in ONE response:
- PART A (ANALYSIS): restructure the journal into a clean, scannable format and triage any blockers for an admin who must assign and resolve them.
- PART B (REEL SCAN): decide whether this NEW entry is worthy of a short Instagram-Reel, and if — and only if — it is worthy, write ONE reel script.

CONTEXT
- Team: ${input.teamName}
- Week: ${input.weekStartDate} to ${input.weekEndDate}
- Numeric counters the team reported (already accurate — do NOT recompute,
  just use them to judge effort): clients_visited=${input.clientsVisited},
  active_conversations=${input.activeConversations},
  projects_started=${input.projectsStarted}, projects_closed=${input.projectsClosed}

THE THREE JOURNAL SECTIONS
1) WHAT DID YOUR TEAM DO THIS WEEK:
"""
${safe(input.whatWeDid)}
"""
2) BLOCKERS:
"""
${safe(input.blockers)}
"""
3) PLAN FOR NEXT WEEK:
"""
${safe(input.nextWeekPlan)}
"""

PART A — ANALYSIS INSTRUCTIONS
- Rewrite each of the three sections into short, clear bullet points. Do NOT
  invent facts — only restructure what is written. If a section is empty, return
  an empty bullets array and an empty summary string for it.
- Classify "what we did" into one or more categories from THIS FIXED SET ONLY
  (never invent a category): ${categoryList}. Pick "Other" only if nothing fits.
- Choose ONE primary_category that best describes the week's main focus.
- BLOCKER TRIAGE (most important — the admin uses this to act):
  - priority: "high" if the blocker is actively stopping progress, involves
    money/payments/legal/external approvals, or explicitly asks for help;
    "medium" if it slows the team but they can keep working; "low" for minor
    or self-resolvable issues; "none" if there is no real blocker.
  - priority_reason: one short sentence justifying the priority.
  - needs_admin: true if an admin/coordinator must intervene to unblock them.
  - summary: a single crisp sentence summarising the blocker (or "" if none).
  - items: each distinct blocker as a short bullet string.
- overall_summary: 1–2 sentences summarising the whole week.

PART B — REEL SCAN INSTRUCTIONS
You are given this team's PREVIOUS journals only as context, so you can judge whether the NEW entry actually contains something fresh and reel-worthy, or just repeats what was already covered. NEVER mix in other teams — judge this one team only.

DECISION — is the NEW entry reel-worthy?
Mark it worthy ONLY if the new entry has at least one of:
- An interesting story (a real deal, a client win, an unexpected origin, a memorable visit).
- Something genuinely NEW vs. the previous journals (a new client, a new milestone, a first payment, a turning point).
- A struggle/obstacle with a real lesson or reframe, or a thoughtful question/blocker.
- 2–3 lines that can be built into an interesting, factual content piece.

Mark it NOT worthy (worthy=false) when the entry is generic, thin, or repetitive. Examples that are NOT reel-worthy:
- "This week we didn't do anything."
- "Usual week, mostly fixed bugs."
- "Worked on the website / made small changes." (with no other substance)
- "Same as last week, followed up with clients." (nothing new vs. previous journals)
- Empty, one-line, or purely administrative updates.

Be strict. It is completely fine — and expected — to return worthy=false for most ordinary weeks. Do NOT invent content. Use a rupee figure only if it is clearly present in the new journal.

IF WORTHY — write ONE script in this HOUSE STYLE (follow exactly):
- 3 to 6 sentences. Roughly 40–90 words. Punchy and conversational.
- NEVER use any team name, student name, person name, or campus name. Refer to them as "one team", "one student", or "a team".
- Be strictly factual to the NEW journal. NEVER invent clients, numbers, deals, or outcomes.
- End with a single short takeaway line — a lesson or reframe.
- No emojis, no hashtags, no markdown, no headings inside the script text.
- Choose exactly ONE bucket:
  - "STORY": a narrative of what the team actually did this week.
  - "INFORMATIVE": a lesson or insight drawn from what happened.
  - "PAIN POINT": a real struggle this week, then a reframe.
  - "STUDENT QUESTION": ONLY when a blocker is phrased as a question / request for help — quote the gist, then answer it usefully.

THIS TEAM'S PREVIOUS JOURNALS (context only — do not analyse or write reels for these):
${previousBlock}

OUTPUT FORMAT — return ONLY this single JSON object (no markdown, no commentary):
{
  "analysis": {
    "what_we_did": { "summary": string, "bullets": string[], "categories": string[] },
    "blockers": {
      "summary": string,
      "priority": "high" | "medium" | "low" | "none",
      "priority_reason": string,
      "needs_admin": boolean,
      "items": string[]
    },
    "next_week": { "summary": string, "bullets": string[] },
    "primary_category": string,
    "overall_summary": string
  },
  "reel": {
    "worthy": boolean,
    "bucket": "STORY" | "INFORMATIVE" | "PAIN POINT" | "STUDENT QUESTION" | null,
    "reason": "<one short sentence on why it is / is not reel-worthy>",
    "script": "<the reel script text, or null when not worthy>"
  }
}
When worthy=false, set "bucket" and "script" to null.`;
}
