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
import { bootstrapRejectionReasons } from "./routes/rejection-reasons";

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

// Adds the team-name-uniqueness rename flag column. Runs at startup for the
// same reason as the other ensure* helpers: prod does NOT run `drizzle-kit
// push`, so without this the team list / notify-duplicates routes would crash
// with "column does not exist". Idempotent (IF NOT EXISTS); safe on every boot.
async function ensureTeamColumns(): Promise<void> {
  try {
    await db.execute(sql`
      ALTER TABLE teams
        ADD COLUMN IF NOT EXISTS name_flagged_for_rename boolean NOT NULL DEFAULT false,
        ADD COLUMN IF NOT EXISTS admin_notes text
    `);
  } catch (err) {
    logger.error({ err }, "Failed to ensure teams columns");
  }
  try {
    await db.execute(sql`
      ALTER TABLE projects
        ADD COLUMN IF NOT EXISTS admin_notes text
    `);
  } catch (err) {
    logger.error({ err }, "Failed to ensure projects admin_notes");
  }
}

// Adds the 'revoked' value to the entry_status enum. Runs at startup for the
// same reason as the other ensure* helpers: prod does NOT run `drizzle-kit
// push`, so without this the "revoke revenue" endpoint would crash with
// "invalid input value for enum entry_status: 'revoked'". ADD VALUE IF NOT
// EXISTS is idempotent and safe to run on every boot; it runs outside an
// explicit transaction so Postgres accepts the enum extension.
async function ensureRevokedEntryStatus(): Promise<void> {
  try {
    await db.execute(sql`
      ALTER TYPE entry_status ADD VALUE IF NOT EXISTS 'revoked'
    `);
  } catch (err) {
    logger.error({ err }, "Failed to ensure entry_status 'revoked' value");
  }
}

// Creates the admin-managed student popup tables. Runs at startup for the same
// reason as the other ensure* helpers: prod does NOT run `drizzle-kit push`, so
// without this the popup admin/student routes would crash with "relation does
// not exist". Fully idempotent (IF NOT EXISTS); safe on every boot. Entirely
// separate from the Terms & Conditions tables/columns.
async function ensurePopupTables(): Promise<void> {
  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS popup_templates (
        id serial PRIMARY KEY,
        name text NOT NULL,
        message text NOT NULL,
        require_checkbox boolean NOT NULL DEFAULT false,
        checkbox_label text,
        enabled boolean NOT NULL DEFAULT false,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS popup_templates_enabled_idx
        ON popup_templates (enabled)
    `);
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS popup_acknowledgements (
        id serial PRIMARY KEY,
        popup_id integer NOT NULL,
        user_id text NOT NULL,
        confirmed_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await db.execute(sql`
      CREATE UNIQUE INDEX IF NOT EXISTS popup_ack_user_popup_unique
        ON popup_acknowledgements (popup_id, user_id)
    `);
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS popup_ack_user_idx
        ON popup_acknowledgements (user_id)
    `);
  } catch (err) {
    logger.error({ err }, "Failed to ensure popup tables");
  }
}

