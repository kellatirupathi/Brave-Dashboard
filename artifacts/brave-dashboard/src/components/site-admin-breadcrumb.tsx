// Breadcrumb for the Site Admin pages (UI only).
//
// Site Admin › <Section> › <Page>, as a plain line of text at the top of the
// page. Every level except the current one is a link, so you can always step
// back up without the browser's Back button.
import { Link } from "wouter";
import { ChevronRight, LayoutGrid } from "lucide-react";
import {
  SITE_ADMIN_BASE,
  siteAdminSectionHref,
  type SiteAdminItem,
  type SiteAdminSection,
} from "@/lib/site-admin";

type Crumb = { label: string; href?: string };

export function SiteAdminBreadcrumb({
  section,
  page,
}: {
  section?: SiteAdminSection | null;
  page?: SiteAdminItem | null;
}) {
  const crumbs: Crumb[] = [
    {
      label: "Site Admin",
      href: section || page ? SITE_ADMIN_BASE : undefined,
    },
  ];
  if (section) {
    crumbs.push({
      label: section.title,
      href: page ? siteAdminSectionHref(section.slug) : undefined,
    });
  }
  if (page) crumbs.push({ label: page.name });

  return (
    <nav aria-label="Breadcrumb" data-testid="site-admin-breadcrumb">
      <ol className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-sm">
        {crumbs.map((crumb, i) => (
          <li key={crumb.label} className="inline-flex items-center gap-1.5">
            {i === 0 ? (
              <LayoutGrid
                className="h-3.5 w-3.5 text-primary"
                aria-hidden="true"
              />
            ) : (
              <ChevronRight
                className="h-3.5 w-3.5 text-muted-foreground"
                aria-hidden="true"
              />
            )}
            {crumb.href ? (
              <Link
                href={crumb.href}
                className="font-medium text-primary hover:underline"
              >
                {crumb.label}
              </Link>
            ) : (
              <span
                aria-current="page"
                className="font-semibold text-foreground"
              >
                {crumb.label}
              </span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}
