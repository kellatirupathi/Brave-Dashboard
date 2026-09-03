import type { RoleDoc } from "./types";

export const COORDINATOR_2: RoleDoc = {
  role: "coordinator",
  version: "2.0",
  title: "Coordinator Walkthrough",
  subtitle:
    "Campus visibility and communication, scoped to your own campus. Season 2 adds the lead pipeline behind every revenue claim, season switching, and a Notifications page.",
  menu: [
    "Dashboard",
    "Review Queue",
    "Journals Tracking",
    "Projects",
    "Leaderboard",
    "Heatmap",
    "Journals",
    "Notifications",
    "Announcements",
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
            ["Revenue entries with an uploaded BRD", "Revenue entries with a **composed BRD** built from the team's lead trail, phases and payments"],
            ["One programme", "**Season switcher** — 1.0 is a read-only archive, 2.0 is live"],
            ["Bell only", "Bell + a full **Notifications** page in the sidebar"],
            ["—", "**Journals Tracking** view and Guidebook link"],
            ["—", "Day-21 escalations for leads the team has stopped working"],
          ],
        },
      ],
    },
    {
      id: "glance",
      title: "Sidebar at a glance",
      icon: "layout",
      blocks: [
        {
          type: "p",
          text: "You land on `/coordinator`. The sidebar: **Dashboard · Review Queue · Journals Tracking · Projects · Leaderboard · Heatmap · Journals · Notifications · Announcements · Guidebook**. Everything is scoped to your campus by the server, not just the UI.",
        },
        {
          type: "p",
          text: "The **season badge** under the logo shows which season you are viewing. Season 1.0 is a read-only archive; Season 2.0 is live. Your selection is remembered.",
        },
      ],
    },
    {
      id: "dashboard",
      title: "Campus Dashboard (/coordinator)",
      icon: "layout",
      blocks: [
        {
          type: "table",
          columns: ["Tile", "Meaning"],
          rows: [
            ["Verified Revenue", "Total verified revenue at your campus in the viewed season"],
            ["Active Teams", "Teams at your campus"],
            ["Demo Eligible / GRIT", "Teams past the configured bar"],
            ["Pending Reviews", "Submitted entries waiting for an admin — informational"],
          ],
        },
        {
          type: "p",
          text: "Plus the notifications bell, journal coverage widgets and quick links.",
        },
      ],
    },
    {
      id: "queue",
      title: "Review Queue (/coordinator/queue)",
      icon: "check",
      blocks: [
        {
          type: "p",
          text: "Read-only mirror of your campus's pending entries. In Season 2 an entry carries the **composed BRD**: client and relationship disclosure, the dated interaction trail, phases with scheduled vs received amounts, payments with proof and invoice links, and the system assessment (trail strength, Gate A, related-party flag).",
        },
        {
          type: "list",
          items: [
            "Use it to coach teams **before** an admin rejects — a weak trail or a missing invoice is visible here",
            "Verify / Reject remain admin-only",
          ],
        },
      ],
    },
    {
      id: "pipeline",
      title: "Understanding the lead pipeline",
      icon: "route",
      intro:
        "You do not operate the pipeline, but every claim you see comes out of it. Knowing the five steps makes coaching concrete.",
      blocks: [
        {
          type: "table",
          columns: ["Step", "What the team does", "What you can check"],
          rows: [
            ["Capture", "Logs the client the day they meet (phone, GPS, evidence)", "Was the location captured? Is the client a known contact (related-party)?"],
            ["Work", "Logs dated interactions; trail strength 0–100", "Trail band (Weak < 45 · Moderate 45–69 · Strong 70+); Gate A = 3 dates over 7+ days"],
            ["Project", "Client said yes → project with 2+ phases and payment plan", "Are phases and amounts realistic?"],
            ["Payment", "Each payment with UTR, proof and invoice", "Do proofs match the amounts?"],
            ["BRD", "Composed automatically; leader submits", "The Gate C checklist shows what was skipped"],
          ],
        },
        {
          type: "callout",
          tone: "info",
          text: "The gates are **advisory** unless the admin enforces them. A team can skip ahead, but the composed BRD records which checks were not met — that is your coaching list.",
        },
        {
          type: "p",
          text: "Silence on a lead triggers a nudge to the student at day 10 and an **escalation notification to you at day 21**; at day 30 the lead is marked dormant. Act on the day-21 alerts from your Notifications page.",
        },
      ],
    },
    {
      id: "journal-tracking",
      title: "Journals Tracking (/coordinator/journal-tracking)",
      icon: "activity",
      blocks: [
        {
          type: "p",
          text: "Week-by-week coverage for every team in your campus, with the AI-extracted blockers and priorities from each journal. High-priority blockers are the ones the escalation chain surfaces to you first.",
        },
      ],
    },
    {
      id: "projects",
      title: "Projects (/coordinator/projects)",
      icon: "folder",
      blocks: [
        {
          type: "p",
          text: "All projects at your campus. Season 2 projects descend from a lead: the detail page shows phases, scheduled vs received payments and the revenue entry status. Season 1 projects (archive) still show order book and revenue entries.",
        },
      ],
    },
    {
      id: "leaderboard",
      title: "Leaderboard (/coordinator/leaderboard)",
      icon: "trophy",
      blocks: [
        {
          type: "p",
          text: "Campus ranking by recognised verified revenue. Admins may hide ranks from students or show a banner; you always see ranks.",
        },
      ],
    },
    {
      id: "heatmap",
      title: "Heatmap (/coordinator/heatmap)",
      icon: "activity",
      blocks: [
        {
          type: "p",
          text: "Unchanged from Season 1: stat cards (Total · Active · Silent · Never logged), week and range filters, status pills, per-row Remind and the bulk **Send reminder to N teams** button. Bulk reminders respect the admin's in-app toggle.",
        },
      ],
    },
    {
      id: "journals",
      title: "Journals (/coordinator/journals)",
      icon: "journal",
      blocks: [
        {
          type: "list",
          items: [
            "**Submitted** — every campus journal, newest first, with the AI summary, category and blockers. Pencil to edit, trash to delete; both audit-logged.",
            "**Teams Missing Journals** — coverage gaps, worst first",
            "Campus scoping is enforced by the API",
          ],
        },
      ],
    },
    {
      id: "notifications",
      title: "Notifications (/coordinator/notifications)",
      icon: "bell",
      blocks: [
        {
          type: "p",
          text: "The full list behind the bell: silent-team alerts (day 7), lead escalations (day 21), announcements targeted at your campus and membership events. Mark individual items or everything as read.",
        },
      ],
    },
    {
      id: "announcements",
      title: "Announcements (/coordinator/announcements)",
      icon: "megaphone",
      blocks: [
        {
          type: "p",
          text: "Title + body, auto-targeted to your campus, with the history of your own and admin-targeted announcements below. Same as Season 1.",
        },
      ],
    },
    {
      id: "profile",
      title: "Profile menu",
      icon: "user",
      blocks: [
        {
          type: "list",
          items: [
            "**Edit profile**",
            "**Documentation** — this page",
            "**Change password** — only if an admin set one for you",
            "**Logout**",
          ],
        },
      ],
    },
    {
      id: "routine",
      title: "Suggested daily routine",
      icon: "clock",
      blocks: [
        {
          type: "steps",
          items: [
            { title: "Notifications", text: "Day-7 silent teams and day-21 lead escalations first" },
            { title: "/coordinator", text: "Tiles: pending reviews, coverage" },
            { title: "/coordinator/heatmap", text: "Silent / Never logged → bulk-remind" },
            { title: "/coordinator/journal-tracking", text: "High-priority blockers → coach those teams" },
            { title: "/coordinator/queue", text: "Open composed BRDs; flag weak trails or missing proofs to the team before the admin sees them" },
            { title: "/coordinator/announcements", text: "Weekly campus update" },
          ],
        },
      ],
    },
    {
      id: "permissions",
      title: "What coordinators can and cannot do",
      icon: "shield",
      blocks: [
        {
          type: "cando",
          can: [
            "View everything in the campus, in either season",
            "View composed BRDs, trails, phases and payments on campus entries",
            "Send single and bulk journal reminders",
            "Edit and delete campus journals (audit-logged)",
            "Post campus announcements",
            "Receive silent-team and lead-escalation notifications",
          ],
          cannot: [
            "Verify, reject or unverify revenue entries",
            "Capture leads, log interactions or edit a team's pipeline",
            "Change config, seasons, gates, thresholds or reminder toggles",
            "Approve membership requests, manage users or the roster",
            "See other campuses or the audit log",
          ],
        },
      ],
    },
  ],
};
