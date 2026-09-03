// Public documentation URLs — the single source of truth for the slug in
// /docs/<slug>/<season>, shared by the sidebar links and the docs page.
//
// WHY THE STAFF SLUGS ARE NOT THE ROLE NAME
// A student reading /docs/student/2.0 can see the shape of the URL, and the
// obvious next thing to try is swapping in "admin". These slugs make that
// guess miss.
//
// THIS IS OBSCURITY, NOT ACCESS CONTROL. The pages are deliberately public
// (they are shared as plain links and must open without a login), and every
// document's text is compiled into the JavaScript bundle each signed-in user
// already downloads. This only stops casual poking at the address bar. Real
// protection would mean gating the staff pages behind a role check AND
// loading their content separately so it never reaches a student's browser.
import type { DocRole } from "@/pages/docs/content/types";

export const DOC_SLUG_BY_ROLE: Record<DocRole, string> = {
  student: "student",
  coordinator: "coordinator_brave_guide",
  admin: "admin_brave_guide",
};

/** Reverse lookup. An unknown slug resolves to undefined, i.e. not found. */
export const DOC_ROLE_BY_SLUG: Record<string, DocRole | undefined> = {
  student: "student",
  coordinator_brave_guide: "coordinator",
  admin_brave_guide: "admin",
};

/**
 * The documentation URL for a role. Accepts a plain string so callers can pass
 * `user.role` without casting; anything unrecognised falls back to the student
 * guide rather than producing a broken link.
 */
export function docsHref(role: string, version: string): string {
  const slug = DOC_SLUG_BY_ROLE[role as DocRole] ?? DOC_SLUG_BY_ROLE.student;
  return `/docs/${slug}/${encodeURIComponent(version)}`;
}
