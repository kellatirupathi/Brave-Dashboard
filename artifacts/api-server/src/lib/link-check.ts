/**
 * Product-link reachability check (additive, isolated).
 *
 * A dead URL, or a Drive video left on "Restricted", is the commonest way a
 * good team loses marks for no reason — the reviewer simply cannot open the
 * thing. So links are checked when the project is saved.
 *
 * POSTURE: fail CLOSED only on a definite rejection (4xx/5xx, or a redirect to
 * a Google sign-in page). A timeout or DNS blip returns "unknown" and does NOT
 * block the save — student connectivity and our egress are not the student's
 * fault, and blocking on them would be worse than a reviewer occasionally
 * hitting a slow link.
 */
import { logger } from "./logger";

export type LinkVerdict = {
  url: string;
  status: "ok" | "broken" | "restricted" | "unknown";
  httpStatus?: number;
  /** Shown inline under the field. Names the fix, not the failing. */
  message?: string;
};

const TIMEOUT_MS = 6000;

/** Hosts where a 200 can still mean "you cannot see this". */
function isGoogleSignIn(finalUrl: string): boolean {
  try {
    const h = new URL(finalUrl).hostname;
    return h === "accounts.google.com" || h.endsWith(".accounts.google.com");
  } catch {
    return false;
  }
}

export async function checkLink(raw: string): Promise<LinkVerdict> {
  const url = (raw ?? "").trim();
  if (!url) return { url, status: "unknown" };

  // Reject anything that is not http(s) outright — no network call needed, and
  // it keeps `javascript:` / `data:` URLs out of a document reviewers click.
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return {
      url,
      status: "broken",
      message: "That does not look like a valid URL.",
    };
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return {
      url,
      status: "broken",
      message: "Links must start with http:// or https://",
    };
  }

  try {
    // GET rather than HEAD: a surprising number of hosts (Drive included)
    // answer HEAD with 405 while serving GET perfectly well.
    const res = await fetch(url, {
      method: "GET",
      redirect: "follow",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    if (isGoogleSignIn(res.url)) {
      return {
        url,
        status: "restricted",
        httpStatus: res.status,
        message:
          'This link is not shared publicly. Set it to "Anyone with the link" so a reviewer can open it.',
      };
    }
    if (res.status >= 400) {
      return {
        url,
        status: "broken",
        httpStatus: res.status,
        message: `The link returned ${res.status}. Check it opens in a private window.`,
      };
    }
    return { url, status: "ok", httpStatus: res.status };
  } catch (err) {
    // Timeout / DNS / TLS. Deliberately not "broken" — see the posture note.
    logger.debug({ err, url }, "[link-check] unreachable; treating as unknown");
    return {
      url,
      status: "unknown",
      message: "We could not reach this link just now — we'll retry later.",
    };
  }
}

/** Check several links concurrently. Keys are echoed back for the UI. */
export async function checkLinks(
  links: Record<string, string | null | undefined>,
): Promise<Record<string, LinkVerdict>> {
  const entries = Object.entries(links).filter(
    ([, v]) => !!v && v.trim() !== "",
  ) as Array<[string, string]>;
  const verdicts = await Promise.all(
    entries.map(async ([k, v]) => [k, await checkLink(v)] as const),
  );
  return Object.fromEntries(verdicts);
}

/** Keys whose link is definitively unusable, so the caller can refuse the save. */
export function blockingLinkFailures(
  verdicts: Record<string, LinkVerdict>,
): string[] {
  return Object.entries(verdicts)
    .filter(([, v]) => v.status === "broken" || v.status === "restricted")
    .map(([k]) => k);
}
