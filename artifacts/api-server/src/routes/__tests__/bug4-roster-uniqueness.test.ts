import { describe, it, expect } from "vitest";
import { AddRosterEntryBody } from "@workspace/api-zod";

// Bug 4: Roster uniqueness should be enforced ONLY on studentId. Email,
// NIAT ID, and full name must be allowed to repeat. The OpenAPI/zod
// contract is the surface area both the frontend and backend rely on,
// so we lock it down here. End-to-end behavior (409 on duplicate
// studentId, allow-duplicate emails on /admin/roster and
// /admin/roster/import) is covered by the manual verification checklist
// in the task — this file pins the contract that drives both.
describe("Bug 4 — AddRosterEntryBody contract", () => {
  it("accepts a payload with no email at all (email is optional)", () => {
    const r = AddRosterEntryBody.safeParse({
      studentId: "S001",
      fullName: "Test Student",
      campusName: "AMET University",
    });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.email == null).toBe(true);
    }
  });

  it("accepts a payload with email explicitly null (email is nullable)", () => {
    const r = AddRosterEntryBody.safeParse({
      studentId: "S002",
      fullName: "Test Student",
      email: null,
      campusName: "AMET University",
    });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.email).toBeNull();
    }
  });

  it("accepts a payload with a real email string", () => {
    const r = AddRosterEntryBody.safeParse({
      studentId: "S003",
      fullName: "Test Student",
      email: "shared@college.edu",
      campusName: "AMET University",
    });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.email).toBe("shared@college.edu");
    }
  });

  it("still rejects payloads missing studentId", () => {
    const r = AddRosterEntryBody.safeParse({
      fullName: "Test Student",
      campusName: "AMET University",
    });
    expect(r.success).toBe(false);
  });

  it("still rejects payloads missing fullName", () => {
    const r = AddRosterEntryBody.safeParse({
      studentId: "S004",
      campusName: "AMET University",
    });
    expect(r.success).toBe(false);
  });

  it("still rejects payloads missing campusName", () => {
    const r = AddRosterEntryBody.safeParse({
      studentId: "S005",
      fullName: "Test Student",
    });
    expect(r.success).toBe(false);
  });
});
