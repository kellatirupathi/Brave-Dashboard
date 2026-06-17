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
