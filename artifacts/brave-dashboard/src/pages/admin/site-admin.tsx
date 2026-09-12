// Site Admin — the Season 2.0 admin index (UI only).
//
// The 2.0 admin sidebar is deliberately short. Every page that left it lives
// here: one section per area, one row per page, with what this admin may do
// on the right — a classic site-administration index. Recent activity from
// every admin sits alongside.
//
// Two addresses render this component: /admin/site-admin shows every
// section, and /admin/site-admin/<section> shows just that one. The pages
// themselves open at /admin/site-admin/<section>/<page> (see App.tsx).
//
// Nothing here adds or changes an API. Rows open the same pages as their
// original routes, and the activity panel reads the audit log endpoint the
// Audit Log page already uses.
import { Link, Redirect, useRoute } from "wouter";
import {
  useGetAuditLog,
  getGetAuditLogQueryKey,
  type AuditLogEntry,
} from "@workspace/api-client-react";
import { Eye, History, Pencil, Plus, X } from "lucide-react";
import { Spinner } from "@/components/ui/spinner";
import { SiteAdminBreadcrumb } from "@/components/site-admin-breadcrumb";
import { canAccess, isHidden, useMyAdminAccess } from "@/lib/admin-access";
import {
  SITE_ADMIN_BASE,
  SITE_ADMIN_SECTIONS,
  findSiteAdminSection,
  siteAdminPageHref,
  siteAdminSectionHref,
} from "@/lib/site-admin";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";

const RECENT_LIMIT = 12;
const AUDIT_LOG_PAGE = "/admin/audit-log";

type ActionKind = "add" | "change" | "delete";

const KIND: Record<
  ActionKind,
  { icon: typeof Plus; className: string; label: string }
> = {
  add: {
    icon: Plus,
    className: "text-emerald-600 dark:text-emerald-400",
    label: "Added",
  },
  change: {
    icon: Pencil,
    className: "text-amber-600 dark:text-amber-400",
    label: "Changed",
  },
  delete: {
    icon: X,
    className: "text-red-600 dark:text-red-400",
    label: "Deleted",
  },
};

/**
 * Audit actions are free-form verbs ("verify_revenue_entry",
 * "create_rejection_reason"), so the kind is read from the verb. Anything
 * that is neither a creation nor a removal is a change — approvals and
 * rejections included, since both only move a record's status.
 */
function actionKind(action: string): ActionKind {
  const a = action.toLowerCase();
  if (/(^|_)(create|add|import|invite|upload|provision)/.test(a)) return "add";
  if (/(^|_)(delete|remove|revoke|deactivate)/.test(a)) return "delete";
  return "change";
}

function humanise(value: string | null | undefined): string {
  const text = (value ?? "").replace(/[_-]+/g, " ").trim();
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : "";
}

