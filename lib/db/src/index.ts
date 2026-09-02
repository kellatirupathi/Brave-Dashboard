/**
 * The app's Postgres connection.
 *
 * BRAVE_DATABASE_URL is preferred over DATABASE_URL, and the reason is a
 * Replit platform incident (2026-09-01): publishing began failing with
 * "External DATABASE_URL detected. Remove DATABASE_URL from Secrets to use
 * Replit database features." The workaround circulating is to rename the
 * secret -- which works for projects on Replit's MANAGED database, because
 * Replit then injects its own DATABASE_URL at runtime.
 *
 * This project is NOT one of those. Its data lives in an external Neon
 * database and nothing else supplies a connection string, so renaming the
 * secret on its own would point the app at whatever Replit provisions --
 * or at nothing -- and take production down.
 *
 * Reading a name Replit does not police makes the rename safe: set
 * BRAVE_DATABASE_URL to the same Neon URL, and DATABASE_URL can then be
 * renamed or removed without the app noticing. The DATABASE_URL fallback
 * stays so that a workspace which has not set the new secret keeps working
 * exactly as before -- this file is inert until someone opts in.
 *
 * NEON_DATABASE_URL is accepted too, and only because Replit Support names
 * that one in their written instructions for this incident. Whoever performs
 * the rename is following that mail, not this file; accepting both names
 * means picking the "wrong" one is a no-op instead of a server that throws on
 * boot with its database secret sitting right there under another name.
 */
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

const connectionString =
  process.env.BRAVE_DATABASE_URL ??
  process.env.NEON_DATABASE_URL ??
  process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error(
    "BRAVE_DATABASE_URL, NEON_DATABASE_URL or DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

export const pool = new Pool({ connectionString });
export const db = drizzle(pool, { schema });

export * from "./schema";
export * from "./forms-auth";
