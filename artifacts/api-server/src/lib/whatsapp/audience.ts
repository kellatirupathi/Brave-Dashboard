/**
 * WhatsApp audience resolution (additive, isolated).
 *
 * Turns an audience selection from the admin UI into a concrete recipient
 * list. Every send goes through here, and the PREVIEW endpoint calls exactly
 * this function — so the count an admin confirms is produced by the same code
 * that later does the sending. A preview computed separately from the send is
 * a preview that eventually lies.
 *
 * WHERE NUMBERS COME FROM
 * - students: roster.mobile_number, matched to the user by niat_id then email.
 *   Roster is the source of truth because that is where admins bulk-import.
 * - coordinators / admins: users.mobile_number. They are not on the roster.
 *
 * A recipient with no usable number is returned as `skipped` rather than
 * dropped, so the admin sees "412 of 480 reachable" instead of a silently
 * smaller number.
 */
import { and, eq, inArray, isNotNull, sql } from "drizzle-orm";
import {
  campusesTable,
  db,
  rosterTable,
  teamMembersTable,
  teamsTable,
  usersTable,
} from "@workspace/db";
import { normaliseWhatsAppNumber } from "./karix";

export type AudienceRole = "student" | "coordinator" | "admin";

/**
 * How the chosen role is narrowed. `all` and `specific` apply to every role;
 * `campus` applies to students and coordinators; `team` only to students.
 */
export type AudienceScope = "all" | "campus" | "team" | "specific";

export type AudienceSelection = {
  role: AudienceRole;
  scope: AudienceScope;
  /** For scope "campus". */
  campusIds?: number[];
  /** For scope "team". */
  teamIds?: number[];
  /** For scope "specific" — user ids. */
  userIds?: string[];
};

export type ResolvedRecipient = {
  userId: string | null;
  name: string;
  email: string | null;
  phone: string | null;
  /** phone normalised to 91XXXXXXXXXX, or null when unusable. */
  normalisedPhone: string | null;
  role: AudienceRole;
  campusId: number | null;
  campusName: string | null;
  teamName: string | null;
};

export type ResolvedAudience = {
  /** Everyone the selection matched, reachable or not. */
  recipients: ResolvedRecipient[];
  total: number;
  /** Those with a usable number — the ones who would actually be messaged. */
  reachable: number;
  /** Matched but unreachable, so the gap is visible rather than silent. */
  skipped: number;
};

function fullName(first: string, last: string, fallback: string): string {
  const n = `${first ?? ""} ${last ?? ""}`.trim();
  return n || fallback;
}

/**
 * Students, with their number looked up from the roster.
 *
 * The roster join is by niat_id first and email second, mirroring how the rest
 * of the app reconciles a user to their roster row. Both are LEFT joins, so a
 * student missing from the roster still appears — as unreachable.
 */
async function resolveStudents(
  sel: AudienceSelection,
): Promise<ResolvedRecipient[]> {
  const conds = [eq(usersTable.role, "student"), eq(usersTable.isActive, true)];

  if (sel.scope === "campus") {
    if (!sel.campusIds?.length) return [];
    conds.push(inArray(usersTable.campusId, sel.campusIds));
  }
  if (sel.scope === "specific") {
    if (!sel.userIds?.length) return [];
    conds.push(inArray(usersTable.id, sel.userIds));
  }
  if (sel.scope === "team") {
    if (!sel.teamIds?.length) return [];
    const members = await db
      .select({ userId: teamMembersTable.userId })
      .from(teamMembersTable)
      .where(inArray(teamMembersTable.teamId, sel.teamIds));
    const ids = members.map((m) => m.userId);
    if (ids.length === 0) return [];
    conds.push(inArray(usersTable.id, ids));
  }

  const rows = await db
    .select({
      id: usersTable.id,
      firstName: usersTable.firstName,
      lastName: usersTable.lastName,
      email: usersTable.email,
      niatId: usersTable.niatId,
      campusId: usersTable.campusId,
      campusName: campusesTable.name,
      userPhone: usersTable.mobileNumber,
      // Roster is the primary source for a student's number; the users column
      // is the fallback for someone added outside the roster import.
      rosterPhoneByNiat: sql<string | null>`(
        SELECT r.mobile_number FROM roster r
        WHERE r.niat_id IS NOT NULL
          AND r.niat_id = ${usersTable.niatId}
          AND r.mobile_number IS NOT NULL
        LIMIT 1
      )`,
      rosterPhoneByEmail: sql<string | null>`(
        SELECT r.mobile_number FROM roster r
        WHERE r.email IS NOT NULL
          AND lower(r.email) = lower(${usersTable.email})
          AND r.mobile_number IS NOT NULL
        LIMIT 1
      )`,
      teamName: teamsTable.name,
    })
    .from(usersTable)
    .leftJoin(campusesTable, eq(campusesTable.id, usersTable.campusId))
    .leftJoin(teamMembersTable, eq(teamMembersTable.userId, usersTable.id))
    .leftJoin(teamsTable, eq(teamsTable.id, teamMembersTable.teamId))
    .where(and(...conds));

  return rows.map((r) => {
    const phone =
      r.rosterPhoneByNiat ?? r.rosterPhoneByEmail ?? r.userPhone ?? null;
    return {
      userId: r.id,
      name: fullName(r.firstName, r.lastName, r.email),
      email: r.email,
      phone,
      normalisedPhone: normaliseWhatsAppNumber(phone),
      role: "student" as const,
      campusId: r.campusId,
      campusName: r.campusName ?? null,
      teamName: r.teamName ?? null,
    };
  });
}

