import app from "./app";
import { logger } from "./lib/logger";
import { db, usersTable } from "@workspace/db";
import { and, inArray, isNull, sql } from "drizzle-orm";
import { bootstrapCanonicalCampuses } from "./bootstrap-campuses";
import { bootstrapAdmins } from "./bootstrap-admins";
import { bootstrapSuperAdmins } from "./bootstrap-superadmins";
import { catchUpPendingBrdAnalyses } from "./lib/ai/analyse-brd";
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
