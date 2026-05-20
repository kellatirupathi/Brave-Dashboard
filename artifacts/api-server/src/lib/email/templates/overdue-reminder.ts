// Daily email digest of overdue (≥48h) review-queue items, sent to admin
// subscribers configured under /admin/notifications.
type OverdueItem = {
  teamName: string;
  campusName: string;
  clientName: string;
  amount: number;
  submittedAt: Date | string;
  hoursOverdue: number;
};

type OverdueEmailInput = {
  recipientName: string | null;
  items: OverdueItem[];
  totalCount: number;
  appUrl: string;
};

function formatINR(amount: number): string {
  return `₹${amount.toLocaleString("en-IN")}`;
}

export function renderOverdueReminderEmail(input: OverdueEmailInput) {
  const { recipientName, items, totalCount, appUrl } = input;
  const subject = `BRAVE: ${totalCount} overdue review item${totalCount === 1 ? "" : "s"}`;

  const greeting = recipientName ? `Hi ${recipientName},` : "Hi,";

  const lines: string[] = [
    greeting,
    "",
    `There ${totalCount === 1 ? "is" : "are"} ${totalCount} revenue entry submission${totalCount === 1 ? "" : "s"} that ${totalCount === 1 ? "has" : "have"} been waiting more than 48 hours for review.`,
    "",
  ];

  const preview = items.slice(0, 20);
  for (const it of preview) {
    const when =
      typeof it.submittedAt === "string"
        ? it.submittedAt
        : it.submittedAt.toISOString().slice(0, 16).replace("T", " ");
    lines.push(
      `• ${it.teamName} (${it.campusName}) — ${formatINR(it.amount)} from ${it.clientName} · submitted ${when} · ${Math.round(it.hoursOverdue)}h overdue`,
    );
  }
  if (items.length > preview.length) {
    lines.push(`…and ${items.length - preview.length} more.`);
  }

  lines.push(
    "",
    `Open the review queue: ${appUrl}/admin/queue`,
    "",
    "— BRAVE Dashboard",
  );

  return { subject, text: lines.join("\n") };
}
