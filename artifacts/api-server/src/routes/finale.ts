/**
 * BRAVE Finale Submissions (additive, isolated — bypasses Orval codegen).
 *
 * Students: a team whose VERIFIED revenue has reached the admin-set threshold
 * (default ₹2,00,000) sees a "BRAVE Finale Submissions" page. The team LEADER
 * can upload .pptx decks + remarks; members get the same page read-only and see
 * everything their leader submitted. A team may submit more than once.
 *
 * Uploads land in object storage first (presigned URL, same flow as BRDs); this
 * route stores the object path and then best-effort mirrors the file to Google
 * Drive so the admin export can hand out shareable links.
 *
 * Admins: a paginated/sortable/searchable list showing the LATEST submission
 * per team, plus a CSV export of every deck. All gating (menu on/off, the
 * revenue threshold, the submissions lock, and the page content) lives on the
 * singleton programme_config row.
 */
import { Router, type IRouter, type Request, type Response } from "express";
import { z } from "zod";
import {
  db,
  programmeConfigTable,
  finaleSubmissionsTable,
  teamsTable,
  teamMembersTable,
  campusesTable,
  usersTable,
  revenueEntriesTable,
} from "@workspace/db";
import { and, asc, desc, eq, gte, ilike, inArray, lte, or, sql } from "drizzle-orm";
import { requireAdminPage } from "../lib/require-admin-page";
import { ObjectStorageService } from "../lib/objectStorage";
import { isDriveConfigured, uploadFinaleDeckToDrive } from "../lib/drive/drive-client";
import { logger } from "../lib/logger";

const router: IRouter = Router();
const objectStorage = new ObjectStorageService();

export const DEFAULT_FINALE_LOCK_MESSAGE =
  "Finale submissions are currently closed. You can still view this page, but new decks can't be uploaded right now.";

export const DEFAULT_FINALE_CONTENT =
  "Upload your final pitch deck (.pptx) for the BRAVE Finale. Make sure it covers your problem statement, traction, revenue and what you're building next.";

const PPTX_MIME =
  "application/vnd.openxmlformats-officedocument.presentationml.presentation";

async function getConfigRow() {
  let [row] = await db.select().from(programmeConfigTable).limit(1);
  if (!row) {
    [row] = await db.insert(programmeConfigTable).values({}).returning();
  }
  return row;
}

/** A team's total verified revenue — mirrors the leaderboard's expression. */
async function getTeamVerifiedRevenue(teamId: number): Promise<number> {
  const [row] = await db
    .select({
      total: sql<string>`COALESCE(SUM(COALESCE(${revenueEntriesTable.verifiedAmount}, 0)), 0)`,
    })
    .from(revenueEntriesTable)
    .where(
      and(
        eq(revenueEntriesTable.teamId, teamId),
        eq(revenueEntriesTable.status, "verified"),
      ),
    );
  return Number(row?.total ?? 0);
}

/** Resolve the current user's team id (via team_members). Null if teamless. */
async function getMyTeamId(userId: string): Promise<number | null> {
  const [row] = await db
    .select({ teamId: teamMembersTable.teamId })
    .from(teamMembersTable)
    .where(eq(teamMembersTable.userId, userId))
    .limit(1);
  return row?.teamId ?? null;
}

/** True when this user leads the given team. */
async function isTeamLeader(userId: string, teamId: number): Promise<boolean> {
  const [row] = await db
    .select({ leaderId: teamsTable.leaderId })
    .from(teamsTable)
    .where(eq(teamsTable.id, teamId))
    .limit(1);
  return row?.leaderId === userId;
}

// ── Student ────────────────────────────────────────────────────────────────

/**
 * Everything the student page needs in one call: whether the feature is on,
 * whether THIS team qualifies on verified revenue, whether the caller may
 * upload (leader only), the admin-authored content, the lock state, and the
 * team's own submissions.
 */
