type RejectedEmailInput = {
  recipientName: string;
  teamName: string;
  amount: number;
  clientName: string;
  projectTitle: string;
  reason: string;
  appUrl: string;
};

function formatINR(amount: number): string {
  return `₹${amount.toLocaleString("en-IN")}`;
}

export function renderRevenueRejectedEmail(input: RejectedEmailInput) {
  const subject = `Revenue entry needs changes: ${input.teamName}`;

  const lines = [
    `Hi ${input.recipientName},`,
    "",
    `Your team's recent revenue entry was reviewed by the BRAVE admin team and could not be verified as submitted.`,
    "",
    `Submitted amount: ${formatINR(input.amount)}`,
    `Client: ${input.clientName}`,
    `Project: ${input.projectTitle}`,
    `Team: ${input.teamName}`,
    "",
    `Reason from the admin:`,
    input.reason,
    "",
    `What you can do next:`,
    `- Review the reason above and update the entry accordingly`,
    `- Make sure your supporting documents (BRD, testimonial) are clear and match the amount`,
    `- Resubmit the entry once corrected`,
    "",
    "View your projects: " + input.appUrl + "/projects",
    "",
    "If you'd like clarification or want to discuss this rejection, reply to this email or contact us at brave.niat@nxtwave.in.",
    "",
    "— BRAVE Team",
  ];

  return { subject, text: lines.join("\n") };
}
