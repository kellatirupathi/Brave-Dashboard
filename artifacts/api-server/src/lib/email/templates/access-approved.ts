// Email sent to a new user when an admin approves their access request.
type AccessApprovedEmailInput = {
  fullName: string;
  niatId?: string | null;
  campusName: string;
  appUrl: string;
};

export function renderAccessApprovedEmail(input: AccessApprovedEmailInput) {
  const subject = "You're in — your BRAVE Dashboard access is approved";

  const lines = [
    `Hi ${input.fullName},`,
    "",
    "Good news! Your access to the BRAVE Programme Dashboard has been approved.",
    "",
    `Get started here: ${input.appUrl}/get-started`,
    "",
    "On file for you:",
    `- Name: ${input.fullName}`,
  ];

  if (input.niatId && input.niatId.trim()) {
    lines.push(`- NIAT ID: ${input.niatId.trim()}`);
  }
  lines.push(`- Campus: ${input.campusName}`);

  lines.push(
    "",
    "Next steps:",
    "1. Sign in with your NIAT Forms account",
    "2. Complete your profile",
    "3. Create or join your team and start logging your venture's progress",
    "",
    "Questions? Just reply to this email or write to brave.niat@nxtwave.in.",
    "",
    "Welcome aboard!",
    "— BRAVE Team",
  );

  return { subject, text: lines.join("\n") };
}