router.get(
  "/finale/me",
  async (req: Request, res: Response): Promise<void> => {
    if (!req.isAuthenticated()) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    const config = await getConfigRow();
    const threshold = config.finaleMinVerifiedRevenue;
    const base = {
      enabled: config.finaleMenuEnabled,
      threshold,
      content: (config.finaleContent ?? "").trim() || DEFAULT_FINALE_CONTENT,
      locked: config.finaleSubmissionsLocked,
      lockMessage:
        (config.finaleLockMessage ?? "").trim() || DEFAULT_FINALE_LOCK_MESSAGE,
    };

    const teamId = await getMyTeamId(req.user.id);
    if (teamId == null) {
      res.json({
        ...base,
        eligible: false,
        canUpload: false,
        verifiedRevenue: 0,
        teamName: null,
        items: [],
      });
      return;
    }

    const verifiedRevenue = await getTeamVerifiedRevenue(teamId);
    const [team] = await db
      .select({ name: teamsTable.name })
      .from(teamsTable)
      .where(eq(teamsTable.id, teamId))
      .limit(1);
    const leader = await isTeamLeader(req.user.id, teamId);
    const eligible = verifiedRevenue >= threshold;

    // Every member of the team sees the team's decks — only the leader uploads.
    const rows = await db
      .select({
        id: finaleSubmissionsTable.id,
        fileUrl: finaleSubmissionsTable.fileUrl,
        fileName: finaleSubmissionsTable.fileName,
        remarks: finaleSubmissionsTable.remarks,
        driveUrl: finaleSubmissionsTable.driveUrl,
        createdAt: finaleSubmissionsTable.createdAt,
        submittedBy: finaleSubmissionsTable.submittedBy,
        submitterFirst: usersTable.firstName,
        submitterLast: usersTable.lastName,
      })
      .from(finaleSubmissionsTable)
      .leftJoin(usersTable, eq(usersTable.id, finaleSubmissionsTable.submittedBy))
      .where(eq(finaleSubmissionsTable.teamId, teamId))
      .orderBy(desc(finaleSubmissionsTable.createdAt));

    res.json({
      ...base,
      eligible,
      // The leader may upload only while eligible and unlocked.
      canUpload: leader && eligible && !config.finaleSubmissionsLocked,
      isLeader: leader,
      verifiedRevenue,
      teamName: team?.name ?? null,
      items: rows.map((r) => ({
        id: r.id,
        fileUrl: r.fileUrl,
        fileName: r.fileName,
        remarks: r.remarks,
        driveUrl: r.driveUrl,
        createdAt: r.createdAt,
        submitterName:
          [r.submitterFirst, r.submitterLast].filter(Boolean).join(" ").trim() ||
          "—",
      })),
    });
  },
);

const CreateBody = z.object({
  fileUrl: z.string().trim().min(1).max(500),
  fileName: z.string().trim().max(300).optional(),
  remarks: z.string().trim().max(2000).optional(),
});

/**
 * Team leader submits a deck. Re-checks every gate server-side — hiding the
 * form in the UI is not enough on its own.
 */
router.post(
  "/finale/submission",
  async (req: Request, res: Response): Promise<void> => {
    if (!req.isAuthenticated()) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    const config = await getConfigRow();
    if (!config.finaleMenuEnabled) {
      res.status(403).json({ error: "Finale submissions are not open." });
      return;
    }
    if (config.finaleSubmissionsLocked) {
      res.status(403).json({
        error:
          (config.finaleLockMessage ?? "").trim() || DEFAULT_FINALE_LOCK_MESSAGE,
      });
      return;
    }
    const teamId = await getMyTeamId(req.user.id);
    if (teamId == null) {
      res.status(400).json({ error: "You are not on a team." });
      return;
    }
    if (!(await isTeamLeader(req.user.id, teamId))) {
      res
        .status(403)
        .json({ error: "Only your team leader can submit the Finale deck." });
      return;
    }
    const verifiedRevenue = await getTeamVerifiedRevenue(teamId);
    if (verifiedRevenue < config.finaleMinVerifiedRevenue) {
      res.status(403).json({ error: "Your team is not eligible yet." });
      return;
    }
    const parsed = CreateBody.safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }

    const [created] = await db
      .insert(finaleSubmissionsTable)
      .values({
        teamId,
        submittedBy: req.user.id,
        fileUrl: parsed.data.fileUrl,
        fileName: parsed.data.fileName ?? null,
        remarks: parsed.data.remarks ?? null,
      })
      .returning();

    // Mirror to Drive in the background — never block or fail the submit on it.
    if (created) void mirrorToDrive(created.id);

    res.status(201).json({ ok: true, id: created?.id ?? null });
  },
);

