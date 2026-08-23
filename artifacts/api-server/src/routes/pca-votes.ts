/**
 * People's Choice Award voting (additive, isolated — bypasses Orval codegen).
 *
 * Who may vote: leaders + members of teams whose VERIFIED revenue clears the
 * admin-set PCA bar. Those same teams are the candidates.
 *
 * The rules, enforced server-side (the UI only mirrors them):
 *   • one vote per person — a unique index on voter_id backs this up
 *   • you may never vote for your own team; it isn't even listed
 *   • a student cannot change their vote once cast — only an admin can
 */
import { Router, type IRouter, type Request, type Response } from "express";
import { z } from "zod";
import {
  db,
  programmeConfigTable,
  pcaVotesTable,
  teamsTable,
  teamMembersTable,
  campusesTable,
  usersTable,
} from "@workspace/db";
import { and, asc, desc, eq, gte, lte, sql, type SQL } from "drizzle-orm";
import { requireAdminPage } from "../lib/require-admin-page";
import { getActiveConfig, getConfig, resolveSeason } from "../lib/season";
import { requireWritableSeason } from "../middlewares/seasonGuard";
import { sendEmail, getAppUrl } from "../lib/email/brevo";
import {
  renderPcaVotingOpenEmail,
  renderPcaVoteReceiptEmail,
} from "../lib/email/templates/pca-vote";
import { logger } from "../lib/logger";

const router: IRouter = Router();

const ADMIN_PAGE = "/admin/votes/peoples-choice-votes";

// Season-aware read of the programme_config row, created on first access.
//
// Omitting `seasonId` means the ACTIVE season. That is correct for background
// work, but a request handler should pass `await resolveSeason(req)` so that an
// admin viewing Season 1 edits Season 1's settings rather than the live
// season's. Before seasons existed this read an unqualified `.limit(1)`, which
// becomes nondeterministic as soon as a second season's row exists.
async function getConfigRow(seasonId?: number) {
  return seasonId == null ? getActiveConfig() : getConfig(seasonId);
}

/** Admin-only guard — requireAdminPage does NOT authenticate on its own. */
function requireAdmin(req: Request, res: Response): boolean {
  if (!req.isAuthenticated() || req.user.role !== "admin") {
    res.status(403).json({ error: "Forbidden" });
    return false;
  }
  return true;
}

/**
 * Every team at/above the PCA revenue bar, with its verified total. This is
 * both the candidate list and the eligibility source for voters.
 */
async function getEligibleTeams(threshold: number, seasonId: number) {
  const rows = await db
    .select({
      id: teamsTable.id,
      name: teamsTable.name,
      campusName: campusesTable.name,
      verifiedRevenue: sql<string>`COALESCE((
        SELECT SUM(COALESCE(re.verified_amount, 0))
        FROM revenue_entries re
        WHERE re.team_id = ${teamsTable.id} AND re.status = 'verified'
          AND re.season_id = ${seasonId}
      ), 0)`,
    })
    .from(teamsTable)
    .leftJoin(campusesTable, eq(campusesTable.id, teamsTable.campusId))
    .orderBy(asc(teamsTable.name));
  return rows
    .map((r) => ({ ...r, verifiedRevenue: Number(r.verifiedRevenue ?? 0) }))
    .filter((r) => r.verifiedRevenue >= threshold);
}

/** The caller's team + whether they lead it. Null when not on a team. */
async function getMyTeam(
  userId: string,
): Promise<{ teamId: number; role: "leader" | "member" } | null> {
  const [row] = await db
    .select({ teamId: teamMembersTable.teamId, leaderId: teamsTable.leaderId })
    .from(teamMembersTable)
    .leftJoin(teamsTable, eq(teamsTable.id, teamMembersTable.teamId))
    .where(eq(teamMembersTable.userId, userId))
    .limit(1);
  if (!row) return null;
  return {
    teamId: row.teamId,
    role: row.leaderId === userId ? "leader" : "member",
  };
}

// ── Student ────────────────────────────────────────────────────────────────

