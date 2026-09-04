/**
 * Convert a persisted App Storage object path into the authenticated API route
 * that serves it. External URLs and already-resolved API URLs pass through.
 */
export function resolveStoredObjectUrl(url: string): string {
  if (
    url.startsWith("/objects/") ||
    url.startsWith("/public-objects/")
  ) {
    return `/api/storage${url}`;
  }
  return url;
}