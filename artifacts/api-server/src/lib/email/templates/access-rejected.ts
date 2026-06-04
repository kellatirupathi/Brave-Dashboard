// Email sent to a new user when an admin rejects their access request.
type AccessRejectedEmailInput = {
  fullName: string;
  notes?: string | null;
};

export function renderAccessRejectedEmail(input: AccessRejectedEmailInput) {
  const subject = "Update on your BRAVE Dashboard access request";

  const lines = [
    `Hi ${input.fullName},`,
    "",
    "Thanks for your interest in the BRAVE Programme Dashboard. After reviewing your request, we're unable to approve it at this time.",
  ];

  if (input.notes && input.notes.trim()) {
    lines.push("", `Reason from the admin: ${input.notes.trim()}`);
  }

  lines.push(
    "",
    "If you think this is a mistake, please contact your campus coordinator — or reply to this email and we'll help sort it out.",
    "",
    "— BRAVE Team",
  );

  return { subject, text: lines.join("\n") };
}
