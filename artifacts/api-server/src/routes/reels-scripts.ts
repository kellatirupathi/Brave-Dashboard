/**
 * Admin Reel Scripts library (additive, isolated; hand-written, bypasses Orval).
 *
 *   GET  /admin/reels-scripts?search=&bucket=   list (newest first) + buckets
 *   POST /admin/reels-scripts/import            bulk import { rows:[{bucket,script}] }
 *
 * Reads/writes the reel_scripts table. The daily Gemini cron
 * (POST /internal/cron/generate-reels) appends to the same table.
 */
import { Router, type IRouter, type Request, type Response } from "express";
import { z } from "zod";
import { db, reelScriptsTable } from "@workspace/db";
import { and, desc, eq, ilike, or } from "drizzle-orm";
import { logger } from "../lib/logger";
import { reelDedupeKey } from "../lib/ai/generate-reels";

const router: IRouter = Router();

function requireAdmin(req: Request, res: Response): boolean {
  if (!req.isAuthenticated() || req.user.role !== "admin") {
    res.status(403).json({ error: "Forbidden" });
    return false;
  }
  return true;
}

// ── List (newest first) with optional search + bucket filter ────────────────
router.get(
  "/admin/reels-scripts",
  async (req: Request, res: Response): Promise<void> => {
    if (!requireAdmin(req, res)) return;

    const search = String(req.query.search ?? "").trim();
    const bucket = String(req.query.bucket ?? "").trim();

    const conds = [];
    if (bucket && bucket !== "all") {
      conds.push(eq(reelScriptsTable.bucket, bucket));
    }
    if (search) {
      const like = `%${search}%`;
      conds.push(
        or(
          ilike(reelScriptsTable.script, like),
          ilike(reelScriptsTable.bucket, like),
        ),
      );
    }

    const items = await db
      .select({
        id: reelScriptsTable.id,
        bucket: reelScriptsTable.bucket,
        script: reelScriptsTable.script,
        source: reelScriptsTable.source,
        createdAt: reelScriptsTable.createdAt,
      })
      .from(reelScriptsTable)
      .where(conds.length ? and(...conds) : undefined)
      .orderBy(desc(reelScriptsTable.createdAt))
      .limit(5000);

    // Distinct buckets (for the filter dropdown) — independent of the filter.
    const bucketRows = await db
      .selectDistinct({ bucket: reelScriptsTable.bucket })
      .from(reelScriptsTable);
    const buckets = bucketRows
      .map((b) => b.bucket)
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b));

    res.json({ items, buckets });
  },
);

// ── Bulk import (CSV parsed client-side → rows of {bucket, script}) ──────────
const ImportBody = z.object({
  rows: z
    .array(
      z.object({
        bucket: z.string().trim().min(1).max(120),
        script: z.string().trim().min(1).max(5000),
      }),
    )
    .min(1)
    .max(5000),
});

router.post(
  "/admin/reels-scripts/import",
  async (req: Request, res: Response): Promise<void> => {
    if (!requireAdmin(req, res)) return;

    const parsed = ImportBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid import payload" });
      return;
    }

    // Dedupe against everything already stored + within this batch.
    const existing = await db
      .select({ dedupeKey: reelScriptsTable.dedupeKey })
      .from(reelScriptsTable);
    const seen = new Set(
      existing.map((e) => e.dedupeKey).filter((k): k is string => !!k),
    );

    const toInsert: (typeof reelScriptsTable.$inferInsert)[] = [];
    let skipped = 0;
    for (const row of parsed.data.rows) {
      const key = reelDedupeKey(row.script);
      if (seen.has(key)) {
        skipped += 1;
        continue;
      }
      seen.add(key);
      toInsert.push({
        bucket: row.bucket,
        script: row.script,
        source: "imported",
        dedupeKey: key,
      });
    }

    let inserted = 0;
    const CHUNK = 500;
    for (let i = 0; i < toInsert.length; i += CHUNK) {
      const chunk = toInsert.slice(i, i + CHUNK);
      if (chunk.length === 0) continue;
      await db.insert(reelScriptsTable).values(chunk);
      inserted += chunk.length;
    }

    logger.info(
      { inserted, skipped, total: parsed.data.rows.length },
      "[reels] import complete",
    );
    res.json({ inserted, skipped, total: parsed.data.rows.length });
  },
);

export default router;
