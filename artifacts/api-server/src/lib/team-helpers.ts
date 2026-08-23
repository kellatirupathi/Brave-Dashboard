import { eq } from "drizzle-orm";
import { db, teamsTable, milestonesTable } from "@workspace/db";
import { getActiveSeasonId } from "./season";

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

// Currently unreferenced — teams.ts and admin-teams.ts each insert this
// milestone inline inside their creation transaction. Kept and made
// season-aware so it stays correct if a caller is ever reintroduced.
// `seasonId` omitted means the active season.
export async function insertTeamApprovedMilestone(
  teamId: number,
  seasonId?: number,
): Promise<void> {
  await db.insert(milestonesTable).values({
    teamId,
    seasonId: seasonId ?? (await getActiveSeasonId()),
    type: "auto",
    title: "Team Registered",
    description: "Your team has been approved and is now active!",
    date: new Date(),
    isPinned: false,
  });
}
