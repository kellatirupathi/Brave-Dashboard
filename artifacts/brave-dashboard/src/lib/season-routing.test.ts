import { describe, expect, it } from "vitest";
import {
  canonicalToLegacyPath,
  legacyToCanonicalPath,
  parseCanonicalSeasonPath,
  replaceCanonicalSeasonSlug,
} from "./season-routing";

describe("season routing", () => {
  it("parses and de-prefixes canonical paths", () => {
    expect(parseCanonicalSeasonPath("/admin/season/2.0/teams/7?tab=x")).toEqual({
      role: "admin",
      slug: "2.0",
      suffix: "/teams/7",
    });
    expect(canonicalToLegacyPath("/student/season/s-1/leads/4?view=all")).toBe(
      "/leads/4?view=all",
    );
    expect(canonicalToLegacyPath("/admin/season/2.0/profile")).toBe(
      "/profile",
    );
    expect(
      canonicalToLegacyPath(
        "/coordinator/season/2.0/reports/view/token-1?download=1",
      ),
    ).toBe("/reports/view/token-1?download=1");
    expect(
      canonicalToLegacyPath("/coordinator/season/2.0/teams/team-1"),
    ).toBe("/teams/team-1");
    expect(parseCanonicalSeasonPath("/admin/season/%E0%A4%A/queue")).toBeNull();
  });

  it("canonicalizes legacy paths while preserving suffixes and query strings", () => {
    expect(legacyToCanonicalPath("/admin/queue?mine=1", "student", "fall-24")).toBe(
      "/admin/season/fall-24/queue?mine=1",
    );
    expect(legacyToCanonicalPath("/teams/8", "coordinator", "fall-24")).toBe(
      "/coordinator/season/fall-24/teams/8",
    );
    expect(legacyToCanonicalPath("/", "student", "2.0")).toBe(
      "/student/season/2.0",
    );
  });

  it("changes only the slug of a canonical URL", () => {
    expect(
      replaceCanonicalSeasonSlug(
        "/coordinator/season/old/journals/team/1?week=2#entry",
        "new",
      ),
    ).toBe("/coordinator/season/new/journals/team/1?week=2#entry");
  });
});