import { Router, type IRouter, type Request, type Response } from "express";
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const router: IRouter = Router();

// Current Terms & Conditions version. Bump this string if the T&C text
// changes and acceptance needs to be re-collected.
export const CURRENT_TERMS_VERSION = "2026-v1";

// POST /terms/accept — records that the logged-in user has accepted the
// Terms & Conditions. Idempotent: re-accepting simply re-stamps the timestamp
// and version. Returns { ok, termsAcceptedAt }.
router.post("/terms/accept", async (req: Request, res: Response) => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  try {
    const acceptedAt = new Date();
    await db
      .update(usersTable)
      .set({
        termsAcceptedAt: acceptedAt,
        termsVersion: CURRENT_TERMS_VERSION,
        updatedAt: acceptedAt,
      })
      .where(eq(usersTable.id, req.user.id));
    res.json({ ok: true, termsAcceptedAt: acceptedAt.toISOString() });
  } catch (err) {
    req.log.error({ err }, "POST /terms/accept failed");
    res.status(500).json({ error: "Failed to record terms acceptance" });
  }
});

export default router;
