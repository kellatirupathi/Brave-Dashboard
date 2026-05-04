import { logger } from "../logger";

const BREVO_API_URL = "https://api.brevo.com/v3/smtp/email";

export type EmailRecipient = {
  email: string;
  name?: string;
};

export type SendEmailInput = {
  to: EmailRecipient | EmailRecipient[];
  subject: string;
  text: string;
};

/**
 * Send a plain-text transactional email via Brevo.
 *
 * - Reads BREVO_API_KEY, BREVO_FROM_EMAIL, BREVO_FROM_NAME from env.
 * - If BREVO_API_KEY is missing we log a warning and resolve `false` so the
 *   caller's main flow (e.g. verifying a revenue entry) still succeeds.
 * - Errors from Brevo are caught and logged — they never throw out of here.
 */
export async function sendEmail(input: SendEmailInput): Promise<boolean> {
  const apiKey = process.env.BREVO_API_KEY;
  const fromEmail = process.env.BREVO_FROM_EMAIL || "brave.niat@nxtwave.in";
  const fromName = process.env.BREVO_FROM_NAME || "BRAVE Dashboard";

  if (!apiKey) {
    logger.warn(
      { subject: input.subject },
      "BREVO_API_KEY not set — email skipped",
    );
    return false;
  }

  const recipients = Array.isArray(input.to) ? input.to : [input.to];
  const valid = recipients.filter((r) => r.email && r.email.includes("@"));
  if (valid.length === 0) {
    logger.warn(
      { subject: input.subject },
      "No valid recipient email — email skipped",
    );
    return false;
  }

  try {
    const res = await fetch(BREVO_API_URL, {
      method: "POST",
      headers: {
        accept: "application/json",
        "api-key": apiKey,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        sender: { email: fromEmail, name: fromName },
        to: valid,
        subject: input.subject,
        textContent: input.text,
      }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      logger.error(
        { status: res.status, body, subject: input.subject },
        "Brevo email send failed",
      );
      return false;
    }
    logger.info(
      { subject: input.subject, recipients: valid.map((r) => r.email) },
      "Email sent via Brevo",
    );
    return true;
  } catch (err) {
    logger.error({ err, subject: input.subject }, "Brevo email threw");
    return false;
  }
}

export function getAppUrl(): string {
  return (
    process.env.APP_URL?.replace(/\/$/, "") ||
    "https://dashboard.brave.niatindia.com"
  );
}
