import { db, usersTable } from "@workspace/db";
import { eq, inArray } from "drizzle-orm";
import { logger } from "./lib/logger";

// Hardcoded primary super-administrator. There is exactly one superadmin at a
// time. The superadmin has every admin permission plus exclusive rights to
// add / modify / delete other admins. The superadmin row cannot be deleted;
// to retire this account, transfer the role to another user via
// POST /admin/users/:id/transfer-superadmin first.
const PRIMARY_ADMIN = {
  email: "divyansh.mathur@nxtwave.co.in",
  firstName: "Divyansh",
  lastName: "Mathur",
};

// Additional admin emails can be supplied via env (comma-separated).
function getBootstrapAdminEmails(): string[] {
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
  const emails = getBootstrapAdminEmails().filter(
    (e) => e !== PRIMARY_ADMIN.email.toLowerCase(),
  );

  // 1. Ensure exactly one superadmin exists, and it is PRIMARY_ADMIN.
  //    Demote any other superadmins to admin first (defensive: should never happen).
  const existingSuperadmins = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.role, "superadmin"));
  for (const s of existingSuperadmins) {
    if (s.email.toLowerCase() !== PRIMARY_ADMIN.email.toLowerCase()) {
      await db
        .update(usersTable)
        .set({ role: "admin" })
        .where(eq(usersTable.id, s.id));
      logger.warn(
        { email: s.email },
        "Demoted unexpected superadmin to admin during bootstrap",
      );
    }
  }

  const [existingPrimary] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.email, PRIMARY_ADMIN.email));

  if (existingPrimary) {
    await db
      .update(usersTable)
      .set({ role: "superadmin", isActive: true })
      .where(eq(usersTable.id, existingPrimary.id));
  } else {
    await db.insert(usersTable).values({
      email: PRIMARY_ADMIN.email,
      firstName: PRIMARY_ADMIN.firstName,
      lastName: PRIMARY_ADMIN.lastName,
      role: "superadmin",
      isActive: true,
    });
  }

  // 2. Promote any other bootstrap-listed rows to plain admin (never superadmin).
  let promoted = 0;
  if (emails.length > 0) {
    const updated = await db
      .update(usersTable)
      .set({ role: "admin", isActive: true })
      .where(inArray(usersTable.email, emails))
      .returning({ id: usersTable.id });
    promoted = updated.length;
  }
  logger.info(
    { promoted, superadmin: PRIMARY_ADMIN.email },
    "Bootstrap admins reconciled",
  );
}
