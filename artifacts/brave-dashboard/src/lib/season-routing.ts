import type { Season } from "./seasons-api";

export type CanonicalSeasonRole = "admin" | "coordinator" | "student";

export type CanonicalSeasonPath = {
  role: CanonicalSeasonRole;
  slug: string;
  /** Includes its leading slash when the page has a suffix. */
  suffix: string;
};

const CANONICAL = /^\/(admin|coordinator|student)\/season\/([^/?#]+)(\/[^?#]*)?([?#].*)?$/;
const PUBLIC_PATHS = new Set([
  "/login",
  "/admin/login",
  "/not-on-roster",
  "/guidebook",
  "/dev/login",
]);

export function parseCanonicalSeasonPath(
  path: string,
): CanonicalSeasonPath | null {
  const match = path.match(CANONICAL);
  if (!match) return null;
  let slug: string;
  try {
    slug = decodeURIComponent(match[2]);
  } catch {
    return null;
  }
  return {
    role: match[1] as CanonicalSeasonRole,
    slug,
    suffix: match[3] || "",
  };
}

/** Converts a canonical location into the existing route used by the page tree. */
export function canonicalToLegacyPath(path: string): string {
  const canonical = parseCanonicalSeasonPath(path);
  if (!canonical) return path;
  const suffix = canonical.suffix || "";
  const [, tail] = splitPath(path);
  if (
    suffix === "/profile" ||
    suffix.startsWith("/reports/view/") ||
    (canonical.role === "coordinator" && /^\/teams\/[^/]+$/.test(suffix))
  ) {
    return `${suffix}${tail}`;
  }
  if (canonical.role === "student") return `${suffix || "/"}${tail}`;
  return `/${canonical.role}${suffix}${tail}`;
}

export function isPublicOrAuthPath(path: string): boolean {
  const pathname = path.split(/[?#]/, 1)[0];
  return PUBLIC_PATHS.has(pathname);
}

function splitPath(path: string): [string, string] {
  const marker = path.search(/[?#]/);
  return marker < 0 ? [path, ""] : [path.slice(0, marker), path.slice(marker)];
}

/**
 * Gives legacy locations a stable role-prefixed season URL. Team, profile and
 * report links deliberately use the viewer's role so their permissions remain
 * unchanged while their season remains shareable.
 */
export function legacyToCanonicalPath(
  path: string,
  viewerRole: CanonicalSeasonRole,
  slug: string,
): string {
  if (parseCanonicalSeasonPath(path) || isPublicOrAuthPath(path)) return path;
  const [pathname, tail] = splitPath(path);
  let role = viewerRole;
  let suffix = pathname;
  if (pathname === "/admin" || pathname.startsWith("/admin/")) {
    role = "admin";
    suffix = pathname.slice("/admin".length);
  } else if (
    pathname === "/coordinator" ||
    pathname.startsWith("/coordinator/")
  ) {
    role = "coordinator";
    suffix = pathname.slice("/coordinator".length);
  }
  if (role === "student" && suffix === "/") suffix = "";
  return `/${role}/season/${encodeURIComponent(slug)}${suffix}${tail}`;
}

/** Keeps a canonical route's page suffix intact when the season changes. */
export function replaceCanonicalSeasonSlug(path: string, slug: string): string {
  const canonical = parseCanonicalSeasonPath(path);
  if (!canonical) return path;
  const [, tail] = splitPath(path);
  return `/${canonical.role}/season/${encodeURIComponent(slug)}${canonical.suffix}${tail}`;
}

export function findSeasonBySlug(
  seasons: readonly Season[],
  slug: string,
): Season | undefined {
  return seasons.find((season) => season.slug === slug);
}