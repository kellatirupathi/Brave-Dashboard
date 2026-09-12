// Site Admin — the Season 2.0 admin index (UI only).
//
// The 2.0 admin sidebar is deliberately short. Every page that left it lives
// here: one section per area, one row per page, with what this admin may do
// on the right — a classic site-administration index. Alongside it, Recent
// actions lists the pages this admin opened from here most recently, so the
// pages they actually use are one click away.
//
// Two addresses render this component: /admin/site-admin shows every
// section, and /admin/site-admin/<section> shows just that one. The pages
// themselves open at /admin/site-admin/<section>/<page> (see App.tsx), which
// is also where a visit is recorded.
//
// Nothing here adds or changes an API.
import { useEffect, useState } from "react";
import { Link, Redirect, useRoute } from "wouter";
import { useAuth } from "@workspace/replit-auth-web";
import { Eye, History, Pencil } from "lucide-react";
import { SiteAdminBreadcrumb } from "@/components/site-admin-breadcrumb";
import { canAccess, isHidden, useMyAdminAccess } from "@/lib/admin-access";
import {
  SITE_ADMIN_BASE,
  SITE_ADMIN_SECTIONS,
  findSiteAdminSection,
  siteAdminPageHref,
  siteAdminSectionHref,
} from "@/lib/site-admin";
import {
  RECENT_LIMIT,
  clearSiteAdminVisits,
  readSiteAdminVisits,
  siteAdminVisitsKey,
  type RecentSiteAdminPage,
} from "@/lib/site-admin-recent";
import { formatDateTime } from "@/lib/format";

/** "5 min ago" for recent visits; the full date once it is a week old. */
function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(ms) || ms < 0) return formatDateTime(iso);
  const min = Math.floor(ms / 60_000);
  if (min < 1) return "Just now";
  if (min < 60) return `${min} min ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} hr ago`;
  const days = Math.floor(hr / 24);
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days} days ago`;
  return formatDateTime(iso);
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

  // An address naming a section that does not exist goes back to the index.
  if (sectionSlug && !focused) return <Redirect to={SITE_ADMIN_BASE} />;

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6">
      <SiteAdminBreadcrumb section={focused} />

      <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_340px]">
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

        <RecentPages />
      </div>
    </div>
  );
}

/**
 * The pages this admin opened from Site Admin most recently, newest first,
 * at most RECENT_LIMIT of them. Fixed height: past that the list scrolls
 * inside the panel instead of stretching the page.
 */
function RecentPages() {
  const { user } = useAuth();
  const userId = user?.id ?? "";
  const { data: access } = useMyAdminAccess(true);
  const [visits, setVisits] = useState<RecentSiteAdminPage[]>(() =>
    readSiteAdminVisits(userId),
  );

  // Re-read once the signed-in user is known, and whenever another tab opens
  // a Site Admin page, so the list is never stale for long.
  useEffect(() => {
    setVisits(readSiteAdminVisits(userId));
    if (!userId) return;
    const key = siteAdminVisitsKey(userId);
    const onStorage = (e: StorageEvent) => {
      if (e.key === key) setVisits(readSiteAdminVisits(userId));
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [userId]);

  // A page hidden from this admin since they opened it drops out of the list.
  const shown = visits
    .filter((v) => !isHidden(access, v.item.pageKey))
    .slice(0, RECENT_LIMIT);

  return (
    <aside
      className="flex h-[520px] flex-col overflow-hidden rounded-md border border-border bg-muted/40 lg:sticky lg:top-6"
      data-testid="site-admin-recent-actions"
    >
      <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-4">
        <h2 className="text-lg font-light">Recent actions</h2>
        {shown.length > 0 && (
          <button
            type="button"
            onClick={() => {
              clearSiteAdminVisits(userId);
              setVisits([]);
            }}
            className="text-xs text-muted-foreground transition-colors hover:text-foreground"
            data-testid="button-clear-recent"
          >
            Clear
          </button>
        )}
      </div>

      <div className="flex min-h-0 flex-1 flex-col px-5 py-4">
        <h3 className="mb-3 text-sm font-semibold text-foreground/80">
          Recently opened pages
        </h3>

        {shown.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Pages you open from Site Admin will appear here, newest first.
          </p>
        ) : (
          <ul className="-mr-2 min-h-0 flex-1 space-y-1 overflow-y-auto pr-2">
            {shown.map((v) => (
              <li key={v.item.slug}>
                <Link
                  href={siteAdminPageHref(v.section.slug, v.item.slug)}
                  className="group flex gap-3 rounded-md px-2 py-2 transition-colors hover:bg-background/70"
                  data-testid={`recent-page-${v.item.slug}`}
                >
                  <History
                    className="mt-0.5 h-4 w-4 shrink-0 text-primary"
                    aria-hidden="true"
                  />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-primary group-hover:underline">
                      {v.item.name}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {v.section.title} · {timeAgo(v.at)}
                    </p>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </aside>
  );
}
