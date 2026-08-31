import { describe, expect, it, vi } from "vitest";

const reportMocks = vi.hoisted(() => ({
  resolveReportWeek: vi.fn(),
  computeCampusWeekReports: vi.fn(),
  listAllWeeks: vi.fn(),
  resolveSeason: vi.fn(),
  getSeasonById: vi.fn(),
}));

vi.mock("../../lib/journal-reports", () => ({
  resolveReportWeek: reportMocks.resolveReportWeek,
  computeCampusWeekReports: reportMocks.computeCampusWeekReports,
  listAllWeeks: reportMocks.listAllWeeks,
}));

vi.mock("../../lib/season", () => ({
  getSeasonById: reportMocks.getSeasonById,
  resolveSeason: reportMocks.resolveSeason,
  SEASON_1_ID: 1,
}));

vi.mock("@workspace/db", () => ({
  db: {},
  journalReportLinksTable: {},
  journalEscalationLogTable: {},
  programmeWeeksTable: {},
}));

import reportsRouter from "../reports";

type RouteHandler = (
  req: Record<string, unknown>,
  res: Record<string, any>,
) => Promise<void>;

function getExportHandler(): RouteHandler {
  const router = reportsRouter as any;
  const layer = router.stack.find(
    (entry: any) =>
      entry.route?.path === "/admin/reports/campus/:campusId/export",
  );
  if (!layer) throw new Error("CSV export route was not registered");
  return layer.route.stack[0].handle as RouteHandler;
}

function makeResponse() {
  const response: Record<string, any> = {
    status: vi.fn(() => response),
    json: vi.fn(() => response),
    setHeader: vi.fn(() => response),
    send: vi.fn(() => response),
  };
  return response;
}

describe("admin campus report CSV export", () => {
  it("resolves the requested week's data within the selected season", async () => {
    const selectedWeek = {
      id: 202,
      weekNumber: 4,
      startDate: "2026-09-23",
      endDate: "2026-09-29",
      seasonId: 2,
    };
    reportMocks.resolveSeason.mockResolvedValue(2);
    reportMocks.getSeasonById.mockResolvedValue({
      id: 2,
      name: "Season 2.0",
      slug: "season-2",
    });
    reportMocks.resolveReportWeek.mockResolvedValue(selectedWeek);
    reportMocks.computeCampusWeekReports.mockResolvedValue([
      {
        campusId: 7,
        campusName: "North Campus",
        totalTeams: 1,
        submittedCount: 1,
        notSubmittedCount: 0,
        teams: [
          {
            teamId: 11,
            teamName: "Team North",
            submitted: true,
            submittedByRole: "student",
            submittedAt: new Date("2026-09-29T12:00:00.000Z"),
          },
        ],
      },
    ]);

    const response = makeResponse();
    await getExportHandler()(
      {
        params: { campusId: "7" },
        query: { weekId: "202" },
        headers: {},
        isAuthenticated: () => true,
        user: { role: "admin" },
      },
      response,
    );

    expect(reportMocks.resolveReportWeek).toHaveBeenCalledWith(202, 2);
    expect(reportMocks.computeCampusWeekReports).toHaveBeenCalledWith(
      selectedWeek,
      7,
    );
    expect(response.setHeader).toHaveBeenCalledWith(
      "Content-Disposition",
      'attachment; filename="journal-report-campus-7-season-season-2-week-4.csv"',
    );
    expect(response.send).toHaveBeenCalledWith(
      [
        "Team,Submitted,Submitted By,Submitted At,Week,Week Start,Week End,Season",
        '"Team North",Yes,"student","2026-09-29T12:00:00.000Z",Week 4,2026-09-23,2026-09-29,"Season 2.0"',
      ].join("\n"),
    );
  });
});