import { db, notificationsTable } from "@workspace/db";

export async function createNotification(
  userId: string,
  title: string,
  body: string,
  type: string,
  link?: string
): Promise<void> {
  await db.insert(notificationsTable).values({
    userId,
    title,
    body,
    type,
    link,
    isRead: false,
  });
}