/**
 * Best-effort Drive mirror of one submission. Streams the object straight from
 * storage into Drive (no buffering) and records the link, or the error text so
 * an admin can see why a deck has no Drive link.
 */
async function mirrorToDrive(id: number): Promise<void> {
  if (!isDriveConfigured()) return;
  try {
    const [row] = await db
      .select()
      .from(finaleSubmissionsTable)
      .where(eq(finaleSubmissionsTable.id, id))
      .limit(1);
    if (!row || row.driveFileId) return;

    const file = await objectStorage.getObjectEntityFile(row.fileUrl);
    const [meta] = await file.getMetadata();
    const mimeType = (meta.contentType as string | undefined) || PPTX_MIME;
    const filename = row.fileName?.trim() || `finale-team-${row.teamId}-${row.id}.pptx`;
    const result = await uploadFinaleDeckToDrive(
      file.createReadStream(),
      filename,
      mimeType,
    );
    await db
      .update(finaleSubmissionsTable)
      .set({
        driveUrl: result.webViewLink,
        driveFileId: result.fileId,
        driveSyncedAt: new Date(),
        driveError: null,
      })
      .where(eq(finaleSubmissionsTable.id, id));
  } catch (err) {
    logger.error({ err, id }, "Finale Drive mirror failed");
    await db
      .update(finaleSubmissionsTable)
      .set({ driveError: err instanceof Error ? err.message : "Upload failed" })
      .where(eq(finaleSubmissionsTable.id, id))
      .catch(() => undefined);
  }
}

// ── Admin ──────────────────────────────────────────────────────────────────

type FinaleSort = "newest" | "oldest" | "team_asc" | "team_desc";

/**
 * Latest submission per team + that team's total deck count. Shared by the
 * admin list and the CSV export so both always agree on filters/sort.
 *
 * DISTINCT ON (team_id) ordered by created_at DESC picks each team's most
 * recent row; the outer query then applies the caller's sort.
 */
function buildAdminQuery(opts: {
  search?: string;
  from?: string;
  to?: string;
  sort: FinaleSort;
}) {
  const conds = [];
  if (opts.search) {
    const term = `%${opts.search}%`;
    conds.push(
      or(
        ilike(teamsTable.name, term),
        ilike(campusesTable.name, term),
        ilike(finaleSubmissionsTable.remarks, term),
        ilike(finaleSubmissionsTable.fileName, term),
      ),
    );
  }
  if (opts.from) conds.push(gte(finaleSubmissionsTable.createdAt, new Date(opts.from)));
  if (opts.to) {
    // `to` is an inclusive day — cover the whole date.
    const end = new Date(opts.to);
    end.setHours(23, 59, 59, 999);
    conds.push(lte(finaleSubmissionsTable.createdAt, end));
  }
  return conds.length > 0 ? and(...conds) : undefined;
}

function orderFor(sort: FinaleSort) {
  switch (sort) {
    case "oldest":
      return asc(finaleSubmissionsTable.createdAt);
    case "team_asc":
      return asc(teamsTable.name);
    case "team_desc":
      return desc(teamsTable.name);
    default:
      return desc(finaleSubmissionsTable.createdAt);
  }
}

