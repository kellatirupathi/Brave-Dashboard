import { Router, type IRouter } from "express";
import { and, desc, eq, notInArray, sql } from "drizzle-orm";
import {
  db,
  announcementsTable,
  announcementDismissalsTable,
  usersTable,
  teamsTable,
  teamMembersTable,
} from "@workspace/db";
import {
  CreateAnnouncementBody,
  UpdateAnnouncementBody,
  UpdateAnnouncementParams,
  DeleteAnnouncementParams,
  DismissAnnouncementParams,
} from "@workspace/api-zod";
import { createNotification } from "../lib/notifications";

const router: IRouter = Router();

// Resolve which student userIds should receive a notification for an
// announcement, given its target/audience. Coordinators and admins are
// excluded — they manage announcements rather than receive them.
async function resolveNotificationRecipients(announcement: {
  id: number;
  authorId: string;
  target: "all" | "campus" | "team";
  campusId: number | null;
  teamId: number | null;
}): Promise<string[]> {
  if (announcement.target === "team" && announcement.teamId != null) {
    const members = await db
      .select({ userId: teamMembersTable.userId })
      .from(teamMembersTable)
      .where(eq(teamMembersTable.teamId, announcement.teamId));
    return members.map((m) => m.userId);
  }
  if (announcement.target === "campus" && announcement.campusId != null) {
    const rows = await db
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(
        and(
          eq(usersTable.role, "student"),
          eq(usersTable.campusId, announcement.campusId),
        ),
      );
    return rows.map((r) => r.id);
  }
  // target === "all"
  const rows = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(eq(usersTable.role, "student"));
  return rows.map((r) => r.id);
}

async function fanOutNotifications(
  announcement: {
    id: number;
    authorId: string;
    target: "all" | "campus" | "team";
    campusId: number | null;
    teamId: number | null;
    title: string;
    body: string;
  },
  log: { warn: (obj: unknown, msg: string) => void },
): Promise<void> {
  const recipients = await resolveNotificationRecipients(announcement);
  // Don't notify the author about their own post.
  const filtered = recipients.filter((id) => id !== announcement.authorId);
  await Promise.all(
    filtered.map((userId) =>
      createNotification(
        userId,
        announcement.title,
        announcement.body,
        "announcement",
        "/notifications",
      ).catch((err: unknown) =>
        log.warn(
          { err, announcementId: announcement.id, userId },
          "Failed to create notification for announcement recipient",
        ),
      ),
    ),
  );
}

// Enforce audience consistency: target=all clears campus/team; target=campus
// requires a campusId; target=team requires a teamId. Returns null if valid
// or an error message otherwise.
function validateAudience(input: {
  target: "all" | "campus" | "team";
  campusId?: number | null;
  teamId?: number | null;
}): string | null {
  if (input.target === "all") return null;
  if (input.target === "campus" && (input.campusId == null || input.campusId <= 0))
    return "campusId is required when target='campus'";
  if (input.target === "team" && (input.teamId == null || input.teamId <= 0))
    return "teamId is required when target='team'";
  return null;
}

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

// Returns the most recent pinned announcement targeting the current user
// that the current user has not yet dismissed. May return null.
router.get("/announcements/pinned", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  let campusId = req.user.campusId;
  let teamId: number | null = null;
  if (req.user.role === "student") {
    const [member] = await db
      .select()
      .from(teamMembersTable)
      .where(eq(teamMembersTable.userId, req.user.id));
    if (member) {
      teamId = member.teamId;
      const [team] = await db
        .select()
        .from(teamsTable)
        .where(eq(teamsTable.id, member.teamId));
      if (team) campusId = team.campusId;
    }
  }

  // Wrap in parens so this OR-expression doesn't leak when AND-ed with the
  // other filters below (SQL precedence: AND binds tighter than OR).
  let audienceClause = sql`(target = 'all')`;
  if (campusId)
    audienceClause = sql`(target = 'all' or (target = 'campus' and campus_id = ${campusId}))`;
  if (teamId)
    audienceClause = sql`(target = 'all' or (target = 'campus' and campus_id = ${campusId}) or (target = 'team' and team_id = ${teamId}))`;

  // Fetch dismissed announcement ids for this user once.
  const dismissedRows = await db
    .select({ id: announcementDismissalsTable.announcementId })
    .from(announcementDismissalsTable)
    .where(eq(announcementDismissalsTable.userId, req.user.id));
  const dismissedIds = dismissedRows.map((r) => r.id);

  const baseConditions = [
    eq(announcementsTable.pinToDashboard, true),
    audienceClause,
  ];
  if (dismissedIds.length > 0) {
    baseConditions.push(notInArray(announcementsTable.id, dismissedIds));
  }

  const [pinned] = await db
    .select()
    .from(announcementsTable)
    .where(and(...baseConditions))
    .orderBy(desc(announcementsTable.createdAt))
    .limit(1);

  if (!pinned) {
    res.json(null);
    return;
  }
  const [author] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.id, pinned.authorId));
  res.json({
    ...pinned,
    authorName: author ? `${author.firstName} ${author.lastName}` : "Admin",
  });
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
  const audienceErr = validateAudience(parsed.data);
  if (audienceErr) {
    res.status(400).json({ error: audienceErr });
    return;
  }
  // Normalize: when target=all, drop any stray campus/team ids so audience
  // resolution and notification fan-out cannot match the wrong scope.
  const normalized = {
    ...parsed.data,
    campusId: parsed.data.target === "all" ? null : parsed.data.campusId ?? null,
    teamId: parsed.data.target === "team" ? parsed.data.teamId ?? null : null,
  };
  const [announcement] = await db
    .insert(announcementsTable)
    .values({ ...normalized, authorId: req.user.id })
    .returning();
  const [author] = await db.select().from(usersTable).where(eq(usersTable.id, req.user.id));

  // Fire-and-record the fan-out. We await it so a failure surfaces in logs,
  // but individual createNotification failures don't block the response.
  try {
    await fanOutNotifications(
      {
        id: announcement.id,
        authorId: announcement.authorId,
        target: announcement.target,
        campusId: announcement.campusId,
        teamId: announcement.teamId,
        title: announcement.title,
        body: announcement.body,
      },
      req.log,
    );
  } catch (err) {
    req.log.error(
      { err, announcementId: announcement.id },
      "Announcement created but notification fan-out failed",
    );
  }

  res.status(201).json({ ...announcement, authorName: author ? `${author.firstName} ${author.lastName}` : "Admin" });
});

