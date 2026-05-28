// =============================================================================
// Internal cron endpoint — mirrors Replit prod database into Supabase.
//
// PURE-NODE implementation: uses only the `pg` library that's already a
// transitive dep via @workspace/db. No `pg_dump` or `psql` binaries are
// invoked, so this works in any Node runtime including Replit's deploy
// image (where those binaries may not exist).
//
//   POST /api/internal/cron/backup-supabase
//   Header: X-Cron-Secret: <CRON_SECRET env var>
//
// DESIGN:
//   - DATA-ONLY sync. Assumes Supabase already has the schema (created
//     once via `pnpm --filter @workspace/scripts run backup-supabase`,
//     the pg_dump-based script that runs from the workspace shell).
//   - Wraps everything in a single transaction with deferred FK
//     constraints so partial failures ROLLBACK and leave Supabase
//     untouched — no more "wiped but not restored" disasters.
//   - Paginates source reads (1000 rows / page) so the api-server's
//     memory doesn't spike on big tables like notifications (21k rows).
//   - When the source schema changes (new tables/columns), this route
//     will fail safely. The fix: re-run the pg_dump script once from
//     the workspace shell to sync the schema, then this cron resumes.
//
// IMPORTANT — isolation contract:
//   - This file is independent of every other route. Existing api-
//     server behaviour is unchanged. If you delete this file, only the
//     two lines in `routes/index.ts` that mount it need to go.
//   - Source DB is touched READ-ONLY (SELECT only).
//   - Destination DB: only `public` schema's tables are TRUNCATEd and
//     INSERTed into. Nothing else touched.
//
// Required env vars:
//   CRON_SECRET        — shared secret used by every internal cron route
//   DATABASE_URL       — Replit prod Neon (used in deploy; falls back here)
//   PROD_DATABASE_URL  — optional explicit prod override (preferred)
//   SUPABASE_DB_URL    — Supabase Session Pooler connection string
// =============================================================================

import { Router, type IRouter, type Request, type Response } from "express";
import { Pool, type PoolClient } from "pg";
import { logger } from "../lib/logger";

const router: IRouter = Router();

const QUERY_PAGE_SIZE = 1000;
const INSERT_BATCH_SIZE = 500;
const STATEMENT_TIMEOUT_MS = 5 * 60 * 1000;

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

function quoteIdent(name: string): string {
  return `"${name.replace(/"/g, '""')}"`;
}

interface TableInfo {
  name: string;
  columns: string[];
}

interface SequenceInfo {
  name: string;
  lastValue: number | null;
}

async function listSourceTables(srcPool: Pool): Promise<TableInfo[]> {
  const tables = await srcPool.query<{ table_name: string }>(`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
    ORDER BY table_name
  `);

  const results: TableInfo[] = [];
  for (const row of tables.rows) {
    const cols = await srcPool.query<{ column_name: string }>(
      `SELECT column_name
         FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = $1
         ORDER BY ordinal_position`,
      [row.table_name],
    );
    results.push({
      name: row.table_name,
      columns: cols.rows.map((c: { column_name: string }) => c.column_name),
    });
  }
  return results;
}

async function listSourceSequences(srcPool: Pool): Promise<SequenceInfo[]> {
  const seqs = await srcPool.query<{ sequence_name: string }>(`
    SELECT sequence_name
    FROM information_schema.sequences
    WHERE sequence_schema = 'public'
    ORDER BY sequence_name
  `);
  const out: SequenceInfo[] = [];
  for (const row of seqs.rows) {
    const ident = quoteIdent(row.sequence_name);
    try {
      const r = await srcPool.query<{ last_value: string | number | null }>(
        `SELECT last_value FROM ${ident}`,
      );
      const raw = r.rows[0]?.last_value;
      const lastValue =
        raw == null ? null : typeof raw === "number" ? raw : Number(raw);
      out.push({ name: row.sequence_name, lastValue });
    } catch {
      out.push({ name: row.sequence_name, lastValue: null });
    }
  }
  return out;
}

async function truncateAll(
  dstClient: PoolClient,
  tables: TableInfo[],
): Promise<void> {
  if (tables.length === 0) return;
  const list = tables.map((t) => quoteIdent(t.name)).join(", ");
  await dstClient.query(`TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE`);
}

