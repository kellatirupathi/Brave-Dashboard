// Prompt builder for the daily reel-script generator. Turns a window of weekly
// journals into short Instagram-reel scripts in the BRAVE house style (see the
// reference library): 3–6 sentences, no names, ending in a one-line lesson.
// Pure string building — no I/O, no React.

export type ReelJournalInput = {
  journalId: number;
  // Team name is given ONLY for the model's understanding; it must NEVER appear
  // in the output (the house style uses "one team" / "one student").
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

export const REEL_BUCKETS = [
  "STORY",
  "INFORMATIVE",
  "PAIN POINT",
  "STUDENT QUESTION",
] as const;

export function buildReelsPrompt(
  journals: ReelJournalInput[],
  existingScripts: string[],
): string {
  const journalsBlock = journals
    .map((j) => {
      const lines = [
        `JOURNAL_ID: ${j.journalId}`,
        `Week: ${j.weekStartDate} → ${j.weekEndDate}`,
        `What they did: ${j.whatWeDid}`,
      ];
      if (j.blockers) lines.push(`Blockers / questions: ${j.blockers}`);
      if (j.nextWeekPlan) lines.push(`Next week plan: ${j.nextWeekPlan}`);
      lines.push(
        `Metrics: clientsVisited=${j.clientsVisited}, activeConversations=${j.activeConversations}, projectsStarted=${j.projectsStarted}, projectsClosed=${j.projectsClosed}`,
      );
      return lines.join("\n");
    })
    .join("\n\n---\n\n");

  const existingBlock =
    existingScripts.length > 0
      ? existingScripts.map((s, i) => `${i + 1}. ${s}`).join("\n")
      : "(none yet)";

  return `You write short Instagram-Reel scripts for "BRAVE", a 3-month student-entrepreneur programme where teams build AI software for real local businesses and get paid in rupees. You will be given this period's weekly journals. Turn the reel-worthy ones into scripts.

HOUSE STYLE (follow exactly):
- 3 to 6 sentences. Roughly 40–90 words. Punchy and conversational.
- NEVER use any team name, student name, person name, or campus name. Refer to them as "one team", "one student", or "a team".
- Be strictly factual to the journal. NEVER invent clients, numbers, deals, or outcomes. Use a rupee figure only if it is clearly present in the journal.
- End with a single short takeaway line — a lesson or reframe.
- No emojis, no hashtags, no markdown, no headings inside the script text.

BUCKETS — choose exactly ONE per script:
- "STORY": a narrative of what a team actually did this week (a deal, a build, a visit, an unexpected origin).
- "INFORMATIVE": a lesson or insight drawn from what happened (e.g. why follow-ups matter, why activity beats luck).
- "PAIN POINT": a real struggle/obstacle this week, then a reframe.
- "STUDENT QUESTION": use ONLY when a blocker is phrased as a question or a request for help. Briefly quote the gist, then answer it usefully.

SELECTION RULES:
- Write a script ONLY for journals that are genuinely reel-worthy: a real deal, a notable client interaction, an interesting build, a meaningful struggle, or a good question/blocker.
- SKIP thin or empty journals (e.g. "made a website" with no other substance). It is completely fine to return fewer scripts than journals.
- At most ONE script per journal.

UNIQUENESS (critical):
- Do NOT repeat, copy, or lightly reword any of the EXISTING SCRIPTS listed below.
- Each new script must be distinct from the others you write in this batch and from the existing ones — different angle, different wording, different opening.

EXISTING SCRIPTS (do not repeat these):
${existingBlock}

THIS PERIOD'S JOURNALS:
${journalsBlock}

OUTPUT FORMAT — return STRICT JSON only, no markdown, exactly:
{"scripts":[{"sourceJournalId": <number>, "bucket": "STORY|INFORMATIVE|PAIN POINT|STUDENT QUESTION", "script": "<the reel script text>"}]}
If no journal is reel-worthy, return {"scripts":[]}.`;
}
