import crypto from "crypto";
import { and, eq, gt, sql } from "drizzle-orm";
import { db } from "./index";
import { usersTable, authTokensTable, type User } from "./schema/brave";

const TOKEN_TTL_MS = 5 * 60 * 1000;

export async function createOrGetUserByFormsId(
  formsUserId: string,
  opts: { provisionedVia?: "roster" | "csv_import" | "manual" | "auto_forms_sso" } = {},
): Promise<{ user: User; created: boolean }> {
  const [existing] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.formsUserId, formsUserId));
  if (existing) return { user: existing, created: false };

  const email = `sso_${formsUserId}@forms.local`;
  const [created] = await db
    .insert(usersTable)
    .values({
      formsUserId,
      email,
      role: "student",
      provisionedVia: opts.provisionedVia ?? "auto_forms_sso",
    })
    .onConflictDoUpdate({
      target: usersTable.formsUserId,
      set: { updatedAt: new Date() },
    })
    .returning();
  // We already confirmed no row matched above, so reaching here means we
  // either inserted (common case) or lost a benign race with another
  // concurrent first-login (rare). Treat as created either way; the audit
  // log entry on a duplicate first-login is harmless.
  return { user: created, created: true };
}

export async function generateAuthToken(userId: string): Promise<string> {
  const token = crypto.randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + TOKEN_TTL_MS);
  await db.insert(authTokensTable).values({ token, userId, expiresAt });
  return token;
}

export async function validateAndConsumeToken(
  token: string,
): Promise<User | null> {
  const now = new Date();
  const [row] = await db
    .update(authTokensTable)
    .set({ used: true })
    .where(
      and(
        eq(authTokensTable.token, token),
        eq(authTokensTable.used, false),
        gt(authTokensTable.expiresAt, now),
      ),
    )
    .returning();

  if (!row) return null;

  const [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.id, row.userId));
  return user ?? null;
}

void sql;
