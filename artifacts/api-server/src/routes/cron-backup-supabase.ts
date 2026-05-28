// Internal cron endpoint — mirrors the entire Replit prod database into the
// brave_niat Supabase project. Designed to be triggered every 2 days at
// 2:00 AM IST (20:30 UTC the previous day) by an external HTTP cron such
// as cron-job.org.
//
//   POST /api/internal/cron/backup-supabase
//   Header: X-Cron-Secret: <CRON_SECRET env var>
//
// IMPORTANT — isolation contract:
//   - This file is completely independent of every other route. The api-
//     server's existing behaviour is unchanged. If this file is deleted,
//     only the single line in `routes/index.ts` that mounts it needs to go
//     and the app keeps running.
//   - The Replit source DB is touched READ-ONLY (`pg_dump` only issues
//     SELECT + reads catalogs). No schema, no data, no permissions on the
//     source DB are modified.
//   - The Supabase destination DB has its `public` schema dropped and
//     recreated from the dump. NOTHING ELSE is touched on Supabase.
//
// Required env vars:
//   CRON_SECRET        — already present, shared with the other cron routes
//   DATABASE_URL       — already present, Replit Neon source
//   SUPABASE_DB_URL    — NEW: Supabase target connection string (must be
//                        added in Replit → Tools → Secrets)
//
// Required binaries on PATH (Replit deploy image already ships them):
//   pg_dump, psql

import { Router, type IRouter, type Request, type Response } from "express";
import { spawn, type ChildProcess } from "node:child_process";
import { logger } from "../lib/logger";

const router: IRouter = Router();

const BACKUP_TIMEOUT_MS = 15 * 60 * 1000; // 15 minutes
let backupInFlight = false;

function verifyCronSecret(req: Request, res: Response): boolean {
  const expected = process.env["CRON_SECRET"];
  if (!expected) {
    logger.error(
      "[cron-backup-supabase] CRON_SECRET is not configured on the server",
    );
    res.status(500).json({ error: "CRON_SECRET not configured" });
    return false;
  }
  const provided = req.header("x-cron-secret");
  if (provided !== expected) {
    res.status(403).json({ error: "Invalid cron secret" });
    return false;
  }
  return true;
}

function waitForChild(
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
      if (code === 0) return resolve();
      reject(
        new Error(
          `${name} exited with code=${code} signal=${signal ?? "none"}`,
        ),
      );
    });
  });
}

async function runBackup(): Promise<void> {
  // Prefer the explicit PROD_DATABASE_URL when set so we never accidentally
  // back up dev data — falls back to the api-server's own DATABASE_URL
  // (which IS the prod DB when this code is deployed).
  const replitUrl =
    process.env["PROD_DATABASE_URL"] ?? process.env["DATABASE_URL"];
  const sourceLabel = process.env["PROD_DATABASE_URL"]
    ? "PROD_DATABASE_URL"
    : "DATABASE_URL";
  const supabaseUrl = process.env["SUPABASE_DB_URL"];

  if (!replitUrl) {
    throw new Error("Neither PROD_DATABASE_URL nor DATABASE_URL is set");
  }
  if (!supabaseUrl) throw new Error("SUPABASE_DB_URL is not set");
  logger.info(
    { source: sourceLabel },
    "[cron-backup-supabase] starting backup",
  );
  if (replitUrl === supabaseUrl) {
    throw new Error(
      "DATABASE_URL and SUPABASE_DB_URL point to the same database",
    );
  }

  // Step 1 — wipe Supabase's public schema (clean slate so the dump can
  // recreate every table with identical DDL).
  const wipe = spawn(
    "psql",
    [
      supabaseUrl,
      "-v",
      "ON_ERROR_STOP=1",
      "-c",
      "DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public; GRANT ALL ON SCHEMA public TO postgres; GRANT ALL ON SCHEMA public TO public;",
    ],
    { stdio: ["ignore", "ignore", "pipe"] },
  );
  let wipeErr = "";
  wipe.stderr?.on("data", (d: Buffer) => {
    wipeErr += d.toString();
  });
  await waitForChild(wipe, "psql (wipe)", 60_000).catch((err) => {
    throw new Error(`${err.message} :: stderr=${wipeErr.trim()}`);
  });

  // Step 2 — pg_dump from Replit → psql to Supabase.
  const dump = spawn(
    "pg_dump",
    [
      "--no-owner",
      "--no-acl",
      "--no-comments",
      "--schema=public",
      "--format=plain",
      replitUrl,
    ],
    { stdio: ["ignore", "pipe", "pipe"] },
  );
  const restore = spawn("psql", [supabaseUrl, "-v", "ON_ERROR_STOP=1"], {
    stdio: ["pipe", "ignore", "pipe"],
  });

  let dumpErr = "";
  dump.stderr?.on("data", (d: Buffer) => {
    dumpErr += d.toString();
  });
  let restoreErr = "";
  restore.stderr?.on("data", (d: Buffer) => {
    restoreErr += d.toString();
  });

  dump.stdout!.pipe(restore.stdin!);
  restore.on("close", () => {
    if (!dump.killed && dump.exitCode === null) dump.kill("SIGTERM");
  });

  try {
    await Promise.all([
      waitForChild(dump, "pg_dump", BACKUP_TIMEOUT_MS),
      waitForChild(restore, "psql (restore)", BACKUP_TIMEOUT_MS),
    ]);
  } catch (err) {
    const base = (err as Error).message;
    const detail = [
      dumpErr.trim() && `pg_dump stderr=${dumpErr.trim()}`,
      restoreErr.trim() && `psql stderr=${restoreErr.trim()}`,
    ]
      .filter(Boolean)
      .join(" :: ");
    throw new Error(detail ? `${base} :: ${detail}` : base);
  }
}

router.post(
  "/internal/cron/backup-supabase",
  async (req: Request, res: Response): Promise<void> => {
    if (!verifyCronSecret(req, res)) return;

    // Reject overlapping runs — protects the source DB from a second
    // concurrent pg_dump if cron-job.org retries before the previous run
    // finishes.
    if (backupInFlight) {
      res.status(202).json({
        ok: false,
        reason: "backup_already_in_flight",
      });
      return;
    }

    backupInFlight = true;
    const startedAt = Date.now();
    logger.info("[cron-backup-supabase] backup started");

    // Respond immediately so cron-job.org's 30s timeout doesn't fail the
    // job. The actual sync runs in the background and logs the outcome.
    res.status(202).json({
      ok: true,
      message: "backup_started",
      startedAt: new Date(startedAt).toISOString(),
    });

    // Fire-and-forget background run.
    runBackup()
      .then(() => {
        const elapsedSec = ((Date.now() - startedAt) / 1000).toFixed(1);
        logger.info(
          { elapsedSec },
          "[cron-backup-supabase] backup completed successfully",
        );
      })
      .catch((err: unknown) => {
        const elapsedSec = ((Date.now() - startedAt) / 1000).toFixed(1);
        logger.error(
          { err, elapsedSec },
          "[cron-backup-supabase] backup failed",
        );
      })
      .finally(() => {
        backupInFlight = false;
      });
  },
);

export default router;
