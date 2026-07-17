// Emails sent to a team's leader + members when an admin verifies or rejects
// their BRAVE Finale pitch deck. Friendly, plain-text with a matching HTML
// body — same shape as the submission-access templates.
type FinaleReviewEmailInput = {
  teamName: string;
  deckName: string;
  appUrl: string;
};

export function renderFinaleVerifiedEmail(input: FinaleReviewEmailInput) {
  const subject = `Your BRAVE Finale deck is verified 🎉 — ${input.teamName}`;
  const lines = [
    `Hi Team ${input.teamName},`,
    "",
    `Great news — your BRAVE Finale submission (${input.deckName}) has been reviewed and verified.`,
    "",
    "Nothing more is needed from you right now. We'll be in touch with what happens next.",
    "",
    `You can see your submission here: ${input.appUrl}/finale`,
    "",
    "Congratulations, and well done on the work that got you here!",
    "— BRAVE Team",
  ];
  const text = lines.join("\n");
  const html = `
    <div style="font-family:Arial,Helvetica,sans-serif;color:#1a1d21;line-height:1.6">
      <p>Hi Team <strong>${input.teamName}</strong>,</p>
      <p>Great news — your BRAVE Finale submission (<strong>${input.deckName}</strong>)
      has been reviewed and <strong>verified</strong>.</p>
      <p>Nothing more is needed from you right now. We'll be in touch with what happens next.</p>
      <p><a href="${input.appUrl}/finale"
        style="display:inline-block;background:#059669;color:#fff;text-decoration:none;
        padding:10px 18px;border-radius:8px;font-weight:600">View your submission</a></p>
      <p>Congratulations, and well done on the work that got you here!<br/>— BRAVE Team</p>
    </div>`;
  return { subject, text, html };
}

export function renderFinaleRejectedEmail(input: FinaleReviewEmailInput) {
  const subject = `Update on your BRAVE Finale submission — ${input.teamName}`;
  const lines = [
    `Hi Team ${input.teamName},`,
    "",
    `We've reviewed your BRAVE Finale submission (${input.deckName}), and it hasn't been accepted in its current form.`,
    "",
    "This isn't the end of the road — please reach your success coach to understand what to strengthen, and you can submit an updated deck.",
    "",
    `Your submissions page: ${input.appUrl}/finale`,
    "",
    "— BRAVE Team",
  ];
  const text = lines.join("\n");
  const html = `
    <div style="font-family:Arial,Helvetica,sans-serif;color:#1a1d21;line-height:1.6">
      <p>Hi Team <strong>${input.teamName}</strong>,</p>
      <p>We've reviewed your BRAVE Finale submission (<strong>${input.deckName}</strong>),
      and it <strong>hasn't been accepted</strong> in its current form.</p>
      <p style="margin:16px 0;padding:12px 14px;background:#fef2f2;border-left:3px solid #ef4444;border-radius:6px">
        This isn't the end of the road — please reach your success coach to understand what to
        strengthen, and you can submit an updated deck.
      </p>
      <p><a href="${input.appUrl}/finale"
        style="display:inline-block;background:#e5342a;color:#fff;text-decoration:none;
        padding:10px 18px;border-radius:8px;font-weight:600">Go to your submissions</a></p>
      <p>— BRAVE Team</p>
    </div>`;
  return { subject, text, html };
}
