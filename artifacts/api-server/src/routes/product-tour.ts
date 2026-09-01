import { Router, type IRouter } from "express";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db, productTourProgressTable } from "@workspace/db";

const router: IRouter = Router();

const platformSchema = z.enum(["mobile", "desktop"]);
const updateSchema = z.object({
  platform: platformSchema,
  status: z.enum(["finished", "dismissed"]),
});

router.get("/product-tour", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  if (req.user.role !== "student") {
    res.status(403).json({ error: "Student access required" });
    return;
  }

  const parsed = platformSchema.safeParse(req.query.platform);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid platform" });
    return;
  }

  const [progress] = await db
    .select({
      status: productTourProgressTable.status,
      completedAt: productTourProgressTable.completedAt,
    })
    .from(productTourProgressTable)
    .where(
      and(
        eq(productTourProgressTable.userId, req.user.id),
        eq(productTourProgressTable.platform, parsed.data),
      ),
    )
    .limit(1);

  res.json(
    progress
      ? {
          status: progress.status,
          completedAt: progress.completedAt.toISOString(),
        }
      : { status: "unseen", completedAt: null },
  );
});

router.post("/product-tour", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  if (req.user.role !== "student") {
    res.status(403).json({ error: "Student access required" });
    return;
  }

  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const now = new Date();
  const [progress] = await db
    .insert(productTourProgressTable)
    .values({
      userId: req.user.id,
      platform: parsed.data.platform,
      status: parsed.data.status,
      completedAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [
        productTourProgressTable.userId,
        productTourProgressTable.platform,
      ],
      set: {
        status: parsed.data.status,
        completedAt: now,
        updatedAt: now,
      },
    })
    .returning({
      status: productTourProgressTable.status,
      completedAt: productTourProgressTable.completedAt,
    });

  res.json({
    status: progress.status,
    completedAt: progress.completedAt.toISOString(),
  });
});

export default router;