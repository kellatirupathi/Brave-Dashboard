import { eq } from "drizzle-orm";
import { db, teamsTable, milestonesTable } from "@workspace/db";

export function generateInviteCode(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < 8; i++) {
    out += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return out;
}

export async function generateUniqueInviteCode(): Promise<string> {
  for (let i = 0; i < 8; i++) {
    const code = generateInviteCode();
    const [existing] = await db
      .select()
      .from(teamsTable)
      .where(eq(teamsTable.inviteCode, code));
    if (!existing) return code;
  }
  return generateInviteCode() + generateInviteCode().slice(0, 4);
}

export async function insertTeamApprovedMilestone(teamId: number): Promise<void> {
  await db.insert(milestonesTable).values({
    teamId,
    type: "auto",
    title: "Team Registered",
    description: "Your team has been approved and is now active!",
    date: new Date(),
    isPinned: false,
  });
}
