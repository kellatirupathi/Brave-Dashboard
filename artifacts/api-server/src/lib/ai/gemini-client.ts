import { logger } from "../logger";

const GEMINI_FILES_UPLOAD_URL =
  "https://generativelanguage.googleapis.com/upload/v1beta/files";
const GEMINI_GENERATE_URL =
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent";

export function getGeminiApiKey(): string | undefined {
  const key = process.env["GEMINI_API_KEY"];
  return key && key.trim() !== "" ? key.trim() : undefined;
}

export type GeminiUploadedFile = {
  uri: string;
  mimeType: string;
};

/**
 * Upload a PDF (raw bytes) to the Gemini Files API. Returns the file URI that
 * can be referenced in a subsequent generateContent call.
 * Files are retained by Google for ~48h.
 */
export async function uploadPdfToGemini(
  apiKey: string,
  pdfBytes: Buffer,
  displayName: string,
): Promise<GeminiUploadedFile> {
  const url = `${GEMINI_FILES_UPLOAD_URL}?key=${encodeURIComponent(apiKey)}`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "X-Goog-Upload-Command": "start, upload, finalize",
      "X-Goog-Upload-Header-Content-Type": "application/pdf",
      "Content-Type": "application/pdf",
      "X-Goog-File-Display-Name": displayName.slice(0, 80),
    },
    body: new Uint8Array(pdfBytes),
    signal: AbortSignal.timeout(120_000),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(
      `Gemini file upload failed: HTTP ${res.status} ${text.slice(0, 500)}`,
    );
  }
  const json = (await res.json()) as {
    file?: { uri?: string; mimeType?: string };
  };
  if (!json.file?.uri) {
    throw new Error("Gemini file upload returned no file.uri");
  }
  return {
    uri: json.file.uri,
    mimeType: json.file.mimeType ?? "application/pdf",
  };
}

/**
 * Call generateContent with the prompt text and any number of uploaded PDF
 * file URIs. Returns the raw parsed JSON object the model returns.
 *
 * Throws if Gemini returns a non-JSON body or a non-2xx status.
 */
export async function generateBrdAnalysis(
  apiKey: string,
  files: GeminiUploadedFile[],
  promptText: string,
): Promise<unknown> {
  const url = `${GEMINI_GENERATE_URL}?key=${encodeURIComponent(apiKey)}`;
  const parts: Array<unknown> = files.map((f) => ({
    file_data: { mime_type: f.mimeType, file_uri: f.uri },
  }));
  parts.push({ text: promptText });
  const body = {
    contents: [{ parts }],
    generationConfig: {
      responseMimeType: "application/json",
      temperature: 0.1,
    },
  };
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(180_000),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(
      `Gemini generateContent failed: HTTP ${res.status} ${text.slice(0, 500)}`,
    );
  }
  const wrapped = (await res.json()) as {
    candidates?: Array<{
      content?: { parts?: Array<{ text?: string }> };
    }>;
  };
  const firstText = wrapped.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!firstText) {
    logger.warn(
      { wrapped },
      "[brd-ai] Gemini response had no candidate text part",
    );
    throw new Error("Gemini returned no text candidate");
  }
  try {
    return JSON.parse(firstText);
  } catch (err) {
    logger.warn(
      { firstText: firstText.slice(0, 400), err },
      "[brd-ai] Failed to JSON.parse Gemini response",
    );
    throw new Error("Gemini returned non-JSON response");
  }
}
