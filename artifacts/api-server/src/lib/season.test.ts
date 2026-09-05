import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Request } from "express";

const mocks = vi.hoisted(() => ({
  select: vi.fn(),
  overrideId: null as number | null,
}));

vi.mock("@workspace/db", () => ({
  db: {
    select: mocks.select,
  },
  programmeConfigTable: {},
  seasonsTable: {
    id: "id",
    isActive: "isActive",
  },
  usersTable: {
    id: "userId",
    seasonOverrideId: "seasonOverrideId",
  },
  SEASON_1_ID: 1,
  SEASON_2_ID: 2,
}));

vi.mock("./logger", () => ({
  logger: {
    error: vi.fn(),
    warn: vi.fn(),
  },
}));

function request(
  role: "admin" | "coordinator" | "student",
  options: {
    header?: string;
    query?: string;
    remembered?: number;
  } = {},
): Request {
  return {
    headers: options.header ? { "x-brave-season": options.header } : {},
    query: options.query ? { season: options.query } : {},
    viewingSeasonId: options.remembered,
    user: { id: "test-user", role },
  } as unknown as Request;
}

describe("resolveSeason staff default", () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.select.mockReset();
    mocks.overrideId = null;
    mocks.select.mockImplementation(
      (selection?: Record<string, unknown>) => {
      if (selection && "seasonOverrideId" in selection) {
        return {
          from: () => ({
            where: () => ({
              limit: async () => [
                { seasonOverrideId: mocks.overrideId },
              ],
            }),
          }),
        };
      }
      return {
        from: () => ({
          orderBy: async () => [
            { id: 1, isActive: true, isStaffDefault: false },
            { id: 2, isActive: false, isStaffDefault: true },
          ],
        }),
      };
    },
    );
  });

  it.each(["admin", "coordinator"] as const)(
    "uses the configured staff default for a %s without a selection",
    async (role) => {
      const { resolveSeason } = await import("./season");

      await expect(resolveSeason(request(role))).resolves.toBe(2);
    },
  );

  it("keeps students on the active season", async () => {
    const { resolveSeason } = await import("./season");

    await expect(resolveSeason(request("student"))).resolves.toBe(1);
  });

  it("keeps a pinned student on the override despite stale client season state", async () => {
    mocks.overrideId = 2;
    const { resolveSeason } = await import("./season");

    await expect(
      resolveSeason(
        request("student", {
          header: "1",
          query: "1",
          remembered: 1,
        }),
      ),
    ).resolves.toBe(2);
  });

  it("keeps an explicit staff selection ahead of the default", async () => {
    const { resolveSeason } = await import("./season");

    await expect(
      resolveSeason(request("admin", { remembered: 1 })),
    ).resolves.toBe(1);
  });
});