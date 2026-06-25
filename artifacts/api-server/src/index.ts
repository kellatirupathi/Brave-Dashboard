import app from "./app";
import { logger } from "./lib/logger";
import { db, usersTable } from "@workspace/db";
import { and, inArray, isNull, sql } from "drizzle-orm";
import { bootstrapCanonicalCampuses } from "./bootstrap-campuses";
import { bootstrapAdmins } from "./bootstrap-admins";
import { bootstrapSuperAdmins } from "./bootstrap-superadmins";
import { bootstrapCoordinatorTags } from "./bootstrap-coordinator-tags";
import { catchUpPendingBrdAnalyses } from "./lib/ai/analyse-brd";
import { catchUpPendingJournalAnalyses } from "./lib/ai/journal-scheduler";
import { sweepAutoApprovePendingRequests } from "./lib/membership-requests";

async function reportUsersWithoutCampus(): Promise<void> {
  try {
    const rows = await db
      .select({
        id: usersTable.id,
        email: usersTable.email,
        firstName: usersTable.firstName,
        lastName: usersTable.lastName,
        role: usersTable.role,
      })
      .from(usersTable)
      .where(
        and(
          inArray(usersTable.role, ["student", "coordinator"]),
          isNull(usersTable.campusId),
        ),
      );
    if (rows.length === 0) {
      logger.info("No students or coordinators are missing a campus.");
      return;
    }
    logger.warn(
      { count: rows.length, users: rows },
      `Found ${rows.length} student/coordinator account(s) with no campus assigned. An admin should fix these.`,
    );
  } catch (err) {
    logger.error({ err }, "Failed to scan for users without a campus");
  }
}

// One-shot repair: Forms-SSO accounts are created with a synthetic
// `sso_<formsUserId>@forms.local` email. When their whitelisted roster row
// carries a real address (e.g. captured from an approved access request),
// copy it onto the users row so the users table matches the roster instead of
// showing the placeholder. Matches strictly by forms_user_id and only ever
// replaces a synthetic email with a non-synthetic one. Idempotent.
async function backfillSyntheticUserEmails(): Promise<void> {
  try {
    const result = await db.execute(sql`
      UPDATE users u
      SET email = r.email,
          updated_at = now()
      FROM roster r
      WHERE r.student_id = u.forms_user_id
        AND r.is_whitelisted = TRUE
        AND r.email IS NOT NULL
        AND r.email NOT LIKE '%@forms.local'
        AND u.email LIKE '%@forms.local'
    `);
    const rowCount = (result as { rowCount?: number }).rowCount ?? 0;
    if (rowCount > 0) {
      logger.info({ rowCount }, "Backfilled synthetic user emails from roster");
    }
  } catch (err) {
    logger.error(
      { err },
      "Failed to backfill synthetic user emails from roster",
    );
  }
}

// Reel-script DB-level dedup. The reel library could accumulate duplicate
// scripts because the in-memory guard only scanned the newest 500 rows. This
// removes existing duplicates (keeping the lowest id per dedupe_key) and then
// creates the unique index that prevents new ones. Runs at startup because the
// production deploy does not run `drizzle-kit push`, so this is what applies the
// constraint there. Idempotent and safe to run on every boot.
async function ensureReelScriptUniqueness(): Promise<void> {
  try {
    const deleted = await db.execute(sql`
      DELETE FROM reel_scripts a
      USING reel_scripts b
      WHERE a.dedupe_key IS NOT NULL
        AND a.dedupe_key = b.dedupe_key
        AND a.id > b.id
    `);
    const removed = (deleted as { rowCount?: number }).rowCount ?? 0;
    if (removed > 0) {
      logger.info({ removed }, "Removed duplicate reel_scripts rows");
    }
    await db.execute(sql`
      CREATE UNIQUE INDEX IF NOT EXISTS reel_scripts_dedupe_key_unique
        ON reel_scripts (dedupe_key)
    `);
  } catch (err) {
    logger.error({ err }, "Failed to ensure reel_scripts uniqueness");
  }
}