export default function AdminSiteAdmin() {
  const { data: access } = useMyAdminAccess(true);
  const [, params] = useRoute("/admin/site-admin/:section");
  const sectionSlug = params?.section;
  const focused = sectionSlug ? findSiteAdminSection(sectionSlug) : null;

  // Rows follow the admin's own permissions: a page hidden from them is left
  // out, and a section left with no rows is dropped entirely.
  const sections = (focused ? [focused] : SITE_ADMIN_SECTIONS)
    .map((section) => ({
      ...section,
      items: section.items.filter((item) => !isHidden(access, item.pageKey)),
    }))
    .filter((section) => section.items.length > 0);

  // The activity panel shows the audit log, so it follows that page's
  // permission rather than appearing for someone the log is hidden from.
  const canSeeActivity = canAccess(access, AUDIT_LOG_PAGE, "view");

  // An address naming a section that does not exist goes back to the index.
  if (sectionSlug && !focused) return <Redirect to={SITE_ADMIN_BASE} />;

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6">
      <SiteAdminBreadcrumb section={focused} />

      <div>
        <h1 className="text-3xl font-light tracking-tight">
          {focused ? focused.title : "Site administration"}
        </h1>
        <p className="mt-1 text-muted-foreground">
          {focused
            ? `The ${focused.title} pages you have access to.`
            : "Every admin page that is not in the sidebar, grouped by area."}
        </p>
      </div>

      <div
        className={cn(
          "grid items-start gap-8",
          canSeeActivity && "lg:grid-cols-[minmax(0,1fr)_340px]",
        )}
      >
        <div className="space-y-8">
          {sections.length === 0 ? (
            <div className="rounded-md border border-border bg-card px-5 py-10 text-center text-sm text-muted-foreground">
              {focused
                ? "You do not have access to any page in this section."
                : "You do not have access to any of these pages."}{" "}
              A super admin can grant it from your permissions.
            </div>
          ) : (
            sections.map((section) => (
              <section
                key={section.slug}
                className="overflow-hidden rounded-md border border-border bg-card"
                data-testid={`site-admin-section-${section.slug}`}
              >
                <h2 className="bg-sidebar px-4 py-2.5 text-sm font-semibold uppercase tracking-wider text-sidebar-foreground">
                  {focused ? (
                    section.title
                  ) : (
                    <Link
                      href={siteAdminSectionHref(section.slug)}
                      className="hover:underline"
                    >
                      {section.title}
                    </Link>
                  )}
                </h2>
                <ul>
                  {section.items.map((item) => {
                    const href = siteAdminPageHref(section.slug, item.slug);
                    const canEdit = canAccess(access, item.pageKey, "edit");
                    const canDelete = canAccess(access, item.pageKey, "delete");
                    const summary = canEdit
                      ? canDelete
                        ? "You can view, edit and delete"
                        : "You can view and edit"
                      : "You can view only";
                    return (
                      <li
                        key={item.slug}
                        className="flex items-center justify-between gap-4 border-b border-border px-4 py-2.5 last:border-b-0 even:bg-muted/40"
                      >
                        <Link
                          href={href}
                          className="text-sm font-medium text-primary hover:underline"
                          data-testid={`site-admin-row-${item.slug}`}
                        >
                          {item.name}
                        </Link>
                        <Link
                          href={href}
                          title={summary}
                          aria-label={`${canEdit ? "Change" : "View"} ${item.name}. ${summary}.`}
                          className="inline-flex shrink-0 items-center gap-1.5 text-sm text-primary hover:underline"
                        >
                          {canEdit ? (
                            <Pencil
                              className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400"
                              aria-hidden="true"
                            />
                          ) : (
                            <Eye
                              className="h-3.5 w-3.5 text-sky-600 dark:text-sky-400"
                              aria-hidden="true"
                            />
                          )}
                          {canEdit ? "Change" : "View"}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))
          )}
        </div>

        {canSeeActivity && <RecentActions />}
      </div>
    </div>
  );
}

function RecentActions() {
  const params = { limit: RECENT_LIMIT };
  const { data, isLoading, isError } = useGetAuditLog(params, {
    query: { queryKey: getGetAuditLogQueryKey(params), staleTime: 30_000 },
  });
  const entries: AuditLogEntry[] = data ?? [];

  return (
    <aside
      className="overflow-hidden rounded-md border border-border bg-muted/40 lg:sticky lg:top-6"
      data-testid="site-admin-recent-actions"
    >
      <div className="border-b border-border px-5 py-4">
        <h2 className="text-lg font-light">Recent actions</h2>
      </div>
      <div className="px-5 py-4">
        <h3 className="mb-4 text-sm font-semibold text-foreground/80">
          All admins
        </h3>

        {isLoading ? (
          <div className="flex justify-center py-6">
            <Spinner />
          </div>
        ) : isError ? (
          <p className="text-sm text-muted-foreground">
            Recent actions could not be loaded.
          </p>
        ) : entries.length === 0 ? (
          <p className="text-sm text-muted-foreground">No actions yet.</p>
        ) : (
          <ul className="space-y-4">
            {entries.map((entry) => {
              const kind = KIND[actionKind(entry.action)];
              const Icon = kind.icon;
              const detail = entry.details?.trim();
              const title = detail || humanise(entry.action);
              const caption = detail
                ? `${humanise(entry.action)} · ${humanise(entry.targetType)}`
                : humanise(entry.targetType);
              return (
                <li key={entry.id} className="flex gap-3">
                  <Icon
                    className={cn("mt-0.5 h-4 w-4 shrink-0", kind.className)}
                    aria-label={kind.label}
                  />
                  <div className="min-w-0">
                    <p className="line-clamp-2 break-words text-sm text-primary">
                      {title}
                    </p>
                    {caption && (
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {caption}
                      </p>
                    )}
                    <p className="text-[11px] text-muted-foreground/80">
                      {entry.actorName} · {formatDateTime(entry.createdAt)}
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        <Link
          href={siteAdminPageHref("reports", "audit-log")}
          className="mt-5 inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
        >
          <History className="h-3.5 w-3.5" aria-hidden="true" />
          View all activity
        </Link>
      </div>
    </aside>
  );
}
