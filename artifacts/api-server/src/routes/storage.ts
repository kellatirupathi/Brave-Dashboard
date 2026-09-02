import { Router, type IRouter, type Request, type Response } from "express";
import { Readable } from "stream";
import { eq, or } from "drizzle-orm";
import { requireWritableSeason } from "../middlewares/seasonGuard";
import {
  RequestUploadUrlBody,
  RequestUploadUrlResponse,
  GetUploadedFileMetadataResponse,
} from "@workspace/api-zod";
import {
  db,
  revenueEntriesTable,
  orderBookEntriesTable,
  demoDayApplicationsTable,
  teamsTable,
  milestonesTable,
  teamMembersTable,
  programmeConfigTable,
  uploadedFilesTable,
} from "@workspace/db";
import {
  ObjectStorageService,
  ObjectNotFoundError,
} from "../lib/objectStorage";

const router: IRouter = Router();
const objectStorageService = new ObjectStorageService();

/**
 * Upload limits enforced by POST /storage/uploads/request-url.
 *
 * Keep in sync with the documented limits in `replit.md`. Adjust here to
 * relax/tighten what the platform will accept before signing an upload URL.
 */
export const MAX_UPLOAD_SIZE_BYTES = 25 * 1024 * 1024; // 25 MB

export const ALLOWED_UPLOAD_MIME_TYPES: readonly string[] = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  // PowerPoint decks — the BRAVE Finale pptx submissions.
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
];

