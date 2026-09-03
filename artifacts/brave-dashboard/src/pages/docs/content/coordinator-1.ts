import type { RoleDoc } from "./types";

export const COORDINATOR_1: RoleDoc = {
  role: "coordinator",
  version: "1.0",
  title: "Coordinator Walkthrough",
  subtitle:
    "The campus-level point of contact. Everything is read-only and scoped to your own campus — your job is visibility, communication and light moderation of journals.",
  menu: [
    "Dashboard",
    "Review Queue",
    "Teams",
    "Projects",
    "Leaderboard",
    "Heatmap",
    "Journals",
    "Announcements",
  ],
  updated: "Season 1.0",
  sections: [
    {
      id: "glance",
      title: "Sidebar at a glance",
      icon: "layout",
      blocks: [
        {
          type: "p",
          text: "When a coordinator logs in they land on `/coordinator`. The sidebar shows **Dashboard · Review Queue · Teams · Projects · Leaderboard · Heatmap · Journals · Announcements**.",
        },
        {
          type: "callout",
          tone: "info",
          text: "Coordinators do **not** see admin-only items such as Config, Users, Roster, Audit Log, Campuses or Demo Day management.",
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
            ["Verified Revenue", "Total verified revenue at your campus"],
            ["Active Teams", "Number of teams at your campus"],
            ["Demo Eligible", "Teams at your campus that crossed ₹2L"],
            [
              "Pending Reviews",
              "Submitted entries from your campus — informational only; coordinators cannot verify",
            ],
          ],
        },
        {
          type: "p",
          text: "Plus a **Notifications bell** (top right) and quick links to Teams / Leaderboard / Announcements. The pending-review number is a prompt to nudge teams whose documents look weak, or to pass the message to admins.",
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
          text: "A read-only mirror of your campus's pending revenue entries. You can see what is waiting, open BRDs and supporting documents, and spot weak submissions so you can coach the team **before** an admin rejects.",
        },
        {
          type: "callout",
          tone: "warn",
          text: "Verify and Reject buttons do not appear in the coordinator view.",
        },
      ],
    },
    {
      id: "teams",
      title: "Teams (/coordinator/teams)",
      icon: "users",
      blocks: [
        {
          type: "p",
          text: "Read-only list of every team at your campus: name, member count, total revenue and status. Click a row to open the same team-detail page admins use, with actions restricted to viewing.",
        },
        {
          type: "list",
          items: [
            "Are members properly listed?",
            "Are any teams inactive — no entries, no projects?",
            "Which teams submitted recently?",
          ],
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
          text: "All projects at your campus with filter and search. Open a project to see its order book and revenue entries, including drafts — useful for checking how each team is progressing.",
        },
      ],
    },
    {
      id: "leaderboard",
      title: "Leaderboard (/coordinator/leaderboard)",
      icon: "trophy",
      blocks: [
        {
          type: "list",
          items: [
            "Campus ranking by verified revenue",
            "Identify top performers to highlight and under-performers to nudge",
            "Track the campus's standing over time",
          ],
        },
      ],
    },
    {
      id: "heatmap",
      title: "Heatmap (/coordinator/heatmap)",
      icon: "activity",
      intro:
        "The activity surface for the weekly journal system, auto-scoped to your campus.",
      blocks: [
        {
          type: "p",
          text: "Stat cards on top: **Total teams · Active · Silent (>14d) · Never logged**.",
        },
        {
          type: "table",
          columns: ["Toolbar element", "What it does"],
          rows: [
            [
              "Send reminder to N teams",
              "Bulk button, enabled once a filter is active. Confirm → every filtered team gets an in-app reminder; logged to the audit trail.",
            ],
            ["All campuses dropdown", "Hidden for coordinators — you are already scoped"],
            [
              "All weeks dropdown",
              "Pick a week to filter to teams that did **not** submit that week; the column is highlighted",
            ],
            ["4w / 8w / 12w / 24w", "How many weeks the grid shows"],
            ["Clear filters", "Appears when any filter is active; resets everything"],
          ],
        },
        {
          type: "steps",
          items: [
            { title: "Open the heatmap and check the Silent and Never logged cards" },
            {
              title: "Apply a filter",
              text: "e.g. Never logged + Week 4 → who missed last week",
            },
            {
              title: "Send reminder to N teams → confirm",
              text: "Or use the row's Remind button for a single team",
            },
          ],
        },
        {
          type: "callout",
          tone: "info",
          text: "Bulk reminders respect the admin's master *In-app notifications* toggle in Config. If it is off, the button returns an error.",
        },
      ],
    },
    {
      id: "journals",
      title: "Journals (/coordinator/journals)",
      icon: "journal",
      blocks: [
        { type: "h3", text: "Submitted tab" },
        {
          type: "p",
          text: "Every journal from teams in your campus, newest first: team, week range, who submitted, and the three fields (What we did / Blockers / Next week plan).",
        },
        {
          type: "list",
          items: [
            "**Pencil** — edit a team's text (typos, sensitive information). Every edit is audit-logged with a before/after snapshot.",
            "**Trash** — delete an inappropriate entry after a confirmation prompt. Also audit-logged.",
          ],
        },
        { type: "h3", text: "Teams Missing Journals tab" },
        {
          type: "p",
          text: "Coverage gaps: every active team with a *submitted X / 12 weeks* badge, worst first. Teams with zero submissions are flagged in red.",
        },
        {
          type: "callout",
          tone: "info",
          text: "The API enforces campus scoping server-side — a request to edit or delete another campus's journal is rejected.",
        },
      ],
    },
    {
      id: "announcements",
      title: "Announcements (/coordinator/announcements)",
      icon: "megaphone",
      blocks: [
        {
          type: "steps",
          items: [
            { title: "Click + New Announcement" },
            { title: "Title + message body" },
            {
              title: "Target is fixed to your campus",
              text: "You cannot target All or other campuses.",
            },
            { title: "Send" },
          ],
        },
        {
          type: "list",
          items: [
            "\"Reminder: BRD must include proof of payment\"",
            "\"Coordinator office hours Wednesday 4pm\"",
            "\"Deadline reminder: Demo Day applications close on X\"",
            "\"Submit your weekly journal by Sunday\"",
          ],
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
            "**Edit profile** — name, email, NIAT ID",
            "**Change password** — only if an admin has set a password for your account; SSO-only coordinators do not see it",
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
            { title: "/coordinator", text: "Glance at the four tiles. Any spike in pending reviews?" },
            { title: "/coordinator/heatmap", text: "Silent / Never logged counts. Filter and bulk-remind." },
            { title: "/coordinator/journals", text: "Scan for blockers and behind-schedule signals. Coach." },
            { title: "/coordinator/teams", text: "Spot inactive teams to follow up with." },
            { title: "/coordinator/leaderboard", text: "Campus standing; pick a team to highlight." },
            { title: "/coordinator/projects", text: "Spot-check BRDs before teams submit." },
            { title: "/coordinator/announcements", text: "Post the weekly campus update." },
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
            "View everything within the campus (read-only for revenue, order book, projects)",
            "View the campus leaderboard and heatmap",
            "Send single or bulk reminders to silent teams",
            "Edit and delete weekly journals from teams in the campus (audit-logged)",
            "Post campus-wide announcements",
            "Receive day-7 silent-team alerts as in-app notifications",
          ],
          cannot: [
            "Verify or reject revenue entries",
            "Edit programme config, thresholds or master toggles",
            "Add or remove users, or edit the roster",
            "Manage programme weeks",
            "Send announcements to other campuses or to All",
            "See or affect data outside the assigned campus",
            "View or manage the audit log",
          ],
        },
        {
          type: "p",
          text: "If a coordinator needs any of these, they escalate to a NIAT admin.",
        },
      ],
    },
    {
      id: "matrix",
      title: "Quick reference — who can do what",
      icon: "table",
      blocks: [
        { type: "h3", text: "On the same revenue entry" },
        {
          type: "table",
          columns: ["", "Student", "Coordinator", "Admin"],
          rows: [
            ["See entry exists", "Their team", "Their campus", "Everywhere"],
            ["Open BRD", "Yes", "Yes", "Yes"],
            ["Edit / submit", "Leader only", "No", "No"],
            ["Verify / Reject", "No", "No", "Yes"],
            ["Unverify", "No", "No", "Yes"],
            ["See rejection note", "Yes", "Yes", "Yes"],
          ],
        },
        { type: "h3", text: "On the same journal entry" },
        {
          type: "table",
          columns: ["", "Student", "Coordinator", "Admin"],
          rows: [
            ["Submit journal", "Any member, any open week", "No", "No"],
            ["Edit current week", "Yes", "Yes", "Yes"],
            ["Edit past week", "Only if admin toggle is ON", "Their campus", "Yes"],
            ["Delete journal", "Only if admin toggle is ON", "Their campus", "Yes"],
            ["Send single reminder", "No", "Their campus", "Yes"],
            ["Send bulk reminder", "No", "Their campus, filtered", "Any campus, filtered"],
            ["Receive silence reminder", "Own team", "Campus teams at day 7", "No"],
          ],
        },
        {
          type: "callout",
          tone: "info",
          text: "Use these tables to explain \"why can't I do X\" — it is a permissions rule, not a bug.",
        },
      ],
    },
  ],
};