/** Rows for the admin list/export: one per team (its latest deck). */
async function fetchAdminRows(opts: {
  search?: string;
  from?: string;
  to?: string;
  sort: FinaleSort;
  limit?: number;
  offset?: number;
}) {
  const where = buildAdminQuery(opts);
  // Latest submission id per team, honouring the same filters.
  const latest = db
    .selectDistinctOn([finaleSubmissionsTable.teamId], {
      id: finaleSubmissionsTable.id,
    })
    .from(finaleSubmissionsTable)
    .leftJoin(teamsTable, eq(teamsTable.id, finaleSubmissionsTable.teamId))
    .leftJoin(campusesTable, eq(campusesTable.id, teamsTable.campusId))
    .where(where)
    .orderBy(finaleSubmissionsTable.teamId, desc(finaleSubmissionsTable.createdAt))
    .as("latest");

  const base = db
    .select({
      id: finaleSubmissionsTable.id,
      teamId: finaleSubmissionsTable.teamId,
      teamName: teamsTable.name,
      campusName: campusesTable.name,
      fileUrl: finaleSubmissionsTable.fileUrl,
      fileName: finaleSubmissionsTable.fileName,
      remarks: finaleSubmissionsTable.remarks,
      driveUrl: finaleSubmissionsTable.driveUrl,
      createdAt: finaleSubmissionsTable.createdAt,
      leaderFirst: usersTable.firstName,
      leaderLast: usersTable.lastName,
      leaderEmail: usersTable.email,
      totalSubmissions: sql<number>`(
        SELECT count(*)::int FROM finale_submissions fs
        WHERE fs.team_id = ${finaleSubmissionsTable.teamId}
      )`,
      verifiedRevenue: sql<string>`COALESCE((
        SELECT SUM(COALESCE(re.verified_amount, 0))
        FROM revenue_entries re
        WHERE re.team_id = ${finaleSubmissionsTable.teamId} AND re.status = 'verified'
      ), 0)`,
    })
    .from(finaleSubmissionsTable)
    .innerJoin(latest, eq(latest.id, finaleSubmissionsTable.id))
    .leftJoin(teamsTable, eq(teamsTable.id, finaleSubmissionsTable.teamId))
    .leftJoin(campusesTable, eq(campusesTable.id, teamsTable.campusId))
    .leftJoin(usersTable, eq(usersTable.id, finaleSubmissionsTable.submittedBy))
    .orderBy(orderFor(opts.sort));

  const rows =
    opts.limit != null
      ? await base.limit(opts.limit).offset(opts.offset ?? 0)
      : await base;

  return rows.map((r) => ({
    id: r.id,
    teamId: r.teamId,
    teamName: r.teamName ?? "—",
    campusName: r.campusName ?? "—",
    leaderName:
      [r.leaderFirst, r.leaderLast].filter(Boolean).join(" ").trim() || "—",
    leaderEmail: r.leaderEmail ?? "",
    fileUrl: r.fileUrl,
    fileName: r.fileName,
    remarks: r.remarks,
    driveUrl: r.driveUrl,
    createdAt: r.createdAt,
    totalSubmissions: Number(r.totalSubmissions ?? 1),
    verifiedRevenue: Number(r.verifiedRevenue ?? 0),
  }));
}

/** Admin list — one row per team (latest deck), paginated. */
router.get(
  "/admin/finale/submissions",
  requireAdminPage("/admin/finale-submissions", "view"),
  async (req: Request, res: Response): Promise<void> => {
    const search = String(req.query["search"] ?? "").trim() || undefined;
    const from = String(req.query["from"] ?? "").trim() || undefined;
    const to = String(req.query["to"] ?? "").trim() || undefined;
    const sort = String(req.query["sort"] ?? "newest") as FinaleSort;
    const page = Math.max(1, Number(req.query["page"] ?? 1) || 1);
    const pageSize = Math.min(
      100,
      Math.max(1, Number(req.query["pageSize"] ?? 50) || 50),
    );

    const all = await fetchAdminRows({ search, from, to, sort });
    const totalCount = all.length;
    const items = all.slice((page - 1) * pageSize, page * pageSize);

    res.json({
      items,
      totalCount,
      page,
      pageSize,
      pageCount: Math.max(1, Math.ceil(totalCount / pageSize)),
    });
  },
);