// Adds the projects-submissions-lock columns to programme_config and creates
// the rejection_reasons table. Runs at startup for the same reason as the
// other ensure* helpers: prod does NOT run `drizzle-kit push`, so without this
// the projects-lock / rejection-reasons routes would crash with
// "column/relation does not exist". Fully idempotent; safe on every boot.
async function ensureProjectsLockAndRejectionReasons(): Promise<void> {
  try {
    await db.execute(sql`
      ALTER TABLE programme_config
        ADD COLUMN IF NOT EXISTS project_submissions_locked boolean NOT NULL DEFAULT false,
        ADD COLUMN IF NOT EXISTS project_submissions_lock_message text,
        ADD COLUMN IF NOT EXISTS rejected_resubmit_enabled boolean NOT NULL DEFAULT true,
        ADD COLUMN IF NOT EXISTS submission_request_enabled boolean NOT NULL DEFAULT true,
        ADD COLUMN IF NOT EXISTS hide_leaderboard_rank_for_students boolean NOT NULL DEFAULT false,
        ADD COLUMN IF NOT EXISTS leaderboard_image_url text,
        ADD COLUMN IF NOT EXISTS leaderboard_banner_source text NOT NULL DEFAULT 'image',
        ADD COLUMN IF NOT EXISTS leaderboard_banner_template text NOT NULL DEFAULT 'broadcast',
        ADD COLUMN IF NOT EXISTS leaderboard_banner_content jsonb
    `);
  } catch (err) {
    logger.error(
      { err },
      "Failed to ensure programme_config projects-lock columns",
    );
  }
  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS rejection_reasons (
        id serial PRIMARY KEY,
        label text NOT NULL,
        sort_order integer NOT NULL DEFAULT 0,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS rejection_reasons_sort_idx
        ON rejection_reasons (sort_order)
    `);
  } catch (err) {
    logger.error({ err }, "Failed to ensure rejection_reasons table");
  }
  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS team_submission_exemptions (
        id serial PRIMARY KEY,
        team_id integer NOT NULL,
        enabled_by text,
        enabled_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await db.execute(sql`
      CREATE UNIQUE INDEX IF NOT EXISTS team_submission_exemptions_team_unique
        ON team_submission_exemptions (team_id)
    `);
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS team_submission_exemptions_enabled_at_idx
        ON team_submission_exemptions (enabled_at)
    `);
  } catch (err) {
    logger.error({ err }, "Failed to ensure team_submission_exemptions table");
  }
  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS submission_access_requests (
        id serial PRIMARY KEY,
        team_id integer NOT NULL,
        requested_by text NOT NULL,
        purpose text,
        status text NOT NULL DEFAULT 'pending',
        decided_by text,
        decided_at timestamptz,
        decision_note text,
        created_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await db.execute(sql`
      ALTER TABLE submission_access_requests
        ADD COLUMN IF NOT EXISTS decision_note text
    `);
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS submission_access_requests_team_idx
        ON submission_access_requests (team_id)
    `);
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS submission_access_requests_status_idx
        ON submission_access_requests (status)
    `);
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS submission_access_requests_created_idx
        ON submission_access_requests (created_at)
    `);
  } catch (err) {
    logger.error({ err }, "Failed to ensure submission_access_requests table");
  }
}

// BRAVE Finale Submissions: config columns + the submissions table. Same
// reasoning as ensureProjectsLockAndRejectionReasons — prod never runs
// `drizzle-kit push`, so the routes would crash without this. Idempotent.
async function ensureFinaleSubmissions(): Promise<void> {
  try {
    await db.execute(sql`
      ALTER TABLE programme_config
        ADD COLUMN IF NOT EXISTS finale_menu_enabled boolean NOT NULL DEFAULT false,
        ADD COLUMN IF NOT EXISTS finale_min_verified_revenue integer NOT NULL DEFAULT 200000,
        ADD COLUMN IF NOT EXISTS finale_submissions_locked boolean NOT NULL DEFAULT false,
        ADD COLUMN IF NOT EXISTS finale_lock_message text,
        ADD COLUMN IF NOT EXISTS finale_content text,
        ADD COLUMN IF NOT EXISTS pca_voting_enabled boolean NOT NULL DEFAULT false,
        ADD COLUMN IF NOT EXISTS pca_min_verified_revenue integer NOT NULL DEFAULT 200000,
        ADD COLUMN IF NOT EXISTS email_controls jsonb
    `);
  } catch (err) {
    logger.error({ err }, "Failed to ensure programme_config finale columns");
  }
  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS pca_votes (
        id serial PRIMARY KEY,
        voter_id text NOT NULL,
        voter_team_id integer NOT NULL,
        voter_role text NOT NULL,
        voted_team_id integer NOT NULL,
        comments text,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz,
        updated_by text
      )
    `);
    // One vote per person, enforced by the DB rather than only the route.
    await db.execute(sql`
      CREATE UNIQUE INDEX IF NOT EXISTS pca_votes_voter_unique
        ON pca_votes (voter_id)
    `);
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS pca_votes_voted_team_idx
        ON pca_votes (voted_team_id)
    `);
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS pca_votes_voter_team_idx
        ON pca_votes (voter_team_id)
    `);
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS pca_votes_created_idx
        ON pca_votes (created_at)
    `);
  } catch (err) {
    logger.error({ err }, "Failed to ensure pca_votes table");
  }
  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS finale_submissions (
        id serial PRIMARY KEY,
        team_id integer NOT NULL,
        submitted_by text NOT NULL,
        file_url text NOT NULL,
        file_name text,
        remarks text,
        drive_url text,
        drive_file_id text,
        drive_synced_at timestamptz,
        drive_error text,
        created_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    // Edit/soft-delete columns — added after the table shipped, so they go on
    // via ALTER for installs that already created it.
    await db.execute(sql`
      ALTER TABLE finale_submissions
        ADD COLUMN IF NOT EXISTS category text,
        ADD COLUMN IF NOT EXISTS review_status text NOT NULL DEFAULT 'pending',
        ADD COLUMN IF NOT EXISTS reviewed_by text,
        ADD COLUMN IF NOT EXISTS reviewed_at timestamptz,
        ADD COLUMN IF NOT EXISTS updated_at timestamptz,
        ADD COLUMN IF NOT EXISTS updated_by text,
        ADD COLUMN IF NOT EXISTS deleted_at timestamptz,
        ADD COLUMN IF NOT EXISTS deleted_by text
    `);
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS finale_submissions_deleted_at_idx
        ON finale_submissions (deleted_at)
    `);
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS finale_submissions_team_idx
        ON finale_submissions (team_id)
    `);
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS finale_submissions_created_at_idx
        ON finale_submissions (created_at)
    `);
  } catch (err) {
    logger.error({ err }, "Failed to ensure finale_submissions table");
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// SEASONS (additive, isolated). Creates the seasons table, seeds Season 1 and
// Season 2, and adds season_id to every *activity* table.
//
// Runs at startup for the same reason as every other ensure* helper: the
// production deploy does NOT run `drizzle-kit push`, so this is what actually
// applies the schema there. Fully idempotent; safe on every boot.
//
// RUNNING THIS CHANGES NO BEHAVIOUR. Season 1 is seeded is_active = true and
// is_read_only = false, i.e. exactly how the programme behaves today: every
// existing row is Season 1 and all of them stay writable. Season 2 is seeded
// dormant. The cutover is therefore TWO deliberate admin actions, both
// reversible and neither needing a deploy:
//   1. activate Season 2   (seasons.is_active)
//   2. close Season 1      (seasons.is_read_only)
//
// IDENTITY IS NOT SCOPED. users, roster, campuses, teams, team_members and
// invite codes are deliberately absent below — the same teams carry forward
// into Season 2 and nobody re-registers.
// ─────────────────────────────────────────────────────────────────────────────

// Activity tables that gain season_id. DEFAULT 1 backfills every existing row
// in the same statement, which is why the default is 1 and not NULL.
const SEASON_SCOPED_TABLES = [
  "projects",
  "order_book_entries",
  "revenue_entries",
  "weekly_journals",
  "programme_weeks",
  "programme_config",
  "milestones",
  "demo_day_applications",
  "demo_day_submissions",
  "finale_submissions",
  "pca_votes",
] as const;

async function ensureSeasons(): Promise<void> {
  // 1) The seasons table itself.
  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS seasons (
        id serial PRIMARY KEY,
        name text NOT NULL,
        slug text NOT NULL,
        start_date text,
        end_date text,
        week_count integer NOT NULL DEFAULT 12,
        is_active boolean NOT NULL DEFAULT false,
        is_read_only boolean NOT NULL DEFAULT false,
        allow_journal_writes boolean NOT NULL DEFAULT false,
        allow_revenue_writes boolean NOT NULL DEFAULT false,
        allow_project_writes boolean NOT NULL DEFAULT false,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await db.execute(sql`
      CREATE UNIQUE INDEX IF NOT EXISTS seasons_slug_unique ON seasons (slug)
    `);
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS seasons_active_idx ON seasons (is_active)
    `);
  } catch (err) {
    logger.error({ err }, "Failed to ensure seasons table");
  }

  // 2) Seed both seasons with EXPLICIT ids, because the season_id DEFAULT of 1
  //    and the SEASON_1_ID / SEASON_2_ID constants depend on those exact
  //    values. ON CONFLICT DO NOTHING means an admin's later edits to a season
  //    row are never reverted by a redeploy.
  try {
    await db.execute(sql`
      INSERT INTO seasons
        (id, name, slug, start_date, end_date, week_count, is_active, is_read_only)
      VALUES
        (1, 'BRAVE Season 1', '1.0', '2026-04-16', '2026-07-15', 14, true, false)
      ON CONFLICT (id) DO NOTHING
    `);
    await db.execute(sql`
      INSERT INTO seasons (id, name, slug, week_count, is_active, is_read_only)
      VALUES (2, 'BRAVE Season 2', '2.0', 12, false, false)
      ON CONFLICT (id) DO NOTHING
    `);
    // Explicit ids bypass the sequence, so realign it or the next natural
    // insert would collide on id 1.
    await db.execute(sql`
      SELECT setval(
        pg_get_serial_sequence('seasons', 'id'),
        GREATEST(COALESCE((SELECT MAX(id) FROM seasons), 1), 1)
      )
    `);
  } catch (err) {
    logger.error({ err }, "Failed to seed seasons");
  }

  // 3) season_id on every activity table, plus a plain index on it.
  for (const table of SEASON_SCOPED_TABLES) {
    try {
      await db.execute(
        sql`ALTER TABLE ${sql.identifier(table)}
              ADD COLUMN IF NOT EXISTS season_id integer NOT NULL DEFAULT 1`,
      );
      await db.execute(
        sql`CREATE INDEX IF NOT EXISTS ${sql.identifier(table + "_season_idx")}
              ON ${sql.identifier(table)} (season_id)`,
      );
    } catch (err) {
      logger.error({ err, table }, "Failed to ensure season_id column");
    }
  }

  // 4) Composite (season_id, team_id) indexes where the table is read by team.
  try {
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS projects_season_team_idx
        ON projects (season_id, team_id)
    `);
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS order_book_season_team_idx
        ON order_book_entries (season_id, team_id)
    `);
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS revenue_season_team_idx
        ON revenue_entries (season_id, team_id)
    `);
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS weekly_journals_season_team_idx
        ON weekly_journals (season_id, team_id)
    `);
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS milestones_season_team_idx
        ON milestones (season_id, team_id)
    `);
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS finale_submissions_season_team_idx
        ON finale_submissions (season_id, team_id)
    `);
  } catch (err) {
    logger.error({ err }, "Failed to ensure composite season indexes");
  }

  // 5) Widen the unique constraints that would otherwise forbid a second
  //    season's rows. Widening UNIQUE(a) to UNIQUE(a, season_id) accepts a
  //    strict SUPERSET of what the old constraint accepted, so it can never
  //    reject data that is already stored.
  //
  //    New index FIRST, old constraint second, so there is never a window with
  //    no protection. Both DROP forms are attempted because production may
  //    hold either a table constraint or a bare unique index under that name.
  const widenings = [
    {
      label: "programme_weeks: week_number -> (season_id, week_number)",
      table: "programme_weeks",
      newIndex: "programme_weeks_season_week_unique",
      columns: "(season_id, week_number)",
      oldNames: ["programme_weeks_week_number_unique"],
    },
    {
      label: "demo_day_applications: team_id -> (team_id, season_id)",
      table: "demo_day_applications",
      newIndex: "demo_day_applications_team_season_unique",
      columns: "(team_id, season_id)",
      // Drizzle names an inline .unique() column constraint
      // <table>_<column>_unique; older pushes may differ, so try both.
      oldNames: [
        "demo_day_applications_team_id_unique",
        "demo_day_applications_team_id_key",
      ],
    },
    {
      label: "demo_day_submissions: team_id -> (team_id, season_id)",
      table: "demo_day_submissions",
      newIndex: "demo_day_submissions_team_season_unique",
      columns: "(team_id, season_id)",
      oldNames: ["demo_day_submissions_team_unique"],
    },
    {
      label: "pca_votes: voter_id -> (voter_id, season_id)",
      table: "pca_votes",
      newIndex: "pca_votes_voter_season_unique",
      columns: "(voter_id, season_id)",
      oldNames: ["pca_votes_voter_unique"],
    },
  ] as const;

  for (const w of widenings) {
    try {
      await db.execute(
        sql`CREATE UNIQUE INDEX IF NOT EXISTS ${sql.identifier(w.newIndex)}
              ON ${sql.identifier(w.table)} ${sql.raw(w.columns)}`,
      );
      for (const old of w.oldNames) {
        await db.execute(
          sql`ALTER TABLE ${sql.identifier(w.table)}
                DROP CONSTRAINT IF EXISTS ${sql.identifier(old)}`,
        );
        await db.execute(sql`DROP INDEX IF EXISTS ${sql.identifier(old)}`);
      }
    } catch (err) {
      logger.error(
        { err, widening: w.label },
        "Failed to widen unique constraint for seasons",
      );
    }
  }

  // 6) One programme_config row per season. It used to be a singleton; the
  //    existing row becomes Season 1's, and Season 2 gets its own so it can
  //    carry different dates, a different team cap and a different threshold.
  try {
    await db.execute(sql`
      CREATE UNIQUE INDEX IF NOT EXISTS programme_config_season_unique
        ON programme_config (season_id)
    `);
  } catch (err) {
    logger.error(
      { err },
      "Failed to ensure programme_config season uniqueness (duplicate rows for one season?)",
    );
  }
  try {
    const created = await db.execute(sql`
      INSERT INTO programme_config (season_id)
      SELECT 2
      WHERE NOT EXISTS (SELECT 1 FROM programme_config WHERE season_id = 2)
    `);
    if (((created as { rowCount?: number }).rowCount ?? 0) > 0) {
      logger.info("[seasons] created programme_config row for Season 2");
    }
  } catch (err) {
    logger.error({ err }, "Failed to ensure Season 2 programme_config row");
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// SEASON 2 LEAD PIPELINE (additive, isolated). Creates the enums, the six new
// tables, and the Season 2 project-definition columns.
//
// Runs at startup for the same reason as every other ensure* helper: the
// production deploy does NOT run `drizzle-kit push`. Fully idempotent.
//
// NOTHING HERE CHANGES EXISTING BEHAVIOUR. Every table is new and unread by
// Season 1 code; every projects column is nullable, so existing rows are
// untouched and every current query returns exactly what it did before.
//
// Postgres has no CREATE TYPE ... IF NOT EXISTS, so each enum goes in a DO
// block that swallows duplicate_object — the standard idiom, and safe to
// re-run on every boot.
// ─────────────────────────────────────────────────────────────────────────────

const LEAD_PIPELINE_ENUMS: Array<{ name: string; values: string[] }> = [
  {
    name: "lead_source",
    values: ["walk_in", "online", "referral", "known_contact"],
  },
  {
    name: "lead_stage",
    values: [
      "new",
      "qualified",
      "proposal_sent",
      "converted",
      "lost",
      "dormant",
    ],
  },
  {
    name: "business_category",
    values: [
      "retail",
      "food_beverage",
      "clinic",
      "salon",
      "education",
      "services",
      "manufacturing",
      "other",
    ],
  },
  {
    name: "meeting_mode",
    values: ["in_person", "phone", "video", "whatsapp"],
  },
  {
    name: "interaction_type",
    values: [
      "call",
      "whatsapp",
      "email",
      "site_visit",
      "demo",
      "proposal_sent",
      "negotiation",
      "payment_discussion",
    ],
  },
  {
    name: "interaction_outcome",
    values: ["positive", "neutral", "objection", "no_response"],
  },
  {
    name: "payment_mode",
    values: ["upi", "bank_transfer", "cash", "cheque"],
  },
  { name: "revenue_type", values: ["one_time", "recurring"] },
  {
    name: "recurring_frequency",
    values: ["monthly", "quarterly", "annual"],
  },
];

async function ensureLeadPipeline(): Promise<void> {
  // 1) Enum types.
  for (const e of LEAD_PIPELINE_ENUMS) {
    try {
      const labels = e.values.map((v) => `'${v}'`).join(", ");
      await db.execute(
        sql.raw(`
          DO $$ BEGIN
            CREATE TYPE ${e.name} AS ENUM (${labels});
          EXCEPTION WHEN duplicate_object THEN NULL;
          END $$;
        `),
      );
    } catch (err) {
      logger.error({ err, enum: e.name }, "Failed to ensure lead-pipeline enum");
    }
  }

  // 2) leads.
  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS leads (
        id serial PRIMARY KEY,
        team_id integer NOT NULL,
        season_id integer NOT NULL DEFAULT 2,
        source lead_source NOT NULL,
        referrer_name text,
        relationship_note text,
        business_name text NOT NULL,
        owner_name text NOT NULL,
        phone text NOT NULL,
        alt_phone text,
        business_category business_category NOT NULL,
        city text NOT NULL,
        area_locality text,
        geo_lat text,
        geo_lng text,
        first_meeting_date text NOT NULL,
        meeting_mode meeting_mode NOT NULL,
        conversation_note text NOT NULL,
        pain_point text,
        estimated_value integer,
        evidence jsonb,
        stage lead_stage NOT NULL DEFAULT 'new',
        is_related_party boolean NOT NULL DEFAULT false,
        trail_strength integer NOT NULL DEFAULT 0,
        last_contact_at timestamptz,
        next_action_date text,
        last_nudge_level integer NOT NULL DEFAULT 0,
        last_nudge_at timestamptz,
        created_by text NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await db.execute(
      sql`CREATE INDEX IF NOT EXISTS leads_team_idx ON leads (team_id)`,
    );
    await db.execute(
      sql`CREATE INDEX IF NOT EXISTS leads_season_team_idx ON leads (season_id, team_id)`,
    );
    await db.execute(
      sql`CREATE INDEX IF NOT EXISTS leads_stage_idx ON leads (stage)`,
    );
    await db.execute(
      sql`CREATE INDEX IF NOT EXISTS leads_phone_idx ON leads (phone)`,
    );
    await db.execute(
      sql`CREATE INDEX IF NOT EXISTS leads_related_party_idx ON leads (is_related_party)`,
    );
    await db.execute(
      sql`CREATE INDEX IF NOT EXISTS leads_last_contact_idx ON leads (last_contact_at)`,
    );
    // Additive columns for the nudge ladder. Guarded so a database created by
    // an earlier build of this bootstrap picks them up on the next boot.
    await db.execute(
      sql`ALTER TABLE leads ADD COLUMN IF NOT EXISTS last_nudge_level integer NOT NULL DEFAULT 0`,
    );
    await db.execute(
      sql`ALTER TABLE leads ADD COLUMN IF NOT EXISTS last_nudge_at timestamptz`,
    );
  } catch (err) {
    logger.error({ err }, "Failed to ensure leads table");
  }

  // 3) lead_interactions.
  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS lead_interactions (
        id serial PRIMARY KEY,
        lead_id integer NOT NULL,
        team_id integer NOT NULL,
        season_id integer NOT NULL DEFAULT 2,
        interaction_date text NOT NULL,
        interaction_type interaction_type NOT NULL,
        summary text NOT NULL,
        outcome interaction_outcome NOT NULL,
        objection_note text,
        next_action_date text,
        attachments jsonb,
        stage_change lead_stage,
        logged_at timestamptz NOT NULL DEFAULT now(),
        logged_by text NOT NULL
      )
    `);
    await db.execute(
      sql`CREATE INDEX IF NOT EXISTS lead_interactions_lead_idx ON lead_interactions (lead_id)`,
    );
    await db.execute(
      sql`CREATE INDEX IF NOT EXISTS lead_interactions_team_idx ON lead_interactions (team_id)`,
    );
    await db.execute(
      sql`CREATE INDEX IF NOT EXISTS lead_interactions_season_team_idx ON lead_interactions (season_id, team_id)`,
    );
    await db.execute(
      sql`CREATE INDEX IF NOT EXISTS lead_interactions_date_idx ON lead_interactions (interaction_date)`,
    );
  } catch (err) {
    logger.error({ err }, "Failed to ensure lead_interactions table");
  }

  // 4) project_phases + payment_schedule.
  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS project_phases (
        id serial PRIMARY KEY,
        project_id integer NOT NULL,
        sort_order integer NOT NULL DEFAULT 0,
        name text NOT NULL,
        deliverables text,
        start_date text,
        end_date text,
        created_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await db.execute(
      sql`CREATE INDEX IF NOT EXISTS project_phases_project_idx ON project_phases (project_id, sort_order)`,
    );
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS payment_schedule (
        id serial PRIMARY KEY,
        project_id integer NOT NULL,
        phase_id integer NOT NULL,
        amount integer NOT NULL,
        due_date text,
        revenue_type revenue_type NOT NULL DEFAULT 'one_time',
        created_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await db.execute(
      sql`CREATE INDEX IF NOT EXISTS payment_schedule_project_idx ON payment_schedule (project_id)`,
    );
    await db.execute(
      sql`CREATE INDEX IF NOT EXISTS payment_schedule_phase_idx ON payment_schedule (phase_id)`,
    );
  } catch (err) {
    logger.error({ err }, "Failed to ensure phase/schedule tables");
  }

  // 5) payments. The partial unique index on transaction_ref is what makes the
  //    duplicate-UTR fraud check possible; cash rows carry NULL and are exempt.
  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS payments (
        id serial PRIMARY KEY,
        project_id integer NOT NULL,
        phase_id integer NOT NULL,
        team_id integer NOT NULL,
        season_id integer NOT NULL DEFAULT 2,
        amount_received integer NOT NULL,
        payment_date text NOT NULL,
        payment_mode payment_mode NOT NULL,
        transaction_ref text,
        payment_proof text NOT NULL,
        invoice_doc text NOT NULL,
        delivery_proof jsonb,
        client_confirmed boolean NOT NULL DEFAULT false,
        client_confirmed_at timestamptz,
        recorded_by text NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await db.execute(
      sql`CREATE INDEX IF NOT EXISTS payments_project_idx ON payments (project_id)`,
    );
    await db.execute(
      sql`CREATE INDEX IF NOT EXISTS payments_phase_idx ON payments (phase_id)`,
    );
    await db.execute(
      sql`CREATE INDEX IF NOT EXISTS payments_season_team_idx ON payments (season_id, team_id)`,
    );
    await db.execute(sql`
      CREATE UNIQUE INDEX IF NOT EXISTS payments_transaction_ref_unique
        ON payments (transaction_ref)
        WHERE transaction_ref IS NOT NULL
    `);
  } catch (err) {
    logger.error({ err }, "Failed to ensure payments table");
  }

  // 6) client_registry.
  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS client_registry (
        id serial PRIMARY KEY,
        phone_normalised text NOT NULL,
        business_name text NOT NULL,
        owner_name text,
        business_category business_category,
        city text,
        verified_by_call boolean NOT NULL DEFAULT false,
        verified_at timestamptz,
        call_transcript text,
        nps_score integer,
        nps_comment text,
        unreachable boolean NOT NULL DEFAULT false,
        dispute_open boolean NOT NULL DEFAULT false,
        dispute_note text,
        first_seen_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await db.execute(sql`
      CREATE UNIQUE INDEX IF NOT EXISTS client_registry_phone_unique
        ON client_registry (phone_normalised)
    `);
    await db.execute(
      sql`CREATE INDEX IF NOT EXISTS client_registry_dispute_idx ON client_registry (dispute_open)`,
    );
  } catch (err) {
    logger.error({ err }, "Failed to ensure client_registry table");
  }

  // 7) Season 2 project-definition columns. All nullable — a NULL lead_id is
  //    exactly what marks a row as a Season 1 project.
  try {
    await db.execute(sql`
      ALTER TABLE projects
        ADD COLUMN IF NOT EXISTS lead_id integer,
        ADD COLUMN IF NOT EXISTS service_category text,
        ADD COLUMN IF NOT EXISTS problem_statement text,
        ADD COLUMN IF NOT EXISTS solution_description text,
        ADD COLUMN IF NOT EXISTS tech_stack jsonb,
        ADD COLUMN IF NOT EXISTS live_product_url text,
        ADD COLUMN IF NOT EXISTS demo_video_url text,
        ADD COLUMN IF NOT EXISTS source_code_url text,
        ADD COLUMN IF NOT EXISTS prototype_url text,
        ADD COLUMN IF NOT EXISTS demo_credentials text,
        ADD COLUMN IF NOT EXISTS revenue_type revenue_type,
        ADD COLUMN IF NOT EXISTS recurring_frequency recurring_frequency,
        ADD COLUMN IF NOT EXISTS total_contract_value integer,
        ADD COLUMN IF NOT EXISTS agreement_doc text
    `);
    await db.execute(
      sql`CREATE INDEX IF NOT EXISTS projects_lead_idx ON projects (lead_id)`,
    );
  } catch (err) {
    logger.error({ err }, "Failed to ensure Season 2 project columns");
  }

  // 8) Composed-BRD columns on revenue_entries. Nullable and additive: every
  //    Season 1 row keeps brd_url and leaves both of these NULL, so no existing
  //    read path changes behaviour.
  try {
    await db.execute(sql`
      ALTER TABLE revenue_entries
        ADD COLUMN IF NOT EXISTS brd_composed jsonb,
        ADD COLUMN IF NOT EXISTS brd_text text
    `);
  } catch (err) {
    logger.error({ err }, "Failed to ensure composed BRD columns");
  }
}

