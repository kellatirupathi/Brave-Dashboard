/**
 * What a student may do with support tickets (additive, isolated).
 *
 * Deliberately the same shape as lib/leads-control.ts — one jsonb map on
 * programme_config, admin-editable, with server-side defaults when it is
 * absent. Two controls that look the same to an admin should work the same
 * way underneath.
 *
 * DEFAULTS ARE add + view. A ticket is a record of what someone asked and what
 * they were told; letting a student rewrite it after staff have acted would
 * change the history a resolution was written against. Edit and delete exist
 * for the cases an admin decides otherwise, and are off until they do.
 *
 * Staff are not governed by this map at all — it describes the student side.
 */
import type { Request } from "express";
import { eq } from "drizzle-orm";
import { db, programmeConfigTable } from "@workspace/db";
import { resolveSeason } from "./season";
import { logger } from "./logger";

export const TICKETS_CONTROL_ACTIONS = [
  "add",
  "view",
  "edit",
  "delete",
] as const;

export type TicketsControlAction = (typeof TICKETS_CONTROL_ACTIONS)[number];
export type TicketsControlPermissions = Record<TicketsControlAction, boolean>;

export const DEFAULT_TICKETS_CONTROL_PERMISSIONS: TicketsControlPermissions = {
  add: true,
  view: true,
  edit: false,
  delete: false,
};

/**
 * Coerce whatever is stored into a complete permission map.
 *
 * A partial or hand-edited row must not turn into `undefined` at a call site,
 * so every action falls back to its default individually rather than the whole
 * map being discarded.
 */
export function normalizeTicketsControlPermissions(
  raw: unknown,
): TicketsControlPermissions {
  const out = { ...DEFAULT_TICKETS_CONTROL_PERMISSIONS };
  if (!raw || typeof raw !== "object") return out;
  const map = raw as Record<string, unknown>;
  for (const action of TICKETS_CONTROL_ACTIONS) {
    if (typeof map[action] === "boolean") out[action] = map[action] as boolean;
  }
  return out;
}

export type TicketsControlState = {
  permissions: TicketsControlPermissions;
  /** Whether students see the Ticket Support entry at all. */
  menuEnabled: boolean;
};

/**
 * Read the current controls for the caller's season.
 *
 * FAILS OPEN to the defaults: an unreadable config row must not stop a student
 * raising a ticket, which is the same posture the rest of the config helpers
 * take.
 */
export async function getTicketsControlState(
  req: Request,
): Promise<TicketsControlState> {
  try {
    const season = await resolveSeason(req);
    const [row] = await db
      .select({
        permissions: programmeConfigTable.ticketsControlPermissions,
        menuEnabled: programmeConfigTable.ticketsMenuEnabled,
      })
      .from(programmeConfigTable)
      .where(eq(programmeConfigTable.seasonId, season))
      .limit(1);
    return {
      permissions: normalizeTicketsControlPermissions(row?.permissions),
      menuEnabled: row?.menuEnabled ?? false,
    };
  } catch (err) {
    logger.error({ err }, "[tickets-control] failed to read config");
    return {
      permissions: { ...DEFAULT_TICKETS_CONTROL_PERMISSIONS },
      menuEnabled: false,
    };
  }
}

/** True when staff — staff are never governed by the student controls. */
export function isTicketsStaff(req: Request): boolean {
  return req.user?.role === "admin" || req.user?.role === "coordinator";
}

/**
 * Whether this caller may perform `action`. Staff always may; a student is
 * governed by the season's map.
 */
export async function allowTicketAction(
  req: Request,
  action: TicketsControlAction,
): Promise<boolean> {
  if (isTicketsStaff(req)) return true;
  const { permissions } = await getTicketsControlState(req);
  return permissions[action];
}