/** All decks for one team — the admin row expands into this. */
router.get(
  "/admin/finale/submissions/team/:teamId",
  requireAdminPage("/admin/finale-submissions", "view"),
  async (req: Request, res: Response): Promise<void> => {
    const teamId = Number(req.params["teamId"]);
    if (!Number.isFinite(teamId)) {
      res.status(400).json({ error: "Invalid team id" });
      return;
    }
    const rows = await db
      .select({
        id: finaleSubmissionsTable.id,
        fileUrl: finaleSubmissionsTable.fileUrl,
        fileName: finaleSubmissionsTable.fileName,
        remarks: finaleSubmissionsTable.remarks,
        driveUrl: finaleSubmissionsTable.driveUrl,
        createdAt: finaleSubmissionsTable.createdAt,
        submitterFirst: usersTable.firstName,
        submitterLast: usersTable.lastName,
      })
      .from(finaleSubmissionsTable)
      .leftJoin(usersTable, eq(usersTable.id, finaleSubmissionsTable.submittedBy))
      .where(eq(finaleSubmissionsTable.teamId, teamId))
      .orderBy(desc(finaleSubmissionsTable.createdAt));
    res.json({
      items: rows.map((r) => ({
        ...r,
        submitterName:
          [r.submitterFirst, r.submitterLast].filter(Boolean).join(" ").trim() ||
          "—",
      })),
    });
  },
);

function csvCell(value: unknown): string {
  const s = value == null ? "" : String(value);
  return `"${s.replace(/"/g, '""')}"`;
}

/**
 * CSV export — EVERY deck (not just the latest), so each team's full history
 * with its Drive links is included. Honours the current filters/sort.
 */
router.get(
  "/admin/finale/submissions/export.csv",
  requireAdminPage("/admin/finale-submissions", "view"),
  async (req: Request, res: Response): Promise<void> => {
    const search = String(req.query["search"] ?? "").trim() || undefined;
    const from = String(req.query["from"] ?? "").trim() || undefined;
    const to = String(req.query["to"] ?? "").trim() || undefined;
    const sort = String(req.query["sort"] ?? "newest") as FinaleSort;

    const where = buildAdminQuery({ search, from, to, sort });
    const rows = await db
      .select({
        id: finaleSubmissionsTable.id,
        teamId: finaleSubmissionsTable.teamId,
        teamName: teamsTable.name,
        campusName: campusesTable.name,
        fileUrl: finaleSubmissionsTable.fileUrl,
        fileName: finaleSubmissionsTable.fileName,
        remarks: finaleSubmissionsTable.remarks,
        driveUrl: finaleSubmissionsTable.driveUrl,
        createdAt: finaleSubmissionsTable.createdAt,
        submitterFirst: usersTable.firstName,
        submitterLast: usersTable.lastName,
        submitterEmail: usersTable.email,
        verifiedRevenue: sql<string>`COALESCE((
          SELECT SUM(COALESCE(re.verified_amount, 0))
          FROM revenue_entries re
          WHERE re.team_id = ${finaleSubmissionsTable.teamId} AND re.status = 'verified'
        ), 0)`,
      })
      .from(finaleSubmissionsTable)
      .leftJoin(teamsTable, eq(teamsTable.id, finaleSubmissionsTable.teamId))
      .leftJoin(campusesTable, eq(campusesTable.id, teamsTable.campusId))
      .leftJoin(usersTable, eq(usersTable.id, finaleSubmissionsTable.submittedBy))
      .where(where)
      .orderBy(orderFor(sort));

    const appUrl = `${req.protocol}://${req.get("host")}`;
    const header = [
      "Team",
      "Campus",
      "Submitted By",
      "Email",
      "Verified Revenue (INR)",
      "File Name",
      "Drive Link",
      "File Link",
      "Remarks",
      "Submitted At",
    ];
    const lines = [header.map(csvCell).join(",")];
    for (const r of rows) {
      lines.push(
        [
          r.teamName ?? "—",
          r.campusName ?? "—",
          [r.submitterFirst, r.submitterLast].filter(Boolean).join(" ").trim() ||
            "—",
          r.submitterEmail ?? "",
          Number(r.verifiedRevenue ?? 0),
          r.fileName ?? "",
          r.driveUrl ?? "",
          r.fileUrl ? `${appUrl}/api/storage${r.fileUrl}` : "",
          r.remarks ?? "",
          r.createdAt ? new Date(r.createdAt).toISOString() : "",
        ]
          .map(csvCell)
          .join(","),
      );
    }

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      'attachment; filename="finale-submissions.csv"',
    );
    // BOM so Excel reads UTF-8 correctly.
    res.send("﻿" + lines.join("\r\n"));
  },
);

