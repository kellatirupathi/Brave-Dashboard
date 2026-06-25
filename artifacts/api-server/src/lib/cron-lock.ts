// Durable, cross-instance locks for cron jobs.
//
// The previous guards were per-process module-level booleans
// (`backupInFlight`, `reelsRunInFlight`, `reminderRunInFlight`). On an
// autoscale deployment there can be more than one running instance, so a
// boolean in one process cannot stop a second process (or a cron-job.org
// retry routed to a different instance) from starting an overlapping run.
//
// Postgres advisory locks are global to the database, so they coordinate
// across every instance. We hold the lock on a dedicated pooled connection
// for the entire duration of the job and always release it.
import { pool } from "@workspace/db";
import { logger } from "./logger";

// Stable 31-bit positive hash of a lock name → advisory-lock key. The space of
// cron lock names is tiny and fixed, so collisions are not a practical concern.
function lockKey(name: string): number {
  let h = 0;
  for (let i = 0; i < name.length; i++) {
    h = (Math.imul(31, h) + name.charCodeAt(i)) | 0;
  }
  return h & 0x7fffffff;
}

export interface CronLock {
  release: () => Promise<void>;
}

// Try to acquire a cross-instance advisory lock by name. Returns a handle whose
// `release()` frees the lock and the underlying connection, or `null` if the
// lock is already held elsewhere (another instance / an in-flight run).
export async function tryAcquireCronLock(
  name: string,
): Promise<CronLock | null> {
  const key = lockKey(name);
  const client = await pool.connect();
  try {
    const result = await client.query<{ locked: boolean }>(
      "SELECT pg_try_advisory_lock($1) AS locked",
      [key],
    );
    if (!result.rows[0]?.locked) {
      client.release();
      return null;
    }
  } catch (err) {
    client.release();
    throw err;
  }

  let released = false;
  return {
    release: async () => {
      if (released) return;
      released = true;
      try {
        await client.query("SELECT pg_advisory_unlock($1)", [key]);
      } catch (err) {
        logger.error(
          { err, name },
          "[cron-lock] failed to release advisory lock",
        );
      } finally {
        client.release();
      }
    },
  };
}
