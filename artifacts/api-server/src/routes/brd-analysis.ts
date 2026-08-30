import { Router, type IRouter } from "express";
import { and, desc, eq, isNotNull } from "drizzle-orm";
import {
  db,
  revenueEntriesTable,
  brdAnalysisHistoryTable,
  teamsTable,
  projectsTable,
  campusesTable,
} from "@workspace/db";
import { resolveSeason } from "../lib/season";

const router: IRouter = Router();

/**
 * Backfill `compared_brd_url` / `compared_entry_id` / `compared_client_name` on
 * each uniqueness-comparison row at read time. Older analyses were stored before
 * those fields were enriched (or the enrichment failed), so the admin UI showed
 * "—" instead of a "View BRD" button. We resolve the real entry by the `#<id>`
 * embedded in the AI's free-text `entry_label`, using a lookup of every revenue
 * entry that belongs to the same team. Non-mutating; safe on null/garbled JSON.
 */
function enrichComparisonUrls(
  detail: unknown,
  lookup: Map<
    number,
    { brdUrl: string | null; clientName: string | null; status: string | null }
  >,
): unknown {
  if (!detail || typeof detail !== "object") return detail;
  const obj = detail as Record<string, unknown>;
  const comparison = obj["uniqueness_comparison"];
  if (!Array.isArray(comparison)) return detail;
  return {
    ...obj,
    uniqueness_comparison: comparison.map((row) => {
      if (!row || typeof row !== "object") return row;
      const r = row as Record<string, unknown>;
      const label =
        typeof r["entry_label"] === "string"
          ? (r["entry_label"] as string)
          : "";
      const idMatch = label.match(/#(\d+)/);
      const existingId =
        typeof r["compared_entry_id"] === "number"
          ? (r["compared_entry_id"] as number)
          : null;
      const resolvedId = existingId ?? (idMatch ? Number(idMatch[1]) : null);
      const matched = resolvedId != null ? lookup.get(resolvedId) : undefined;
      // Attach the compared entry's CURRENT review status (verified / rejected
      // / submitted) so the admin UI can show whether that BRD was approved or
      // rejected. Live value — not the analysis-time snapshot.
      const withStatus =
        matched && r["compared_status"] == null
          ? { ...r, compared_status: matched.status }
          : r;
      // Already has a BRD url — keep it (plus any status we just attached).
      if (withStatus["compared_brd_url"]) return withStatus;
      if (!matched) return withStatus;
      return {
        ...withStatus,
        compared_entry_id: withStatus["compared_entry_id"] ?? resolvedId,
        compared_brd_url: matched.brdUrl,
        compared_client_name:
          withStatus["compared_client_name"] ?? matched.clientName,
      };
    }),
  };
}

/**
 * Pull a short, human-readable summary out of the stored analysis JSON
 * (`aiAnalysisDetail.brd_summary`) for the list view's Summary column. Prefers
 * the model's `summary_text`; otherwise composes one from the key fields.
 * Returns null when no summary was produced (older analyses, pre-feature).
 */
function extractBrdSummaryText(detail: unknown): string | null {
  if (!detail || typeof detail !== "object") return null;
  const s = (detail as Record<string, unknown>)["brd_summary"];
  if (!s || typeof s !== "object") return null;
  const obj = s as Record<string, unknown>;
  const txt = obj["summary_text"];
  if (typeof txt === "string" && txt.trim()) return txt.trim();
  // Fallback: compose a one-liner from whatever structured fields exist.
  const parts: string[] = [];
  const push = (label: string, v: unknown) => {
    if (typeof v === "string" && v.trim()) parts.push(`${label}: ${v.trim()}`);
  };
  push("Business", obj["business_name"]);
  push("Client", obj["client_name"]);
  push("Amount", obj["amount"]);
  push("Paid by", obj["payer_name"]);
  push("Paid to", obj["payee_name"]);
  push("Ref", obj["reference_id"]);
  return parts.length ? parts.join(" · ") : null;
}

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
        brdUrl: revenueEntriesTable.brdUrl,
        brdScore: revenueEntriesTable.brdScore,
        uniquenessScore: revenueEntriesTable.uniquenessScore,
        aiAnalysisDetail: revenueEntriesTable.aiAnalysisDetail,
        aiAnalysedAt: revenueEntriesTable.aiAnalysedAt,
        submittedAt: revenueEntriesTable.submittedAt,
      })
      .from(revenueEntriesTable)
      .leftJoin(teamsTable, eq(teamsTable.id, revenueEntriesTable.teamId))
      .leftJoin(campusesTable, eq(campusesTable.id, teamsTable.campusId))
      .leftJoin(
        projectsTable,
        eq(projectsTable.id, revenueEntriesTable.projectId),
      )
      // Season-scoped, same reasoning as the review queue it is reached from:
      // an analysis belongs to the season whose entry it audited.
      .where(
        and(
          isNotNull(revenueEntriesTable.aiAnalysedAt),
          eq(revenueEntriesTable.seasonId, await resolveSeason(req)),
        ),
      )
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
        brdUrl: r.brdUrl,
        brdScore: r.brdScore,
        uniquenessScore: r.uniquenessScore,
        summary: extractBrdSummaryText(r.aiAnalysisDetail),
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
router.get(
  "/brd-analysis/history/:entryId",
  async (req, res): Promise<void> => {
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

      // Lookup of every revenue entry from this team, so we can resolve the BRD
      // file behind each comparison row even for analyses stored before the
      // comparison rows carried `compared_brd_url`.
      const teamEntries = await db
        .select({
          id: revenueEntriesTable.id,
          brdUrl: revenueEntriesTable.brdUrl,
          clientName: revenueEntriesTable.clientName,
          status: revenueEntriesTable.status,
        })
        .from(revenueEntriesTable)
        .where(eq(revenueEntriesTable.teamId, entry.teamId));
      const brdLookup = new Map(
        teamEntries.map((e) => [
          e.id,
          { brdUrl: e.brdUrl, clientName: e.clientName, status: e.status },
        ]),
      );

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
          aiAnalysisDetail: enrichComparisonUrls(
            entry.aiAnalysisDetail,
            brdLookup,
          ),
          aiAnalysedAt: entry.aiAnalysedAt?.toISOString() ?? null,
        },
        history: history.map((h) => ({
          id: h.id,
          brdScore: h.brdScore,
          uniquenessScore: h.uniquenessScore,
          analysisJson: enrichComparisonUrls(h.analysisJson, brdLookup),
          analysedAt: h.analysedAt.toISOString(),
        })),
      });
    } catch (err) {
      req.log.error({ err, entryId }, "[brd-analysis/history] failed");
      res.status(500).json({ error: "Failed to load analysis history" });
    }
  },
);

export default router;
