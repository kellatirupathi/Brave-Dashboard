import type { RoleDoc } from "./types";

export const ADMIN_1: RoleDoc = {
  role: "admin",
  version: "1.0",
  title: "Admin Walkthrough",
  subtitle:
    "The NIAT central operator. Full visibility across every campus and full control over teams, revenue verification, programme settings, journals, reminders and user provisioning.",
  menu: [
    "Dashboard",
    "Review Queue",
    "Programme ▸ Teams · Projects · Roster",
    "Performance ▸ Leaderboard · Heatmap · Journals",
    "Demo Day",
    "Setup ▸ Campuses · Users",
    "Communications ▸ Announcements · Audit Log",
    "Config",
  ],
  updated: "Season 1.0",
  sections: [
    {
      id: "dashboard",
      title: "National Dashboard (/admin)",
      icon: "layout",
      blocks: [
        {
          type: "table",
          columns: ["Tile", "What it shows", "Click destination"],
          rows: [
            ["Total Verified Revenue", "Sum across all campuses", "/admin/leaderboard"],
            ["Active Teams", "All active teams", "/admin/teams"],
            ["Demo Day Eligible", "Teams past the ₹2L threshold", "/admin/demo-day"],
            [
              "Pending Reviews",
              "Entries awaiting verification, with the overdue count in red",
              "/admin/queue",
            ],
          ],
        },
        {
          type: "p",
          text: "Below the tiles: **Top Campuses** ranking and the **Action Center** (overdue reviews, Demo Day applications waiting). *Overdue* means submitted but not verified within the SLA — the single most important number to keep at zero.",
        },
      ],
    },
    {
      id: "queue",
      title: "Review Queue (/admin/queue) — the core workflow",
      icon: "check",
      blocks: [
        { type: "h3", text: "Pending Review tab" },
        {
          type: "p",
          text: "Every revenue entry with status *submitted*: team + campus, project + client, amount, submitted date, an Overdue badge past SLA, and buttons to Verify / Reject / open BRD / open supporting doc. The search bar filters by team, project, client or amount.",
        },
        {
          type: "steps",
          items: [
            {
              title: "Open the BRD",
              text: "Check owner details, problem / solution / phase plan, working prototype links, proof of outcome and proof of payment.",
            },
            {
              title: "Cross-check the amount",
              text: "Claimed amount must equal the proof of payment.",
            },
            {
              title: "Verify",
              text: "Enter the verified amount (can be less than claimed). Status → Verified; the leaderboard updates immediately and milestone notifications fire.",
            },
            {
              title: "or Reject",
              text: "An admin note is mandatory (e.g. missing proof of payment, amount mismatch, duplicate). The student sees it in red.",
            },
          ],
        },
        { type: "h3", text: "Approved tab" },
        {
          type: "p",
          text: "Already-verified entries. **Unverify** rolls back a mistaken approval and the leaderboard.",
        },
        {
          type: "checklist",
          items: [
            "Proof-of-payment date is inside the programme window",
            "Amount in BRD = amount in form = bank credit",
            "Not a duplicate (same client + date + amount on the same team)",
            "BRD is not a placeholder or template",
            "Client is a real third party, not a teammate paying themselves",
            "Partial payment → verify only that portion",
          ],
        },
      ],
    },
    {
      id: "teams",
      title: "Programme → Teams",
      icon: "users",
      blocks: [
        {
          type: "p",
          text: "Full directory with campus filter and search. On team detail: every member with NIAT ID and contact, every project, the complete revenue and order-book history including drafts and rejections.",
        },
        {
          type: "list",
          items: [
            "Force-delete a team — only when no submitted/verified entries remain; the API blocks otherwise",
            "Add or remove members (admin-only endpoint)",
            "The legacy approve / request-changes / reject flow for pending teams is dead — teams are active on creation",
          ],
        },
      ],
    },
    {
      id: "projects",
      title: "Programme → Projects",
      icon: "folder",
      blocks: [
        {
          type: "p",
          text: "A flat list of all projects with team/campus filters. Project detail mirrors the student view with admin actions: verify / reject inline, delete entries.",
        },
      ],
    },
    {
      id: "roster",
      title: "Programme → Roster",
      icon: "clipboard",
      intro: "The whitelist of enrolled students allowed in.",
      blocks: [
        {
          type: "list",
          items: [
            "Add a row manually: studentId, full name, email, campus, NIAT ID, batch",
            "Bulk import via XLSX — thousands of rows, chunked at 300 per batch",
            "Download the current roster; edit or delete rows; Clear all (double confirmation)",
            "**Access Requests** tab: self-provisioned users awaiting a campus — approve or deny",
          ],
        },
        {
          type: "callout",
          tone: "info",
          title: "Required columns",
          text: "`studentId`, `fullName`, `email`, `campusName`; optional `niatId`, `batchSectionName`.",
        },
      ],
    },
    {
      id: "leaderboard",
      title: "Performance → Leaderboard",
      icon: "trophy",
      blocks: [
        {
          type: "list",
          items: [
            "National / per-campus toggle",
            "Rank, team, campus, members, total verified",
            "Admin-only controls such as pinning top performers",
          ],
        },
      ],
    },
    {
      id: "heatmap",
      title: "Performance → Heatmap",
      icon: "activity",
      blocks: [
        {
          type: "p",
          text: "Each cell is one programme week: green = journal submitted, grey = none. Stat cards: **Total · Active · Silent (>14d) · Never logged**.",
        },
        {
          type: "table",
          columns: ["Toolbar", "Description"],
          rows: [
            [
              "Send reminder to N teams",
              "Enabled once a filter is active. Every member of every filtered team gets an in-app notification; every send is logged. Respects the master In-app toggle in Config.",
            ],
            ["All campuses", "Admin only, searchable"],
            ["All weeks", "Filter to teams that did not submit that week; column highlighted"],
            ["4w / 8w / 12w / 24w", "Grid range"],
            ["Clear filters", "Resets everything"],
          ],
        },
        {
          type: "p",
          text: "Filters combine with AND. The bulk button count always reflects the current filtered set.",
        },
      ],
    },
    {
      id: "journals",
      title: "Performance → Journals",
      icon: "journal",
      blocks: [
        {
          type: "list",
          items: [
            "**Submitted** — every journal across the programme, newest first; pencil to edit, trash to delete. Both audit-logged with before/after snapshots.",
            "**Teams Missing Journals** — every active team with a *submitted X / 12 weeks* badge, worst first; zero submissions flagged red.",
          ],
        },
        {
          type: "p",
          text: "Coordinators see the same page; the API scopes them to their own campus.",
        },
      ],
    },
    {
      id: "demo-day",
      title: "Demo Day (/admin/demo-day)",
      icon: "trophy",
      blocks: [
        {
          type: "callout",
          tone: "warn",
          text: "A team appears here only after the leader actually **submits** the Demo Day application. Eligible-but-unsubmitted teams are invisible on this page.",
        },
        {
          type: "steps",
          items: [
            { title: "Wait for teams to cross ₹2L verified revenue" },
            { title: "Announce that teams should submit from /demo-day" },
            { title: "Review each submission's pitch deck and links" },
            { title: "Set status: Draft → Submitted → Shortlisted / Rejected" },
            { title: "Optionally assign time slot and presentation order" },
          ],
        },
      ],
    },
    {
      id: "campuses",
      title: "Setup → Campuses",
      icon: "building",
      blocks: [
        {
          type: "p",
          text: "Each campus has a name, city, state and one assigned coordinator. Open a campus to see its users, teams and revenue.",
        },
        {
          type: "callout",
          tone: "danger",
          text: "Deleting a campus only succeeds when no teams reference it. Detach the coordinator first.",
        },
      ],
    },
    {
      id: "users",
      title: "Setup → Users",
      icon: "user",
      blocks: [
        {
          type: "list",
          items: [
            "Search and filter by role or campus; add a user manually with role, email, name, campus, NIAT ID",
            "Bulk import via CSV/XLSX to onboard a whole campus",
            "Edit any user — role, campus, NIAT ID",
            "**Set / change password** for admin and coordinator accounts — enables email + password sign-in at `/admin/login`, and unlocks the self-serve Change password option in their profile menu",
            "Toggle Active — soft-disable instead of delete",
          ],
        },
        {
          type: "callout",
          tone: "info",
          title: "Provenance tags",
          text: "`roster`, `csv_import`, `manual`, `auto_forms_sso`. Watch `auto_forms_sso` — users who self-provisioned without being on the roster may need vetting.",
        },
      ],
    },
    {
      id: "announcements",
      title: "Communications → Announcements",
      icon: "megaphone",
      blocks: [
        {
          type: "list",
          items: [
            "Target All, a campus, or a team",
            "**Pin** an announcement so it stays as a banner on every targeted dashboard until dismissed",
            "Edit or delete past announcements",
          ],
        },
        {
          type: "callout",
          tone: "warn",
          text: "Fan-out to All is synchronous; with thousands of students the request can spin for a few seconds.",
        },
      ],
    },
    {
      id: "audit",
      title: "Communications → Audit Log",
      icon: "clipboard",
      blocks: [
        {
          type: "p",
          text: "Read-only history of every admin and coordinator action: who verified what, who edited config, who deleted a team or journal, who set a password.",
        },
        {
          type: "list",
          items: [
            "Search box — matches actor, action, target type, target ID and details",
            "Date filter — calendar popover with year and month dropdowns; Clear date inside",
            "Clear filters — appears when any filter is active",
            "Live counter in the header: *12 of 100 entries*",
          ],
        },
      ],
    },
    {
      id: "config",
      title: "Config (/admin/config)",
      icon: "settings",
      blocks: [
        { type: "h3", text: "Programme Weeks (left column)" },
        {
          type: "p",
          text: "Auto-generated 7-day chunks anchored to the start date. Each row: week number, date range, Past / Current / Future badge and an Open / Closed toggle. Past weeks default open, future closed. The daily cron opens a week on its start date unless an admin toggled it manually — then a *Manual* lock appears; **Clear** hands control back. **Regenerate from dates** rebuilds the list after changing start/end.",
        },
        { type: "h3", text: "Key Dates & Thresholds (right column)" },
        {
          type: "list",
          items: [
            "Start date (drives weeks), end date, Demo Day date, application deadline",
            "Demo eligibility threshold (₹2,00,000 default), team member limit",
            "Leaderboard Frozen toggle, Demo Day Applications Open toggle",
            "Save Configuration commits dates + thresholds; the weeks card saves per row",
          ],
        },
        { type: "h3", text: "Notifications & Reminders" },
        {
          type: "table",
          columns: ["Toggle", "What it controls"],
          rows: [
            [
              "Student in-app notifications",
              "Bell notifications at day 5 and day 7 of silence; also gates the heatmap Remind buttons",
            ],
            ["Student email reminders", "Email at the day-7 threshold, from brave.niat@nxtwave.in"],
            [
              "Coordinator silent-team alerts",
              "Independent ping to the campus coordinator at day 7",
            ],
            [
              "Allow students to edit/delete past-week journals",
              "OFF by default; staff can always edit regardless",
            ],
          ],
        },
        {
          type: "callout",
          tone: "danger",
          text: "Do not switch Demo Day Applications Open off mid-season while applications are in flight — orphan submissions can result.",
        },
      ],
    },
    {
      id: "cron",
      title: "The reminder service — what runs in the background",
      icon: "clock",
      blocks: [
        {
          type: "steps",
          items: [
            { title: "Auto-opens any programme week whose start date has arrived (skipping manual overrides)" },
            {
              title: "For each active team, finds the latest journal",
              text: "Silent ≥ 5 days → tier-1 in-app reminder. Silent ≥ 7 days → tier-2 in-app + email, plus a coordinator notification.",
            },
            { title: "Writes every send to the reminder log so nothing fires twice within 24 hours" },
          ],
        },
        {
          type: "p",
          text: "All channels respect the master toggles. If a channel is off, neither the cron nor the heatmap Remind button uses it.",
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
            { title: "/admin", text: "Pending Reviews and Overdue counts" },
            { title: "/admin/queue", text: "Clear pending reviews — verify, or reject with notes" },
            { title: "/admin/heatmap", text: "Silent / Never logged; filter and bulk-remind" },
            { title: "/admin/journals", text: "Scan for blockers and behind-schedule signals" },
            { title: "/admin/demo-day", text: "Process new submissions" },
            { title: "/admin/users", text: "Approve or deny pending self-provisioned users" },
            { title: "/admin/announcements", text: "Post deadline reminders and updates" },
            { title: "End of week", text: "Scan /admin/audit-log for anomalies" },
          ],
        },
      ],
    },
  ],
};
