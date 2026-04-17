import { db, auditLogTable } from "@workspace/db";

export async function logAudit(
  actorId: string,
  action: string,
  targetType: string,
  targetId?: number,
  details?: string
): Promise<void> {
  await db.insert(auditLogTable).values({
    actorId,
    action,
    targetType,
    targetId,
    details,
  });
}
