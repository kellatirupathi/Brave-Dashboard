// New Demo Day "best project" submissions (additive, isolated).
//
// A simpler flow than the legacy demo_day_applications: ANY team may submit
// their best project to be considered for a Demo Day presentation in front of
// investors / NxtWave founders. Submitting does NOT guarantee a slot — admins
// shortlist which projects go forward. Hand-written validation (bypasses Orval)
// like other additive subsystems. Nothing here touches the legacy demo-day
// route, table, or admin page.
//
//   GET  /api/demo-day/submission            student → own team's submission
//   POST /api/demo-day/submission            student → create/update (upsert)
//   GET  /api/admin/demo-day/submissions     admin   → list all (enriched)
//   PATCH /api/admin/demo-day/submissions/:id admin  → shortlist/reject + note
import { Router, type IRouter, type Request, type Response } from "express";
import { eq, sql, desc } from "drizzle-orm";
import {
  db,
  demoDaySubmissionsTable,
  teamsTable,
  teamMembersTable,
  revenueEntriesTable,
} from "@workspace/db";
import { logAudit } from "../lib/audit";
import { requireAdminPage } from "../lib/require-admin-page";

const router: IRouter = Router();

const ADMIN_PAGE_KEY = "/admin/demo-day-submissions";

async function resolveTeamId(userId: string): Promise<number | null> {
  const [member] = await db
    .select({ teamId: teamMembersTable.teamId })
    .from(teamMembersTable)
    .where(eq(teamMembersTable.userId, userId));
  return member?.teamId ?? null;
}

async function enrich(row: typeof demoDaySubmissionsTable.$inferSelect) {
  const [team] = await db
    .select({ name: teamsTable.name, campusId: teamsTable.campusId })
    .from(teamsTable)
    .where(eq(teamsTable.id, row.teamId));
  const [rev] = await db
    .select({ total: sql<number>`coalesce(sum(verified_amount), 0)` })
    .from(revenueEntriesTable)
    .where(sql`team_id = ${row.teamId} and status = 'verified'`);
  return {
    ...row,
    teamName: team?.name ?? `Team #${row.teamId}`,
    campusId: team?.campusId ?? null,
    totalRevenue: Number(rev?.total ?? 0),
  };
}

// Trim + bound a free-text field; returns null for empty.
function cleanText(v: unknown, max: number): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t ? t.slice(0, max) : null;
}

// ── Student: read own team's submission ────────────────────────────────────
router.get(
  "/demo-day/submission",
  async (req: Request, res: Response): Promise<void> => {
    if (!req.isAuthenticated()) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    const teamId = await resolveTeamId(req.user.id);
    if (teamId == null) {
      res.status(404).json({ error: "No team found" });
      return;
    }
    const [row] = await db
      .select()
      .from(demoDaySubmissionsTable)
      .where(eq(demoDaySubmissionsTable.teamId, teamId));
    if (!row) {
      res.json(null);
      return;
    }
    res.json(await enrich(row));
  },
);

// ── Student: create or update (upsert per team) ────────────────────────────
router.post(
  "/demo-day/submission",
  async (req: Request, res: Response): Promise<void> => {
    if (!req.isAuthenticated()) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    const teamId = await resolveTeamId(req.user.id);
    if (teamId == null) {
      res.status(404).json({ error: "No team found" });
      return;
    }

    const title = cleanText(req.body?.title, 200);
    const description = cleanText(req.body?.description, 4000);
    if (!title || !description) {
      res.status(400).json({ error: "Title and description are required." });
      return;
    }
    const link = cleanText(req.body?.link, 1000);
    const fileUrl = cleanText(req.body?.fileUrl, 2000);
    const projectId =
      typeof req.body?.projectId === "number" ? req.body.projectId : null;

    const [existing] = await db
      .select()
      .from(demoDaySubmissionsTable)
      .where(eq(demoDaySubmissionsTable.teamId, teamId));

    let row: typeof demoDaySubmissionsTable.$inferSelect;
    if (existing) {
      // Editing keeps the existing review status; admins control status only.
      [row] = await db
        .update(demoDaySubmissionsTable)
        .set({
          title,
          description,
          link,
          fileUrl,
          projectId,
          submittedBy: req.user.id,
        })
        .where(eq(demoDaySubmissionsTable.id, existing.id))
        .returning();
    } else {
      [row] = await db
        .insert(demoDaySubmissionsTable)
        .values({
          teamId,
          title,
          description,
          link,
          fileUrl,
          projectId,
          submittedBy: req.user.id,
          status: "submitted",
        })
        .returning();
    }
    res.status(existing ? 200 : 201).json(await enrich(row));
  },
);

// ── Admin: list all submissions ────────────────────────────────────────────
router.get(
  "/admin/demo-day/submissions",
  requireAdminPage(ADMIN_PAGE_KEY, "view"),
  async (req: Request, res: Response): Promise<void> => {
    if (!req.isAuthenticated() || req.user.role !== "admin") {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
    const rows = await db
      .select()
      .from(demoDaySubmissionsTable)
      .orderBy(desc(demoDaySubmissionsTable.createdAt));
    res.json(await Promise.all(rows.map(enrich)));
  },
);

// ── Admin: shortlist / reject + review note ────────────────────────────────
router.patch(
  "/admin/demo-day/submissions/:id",
  requireAdminPage(ADMIN_PAGE_KEY, "edit"),
  async (req: Request, res: Response): Promise<void> => {
    if (!req.isAuthenticated() || req.user.role !== "admin") {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }
    const status = req.body?.status;
    const allowed = ["submitted", "shortlisted", "rejected"];
    if (status !== undefined && !allowed.includes(status)) {
      res.status(400).json({ error: "Invalid status" });
      return;
    }
    const reviewNote = cleanText(req.body?.reviewNote, 2000);

    const update: Partial<typeof demoDaySubmissionsTable.$inferInsert> = {};
    if (status !== undefined) update.status = status;
    if (req.body?.reviewNote !== undefined) update.reviewNote = reviewNote;
    if (Object.keys(update).length === 0) {
      res.status(400).json({ error: "Nothing to update" });
      return;
    }

    const [row] = await db
      .update(demoDaySubmissionsTable)
      .set(update)
      .where(eq(demoDaySubmissionsTable.id, id))
      .returning();
    if (!row) {
      res.status(404).json({ error: "Submission not found" });
      return;
    }
    await logAudit(
      req.user.id,
      "update_demo_day_submission",
      "demo_day_submission",
      row.id,
      JSON.stringify(update),
    );
    res.json(await enrich(row));
  },
);

export default router;
