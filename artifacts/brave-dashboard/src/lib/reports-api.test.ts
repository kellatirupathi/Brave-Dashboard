import { afterEach, describe, expect, it, vi } from "vitest";
import { downloadCampusCsv } from "./reports-api";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function mockBrowserDownload(contentDisposition: string | null) {
  const anchor = {
    href: "",
    download: "",
    click: vi.fn(),
  };
  const fetchMock = vi.fn().mockResolvedValue({
    ok: true,
    blob: vi.fn().mockResolvedValue(new Blob(["csv"])),
    headers: {
      get: vi.fn().mockReturnValue(contentDisposition),
    },
  });
  const createObjectURL = vi.fn().mockReturnValue("blob:report");
  const revokeObjectURL = vi.fn();

  vi.stubGlobal("fetch", fetchMock);
  vi.stubGlobal("document", {
    createElement: vi.fn().mockReturnValue(anchor),
  });
  vi.stubGlobal("URL", { createObjectURL, revokeObjectURL });

  return { anchor, fetchMock, createObjectURL, revokeObjectURL };
}

describe("downloadCampusCsv", () => {
  it("propagates week and season in the request and uses the server filename", async () => {
    const browser = mockBrowserDownload(
      'attachment; filename="journal-report-campus-7-season-season-2-week-4.csv"',
    );

    await downloadCampusCsv(7, 202, 2, "season-2");

    expect(browser.fetchMock).toHaveBeenCalledWith(
      "/api/admin/reports/campus/7/export?weekId=202&season=2",
      {
        credentials: "include",
        headers: { "x-brave-season": "2" },
      },
    );
    expect(browser.anchor.download).toBe(
      "journal-report-campus-7-season-season-2-week-4.csv",
    );
    expect(browser.anchor.click).toHaveBeenCalledOnce();
    expect(browser.createObjectURL).toHaveBeenCalledOnce();
    expect(browser.revokeObjectURL).toHaveBeenCalledWith("blob:report");
  });

  it("falls back to a season-labeled safe filename when the server omits one", async () => {
    const browser = mockBrowserDownload(null);

    await downloadCampusCsv(8, undefined, 2, "season 2/2026");

    expect(browser.fetchMock).toHaveBeenCalledWith(
      "/api/admin/reports/campus/8/export?season=2",
      {
        credentials: "include",
        headers: { "x-brave-season": "2" },
      },
    );
    expect(browser.anchor.download).toBe(
      "journal-report-campus-8-season-season-2-2026.csv",
    );
  });
});