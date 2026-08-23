/**
 * WhatsApp delivery via the Karix RCM API (additive, isolated).
 *
 * Mirrors the contract of sendEmail() in lib/email/brevo.ts on purpose: never
 * throws, resolves false on any failure, and logs. A WhatsApp problem must
 * never break the flow that triggered it.
 *
 * API CONTRACT — verified against Karix's published Postman collections on
 * 2026-08-21, not from their prose docs, which contradict themselves.
 *
 *   POST https://rcmapi.instaalerts.zone/services/rcm/sendMessage
 *
 * THREE THINGS HERE ARE EASY TO GET WRONG AND EXPENSIVE TO DEBUG:
 *
 *   1. The auth header is `Authentication:`, NOT `Authorization:`. A standard
 *      Authorization header is silently rejected.
 *   2. Karix answers HTTP 200 even for failures. The real outcome is
 *      `statusCode` in the BODY, as a STRING ("200", "210", ...). Branching on
 *      res.ok reports every failure as a success.
 *   3. Single send uses `recipient` (object); bulk uses `recipients` (array).
 *      Same URL, same everything else — only that key differs.
 *
 * Template variables are a STRING-KEYED MAP, not an array: {"0":"a","1":"b"}.
 */
import { logger } from "../logger";

/** Karix RCM base. Overridable for a sandbox tenant. */
const KARIX_URL =
  process.env.KARIX_API_URL ||
  "https://rcmapi.instaalerts.zone/services/rcm/sendMessage";

/** Their payload version. Pinned — a bump is a deliberate act. */
const META_VERSION = "v1.0.9";

/**
 * Karix rejects an oversized recipient list with status 249 rather than
 * truncating it. Their limit is account-configured and not discoverable via
 * the API, so we batch conservatively and let the caller loop.
 */
export const MAX_RECIPIENTS_PER_REQUEST = 100;

const TIMEOUT_MS = 20_000;

export type WhatsAppRecipient = {
  /** Any format — normalised here. */
  phone: string;
  /** Echoed back on the result so the caller can log per person. */
  userId?: string | null;
  name?: string | null;
};

export type SendTemplateInput = {
  /** Template NAME as registered in Konverse. */
  templateId: string;
  recipients: WhatsAppRecipient[];
  /** Positional {{1}}, {{2}} ... values, in order. */
  parameters?: string[];
  language?: string;
};

export type SendOneInput = {
  templateId: string;
  recipient: WhatsAppRecipient;
  /** This recipient's own resolved values. */
  parameters?: string[];
  language?: string;
};

export type SendTemplateResult = {
  ok: boolean;
  /** Karix statusCode, as returned (string). */
  statusCode?: string;
  statusDesc?: string;
  /** Karix message id, for correlating delivery webhooks. */
  messageId?: string;
  /** Set when the call never reached Karix, or the config was incomplete. */
  error?: string;
};

/**
 * Indian mobile number in the 12-digit 91XXXXXXXXXX form Karix expects.
 *
 * Returns null for anything that cannot be made into one, so an unusable
 * number is SKIPPED rather than sent to a wrong recipient. Being strict here is
 * deliberate: a lenient parse that "fixes" a typo could message a stranger.
 */
export function normaliseWhatsAppNumber(raw: string | null | undefined): string | null {
  const digits = (raw ?? "").replace(/\D+/g, "");
  if (!digits) return null;
  // 10-digit local mobile. Indian mobiles start 6-9; anything else is a
  // landline or a mistyped value, and must not be messaged.
  if (digits.length === 10) {
    return /^[6-9]/.test(digits) ? `91${digits}` : null;
  }
  // 0-prefixed STD form.
  if (digits.length === 11 && digits.startsWith("0")) {
    const local = digits.slice(1);
    return /^[6-9]/.test(local) ? `91${local}` : null;
  }
  // Already country-coded.
  if (digits.length === 12 && digits.startsWith("91")) {
    return /^[6-9]/.test(digits.slice(2)) ? digits : null;
  }
  // 00 91 international prefix.
  if (digits.length === 14 && digits.startsWith("0091")) {
    const local = digits.slice(4);
    return /^[6-9]/.test(local) ? `91${local}` : null;
  }
  return null;
}

/** True when both the API key and the sender number are configured. */
export function isWhatsAppConfigured(): boolean {
  return !!(process.env.KARIX_API_KEY && process.env.KARIX_SENDER_NUMBER);
}

/**
 * Human-readable meaning for the Karix codes we can actually act on. Anything
 * unmapped falls back to their own statusDesc.
 */
const STATUS_HINTS: Record<string, string> = {
  "102": "The Karix account is not active.",
  "104": "Karix credits have expired.",
  "105": "No credits available in the Karix account.",
  "210":
    "Template not recognised by WhatsApp — check the template name matches Konverse exactly and is approved.",
  "218": "Invalid channel. Expected WABA.",
  "220":
    "Sender not configured — check KARIX_SENDER_NUMBER matches a number registered in Konverse.",
  "249": "Too many recipients in one request.",
};

