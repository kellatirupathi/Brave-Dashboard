import { beforeEach, describe, expect, it, vi } from "vitest";
import { customFetch } from "@workspace/api-client-react";
import { fetchTeamProjects } from "./team-season-api";

vi.mock("@workspace/api-client-react", () => ({
  customFetch: vi.fn(),
}));

const customFetchMock = vi.mocked(customFetch);

describe("team season API", () => {
  beforeEach(() => {
    customFetchMock.mockReset();
  });

  it("overrides the global season header for a locally selected season", async () => {
    customFetchMock.mockResolvedValueOnce({
      items: [{ id: 22, title: "Season two project", status: "active", seasonId: 2 }],
    });

    const result = await fetchTeamProjects(249, 2, [1, 2]);

    expect(customFetchMock).toHaveBeenCalledWith(
      "/api/projects?season=2&teamId=249&pageSize=200",
      { headers: { "x-brave-season": "2" } },
    );
    expect(result.map((project) => project.id)).toEqual([22]);
  });

  it("requests each season explicitly and combines distinct All-view projects", async () => {
    customFetchMock
      .mockResolvedValueOnce({
        items: [{ id: 11, title: "Season one project", status: "active", seasonId: 1 }],
      })
      .mockResolvedValueOnce({
        items: [{ id: 22, title: "Season two project", status: "active", seasonId: 2 }],
      });

    const result = await fetchTeamProjects(249, "all", [1, 2]);

    expect(customFetchMock).toHaveBeenNthCalledWith(
      1,
      "/api/projects?season=1&teamId=249&pageSize=200",
      { headers: { "x-brave-season": "1" } },
    );
    expect(customFetchMock).toHaveBeenNthCalledWith(
      2,
      "/api/projects?season=2&teamId=249&pageSize=200",
      { headers: { "x-brave-season": "2" } },
    );
    expect(result.map((project) => project.id)).toEqual([11, 22]);
  });
});