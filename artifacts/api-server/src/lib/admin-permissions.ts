// Pure helper module for the Super Admin / per-page admin permission system.
// No express, no db imports — safe to use from anywhere (routes, bootstrap,
// tests). Mirrored on the frontend in `lib/admin-access.ts` — keep ADMIN_PAGES
// in sync between the two.
//
// DEFAULT-ALLOW is the governing principle: an admin whose `adminPermissions`
// is null (every existing admin) has FULL access to every page. Super admins
// are never restricted by the map.

export type PermissionAction = "view" | "edit" | "delete";

export type PagePermission = {
  view: boolean;
  edit: boolean;
  delete: boolean;
  hidden: boolean;
};

export type AdminPermissions = Record<string, PagePermission>;

export type AdminPage = {
  href: string;
  label: string;
};

// The canonical registry of admin pages a super admin can control. The key is
// the route href. Keep this list in sync with the frontend mirror.
export const ADMIN_PAGES: readonly AdminPage[] = [
  { href: "/admin", label: "Dashboard" },
  { href: "/admin/queue", label: "Review Queue" },
  { href: "/admin/team-requests", label: "Team Requests" },
  { href: "/admin/teams", label: "Teams" },
  { href: "/admin/projects", label: "Projects" },
  { href: "/admin/roster", label: "Roster" },
  { href: "/admin/leaderboard", label: "Leaderboard" },
  { href: "/admin/heatmap", label: "Heatmap" },
  { href: "/admin/journals", label: "Journals" },
  { href: "/admin/demo-day", label: "Demo Day" },
  { href: "/admin/demo-day-submissions", label: "Demo Day Submissions" },
  { href: "/admin/finale-submissions", label: "Finale Submissions" },
  { href: "/admin/campuses", label: "Campuses" },
  { href: "/admin/users", label: "Users" },
  { href: "/admin/new-users-requests", label: "New User Requests" },
  { href: "/admin/announcements", label: "Announcements" },
  { href: "/admin/popups", label: "Popups" },
  { href: "/admin/submission-requests", label: "Submission Requests" },
  { href: "/admin/notifications", label: "Notifications" },
  { href: "/admin/feedback", label: "Feedback" },
  { href: "/admin/audit-log", label: "Audit Log" },
  { href: "/admin/campus-insights", label: "Campus Insights" },
  { href: "/admin/chatbot-history", label: "Chatbot History" },
  { href: "/admin/config", label: "Config" },
  { href: "/admin/resources", label: "Resources" },
] as const;

export const FULL_PAGE_PERMISSION: PagePermission = {
  view: true,
  edit: true,
  delete: true,
  hidden: false,
};

// Minimal shape of a user this module needs. Accepts the db row as-is.
export type PermissionUser = {
  role?: string | null;
  isSuperAdmin?: boolean | null;
  adminPermissions?: unknown;
};

export function isSuperAdmin(user: PermissionUser | null | undefined): boolean {
  return !!user && user.role === "admin" && user.isSuperAdmin === true;
}

function coercePagePermission(raw: unknown): PagePermission {
  if (!raw || typeof raw !== "object") return { ...FULL_PAGE_PERMISSION };
  const r = raw as Record<string, unknown>;
  return {
    // Missing booleans default to allow (true) for view/edit/delete and
    // not-hidden (false) — i.e. default-allow at the field level too.
    view: r.view !== false,
    edit: r.edit !== false,
    delete: r.delete !== false,
    hidden: r.hidden === true,
  };
}

// Returns a fully-populated permission map (one entry per ADMIN_PAGES row).
// `raw` may be null/undefined (→ everything full) or a partial map.
export function normalizeAdminPermissions(raw: unknown): AdminPermissions {
  const out: AdminPermissions = {};
  const map =
    raw && typeof raw === "object" ? (raw as Record<string, unknown>) : null;
  for (const page of ADMIN_PAGES) {
    out[page.href] = map
      ? coercePagePermission(map[page.href])
      : { ...FULL_PAGE_PERMISSION };
  }
  return out;
}

// Strips anything that isn't a known page key and coerces each value into a
// clean PagePermission. Used before persisting a super admin's edits.
export function sanitizeForStorage(raw: unknown): AdminPermissions {
  const out: AdminPermissions = {};
  const map =
    raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  for (const page of ADMIN_PAGES) {
    if (page.href in map) {
      out[page.href] = coercePagePermission(map[page.href]);
    } else {
      out[page.href] = { ...FULL_PAGE_PERMISSION };
    }
  }
  return out;
}

// DEFAULT-ALLOW access check. Super admins and admins with a null permission
// map get everything. Unknown page keys are allowed (not in the registry →
// not restricted). `hidden` overrides everything.
export function canAccessPage(
  user: PermissionUser | null | undefined,
  pageKey: string,
  action: PermissionAction,
): boolean {
  if (isSuperAdmin(user)) return true;
  const raw = user?.adminPermissions;
  if (raw == null) return true; // default-allow
  if (typeof raw !== "object") return true;
  const perm = (raw as Record<string, unknown>)[pageKey];
  if (perm == null) return true; // page not in the stored map → allowed
  const p = coercePagePermission(perm);
  if (p.hidden) return false;
  if (action === "view") return p.view;
  if (action === "edit") return p.view && p.edit;
  return p.view && p.delete;
}
