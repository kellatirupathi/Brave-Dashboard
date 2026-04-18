/**
 * CLI entry point for the BRAVE seed routine.
 *
 * Run with:  pnpm --filter @workspace/api-server seed
 *
 * Kept separate from `seed.ts` so the route handler can import `runSeed`
 * without triggering side effects at module load time.
 */

import { pool } from "@workspace/db";
import { runSeed } from "./seed";

runSeed()
  .then(async () => {
    await pool.end();
    process.exit(0);
  })
  .catch(async (err) => {
    console.error("Seed failed:", err);
    await pool.end().catch(() => {});
    process.exit(1);
  });
