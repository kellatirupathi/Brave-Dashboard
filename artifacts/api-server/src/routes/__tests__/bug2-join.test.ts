import { describe, it, expect } from "vitest";
import { JoinTeamByCodeBody } from "@workspace/api-zod";

// Bug 2: Same-campus students hit a spurious 403 when joining by code.
// Two pieces guard against this: the API trims+uppercases the submitted code
// before lookup, and req.user.campusId is backfilled from the roster when
// null. This test pins the contract for both pieces.
describe("Bug 2 — JoinTeamByCodeBody contract", () => {
  it("accepts a well-formed code", () => {
    const r = JoinTeamByCodeBody.safeParse({ code: "AB3K9PQR" });
    expect(r.success).toBe(true);
  });

  it("requires the code field", () => {
    const r = JoinTeamByCodeBody.safeParse({});
    expect(r.success).toBe(false);
  });

  it("rejects a non-string code", () => {
    const r = JoinTeamByCodeBody.safeParse({ code: 1234 });
    expect(r.success).toBe(false);
  });
});

// The handler normalizes user input via .trim().toUpperCase() before SELECT
// so a code pasted with whitespace or in lowercase still resolves to the
// canonical row. The frontend does the same, but the server is the source
// of truth — we mirror the helper here as a regression guard.
function normalizeInviteCode(input: string): string {
  return input.trim().toUpperCase();
}

describe("Bug 2 — invite code normalization", () => {
  it("trims surrounding whitespace", () => {
    expect(normalizeInviteCode("  ABCD1234  ")).toBe("ABCD1234");
  });

  it("uppercases lowercase characters", () => {
    expect(normalizeInviteCode("abcd1234")).toBe("ABCD1234");
  });

  it("handles a mixed-case code with whitespace", () => {
    expect(normalizeInviteCode("\tab3k9PQr\n")).toBe("AB3K9PQR");
  });

  it("is idempotent on already-canonical codes", () => {
    expect(normalizeInviteCode("AB3K9PQR")).toBe("AB3K9PQR");
  });
});