async function copyTable(
  srcPool: Pool,
  dstClient: PoolClient,
  table: TableInfo,
): Promise<number> {
  if (table.columns.length === 0) return 0;
  const colList = table.columns.map(quoteIdent).join(", ");
  let offset = 0;
  let totalCopied = 0;

  while (true) {
    const page = await srcPool.query(
      `SELECT ${colList} FROM ${quoteIdent(table.name)}
         ORDER BY ${quoteIdent(table.columns[0]!)}
         LIMIT $1 OFFSET $2`,
      [QUERY_PAGE_SIZE, offset],
    );
    if (page.rows.length === 0) break;

    for (let i = 0; i < page.rows.length; i += INSERT_BATCH_SIZE) {
      const batch = page.rows.slice(i, i + INSERT_BATCH_SIZE);
      const values: unknown[] = [];
      const rowPlaceholders: string[] = [];
      for (const row of batch) {
        const colPlaceholders: string[] = [];
        for (const col of table.columns) {
          values.push((row as Record<string, unknown>)[col] ?? null);
          colPlaceholders.push(`$${values.length}`);
        }
        rowPlaceholders.push(`(${colPlaceholders.join(", ")})`);
      }
      await dstClient.query(
        `INSERT INTO ${quoteIdent(table.name)} (${colList})
           VALUES ${rowPlaceholders.join(", ")}`,
        values,
      );
    }

    totalCopied += page.rows.length;
    offset += page.rows.length;
    if (page.rows.length < QUERY_PAGE_SIZE) break;
  }

  return totalCopied;
}

async function syncSequences(
  dstClient: PoolClient,
  sequences: SequenceInfo[],
): Promise<void> {
  for (const seq of sequences) {
    if (seq.lastValue == null || seq.lastValue < 1) continue;
    await dstClient.query(`SELECT setval($1, $2, true)`, [
      `public.${seq.name}`,
      seq.lastValue,
    ]);
  }
}

async function runBackup(): Promise<{
  tablesCopied: number;
  rowsCopied: number;
  elapsedSec: number;
}> {
  const replitUrl =
    process.env["PROD_DATABASE_URL"] ?? process.env["DATABASE_URL"];
  const supabaseUrl = process.env["SUPABASE_DB_URL"];
  const source = process.env["PROD_DATABASE_URL"]
    ? "PROD_DATABASE_URL"
    : "DATABASE_URL";

  if (!replitUrl) {
    throw new Error("Neither PROD_DATABASE_URL nor DATABASE_URL is set");
  }
  if (!supabaseUrl) throw new Error("SUPABASE_DB_URL is not set");
  if (replitUrl === supabaseUrl) {
    throw new Error(
      "Source and destination URLs are the same — refusing to run",
    );
  }

  const startedAt = Date.now();
  logger.info({ source }, "[cron-backup-supabase] backup started");

  const srcPool = new Pool({ connectionString: replitUrl, max: 4 });
  const dstPool = new Pool({ connectionString: supabaseUrl, max: 2 });

  try {
    const [tables, sequences] = await Promise.all([
      listSourceTables(srcPool),
      listSourceSequences(srcPool),
    ]);
    logger.info(
      { tableCount: tables.length, sequenceCount: sequences.length },
      "[cron-backup-supabase] source inventory",
    );

    const dstClient = await dstPool.connect();
    let rowsCopied = 0;
    try {
      await dstClient.query(`SET statement_timeout = ${STATEMENT_TIMEOUT_MS}`);
      await dstClient.query("BEGIN");
      await dstClient.query("SET CONSTRAINTS ALL DEFERRED");

      await truncateAll(dstClient, tables);

      for (const table of tables) {
        const copied = await copyTable(srcPool, dstClient, table);
        rowsCopied += copied;
        logger.info(
          { table: table.name, rows: copied },
          "[cron-backup-supabase] table copied",
        );
      }

      await syncSequences(dstClient, sequences);

      await dstClient.query("COMMIT");
    } catch (err) {
      try {
        await dstClient.query("ROLLBACK");
      } catch {
        // ignore
      }
      throw err;
    } finally {
      dstClient.release();
    }

    const elapsedSec = (Date.now() - startedAt) / 1000;
    return { tablesCopied: tables.length, rowsCopied, elapsedSec };
  } finally {
    await srcPool.end().catch(() => {
      /* noop */
    });
    await dstPool.end().catch(() => {
      /* noop */
    });
  }
}

router.post(
  "/internal/cron/backup-supabase",
  async (req: Request, res: Response): Promise<void> => {
    if (!verifyCronSecret(req, res)) return;

    if (backupInFlight) {
      res.status(202).json({ ok: false, reason: "backup_already_in_flight" });
      return;
    }

    backupInFlight = true;
    const startedAt = new Date().toISOString();

    // Reply immediately so cron-job.org's 30s timeout never fires. The
    // real work runs in the background and logs success/failure.
    res.status(202).json({ ok: true, message: "backup_started", startedAt });

    runBackup()
      .then((result) => {
        logger.info(
          result,
          "[cron-backup-supabase] backup completed successfully",
        );
      })
      .catch((err: unknown) => {
        const e = err as Error;
        // Surface to stdout too so it's visible even if pino is buffered.
        // eslint-disable-next-line no-console
        console.error(
          `[cron-backup-supabase] backup failed: ${e?.message ?? String(err)}`,
        );
        logger.error(
          {
            err: { message: e?.message, stack: e?.stack },
          },
          "[cron-backup-supabase] backup failed",
        );
      })
      .finally(() => {
        backupInFlight = false;
      });
  },
);

export default router;
