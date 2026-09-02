import { eq, or } from "drizzle-orm";
import {
  db,
  usersTable,
  rosterTable,
  accessRequestsTable,
} from "@workspace/db";

export type AccessRequestTx = Parameters<
  Parameters<typeof db.transaction>[0]
>[0];

/**
 * Make an approved access request usable by the student.
 *
 * This is intentionally idempotent because approval can be reached through
 * more than one admin surface, and older approved requests may need repair.
 */
export async function provisionApprovedAccessRequest(
  tx: AccessRequestTx,
  reqRow: typeof accessRequestsTable.$inferSelect,
): Promise<void> {
  const parts = reqRow.fullName.trim().split(/\s+/);
  const firstName = parts[0] ?? "";
  const lastName = parts.slice(1).join(" ");

  // Resolve the SSO user by the request's bound user id first. The email on an
  // access request is a contact address and is not an identity key.
  let userRow: typeof usersTable.$inferSelect | undefined;
  if (reqRow.userId) {
    [userRow] = await tx
      .select()
      .from(usersTable)
      .where(eq(usersTable.id, reqRow.userId));
  }
  if (!userRow) {
    [userRow] = await tx
      .select()
      .from(usersTable)
      .where(eq(usersTable.email, reqRow.email));
  }

  if (userRow) {
    // Never downgrade an elevated account that happens to match by email.
    const nextRole =
      userRow.role === "admin" || userRow.role === "coordinator"
        ? userRow.role
        : "student";
    const isSyntheticEmail = (e: string | null | undefined): boolean =>
      !!e && (/@forms\.local$/i.test(e) || /^sso_/i.test(e));
    const nextEmail =
      isSyntheticEmail(userRow.email) && !isSyntheticEmail(reqRow.email)
        ? reqRow.email
        : userRow.email;

    await tx
      .update(usersTable)
      .set({
        role: nextRole,
        email: nextEmail,
        campusId: reqRow.campusId ?? userRow.campusId ?? null,
        niatId: reqRow.niatId ?? userRow.niatId ?? null,
        firstName: userRow.firstName || firstName,
        lastName: userRow.lastName || lastName,
        isActive: true,
        updatedAt: new Date(),
      })
      .where(eq(usersTable.id, userRow.id));
  } else {
    [userRow] = await tx
      .insert(usersTable)
      .values({
        email: reqRow.email,
        role: "student",
        campusId: reqRow.campusId ?? null,
        niatId: reqRow.niatId ?? null,
        firstName,
        lastName,
      })
      .returning();
  }

  const studentId = userRow.formsUserId ?? userRow.id;

  // Upsert the roster row, idempotently. Matching by studentId is important
  // because roster email is not unique and may be a contact address.
  const [existingRoster] = await tx
    .select()
    .from(rosterTable)
    .where(
      or(
        eq(rosterTable.studentId, studentId),
        eq(rosterTable.email, reqRow.email),
      ),
    );

  if (existingRoster) {
    await tx
      .update(rosterTable)
      .set({
        isWhitelisted: true,
        fullName: reqRow.fullName,
        email: reqRow.email,
        campusName: reqRow.campusName,
        campusId: reqRow.campusId ?? existingRoster.campusId ?? null,
        niatId: reqRow.niatId ?? existingRoster.niatId ?? null,
        batchSectionName:
          reqRow.sectionName ?? existingRoster.batchSectionName ?? null,
      })
      .where(eq(rosterTable.id, existingRoster.id));
  } else {
    await tx.insert(rosterTable).values({
      studentId,
      fullName: reqRow.fullName,
      email: reqRow.email,
      campusName: reqRow.campusName,
      campusId: reqRow.campusId ?? null,
      niatId: reqRow.niatId ?? null,
      batchSectionName: reqRow.sectionName ?? null,
      isWhitelisted: true,
    });
  }
}