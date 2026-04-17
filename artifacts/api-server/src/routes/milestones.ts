import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, milestonesTable } from "@workspace/db";
import {
  ListMilestonesQueryParams,
  CreateMilestoneBody,
  UpdateMilestoneParams,
  UpdateMilestoneBody,
} from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/milestones", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const queryParams = ListMilestonesQueryParams.safeParse(req.query);
  if (!queryParams.success) {
    res.status(400).json({ error: queryParams.error.message });
    return;
  }
  const milestones = await db
    .select()
    .from(milestonesTable)
    .where(eq(milestonesTable.teamId, queryParams.data.teamId))
    .orderBy(milestonesTable.date);
  res.json(milestones);
});

router.post("/milestones", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const parsed = CreateMilestoneBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const dateVal = typeof parsed.data.date === "string" ? new Date(parsed.data.date) : (parsed.data.date as Date);
  const [milestone] = await db
    .insert(milestonesTable)
    .values({ ...parsed.data, date: dateVal, type: "manual", isPinned: false })
    .returning();
  res.status(201).json(milestone);
});

router.patch("/milestones/:id", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const params = UpdateMilestoneParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = UpdateMilestoneBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [milestone] = await db
    .update(milestonesTable)
    .set(parsed.data)
    .where(eq(milestonesTable.id, params.data.id))
    .returning();
  if (!milestone) {
    res.status(404).json({ error: "Milestone not found" });
    return;
  }
  res.json(milestone);
});

export default router;