/**
 * Everything the banner and the vote page need in one call: whether voting is
 * open, whether this person may vote, whether they already have, and the teams
 * they may vote for (their own is excluded here, not just hidden in the UI).
 */
router.get("/pca/me", async (req: Request, res: Response): Promise<void> => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const config = await getConfigRow(await resolveSeason(req));
  if (!config.pcaVotingEnabled) {
    res.json({
      enabled: false,
      eligible: false,
      hasVoted: false,
      teams: [],
    });
    return;
  }

  const mine = await getMyTeam(req.user.id);
  const eligibleTeams = await getEligibleTeams(config.pcaMinVerifiedRevenue, await resolveSeason(req));
  const eligible =
    mine != null && eligibleTeams.some((t) => t.id === mine.teamId);

  const votingSeason = await resolveSeason(req);
  // Scoped to match the widened unique(voter_id, season_id): one vote per
  // person PER SEASON, so a Season 1 voter can vote again in Season 2.
  const [existing] = await db
    .select({ id: pcaVotesTable.id })
    .from(pcaVotesTable)
    .where(
      and(
        eq(pcaVotesTable.voterId, req.user.id),
        eq(pcaVotesTable.seasonId, votingSeason),
      ),
    )
    .limit(1);

  res.json({
    enabled: true,
    eligible,
    hasVoted: !!existing,
    threshold: config.pcaMinVerifiedRevenue,
    // Candidates minus the caller's own team — self-voting isn't offered.
    teams: eligible
      ? eligibleTeams
          .filter((t) => t.id !== mine!.teamId)
          .map((t) => ({ id: t.id, name: t.name, campusName: t.campusName }))
      : [],
  });
});

const VoteBody = z.object({
  votedTeamId: z.number().int().positive(),
  comments: z.string().trim().max(2000).optional(),
});

router.post("/pca/vote", requireWritableSeason(), async (req: Request, res: Response): Promise<void> => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const config = await getConfigRow(await resolveSeason(req));
  if (!config.pcaVotingEnabled) {
    res.status(403).json({ error: "Voting is not open." });
    return;
  }
  const parsed = VoteBody.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const mine = await getMyTeam(req.user.id);
  if (!mine) {
    res.status(400).json({ error: "You are not on a team." });
    return;
  }
  // Self-vote guard. The list never offers it, so this is the belt-and-braces
  // check for a hand-crafted request.
  if (parsed.data.votedTeamId === mine.teamId) {
    res.status(400).json({ error: "You can't vote for your own team." });
    return;
  }

  const eligibleTeams = await getEligibleTeams(config.pcaMinVerifiedRevenue, await resolveSeason(req));
  if (!eligibleTeams.some((t) => t.id === mine.teamId)) {
    res.status(403).json({ error: "Your team isn't eligible to vote." });
    return;
  }
  if (!eligibleTeams.some((t) => t.id === parsed.data.votedTeamId)) {
    res.status(400).json({ error: "That team isn't in the running." });
    return;
  }

  const votingSeason = await resolveSeason(req);
  // Scoped to match the widened unique(voter_id, season_id): one vote per
  // person PER SEASON, so a Season 1 voter can vote again in Season 2.
  const [existing] = await db
    .select({ id: pcaVotesTable.id })
    .from(pcaVotesTable)
    .where(
      and(
        eq(pcaVotesTable.voterId, req.user.id),
        eq(pcaVotesTable.seasonId, votingSeason),
      ),
    )
    .limit(1);
  if (existing) {
    // One vote per person, and students can't change it — only admins can.
    res.status(409).json({ error: "You have already voted." });
    return;
  }

  try {
    await db.insert(pcaVotesTable).values({
      voterId: req.user.id,
      seasonId: votingSeason,
      voterTeamId: mine.teamId,
      voterRole: mine.role,
      votedTeamId: parsed.data.votedTeamId,
      comments: parsed.data.comments ?? null,
    });
  } catch (err) {
    // The unique index is the real guard — two rapid submits land here.
    logger.warn({ err, userId: req.user.id }, "PCA duplicate vote rejected");
    res.status(409).json({ error: "You have already voted." });
    return;
  }

  // Receipt to the voter only. Best-effort and fire-and-forget — a mail
  // failure must never fail a vote that's already recorded.
  void sendVoteReceipt(req.user.id);

  res.status(201).json({ ok: true });
});

