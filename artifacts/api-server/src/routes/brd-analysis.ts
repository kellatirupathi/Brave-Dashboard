import { Router, type IRouter } from "express";
import { desc, eq, isNotNull } from "drizzle-orm";
import {
  db,
  revenueEntriesTable,
  brdAnalysisHistoryTable,
  teamsTable,
  projectsTable,
  campusesTable,
} from "@workspace/db";

const router: IRouter = Router();

function requireAdmin(
  req: Parameters<Parameters<IRouter["get"]>[1]>[0],
  res: Parameters<Parameters<IRouter["get"]>[1]>[1],
): boolean {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return false;
  }
  if (req.user.role !== "admin") {
    res.status(403).json({ error: "Forbidden" });
    return false;
  }
  return true;
}

// GET /brd-analysis/all — latest analysis snapshot for every analysed entry,
// joined with team / project / campus context. Sorted most-recent first.
router.get("/brd-analysis/all", async (req, res): Promise<void> => {
  if (!requireAdmin(req, res)) return;
  try {
    const rows = await db
      .select({
        id: revenueEntriesTable.id,
        teamId: revenueEntriesTable.teamId,
        teamName: teamsTable.name,
        campusName: campusesTable.name,
        projectId: revenueEntriesTable.projectId,
        projectTitle: projectsTable.title,
        clientName: revenueEntriesTable.clientName,
        amount: revenueEntriesTable.amount,
        status: revenueEntriesTable.status,
        brdScore: revenueEntriesTable.brdScore,
        uniquenessScore: revenueEntriesTable.uniquenessScore,
        aiAnalysedAt: revenueEntriesTable.aiAnalysedAt,
        submittedAt: revenueEntriesTable.submittedAt,
      })
      .from(revenueEntriesTable)
      .leftJoin(teamsTable, eq(teamsTable.id, revenueEntriesTable.teamId))
      .leftJoin(
        campusesTable,
        eq(campusesTable.id, teamsTable.campusId),
      )
      .leftJoin(
        projectsTable,
        eq(projectsTable.id, revenueEntriesTable.projectId),
      )
      .where(isNotNull(revenueEntriesTable.aiAnalysedAt))
      .orderBy(desc(revenueEntriesTable.aiAnalysedAt));

    res.json({
      items: rows.map((r) => ({
        id: r.id,
        teamId: r.teamId,
        teamName: r.teamName ?? `Team #${r.teamId}`,
        campusName: r.campusName ?? "—",
        projectId: r.projectId,
        projectTitle: r.projectTitle ?? "—",
        clientName: r.clientName,
        amount: r.amount,
        status: r.status,
        brdScore: r.brdScore,
        uniquenessScore: r.uniquenessScore,
        aiAnalysedAt: r.aiAnalysedAt?.toISOString() ?? null,
        submittedAt: r.submittedAt?.toISOString() ?? null,
      })),
    });
  } catch (err) {
    req.log.error({ err }, "[brd-analysis/all] failed");
    res.status(500).json({ error: "Failed to load analyses" });
  }
});

// GET /brd-analysis/history/:entryId — every past analysis row for one entry,
// plus the entry header context. Sorted most-recent first.
router.get("/brd-analysis/history/:entryId", async (req, res): Promise<void> => {
  if (!requireAdmin(req, res)) return;
  const entryId = Number(req.params["entryId"]);
  if (!Number.isInteger(entryId) || entryId <= 0) {
    res.status(400).json({ error: "Invalid entry id" });
    return;
  }
  try {
    const [entry] = await db
      .select({
        id: revenueEntriesTable.id,
        teamId: revenueEntriesTable.teamId,
        teamName: teamsTable.name,
        campusName: campusesTable.name,
        projectId: revenueEntriesTable.projectId,
        projectTitle: projectsTable.title,
        clientName: revenueEntriesTable.clientName,
        amount: revenueEntriesTable.amount,
        verifiedAmount: revenueEntriesTable.verifiedAmount,
        status: revenueEntriesTable.status,
        brdUrl: revenueEntriesTable.brdUrl,
        brdScore: revenueEntriesTable.brdScore,
        uniquenessScore: revenueEntriesTable.uniquenessScore,
        aiAnalysisDetail: revenueEntriesTable.aiAnalysisDetail,
        aiAnalysedAt: revenueEntriesTable.aiAnalysedAt,
        submittedAt: revenueEntriesTable.submittedAt,
        paymentDate: revenueEntriesTable.paymentDate,
      })
      .from(revenueEntriesTable)
      .leftJoin(teamsTable, eq(teamsTable.id, revenueEntriesTable.teamId))
      .leftJoin(campusesTable, eq(campusesTable.id, teamsTable.campusId))
      .leftJoin(
        projectsTable,
        eq(projectsTable.id, revenueEntriesTable.projectId),
      )
      .where(eq(revenueEntriesTable.id, entryId));

    if (!entry) {
      res.status(404).json({ error: "Entry not found" });
      return;
    }

    const history = await db
      .select({
        id: brdAnalysisHistoryTable.id,
        brdScore: brdAnalysisHistoryTable.brdScore,
        uniquenessScore: brdAnalysisHistoryTable.uniquenessScore,
        analysisJson: brdAnalysisHistoryTable.analysisJson,
        analysedAt: brdAnalysisHistoryTable.analysedAt,
      })
      .from(brdAnalysisHistoryTable)
      .where(eq(brdAnalysisHistoryTable.revenueEntryId, entryId))
      .orderBy(desc(brdAnalysisHistoryTable.analysedAt));

    res.json({
      entry: {
        id: entry.id,
        teamId: entry.teamId,
        teamName: entry.teamName ?? `Team #${entry.teamId}`,
        campusName: entry.campusName ?? "—",
        projectId: entry.projectId,
        projectTitle: entry.projectTitle ?? "—",
        clientName: entry.clientName,
        amount: entry.amount,
        verifiedAmount: entry.verifiedAmount,
        status: entry.status,
        brdUrl: entry.brdUrl,
        paymentDate: entry.paymentDate,
        submittedAt: entry.submittedAt?.toISOString() ?? null,
        brdScore: entry.brdScore,
        uniquenessScore: entry.uniquenessScore,
        aiAnalysisDetail: entry.aiAnalysisDetail,
        aiAnalysedAt: entry.aiAnalysedAt?.toISOString() ?? null,
      },
      history: history.map((h) => ({
        id: h.id,
        brdScore: h.brdScore,
        uniquenessScore: h.uniquenessScore,
        analysisJson: h.analysisJson,
        analysedAt: h.analysedAt.toISOString(),
      })),
    });
  } catch (err) {
    req.log.error({ err, entryId }, "[brd-analysis/history] failed");
    res.status(500).json({ error: "Failed to load analysis history" });
  }
});

export default router;
