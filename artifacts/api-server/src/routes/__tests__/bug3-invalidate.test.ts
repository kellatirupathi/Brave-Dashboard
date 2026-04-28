import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// Bug 3: After create-team and other membership mutations, the SPA stayed
// stale until logout/login. The fix exposes a single helper —
// `invalidateMembershipQueries` — in the brave-dashboard `lib/queries.ts`
// which both client pages must call. We assert the helper exists and the
// required query keys are listed, so downstream pages won't silently lose
// invalidations if the keys ever drift.
const QUERIES_FILE = resolve(
  __dirname,
  "../../../../brave-dashboard/src/lib/queries.ts",
);

const REQUIRED_KEYS: ReadonlyArray<string> = [
  '["auth", "user"]',
  '["my-team"]',
  '["team-members"]',
  '["invitations", "mine"]',
  '["join-requests", "mine"]',
  '["leave-requests", "mine"]',
  '["dashboard"]',
  '["notifications"]',
  '["projects"]',
  '["leaderboard"]',
];

describe("Bug 3 — invalidateMembershipQueries contract", () => {
  const source = readFileSync(QUERIES_FILE, "utf8");

  it("exports the invalidateMembershipQueries helper", () => {
    expect(source).toMatch(/export function invalidateMembershipQueries/);
  });

  it("accepts a teamId so ['team', teamId] can be invalidated", () => {
    expect(source).toMatch(/teamId/);
    expect(source).toMatch(/\["team",\s*teamId\]/);
  });

  for (const key of REQUIRED_KEYS) {
    it(`includes the ${key} query key`, () => {
      expect(source).toContain(key);
    });
  }

  it("uses the SPA router (no full page reload)", () => {
    // Belt-and-braces: callers should be using setLocation / wouter, not
    // window.location.reload(). The util itself must never trigger a reload.
    expect(source).not.toMatch(/location\.reload/);
    expect(source).not.toMatch(/window\.location\s*=/);
  });
});
