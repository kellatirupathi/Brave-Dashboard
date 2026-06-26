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
import { catchUpPendingJournalReelScans } from "./lib/ai/journal-reel-scheduler";
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

// Adds the per-journal reel-scan + image columns to weekly_journals and creates
// the demo_day_submissions table. Runs at startup for the same reason as
// ensureTermsColumns: the production deploy does NOT run `drizzle-kit push`, so
// without this the admin journals page (`GET /admin/journals`) and the Demo Day
// submissions endpoints crash in prod with "column/relation does not exist".
// Fully idempotent (IF NOT EXISTS) and safe to run on every boot.
async function ensureReelAndDemoDayColumns(): Promise<void> {
  // 1) Weekly-journal reel scan + optional images columns.
  try {
    await db.execute(sql`
      ALTER TABLE weekly_journals
        ADD COLUMN IF NOT EXISTS images jsonb,
        ADD COLUMN IF NOT EXISTS reel_worthy boolean,
        ADD COLUMN IF NOT EXISTS reel_bucket text,
        ADD COLUMN IF NOT EXISTS reel_script text,
        ADD COLUMN IF NOT EXISTS reel_reason text,
        ADD COLUMN IF NOT EXISTS reel_analysed_at timestamptz
    `);
  } catch (err) {
    logger.error(
      { err },
      "Failed to ensure weekly_journals reel/image columns",
    );
  }

  // 2) Demo Day "best project" submissions: status enum + table + indexes.
  try {
    await db.execute(sql`
      DO $$ BEGIN
        CREATE TYPE demo_day_submission_status AS ENUM ('submitted', 'shortlisted', 'rejected');
      EXCEPTION WHEN duplicate_object THEN null;
      END $$;
    `);
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS demo_day_submissions (
        id serial PRIMARY KEY,
        team_id integer NOT NULL,
        project_id integer,
        title text NOT NULL,
        description text NOT NULL,
        link text,
        file_url text,
        status demo_day_submission_status NOT NULL DEFAULT 'submitted',
        submitted_by text NOT NULL,
        review_note text,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await db.execute(sql`
      CREATE UNIQUE INDEX IF NOT EXISTS demo_day_submissions_team_unique
        ON demo_day_submissions (team_id)
    `);
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS demo_day_submissions_status_idx
        ON demo_day_submissions (status)
    `);
  } catch (err) {
    logger.error({ err }, "Failed to ensure demo_day_submissions table");
  }
}

// Ensures the additive `users` columns that several features depend on exist in
// prod. Prod does NOT run `drizzle-kit push`, so a column added in code but
// never pushed (e.g. login_count / last_login_at) makes EVERY user INSERT crash
// (`POST /admin/users` → 500). All IF NOT EXISTS, so this no-ops when a column
// is already present. Safe to run on every boot.
async function ensureUserColumns(): Promise<void> {
  try {
    await db.execute(sql`
      ALTER TABLE users
        ADD COLUMN IF NOT EXISTS is_super_admin boolean NOT NULL DEFAULT false,
        ADD COLUMN IF NOT EXISTS admin_permissions jsonb,
        ADD COLUMN IF NOT EXISTS profile_completed_at timestamptz,
        ADD COLUMN IF NOT EXISTS last_seen_at timestamptz,
        ADD COLUMN IF NOT EXISTS last_login_at timestamptz,
        ADD COLUMN IF NOT EXISTS login_count integer NOT NULL DEFAULT 0
    `);
  } catch (err) {
    logger.error({ err }, "Failed to ensure users columns");
  }
}

// Adds the Google Drive mirror columns to revenue_entries. Runs at startup for
// the same reason as the other ensure* helpers: prod does NOT run
// `drizzle-kit push`, so without this the BRD-to-Drive migration route and the
// teams export (which read these columns) would crash with "column does not
// exist". Fully idempotent (IF NOT EXISTS); safe on every boot.
async function ensureBrdDriveColumns(): Promise<void> {
  try {
    await db.execute(sql`
      ALTER TABLE revenue_entries
        ADD COLUMN IF NOT EXISTS brd_drive_url text,
        ADD COLUMN IF NOT EXISTS brd_drive_file_id text,
        ADD COLUMN IF NOT EXISTS brd_drive_migrated_at timestamptz,
        ADD COLUMN IF NOT EXISTS brd_drive_migration_error text
    `);
  } catch (err) {
    logger.error({ err }, "Failed to ensure revenue_entries brd_drive columns");
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
    await ensureUserColumns();
  } catch (err) {
    logger.error({ err }, "ensureUserColumns failed");
  }
  try {
    await ensureReelAndDemoDayColumns();
  } catch (err) {
    logger.error({ err }, "ensureReelAndDemoDayColumns failed");
  }
  try {
    await ensureBrdDriveColumns();
  } catch (err) {
    logger.error({ err }, "ensureBrdDriveColumns failed");
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
  // One-shot sweep: reel-scan any weekly journals not yet processed (submitted
  // before the per-journal reel scan existed, or a setTimeout lost across a
  // redeploy). Throttled inside the helper; runs once at boot.
  try {
    await catchUpPendingJournalReelScans();
  } catch (err) {
    logger.error({ err }, "catchUpPendingJournalReelScans failed");
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
