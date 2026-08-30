// WhatsApp broadcasts (additive, isolated).
//
// Hand-written rather than generated, matching the convention the recent
// features here already use (leads-api.ts, seasons-api.ts, and ~30 others).
// The endpoints deliberately never entered the OpenAPI spec.
import { customFetch } from "@workspace/api-client-react";

export type WhatsAppStatus = {
  configured: boolean;
  senderNumber: string | null;
  maxPerRequest: number;
  maxPerBroadcast: number;
};

export type WhatsAppTemplate = {
  id: number;
  templateId: string;
  displayName: string;
  category: "marketing" | "utility" | "authentication";
  language: string;
  variableCount: number;
  variableLabels: string[] | null;
  sampleBody: string | null;
  isActive: boolean;
  createdAt: string;
};

export type AudienceRole = "student" | "coordinator" | "admin";
export type AudienceScope = "all" | "campus" | "team" | "specific";

export type AudienceSelection = {
  role: AudienceRole;
  scope: AudienceScope;
  campusIds?: number[];
  teamIds?: number[];
  userIds?: string[];
};

export type MergeField = {
  key: string;
  label: string;
  example: string;
  fallback: string;
};

/**
 * One template variable. A literal is the same text for everyone; a merge field
 * resolves to each recipient's own value at send time.
 */
export type VariableBinding =
  | { kind: "literal"; value: string }
  | { kind: "merge"; field: string };

export type AudiencePreview = {
  total: number;
  reachable: number;
  skipped: number;
  overLimit: boolean;
  maxPerBroadcast: number;
  sample: Array<{
    name: string;
    campusName: string | null;
    teamName: string | null;
    reachable: boolean;
  }>;
  unreachableSample: Array<{ name: string; campusName: string | null }>;
  /** Real resolved values for the first few recipients. */
  personalisation: Array<{ name: string; values: string[] }>;
};

export type SendResult = {
  batchId: string;
  sent?: number;
  failed?: number;
  skipped: number;
  errors?: string[];
  dryRun?: boolean;
  wouldSend?: number;
  samplePersonalisation?: Array<{ name: string; values: string[] }>;
};

export type SendBatch = {
  batchId: string;
  templateId: string;
  sentBy: string;
  createdAt: string;
  total: number;
  sent: number;
  failed: number;
};

export const whatsappQueryKeys = {
  status: ["whatsapp", "status"] as const,
  templates: ["whatsapp", "templates"] as const,
  sends: ["whatsapp", "sends"] as const,
  mergeFields: (role: string) => ["whatsapp", "merge-fields", role] as const,
};

/**
 * Pull the server's `error` string out of a failed customFetch, so the UI can
 * show what actually went wrong instead of a generic failure. Mirrors
 * apiErrorData() in leads-api.ts.
 */
export function apiErrorMessage(err: unknown, fallback: string): string {
  const data = (err as { data?: { error?: string } } | undefined)?.data;
  return data?.error || fallback;
}

export async function getWhatsAppStatus(): Promise<WhatsAppStatus> {
  return customFetch<WhatsAppStatus>("/api/whatsapp/status");
}

export async function getTemplates(): Promise<WhatsAppTemplate[]> {
  return customFetch<WhatsAppTemplate[]>("/api/whatsapp/templates");
}

export async function createTemplate(
  body: Omit<WhatsAppTemplate, "id" | "createdAt">,
): Promise<WhatsAppTemplate> {
  return customFetch<WhatsAppTemplate>("/api/whatsapp/templates", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export async function updateTemplate(
  id: number,
  body: Partial<WhatsAppTemplate>,
): Promise<WhatsAppTemplate> {
  return customFetch<WhatsAppTemplate>(`/api/whatsapp/templates/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export async function deleteTemplate(id: number): Promise<void> {
  await customFetch<void>(`/api/whatsapp/templates/${id}`, { method: "DELETE" });
}

export async function getMergeFields(role: string): Promise<MergeField[]> {
  return customFetch<MergeField[]>(
    `/api/whatsapp/merge-fields?role=${encodeURIComponent(role)}`,
  );
}

export async function previewAudience(
  selection: AudienceSelection,
  bindings?: VariableBinding[],
): Promise<AudiencePreview> {
  return customFetch<AudiencePreview>("/api/whatsapp/audience/preview", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...selection, bindings }),
  });
}

export async function sendBroadcast(body: {
  templateId: string;
  bindings: VariableBinding[];
  audience: AudienceSelection;
  confirmedCount: number;
  dryRun?: boolean;
}): Promise<SendResult> {
  return customFetch<SendResult>("/api/whatsapp/send", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export async function sendTest(body: {
  templateId: string;
  phone: string;
  parameters?: string[];
}): Promise<{ ok: boolean; error?: string; statusDesc?: string }> {
  return customFetch("/api/whatsapp/test", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export async function getSendHistory(): Promise<SendBatch[]> {
  return customFetch<SendBatch[]>("/api/whatsapp/sends");
}

/**
 * Render a template body with the supplied values, for the preview pane.
 * Karix uses {{1}}-style placeholders (1-indexed in Konverse, 0-indexed on the
 * wire), so both forms are substituted.
 */
export function renderPreview(
  body: string | null,
  parameters: string[],
): string {
  if (!body) return "";
  return body.replace(/\{\{\s*(\d+)\s*\}\}/g, (match, n) => {
    const idx = Number(n);
    // Konverse numbers them from 1; our array is 0-based.
    const value = parameters[idx - 1] ?? parameters[idx];
    return value !== undefined && value !== "" ? value : match;
  });
}
