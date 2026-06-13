// Status-based weekly-journal reminder copy, used by the heatmap bulk-send
// (POST /heatmap/remind-bulk). Each team's status (computed server-side from
// its journal history) selects ONE template — so Active teams get an
// appreciation note, Inconsistent/Silent teams get nudges, and Never-logged
// teams get a more compelling onboarding push. Both the email body AND the
// in-app notification copy live here so the two channels stay in sync.

export type TeamReminderStatus =
  | "active"
  | "inconsistent"
  | "silent"
  | "never_logged";

type EmailInput = {
  status: TeamReminderStatus;
  recipientName: string | null;
  teamName: string;
  appUrl: string;
};

/**
 * Render the status-specific reminder EMAIL (plain text, matching the rest of
 * the email templates). Returns { subject, text }.
 */
export function renderJournalStatusReminderEmail(input: EmailInput): {
  subject: string;
  text: string;
} {
  const { status, recipientName, teamName, appUrl } = input;
  const name =
    recipientName && recipientName.trim() !== "" ? recipientName : "there";
  const journalUrl = `${appUrl}/journal`;

  switch (status) {
    case "active": {
      const subject = `🔥 ${teamName} is on a roll — keep it going!`;
      const text = [
        `Hi ${name},`,
        "",
        `Great news — ${teamName} is one of the consistent teams this week. Keeping your weekly journal up to date is exactly how winning teams are built. 🙌`,
        "",
        `Keep the momentum going: take 2 minutes to log this week's progress.`,
        "",
        `Submit your weekly journal: ${journalUrl}`,
        "",
        `Every update brings you one step closer to Demo Day.`,
        "",
        "— Team BRAVE",
      ].join("\n");
      return { subject, text };
    }

    case "inconsistent": {
      const subject = `${teamName} — keep your progress streak alive`;
      const text = [
        `Hi ${name},`,
        "",
        `We noticed ${teamName} has missed a weekly journal recently. No worries — it's easy to get back on track.`,
        "",
        `Take 2 minutes now to log this week's update. If something is blocking you, mention it in your journal so your coordinator can step in and help.`,
        "",
        `Submit your weekly journal: ${journalUrl}`,
        "",
        `Consistency is what gets teams to Demo Day. You've got this.`,
        "",
        "— Team BRAVE",
      ].join("\n");
      return { subject, text };
    }

    case "silent": {
      const subject = `${teamName}, it's been a while — let's get back on track`;
      const text = [
        `Hi ${name},`,
        "",
        `It's been more than two weeks since ${teamName} submitted a weekly journal. You're still very much part of the BRAVE programme — and there's still time to make it count.`,
        "",
        `Log your latest progress today. Even a short update keeps your team moving, visible to your coordinator, and in the running on the leaderboard.`,
        "",
        `Submit your weekly journal: ${journalUrl}`,
        "",
        `We'd love to see what ${teamName} has been working on.`,
        "",
        "— Team BRAVE",
      ].join("\n");
      return { subject, text };
    }

    case "never_logged":
    default: {
      const subject = `🚀 ${teamName}, your BRAVE journey starts now`;
      const text = [
        `Hi ${name},`,
        "",
        `${teamName} hasn't submitted a single weekly journal yet — and that's the very first step of your BRAVE journey.`,
        "",
        `BRAVE is your chance to build a real business, earn real revenue, and pitch on Demo Day. Teams that cross ₹2,00,000 in verified revenue qualify to present — and it all starts with one weekly update.`,
        "",
        `Here's how to begin:`,
        `  1. Log in to the BRAVE Dashboard`,
        `  2. Submit your first weekly journal — what you did, your blockers, and next week's plan`,
        "",
        `Start now: ${journalUrl}`,
        "",
        `Your first update puts ${teamName} on the map. We can't wait to see what you build.`,
        "",
        "— Team BRAVE",
      ].join("\n");
      return { subject, text };
    }
  }
}

/**
 * Status-specific IN-APP notification copy (title + body). Mirrors the email
 * tone so a student sees a consistent message across both channels.
 */
export function journalStatusNotificationCopy(
  status: TeamReminderStatus,
  teamName: string,
): { title: string; body: string } {
  switch (status) {
    case "active":
      return {
        title: "You're on track! 🎉",
        body: `Great work keeping ${teamName} up to date. Log this week's progress to keep the streak going.`,
      };
    case "inconsistent":
      return {
        title: "Don't lose your streak",
        body: `${teamName} missed a recent journal. Take 2 minutes to log this week and stay on track.`,
      };
    case "silent":
      return {
        title: "We miss your updates",
        body: `${teamName} hasn't logged a journal in over 2 weeks. Submit an update now to stay on track.`,
      };
    case "never_logged":
    default:
      return {
        title: "Start your BRAVE journey 🚀",
        body: `${teamName} hasn't logged any progress yet. Submit your first weekly journal and get on the board.`,
      };
  }
}