// Adds the Terms & Conditions consent columns to the users table. Runs at
// startup because the production deploy does not run `drizzle-kit push`, so this
// is what applies the columns there. Without it, `buildAuthUser` and the admin
// user list would crash in prod with "column does not exist". Idempotent and
// safe to run on every boot.
async function ensureTermsColumns(): Promise<void> {
  try {
    await db.execute(sql`
      ALTER TABLE users
        ADD COLUMN IF NOT EXISTS terms_accepted_at timestamptz,
        ADD COLUMN IF NOT EXISTS terms_version text
    `);
  } catch (err) {
    logger.error({ err }, "Failed to ensure terms columns");
  }
}

async function backfillOrderBookEntries(): Promise<void> {
  try {
    const result = await db.execute(sql`
      UPDATE order_book_entries
      SET status = 'verified',
          verified_amount = COALESCE(verified_amount, amount),
          submitted_at = COALESCE(submitted_at, created_at, now()),
          verified_at = COALESCE(verified_at, now())
      WHERE status <> 'verified'
    `);
    const rowCount = (result as { rowCount?: number }).rowCount ?? 0;
    if (rowCount > 0) {
      logger.info({ rowCount }, "Backfilled order book entries to verified");
    }
  } catch (err) {
    logger.error({ err }, "Failed to backfill order book entries");
  }
}

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

async function runBootstrap(): Promise<void> {
  // Run schema-ensuring steps FIRST so the most critical read paths (auth/user
  // reads terms_accepted_at) never hit a missing column on a fresh deploy.
  try {
    await ensureTermsColumns();
  } catch (err) {
    logger.error({ err }, "ensureTermsColumns failed");
  }
  try {
    await bootstrapCanonicalCampuses();
  } catch (err) {
    logger.error({ err }, "bootstrapCanonicalCampuses failed");
  }
  try {
    await bootstrapAdmins();
  } catch (err) {
    logger.error({ err }, "bootstrapAdmins failed");
  }
  try {
    await bootstrapSuperAdmins();
  } catch (err) {
    logger.error({ err }, "bootstrapSuperAdmins failed");
  }
  try {
    await bootstrapCoordinatorTags();
  } catch (err) {
    logger.error({ err }, "bootstrapCoordinatorTags failed");
  }
  try {
    await ensureReelScriptUniqueness();
  } catch (err) {
    logger.error({ err }, "ensureReelScriptUniqueness failed");
  }
  try {
    await backfillOrderBookEntries();
  } catch (err) {
    logger.error({ err }, "backfillOrderBookEntries failed");
  }
  try {
    await backfillSyntheticUserEmails();
  } catch (err) {
    logger.error({ err }, "backfillSyntheticUserEmails failed");
  }
  try {
    await reportUsersWithoutCampus();
  } catch (err) {
    logger.error({ err }, "reportUsersWithoutCampus failed");
  }
  // One-shot sweep: catch any BRD analyses missed across a redeploy where
  // the in-memory setTimeout was lost. NOT a recurring cron job — runs once.
  try {
    await catchUpPendingBrdAnalyses();
  } catch (err) {
    logger.error({ err }, "catchUpPendingBrdAnalyses failed");
  }
  // One-shot sweep: analyse any weekly journals not yet processed by the AI
  // auditor (submitted while no Gemini key was set, or a setTimeout lost across
  // a redeploy). Throttled inside the helper; runs once at boot.
  try {
    await catchUpPendingJournalAnalyses();
  } catch (err) {
    logger.error({ err }, "catchUpPendingJournalAnalyses failed");
  }
  // One-shot sweep: auto-approve any already-pending membership requests that
  // are no longer gated under the current rule (only verified-revenue
  // leave/remove still need admin approval). Self-limiting — once applied they
  // are no longer pending, so subsequent boots find fewer. Applies real
  // membership changes; failures are left pending for an admin.
  try {
    const r = await sweepAutoApprovePendingRequests();
    if (r.total > 0) {
      logger.info(
        r,
        "[membership-sweep] auto-approved non-gated pending requests on startup",
      );
    }
  } catch (err) {
    logger.error({ err }, "sweepAutoApprovePendingRequests failed");
  }
}

function start(): void {
  app.listen(port, (err) => {
    if (err) {
      logger.error({ err }, "Error listening on port");
      process.exit(1);
    }
    logger.info({ port }, "Server listening");
    void runBootstrap();
  });
}

start();
