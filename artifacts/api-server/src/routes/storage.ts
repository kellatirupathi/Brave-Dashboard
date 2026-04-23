import { Router, type IRouter, type Request, type Response } from "express";
import { Readable } from "stream";
import { eq, or } from "drizzle-orm";
import {
  RequestUploadUrlBody,
  RequestUploadUrlResponse,
} from "@workspace/api-zod";
import {
  db,
  revenueEntriesTable,
  orderBookEntriesTable,
  demoDayApplicationsTable,
  teamsTable,
  milestonesTable,
  teamMembersTable,
} from "@workspace/db";
import { ObjectStorageService, ObjectNotFoundError } from "../lib/objectStorage";

const router: IRouter = Router();
const objectStorageService = new ObjectStorageService();

router.post("/storage/uploads/request-url", async (req: Request, res: Response) => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const parsed = RequestUploadUrlBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Missing or invalid required fields" });
    return;
  }

  try {
    const { name, size, contentType } = parsed.data;

    const uploadURL = await objectStorageService.getObjectEntityUploadURL();
    const objectPath = objectStorageService.normalizeObjectEntityPath(uploadURL);

    res.json(
      RequestUploadUrlResponse.parse({
        uploadURL,
        objectPath,
        metadata: { name, size, contentType },
      }),
    );
  } catch (error) {
    req.log.error({ err: error }, "Error generating upload URL");
    res.status(500).json({ error: "Failed to generate upload URL" });
  }
});

router.get("/storage/public-objects/*filePath", async (req: Request, res: Response) => {
  try {
    const raw = req.params.filePath;
    const filePath = Array.isArray(raw) ? raw.join("/") : raw;
    const file = await objectStorageService.searchPublicObject(filePath);
    if (!file) {
      res.status(404).json({ error: "File not found" });
      return;
    }

    const downloadFlag = req.query.download;
    const isDownload =
      downloadFlag === "1" || downloadFlag === "true" || downloadFlag === "";
    const filenameParam = req.query.filename;
    const filename =
      typeof filenameParam === "string" && filenameParam.length > 0
        ? filenameParam
        : undefined;

    const response = await objectStorageService.downloadObject(file, 3600, {
      disposition: isDownload ? "attachment" : "inline",
      filename,
    });

    res.status(response.status);
    response.headers.forEach((value, key) => res.setHeader(key, value));

    if (response.body) {
      const nodeStream = Readable.fromWeb(response.body as ReadableStream<Uint8Array>);
      nodeStream.pipe(res);
    } else {
      res.end();
    }
  } catch (error) {
    req.log.error({ err: error }, "Error serving public object");
    res.status(500).json({ error: "Failed to serve public object" });
  }
});

/**
 * Find the team that owns a given object path by checking the database
 * columns where uploaded document URLs are stored. Returns null if the
 * object is not referenced anywhere — in that case, the object is treated
 * as orphaned and access is denied (404) for non-admins.
 *
 * IMPORTANT: when a new column is added that stores a `/objects/...`
 * URL (e.g. a new document field on a future entity), register it
 * here. Otherwise legitimate users will silently get 404 when trying
 * to download those files.
 */
async function findOwningTeamId(objectPath: string): Promise<number | null> {
  const [revenue] = await db
    .select({ teamId: revenueEntriesTable.teamId })
    .from(revenueEntriesTable)
    .where(
      or(
        eq(revenueEntriesTable.brdUrl, objectPath),
        eq(revenueEntriesTable.testimonialUrl, objectPath),
      ),
    )
    .limit(1);
  if (revenue) return revenue.teamId;

  const [ob] = await db
    .select({ teamId: orderBookEntriesTable.teamId })
    .from(orderBookEntriesTable)
    .where(eq(orderBookEntriesTable.supportingDocUrl, objectPath))
    .limit(1);
  if (ob) return ob.teamId;

  const [demo] = await db
    .select({ teamId: demoDayApplicationsTable.teamId })
    .from(demoDayApplicationsTable)
    .where(eq(demoDayApplicationsTable.pitchDeckUrl, objectPath))
    .limit(1);
  if (demo) return demo.teamId;

  const [team] = await db
    .select({ teamId: teamsTable.id })
    .from(teamsTable)
    .where(eq(teamsTable.photoUrl, objectPath))
    .limit(1);
  if (team) return team.teamId;

  const [milestone] = await db
    .select({ teamId: milestonesTable.teamId })
    .from(milestonesTable)
    .where(eq(milestonesTable.imageUrl, objectPath))
    .limit(1);
  if (milestone) return milestone.teamId;

  return null;
}

async function userCanAccessTeamDocument(
  user: Express.User,
  teamId: number,
): Promise<boolean> {
  if (user.role === "admin") return true;

  const [team] = await db
    .select({ campusId: teamsTable.campusId })
    .from(teamsTable)
    .where(eq(teamsTable.id, teamId))
    .limit(1);
  if (!team) return false;

  if (user.role === "coordinator" && user.campusId === team.campusId) {
    return true;
  }

  const [membership] = await db
    .select({ teamId: teamMembersTable.teamId })
    .from(teamMembersTable)
    .where(eq(teamMembersTable.userId, user.id))
    .limit(1);

  return membership?.teamId === teamId;
}

router.get("/storage/objects/*path", async (req: Request, res: Response) => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  try {
    const raw = req.params.path;
    const wildcardPath = Array.isArray(raw) ? raw.join("/") : raw;
    const objectPath = `/objects/${wildcardPath}`;
    const objectFile = await objectStorageService.getObjectEntityFile(objectPath);

    const owningTeamId = await findOwningTeamId(objectPath);
    if (owningTeamId === null) {
      if (req.user.role !== "admin") {
        res.status(404).json({ error: "Object not found" });
        return;
      }
    } else {
      const allowed = await userCanAccessTeamDocument(req.user, owningTeamId);
      if (!allowed) {
        res.status(403).json({ error: "Forbidden" });
        return;
      }
    }

    const downloadFlag = req.query.download;
    const isDownload =
      downloadFlag === "1" || downloadFlag === "true" || downloadFlag === "";
    const filenameParam = req.query.filename;
    const filename =
      typeof filenameParam === "string" && filenameParam.length > 0
        ? filenameParam
        : undefined;

    const response = await objectStorageService.downloadObject(objectFile, 3600, {
      disposition: isDownload ? "attachment" : "inline",
      filename,
    });

    res.status(response.status);
    response.headers.forEach((value, key) => res.setHeader(key, value));

    if (response.body) {
      const nodeStream = Readable.fromWeb(response.body as ReadableStream<Uint8Array>);
      nodeStream.pipe(res);
    } else {
      res.end();
    }
  } catch (error) {
    if (error instanceof ObjectNotFoundError) {
      req.log.warn({ err: error }, "Object not found");
      res.status(404).json({ error: "Object not found" });
      return;
    }
    req.log.error({ err: error }, "Error serving object");
    res.status(500).json({ error: "Failed to serve object" });
  }
});

export default router;
