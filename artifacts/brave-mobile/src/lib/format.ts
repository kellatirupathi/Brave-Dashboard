/**
 * Display formatting.
 *
 * Currency is Indian, and Indian digit grouping is not the Western one:
 * ₹15,57,800 rather than ₹1,557,800. `Intl` with the `en-IN` locale does this
 * correctly on Android's Hermes engine, which ships full ICU.
 */

export function inr(value: number | null | undefined): string {
  const n = typeof value === 'number' && Number.isFinite(value) ? value : 0;
  try {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0,
    }).format(n);
  } catch {
    // Hermes without ICU would throw; a plain rupee prefix still reads fine.
    return `₹${Math.round(n).toLocaleString()}`;
  }
}

/** Compact form for cards where space is tight: ₹15.6L, ₹2.1Cr. */
export function inrCompact(value: number | null | undefined): string {
  const n = typeof value === 'number' && Number.isFinite(value) ? value : 0;
  if (n >= 10_000_000) return `₹${(n / 10_000_000).toFixed(2)}Cr`;
  if (n >= 100_000) return `₹${(n / 100_000).toFixed(1)}L`;
  if (n >= 1_000) return `₹${(n / 1_000).toFixed(1)}K`;
  return inr(n);
}

/** "24 Nov" — short, unambiguous, no year unless it differs from today's. */
export function shortDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return d.toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    ...(sameYear ? {} : { year: 'numeric' }),
  });
}

export function dateRange(
  start: string | null | undefined,
  end: string | null | undefined,
): string {
  if (!start && !end) return '—';
  return `${shortDate(start)} – ${shortDate(end)}`;
}

/** "2 hours ago" — relative time reads better than a timestamp in a feed. */
export function relative(iso: string | null | undefined): string {
  if (!iso) return '';
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';
  const mins = Math.round((Date.now() - then) / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return shortDate(iso);
}

export function initials(
  first?: string | null,
  last?: string | null,
  fallback = '?',
): string {
  const a = (first ?? '').trim();
  const b = (last ?? '').trim();
  const s = `${a.charAt(0)}${b.charAt(0)}`.toUpperCase();
  return s || fallback;
}

export function fullName(
  first?: string | null,
  last?: string | null,
): string {
  return [first, last].filter(Boolean).join(' ').trim();
}
