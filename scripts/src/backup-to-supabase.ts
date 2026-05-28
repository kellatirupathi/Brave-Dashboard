// =============================================================================
// Supabase Backup — Full DB mirror, every 2 days at 2 AM IST.
//
// Reads schema + data from the Replit Neon prod DB (DATABASE_URL) and pipes
// it into a Supabase project (SUPABASE_DB_URL). Uses `pg_dump` + `psql` so
// the destination schema is byte-identical to source — no Drizzle-side
// codegen required, no chance of schema drift.
//
// Source DB is touched READ-ONLY. The api-server is not aware this script
// exists; if this file is deleted tomorrow, the app keeps running unchanged.
//
// Manual run:
//   pnpm --filter @workspace/scripts run backup-supabase
//
// Scheduled run (Replit Scheduled Deployment or external cron):
//   - Command:  pnpm --filter @workspace/scripts run backup-supabase
//   - Schedule: 0 20 */2 * *   (UTC = 2:00 AM IST every other day)
//
// Required env vars:
//   DATABASE_URL       — Replit prod Neon connection string (READ source)
//   SUPABASE_DB_URL    — Supabase project connection string (WRITE target)
//
// Required binaries on PATH:
//   pg_dump, psql      — bundled with the postgresql-client package; available
//                        on Replit's default Node image.
// =============================================================================

import { spawn, type ChildProcess } from "node:child_process";

const REPLIT_DB_URL = process.env["DATABASE_URL"];
const SUPABASE_DB_URL = process.env["SUPABASE_DB_URL"];

const TIMEOUT_MS = 15 * 60 * 1000; // 15 minutes — generous for 1 GB+ growth

function fail(msg: string): never {
  console.error(`[backup-supabase] FAIL: ${msg}`);
  process.exit(1);
}

function waitFor(
  proc: ChildProcess,
  name: string,
  timeoutMs: number,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      proc.kill("SIGKILL");
      reject(new Error(`${name} timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    proc.on("error", (err) => {
      clearTimeout(timer);
      reject(new Error(`${name} failed to spawn: ${err.message}`));
    });

    proc.on("close", (code, signal) => {
      clearTimeout(timer);
      if (code === 0) {
        resolve();
        return;
      }
      reject(
        new Error(
          `${name} exited with code=${code} signal=${signal ?? "none"}`,
        ),
      );
    });
  });
}

async function dropSupabasePublicSchema(): Promise<void> {
  console.log(
    "[backup-supabase] Step 1/2: wiping Supabase public schema for clean reload…",
  );
  // ONLY drop the schema — do NOT recreate it. pg_dump's own output
  // includes `CREATE SCHEMA public`, and if we pre-create it here, the
  // restore aborts with "schema public already exists" under ON_ERROR_STOP=1.
  const proc = spawn(
    "psql",
    [
      SUPABASE_DB_URL!,
      "-v",
      "ON_ERROR_STOP=1",
      "-c",
      "DROP SCHEMA IF EXISTS public CASCADE;",
    ],
    { stdio: ["ignore", "inherit", "inherit"] },
  );
  await waitFor(proc, "psql (wipe)", 60_000);
}

async function dumpAndRestore(): Promise<void> {
  console.log(
    "[backup-supabase] Step 2/2: pg_dump from Replit → psql to Supabase…",
  );

  const dump = spawn(
    "pg_dump",
    [
      "--no-owner",
      "--no-acl",
      "--no-comments",
      "--schema=public",
      "--format=plain",
      REPLIT_DB_URL!,
    ],
    { stdio: ["ignore", "pipe", "inherit"] },
  );

  const restore = spawn("psql", [SUPABASE_DB_URL!, "-v", "ON_ERROR_STOP=1"], {
    stdio: ["pipe", "inherit", "inherit"],
  });

  // Wire pg_dump stdout → psql stdin.
  dump.stdout!.pipe(restore.stdin!);

  // Both have to exit cleanly. If pg_dump dies, psql will see EOF on its
  // stdin and exit naturally; if psql dies first we still want pg_dump to
  // know so we forward the kill.
  restore.on("close", () => {
    if (!dump.killed && dump.exitCode === null) {
      dump.kill("SIGTERM");
    }
  });

  await Promise.all([
    waitFor(dump, "pg_dump", TIMEOUT_MS),
    waitFor(restore, "psql (restore)", TIMEOUT_MS),
  ]);
}

async function main(): Promise<void> {
  const startedAt = Date.now();
  console.log(
    `[backup-supabase] Starting Supabase backup at ${new Date().toISOString()}`,
  );

  if (!REPLIT_DB_URL) fail("DATABASE_URL is not set");
  if (!SUPABASE_DB_URL) fail("SUPABASE_DB_URL is not set");

  if (REPLIT_DB_URL === SUPABASE_DB_URL) {
    fail("DATABASE_URL and SUPABASE_DB_URL point to the same database");
  }

  try {
    await dropSupabasePublicSchema();
    await dumpAndRestore();
  } catch (err) {
    fail((err as Error).message ?? String(err));
  }

  const elapsedSec = ((Date.now() - startedAt) / 1000).toFixed(1);
  console.log(
    `[backup-supabase] Backup complete in ${elapsedSec}s — Supabase mirror is up to date.`,
  );
}

main();
