import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Request } from "express";

const mocks = vi.hoisted(() => ({
  getConfig: vi.fn(),
  resolveSeason: vi.fn(),
}));

vi.mock("@workspace/db", () => ({
  db: {},
  programmeConfigTable: {},
}));

vi.mock("../../lib/season", () => ({
  getConfig: mocks.getConfig,
  resolveSeason: mocks.resolveSeason,
}));

vi.mock("../../lib/require-admin-page", () => ({
  requireAdminPage: () => (_req: unknown, _res: unknown, next: () => void) =>
    next(),
}));

vi.mock("../../lib/audit", () => ({
  logAudit: vi.fn(),
}));

function request(role: "student" | "coordinator" | "admin"): Request {
  return {
    user: { id: "test-user", role },
  } as unknown as Request;
}

describe("Weekly Journal submissions lock", () => {
  beforeEach(() => {
    mocks.getConfig.mockReset();
    mocks.resolveSeason.mockReset();
    mocks.resolveSeason.mockResolvedValue(2);
  });

  it("blocks a student with the configured season message", async () => {
    mocks.getConfig.mockResolvedValue({
      journalSubmissionsLocked: true,
      journalSubmissionsLockMessage: "Journals are paused for review.",
    });
    const { getJournalSubmissionsLockError } = await import(
      "../journal-submissions-lock"
    );

    await expect(
      getJournalSubmissionsLockError(request("student")),
    ).resolves.toBe("Journals are paused for review.");
    expect(mocks.resolveSeason).toHaveBeenCalledTimes(1);
    expect(mocks.getConfig).toHaveBeenCalledWith(2);
  });

  it("allows a student when the season lock is off", async () => {
    mocks.getConfig.mockResolvedValue({
      journalSubmissionsLocked: false,
      journalSubmissionsLockMessage: null,
    });
    const { getJournalSubmissionsLockError } = await import(
      "../journal-submissions-lock"
    );

    await expect(
      getJournalSubmissionsLockError(request("student")),
    ).resolves.toBeNull();
  });

  it.each(["coordinator", "admin"] as const)(
    "keeps %s corrections available while students are locked",
    async (role) => {
      const { getJournalSubmissionsLockError } = await import(
        "../journal-submissions-lock"
      );

      await expect(
        getJournalSubmissionsLockError(request(role)),
      ).resolves.toBeNull();
      expect(mocks.getConfig).not.toHaveBeenCalled();
    },
  );
});