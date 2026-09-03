import type { RoleDoc } from "./types";

export const STUDENT_1: RoleDoc = {
  role: "student",
  version: "1.0",
  title: "Student Walkthrough",
  subtitle:
    "How the BRAVE Dashboard works from a student's seat — from first login to a verified revenue entry.",
  menu: [
    "Dashboard",
    "Projects",
    "Leaderboard",
    "My Team",
    "Weekly Journal",
    "Demo Day",
  ],
  updated: "Season 1.0",
  sections: [
    {
      id: "login",
      title: "Logging in for the first time",
      icon: "login",
      blocks: [
        {
          type: "steps",
          items: [
            {
              title: "Open the dashboard and click Login",
              text: "You sign in through the NIAT learning portal (Forms SSO). There is no separate BRAVE password.",
            },
            {
              title: "First-time landing",
              text: "If you have no team and have never saved a profile, the app sends you to `/profile` to fill in your name and NIAT ID. After saving you land on `/get-started`.",
            },
            {
              title: "Every later login",
              text: "Straight to `/get-started` if you are not on a team yet, or to `/` (Team Dashboard) once you are.",
            },
          ],
        },
      ],
    },
    {
      id: "team",
      title: "Joining or creating a team",
      icon: "users",
      intro: "Four ways to be on a team — walk through them in this order.",
      blocks: [
        {
          type: "table",
          columns: ["Option", "When to use", "Result"],
          rows: [
            [
              "Create team",
              "You want to start fresh and lead",
              "You become the team leader; the team is active immediately",
            ],
            [
              "Accept invitation",
              "A leader invited you by name / NIAT ID",
              "Pending invitations appear at the top of `/get-started`",
            ],
            [
              "Join by code",
              "You received a BRAVE-XXXXX code",
              "Goes through `/join`; the leader approves the request",
            ],
            [
              "Browse same-campus teams",
              "See who is recruiting on your campus",
              "Goes through `/browse-teams`; send a join request",
            ],
          ],
        },
        {
          type: "callout",
          tone: "warn",
          title: "Rules to remember",
          text: "You can be on **only one team** at a time. All teammates must be from the **same campus**. The **team leader** alone can add Projects, Order Book and Revenue entries and approve join/leave requests — other members see everything but cannot edit.",
        },
      ],
    },
    {
      id: "inside",
      title: "Inside the team",
      icon: "layout",
      blocks: [
        {
          type: "p",
          text: "Once you are on a team the sidebar shows **Dashboard · Projects · Leaderboard · My Team · Weekly Journal · Demo Day**.",
        },
        { type: "h3", text: "Dashboard (/)" },
        {
          type: "list",
          items: [
            "Total verified revenue and a progress bar toward the Demo Day threshold (₹2,00,000 by default)",
            "Recent announcements and milestones earned",
            "Three progress widgets at the top — see below",
          ],
        },
        {
          type: "table",
          columns: ["Widget", "What it shows"],
          rows: [
            [
              "Weekly Journal Status",
              "This week's submission status (green *Submitted* or amber *Pending*), the week's date range and a Submit / View button",
            ],
            [
              "Journal Streak",
              "Consecutive prior weeks with a journal. A flame appears at 4+ weeks.",
            ],
            [
              "Recent Activity",
              "Last journal date with a traffic-light badge (green on track · amber catch up · red falling behind) and total journals submitted",
            ],
          ],
        },
        { type: "h3", text: "My Team (/team)" },
        {
          type: "list",
          items: [
            "Members list and the invite code to share",
            "Invitations you sent, join requests received, leave requests",
            "Milestone timeline",
          ],
        },
        { type: "h3", text: "Projects (/projects)" },
        {
          type: "p",
          text: "Every business venture is one **Project**. Inside a project the team logs **Order Book** entries and **Revenue** entries.",
        },
      ],
    },
    {
      id: "orderbook-vs-revenue",
      title: "Order Book vs Revenue — the most important part",
      icon: "rupee",
      blocks: [
        {
          type: "table",
          columns: ["", "Order Book", "Revenue"],
          rows: [
            [
              "What it represents",
              "Money **promised** by a client (signed PO, contract, written commitment)",
              "Money **actually received** in the bank",
            ],
            [
              "Required document",
              "Supporting doc — optional but recommended",
              "BRD (Business Requirement Document) — **mandatory**",
            ],
            [
              "Status flow",
              "Shows directly as Confirmed",
              "Draft → Submitted → Verified / Rejected",
            ],
            ["Counts for leaderboard?", "No", "Only when **Verified**"],
            ["Counts for Demo Day?", "No", "Only verified revenue counts"],
          ],
        },
        {
          type: "callout",
          tone: "info",
          text: "Order Book = a promise. Revenue = real money in the bank. Only **Revenue with a Verified status** counts for ranking and Demo Day.",
        },
      ],
    },
    {
      id: "multiple-entries",
      title: "Multiple entries in one project",
      icon: "layers",
      blocks: [
        {
          type: "p",
          text: "A single project can have many order-book and many revenue entries — that is by design. Example project **\"TechFix — laptop repair service\"**:",
        },
        {
          type: "list",
          items: [
            "Order Book: Rahul ₹15,000 (signed quote) · Priya ₹8,000 (verbal) · Acme Corp ₹50,000 (signed PO)",
            "Revenue: Rahul ₹15,000 on 12-Apr — Verified · Priya ₹8,000 on 18-Apr — Pending review · Acme ₹25,000 first instalment on 22-Apr — Draft",
          ],
        },
        {
          type: "list",
          items: [
            "Add **one entry per client, per payment** — never club clients together",
            "If a client pays in 3 instalments, that is 3 revenue entries so each can be verified on its own",
            "The project page shows three numbers: **Verified Revenue**, **Order Book** total and distinct **Clients**",
          ],
        },
      ],
    },
    {
      id: "upload",
      title: "How to upload, step by step",
      icon: "upload",
      blocks: [
        { type: "h3", text: "Adding an Order Book entry" },
        {
          type: "steps",
          items: [
            { title: "Projects → open a project → Order Book tab → Add Order" },
            { title: "Fill in client name, amount (₹) and optional notes" },
            {
              title: "Attach the supporting doc",
              text: "PO or signed contract. Optional, strongly recommended.",
            },
            {
              title: "Click Add Order",
              text: "It appears immediately as Confirmed.",
            },
          ],
        },
        { type: "h3", text: "Adding a Revenue entry" },
        {
          type: "steps",
          items: [
            { title: "Projects → open a project → Revenue tab → Add Revenue" },
            {
              title: "Fill in client name, amount and payment date",
              text: "The date cannot be in the future.",
            },
            {
              title: "Upload the BRD",
              text: "Mandatory. PDF or DOCX only.",
            },
            {
              title: "Save as Draft",
              text: "The entry shows a Draft badge. Review it.",
            },
            {
              title: "Submit for verification",
              text: "Status moves to Pending Review. Admin verifies (counts toward the leaderboard) or rejects with a note.",
            },
          ],
        },
        {
          type: "callout",
          tone: "warn",
          title: "File rules",
          text: "Max **25 MB**. Allowed: PDF, JPG/PNG/GIF/WEBP, DOC/DOCX. The **BRD must be PDF or DOCX** — images are rejected. Files are private to your team and the reviewing coordinator/admin.",
        },
      ],
    },
    {
      id: "checklist",
      title: "Checklist before you save",
      icon: "check",
      blocks: [
        { type: "h3", text: "Before adding an Order Book entry" },
        {
          type: "checklist",
          items: [
            "Client name is the real client (not \"Client 1\")",
            "Amount is in rupees, not paise (₹15,000 is typed as 15000)",
            "Notes say what the client agreed to — item, scope, payment terms",
            "The supporting doc is the right file",
          ],
        },
        { type: "h3", text: "Before adding a Revenue entry" },
        {
          type: "checklist",
          items: [
            "The payment has actually hit your bank — expected money belongs in the Order Book",
            "Amount matches the bank credit exactly",
            "Payment date is when the money arrived, not the invoice date",
            "BRD contains all 7 sections: Business Owner Details · Problem Identified · Solution Proposed · Phase-wise Plan · Prototype / Demo links · Proof of Outcome · Proof of Payment",
            "Proof of Payment shows the same amount and date as the form — mismatches are rejected",
            "Instalments are logged as separate entries",
          ],
        },
        { type: "h3", text: "Before clicking Submit for verification" },
        {
          type: "checklist",
          items: [
            "Re-read the entry — once submitted, only an admin can change it",
            "The BRD opens correctly in preview",
            "It is not a duplicate of a payment already submitted",
          ],
        },
        {
          type: "callout",
          tone: "danger",
          title: "If an entry is rejected",
          text: "The admin's reason appears in red on the entry. A rejected entry cannot be resubmitted directly — add a new revenue entry with the corrected information and a fixed BRD.",
        },
      ],
    },
    {
      id: "journal",
      title: "Weekly Journal (/journal)",
      icon: "journal",
      intro:
        "A mandatory weekly check-in that keeps your team visible to coordinators even when revenue is slow.",
      blocks: [
        {
          type: "list",
          items: [
            "One short journal per team per week, anchored to the programme weeks (Week 1, Week 2 …)",
            "Submit any time Monday–Sunday; **any team member** can submit or edit on behalf of the team",
            "Three fields: **What did your team do this week?** (required, 5+ characters) · Blockers · Plan for next week",
          ],
        },
        { type: "h3", text: "The week picker" },
        {
          type: "p",
          text: "A dropdown at the top right lists every open week; the current one carries a *current* badge. Pick the current week to submit or update, or a past open week to view it (editing past weeks is possible only if the admin has switched that on).",
        },
        { type: "h3", text: "What happens if a team goes silent" },
        {
          type: "table",
          columns: ["Silence", "What fires"],
          rows: [
            ["Day 5", "Tier-1 reminder — in-app bell notification to every member"],
            [
              "Day 7",
              "Tier-2 reminder — in-app + email, and the campus coordinator is alerted",
            ],
            [
              "Ongoing",
              "The team shows as *Silent* or *Never logged* on the coordinator's heatmap",
            ],
          ],
        },
      ],
    },
    {
      id: "members",
      title: "What members (non-leaders) can do",
      icon: "shield",
      blocks: [
        {
          type: "cando",
          can: [
            "View everything — dashboard, projects, order book, revenue entries, BRDs",
            "View leaderboard, Demo Day status, milestones, announcements",
            "Submit or edit the weekly journal on behalf of the team",
            "Send or accept their own leave request",
          ],
          cannot: [
            "Add or edit Projects, Order Book or Revenue entries",
            "Invite members or approve join requests",
            "Delete the team",
          ],
        },
        {
          type: "p",
          text: "If a member needs to log something revenue-related, they ask the leader. Journals are the exception — any member can submit them.",
        },
      ],
    },
    {
      id: "demo-day",
      title: "Demo Day eligibility — the why behind it all",
      icon: "trophy",
      blocks: [
        {
          type: "list",
          items: [
            "Threshold: **₹2,00,000 verified revenue** (admin-configurable). The dashboard progress bar shows how close you are.",
            "Only when verified revenue ≥ threshold can the leader submit a Demo Day application from `/demo-day`",
            "Auto-milestones at ₹50,000 · ₹1,00,000 · threshold keep the team motivated",
          ],
        },
      ],
    },
    {
      id: "demo-flow",
      title: "Quick demo flow for training",
      icon: "play",
      blocks: [
        {
          type: "steps",
          items: [
            { title: "Login → land on /get-started" },
            { title: "Create Team → become leader → land on /" },
            { title: "Show the sidebar update: Projects, My Team, Weekly Journal, Demo Day" },
            { title: "Dashboard → point out the three widgets" },
            { title: "Weekly Journal → submit a test journal → status flips to Submitted" },
            { title: "Projects → New Project \"TechFix\" → Save" },
            { title: "Order Book → Add Order (Rahul, ₹15,000) → appears as Confirmed" },
            { title: "Revenue → Add Revenue with a sample PDF as BRD → Save as Draft" },
            { title: "Submit for verification → Pending Review; admin verifies → Verified badge" },
            { title: "Add a second revenue entry → totals sum on the project tile" },
            { title: "/leaderboard → the team's rank reflects the verified amount" },
          ],
        },
      ],
    },
  ],
};
