import { Router, type IRouter } from "express";
import { getConfig, resolveSeason } from "../lib/season";

const router: IRouter = Router();

/**
 * Public configuration for the BRAVE app installation page.
 *
 * Only the two values needed by /get-app are exposed. The full programme
 * configuration remains behind the authenticated admin endpoint.
 */
router.get("/public/app-config", async (req, res): Promise<void> => {
  const config = await getConfig(await resolveSeason(req));
  res.json({
    braveAppDownloadUrl: config.braveAppDownloadUrl ?? null,
    braveAppQrObjectPath: config.braveAppQrObjectPath ?? null,
  });
});

export default router;