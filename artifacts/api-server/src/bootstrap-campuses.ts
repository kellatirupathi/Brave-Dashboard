import { db, campusesTable } from "@workspace/db";
import { sql } from "drizzle-orm";
import { logger } from "./lib/logger";

// The 19 real partner campuses for the BRAVE Programme. This list is the
// single source of truth and is also mirrored in the frontend dropdowns
// (admin/roster.tsx, auth/not-on-roster.tsx). Bootstrap runs on every
// startup and is idempotent — it only inserts campuses that don't already
// exist (matched by exact name, deduplicated via a unique index).
export const CANONICAL_CAMPUS_NAMES = [
  "AMET University",
  "Ajeenkya DY Patil University",
  "Annamacharya University",
  "Aurora Deemed University",
  "Chaitanya \u2013 Deemed to be University",
  "Chalapathi Institute of Engineering and Technology",
  "Chalapathi Institute of Technology, Autonomous",
  "Crescent University",
  "Malla Reddy Vishwavidyapeeth",
  "NIAT - Chevella",
  "NIAT - KKH",
  "NRI Institute of Technology",
  "NSRIT - Nadimpalli Satyanarayana Raju Institute of Technology",
  "Noida International University",
  "S-VYASA University",
  "Sanjay Ghodawat University",
  "Takshashila University",
  "Vivekananda Global University",
  "Yenepoya University",
];

// Idempotent. Throws on failure so the server does NOT continue starting in
// an inconsistent state. Safe to call from multiple processes thanks to the
// unique index on campuses.name + ON CONFLICT DO NOTHING.
export async function bootstrapCanonicalCampuses(): Promise<void> {
  // Ensure the unique index exists (campuses.name has no schema-level unique
  // constraint, so we add one here so ON CONFLICT works and concurrent boots
  // can't insert duplicates).
  await db.execute(sql`CREATE UNIQUE INDEX IF NOT EXISTS campuses_name_unique ON campuses (name)`);

  // Insert all 19; conflicts on existing names are silently ignored.
  // city/state default to 'Unknown' to satisfy the NOT NULL constraint
  // (matching the existing seeded rows).
  const values = CANONICAL_CAMPUS_NAMES.map((name) => ({ name, city: "Unknown", state: "Unknown" }));
  await db.insert(campusesTable).values(values).onConflictDoNothing({ target: campusesTable.name });

  // Re-sync the auto-increment sequence so future inserts don't collide
  // with manually-assigned IDs.
  await db.execute(sql`SELECT setval(pg_get_serial_sequence('campuses', 'id'), GREATEST(COALESCE((SELECT MAX(id) FROM campuses), 1), 1))`);

  const count = await db.select({ name: campusesTable.name }).from(campusesTable);
  logger.info({ total: count.length }, "Canonical campuses bootstrapped");
}