/** Email the voter a static "your vote is recorded" receipt. */
async function sendVoteReceipt(userId: string): Promise<void> {
  try {
    const [user] = await db
      .select({ email: usersTable.email })
      .from(usersTable)
      .where(eq(usersTable.id, userId))
      .limit(1);
    const email = user?.email;
    // Skip synthetic accounts that have no real inbox.
    if (
      !email ||
      !email.includes("@") ||
      /@forms\.local$/i.test(email) ||
      /^sso_/i.test(email)
    ) {
      return;
    }
    const { subject, text, html } = renderPcaVoteReceiptEmail();
    await sendEmail({ category: "pcaVotes", to: [{ email }], subject, text, html });
  } catch (err) {
    logger.error({ err, userId }, "PCA vote receipt email failed");
  }
}

// ── Admin ──────────────────────────────────────────────────────────────────

/** Tab 1: live tally per team, highest first. */
router.get(
  "/admin/pca/results",
  requireAdminPage(ADMIN_PAGE, "view"),
  async (req: Request, res: Response): Promise<void> => {
    if (!requireAdmin(req, res)) return;
    const config = await getConfigRow(await resolveSeason(req));
    const eligible = await getEligibleTeams(config.pcaMinVerifiedRevenue, await resolveSeason(req));
    const tallies = await db
      .select({
        teamId: pcaVotesTable.votedTeamId,
        votes: sql<number>`count(*)::int`,
      })
      .from(pcaVotesTable)
      .groupBy(pcaVotesTable.votedTeamId);
    const byTeam = new Map(tallies.map((t) => [t.teamId, Number(t.votes)]));
    // Every candidate appears, including those on zero votes.
    const items = eligible
      .map((t) => ({
        teamId: t.id,
        teamName: t.name,
        campusName: t.campusName ?? "—",
        votes: byTeam.get(t.id) ?? 0,
      }))
      .sort(
        (a, b) => b.votes - a.votes || a.teamName.localeCompare(b.teamName),
      );
    const totalVotes = items.reduce((s, i) => s + i.votes, 0);
    res.json({ items, totalVotes });
  },
);

type VoteFilters = {
  role?: string;
  from?: string;
  to?: string;
};

function buildVoteWhere(f: VoteFilters): SQL<unknown> | undefined {
  const conds: Array<SQL<unknown> | undefined> = [];
  if (f.role === "leader" || f.role === "member") {
    conds.push(eq(pcaVotesTable.voterRole, f.role));
  }
  if (f.from) conds.push(gte(pcaVotesTable.createdAt, new Date(f.from)));
  if (f.to) {
    const end = new Date(f.to);
    end.setHours(23, 59, 59, 999);
    conds.push(lte(pcaVotesTable.createdAt, end));
  }
  return conds.length > 0 ? and(...conds) : undefined;
}

/** Tab 2: every vote, one row each. */
async function fetchVoteRows(f: VoteFilters) {
  const rows = await db
    .select({
      id: pcaVotesTable.id,
      voterId: pcaVotesTable.voterId,
      voterRole: pcaVotesTable.voterRole,
      voterTeamId: pcaVotesTable.voterTeamId,
      votedTeamId: pcaVotesTable.votedTeamId,
      comments: pcaVotesTable.comments,
      createdAt: pcaVotesTable.createdAt,
      voterFirst: usersTable.firstName,
      voterLast: usersTable.lastName,
      voterEmail: usersTable.email,
      voterTeamName: sql<string>`(SELECT name FROM teams WHERE id = ${pcaVotesTable.voterTeamId})`,
      votedTeamName: sql<string>`(SELECT name FROM teams WHERE id = ${pcaVotesTable.votedTeamId})`,
      campusName: sql<string>`(
        SELECT c.name FROM campuses c
        JOIN teams t ON t.campus_id = c.id
        WHERE t.id = ${pcaVotesTable.voterTeamId}
      )`,
    })
    .from(pcaVotesTable)
    .leftJoin(usersTable, eq(usersTable.id, pcaVotesTable.voterId))
    .where(buildVoteWhere(f))
    .orderBy(desc(pcaVotesTable.createdAt));

  return rows.map((r) => ({
    id: r.id,
    voterName:
      [r.voterFirst, r.voterLast].filter(Boolean).join(" ").trim() || "—",
    voterEmail: r.voterEmail ?? "",
    voterRole: r.voterRole,
    voterTeamId: r.voterTeamId,
    voterTeamName: r.voterTeamName ?? "—",
    votedTeamId: r.votedTeamId,
    votedTeamName: r.votedTeamName ?? "—",
    campusName: r.campusName ?? "—",
    comments: r.comments,
    createdAt: r.createdAt,
  }));
}

