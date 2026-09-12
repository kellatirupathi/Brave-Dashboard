// Recently opened Site Admin pages (UI only, per browser).
//
// The Recent actions panel on Site Admin lists the pages this admin opened
// from it, newest first. It is a navigation shortcut rather than a record, so
// it lives in localStorage: keeping it client-side needs no API change, and
// losing it (a cleared browser, another device) costs nothing that matters.
//
// It is keyed by user, so two admins sharing a browser never see each other's
// history. Every storage call is wrapped, because localStorage can throw
// (private windows, blocked site data) and a shortcut list must never break
// the page it sits on.
import {
  findSiteAdminPage,
  type SiteAdminItem,
  type SiteAdminSection,
} from "./site-admin";

/** How many pages the panel keeps and shows. */
export const RECENT_LIMIT = 15;

const PREFIX = "brave.siteAdmin.recent.v1.";

type Visit = { slug: string; at: string };

export type RecentSiteAdminPage = {
  section: SiteAdminSection;
  item: SiteAdminItem;
  /** ISO time the page was last opened. */
  at: string;
};

export function siteAdminVisitsKey(userId: string): string {
  return PREFIX + userId;
}

function readRaw(userId: string): Visit[] {
  try {
    const raw = window.localStorage.getItem(siteAdminVisitsKey(userId));
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (v): v is Visit =>
        !!v &&
        typeof v === "object" &&
        typeof (v as Visit).slug === "string" &&
        typeof (v as Visit).at === "string",
    );
  } catch {
    return [];
  }
}

/**
 * Note that `slug` was just opened. A page opened again moves back to the top
 * rather than appearing twice, so the list is always 15 different pages.
 */
export function recordSiteAdminVisit(userId: string, slug: string): void {
  if (!userId || !slug) return;
  try {
    const next = [
      { slug, at: new Date().toISOString() },
      ...readRaw(userId).filter((v) => v.slug !== slug),
    ].slice(0, RECENT_LIMIT);
    window.localStorage.setItem(siteAdminVisitsKey(userId), JSON.stringify(next));
  } catch {
    // Storage full or blocked: the shortcut list simply does not update.
  }
}

/**
 * The most recent pages, newest first. A stored slug that no longer names a
 * Site Admin page — one removed from the section map since — is skipped.
 */
export function readSiteAdminVisits(userId: string): RecentSiteAdminPage[] {
  if (!userId) return [];
  const out: RecentSiteAdminPage[] = [];
  for (const visit of readRaw(userId)) {
    const found = findSiteAdminPage(visit.slug);
    if (found) out.push({ ...found, at: visit.at });
    if (out.length === RECENT_LIMIT) break;
  }
  return out;
}

export function clearSiteAdminVisits(userId: string): void {
  try {
    window.localStorage.removeItem(siteAdminVisitsKey(userId));
  } catch {
    // Nothing to do: if storage cannot be reached there is nothing to clear.
  }
}
