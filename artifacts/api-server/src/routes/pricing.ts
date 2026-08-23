/**
 * Pricing categories — the published price bands and their recognition caps.
 *
 * ISOLATION: additive. Deleting the feature means removing
 * `router.use(pricingRouter)` in routes/index.ts plus its import.
 *
 * WHY CAPS EXIST: a team can charge a friend anything they like. What the
 * programme RECOGNISES towards the leaderboard is bounded by what that kind of
 * work is plausibly worth. The claim itself is always recorded in full — see
 * lib/trust-score.ts computeRecognition().
 *
 * Season-scoped so Season 2's catalogue can never retroactively cap Season 1.
 */
import { Router, type IRouter, type Request, type Response } from "express";
import { z } from "zod";
import { and, asc, eq } from "drizzle-orm";
import { db, pricingCategoriesTable } from "@workspace/db";
import { requireAdminPage } from "../lib/require-admin-page";
import { resolveSeason } from "../lib/season";
import { logger } from "../lib/logger";

const router: IRouter = Router();

/**
 * Readable by any signed-in user: students need the bands to price their work,
 * and a cap nobody can see before they quote is a trap rather than a rule.
 */
router.get(
  "/pricing-categories",
  async (req: Request, res: Response): Promise<void> => {
    if (!req.isAuthenticated()) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    const season = await resolveSeason(req);
    const isStaff =
      req.user.role === "admin" || req.user.role === "coordinator";

    const rows = await db
      .select()
      .from(pricingCategoriesTable)
      .where(
        isStaff
          ? eq(pricingCategoriesTable.seasonId, season)
          : and(
              eq(pricingCategoriesTable.seasonId, season),
              // Students only see live categories; a retired one would just be
              // a dead option in a dropdown.
              eq(pricingCategoriesTable.isActive, true),
            ),
      )
      .orderBy(asc(pricingCategoriesTable.name));

    res.json(rows);
  },
);

const CategoryBody = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(1000).optional(),
  typicalMin: z.number().int().min(0).max(100_000_000).optional(),
  typicalMax: z.number().int().min(0).max(100_000_000).optional(),
  // Explicit null clears the cap, making the category uncapped again. Omitting
  // the field on a PATCH leaves it as it was — the two are not the same thing.
  recognitionCap: z.number().int().min(0).max(100_000_000).nullable().optional(),
  isActive: z.boolean().optional(),
});

function validateBand(
  d: z.infer<typeof CategoryBody>,
  res: Response,
): boolean {
  if (
    d.typicalMin != null &&
    d.typicalMax != null &&
    d.typicalMin > d.typicalMax
  ) {
    res.status(400).json({ error: "The minimum cannot exceed the maximum." });
    return false;
  }
  // A cap below the guidance band would advertise a price the programme then
  // refuses to recognise, which is worse than having no guidance at all.
  if (
    d.recognitionCap != null &&
    d.typicalMin != null &&
    d.recognitionCap < d.typicalMin
  ) {
    res.status(400).json({
      error:
        "The recognition cap is below the guidance minimum. Students would be told to charge more than you will recognise.",
    });
    return false;
  }
  return true;
}

router.post(
  "/admin/pricing-categories",
  requireAdminPage("/admin/config", "edit"),
  async (req: Request, res: Response): Promise<void> => {
    if (!req.isAuthenticated() || req.user.role !== "admin") {
      res.status(403).json({ error: "Admins only" });
      return;
    }
    const parsed = CategoryBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    if (!validateBand(parsed.data, res)) return;
    const season = await resolveSeason(req);

    try {
      const [created] = await db
        .insert(pricingCategoriesTable)
        .values({
          seasonId: season,
          name: parsed.data.name,
          description: parsed.data.description ?? null,
          typicalMin: parsed.data.typicalMin ?? null,
          typicalMax: parsed.data.typicalMax ?? null,
          recognitionCap: parsed.data.recognitionCap ?? null,
          isActive: parsed.data.isActive ?? true,
        })
        .returning();
      res.status(201).json(created);
    } catch (err) {
      if ((err as { code?: string })?.code === "23505") {
        res.status(409).json({
          error: "A category with that name already exists this season.",
        });
        return;
      }
      logger.error({ err }, "[pricing] create failed");
      res.status(500).json({ error: "Could not create the category." });
    }
  },
);