router.get(
  "/admin/pca/votes",
  requireAdminPage(ADMIN_PAGE, "view"),
  async (req: Request, res: Response): Promise<void> => {
    if (!requireAdmin(req, res)) return;
    const items = await fetchVoteRows({
      role: String(req.query["role"] ?? "") || undefined,
      from: String(req.query["from"] ?? "") || undefined,
      to: String(req.query["to"] ?? "") || undefined,
    });
    res.json({ items, totalCount: items.length });
  },
);

const EditVoteBody = z.object({
  votedTeamId: z.number().int().positive().optional(),
  comments: z.string().trim().max(2000).nullable().optional(),
});

/** Admin edits a vote — students cannot change their own. */
router.patch(
  "/admin/pca/votes/:id",
  requireAdminPage(ADMIN_PAGE, "edit"),
  async (req: Request, res: Response): Promise<void> => {
    if (!requireAdmin(req, res)) return;
    const id = Number(req.params["id"]);
    if (!Number.isFinite(id)) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }
    const parsed = EditVoteBody.safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const [row] = await db
      .select()
      .from(pcaVotesTable)
      .where(eq(pcaVotesTable.id, id))
      .limit(1);
    if (!row) {
      res.status(404).json({ error: "Vote not found." });
      return;
    }
    // Even an admin can't point a vote at the voter's own team.
    if (
      parsed.data.votedTeamId != null &&
      parsed.data.votedTeamId === row.voterTeamId
    ) {
      res.status(400).json({ error: "A team can't vote for itself." });
      return;
    }
    const patch: Record<string, unknown> = {
      updatedAt: new Date(),
      updatedBy: req.user!.id,
    };
    if (parsed.data.votedTeamId != null) {
      patch.votedTeamId = parsed.data.votedTeamId;
    }
    if (parsed.data.comments !== undefined) {
      patch.comments = (parsed.data.comments ?? "").trim() || null;
    }
    await db.update(pcaVotesTable).set(patch).where(eq(pcaVotesTable.id, id));
    res.json({ ok: true, id });
  },
);

/**
 * Hard delete — a removed vote frees the voter to vote again, which is the
 * point (an admin deletes a mistaken vote so the student can redo it).
 */
router.delete(
  "/admin/pca/votes/:id",
  requireAdminPage(ADMIN_PAGE, "delete"),
  async (req: Request, res: Response): Promise<void> => {
    if (!requireAdmin(req, res)) return;
    const id = Number(req.params["id"]);
    if (!Number.isFinite(id)) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }
    await db.delete(pcaVotesTable).where(eq(pcaVotesTable.id, id));
    res.json({ ok: true, id });
  },
);

function csvCell(value: unknown): string {
  const s = value == null ? "" : String(value);
  return `"${s.replace(/"/g, '""')}"`;
}

