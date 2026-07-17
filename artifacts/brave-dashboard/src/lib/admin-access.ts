// Frontend mirror of the Super Admin / per-page admin permission system.
// Bypasses Orval codegen on purpose (isolated additive feature). Keep
// ADMIN_PAGES in sync with the server mirror in
// `artifacts/api-server/src/lib/admin-permissions.ts`.
//
// DEFAULT-ALLOW: if a user has no stored permission for a page, they can
// access it. Super admins are never restricted. The server is the source of
// truth — these helpers only drive UI (sidebar hiding + route redirects).
import { useQuery } from "@tanstack/react-query";
import { customFetch } from "@workspace/api-client-react";

// `approve` / `reject` split the two halves of a review decision, which used
// to share the single `edit` bit. `export` gates CSV/Excel downloads. Keep in
// sync with the server mirror.
export type PermissionAction =
  | "view"
  | "edit"
  | "delete"
  | "approve"
  | "reject"
  | "export";

export type PagePermission = {
  view: boolean;
  edit: boolean;
  delete: boolean;
  approve: boolean;
  reject: boolean;
  export: boolean;
  hidden: boolean;
};

export type AdminPermissions = Record<string, PagePermission>;

export type AdminPage = {
  href: string;
  label: string;
};

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
  {
    href: "/admin/votes/peoples-choice-votes",
    label: "People's Choice Votes",
  },
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
  // These three are reachable today (two are in the admin sidebar) but were
  // never registered here, so a super admin had no way to restrict them.
  { href: "/admin/reports", label: "Journal Reports" },
  { href: "/admin/reels-scripts", label: "Reels Scripts" },
  { href: "/admin/campus-leaderboard", label: "Campus Leaderboard" },
  { href: "/admin/config", label: "Config" },
  { href: "/admin/resources", label: "Resources" },
] as const;

// Which pages actually have the NEW actions wired to a real route — mirrors
// the server. Anything absent renders "—" instead of a checkbox that would
// grant nothing. view/edit/delete/hidden are universal and unchanged.
export const PAGE_ACTIONS: Record<
  string,
  ReadonlyArray<"approve" | "reject" | "export">
> = {
  "/admin/queue": ["approve", "reject", "export"],
  "/admin/team-requests": ["approve", "reject"],
  "/admin/new-users-requests": ["approve", "reject", "export"],
  "/admin/teams": ["export"],
  "/admin/projects": ["export"],
  "/admin/finale-submissions": ["approve", "reject", "export"],
  "/admin/popups": ["export"],
  "/admin/votes/peoples-choice-votes": ["export"],
};

/** Does `action` exist at all on `pageKey`? Drives the "—" cells in the UI. */
export function pageHasAction(
  pageKey: string,
  action: "approve" | "reject" | "export",
): boolean {
  return (PAGE_ACTIONS[pageKey] ?? []).includes(action);
}

export const FULL_PAGE_PERMISSION: PagePermission = {
  view: true,
  edit: true,
  delete: true,
  approve: true,
  reject: true,
  export: true,
  hidden: false,
};

export function fullPermissions(): AdminPermissions {
  const out: AdminPermissions = {};
  for (const page of ADMIN_PAGES) {
    out[page.href] = { ...FULL_PAGE_PERMISSION };
  }
  return out;
}

export type MyAdminAccess = {
  isSuperAdmin: boolean;
  permissions: AdminPermissions;
  pages: AdminPage[];
};

// The caller's own resolved access. Enable only for admins. Cached for 60s and
// keyed so the sidebar + ProtectedRoute share a single fetch.
export function useMyAdminAccess(enabled: boolean) {
  return useQuery<MyAdminAccess>({
    queryKey: ["admin-access-me"],
    queryFn: () => customFetch<MyAdminAccess>("/api/admin/access/me"),
    enabled,
    staleTime: 60_000,
    retry: false,
  });
}

export function canAccess(
  access: MyAdminAccess | undefined | null,
  pageKey: string,
  action: PermissionAction,
): boolean {
  if (!access) return true;
  if (access.isSuperAdmin) return true;
  const perm = access.permissions[pageKey];
  if (!perm) return true;
  if (perm.hidden) return false;
  if (!perm.view) return false; // every action implies view
  // `!== false` rather than truthiness: a server that predates approve/reject/
  // export omits those fields, and a missing field means allowed (default-allow).
  switch (action) {
    case "view":
      return true;
    case "edit":
      return perm.edit !== false;
    case "delete":
      return perm.delete !== false;
    // approve/reject also require `edit` — see the server mirror for why
    // (edit is the floor; the new bits subtract from it).
    case "approve":
      return perm.edit !== false && perm.approve !== false;
    case "reject":
      return perm.edit !== false && perm.reject !== false;
    case "export":
      return perm.export !== false;
    default:
      return false;
  }
}

// Convenience hook for admin pages: resolves the caller's edit/delete rights
// for a given page in one line. Default-allow + fail-open (returns true while
// access is loading or unset) so existing/super admins are never blocked and a
// transient error can never hide an action it shouldn't.
//
// Usage:  const { canEdit, canDelete } = useAdminPageAccess("/admin/campuses");
//         {canEdit && <EditButton/>}   {canDelete && <DeleteButton/>}
export function useAdminPageAccess(pageKey: string): {
  canView: boolean;
  canEdit: boolean;
  canDelete: boolean;
  canApprove: boolean;
  canReject: boolean;
  canExport: boolean;
} {
  const { data: access } = useMyAdminAccess(true);
  return {
    canView: canAccess(access, pageKey, "view"),
    canEdit: canAccess(access, pageKey, "edit"),
    canDelete: canAccess(access, pageKey, "delete"),
    canApprove: canAccess(access, pageKey, "approve"),
    canReject: canAccess(access, pageKey, "reject"),
    canExport: canAccess(access, pageKey, "export"),
  };
}

// A page is "hidden" from the sidebar when explicitly hidden OR view is off.
export function isHidden(
  access: MyAdminAccess | undefined | null,
  pageKey: string,
): boolean {
  if (!access || access.isSuperAdmin) return false;
  const perm = access.permissions[pageKey];
  if (!perm) return false;
  return perm.hidden || !perm.view;
}

// Whether a restricted admin should be bounced away from the current route.
// Matches the longest ADMIN_PAGES href that prefixes `location` so detail
// pages (e.g. /admin/teams/123) inherit their parent page's permission.
export function isRouteBlocked(
  access: MyAdminAccess | undefined | null,
  location: string,
): boolean {
  if (!access || access.isSuperAdmin) return false;
  const sorted = [...ADMIN_PAGES].sort((a, b) => b.href.length - a.href.length);
  const match = sorted.find(
    (p) => location === p.href || location.startsWith(p.href + "/"),
  );
  if (!match) return false;
  const perm = access.permissions[match.href];
  if (!perm) return false;
  return perm.hidden || !perm.view;
}

// ---- Super-admin management of OTHER admins ----

export type UserAdminPermissions = {
  userId: string;
  email: string;
  role: string;
  isSuperAdmin: boolean;
  permissions: AdminPermissions;
  pages: AdminPage[];
};

export function fetchUserPermissions(
  userId: string,
): Promise<UserAdminPermissions> {
  return customFetch<UserAdminPermissions>(`/api/admin/permissions/${userId}`);
}

export function saveUserPermissions(
  userId: string,
  body: { isSuperAdmin?: boolean; permissions?: AdminPermissions },
): Promise<UserAdminPermissions> {
  return customFetch<UserAdminPermissions>(`/api/admin/permissions/${userId}`, {
    method: "PUT",
    body: JSON.stringify(body),
  });
}
