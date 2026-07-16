// Emails sent to a team's leader + members when an admin enables or disables
// that team's submissions (per-team exemption from the global Projects
// Submissions Lock). Friendly, plain-text with a matching HTML body.
type SubmissionAccessEmailInput = {
  teamName: string;
  appUrl: string;
};

export function renderSubmissionEnabledEmail(
  input: SubmissionAccessEmailInput,
) {
  const subject = `Submissions are open for ${input.teamName} 🎉`;
  const lines = [
    `Hi Team ${input.teamName},`,
    "",
    "Good news — your team can now add revenue and order book entries again, even while submissions are paused for others.",
    "",
    "Please add your latest entries as soon as possible so nothing is missed:",
    `${input.appUrl}/projects`,
    "",
    "If you have any questions, just reply to this email or reach your success coach.",
    "",
    "Keep up the great work!",
    "— BRAVE Team",
  ];
  const text = lines.join("\n");
  const html = `
    <div style="font-family:Arial,Helvetica,sans-serif;color:#1a1d21;line-height:1.6">
      <p>Hi Team <strong>${input.teamName}</strong>,</p>
      <p>Good news — your team can now <strong>add revenue and order book entries</strong> again,
      even while submissions are paused for others.</p>
      <p>Please add your latest entries <strong>as soon as possible</strong> so nothing is missed.</p>
      <p><a href="${input.appUrl}/projects"
        style="display:inline-block;background:#e5342a;color:#fff;text-decoration:none;
        padding:10px 18px;border-radius:8px;font-weight:600">Go to Projects</a></p>
      <p style="color:#6b7280;font-size:13px">Questions? Reply to this email or reach your success coach.</p>
      <p>Keep up the great work!<br/>— BRAVE Team</p>
    </div>`;
  return { subject, text, html };
}

// Sent when an admin rejects a team's "Request to submit".
export function renderSubmissionRequestRejectedEmail(
  input: SubmissionAccessEmailInput & { reason: string },
) {
  const subject = `Update on your submission request — ${input.teamName}`;
  const lines = [
    `Hi Team ${input.teamName},`,
    "",
    "Thanks for reaching out. We've reviewed your request to submit while submissions are paused, and we're not able to open it up right now.",
    "",
    "Reason from the admin team:",
    input.reason,
    "",
    "If something changes or you have more details to share, please reply to this email or reach your success coach — you're welcome to raise a fresh request.",
    "",
    "— BRAVE Team",
  ];
  const text = lines.join("\n");
  const html = `
    <div style="font-family:Arial,Helvetica,sans-serif;color:#1a1d21;line-height:1.6">
      <p>Hi Team <strong>${input.teamName}</strong>,</p>
      <p>Thanks for reaching out. We've reviewed your request to submit while submissions are paused,
      and we're <strong>not able to open it up right now</strong>.</p>
      <p style="margin:16px 0;padding:12px 14px;background:#fef2f2;border-left:3px solid #ef4444;border-radius:6px">
        <strong>Reason from the admin team:</strong><br/>${input.reason}
      </p>
      <p>If something changes or you have more details to share, reply to this email or reach your
      success coach — you're welcome to raise a fresh request.</p>
      <p>— BRAVE Team</p>
    </div>`;
  return { subject, text, html };
}

export function renderSubmissionDisabledEmail(
  input: SubmissionAccessEmailInput,
) {
  const subject = `Submissions are paused for ${input.teamName}`;
  const lines = [
    `Hi Team ${input.teamName},`,
    "",
    "Submissions have been paused for your team for now. You won't be able to add new revenue or order book entries until they're re-opened.",
    "",
    "Anything you already submitted is safe and still under review.",
    "",
    "If you believe this is a mistake or you need to submit something urgently, please reach your success coach.",
    "",
    "— BRAVE Team",
  ];
  const text = lines.join("\n");
  const html = `
    <div style="font-family:Arial,Helvetica,sans-serif;color:#1a1d21;line-height:1.6">
      <p>Hi Team <strong>${input.teamName}</strong>,</p>
      <p>Submissions have been <strong>paused</strong> for your team for now. You won't be able to
      add new revenue or order book entries until they're re-opened.</p>
      <p>Anything you already submitted is safe and still under review.</p>
      <p style="color:#6b7280;font-size:13px">Need to submit something urgently? Reach your success coach.</p>
      <p>— BRAVE Team</p>
    </div>`;
  return { subject, text, html };
}