// Permanently dismiss a pinned announcement for the current user. Idempotent.
router.post(
  "/announcements/:id/dismiss",
  async (req, res): Promise<void> => {
    if (!req.isAuthenticated()) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    const params = DismissAnnouncementParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    // If the announcement was already deleted, treat dismiss as a no-op
    // rather than returning a 500 from the FK violation.
    const [existing] = await db
      .select({ id: announcementsTable.id })
      .from(announcementsTable)
      .where(eq(announcementsTable.id, params.data.id));
    if (!existing) {
      res.status(204).end();
      return;
    }
    await db
      .insert(announcementDismissalsTable)
      .values({ userId: req.user.id, announcementId: params.data.id })
      .onConflictDoNothing();
    res.status(204).end();
  },
);

router.patch("/announcements/:id", async (req, res): Promise<void> => {
  if (!req.isAuthenticated() || !["coordinator", "admin"].includes(req.user.role ?? "")) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  const params = UpdateAnnouncementParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = UpdateAnnouncementBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [existing] = await db
    .select()
    .from(announcementsTable)
    .where(eq(announcementsTable.id, params.data.id));
  if (!existing) {
    res.status(404).json({ error: "Announcement not found" });
    return;
  }
  // Coordinators may only edit their own announcements; admins can edit any.
  if (req.user.role !== "admin" && existing.authorId !== req.user.id) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  // Validate audience consistency against the merged result of existing+patch.
  const merged = {
    target: parsed.data.target ?? existing.target,
    campusId:
      parsed.data.campusId !== undefined ? parsed.data.campusId : existing.campusId,
    teamId:
      parsed.data.teamId !== undefined ? parsed.data.teamId : existing.teamId,
  };
  const audienceErr = validateAudience(merged);
  if (audienceErr) {
    res.status(400).json({ error: audienceErr });
    return;
  }
  // Normalize fields if target is being changed so we never persist stray ids.
  const updateValues = {
    ...parsed.data,
    ...(parsed.data.target !== undefined
      ? {
          campusId: merged.target === "all" ? null : merged.campusId,
          teamId: merged.target === "team" ? merged.teamId : null,
        }
      : {}),
  };

  const [announcement] = await db
    .update(announcementsTable)
    .set(updateValues as Partial<typeof announcementsTable.$inferInsert>)
    .where(eq(announcementsTable.id, params.data.id))
    .returning();
  const [author] = await db.select().from(usersTable).where(eq(usersTable.id, announcement.authorId));
  res.json({ ...announcement, authorName: author ? `${author.firstName} ${author.lastName}` : "Admin" });
});

router.delete("/announcements/:id", async (req, res): Promise<void> => {
  if (!req.isAuthenticated() || !["coordinator", "admin"].includes(req.user.role ?? "")) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  const params = DeleteAnnouncementParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [existing] = await db
    .select()
    .from(announcementsTable)
    .where(eq(announcementsTable.id, params.data.id));
  if (!existing) {
    res.status(404).json({ error: "Announcement not found" });
    return;
  }
  if (req.user.role !== "admin" && existing.authorId !== req.user.id) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  await db.delete(announcementsTable).where(eq(announcementsTable.id, params.data.id));
  res.status(204).end();
});

export default router;
