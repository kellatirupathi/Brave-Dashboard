// Prompt builder for the PER-JOURNAL reel scan. Unlike the old daily batch
// generator, this looks at ONE new journal entry plus the SAME team's previous
// journals and makes a decision: is this entry worthy of an Instagram reel?
// If yes, it returns a single ready-to-shoot script. Pure string building.

export const REEL_BUCKETS = [
  "STORY",
  "INFORMATIVE",
  "PAIN POINT",
  "STUDENT QUESTION",
] as const;

export type ReelScanJournal = {
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

export type ReelScanInput = {
  // Team name is for the model's understanding only; it must NEVER appear in
  // the output (the house style uses "one team" / "one student").
  teamName: string;
  current: ReelScanJournal;
  // This team's earlier journals (most recent first), used so the model can
  // judge whether the new entry actually contains something NEW vs. a repeat.
  previous: ReelScanJournal[];
};

function journalToText(j: ReelScanJournal): string {
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

export function buildJournalReelPrompt(input: ReelScanInput): string {
  const previousBlock =
    input.previous.length > 0
      ? input.previous
          .slice(0, 8)
          .map((j) => journalToText(j))
          .join("\n\n---\n\n")
      : "(this is the team's first journal — no previous entries)";

  return `You are the reel-scout AI for "BRAVE", a 3-month student-entrepreneur programme where teams build AI software for real local businesses and get paid in rupees. Your job is to look at ONE newly submitted weekly journal entry from a SINGLE team and DECIDE whether it is worthy of a short Instagram-Reel. If — and only if — it is worthy, write ONE reel script for it.

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

THIS TEAM'S PREVIOUS JOURNALS (context only — do not write reels for these):
${previousBlock}

THE NEW JOURNAL ENTRY TO JUDGE:
${journalToText(input.current)}

OUTPUT FORMAT — return STRICT JSON only, no markdown, exactly one of:
If worthy:
{"worthy": true, "bucket": "STORY|INFORMATIVE|PAIN POINT|STUDENT QUESTION", "reason": "<one short sentence on why it's reel-worthy>", "script": "<the reel script text>"}
If not worthy:
{"worthy": false, "reason": "<one short sentence on why it's not reel-worthy>"}`;
}
