import { Router, type IRouter } from "express";
import { eq, desc } from "drizzle-orm";
import { db, feedbackTable, usersTable } from "@workspace/db";
import { SubmitFeedbackBody } from "@workspace/api-zod";

const router: IRouter = Router();

router.post("/feedback", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const parsed = SubmitFeedbackBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [created] = await db
    .insert(feedbackTable)
    .values({
      userId: req.user.id,
      rating: parsed.data.rating,
      comments: parsed.data.comments ?? null,
    })
    .returning();
  res.status(201).json(created);
});

router.get("/admin/feedback", async (req, res): Promise<void> => {
  if (!req.isAuthenticated() || req.user.role !== "admin") {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  const rows = await db
    .select({
      id: feedbackTable.id,
      userId: feedbackTable.userId,
      rating: feedbackTable.rating,
      comments: feedbackTable.comments,
      createdAt: feedbackTable.createdAt,
      firstName: usersTable.firstName,
      lastName: usersTable.lastName,
      userEmail: usersTable.email,
      userRole: usersTable.role,
      niatId: usersTable.niatId,
    })
    .from(feedbackTable)
    .leftJoin(usersTable, eq(usersTable.id, feedbackTable.userId))
    .orderBy(desc(feedbackTable.createdAt));

  const result = rows.map((r) => ({
    id: r.id,
    userId: r.userId,
    rating: r.rating,
    comments: r.comments,
    createdAt: r.createdAt,
    userName: `${r.firstName ?? ""} ${r.lastName ?? ""}`.trim() || "Unknown",
    userEmail: r.userEmail ?? "",
    userRole: r.userRole ?? "student",
    niatId: r.niatId ?? null,
  }));
  res.json(result);
});

export default router;
