// Transactional email delivery — Amazon SES.
//
// NOTE: This module is still named `brevo.ts` because many callers import
// from "./lib/email/brevo". Only the implementation has been swapped from
// Brevo to Amazon SES — exports, types, and signatures are unchanged so
// nothing else in the codebase needs to change.
import { SESv2Client, SendEmailCommand } from "@aws-sdk/client-sesv2";
import { logger } from "../logger";

export type EmailRecipient = {
  email: string;
  name?: string;
};

export type SendEmailInput = {
  to: EmailRecipient | EmailRecipient[];
  subject: string;
  text: string;
  /**
   * Optional HTML body. When provided, SES sends a multipart email with both
   * the HTML and the plain-text `text` (the latter as a fallback for clients
   * that don't render HTML). Omit it for plain-text-only emails.
   */
  html?: string;
};

/**
 * Send a plain-text transactional email via Amazon SES (SESv2).
 *
 * - Reads AWS_REGION (default ap-south-1) and EMAIL_FROM
 *   (default brave.niat@nxtwave.in) from env.
 * - AWS credentials (AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY) are picked up
 *   automatically by the SDK from the environment — never hard-coded.
 * - From address shown to recipients is `BRAVE Dashboard <EMAIL_FROM>`.
 * - If required AWS credentials are missing, or there are no valid
 *   recipients, we log a warning and resolve `false` so the caller's main
 *   flow (e.g. verifying a revenue entry) still succeeds.
 * - All SES errors are caught and logged — this function never throws.
 */
export async function sendEmail(input: SendEmailInput): Promise<boolean> {
  const region = process.env.AWS_REGION || "ap-south-1";
  const fromEmail = process.env.EMAIL_FROM || "brave.niat@nxtwave.in";
  const fromAddress = `BRAVE Dashboard <${fromEmail}>`;

  if (!process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY) {
    logger.warn(
      { subject: input.subject },
      "AWS SES credentials not set — email skipped",
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
    const client = new SESv2Client({ region });
    const command = new SendEmailCommand({
      FromEmailAddress: fromAddress,
      Destination: {
        ToAddresses: valid.map((r) => r.email),
      },
      Content: {
        Simple: {
          Subject: { Data: input.subject, Charset: "UTF-8" },
          Body: {
            Text: { Data: input.text, Charset: "UTF-8" },
            ...(input.html
              ? { Html: { Data: input.html, Charset: "UTF-8" } }
              : {}),
          },
        },
      },
    });

    const result = await client.send(command);
    logger.info(
      {
        subject: input.subject,
        recipients: valid.map((r) => r.email),
        messageId: result.MessageId,
      },
      "Email sent via Amazon SES",
    );
    return true;
  } catch (err) {
    logger.error({ err, subject: input.subject }, "Amazon SES email threw");
    return false;
  }
}

export function getAppUrl(): string {
  return (
    process.env.APP_URL?.replace(/\/$/, "") ||
    "https://dashboard.brave.niatindia.com"
  );
}