function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${Math.round(bytes / (1024 * 1024))} MB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${bytes} B`;
}

async function getStoredFileMetadata(objectPath: string) {
  const rows = await db
    .select()
    .from(uploadedFilesTable)
    .where(eq(uploadedFilesTable.objectPath, objectPath))
    .limit(1);
  return rows[0] ?? null;
}

/**
 * POST /storage/uploads/request-url
 *
 * Request a presigned URL for file upload.
 * The client sends JSON metadata (name, size, contentType) — NOT the file.
 * Then uploads the file directly to the returned presigned URL.
 *
 * The original filename, size, and content type are persisted alongside the
 * generated object path so downstream viewers/downloads can use the real name
 * instead of the random UUID stored in object storage.
 */
router.post(
  "/storage/uploads/request-url",
  requireWritableSeason(),
  async (req: Request, res: Response) => {
    if (!req.isAuthenticated()) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const parsed = RequestUploadUrlBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Missing or invalid required fields" });
      return;
    }

    const { name, size, contentType } = parsed.data;

    if (!Number.isFinite(size) || size <= 0) {
      res.status(400).json({ error: "File size must be a positive number." });
      return;
    }

    if (size > MAX_UPLOAD_SIZE_BYTES) {
      res.status(413).json({
        error: `File is too large. Maximum allowed size is ${formatBytes(MAX_UPLOAD_SIZE_BYTES)}.`,
      });
      return;
    }

    const normalizedType = contentType.trim().toLowerCase();
    if (!ALLOWED_UPLOAD_MIME_TYPES.includes(normalizedType)) {
      res.status(415).json({
        error: `Unsupported file type "${contentType}". Allowed types: PDF, JPEG, PNG, GIF, WEBP, DOC, DOCX.`,
      });
      return;
    }

    try {
      const uploadURL = await objectStorageService.getObjectEntityUploadURL();
      const objectPath =
        objectStorageService.normalizeObjectEntityPath(uploadURL);

      try {
        await db
          .insert(uploadedFilesTable)
          .values({
            objectPath,
            filename: name,
            size,
            contentType,
            uploadedById: req.user?.id ?? null,
          })
          .onConflictDoUpdate({
            target: uploadedFilesTable.objectPath,
            set: {
              filename: name,
              size,
              contentType,
              uploadedById: req.user?.id ?? null,
            },
          });
      } catch (err) {
        // Don't fail the upload request just because the metadata insert failed;
        // the upload itself can still succeed and the viewer will fall back to
        // generic labels.
        req.log.warn(
          { err, objectPath },
          "Failed to record uploaded file metadata",
        );
      }

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
  },
);

/**
 * GET /storage/uploads/metadata?path=/objects/<id>
 *
 * Return the original filename / mime type / size for an uploaded object so the
 * viewer can show real names and pick the right preview type. Access is gated
 * the same way as /storage/objects/* — only users who can see the underlying
 * file can see its metadata.
 */
router.get("/storage/uploads/metadata", async (req: Request, res: Response) => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const path = req.query.path;
  if (typeof path !== "string" || path.length === 0) {
    res.status(400).json({ error: "Missing 'path' query parameter" });
    return;
  }

  try {
    if (path.startsWith("/objects/")) {
      const owningTeamId = await findOwningTeamId(path);
      if (owningTeamId === null) {
        if (req.user.role !== "admin") {
          res
            .status(404)
            .json({ error: "No metadata recorded for this object" });
          return;
        }
      } else {
        const allowed = await userCanAccessTeamDocument(req.user, owningTeamId);
        if (!allowed) {
          res.status(403).json({ error: "Forbidden" });
          return;
        }
      }
    }

    const meta = await getStoredFileMetadata(path);
    if (!meta) {
      res.status(404).json({ error: "No metadata recorded for this object" });
      return;
    }
    res.json(
      GetUploadedFileMetadataResponse.parse({
        objectPath: meta.objectPath,
        filename: meta.filename,
        size: meta.size,
        contentType: meta.contentType,
      }),
    );
  } catch (error) {
    req.log.error({ err: error }, "Error reading uploaded file metadata");
    res.status(500).json({ error: "Failed to read uploaded file metadata" });
  }
});

/**
 * GET /storage/public-objects/*
 *
 * Serve public assets from PUBLIC_OBJECT_SEARCH_PATHS.
 * These are unconditionally public — no authentication or ACL checks.
 * IMPORTANT: Always provide this endpoint when object storage is set up.
 */
router.get(
  "/storage/public-objects/*filePath",
  async (req: Request, res: Response) => {
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
      const explicitFilename =
        typeof filenameParam === "string" && filenameParam.length > 0
          ? filenameParam
          : undefined;

      const response = await objectStorageService.downloadObject(file, 3600, {
        disposition: isDownload ? "attachment" : "inline",
        filename: explicitFilename,
      });

      res.status(response.status);
      response.headers.forEach((value, key) => res.setHeader(key, value));

      if (response.body) {
        const nodeStream = Readable.fromWeb(
          response.body as ReadableStream<Uint8Array>,
        );
        nodeStream.pipe(res);
      } else {
        res.end();
      }
    } catch (error) {
      req.log.error({ err: error }, "Error serving public object");
      res.status(500).json({ error: "Failed to serve public object" });
    }
  },
);

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

/**
 * Programme-level images are intentionally visible to every authenticated
 * dashboard user. Their object path is persisted in programme_config rather
 * than on a team-owned record, so they must be recognized separately from
 * private team documents.
 */
async function isProgrammeAsset(objectPath: string): Promise<boolean> {
  const [asset] = await db
    .select({ id: programmeConfigTable.id })
    .from(programmeConfigTable)
    .where(eq(programmeConfigTable.braveAppQrObjectPath, objectPath))
    .limit(1);
  return Boolean(asset);
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
  try {
    const raw = req.params.path;
    const wildcardPath = Array.isArray(raw) ? raw.join("/") : raw;
    const objectPath = `/objects/${wildcardPath}`;

    // The QR code configured for the public /get-app page is programme-level
    // marketing/install content, not a private team document. Anonymous reads
    // are allowed only when this exact object path is currently referenced by
    // programme_config; every other object keeps its existing auth rules.
    const isSharedProgrammeAsset = await isProgrammeAsset(objectPath);
    if (!req.isAuthenticated() && !isSharedProgrammeAsset) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const objectFile =
      await objectStorageService.getObjectEntityFile(objectPath);

    const owningTeamId = await findOwningTeamId(objectPath);
    if (owningTeamId === null) {
      if (
        !isSharedProgrammeAsset &&
        (!req.isAuthenticated() || req.user.role !== "admin")
      ) {
        res.status(404).json({ error: "Object not found" });
        return;
      }
    } else {
      if (!req.isAuthenticated()) {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }
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
    const explicitFilename =
      typeof filenameParam === "string" && filenameParam.length > 0
        ? filenameParam
        : undefined;

    const storedMeta = await getStoredFileMetadata(objectPath).catch(
      () => null,
    );
    const filename = explicitFilename ?? storedMeta?.filename;

    const response = await objectStorageService.downloadObject(
      objectFile,
      3600,
      {
        disposition: isDownload ? "attachment" : "inline",
        filename,
      },
    );

    res.status(response.status);
    response.headers.forEach((value, key) => res.setHeader(key, value));

    if (response.body) {
      const nodeStream = Readable.fromWeb(
        response.body as ReadableStream<Uint8Array>,
      );
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
