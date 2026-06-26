/**
 * Google Drive client for mirroring BRD files out of Google Cloud Storage into a
 * shareable Drive folder. Used ONLY by the admin-triggered, manual migration in
 * routes/admin-brd-drive.ts — never by cron or bootstrap.
 *
 * Auth: a Google Cloud service account JSON, supplied via the
 * `GDRIVE_SERVICE_ACCOUNT_JSON` env var (the raw JSON string, or a base64 of
 * it). The Drive API must be enabled on that service account's project.
 *
 * Target: a single flat Drive folder, id in `GDRIVE_BRD_FOLDER_ID`.
 *
 * IMPORTANT (service-account quota): a plain service account has NO Drive
 * storage of its own. The target folder MUST live on a Shared Drive, OR be a
 * My-Drive folder shared with the service account's client_email as Editor —
 * otherwise Drive returns a "storageQuotaExceeded" error on upload. Because the
 * folder may live on a Shared Drive we always pass supportsAllDrives: true.
 *
 * Everything degrades gracefully when the env vars are absent: `isDriveConfigured()`
 * returns false and the route reports "not configured" instead of crashing —
 * same defensive posture as the GEMINI_API_KEY paths.
 */
import { Readable } from "stream";
import { google, type drive_v3 } from "googleapis";
import { JWT } from "google-auth-library";

const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive";

export function getDriveFolderId(): string | null {
  const id = (process.env["GDRIVE_BRD_FOLDER_ID"] || "").trim();
  return id.length > 0 ? id : null;
}

/**
 * Parse the service-account JSON from the env var. Accepts either raw JSON or a
 * base64-encoded JSON blob (handy when a secrets manager mangles newlines in the
 * private_key). Returns null if missing/unparseable.
 */
function readServiceAccount(): {
  client_email: string;
  private_key: string;
} | null {
  const raw = (process.env["GDRIVE_SERVICE_ACCOUNT_JSON"] || "").trim();
  if (!raw) return null;
  let text = raw;
  // If it doesn't look like JSON, try base64-decoding it first.
  if (!text.startsWith("{")) {
    try {
      text = Buffer.from(raw, "base64").toString("utf8");
    } catch {
      return null;
    }
  }
  try {
    const parsed = JSON.parse(text) as Record<string, unknown>;
    const email = parsed["client_email"];
    const key = parsed["private_key"];
    if (typeof email !== "string" || typeof key !== "string") return null;
    return { client_email: email, private_key: key };
  } catch {
    return null;
  }
}

/** True when both the service account and the target folder are configured. */
export function isDriveConfigured(): boolean {
  return readServiceAccount() !== null && getDriveFolderId() !== null;
}

let cachedClient: drive_v3.Drive | null = null;

/**
 * Build (and cache) an authenticated Drive v3 client. Throws a descriptive error
 * if the env vars are missing — callers should gate with `isDriveConfigured()`
 * first.
 */
export function getDriveClient(): drive_v3.Drive {
  if (cachedClient) return cachedClient;
  const sa = readServiceAccount();
  if (!sa) {
    throw new Error(
      "GDRIVE_SERVICE_ACCOUNT_JSON is not set or is invalid; cannot build Drive client.",
    );
  }
  const auth = new JWT({
    email: sa.client_email,
    key: sa.private_key,
    scopes: [DRIVE_SCOPE],
  });
  // googleapis' drive() overload types `auth` as a union that doesn't list JWT
  // explicitly, though a JWT is a valid OAuth2 client at runtime. Pass it via
  // the options bag with a narrow cast.
  cachedClient = google.drive({
    version: "v3",
    auth: auth as unknown as Parameters<typeof google.drive>[0]["auth"],
  });
  return cachedClient;
}

export type DriveUploadResult = {
  fileId: string;
  webViewLink: string;
};

/**
 * Upload a file to the configured Drive folder from a readable stream, set it to
 * anyone-with-link viewable, and return its id + shareable webViewLink.
 *
 * @param stream      readable stream of the file bytes (e.g. a GCS createReadStream)
 * @param filename    display name for the Drive file
 * @param mimeType    content type (defaults to application/pdf)
 */
export async function uploadBrdToDrive(
  stream: Readable,
  filename: string,
  mimeType = "application/pdf",
): Promise<DriveUploadResult> {
  const drive = getDriveClient();
  const folderId = getDriveFolderId();
  if (!folderId) {
    throw new Error("GDRIVE_BRD_FOLDER_ID is not set.");
  }

  const created = await drive.files.create({
    requestBody: {
      name: filename,
      parents: [folderId],
    },
    media: {
      mimeType,
      body: stream,
    },
    fields: "id, webViewLink",
    supportsAllDrives: true,
  });

  const fileId = created.data.id;
  if (!fileId) {
    throw new Error("Drive upload returned no file id.");
  }

  // Make it viewable by anyone with the link so the exported Drive link opens
  // for a manager without a Google login. Best-effort: if this fails the file is
  // still uploaded — surface the error so the caller can decide.
  await drive.permissions.create({
    fileId,
    requestBody: { type: "anyone", role: "reader" },
    supportsAllDrives: true,
  });

  // webViewLink may be absent on the create response if permissions changed the
  // shape; re-fetch to be safe.
  let webViewLink = created.data.webViewLink ?? null;
  if (!webViewLink) {
    const got = await drive.files.get({
      fileId,
      fields: "webViewLink",
      supportsAllDrives: true,
    });
    webViewLink = got.data.webViewLink ?? null;
  }

  return {
    fileId,
    webViewLink:
      webViewLink ?? `https://drive.google.com/file/d/${fileId}/view`,
  };
}
