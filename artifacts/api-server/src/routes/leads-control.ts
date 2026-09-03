import { Router, type IRouter, type Request, type Response } from "express";
import { z } from "zod";
import { db, programmeConfigTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { resolveSeason } from "../lib/season";
import { requireAdminPage } from "../lib/require-admin-page";
import { logAudit } from "../lib/audit";
import {
  getLeadsControlState,
  isLeadsWriter,
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
    // isLeadsWriter rides along so the UI can hide write controls a member
    // would only be refused on. The server refuses regardless.
    const [state, canWrite] = await Promise.all([
      getLeadsControlState(await resolveSeason(req)),
      isLeadsWriter(req),
    ]);
    res.json({ ...state, isLeadsWriter: canWrite });
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
    res.json(await getLeadsControlState(seasonId));
  },
);

export default router;