/**
 * Leaderboard display config (additive, isolated — bypasses Orval codegen).
 *
 * Two admin-controlled settings surfaced on the student Leaderboard page:
 *  - hideRankForStudents: when true, students see revenue but NOT rank
 *    (the 1/2/3 medals + rank numbers). Admins & coordinators always see rank.
 *  - imageUrl: an optional banner image shown at the top of the leaderboard
 *    (e.g. the finalised leaderboard graphic).
 *
 * Stored on the singleton programme_config row (added columns).
 */
import { Router, type IRouter, type Request, type Response } from "express";
import { z } from "zod";
import { db, programmeConfigTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAdminPage } from "../lib/require-admin-page";
import { logAudit } from "../lib/audit";

const router: IRouter = Router();

const BannerContent = z.object({
  eyebrow: z.string().max(120),
  title: z.string().max(120),
  subtitle: z.string().max(300),
  timeText: z.string().max(160),
  chip1: z.string().max(80),
  chip2: z.string().max(80),
});

const UpdateBody = z.object({
  hideRankForStudents: z.boolean().optional(),
  imageUrl: z.string().max(2000).nullable().optional(),
  bannerSource: z.enum(["image", "template"]).optional(),
  bannerTemplate: z
    .enum(["broadcast", "podium", "spotlight", "ribbon"])
    .optional(),
  bannerContent: BannerContent.nullable().optional(),
});

async function getConfigRow() {
  let [row] = await db.select().from(programmeConfigTable).limit(1);
  if (!row) {
    [row] = await db.insert(programmeConfigTable).values({}).returning();
  }
  return row;
}

function serialize(row: typeof programmeConfigTable.$inferSelect) {
  return {
    hideRankForStudents: row.hideLeaderboardRankForStudents,
    imageUrl: (row.leaderboardImageUrl ?? "").trim() || null,
    bannerSource:
      (row.leaderboardBannerSource as "image" | "template") ?? "image",
    bannerTemplate:
      (row.leaderboardBannerTemplate as
        | "broadcast"
        | "podium"
        | "spotlight"
        | "ribbon") ?? "broadcast",
    bannerContent:
      (row.leaderboardBannerContent as Record<string, string> | null) ?? null,
  };
}

// Readable by any authenticated user — the leaderboard page uses this to hide
// rank and show the banner image.
router.get(
  "/leaderboard-config",
  async (req: Request, res: Response): Promise<void> => {
    if (!req.isAuthenticated()) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    const row = await getConfigRow();
    res.json(serialize(row));
  },
);

router.put(
  "/admin/leaderboard-config",
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
    const row = await getConfigRow();
    const patch: Record<string, unknown> = {};
    if (parsed.data.hideRankForStudents !== undefined) {
      patch.hideLeaderboardRankForStudents = parsed.data.hideRankForStudents;
    }
    if (parsed.data.imageUrl !== undefined) {
      const trimmed = (parsed.data.imageUrl ?? "").trim();
      patch.leaderboardImageUrl = trimmed || null;
    }
    if (parsed.data.bannerSource !== undefined) {
      patch.leaderboardBannerSource = parsed.data.bannerSource;
    }
    if (parsed.data.bannerTemplate !== undefined) {
      patch.leaderboardBannerTemplate = parsed.data.bannerTemplate;
    }
    if (parsed.data.bannerContent !== undefined) {
      patch.leaderboardBannerContent = parsed.data.bannerContent;
    }
    const [updated] = await db
      .update(programmeConfigTable)
      .set(patch)
      .where(eq(programmeConfigTable.id, row.id))
      .returning();
    await logAudit(
      req.user.id,
      "update_leaderboard_config",
      "programme_config",
      row.id,
      updated.hideLeaderboardRankForStudents
        ? "rank hidden for students"
        : "rank visible to students",
    );
    res.json(serialize(updated));
  },
);

export default router;
