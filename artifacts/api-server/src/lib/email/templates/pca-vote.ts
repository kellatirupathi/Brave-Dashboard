// Email sent to every eligible voter (leaders + members of teams above the
// PCA revenue bar) when an admin opens People's Choice Award voting.
type PcaVotingOpenInput = {
  teamName: string;
  appUrl: string;
};

export function renderPcaVotingOpenEmail(input: PcaVotingOpenInput) {
  const subject = "Voting is open — BRAVE People's Choice Award 🏆";
  const lines = [
    `Hi Team ${input.teamName},`,
    "",
    "Voting for the BRAVE People's Choice Award is now open, and you're one of the people who gets a say.",
    "",
    "Pick the team whose work impressed you most, add a line on why, and submit. A few things to know:",
    "  • You get one vote, and it can't be changed — so pick carefully.",
    "  • You can't vote for your own team.",
    "",
    `Cast your vote: ${input.appUrl}/vote/people-choice-award`,
    "",
    "— BRAVE Team",
  ];
  const text = lines.join("\n");
  const html = `
    <div style="font-family:Arial,Helvetica,sans-serif;color:#1a1d21;line-height:1.6">
      <p>Hi Team <strong>${input.teamName}</strong>,</p>
      <p>Voting for the <strong>BRAVE People's Choice Award</strong> is now open,
      and you're one of the people who gets a say.</p>
      <p>Pick the team whose work impressed you most, add a line on why, and submit.
      A few things to know:</p>
      <ul style="padding-left:18px;margin:12px 0">
        <li>You get <strong>one vote</strong>, and it can't be changed — so pick carefully.</li>
        <li>You can't vote for your own team.</li>
      </ul>
      <p><a href="${input.appUrl}/vote/people-choice-award"
        style="display:inline-block;background:#C0392B;color:#fff;text-decoration:none;
        padding:11px 20px;border-radius:8px;font-weight:600">Cast your vote</a></p>
      <p>— BRAVE Team</p>
    </div>`;
  return { subject, text, html };
}
