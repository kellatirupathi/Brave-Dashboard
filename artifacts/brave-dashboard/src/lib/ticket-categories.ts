// The support ticket category tree (additive, isolated).
//
// Six categories, each with the specific complaints students actually report.
// Every entry maps to a real screen or a real failure in the student app, so a
// ticket arrives already routed rather than as "technical issue" for the third
// time this week.
//
// SUB-CATEGORIES ARE PHRASED AS SYMPTOMS, not nouns — "BRD won't submit"
// rather than "BRD submission". People pick correctly when they recognise
// their own problem in the wording, and badly when they have to classify it.
//
// "Something else" deliberately sits at the BOTTOM of the last category rather
// than being a category of its own. A top-level escape hatch is where most
// tickets end up when someone would rather not think about it; one level down,
// most tickets get routed properly instead.

/** Category codes. These are Postgres enum values — see schema/brave.ts. */
export const TICKET_CATEGORIES = [
  "leads_clients",
  "projects_brd",
  "revenue_payments",
  "team_membership",
  "journal_grit",
  "account_technical",
] as const;

export type TicketCategory = (typeof TICKET_CATEGORIES)[number];

export type TicketCategoryDef = {
  value: TicketCategory;
  label: string;
  subcategories: string[];
};

export const TICKET_CATEGORY_TREE: TicketCategoryDef[] = [
  {
    value: "leads_clients",
    label: "Leads & Clients",
    subcategories: [
      "Can't add or edit a lead",
      "Lead stage / status is wrong",
      "Duplicate or wrongly-flagged lead",
      "Interactions or meet proofs won't save",
      "Lead marked dormant by mistake",
    ],
  },
  {
    value: "projects_brd",
    label: "Projects & BRD",
    subcategories: [
      "Can't create or edit a project",
      "BRD won't submit for review",
      "Missing items blocking submission",
      "BRD was rejected — need help fixing it",
      "Phases won't save or show wrong amounts",
    ],
  },
  {
    value: "revenue_payments",
    label: "Revenue & Payments",
    subcategories: [
      "Payment not showing / not recorded",
      "Revenue rejected — need clarification",
      "Verified amount looks wrong",
      "Payment proof or invoice won't upload",
      "Client disputed a payment",
    ],
  },
  {
    value: "team_membership",
    label: "Team & Membership",
    subcategories: [
      "Can't join or create a team",
      "Add / remove member request stuck",
      "Leave-team request pending too long",
      "Wrong team or campus on my account",
      "Team leader change",
    ],
  },
  {
    value: "journal_grit",
    label: "Journal, GRIT & Leaderboard",
    subcategories: [
      "Weekly journal won't submit",
      "Submission window closed / need to edit",
      "GRIT Miles count looks wrong",
      "Leaderboard rank or revenue wrong",
      "Demo Day / Finale submission issue",
    ],
  },
  {
    value: "account_technical",
    label: "Account & Technical",
    subcategories: [
      "Can't log in / password reset",
      "Page not loading or showing an error",
      "Upload or attachment fails",
      "Mobile app issue",
      "Wrong season showing",
      "Something else",
    ],
  },
];

const BY_VALUE = new Map(TICKET_CATEGORY_TREE.map((c) => [c.value, c]));

/**
 * Display label for a stored category code.
 *
 * Falls back to the raw code so a ticket written under one of the superseded
 * values (technical / leads / revenue / team / account / other) still renders
 * something rather than an empty cell.
 */
export function categoryLabel(value: string): string {
  return BY_VALUE.get(value as TicketCategory)?.label ?? LEGACY_LABELS[value] ?? value;
}

/** The pre-tree category values, kept readable in the admin queue. */
const LEGACY_LABELS: Record<string, string> = {
  technical: "Technical issue",
  leads: "Leads & pipeline",
  revenue: "Revenue & payments",
  team: "Team & members",
  account: "Account & access",
  other: "Something else",
};

export function subcategoriesFor(value: string): string[] {
  return BY_VALUE.get(value as TicketCategory)?.subcategories ?? [];
}

/** Every category the admin filter offers — current tree plus anything legacy. */
export const ALL_FILTERABLE_CATEGORIES: { value: string; label: string }[] = [
  ...TICKET_CATEGORY_TREE.map((c) => ({ value: c.value, label: c.label })),
];
