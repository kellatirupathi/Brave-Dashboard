type VerifiedEmailInput = {
  recipientName: string;
  teamName: string;
  amount: number;
  clientName: string;
  projectTitle: string;
  totalVerifiedRevenue: number;
  adminNotes?: string | null;
  appUrl: string;
};

function formatINR(amount: number): string {
  return `₹${amount.toLocaleString("en-IN")}`;
}

export function renderRevenueVerifiedEmail(input: VerifiedEmailInput) {
  const subject = `Revenue verified: ${formatINR(input.amount)} for ${input.teamName}`;

  const lines = [
    `Hi ${input.recipientName},`,
    "",
    `Great news! Your team's revenue entry has been verified by the BRAVE admin team.`,
    "",
    `Verified amount: ${formatINR(input.amount)}`,
    `Client: ${input.clientName}`,
    `Project: ${input.projectTitle}`,
    `Team: ${input.teamName}`,
    `Your team's total verified revenue is now: ${formatINR(input.totalVerifiedRevenue)}`,
  ];

  if (input.adminNotes && input.adminNotes.trim()) {
    lines.push("", `Admin notes: ${input.adminNotes.trim()}`);
  }

  lines.push(
    "",
    "View your projects: " + input.appUrl + "/projects",
    "View leaderboard: " + input.appUrl + "/leaderboard",
    "",
    "Keep up the great work!",
    "",
    "For any questions, reply to this email or contact us at brave.niat@nxtwave.in.",
    "",
    "— BRAVE Team",
  );

  return { subject, text: lines.join("\n") };
}