export function explainKarixStatus(code?: string, desc?: string): string {
  if (!code) return desc || "Unknown response from Karix.";
  return STATUS_HINTS[code] ?? desc ?? `Karix status ${code}`;
}

/**
 * Send one approved template to up to MAX_RECIPIENTS_PER_REQUEST recipients.
 *
 * Never throws. Returns ok:false with a reason on any failure, so a caller
 * looping over batches can record each outcome and carry on.
 */
export async function sendWhatsAppTemplate(
  input: SendTemplateInput,
): Promise<SendTemplateResult> {
  const apiKey = process.env.KARIX_API_KEY;
  const sender = process.env.KARIX_SENDER_NUMBER;

  if (!apiKey || !sender) {
    logger.warn(
      { templateId: input.templateId },
      "Karix credentials not set — WhatsApp send skipped",
    );
    return { ok: false, error: "WhatsApp is not configured on this server." };
  }

  const to = input.recipients
    .map((r) => normaliseWhatsAppNumber(r.phone))
    .filter((n): n is string => !!n);

  if (to.length === 0) {
    return { ok: false, error: "No valid recipient numbers." };
  }
  if (to.length > MAX_RECIPIENTS_PER_REQUEST) {
    return {
      ok: false,
      error: `Too many recipients for one request (max ${MAX_RECIPIENTS_PER_REQUEST}).`,
    };
  }

  // Positional array -> the string-keyed map Karix expects.
  const parameterValues: Record<string, string> = {};
  (input.parameters ?? []).forEach((v, i) => {
    parameterValues[String(i)] = v;
  });

  const template: Record<string, unknown> = {
    templateId: input.templateId,
    parameterValues,
  };
  if (input.language) template["language"] = input.language;

  // Single vs bulk differ ONLY in recipient/recipients. Karix treats a
  // one-element `recipients` array differently from `recipient`, so match
  // their shape exactly rather than always sending the array.
  const recipientPart =
    to.length === 1
      ? { recipient: { to: to[0], recipient_type: "individual" } }
      : {
          recipients: to.map((n) => ({
            to: n,
            recipient_type: "individual",
            reference: {},
          })),
        };

  const body = {
    message: {
      channel: "WABA",
      content: { preview_url: false, type: "TEMPLATE", template },
      ...recipientPart,
      sender: { from: sender },
    },
    metaData: { version: META_VERSION },
  };

  try {
    const res = await fetch(KARIX_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        // NOT "Authorization" — see the header note at the top of this file.
        Authentication: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    const text = await res.text();
    let parsed: {
      statusCode?: string;
      statusDesc?: string;
      mid?: string;
    } = {};
    try {
      parsed = JSON.parse(text);
    } catch {
      logger.error(
        { status: res.status, body: text.slice(0, 500) },
        "[karix] non-JSON response",
      );
      return { ok: false, error: "Karix returned an unreadable response." };
    }

    const code = String(parsed.statusCode ?? "");
    // Karix answers HTTP 200 for failures too — the body is the only truth.
    const ok = code === "200";

    if (!ok) {
      logger.error(
        { code, desc: parsed.statusDesc, templateId: input.templateId },
        "[karix] send rejected",
      );
    }

    return {
      ok,
      statusCode: code || undefined,
      statusDesc: parsed.statusDesc,
      messageId: parsed.mid,
      ...(ok ? {} : { error: explainKarixStatus(code, parsed.statusDesc) }),
    };
  } catch (err) {
    logger.error(
      { err, templateId: input.templateId },
      "[karix] send failed to reach Karix",
    );
    return { ok: false, error: "Could not reach WhatsApp provider." };
  }
}

/**
 * Send to ONE recipient with that recipient's own parameter values.
 *
 * Needed because a template carrying merge fields ("Hello {{1}}" = each
 * student's own name) cannot go out as a bulk request — Karix applies one
 * parameter set to the whole `recipients` array, so a bulk send would greet
 * everyone by the first person's name.
 */
export async function sendWhatsAppTemplateToOne(
  input: SendOneInput,
): Promise<SendTemplateResult> {
  return sendWhatsAppTemplate({
    templateId: input.templateId,
    recipients: [input.recipient],
    parameters: input.parameters,
    language: input.language,
  });
}

/**
 * How many per-recipient sends run at once.
 *
 * Deliberately modest: these are real messages to real people, and a burst of
 * hundreds of parallel requests is how an account trips a provider rate limit
 * mid-broadcast — leaving half an audience messaged and half not.
 */
export const PERSONALISED_CONCURRENCY = 5;

/**
 * Run `worker` over every item with a fixed concurrency ceiling, preserving
 * input order in the results.
 *
 * Kept here rather than pulling in a dependency: the additive-only remit means
 * package.json stays untouched.
 */
export async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;
  const runners = Array.from(
    { length: Math.min(Math.max(1, limit), items.length) },
    async () => {
      for (;;) {
        const i = cursor++;
        if (i >= items.length) return;
        results[i] = await worker(items[i]!, i);
      }
    },
  );
  await Promise.all(runners);
  return results;
}
