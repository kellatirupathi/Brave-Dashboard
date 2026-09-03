import type { RoleDoc } from "./types";

export const ADMIN_2: RoleDoc = {
  role: "admin",
  version: "2.0",
  title: "Admin Walkthrough",
  subtitle:
    "Season 2 keeps everything from Season 1 and adds the lead pipeline, seasons, membership approval, a Leads oversight page, per-page admin permissions, WhatsApp broadcasts and a much larger Config.",
  menu: [
    "Dashboard",
    "Review Queue",
    "Team Requests",
    "Programme ▸ Teams · Leads · Projects · Roster",
    "Performance ▸ Leaderboard · Heatmap · Journals",
    "Submissions ▸ Finale · Demo Day · People's Choice",
    "Setup ▸ Campuses · Users · New user requests",
    "Communications ▸ Announcements · Popups · Submission requests · Feedback · Audit Log",
    "Campus Insights",
    "Reports ▸ Journal reports · Chatbot history · Reels scripts",
    "Config",
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
          columns: ["Area", "Season 2.0"],
          rows: [
            ["Revenue", "Claims descend from a **lead pipeline**; the BRD is composed, not uploaded; price recognition caps and a recurring ×1.5 weight"],
            ["Seasons", "Season 1.0 archived read-only; 2.0 live; staff default season independent of the student season"],
            ["Membership", "Every join / leave / removal goes through **Team Requests** for admin approval"],
            ["Oversight", "**Programme → Leads**: every lead of every team with trail, Gate A, project, payments and BRD status"],
            ["Access", "**Super admins** and per-page permissions (view / edit / delete / approve / reject / export / hidden)"],
            ["Comms", "**WhatsApp broadcasts** (super admin), popups, per-category email kill switches"],
            ["Trust", "Team **trust standing** ledger and reviewer signals"],
          ],
        },
      ],
    },
    {
      id: "dashboard",
      title: "National Dashboard (/admin)",
      icon: "layout",
      blocks: [
        {
          type: "p",
          text: "KPI tiles (verified revenue, active teams, eligible teams, pending / overdue reviews), Top Campuses, the Action Center, journal coverage and app-usage metrics. All figures follow the **season you are viewing** (badge under the logo).",
        },
      ],
    },
    {
      id: "queue",
      title: "Review Queue (/admin/queue)",
      icon: "check",
      blocks: [
        {
          type: "p",
          text: "Same verify / reject workflow as Season 1, with more evidence per entry:",
        },
        {
          type: "list",
          items: [
            "**Composed BRD** for Season 2 entries — client, relationship disclosure, dated trail with *logged-after* hours (backdating signal), phases, payments with proof/invoice links, system assessment",
            "**AI relevancy and uniqueness scores** on uploaded PDF BRDs (Season 1 style entries), with *Detailed analysis* and per-row Regenerate",
            "**Rejection reasons** catalogue (Config) for one-click, consistent notes",
            "Claimed vs **recognised** vs **weighted** amounts — the leaderboard counts the weighted figure",
          ],
        },
        {
          type: "callout",
          tone: "info",
          text: "Verifying awards the team +10 trust; trimming a claim by more than 10% records an overstatement (−25). Rejecting records *evidence missing* (−10). These are automatic.",
        },
      ],
    },
    {
      id: "team-requests",
      title: "Team Requests (/admin/team-requests)",
      icon: "users",
      blocks: [
        {
          type: "p",
          text: "The approval gate over membership. Join-by-code, accepted invitations, leader-approved join requests, leaving and removals all arrive here as pending requests. Approve or reject; the one-team, capacity and leader-transfer rules are re-checked at approval time. Team creation and admin direct add/remove stay instant.",
        },
      ],
    },
    {
      id: "leads",
      title: "Programme → Leads (/admin/leads)",
      icon: "target",
      intro:
        "Every lead from every team in the viewed season, one row each, tracked from capture to BRD.",
      blocks: [
        {
          type: "list",
          items: [
            "**Columns**: client · team & campus · source (related-party flag) · stage · pipeline step (5 dots) · trail strength · interactions (with evidence) · Gate A · last contact & silent days · estimated value · project · received ₹ · **BRD status** · captured date",
            "**Filters** panel: campus, team, stage, source, trail band, Gate A, BRD status, related-party / needs follow-up; plus search and sortable columns",
            "**Summary tiles** over the filtered set: leads, Gate A passed, need follow-up, projects, BRD submitted, ₹ received / verified",
            "**Row → detail**: full trail, project phases, payments with proof links, the composed BRD and its Gate C checklist, duplicate-client warnings, team members",
            "**Export** the filtered set as CSV (gated by the page's export permission)",
          ],
        },
        {
          type: "table",
          columns: ["BRD status", "Meaning"],
          rows: [
            ["No project yet", "Lead not converted / no project"],
            ["Awaiting payment", "Project exists, nothing received"],
            ["In progress", "Payments logged, checklist items still failing"],
            ["Ready to submit", "Checklist clear, not submitted"],
            ["Submitted / Verified / Rejected", "Revenue entry state"],
          ],
        },
      ],
    },
    {
      id: "teams-projects-roster",
      title: "Programme → Teams · Projects · Roster",
      icon: "folder",
      blocks: [
        {
          type: "list",
          items: [
            "**Teams** — directory with campus filter, bulk import, duplicate-name detection and rename notices, per-team submission exemptions, admin notes, membership history",
            "**Projects** — all projects; Season 2 detail shows phases, schedule and payments; Season 1 shows order book and revenue entries",
            "**Roster** — the whitelist, XLSX import, access requests. Approving an access request provisions roster access in the same step.",
          ],
        },
      ],
    },
    {
      id: "performance",
      title: "Performance → Leaderboard · Heatmap · Journals",
      icon: "trophy",
      blocks: [
        {
          type: "list",
          items: [
            "**Leaderboard** — national / campus, ranks by weighted verified revenue; Config lets you hide ranks from students and show a banner image or template",
            "**Heatmap** — unchanged: silence stat cards, week/range filters, single and bulk reminders",
            "**Journals** — submitted list with AI summary, category, blockers and reel-worthy moments; edit/delete audit-logged; missing-journal coverage",
          ],
        },
      ],
    },
    {
      id: "submissions",
      title: "Submissions → Finale · Demo Day · People's Choice",
      icon: "award",
      blocks: [
        {
          type: "list",
          items: [
            "**Finale submissions** — teams past the finale revenue bar upload their final deliverable; approve / reject / export; optional Google Drive mirror",
            "**Demo Day submissions** — best-project submissions and shortlisting",
            "**People's Choice votes** — results of PCA voting once enabled in Config",
          ],
        },
      ],
    },
    {
      id: "setup",
      title: "Setup → Campuses · Users · New user requests",
      icon: "building",
      blocks: [
        {
          type: "list",
          items: [
            "**Campuses** — name, city, coordinator; campus detail with users, teams and revenue",
            "**Users** — directory, bulk import, passwords for staff, active toggle, coordinator tags, and **per-page permissions** for admins",
            "**New user requests** — students who signed in without a roster match; approve (links a campus and whitelists them) or reject",
          ],
        },
        { type: "h3", text: "Super admins and permissions" },
        {
          type: "p",
          text: "A super admin is an admin with the super flag. From a user's *Permissions* page a super admin can hide pages or restrict view / edit / delete / approve / reject / export per page. No stored permission means full access, so existing admins are unaffected. Only super admins can change seasons, email kill switches and WhatsApp settings.",
        },
      ],
    },
    {
      id: "communications",
      title: "Communications",
      icon: "megaphone",
      blocks: [
        {
          type: "list",
          items: [
            "**Announcements** — all / campus / team targets, pinning, email fan-out",
            "**Popups** — admin-authored pop-ups students must acknowledge, one at a time after the T&C gate",
            "**Submission requests** — leaders asking to submit while the projects lock is on",
            "**Feedback** — in-app feedback from students",
            "**Audit Log** — every staff action, with search and date filter; *Pages* tab shows page-view analytics",
          ],
        },
      ],
    },
    {
      id: "insights-reports",
      title: "Campus Insights and Reports",
      icon: "chart",
      blocks: [
        {
          type: "list",
          items: [
            "**Campus Insights** — per-campus aggregates; click a campus for team-level metrics (shareable URL)",
            "**Journal reports** — campus-wise tables and saved report links you can share with coordinators",
            "**Chatbot history** — what students asked the assistant",
            "**Reels scripts** — AI-generated Instagram reel scripts from journal moments",
          ],
        },
      ],
    },
    {
      id: "config",
      title: "Config (/admin/config)",
      icon: "settings",
      blocks: [
        {
          type: "table",
          columns: ["Section", "What lives there"],
          rows: [
            ["Key dates & thresholds", "Start / end / Demo Day dates, eligibility threshold, team size, leaderboard frozen, Demo Day applications open"],
            ["Programme weeks", "Auto-generated weeks with open/closed toggles and manual locks"],
            ["Notifications & reminders", "Student in-app / email, coordinator alerts, past-week journal edits, **per-category email kill switches** (super admin)"],
            ["GRIT Miles", "Level ladder (revenue → miles → reward), menu and dashboard rollout toggles, Demo Day menu, journal edit deadline, escalation toggle"],
            ["Finale & People's Choice", "Enable, revenue bars, lock messages, content"],
            ["Student content", "Resources visibility, popups, **projects submissions lock**, **pipeline gates (advisory / enforced)**, leaderboard display"],
            ["Seasons", "Activate a season, staff default season, Season 1 archive overrides (journal / revenue / project writes)"],
            ["Team submissions", "Per-team exemptions from the submissions lock"],
            ["Rejection reasons", "Catalogue used by the Review Queue"],
            ["WhatsApp", "Templates and broadcasts via Karix (super admin)"],
            ["BRD → Drive", "One-click migration of BRDs to Google Drive"],
            ["BRAVE app", "APK download link and QR for /get-app"],
          ],
        },
      ],
    },
    {
      id: "gates",
      title: "Pipeline gates — advisory vs enforced",
      icon: "route",
      blocks: [
        {
          type: "p",
          text: "Gate A (3 dated interactions over 7+ days before converting), Gate B (project only from a converted lead) and Gate C (the BRD checklist) are always evaluated and shown to students and reviewers. The **Pipeline gates** card under Config → Student content decides whether they also block:",
        },
        {
          type: "table",
          columns: ["Mode", "Behaviour"],
          rows: [
            ["Advisory (default)", "Students can convert, open a project and submit at any time. Skipped checks are recorded in the composed BRD and visible on the Leads page and in the queue."],
            ["Enforced", "The original blocking behaviour: the buttons refuse until the rule is met."],
          ],
        },
        {
          type: "p",
          text: "The setting is per season and audit-logged. The only rule that always holds: a BRD cannot be submitted with ₹0 received.",
        },
      ],
    },
    {
      id: "seasons",
      title: "Seasons",
      icon: "calendar",
      blocks: [
        {
          type: "list",
          items: [
            "Exactly one season is **active** — students write into it. Season 1.0 is the read-only archive.",
            "The **staff default** season is independent: move admin/coordinator reporting between seasons without changing what students see. Your own selection (badge under the logo) overrides the default.",
            "Archive overrides let a super admin re-open journal, revenue or project writes for Season 1 one capability at a time.",
            "URLs carry the season (`/admin/season/2.0/…`), so links are shareable.",
          ],
        },
      ],
    },
    {
      id: "trust",
      title: "Trust standing and price recognition",
      icon: "shield",
      blocks: [
        {
          type: "p",
          text: "Each team's trust score is the sum of an append-only ledger: +10 revenue verified, +5 strong trail, +5 four-week journal streak, +5 phase delivered on time, +3 GPS-captured lead; −25 overstated claim, −10 proof not supplied. Tiers: Watch < 0 · Bronze 0+ · Silver 40+ · Gold 90+. Coordinators and admins can add a manual adjustment with a reason via the API. **Pricing categories** (per season) cap how much of a claim is recognised for a kind of work; the claim itself is never rewritten.",
        },
      ],
    },
    {
      id: "background",
      title: "Background jobs",
      icon: "clock",
      blocks: [
        {
          type: "table",
          columns: ["Job", "What it does"],
          rows: [
            ["Reminders", "Opens programme weeks; day-5 / day-7 journal silence reminders"],
            ["Journal escalation / weekly report", "Escalates high-priority blockers up the chain; weekly campus reports"],
            ["Lead nudges", "Day-10 student nudge, day-21 coordinator escalation, day-30 dormant"],
            ["Trust awards", "Journal streaks, strong trails, GPS leads, on-time phases"],
            ["Overdue notifications", "Alerts subscribers about overdue reviews"],
            ["Backup", "Mirrors the database to Supabase"],
          ],
        },
        {
          type: "p",
          text: "Jobs are locked across instances so a retry can never run twice at once.",
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
            { title: "/admin", text: "Pending / overdue reviews, coverage" },
            { title: "/admin/queue", text: "Verify or reject with reasons; check trail, proofs and duplicate-client flags" },
            { title: "/admin/team-requests", text: "Approve membership requests" },
            { title: "/admin/leads", text: "Filter *Needs follow-up* and *Ready to submit*; nudge campuses" },
            { title: "/admin/heatmap and /admin/journals", text: "Silent teams and high-priority blockers" },
            { title: "/admin/new-users-requests", text: "Approve or reject access requests" },
            { title: "/admin/announcements", text: "Deadlines and updates" },
            { title: "Weekly", text: "Audit log, Campus Insights, journal reports" },
          ],
        },
      ],
    },
  ],
};
