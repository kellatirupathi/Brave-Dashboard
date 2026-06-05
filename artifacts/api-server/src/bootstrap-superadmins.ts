import { db, usersTable } from "@workspace/db";
import { inArray } from "drizzle-orm";
import { logger } from "./lib/logger";
import { getBootstrapAdminEmails } from "./bootstrap-admins";

// The named first super admin for this deployment. Always promoted (if a row
// exists) so there is a known super admin in addition to the primary bootstrap
// admin.
const FIRST_SUPER_ADMIN = "tirupathirao.kella@nxtwave.co.in";

// Resolve the full set of super-admin emails: the hardcoded first super admin,
// the primary bootstrap admin(s) (so there is always at least one super admin),
// plus anything in SUPER_ADMIN_EMAILS (comma-separated). All lowercased.
export function getSuperAdminEmails(): string[] {
  const fromEnv = (process.env.SUPER_ADMIN_EMAILS ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  return Array.from(
    new Set([
      FIRST_SUPER_ADMIN.toLowerCase(),
      ...getBootstrapAdminEmails(),
      ...fromEnv,
    ]),
  );
}

// Idempotent: promotes matching rows to admin + super admin. Never demotes
// anyone, never touches non-listed users. Safe to run on every startup.
export async function bootstrapSuperAdmins(): Promise<void> {
  const emails = getSuperAdminEmails();
  if (emails.length === 0) return;

  const updated = await db
    .update(usersTable)
    .set({ role: "admin", isSuperAdmin: true, isActive: true })
    .where(inArray(usersTable.email, emails))
    .returning({ id: usersTable.id, email: usersTable.email });

  logger.info(
    { promoted: updated.length, configured: emails.length },
    "Bootstrap super admins reconciled",
  );

  const promotedEmails = new Set(updated.map((u) => u.email.toLowerCase()));
  const missing = emails.filter((e) => !promotedEmails.has(e));
  if (missing.length > 0) {
    // A configured super-admin email has no matching user row yet (e.g. they
    // have never signed in). They will be promoted automatically on the next
    // startup once their account exists.
    logger.warn(
      { missing },
      "Some configured super-admin emails had no matching user row",
    );
  }
}