router.get(
  "/admin/pca/votes/export.csv",
  requireAdminPage(ADMIN_PAGE, "export"),
  async (req: Request, res: Response): Promise<void> => {
    if (!requireAdmin(req, res)) return;
    const rows = await fetchVoteRows({
      role: String(req.query["role"] ?? "") || undefined,
      from: String(req.query["from"] ?? "") || undefined,
      to: String(req.query["to"] ?? "") || undefined,
    });
    const header = [
      "Voter",
      "Email",
      "Tag",
      "Voter Team",
      "Campus",
      "Voted For",
      "Comments",
      "Voted At",
    ];
    const lines = [header.map(csvCell).join(",")];
    for (const r of rows) {
      lines.push(
        [
          r.voterName,
          r.voterEmail,
          r.voterRole === "leader" ? "Leader" : "Member",
          r.voterTeamName,
          r.campusName,
          r.votedTeamName,
          r.comments ?? "",
          r.createdAt ? new Date(r.createdAt).toISOString() : "",
        ]
          .map(csvCell)
          .join(","),
      );
    }
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      'attachment; filename="peoples-choice-votes.csv"',
    );
    res.send("﻿" + lines.join("\r\n"));
  },
);

// ── Admin config ───────────────────────────────────────────────────────────

const ConfigBody = z.object({
  pcaVotingEnabled: z.boolean().optional(),
  pcaMinVerifiedRevenue: z.number().int().min(0).optional(),
});

function serializeConfig(row: typeof programmeConfigTable.$inferSelect) {
  return {
    pcaVotingEnabled: row.pcaVotingEnabled,
    pcaMinVerifiedRevenue: row.pcaMinVerifiedRevenue,
  };
}

router.get(
  "/admin/pca-config",
  requireAdminPage("/admin/config", "view"),
  async (req: Request, res: Response): Promise<void> => {
    if (!requireAdmin(req, res)) return;
    res.json(serializeConfig(await getConfigRow(await resolveSeason(req))));
  },
);

router.put(
  "/admin/pca-config",
  requireAdminPage("/admin/config", "edit"),
  async (req: Request, res: Response): Promise<void> => {
    if (!requireAdmin(req, res)) return;
    const parsed = ConfigBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const row = await getConfigRow(await resolveSeason(req));
    const patch: Record<string, unknown> = {};
    if (parsed.data.pcaVotingEnabled !== undefined) {
      patch.pcaVotingEnabled = parsed.data.pcaVotingEnabled;
    }
    if (parsed.data.pcaMinVerifiedRevenue !== undefined) {
      patch.pcaMinVerifiedRevenue = parsed.data.pcaMinVerifiedRevenue;
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

    // Opening voting notifies every eligible voter. Best-effort — a mail
    // failure must never fail the save.
    const justOpened =
      parsed.data.pcaVotingEnabled === true && !row.pcaVotingEnabled;
    if (justOpened) {
      void notifyVotingOpen(
        updated?.pcaMinVerifiedRevenue ?? row.pcaMinVerifiedRevenue,
        await resolveSeason(req),
      );
    }
    res.json(serializeConfig(updated ?? row));
  },
);

/** Email every leader + member of every eligible team that voting is open. */
// `seasonId` is threaded from the config handler rather than resolved here:
// this runs detached (void-called) so it has no request of its own.
async function notifyVotingOpen(
  threshold: number,
  seasonId: number,
): Promise<void> {
  try {
    const appUrl = getAppUrl();
    const isRealEmail = (e: string | null | undefined): e is string =>
      !!e && !/@forms\.local$/i.test(e) && !/^sso_/i.test(e) && e.includes("@");
    const eligible = await getEligibleTeams(threshold, seasonId);
    for (const team of eligible) {
      const members = await db
        .select({ email: usersTable.email })
        .from(teamMembersTable)
        .leftJoin(usersTable, eq(usersTable.id, teamMembersTable.userId))
        .where(eq(teamMembersTable.teamId, team.id));
      const recipients = [
        ...new Set(members.map((m) => m.email).filter(isRealEmail)),
      ]
        .slice(0, 50)
        .map((email) => ({ email }));
      if (recipients.length === 0) continue;
      const { subject, text, html } = renderPcaVotingOpenEmail({
        teamName: team.name,
        appUrl,
      });
      await sendEmail({ category: "pcaVotes", to: recipients, subject, text, html });
    }
  } catch (err) {
    logger.error({ err }, "Failed to send PCA voting-open emails");
  }
}

export default router;
