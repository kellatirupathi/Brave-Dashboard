// Plain-text email sent to every student recipient when an admin or
// coordinator posts an announcement. One personalised email is rendered
// per recipient.
type AnnouncementEmailInput = {
  recipientName: string;
  title: string;
  body: string;
  authorName: string;
  appUrl: string;
};

export function renderAnnouncementEmail(input: AnnouncementEmailInput) {
  const subject = `BRAVE Announcement: ${input.title}`;

  const greeting = input.recipientName.trim()
    ? `Hi ${input.recipientName.trim()},`
    : "Hi,";

  const lines = [
    greeting,
    "",
    "A new announcement has been posted on the BRAVE Dashboard:",
    "",
    input.title,
    "",
    input.body.trim(),
    "",
    `Posted by: ${input.authorName}`,
    "",
    `View it on the dashboard: ${input.appUrl}/notifications`,
    "",
    "— BRAVE Team",
    "",
    "For any questions, reply to this email or contact us at brave.niat@nxtwave.in.",
  ];

  return { subject, text: lines.join("\n") };
}
