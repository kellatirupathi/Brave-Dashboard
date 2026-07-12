// Friendly email asking a team to rename because their team name is already
// used by another team. Sent to the leader + all members of every "losing"
// team in a duplicate-name group (the highest verified-revenue / most-journals
// / oldest team keeps the name and is never emailed).
type TeamNameDuplicateEmailInput = {
  teamName: string;
  appUrl: string;
};

export function renderTeamNameDuplicateEmail(
  input: TeamNameDuplicateEmailInput,
) {
  const subject = `Quick action needed: your team name "${input.teamName}" is already taken`;

  const teamUrl = `${input.appUrl}/team`;

  const lines = [
    "Hi team,",
    "",
    `We noticed that your team name — "${input.teamName}" — is being used by more than one team in the BRAVE Programme. Team names need to be unique so every team stays easy to identify.`,
    "",
    "Could you please pick a new, unique name for your team? It only takes a minute:",
    `1. Open your team page: ${teamUrl}`,
    "2. Click your team name to edit it",
    "3. Choose a name that isn't already taken (we'll show a hint if it is) and save",
    "",
    "Note: only the team leader can change the team name. If you're a member, please nudge your leader to update it.",
    "",
    "Thanks for helping keep things tidy!",
    "— BRAVE Team",
  ];

  const text = lines.join("\n");

  const html = `
    <div style="font-family: -apple-system, Segoe UI, Roboto, sans-serif; color: #1f2937; line-height: 1.6;">
      <p>Hi team,</p>
      <p>
        We noticed that your team name —
        <strong>"${escapeHtml(input.teamName)}"</strong> — is being used by more
        than one team in the BRAVE Programme. Team names need to be unique so
        every team stays easy to identify.
      </p>
      <p>Could you please pick a new, unique name for your team? It only takes a minute:</p>
      <ol>
        <li>Open your <a href="${teamUrl}">team page</a></li>
        <li>Click your team name to edit it</li>
        <li>Choose a name that isn't already taken (we'll show a hint if it is) and save</li>
      </ol>
      <p style="color:#6b7280;">
        Note: only the team leader can change the team name. If you're a member,
        please nudge your leader to update it.
      </p>
      <p>Thanks for helping keep things tidy!<br/>— BRAVE Team</p>
    </div>
  `;

  return { subject, text, html };
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
