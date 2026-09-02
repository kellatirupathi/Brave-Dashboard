/**
 * Pipeline gate mode: read for everyone signed in, write for admins with
 * Config edit rights (additive, isolated).
 *
 *   GET /pipeline/gates          → { enforced, seasonId }
 *   PUT /admin/pipeline/gates    { enforced } → { enforced, seasonId }
 *
 * Deleting this file means removing its mount in routes/index.ts and the
 * PipelineGatesCard on the admin Config page.
 */
import { Router, type IRouter, type Request, type Response } from "express";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db, programmeConfigTable } from "@workspace/db";
import { resolveSeason } from "../lib/season";
import { requireAdminPage } from "../lib/require-admin-page";
import { logAudit } from "../lib/audit";
import {
  areGatesEnforced,
  invalidatePipelineGatesCache,
} from "../lib/pipeline-gates";

const router: IRouter = Router();

router.get(
  "/pipeline/gates",
  async (req: Request, res: Response): Promise<void> => {
    if (!req.isAuthenticated()) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    const seasonId = await resolveSeason(req);
    res.json({ enforced: await areGatesEnforced(seasonId), seasonId });
  },
);

const UpdateBody = z.object({ enforced: z.boolean() });

router.put(
  "/admin/pipeline/gates",
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
    await db
      .update(programmeConfigTable)
      .set({ pipelineGatesEnforced: parsed.data.enforced })
      .where(eq(programmeConfigTable.id, row.id));
    invalidatePipelineGatesCache(seasonId);
    await logAudit(
      req.user.id,
      "update_pipeline_gates",
      "programme_config",
      row.id,
      parsed.data.enforced
        ? "pipeline gates set to enforced (blocking)"
        : "pipeline gates set to advisory (optional)",
    );
    res.json({ enforced: parsed.data.enforced, seasonId });
  },
);

export default router;
