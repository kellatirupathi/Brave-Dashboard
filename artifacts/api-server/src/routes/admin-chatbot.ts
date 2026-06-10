import { Router, type IRouter } from "express";
import { asc, desc, eq, isNotNull, sql } from "drizzle-orm";
import {
  db,
  chatbotHistoryTable,
  usersTable,
  campusesTable,
} from "@workspace/db";

const router: IRouter = Router();

function requireAdmin(
  req: Parameters<Parameters<IRouter["get"]>[1]>[0],
  res: Parameters<Parameters<IRouter["get"]>[1]>[1],
): boolean {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return false;
  }
  if (req.user.role !== "admin") {
    res.status(403).json({ error: "Forbidden" });
    return false;
  }
  return true;
}

// GET /admin/chatbot-history — one row per user who has chatted, with their
// question count + last-chatted time. Sorted most-recent first.
router.get("/admin/chatbot-history", async (req, res): Promise<void> => {
  if (!requireAdmin(req, res)) return;
  try {
    const rows = await db
      .select({
        userId: chatbotHistoryTable.userId,
        questions: sql<number>`count(*) filter (where ${chatbotHistoryTable.role} = 'user')`,
        totalMessages: sql<number>`count(*)`,
        lastChattedAt: sql<string>`max(${chatbotHistoryTable.createdAt})`,
        firstName: usersTable.firstName,
        lastName: usersTable.lastName,
        email: usersTable.email,
        niatId: usersTable.niatId,
        role: usersTable.role,
        campusName: campusesTable.name,
      })
      .from(chatbotHistoryTable)
      .leftJoin(usersTable, eq(usersTable.id, chatbotHistoryTable.userId))
      .leftJoin(campusesTable, eq(campusesTable.id, usersTable.campusId))
      .where(isNotNull(chatbotHistoryTable.userId))
      .groupBy(
        chatbotHistoryTable.userId,
        usersTable.firstName,
        usersTable.lastName,
        usersTable.email,
        usersTable.niatId,
        usersTable.role,
        campusesTable.name,
      )
      .orderBy(desc(sql`max(${chatbotHistoryTable.createdAt})`));

    res.json({
      items: rows.map((r) => ({
        userId: r.userId,
        name:
          `${r.firstName ?? ""} ${r.lastName ?? ""}`.trim() ||
          r.email ||
          "Unknown user",
        email: r.email ?? null,
        niatId: r.niatId ?? null,
        role: r.role ?? null,
        campusName: r.campusName ?? null,
        questions: Number(r.questions ?? 0),
        totalMessages: Number(r.totalMessages ?? 0),
        lastChattedAt: r.lastChattedAt
          ? new Date(r.lastChattedAt).toISOString()
          : null,
      })),
    });
  } catch (err) {
    req.log.error({ err }, "[admin/chatbot-history] list failed");
    res.status(500).json({ error: "Failed to load chatbot history" });
  }
});

// GET /admin/chatbot-history/:userId — that user's full message thread, oldest
// first, plus their header (name / niat id / campus / role).
router.get(
  "/admin/chatbot-history/:userId",
  async (req, res): Promise<void> => {
    if (!requireAdmin(req, res)) return;
    const userId = req.params["userId"];
    if (!userId) {
      res.status(400).json({ error: "Invalid user id" });
      return;
    }
    try {
      const [user] = await db
        .select({
          id: usersTable.id,
          firstName: usersTable.firstName,
          lastName: usersTable.lastName,
          email: usersTable.email,
          niatId: usersTable.niatId,
          role: usersTable.role,
          campusName: campusesTable.name,
        })
        .from(usersTable)
        .leftJoin(campusesTable, eq(campusesTable.id, usersTable.campusId))
        .where(eq(usersTable.id, userId));

      const messages = await db
        .select({
          id: chatbotHistoryTable.id,
          role: chatbotHistoryTable.role,
          message: chatbotHistoryTable.message,
          conversationId: chatbotHistoryTable.conversationId,
          createdAt: chatbotHistoryTable.createdAt,
        })
        .from(chatbotHistoryTable)
        .where(eq(chatbotHistoryTable.userId, userId))
        .orderBy(asc(chatbotHistoryTable.createdAt));

      res.json({
        user: user
          ? {
              id: user.id,
              name:
                `${user.firstName ?? ""} ${user.lastName ?? ""}`.trim() ||
                user.email ||
                "Unknown user",
              email: user.email ?? null,
              niatId: user.niatId ?? null,
              role: user.role ?? null,
              campusName: user.campusName ?? null,
            }
          : {
              id: userId,
              name: "Unknown user",
              email: null,
              niatId: null,
              role: null,
              campusName: null,
            },
        messages: messages.map((m) => ({
          id: m.id,
          role: m.role,
          message: m.message,
          conversationId: m.conversationId,
          createdAt: m.createdAt.toISOString(),
        })),
      });
    } catch (err) {
      req.log.error({ err, userId }, "[admin/chatbot-history] detail failed");
      res.status(500).json({ error: "Failed to load conversation" });
    }
  },
);

export default router;