/**
 * Phase 6 — trust score ledger and price recognition.
 *
 * Additive throughout. The two new revenue_entries columns are nullable and
 * every read coalesces through them, so Season 1 totals cannot move and no
 * backfill is required.
 */
async function ensureTrustAndPricing(): Promise<void> {
  // 1) Enums. DO NOT reorder or remove values — Postgres enums cannot drop a
  //    value, and the order here must match lib/db/src/schema/brave.ts.
  const enums: Array<[string, string[]]> = [
    [
      "trust_event_kind",
      [
        "revenue_verified",
        "client_confirmed",
        "journal_streak",
        "trail_strong",
        "geo_verified",
        "phase_delivered_on_time",
        "client_disputed",
        "duplicate_client",
        "amount_overstated",
        "evidence_missing",
        "link_dead",
        "backdated_trail",
        "manual_adjustment",
      ],
    ],
    ["trust_tier", ["watch", "bronze", "silver", "gold"]],
  ];
  for (const [name, values] of enums) {
    try {
      const list = values.map((v) => `'${v}'`).join(", ");
      await db.execute(
        sql.raw(`DO $$ BEGIN
          CREATE TYPE ${name} AS ENUM (${list});
        EXCEPTION WHEN duplicate_object THEN NULL; END $$;`),
      );
      // A database created by an earlier build may be missing a later value.
      for (const v of values) {
        await db.execute(
          sql.raw(`ALTER TYPE ${name} ADD VALUE IF NOT EXISTS '${v}'`),
        );
      }
    } catch (err) {
      logger.error({ err, name }, "Failed to ensure enum");
    }
  }

  // 2) pricing_categories.
  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS pricing_categories (
        id serial PRIMARY KEY,
        season_id integer NOT NULL DEFAULT 2,
        name text NOT NULL,
        description text,
        typical_min integer,
        typical_max integer,
        recognition_cap integer,
        is_active boolean NOT NULL DEFAULT true,
        created_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await db.execute(
      sql`CREATE INDEX IF NOT EXISTS pricing_categories_season_idx ON pricing_categories (season_id)`,
    );
    await db.execute(
      sql`CREATE UNIQUE INDEX IF NOT EXISTS pricing_categories_season_name_unique ON pricing_categories (season_id, name)`,
    );
  } catch (err) {
    logger.error({ err }, "Failed to ensure pricing_categories table");
  }

  // 3) trust_score_events.
  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS trust_score_events (
        id serial PRIMARY KEY,
        team_id integer NOT NULL,
        season_id integer NOT NULL DEFAULT 2,
        kind trust_event_kind NOT NULL,
        points integer NOT NULL,
        reason text,
        ref_type text,
        ref_id integer,
        created_by text,
        created_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await db.execute(
      sql`CREATE INDEX IF NOT EXISTS trust_score_events_team_idx ON trust_score_events (team_id)`,
    );
    await db.execute(
      sql`CREATE INDEX IF NOT EXISTS trust_score_events_season_team_idx ON trust_score_events (season_id, team_id)`,
    );
    // Partial unique index: an automated award fires once per underlying fact,
    // so a cron re-run is a database error rather than an inflated score.
    await db.execute(sql`
      CREATE UNIQUE INDEX IF NOT EXISTS trust_score_events_dedup
        ON trust_score_events (season_id, team_id, kind, ref_type, ref_id)
        WHERE ref_id IS NOT NULL
    `);
  } catch (err) {
    logger.error({ err }, "Failed to ensure trust_score_events table");
  }

  // 4) Recognition columns on revenue_entries. Nullable — `amount` stays the
  //    claimed figure and is never rewritten.
  try {
    await db.execute(sql`
      ALTER TABLE revenue_entries
        ADD COLUMN IF NOT EXISTS recognised_amount integer,
        ADD COLUMN IF NOT EXISTS weighted_amount integer,
        ADD COLUMN IF NOT EXISTS pricing_category_id integer
    `);
  } catch (err) {
    logger.error({ err }, "Failed to ensure recognition columns");
  }
}

