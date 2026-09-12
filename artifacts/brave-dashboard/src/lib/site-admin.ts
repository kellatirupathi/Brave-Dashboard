// Site Admin — the section map behind the Season 2.0 admin index.
//
// From Season 2.0 the admin sidebar keeps only the pages people open every
// day. Everything else is reached from the Site Admin page, grouped into the
// sections below, one row per page — laid out like a classic site
// administration index, with the same three levels of address:
//
//   /admin/site-admin                      every section
//   /admin/site-admin/<section>            one section
//   /admin/site-admin/<section>/<page>     that page, under a breadcrumb
//
// Each page is the same component as its original route, and the original
// route keeps working, so existing links, notifications and bookmarks are
// unaffected.
//
// `pageKey` is the page's entry in the admin permission registry
// (ADMIN_PAGES) — its original route. Permission checks resolve a Site Admin
// address back to that key (see siteAdminPageKey), so a page hidden from an
// admin stays hidden under its new address too.
//
// Page slugs must be unique across all sections: they are looked up on their
// own, whatever section the URL names. A new page here needs a component in
// SITE_ADMIN_PAGE_COMPONENTS in App.tsx — the Record type enforces it.

export const SITE_ADMIN_BASE = "/admin/site-admin";

const SECTIONS = [
  {
    slug: "programme",
    title: "Programme",
    items: [
      { slug: "leads", name: "Leads", pageKey: "/admin/leads" },
      { slug: "projects", name: "Projects", pageKey: "/admin/projects" },
      { slug: "roster", name: "Roster", pageKey: "/admin/roster" },
      { slug: "campuses", name: "Campuses", pageKey: "/admin/campuses" },
    ],
  },
  {
    slug: "performance",
    title: "Performance",
    items: [
      { slug: "heatmap", name: "Heatmap", pageKey: "/admin/heatmap" },
      { slug: "journals", name: "Journals", pageKey: "/admin/journals" },
    ],
  },
  {
    slug: "submissions",
    title: "Submissions",
    items: [
      {
        slug: "finale-submissions",
        name: "Finale Submissions",
        pageKey: "/admin/finale-submissions",
      },
      {
        slug: "demo-day-submissions",
        name: "Demo Day Submissions",
        pageKey: "/admin/demo-day-submissions",
      },
      {
        slug: "peoples-choice-votes",
        name: "People's Choice Votes",
        pageKey: "/admin/votes/peoples-choice-votes",
      },
      {
        slug: "submission-requests",
        name: "Submission Requests",
        pageKey: "/admin/submission-requests",
      },
    ],
  },
  {
    slug: "access",
    title: "Users & Access",
    items: [
      {
        slug: "new-user-requests",
        name: "New User Requests",
        pageKey: "/admin/new-users-requests",
      },
    ],
  },
  {
    slug: "communications",
    title: "Communications",
    items: [
      {
        slug: "announcements",
        name: "Announcements",
        pageKey: "/admin/announcements",
      },
      { slug: "popups", name: "Popups", pageKey: "/admin/popups" },
      { slug: "feedback", name: "Feedback", pageKey: "/admin/feedback" },
    ],
  },
  {
    slug: "reports",
    title: "Reports & Logs",
    items: [
      {
        slug: "journal-reports",
        name: "Journal Reports",
        pageKey: "/admin/reports",
      },
      {
        slug: "chatbot-history",
        name: "Chatbot History",
        pageKey: "/admin/chatbot-history",
      },
      {
        slug: "reels-scripts",
        name: "Reels Scripts",
        pageKey: "/admin/reels-scripts",
      },
      { slug: "audit-log", name: "Audit Log", pageKey: "/admin/audit-log" },
    ],
  },
] as const;

export type SiteAdminSectionSlug = (typeof SECTIONS)[number]["slug"];
export type SiteAdminPageSlug =
  (typeof SECTIONS)[number]["items"][number]["slug"];

export type SiteAdminItem = {
  /** URL segment for the page, under its section. */
  readonly slug: SiteAdminPageSlug;
  readonly name: string;
  /** Permission registry key — the page's original route. */
  readonly pageKey: string;
};

export type SiteAdminSection = {
  /** URL segment for the section. */
  readonly slug: SiteAdminSectionSlug;
  readonly title: string;
  readonly items: readonly SiteAdminItem[];
};

// Widened for callers, so they work with plain arrays rather than a union of
// literal tuples.
export const SITE_ADMIN_SECTIONS: readonly SiteAdminSection[] = SECTIONS;

export function siteAdminSectionHref(section: SiteAdminSectionSlug): string {
  return `${SITE_ADMIN_BASE}/${section}`;
}

export function siteAdminPageHref(
  section: SiteAdminSectionSlug,
  page: SiteAdminPageSlug,
): string {
  return `${SITE_ADMIN_BASE}/${section}/${page}`;
}

export function findSiteAdminSection(slug: string): SiteAdminSection | null {
  return SITE_ADMIN_SECTIONS.find((section) => section.slug === slug) ?? null;
}

export function findSiteAdminPage(
  pageSlug: string,
): { section: SiteAdminSection; item: SiteAdminItem } | null {
  for (const section of SITE_ADMIN_SECTIONS) {
    const item = section.items.find((i) => i.slug === pageSlug);
    if (item) return { section, item };
  }
  return null;
}

/**
 * The permission key behind a Site Admin page address, or null when `path` is
 * not one. Takes a legacy path — canonical season URLs must be converted
 * first.
 *
 * Looks the page up by its own slug and ignores the section segment, so naming
 * the wrong section in the URL cannot step around a page's permission. A
 * section address on its own (/admin/site-admin/<section>) is the index
 * filtered to that section, which is not a permissioned page, so it returns
 * null.
 */
export function siteAdminPageKey(path: string): string | null {
  const pathname = path.split(/[?#]/, 1)[0];
  if (!pathname.startsWith(SITE_ADMIN_BASE + "/")) return null;
  const [, pageSlug] = pathname.slice(SITE_ADMIN_BASE.length + 1).split("/");
  if (!pageSlug) return null;
  return findSiteAdminPage(pageSlug)?.item.pageKey ?? null;
}
