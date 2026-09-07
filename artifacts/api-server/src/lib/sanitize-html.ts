/**
 * Minimal HTML sanitiser for the rich text staff write into ticket
 * resolutions.
 *
 * WHY THIS EXISTS. A resolution is authored in a rich-text editor, stored, and
 * then rendered in two places that cannot defend themselves: a student's
 * browser, and a resolution email. Storing whatever the editor produced would
 * put staff-authored markup — and anything pasted into it from elsewhere —
 * straight into both.
 *
 * ALLOW-LIST, NOT DENY-LIST. Only the tags the editor can produce survive;
 * everything else is dropped rather than escaped, because a resolution should
 * read as prose either way. Attributes are stripped entirely except `href` on
 * a link, which is then restricted to http(s) and mailto — so `javascript:`
 * and `data:` cannot ride in on a pasted anchor.
 *
 * Deliberately small and dependency-free. It has one job and a narrow input:
 * the output of one editor whose toolbar we control.
 */

/** Exactly what the toolbar can produce. */
const ALLOWED_TAGS = new Set([
  "p",
  "br",
  "strong",
  "b",
  "em",
  "i",
  "u",
  "s",
  "strike",
  "ul",
  "ol",
  "li",
  "a",
]);

/** Schemes a link may use. Anything else is dropped with the attribute. */
const SAFE_HREF = /^(https?:\/\/|mailto:)/i;

function safeHref(raw: string): string | null {
  const value = raw.trim();
  if (!SAFE_HREF.test(value)) return null;
  // Quotes would break out of the attribute we rebuild it into.
  return value.replace(/["'<>]/g, "");
}

/**
 * Return `html` with every disallowed tag and attribute removed.
 *
 * Comments and anything script-like are dropped whole — including their
 * contents, which a tag-only filter would otherwise leave behind as visible
 * text.
 */
export function sanitizeRichText(html: string): string {
  if (!html) return "";

  let out = html;

  // Whole elements whose CONTENT is also unwanted. Done before tag filtering,
  // which would otherwise strip the tags and leave the script body as prose.
  out = out.replace(
    /<(script|style|iframe|object|embed|noscript)\b[\s\S]*?<\/\1>/gi,
    "",
  );
  out = out.replace(/<!--[\s\S]*?-->/g, "");

  // Every remaining tag: keep it only if allowed, and rebuild it from scratch
  // so no attribute survives that we did not choose to keep.
  out = out.replace(
    /<\/?([a-zA-Z][a-zA-Z0-9]*)\b([^>]*)>/g,
    (_match, rawName: string, attrs: string) => {
      const name = rawName.toLowerCase();
      if (!ALLOWED_TAGS.has(name)) return "";
      const closing = _match.startsWith("</");
      if (closing) return `</${name}>`;

      if (name === "a") {
        const href = /href\s*=\s*["']([^"']*)["']/i.exec(attrs)?.[1] ?? "";
        const safe = safeHref(href);
        // A link with nowhere safe to go becomes plain text rather than
        // vanishing — the words the author wrote still matter.
        return safe
          ? `<a href="${safe}" target="_blank" rel="noopener noreferrer">`
          : "<a>";
      }
      return `<${name}>`;
    },
  );

  return out.trim();
}

/**
 * A plain-text rendering of the same content, for contexts that cannot show
 * HTML — an email's text alternative, a log line, a search index.
 */
export function richTextToPlain(html: string): string {
  return sanitizeRichText(html)
    .replace(/<\/(p|li|ul|ol)>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<li>/gi, "• ")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