router.patch(
  "/admin/pricing-categories/:id",
  requireAdminPage("/admin/config", "edit"),
  async (req: Request, res: Response): Promise<void> => {
    if (!req.isAuthenticated() || req.user.role !== "admin") {
      res.status(403).json({ error: "Admins only" });
      return;
    }
    const id = Number(req.params["id"]);
    if (!Number.isInteger(id) || id <= 0) {
      res.status(400).json({ error: "Invalid category id" });
      return;
    }
    const parsed = CategoryBody.partial().safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }

    const [existing] = await db
      .select()
      .from(pricingCategoriesTable)
      .where(eq(pricingCategoriesTable.id, id))
      .limit(1);
    if (!existing) {
      res.status(404).json({ error: "Category not found" });
      return;
    }

    // Validate the MERGED shape, not just the patch — a lone cap change must
    // still be checked against the band already stored.
    const merged = {
      name: parsed.data.name ?? existing.name,
      typicalMin: parsed.data.typicalMin ?? existing.typicalMin ?? undefined,
      typicalMax: parsed.data.typicalMax ?? existing.typicalMax ?? undefined,
      recognitionCap:
        parsed.data.recognitionCap !== undefined
          ? parsed.data.recognitionCap
          : (existing.recognitionCap ?? undefined),
    };
    if (!validateBand(merged, res)) return;

    try {
      const [updated] = await db
        .update(pricingCategoriesTable)
        .set({
          ...(parsed.data.name !== undefined ? { name: parsed.data.name } : {}),
          ...(parsed.data.description !== undefined
            ? { description: parsed.data.description }
            : {}),
          ...(parsed.data.typicalMin !== undefined
            ? { typicalMin: parsed.data.typicalMin }
            : {}),
          ...(parsed.data.typicalMax !== undefined
            ? { typicalMax: parsed.data.typicalMax }
            : {}),
          ...(parsed.data.recognitionCap !== undefined
            ? { recognitionCap: parsed.data.recognitionCap }
            : {}),
          ...(parsed.data.isActive !== undefined
            ? { isActive: parsed.data.isActive }
            : {}),
        })
        .where(eq(pricingCategoriesTable.id, id))
        .returning();
      res.json(updated);
    } catch (err) {
      if ((err as { code?: string })?.code === "23505") {
        res.status(409).json({
          error: "A category with that name already exists this season.",
        });
        return;
      }
      logger.error({ err, id }, "[pricing] update failed");
      res.status(500).json({ error: "Could not update the category." });
    }
  },
);

/**
 * Retire a category. Deliberately a soft delete: submitted entries reference
 * pricing_category_id, and removing the row would orphan the explanation of why
 * a past claim was capped. Retiring hides it from students and leaves history
 * intact.
 */
router.post(
  "/admin/pricing-categories/:id/retire",
  requireAdminPage("/admin/config", "edit"),
  async (req: Request, res: Response): Promise<void> => {
    if (!req.isAuthenticated() || req.user.role !== "admin") {
      res.status(403).json({ error: "Admins only" });
      return;
    }
    const id = Number(req.params["id"]);
    if (!Number.isInteger(id) || id <= 0) {
      res.status(400).json({ error: "Invalid category id" });
      return;
    }
    const [updated] = await db
      .update(pricingCategoriesTable)
      .set({ isActive: false })
      .where(eq(pricingCategoriesTable.id, id))
      .returning();
    if (!updated) {
      res.status(404).json({ error: "Category not found" });
      return;
    }
    res.json(updated);
  },
);

export default router;
