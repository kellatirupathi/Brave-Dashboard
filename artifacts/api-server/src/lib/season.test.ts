import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Request } from "express";

const mocks = vi.hoisted(() => ({
  select: vi.fn(),
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
    user: { role },
  } as unknown as Request;
}

describe("resolveSeason staff default", () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.select.mockReset();
    mocks.select.mockReturnValue({
      from: () => ({
        orderBy: async () => [
          { id: 1, isActive: true, isStaffDefault: false },
          { id: 2, isActive: false, isStaffDefault: true },
        ],
      }),
    });
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

  it("keeps an explicit staff selection ahead of the default", async () => {
    const { resolveSeason } = await import("./season");

    await expect(
      resolveSeason(request("admin", { remembered: 1 })),
    ).resolves.toBe(1);
  });
});