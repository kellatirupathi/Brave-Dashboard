import { Router, type IRouter } from "express";
import { eq, sql } from "drizzle-orm";
import { db, announcementsTable, usersTable, teamsTable, teamMembersTable } from "@workspace/db";
import { CreateAnnouncementBody } from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/announcements", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  let campusId = req.user.campusId;
  let teamId: number | null = null;
  if (req.user.role === "student") {
    const [member] = await db.select().from(teamMembersTable).where(eq(teamMembersTable.userId, req.user.id));
    if (member) {
      teamId = member.teamId;
      const [team] = await db.select().from(teamsTable).where(eq(teamsTable.id, member.teamId));
      if (team) campusId = team.campusId;
    }
  }

  let whereClause = sql`target = 'all'`;
  if (campusId) whereClause = sql`target = 'all' or (target = 'campus' and campus_id = ${campusId})`;
  if (teamId) whereClause = sql`target = 'all' or (target = 'campus' and campus_id = ${campusId}) or (target = 'team' and team_id = ${teamId})`;

  const announcements = await db
    .select()
    .from(announcementsTable)
    .where(whereClause)
    .orderBy(sql`created_at desc`);

  const result = await Promise.all(announcements.map(async (a) => {
    const [author] = await db.select().from(usersTable).where(eq(usersTable.id, a.authorId));
    return { ...a, authorName: author ? `${author.firstName} ${author.lastName}` : "Admin" };
  }));
  res.json(result);
});

router.post("/announcements", async (req, res): Promise<void> => {
  if (!req.isAuthenticated() || !["coordinator", "admin"].includes(req.user.role ?? "")) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  const parsed = CreateAnnouncementBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [announcement] = await db
    .insert(announcementsTable)
    .values({ ...parsed.data, authorId: req.user.id })
    .returning();
  const [author] = await db.select().from(usersTable).where(eq(usersTable.id, req.user.id));
  res.status(201).json({ ...announcement, authorName: author ? `${author.firstName} ${author.lastName}` : "Admin" });
});

export default router;
