import type { Request, Response } from "express";
import {
  db,
  programmeConfigTable,
  teamMembersTable,
  teamsTable,
} from "@workspace/db";
import { eq } from "drizzle-orm";

export const LEADS_CONTROL_SECTIONS = [
  "leads",
  "projects",
  "phases",
  "payments",
  "interactions",
] as const;

export type LeadsControlSection = (typeof LEADS_CONTROL_SECTIONS)[number];
export type LeadsControlAction = "add" | "edit" | "delete";
export type LeadsSectionPermissions = Record<LeadsControlAction, boolean>;
export type LeadsControlPermissions = Record<
  LeadsControlSection,
  LeadsSectionPermissions
> & {
  submitForReview: boolean;
};

export const DEFAULT_LEADS_LOCK_MESSAGE =
  "Lead submissions are temporarily paused. You can view your leads and projects, but you cannot make changes or submit for review right now.";

const DEFAULT_SECTION_PERMISSIONS: LeadsSectionPermissions = {
  add: true,
  edit: false,
  delete: false,
};

export const DEFAULT_LEADS_CONTROL_PERMISSIONS: LeadsControlPermissions = {
  leads: { ...DEFAULT_SECTION_PERMISSIONS },
  projects: { ...DEFAULT_SECTION_PERMISSIONS },
  phases: { ...DEFAULT_SECTION_PERMISSIONS },
  payments: { ...DEFAULT_SECTION_PERMISSIONS },
  interactions: { ...DEFAULT_SECTION_PERMISSIONS },
  submitForReview: true,
};

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export function normalizeLeadsControlPermissions(
  value: unknown,
): LeadsControlPermissions {
  const raw = objectValue(value);
  const normalized = {
    submitForReview:
      typeof raw.submitForReview === "boolean" ? raw.submitForReview : true,
  } as LeadsControlPermissions;

  for (const section of LEADS_CONTROL_SECTIONS) {
    const sectionRaw = objectValue(raw[section]);
    normalized[section] = {
      add: typeof sectionRaw.add === "boolean" ? sectionRaw.add : true,
      edit: typeof sectionRaw.edit === "boolean" ? sectionRaw.edit : false,
      delete:
        typeof sectionRaw.delete === "boolean" ? sectionRaw.delete : false,
    };
  }
  return normalized;
}

/**
 * Only the team leader runs the Leads pipeline.
 *
 * One person owning the client record is what stops four teammates each
 * capturing the same shop, and it makes the trail attributable — a reviewer
 * looking at a lead knows exactly who to ask about it. Members keep full READ
 * access to everything their team has done; this gates writes only.
 *
 * Staff are exempt: admins bypass every control already, and a coordinator is
 * on no team, so a leader test would lock them out of leads they must manage.
 */
export async function isLeadsWriter(req: Request): Promise<boolean> {
  if (!req.isAuthenticated?.() || !req.user) return false;
  if (req.user.role === "admin" || req.user.role === "coordinator") return true;

  const [membership] = await db
    .select({ teamId: teamMembersTable.teamId })
    .from(teamMembersTable)
    .where(eq(teamMembersTable.userId, req.user.id))
    .limit(1);
  if (!membership) return false;

  const [team] = await db
    .select({ leaderId: teamsTable.leaderId })
    .from(teamsTable)
    .where(eq(teamsTable.id, membership.teamId))
    .limit(1);
  return team?.leaderId === req.user.id;
}

export const LEADS_MEMBER_READ_ONLY_MESSAGE =
  "Only your team leader can add or change leads. You can see everything your team has captured.";

/** 403 body shared by every leader-only refusal, so the client can detect it. */
function refuseNonLeader(
  res: Response,
  section: string,
  action: string,
): false {
  res.status(403).json({
    error: LEADS_MEMBER_READ_ONLY_MESSAGE,
    code: "LEADS_LEADER_ONLY",
    section,
    action,
  });
  return false;
}

export type LeadsControlState = {
  locked: boolean;
  message: string;
  permissions: LeadsControlPermissions;
  seasonId: number;
};

export async function getLeadsControlState(
  seasonId: number,
): Promise<LeadsControlState> {
  const [row] = await db
    .select({
      locked: programmeConfigTable.leadsSubmissionsLocked,
      message: programmeConfigTable.leadsSubmissionsLockMessage,
      permissions: programmeConfigTable.leadsControlPermissions,
    })
    .from(programmeConfigTable)
    .where(eq(programmeConfigTable.seasonId, seasonId))
    .limit(1);

  return {
    locked: row?.locked ?? false,
    message: row?.message?.trim() || DEFAULT_LEADS_LOCK_MESSAGE,
    permissions: normalizeLeadsControlPermissions(row?.permissions),
    seasonId,
  };
}

/**
 * Enforce Leads controls on the server. Admin is the only bypass; coordinators
 * follow the same switches as students, as configured by the programme owner.
 */
export async function allowLeadsAction(
  req: Request,
  res: Response,
  seasonId: number,
  section: LeadsControlSection,
  action: LeadsControlAction,
): Promise<boolean> {
  if (req.user?.role === "admin") return true;
  if (!(await isLeadsWriter(req))) return refuseNonLeader(res, section, action);
  const state = await getLeadsControlState(seasonId);
  if (state.locked) {
    res.status(403).json({
      error: state.message,
      code: "LEADS_LOCKED",
      section,
      action,
    });
    return false;
  }
  if (!state.permissions[section][action]) {
    res.status(403).json({
      error: `${action[0]?.toUpperCase()}${action.slice(1)} access for ${section} is currently disabled by an administrator.`,
      code: "LEADS_ACTION_DISABLED",
      section,
      action,
    });
    return false;
  }
  return true;
}

export async function allowLeadsSubmit(
  req: Request,
  res: Response,
  seasonId: number,
): Promise<boolean> {
  if (req.user?.role === "admin") return true;
  if (!(await isLeadsWriter(req)))
    return refuseNonLeader(res, "submitForReview", "submit");
  const state = await getLeadsControlState(seasonId);
  if (state.locked) {
    res.status(403).json({
      error: state.message,
      code: "LEADS_LOCKED",
      section: "submitForReview",
      action: "submit",
    });
    return false;
  }
  if (!state.permissions.submitForReview) {
    res.status(403).json({
      error: "Submitting Leads projects for review is currently disabled by an administrator.",
      code: "LEADS_ACTION_DISABLED",
      section: "submitForReview",
      action: "submit",
    });
    return false;
  }
  return true;
}