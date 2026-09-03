import { Router, type IRouter, type Request, type Response } from "express";
import { z } from "zod";
import {
  db,
  programmeConfigTable,
  teamMembersTable,
  teamsTable,
} from "@workspace/db";
import { eq } from "drizzle-orm";
import { resolveSeason } from "../lib/season";
import { requireAdminPage } from "../lib/require-admin-page";
import { logAudit } from "../lib/audit";
import {
  getLeadsControlState,
  LEADS_CONTROL_SECTIONS,
} from "../lib/leads-control";

const router: IRouter = Router();

const SectionPermissions = z.object({
  add: z.boolean(),
  edit: z.boolean(),
  delete: z.boolean(),
});

const UpdateBody = z.object({
  locked: z.boolean(),
  message: z.string().trim().max(1000).nullable(),
  permissions: z.object({
    leads: SectionPermissions,
    projects: SectionPermissions,
    phases: SectionPermissions,
    payments: SectionPermissions,
    interactions: SectionPermissions,
    submitForReview: z.boolean(),
  }),
});

router.get(
  "/leads-control",
  async (req: Request, res: Response): Promise<void> => {
    if (!req.isAuthenticated()) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    const seasonId = await resolveSeason(req);
    const state = await getLeadsControlState(seasonId);
    if (req.user.role === "admin") {
      res.json({ ...state, canManage: true });
      return;
    }
    const [membership] = await db
      .select({ teamId: teamMembersTable.teamId })
      .from(teamMembersTable)
      .where(eq(teamMembersTable.userId, req.user.id))
      .limit(1);
    if (!membership) {
      res.json({ ...state, canManage: false });
      return;
    }
    const [team] = await db
      .select({ leaderId: teamsTable.leaderId })
      .from(teamsTable)
      .where(eq(teamsTable.id, membership.teamId))
      .limit(1);
    res.json({ ...state, canManage: team?.leaderId === req.user.id });
  },
);

router.put(
  "/admin/leads-control",
  requireAdminPage("/admin/config", "edit"),
  async (req: Request, res: Response): Promise<void> => {
    if (!req.isAuthenticated() || req.user.role !== "admin") {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
    const parsed = UpdateBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const seasonId = await resolveSeason(req);
    const [row] = await db
      .select({ id: programmeConfigTable.id })
      .from(programmeConfigTable)
      .where(eq(programmeConfigTable.seasonId, seasonId))
      .limit(1);
    if (!row) {
      res
        .status(404)
        .json({ error: "No programme configuration for this season yet." });
      return;
    }
    const message = parsed.data.message?.trim() || null;
    await db
      .update(programmeConfigTable)
      .set({
        leadsSubmissionsLocked: parsed.data.locked,
        leadsSubmissionsLockMessage: message,
        leadsControlPermissions: parsed.data.permissions,
      })
      .where(eq(programmeConfigTable.id, row.id));

    await logAudit(
      req.user.id,
      "update_leads_control",
      "programme_config",
      row.id,
      `updated Leads controls (${LEADS_CONTROL_SECTIONS.length} sections; lock ${parsed.data.locked ? "on" : "off"})`,
    );
    res.json({ ...(await getLeadsControlState(seasonId)), canManage: true });
  },
);

export default router;