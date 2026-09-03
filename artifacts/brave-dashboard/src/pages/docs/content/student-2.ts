import type { RoleDoc } from "./types";

export const STUDENT_2: RoleDoc = {
  role: "student",
  version: "2.0",
  title: "Student Walkthrough",
  subtitle:
    "Season 2 replaces uploaded BRDs with a traceable client pipeline: every rupee you claim descends from a lead you met, worked and delivered for. This is how the new flow works end to end.",
  menu: [
    "Dashboard",
    "Weekly Journal",
    "Leads",
    "Leaderboard",
    "GRIT Miles",
    "My Team",
    "Resources",
    "Guidebook",
  ],
  updated: "Season 2.0",
  sections: [
    {
      id: "whats-new",
      title: "What changed from Season 1",
      icon: "sparkles",
      blocks: [
        {
          type: "table",
          columns: ["Season 1.0", "Season 2.0"],
          rows: [
            ["Projects → Order Book + Revenue entries", "Leads → interactions → Project → Payments → BRD"],
            ["You wrote and uploaded a BRD PDF", "The BRD is **composed automatically** from what you logged"],
            ["Demo Day threshold progress", "**GRIT Miles** ladder with levels and rewards"],
            ["Website only", "Website, installable app (PWA) and the Android app from `/get-app`"],
          ],
        },
        {
          type: "callout",
          tone: "info",
          text: "Season 1 is still there as a read-only archive. Use the season switcher on the dashboard to look back at it; new work always goes into the live season.",
        },
      ],
    },
    {
      id: "login",
      title: "Signing in and installing the app",
      icon: "login",
      blocks: [
        {
          type: "steps",
          items: [
            {
              title: "Sign in with NIAT",
              text: "Same Forms SSO as before — mobile number + OTP. No separate password.",
            },
            {
              title: "First time",
              text: "No team and no saved profile → `/profile` first, then `/get-started`.",
            },
            {
              title: "Install the app (optional)",
              text: "Open `/get-app` for the Android APK, or use *Add to Home screen* in Chrome for the installable web app. Both open the same dashboard with camera and location support for lead capture.",
            },
          ],
        },
      ],
    },
    {
      id: "team",
      title: "Teams and membership",
      icon: "users",
      blocks: [
        {
          type: "p",
          text: "Create a team, accept an invitation, join by code (BRAVE-XXXXX) or browse same-campus teams — exactly as in Season 1. One team per student, everyone from the same campus.",
        },
        {
          type: "callout",
          tone: "warn",
          title: "Membership changes need admin approval",
          text: "Joining, accepting an invitation, leaving, or being removed creates a **membership request** that an admin approves. You see it as *pending* on My Team until then. Creating a team is instant.",
        },
        {
          type: "p",
          text: "**My Team** also shows your team's milestone timeline.",
        },
      ],
    },
    {
      id: "dashboard",
      title: "Dashboard (/)",
      icon: "layout",
      blocks: [
        {
          type: "list",
          items: [
            "The **GRIT ring** — verified revenue against the next GRIT level",
            "Weekly journal tracker for the current week and your streak",
            "Pinned announcements, programme countdown and quick links",
            "Season switcher (1.0 archive / 2.0 live) and the notifications bell",
          ],
        },
      ],
    },
    {
      id: "pipeline",
      title: "The lead pipeline — five steps",
      icon: "route",
      intro:
        "Every project starts as a client you actually met. The stepper at the top of /leads shows where your team is.",
      blocks: [
        {
          type: "table",
          columns: ["Step", "What you do", "Where"],
          rows: [
            ["1 · Capture the lead", "Log the client the day you meet them", "/leads → Log a client"],
            ["2 · Work the lead", "Log every dated follow-up; the trail builds", "/leads/:id → Log an interaction"],
            ["3 · Open the project", "Client said yes → define phases and payment plan", "/leads/:id/project"],
            ["4 · Deliver & log payment", "Record each payment received, with proof and invoice", "/leads/:id/delivery/:projectId"],
            ["5 · BRD ready", "Review the composed BRD and submit for review", "same page"],
          ],
        },
        { type: "h3", text: "The two gates" },
        {
          type: "table",
          columns: ["Gate", "Rule", "Where it applies"],
          rows: [
            ["B", "A project starts only from a Converted lead", "Open the project"],
            ["C", "The 7-item checklist before the BRD can be submitted", "Submit for review"],
          ],
        },
        {
          type: "callout",
          tone: "info",
          title: "Convert whenever the client says yes",
          text: "There is no minimum number of interactions and no waiting period. If a client agrees on your first visit, convert the lead the same day. Log interactions because the record is what makes the client credible to a reviewer — not because a button is waiting on them.",
        },
      ],
    },
    {
      id: "capture",
      title: "Step 1 — Capture a lead",
      icon: "target",
      blocks: [
        {
          type: "p",
          text: "Fill it in the day you meet the client, ideally at their premises. 9 fields are mandatory; the rest strengthen the record.",
        },
        {
          type: "list",
          items: [
            "**How you met** — walk-in, found online, referral, known contact. Referral and known-contact leads are **related-party**: allowed, but reviewed more closely, and you must say who referred you / how you know them.",
            "**Business, owner, phone** (the phone is the programme-wide identity of the client), category, city and area",
            "**Use my location** — captures GPS at the client's premises. Cheap for an honest team, impossible to fake from a desk.",
            "**First meeting date and mode**, what they said, their problem, estimated value",
            "**Evidence** — photo with the client, visiting card, shopfront, screenshot",
          ],
        },
        {
          type: "callout",
          tone: "warn",
          text: "If another team has already logged the same client phone, the system flags it to reviewers. Log real clients you personally work with.",
        },
      ],
    },
    {
      id: "work",
      title: "Step 2 — Work the lead",
      icon: "activity",
      blocks: [
        {
          type: "p",
          text: "Every follow-up is an **interaction**: date (not in the future, not before the first meeting), type (call, WhatsApp, email, site visit, demo, proposal, negotiation, payment discussion), summary, outcome (positive / neutral / objection / no response), optional attachment, next action date, and optionally a stage change.",
        },
        { type: "h3", text: "Trail strength (0–100)" },
        {
          type: "table",
          columns: ["Component", "Max", "How"],
          rows: [
            ["Distinct contact dates", "30", "5 points per date, up to 6 dates"],
            ["Time span", "30", "Up to 42 days between first and last contact"],
            ["Evidence", "30", "Share of interactions with an attachment"],
            ["Completeness", "10", "Every interaction has an outcome"],
          ],
        },
        {
          type: "p",
          text: "Bands: **Weak** < 45 · **Moderate** 45–69 · **Strong** 70+. Nothing is blocked by the band — it tells your reviewer how well documented the client is. Time and evidence weigh more than volume on purpose — ten messages in one afternoon count as one date.",
        },
        { type: "h3", text: "Stages" },
        {
          type: "p",
          text: "New → Qualified → Proposal sent → Converted (or Lost). A lead silent for 30 days is marked **Dormant** by the system; you get a nudge at 10 days and your coordinator is looped in at 21.",
        },
      ],
    },
    {
      id: "project",
      title: "Step 3 — Open the project",
      icon: "folder",
      blocks: [
        {
          type: "p",
          text: "When the client agrees, press **Client said yes** on the lead, then **Open the project** (team leader only). One project per lead.",
        },
        {
          type: "list",
          items: [
            "Title, **service category**, problem statement, solution, tech stack",
            "Product links — live product, demo video, source code, prototype — are checked for reachability when you save; a Drive video left on *Restricted* is refused. Add demo credentials for gated products.",
            "**Revenue type** — one-time or recurring (with frequency)",
            "**At least 2 phases**, each with deliverables, dates, and a scheduled amount + due date. The contract value is the sum of the phases.",
          ],
        },
      ],
    },
    {
      id: "payments",
      title: "Step 4 — Deliver and log payments",
      icon: "rupee",
      blocks: [
        {
          type: "p",
          text: "Record money **actually received**, one entry per payment, against a specific phase:",
        },
        {
          type: "list",
          items: [
            "Amount, date, mode (UPI, bank transfer, cash, cheque)",
            "**UTR / reference** — mandatory except for cash, and unique across the whole programme (a reused reference is rejected)",
            "**Payment proof** and **invoice** — both mandatory; delivery proof optional",
            "**Client confirmed** is set by the programme's follow-up call, never by you",
          ],
        },
        {
          type: "callout",
          tone: "info",
          text: "Partial delivery is normal. Honestly logging 2 of 4 phases scores better than claiming 4 with no evidence.",
        },
      ],
    },
    {
      id: "brd",
      title: "Step 5 — The BRD and submitting for review",
      icon: "file",
      blocks: [
        {
          type: "p",
          text: "There is **no BRD form**. The document is assembled from your lead, trail, project, phases and payments, and shown to you to confirm. If something is wrong, fix the underlying record and it regenerates.",
        },
        { type: "h3", text: "The Gate C checklist" },
        {
          type: "checklist",
          items: [
            "Service category, problem, solution and revenue type filled",
            "At least 2 phases",
            "Every phase has a scheduled payment",
            "At least one payment recorded",
            "Payment proof on every payment",
            "Invoice on every payment",
            "Relationship disclosure complete for related-party leads",
          ],
        },
        { type: "h3", text: "What Submit for review does" },
        {
          type: "steps",
          items: [
            { title: "Team leader presses Submit for review" },
            {
              title: "The claim is computed",
              text: "Claimed amount = the sum of payments received, never the contract value.",
            },
            {
              title: "Price recognition",
              text: "If the service category has a recognition cap, the amount that counts toward the leaderboard is trimmed to it and you are told why. Recurring work is weighted ×1.5.",
            },
            {
              title: "A revenue entry is created with status Submitted",
              text: "It appears in the admin Review Queue with the composed BRD.",
            },
            {
              title: "Verified or Rejected",
              text: "Verified → counts for leaderboard, GRIT Miles and trust. Rejected → the reason is shown; fix the records and resubmit if your admin allows it.",
            },
          ],
        },
        {
          type: "callout",
          tone: "warn",
          text: "One submission per project. Nothing can be submitted with ₹0 received.",
        },
      ],
    },
    {
      id: "journal",
      title: "Weekly Journal (/journal)",
      icon: "journal",
      blocks: [
        {
          type: "list",
          items: [
            "One journal per team per week; any member can submit. What we did (required), blockers, next week's plan, and counters: clients visited, active conversations, projects started, projects closed. Up to 10 images.",
            "Silence reminders at day 5 (in-app) and day 7 (in-app + email + coordinator alert), same as Season 1",
            "A 4-week streak earns trust; high-priority blockers are surfaced to your coordinator automatically",
          ],
        },
      ],
    },
    {
      id: "grit",
      title: "GRIT Miles",
      icon: "trophy",
      blocks: [
        {
          type: "p",
          text: "The reward ladder that replaces the single Demo Day threshold. Verified revenue unlocks levels; the dashboard ring shows progress to the next one.",
        },
        {
          type: "table",
          columns: ["Level", "Verified revenue", "Miles"],
          rows: [
            ["1", "₹25,000", "100"],
            ["2", "₹50,000", "150"],
            ["3", "₹1,00,000", "250"],
            ["4", "₹2,00,000", "500"],
            ["5", "₹4,00,000", "1000"],
          ],
        },
        {
          type: "p",
          text: "Admins can tune the levels and rewards; the Finale and People's Choice voting open once your team clears the configured bar.",
        },
      ],
    },
    {
      id: "members",
      title: "Leader vs members",
      icon: "user",
      blocks: [
        {
          type: "cando",
          can: [
            "Any member: submit or edit the weekly journal",
            "Everyone: view every lead, project, payment and the composed BRD their team has recorded",
            "Everyone: leaderboard and GRIT Miles",
          ],
          cannot: [
            "Only the leader runs Leads — capturing clients, logging interactions, converting, projects, phases, payments and submitting for review",
            "Only the leader manages invitations and join requests",
          ],
        },
      ],
    },
    {
      id: "checklist",
      title: "Checklist before you submit",
      icon: "check",
      blocks: [
        {
          type: "checklist",
          items: [
            "Every interaction is dated when it happened, not when you typed it — trails written up in one sitting are flagged",
            "The client's phone number is the real one; it is the client's identity across the programme",
            "Every payment has its own entry, proof and invoice, and the UTR matches the bank",
            "Phases and scheduled amounts reflect the agreement with the client",
            "Read the composed BRD once — it is what the reviewer reads",
          ],
        },
      ],
    },
  ],
};