/** Coordinators and admins — numbers come from users.mobile_number only. */
async function resolveStaff(
  sel: AudienceSelection,
): Promise<ResolvedRecipient[]> {
  const conds = [
    eq(usersTable.role, sel.role),
    eq(usersTable.isActive, true),
  ];

  if (sel.scope === "campus") {
    if (!sel.campusIds?.length) return [];
    conds.push(inArray(usersTable.campusId, sel.campusIds));
  }
  if (sel.scope === "specific") {
    if (!sel.userIds?.length) return [];
    conds.push(inArray(usersTable.id, sel.userIds));
  }

  const rows = await db
    .select({
      id: usersTable.id,
      firstName: usersTable.firstName,
      lastName: usersTable.lastName,
      email: usersTable.email,
      campusId: usersTable.campusId,
      campusName: campusesTable.name,
      phone: usersTable.mobileNumber,
    })
    .from(usersTable)
    .leftJoin(campusesTable, eq(campusesTable.id, usersTable.campusId))
    .where(and(...conds));

  return rows.map((r) => ({
    userId: r.id,
    name: fullName(r.firstName, r.lastName, r.email),
    email: r.email,
    phone: r.phone,
    normalisedPhone: normaliseWhatsAppNumber(r.phone),
    role: sel.role,
    campusId: r.campusId,
    campusName: r.campusName ?? null,
    teamName: null,
  }));
}

/**
 * Resolve a selection to its recipients.
 *
 * Deduplicates on user id — the student query LEFT JOINs team_members, so
 * anyone somehow on two teams would otherwise appear twice and be messaged
 * twice.
 */
export async function resolveAudience(
  sel: AudienceSelection,
): Promise<ResolvedAudience> {
  const rows =
    sel.role === "student"
      ? await resolveStudents(sel)
      : await resolveStaff(sel);

  const seen = new Set<string>();
  const recipients: ResolvedRecipient[] = [];
  for (const r of rows) {
    const key = r.userId ?? `${r.email}`;
    if (seen.has(key)) continue;
    seen.add(key);
    recipients.push(r);
  }

  const reachable = recipients.filter((r) => !!r.normalisedPhone).length;
  return {
    recipients,
    total: recipients.length,
    reachable,
    skipped: recipients.length - reachable,
  };
}

/**
 * Validate a selection before it is resolved. Returns an error string, or null
 * when the selection is coherent.
 *
 * Rejecting an empty `specific` list matters: without this check, "send to
 * these specific students" with nothing selected would silently resolve to
 * everyone in some earlier drafts of this logic.
 */
export function validateSelection(sel: AudienceSelection): string | null {
  if (sel.role === "student") {
    if (sel.scope === "campus" && !sel.campusIds?.length)
      return "Choose at least one campus.";
    if (sel.scope === "team" && !sel.teamIds?.length)
      return "Choose at least one team.";
    if (sel.scope === "specific" && !sel.userIds?.length)
      return "Choose at least one student.";
    return null;
  }
  if (sel.scope === "team")
    return "Teams apply to students only.";
  if (sel.scope === "campus") {
    if (sel.role === "admin")
      return "Admins are not campus-scoped — choose All or specific people.";
    if (!sel.campusIds?.length) return "Choose at least one campus.";
  }
  if (sel.scope === "specific" && !sel.userIds?.length)
    return "Choose at least one recipient.";
  return null;
}
