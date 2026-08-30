import { sql } from "drizzle-orm";
import { db } from "@workspace/db";
import { logger } from "../logger";
import { getActiveSeasonId } from "../season";

/**
 * Central per-category email kill switches, controlled by super admins from
 * Config → Notifications & Reminders.
 *
 * - Stored in programme_config.email_controls (jsonb map: key -> boolean).
 * - A missing key (or a null column) means ENABLED — the default is ON, so
 *   nothing changes until a super admin explicitly turns a category off.
 * - Enforced inside sendEmail() (brevo.ts): call sites tag each email with a
 *   `category`, and sendEmail silently skips (returns false) when that
 *   category is toggled off. Emails without a category (e.g. the admin test
 *   email) always send.
 * - Values are cached for 30s so large fan-outs don't hammer the DB.
 */

export const EMAIL_CATEGORIES = [
  "overdueReminders",
  "journalReminders",
  "journalEscalations",
  "revenueVerified",
  "revenueRejected",
  "announcementEmails",
  "submissionAccess",
  "accessRequestDecision",
  "teamNameDuplicate",
  "finaleReview",
  "heatmapNudges",
  "teamMembership",
  "pcaVotes",
] as const;

export type EmailCategory = (typeof EMAIL_CATEGORIES)[number];

let cache: { at: number; controls: Record<string, boolean> } | null = null;
const CACHE_TTL_MS = 30_000;

/** Resolved map — every known category present, defaulting to true. */
export async function getEmailControls(): Promise<
  Record<EmailCategory, boolean>
> {
  let stored: Record<string, boolean> = {};
  const now = Date.now();
  if (cache && now - cache.at < CACHE_TTL_MS) {
    stored = cache.controls;
  } else {
    try {
      // Enforced inside sendEmail(), which has no request to resolve a season
      // from, so the switches always come from the ACTIVE season. The admin
      // page that edits them writes to the same row for exactly this reason.
      const activeSeasonId = await getActiveSeasonId();
      const result = await db.execute(
        sql`SELECT email_controls FROM programme_config WHERE season_id = ${activeSeasonId} LIMIT 1`,
      );
      const raw = (result.rows[0]?.email_controls ?? {}) as unknown;
      stored =
        raw && typeof raw === "object" && !Array.isArray(raw)
          ? (raw as Record<string, boolean>)
          : {};
      cache = { at: now, controls: stored };
    } catch (err) {
      // Fail OPEN — if the column/table can't be read, emails keep working.
      logger.warn({ err }, "email-controls: read failed, defaulting to ON");
      stored = cache?.controls ?? {};
    }
  }
  const out = {} as Record<EmailCategory, boolean>;
  for (const key of EMAIL_CATEGORIES) {
    out[key] = stored[key] !== false;
  }
  return out;
}

export async function isEmailCategoryEnabled(
  category: EmailCategory,
): Promise<boolean> {
  const controls = await getEmailControls();
  return controls[category] !== false;
}

/** Call after an admin updates the toggles so changes apply immediately. */
export function invalidateEmailControlsCache(): void {
  cache = null;
}