// ── Admin config ───────────────────────────────────────────────────────────

const ConfigBody = z.object({
  finaleMenuEnabled: z.boolean().optional(),
  finaleMinVerifiedRevenue: z.number().int().min(0).optional(),
  finaleSubmissionsLocked: z.boolean().optional(),
  finaleLockMessage: z.string().max(1000).nullable().optional(),
  finaleContent: z.string().max(5000).nullable().optional(),
});

function serializeConfig(row: typeof programmeConfigTable.$inferSelect) {
  return {
    finaleMenuEnabled: row.finaleMenuEnabled,
    finaleMinVerifiedRevenue: row.finaleMinVerifiedRevenue,
    finaleSubmissionsLocked: row.finaleSubmissionsLocked,
    finaleLockMessage:
      (row.finaleLockMessage ?? "").trim() || DEFAULT_FINALE_LOCK_MESSAGE,
    finaleContent: (row.finaleContent ?? "").trim() || DEFAULT_FINALE_CONTENT,
  };
}

router.get(
  "/admin/finale-config",
  requireAdminPage("/admin/config", "view"),
  async (_req: Request, res: Response): Promise<void> => {
    res.json(serializeConfig(await getConfigRow()));
  },
);

router.put(
  "/admin/finale-config",
  requireAdminPage("/admin/config", "edit"),
  async (req: Request, res: Response): Promise<void> => {
    if (!req.isAuthenticated() || req.user.role !== "admin") {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
    const parsed = ConfigBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const row = await getConfigRow();
    const patch: Record<string, unknown> = {};
    if (parsed.data.finaleMenuEnabled !== undefined) {
      patch.finaleMenuEnabled = parsed.data.finaleMenuEnabled;
    }
    if (parsed.data.finaleMinVerifiedRevenue !== undefined) {
      patch.finaleMinVerifiedRevenue = parsed.data.finaleMinVerifiedRevenue;
    }
    if (parsed.data.finaleSubmissionsLocked !== undefined) {
      patch.finaleSubmissionsLocked = parsed.data.finaleSubmissionsLocked;
    }
    if (parsed.data.finaleLockMessage !== undefined) {
      patch.finaleLockMessage = (parsed.data.finaleLockMessage ?? "").trim() || null;
    }
    if (parsed.data.finaleContent !== undefined) {
      patch.finaleContent = (parsed.data.finaleContent ?? "").trim() || null;
    }
    if (Object.keys(patch).length === 0) {
      res.json(serializeConfig(row));
      return;
    }
    const [updated] = await db
      .update(programmeConfigTable)
      .set(patch)
      .where(eq(programmeConfigTable.id, row.id))
      .returning();
    res.json(serializeConfig(updated ?? row));
  },
);

export default router;