/**
 * Phase 7 — evaluation: assignments, appeals, audit sampling.
 *
 * Additive throughout. `users.is_evaluator` defaults to false, so every
 * existing user is unchanged and no role check anywhere behaves differently.
 */
async function ensureEvaluation(): Promise<void> {
  // 1) Enums. Order must match lib/db/src/schema/brave.ts exactly.
  const enums: Array<[string, string[]]> = [
    [
      "review_decision",
      ["pending", "hold", "changes_requested", "approved", "rejected"],
    ],
    ["appeal_status", ["open", "upheld", "declined", "withdrawn"]],
  ];
  for (const [name, values] of enums) {
    try {
      const list = values.map((v) => `'${v}'`).join(", ");
      await db.execute(
        sql.raw(`DO $$ BEGIN
          CREATE TYPE ${name} AS ENUM (${list});
        EXCEPTION WHEN duplicate_object THEN NULL; END $$;`),
      );
      for (const v of values) {
        await db.execute(
          sql.raw(`ALTER TYPE ${name} ADD VALUE IF NOT EXISTS '${v}'`),
        );
      }
    } catch (err) {
      logger.error({ err, name }, "Failed to ensure enum");
    }
  }

  // 2) The evaluator flag.
  try {
    await db.execute(
      sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS is_evaluator boolean NOT NULL DEFAULT false`,
    );
  } catch (err) {
    logger.error({ err }, "Failed to ensure users.is_evaluator");
  }

  // 3) review_assignments.
  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS review_assignments (
        id serial PRIMARY KEY,
        season_id integer NOT NULL DEFAULT 2,
        revenue_entry_id integer NOT NULL,
        team_id integer NOT NULL,
        evaluator_id text NOT NULL,
        decision review_decision NOT NULL DEFAULT 'pending',
        assigned_at timestamptz NOT NULL DEFAULT now(),
        sla_due_at timestamptz,
        clock_paused_at timestamptz,
        paused_seconds integer NOT NULL DEFAULT 0,
        decided_at timestamptz,
        decision_note text,
        signals jsonb,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await db.execute(
      sql`CREATE INDEX IF NOT EXISTS review_assignments_evaluator_idx ON review_assignments (evaluator_id, decision)`,
    );
    await db.execute(
      sql`CREATE INDEX IF NOT EXISTS review_assignments_entry_idx ON review_assignments (revenue_entry_id)`,
    );
    await db.execute(
      sql`CREATE INDEX IF NOT EXISTS review_assignments_season_idx ON review_assignments (season_id, decision)`,
    );
    await db.execute(
      sql`CREATE UNIQUE INDEX IF NOT EXISTS review_assignments_entry_evaluator_unique ON review_assignments (revenue_entry_id, evaluator_id)`,
    );
  } catch (err) {
    logger.error({ err }, "Failed to ensure review_assignments table");
  }

  // 4) review_appeals.
  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS review_appeals (
        id serial PRIMARY KEY,
        season_id integer NOT NULL DEFAULT 2,
        revenue_entry_id integer NOT NULL,
        team_id integer NOT NULL,
        assignment_id integer,
        reason text NOT NULL,
        evidence jsonb,
        status appeal_status NOT NULL DEFAULT 'open',
        raised_by text NOT NULL,
        raised_at timestamptz NOT NULL DEFAULT now(),
        decided_by text,
        decided_at timestamptz,
        outcome_note text
      )
    `);
    await db.execute(
      sql`CREATE INDEX IF NOT EXISTS review_appeals_team_idx ON review_appeals (team_id)`,
    );
    await db.execute(
      sql`CREATE INDEX IF NOT EXISTS review_appeals_status_idx ON review_appeals (status)`,
    );
    // Partial unique: one OPEN appeal per submission, but a new one may be
    // raised once the previous is closed.
    await db.execute(sql`
      CREATE UNIQUE INDEX IF NOT EXISTS review_appeals_open_unique
        ON review_appeals (revenue_entry_id)
        WHERE status = 'open'
    `);
  } catch (err) {
    logger.error({ err }, "Failed to ensure review_appeals table");
  }

  // 5) review_audit_samples.
  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS review_audit_samples (
        id serial PRIMARY KEY,
        season_id integer NOT NULL DEFAULT 2,
        assignment_id integer NOT NULL,
        revenue_entry_id integer NOT NULL,
        sampled_at timestamptz NOT NULL DEFAULT now(),
        auditor_id text,
        agreed boolean,
        note text,
        completed_at timestamptz
      )
    `);
    await db.execute(
      sql`CREATE INDEX IF NOT EXISTS review_audit_samples_season_idx ON review_audit_samples (season_id)`,
    );
    await db.execute(
      sql`CREATE UNIQUE INDEX IF NOT EXISTS review_audit_samples_entry_unique ON review_audit_samples (revenue_entry_id)`,
    );
  } catch (err) {
    logger.error({ err }, "Failed to ensure review_audit_samples table");
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// WHATSAPP (additive, isolated). Two nullable contact columns and the template
// registry that stands in for Karix's missing template-list API.
//
// Runs at startup for the same reason as every other ensure* helper: the
// production deploy does NOT run `drizzle-kit push`. Fully idempotent.
//
// NOTHING HERE CHANGES EXISTING BEHAVIOUR. Both columns are nullable, so every
// existing roster and user row is untouched and every current query returns
// exactly what it did before. A null number means a recipient is skipped by a
// send, never that the send fails.
// ─────────────────────────────────────────────────────────────────────────────

async function ensureWhatsApp(): Promise<void> {
  // 1) Contact columns. Roster covers students; users covers coordinators and
  //    admins, who are not on the roster at all.
  try {
    await db.execute(
      sql`ALTER TABLE roster ADD COLUMN IF NOT EXISTS mobile_number text`,
    );
    await db.execute(
      sql`CREATE INDEX IF NOT EXISTS roster_mobile_idx ON roster (mobile_number)`,
    );
    await db.execute(
      sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS mobile_number text`,
    );
  } catch (err) {
    logger.error({ err }, "Failed to ensure WhatsApp contact columns");
  }

  // 2) Template registry. Karix exposes NO API for listing the templates an
  //    account has registered — 190 endpoints across their two collections and
  //    not one of them lists templates. So an admin records each approved
  //    template here once (the name exactly as it appears in Konverse, plus its
  //    variable count) and the dashboard sends against this list.
  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS whatsapp_templates (
        id serial PRIMARY KEY,
        template_id text NOT NULL,
        display_name text NOT NULL,
        category text NOT NULL DEFAULT 'utility',
        language text NOT NULL DEFAULT 'en',
        variable_count integer NOT NULL DEFAULT 0,
        variable_labels jsonb,
        sample_body text,
        is_active boolean NOT NULL DEFAULT true,
        created_by text,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await db.execute(sql`
      CREATE UNIQUE INDEX IF NOT EXISTS whatsapp_templates_template_id_unique
        ON whatsapp_templates (template_id)
    `);
  } catch (err) {
    logger.error({ err }, "Failed to ensure whatsapp_templates table");
  }

  // 3) Send log. One row per send ATTEMPT per recipient, so a mis-scoped
  //    broadcast can be reconstructed afterwards — who was messaged, with what,
  //    by whom. WhatsApp has no unsend, so the log is the only forensic record.
  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS whatsapp_sends (
        id serial PRIMARY KEY,
        batch_id text NOT NULL,
        template_id text NOT NULL,
        recipient_phone text NOT NULL,
        recipient_user_id text,
        recipient_name text,
        recipient_role text,
        campus_id integer,
        parameter_values jsonb,
        status text NOT NULL DEFAULT 'pending',
        status_code text,
        status_desc text,
        message_id text,
        season_id integer NOT NULL DEFAULT 1,
        sent_by text NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await db.execute(
      sql`CREATE INDEX IF NOT EXISTS whatsapp_sends_batch_idx ON whatsapp_sends (batch_id)`,
    );
    await db.execute(
      sql`CREATE INDEX IF NOT EXISTS whatsapp_sends_created_idx ON whatsapp_sends (created_at)`,
    );
    await db.execute(
      sql`CREATE INDEX IF NOT EXISTS whatsapp_sends_phone_idx ON whatsapp_sends (recipient_phone)`,
    );
  } catch (err) {
    logger.error({ err }, "Failed to ensure whatsapp_sends table");
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
    await ensureTeamColumns();
  } catch (err) {
    logger.error({ err }, "ensureTeamColumns failed");
  }
  try {
    await ensureRevokedEntryStatus();
  } catch (err) {
    logger.error({ err }, "ensureRevokedEntryStatus failed");
  }
  try {
    await ensurePopupTables();
  } catch (err) {
    logger.error({ err }, "ensurePopupTables failed");
  }
  try {
    await ensureProjectsLockAndRejectionReasons();
  } catch (err) {
    logger.error({ err }, "ensureProjectsLockAndRejectionReasons failed");
  }
  try {
    await ensureFinaleSubmissions();
  } catch (err) {
    logger.error({ err }, "ensureFinaleSubmissions failed");
  }
  // Seasons. Deliberately runs AFTER every table-creating ensure* helper above,
  // because it ALTERs demo_day_submissions, finale_submissions and pca_votes —
  // tables that those helpers create on a fresh database. Running it earlier
  // would silently skip their season_id until the next boot.
  try {
    await ensureSeasons();
  } catch (err) {
    logger.error({ err }, "ensureSeasons failed");
  }
  // Season 2 lead pipeline. Runs after ensureSeasons so the season rows the new
  // tables default to already exist.
  try {
    await ensureLeadPipeline();
  } catch (err) {
    logger.error({ err }, "ensureLeadPipeline failed");
  }
  // Phase 6 trust ledger + price recognition. After ensureLeadPipeline because
  // it ALTERs revenue_entries, which that helper has already touched.
  try {
    await ensureTrustAndPricing();
  } catch (err) {
    logger.error({ err }, "ensureTrustAndPricing failed");
  }
  // Phase 7 evaluation tables. After ensureTrustAndPricing purely for ordering
  // clarity; it shares no tables with it.
  try {
    await ensureEvaluation();
  } catch (err) {
    logger.error({ err }, "ensureEvaluation failed");
  }
  // WhatsApp contact columns + template registry + send log. Independent of
  // every helper above; ordered last purely because it is the newest.
  try {
    await ensureWhatsApp();
  } catch (err) {
    logger.error({ err }, "ensureWhatsApp failed");
  }
  // Seed the two previously hardcoded reject-reason chips once, only when the
  // rejection_reasons table is empty (admin deletions are never resurrected).
  try {
    await bootstrapRejectionReasons();
  } catch (err) {
    logger.error({ err }, "bootstrapRejectionReasons failed");
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
  // a redeploy). The merged call covers the reel scan too, so no separate reel
  // sweep is needed. Throttled inside the helper; runs once at boot.
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
