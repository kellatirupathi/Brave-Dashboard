import { describe, it, expect } from "vitest";
import { SendTeamInvitationBody } from "@workspace/api-zod";

// Bug 1: "Invite a teammate" must accept either an existing-user inviteeId
// OR a roster row id (auto-provisions a placeholder user). The OpenAPI/zod
// contract is the surface area both the frontend and backend rely on.
describe("Bug 1 — SendTeamInvitationBody schema", () => {
  it("accepts an inviteeId-only payload (existing user invite)", () => {
    const r = SendTeamInvitationBody.safeParse({ inviteeId: "user_abc123" });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.inviteeId).toBe("user_abc123");
      expect(r.data.rosterId).toBeUndefined();
    }
  });

  it("accepts a rosterId-only payload (placeholder will be provisioned)", () => {
    const r = SendTeamInvitationBody.safeParse({ rosterId: 42 });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.rosterId).toBe(42);
      expect(r.data.inviteeId).toBeUndefined();
    }
  });

  it("accepts both fields (inviteeId takes precedence in the handler)", () => {
    const r = SendTeamInvitationBody.safeParse({ inviteeId: "u_1", rosterId: 7 });
    expect(r.success).toBe(true);
  });

  it("rejects a non-numeric rosterId", () => {
    const r = SendTeamInvitationBody.safeParse({ rosterId: "not-a-number" });
    expect(r.success).toBe(false);
  });

  it("rejects a non-string inviteeId", () => {
    const r = SendTeamInvitationBody.safeParse({ inviteeId: 123 });
    expect(r.success).toBe(false);
  });
});
