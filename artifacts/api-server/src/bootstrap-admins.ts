import { db, usersTable } from "@workspace/db";
import { eq, inArray, and, isNotNull } from "drizzle-orm";
import { logger } from "./lib/logger";

// Hardcoded primary administrator. This person is set as admin on every
// startup, regardless of how they were originally created (Forms SSO,
// manual insert, etc.). Matched by email.
const PRIMARY_ADMIN = {
  email: "divyansh.mathur@nxtwave.co.in",
  firstName: "Divyansh",
  lastName: "Mathur",
};

// Additional admin emails can be supplied via env (comma-separated).
export function getBootstrapAdminEmails(): string[] {
  const fromEnv = (process.env.BOOTSTRAP_ADMIN_EMAILS ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  return Array.from(new Set([PRIMARY_ADMIN.email.toLowerCase(), ...fromEnv]));
}

// Forms SSO user ids that should be promoted to admin on first sign-in.
// Useful when you don't know the email Forms will associate with a user.
export function getBootstrapAdminFormsIds(): string[] {
  return (process.env.BOOTSTRAP_ADMIN_FORMS_IDS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export async function bootstrapAdmins(): Promise<void> {
  const emails = getBootstrapAdminEmails();

  // 1. Upsert the primary admin by email so the row exists even before
  //    they ever log in via Forms SSO.
  const [existingPrimary] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.email, PRIMARY_ADMIN.email));

  if (existingPrimary) {
    await db
      .update(usersTable)
      .set({ role: "admin", isActive: true, campusId: null })
      .where(eq(usersTable.id, existingPrimary.id));
  } else {
    await db.insert(usersTable).values({
      email: PRIMARY_ADMIN.email,
      firstName: PRIMARY_ADMIN.firstName,
      lastName: PRIMARY_ADMIN.lastName,
      role: "admin",
      isActive: true,
      campusId: null,
    });
  }

  // 2. Promote any other rows whose email is in the bootstrap list.
  if (emails.length > 0) {
    const updated = await db
      .update(usersTable)
      .set({ role: "admin", isActive: true, campusId: null })
      .where(inArray(usersTable.email, emails))
      .returning({ id: usersTable.id, email: usersTable.email });
    logger.info(
      { promoted: updated.length, primary: PRIMARY_ADMIN.email },
      "Bootstrap admins reconciled",
    );
  }

  // 3. Defensive cleanup: any admin still tied to a campus has it cleared.
  const cleared = await db
    .update(usersTable)
    .set({ campusId: null })
    .where(and(eq(usersTable.role, "admin"), isNotNull(usersTable.campusId)))
    .returning({ id: usersTable.id, email: usersTable.email });
  if (cleared.length > 0) {
    logger.info(
      { cleared: cleared.length },
      "Cleared campus assignment for existing admin users",
    );
  }
}
