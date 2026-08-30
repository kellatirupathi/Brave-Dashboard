/**
 * Projects submissions lock (additive, isolated — bypasses Orval codegen).
 *
 * Admin Config toggle that stops students from adding order book entries,
 * adding revenue entries, or submitting revenue for verification (i.e. the
 * BRD-upload flows on the student Projects page). While locked, the student
 * Projects pages show the configured message in a banner. Admins are never
 * blocked. Stored on the per-season programme_config row (added columns).
 */
import { Router, type IRouter, type Request, type Response } from "express";
import { z } from "zod";
import {
  db,
  programmeConfigTable,
  teamSubmissionExemptionsTable,
  submissionAccessRequestsTable,
  teamsTable,
  teamMembersTable,
  campusesTable,
  usersTable,
} from "@workspace/db";
import { and, desc, eq, ilike, inArray, or } from "drizzle-orm";
import { requireAdminPage } from "../lib/require-admin-page";
import {
  getActiveConfig,
  getConfig,
  isSeasonWritable,
  resolveSeason,
} from "../lib/season";
import { requireTeamLeader } from "../lib/auth";
import { logAudit } from "../lib/audit";
import { sendEmail, getAppUrl } from "../lib/email/brevo";
import {
  renderSubmissionEnabledEmail,
  renderSubmissionDisabledEmail,
  renderSubmissionRequestRejectedEmail,
} from "../lib/email/templates/submission-access";
import { logger } from "../lib/logger";

const router: IRouter = Router();

export const DEFAULT_PROJECTS_LOCK_MESSAGE =
  "Submissions are temporarily paused. You cannot add order book entries or upload BRDs for revenue verification right now. Please check back later.";

const UpdateBody = z.object({
  locked: z.boolean().optional(),
  message: z.string().max(1000).nullable().optional(),
  rejectedResubmitEnabled: z.boolean().optional(),
  submissionRequestEnabled: z.boolean().optional(),
});

export const SUBMISSION_REQUEST_DISABLED_ERROR =
  "Submission requests are currently closed. Please reach your success coach instead.";

export const REJECTED_RESUBMIT_DISABLED_ERROR =
  "Editing and resubmitting rejected entries is currently disabled. Please check back later.";

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

function serialize(row: typeof programmeConfigTable.$inferSelect) {
  return {
    locked: row.projectSubmissionsLocked,
    message:
      (row.projectSubmissionsLockMessage ?? "").trim() ||
      DEFAULT_PROJECTS_LOCK_MESSAGE,
    // When false, the student "Edit & fix" + "Resubmit for verification"
    // buttons on rejected revenue entries are hidden and the API blocks
    // resubmitting a rejected entry.
    rejectedResubmitEnabled: row.rejectedResubmitEnabled,
    // When false, the "Request to submit" button is hidden from the lock
    // banner and the request API rejects new requests.
    submissionRequestEnabled: row.submissionRequestEnabled,
  };
}

/**
 * Returns the lock message when project submissions are locked for this
 * request's user + team, or null when the action may proceed. Admins bypass
 * the lock. When the global lock is ON, a team is still allowed if it has a
 * per-team exemption row (team_submission_exemptions). Used by financials.ts
 * to enforce the lock server-side. Pass the entry's teamId so the exemption
 * can be checked.
 */
export async function getProjectSubmissionsLockError(
  req: Request,
  teamId?: number,
): Promise<string | null> {
  if (req.user?.role === "admin") return null;
  const [row] = await db
    .select({
      locked: programmeConfigTable.projectSubmissionsLocked,
      message: programmeConfigTable.projectSubmissionsLockMessage,
    })
    .from(programmeConfigTable)
    .where(eq(programmeConfigTable.seasonId, await resolveSeason(req)))
    .limit(1);
  if (!row?.locked) return null;
  // Global lock is ON — allow this team only if it is specifically exempted.
  if (teamId != null) {
    const [exempt] = await db
      .select({ id: teamSubmissionExemptionsTable.id })
      .from(teamSubmissionExemptionsTable)
      .where(eq(teamSubmissionExemptionsTable.teamId, teamId))
      .limit(1);
    if (exempt) return null;
  }
  return (row.message ?? "").trim() || DEFAULT_PROJECTS_LOCK_MESSAGE;
}

/**
 * Returns an error message when a student may NOT resubmit a rejected revenue
 * entry (the admin toggle is off), or null when resubmission is allowed. Admins
 * bypass the toggle. Used by financials.ts to enforce it on the submit route.
 */
export async function getRejectedResubmitError(
  req: Request,
): Promise<string | null> {
  if (req.user?.role === "admin") return null;
  const [row] = await db
    .select({ enabled: programmeConfigTable.rejectedResubmitEnabled })
    .from(programmeConfigTable)
    .where(eq(programmeConfigTable.seasonId, await resolveSeason(req)))
    .limit(1);
  // Default-allow when the row/column is missing.
  if (row?.enabled === false) return REJECTED_RESUBMIT_DISABLED_ERROR;
  return null;
}

// Readable by any authenticated user — the student Projects pages use this to
// show the banner and disable the add/submit actions. Also reports whether the
// CURRENT user's team is exempted from the global lock, so an exempted team
// sees no banner and can submit normally.
router.get(
  "/projects-lock",
  async (req: Request, res: Response): Promise<void> => {
    if (!req.isAuthenticated()) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    const season = await resolveSeason(req);
    const row = await getConfigRow(season);
    // Whether this season accepts revenue/order-book writes at all. Mirrors the
    // server-side guard on the financials routes so the student Projects page
    // never renders an add button that would 409. Admins and coordinators
    // bypass the archive, matching the guard.
    const seasonWritable =
      req.user.role === "admin" ||
      req.user.role === "coordinator" ||
      (await isSeasonWritable(season, "revenue"));
    // Resolve the caller's team and check whether it's exempted. Admins are
    // never locked; treat them as exempted so the UI never shows the banner.
    let exempted = req.user.role === "admin";
    if (!exempted) {
      const teamId = await getMyTeamId(req.user.id);
      if (teamId != null) {
        const [ex] = await db
          .select({ id: teamSubmissionExemptionsTable.id })
          .from(teamSubmissionExemptionsTable)
          .where(eq(teamSubmissionExemptionsTable.teamId, teamId))
          .limit(1);
        exempted = !!ex;
      }
    }
    res.json({ ...serialize(row), exempted, seasonId: season, seasonWritable });
  },
);

router.put(
  "/admin/projects-lock",
  requireAdminPage("/admin/config", "edit"),
  async (req: Request, res: Response): Promise<void> => {
    if (!req.isAuthenticated() || req.user.role !== "admin") {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
    const parsed = UpdateBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const row = await getConfigRow(await resolveSeason(req));
    const patch: Record<string, unknown> = {};
    if (parsed.data.locked !== undefined) {
      patch.projectSubmissionsLocked = parsed.data.locked;
    }
    if (parsed.data.message !== undefined) {
      const trimmed = (parsed.data.message ?? "").trim();
      patch.projectSubmissionsLockMessage = trimmed || null;
    }
    if (parsed.data.submissionRequestEnabled !== undefined) {
      patch.submissionRequestEnabled = parsed.data.submissionRequestEnabled;
    }
    if (parsed.data.rejectedResubmitEnabled !== undefined) {
      patch.rejectedResubmitEnabled = parsed.data.rejectedResubmitEnabled;
    }
    const [updated] = await db
      .update(programmeConfigTable)
      .set(patch)
      .where(eq(programmeConfigTable.id, row.id))
      .returning();
    await logAudit(
      req.user.id,
      "update_projects_lock",
      "programme_config",
      row.id,
      updated.projectSubmissionsLocked
        ? "locked project submissions"
        : "unlocked project submissions",
    );
    res.json(serialize(updated));
  },
);

// ───────────────────────────────────────────────────────────────────────────
// Per-team submission exemptions ("Teams Submissions" Config page + the
// per-team toggle on the admin team-detail header).
// ───────────────────────────────────────────────────────────────────────────

function requireAdmin(req: Request, res: Response): boolean {
  if (!req.isAuthenticated() || req.user.role !== "admin") {
    res.status(403).json({ error: "Forbidden" });
    return false;
  }
  return true;
}

// List currently-exempted teams, newest-enabled first (for the Config page).
router.get(
  "/admin/team-submission-exemptions",
  async (req: Request, res: Response): Promise<void> => {
    if (!requireAdmin(req, res)) return;
    const rows = await db
      .select({
        teamId: teamSubmissionExemptionsTable.teamId,
        enabledAt: teamSubmissionExemptionsTable.enabledAt,
        teamName: teamsTable.name,
        campusName: campusesTable.name,
      })
      .from(teamSubmissionExemptionsTable)
      .leftJoin(
        teamsTable,
        eq(teamsTable.id, teamSubmissionExemptionsTable.teamId),
      )
      .leftJoin(campusesTable, eq(campusesTable.id, teamsTable.campusId))
      .orderBy(desc(teamSubmissionExemptionsTable.enabledAt));
    res.json({
      items: rows.map((r) => ({
        teamId: r.teamId,
        teamName: r.teamName ?? `Team #${r.teamId}`,
        campusName: r.campusName ?? "",
        enabledAt: r.enabledAt,
      })),
    });
  },
);

// Search teams by name/campus (for the "add team" modal search box). Marks
// which results are already exempted so the UI can show their state.
router.get(
  "/admin/team-submission-exemptions/search",
  async (req: Request, res: Response): Promise<void> => {
    if (!requireAdmin(req, res)) return;
    const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
    if (q.length < 1) {
      res.json({ items: [] });
      return;
    }
    const like = `%${q}%`;
    const rows = await db
      .select({
        teamId: teamsTable.id,
        teamName: teamsTable.name,
        campusName: campusesTable.name,
      })
      .from(teamsTable)
      .leftJoin(campusesTable, eq(campusesTable.id, teamsTable.campusId))
      .where(or(ilike(teamsTable.name, like), ilike(campusesTable.name, like)))
      .orderBy(teamsTable.name)
      .limit(20);
    const ids = rows.map((r) => r.teamId);
    const exemptSet = new Set<number>();
    if (ids.length) {
      const ex = await db
        .select({ teamId: teamSubmissionExemptionsTable.teamId })
        .from(teamSubmissionExemptionsTable)
        .where(inArray(teamSubmissionExemptionsTable.teamId, ids));
      for (const e of ex) exemptSet.add(e.teamId);
    }
    res.json({
      items: rows.map((r) => ({
        teamId: r.teamId,
        teamName: r.teamName,
        campusName: r.campusName ?? "",
        exempted: exemptSet.has(r.teamId),
      })),
    });
  },
);

// Status for a single team (used by the team-detail header toggle).
router.get(
  "/admin/team-submission-exemptions/:teamId",
  async (req: Request, res: Response): Promise<void> => {
    if (!requireAdmin(req, res)) return;
    const teamId = Number(req.params.teamId);
    if (!Number.isInteger(teamId) || teamId <= 0) {
      res.status(400).json({ error: "Invalid team id" });
      return;
    }
    const [row] = await db
      .select({ enabledAt: teamSubmissionExemptionsTable.enabledAt })
      .from(teamSubmissionExemptionsTable)
      .where(eq(teamSubmissionExemptionsTable.teamId, teamId))
      .limit(1);
    res.json({ teamId, exempted: !!row, enabledAt: row?.enabledAt ?? null });
  },
);

const ToggleBody = z.object({
  // One team (team-detail toggle) …
  teamId: z.number().int().positive().optional(),
  // … or many (Config page bulk select).
  teamIds: z.array(z.number().int().positive()).max(1000).optional(),
  enabled: z.boolean(),
});

// Enable/disable submission exemptions for one or more teams. enabled=true
// upserts a row (idempotent); enabled=false deletes the row(s).
router.put(
  "/admin/team-submission-exemptions",
  requireAdminPage("/admin/config", "edit"),
  async (req: Request, res: Response): Promise<void> => {
    if (!req.isAuthenticated() || req.user.role !== "admin") {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
    const parsed = ToggleBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const ids = [
      ...(parsed.data.teamId != null ? [parsed.data.teamId] : []),
      ...(parsed.data.teamIds ?? []),
    ];
    const uniqueIds = Array.from(new Set(ids));
    if (uniqueIds.length === 0) {
      res.status(400).json({ error: "No team id provided" });
      return;
    }
    if (parsed.data.enabled) {
      await db
        .insert(teamSubmissionExemptionsTable)
        .values(uniqueIds.map((teamId) => ({ teamId, enabledBy: req.user.id })))
        .onConflictDoNothing();
      // Resolve any pending "request to submit" for these teams so they drop
      // off the requests list once the admin has enabled them.
      await db
        .update(submissionAccessRequestsTable)
        .set({
          status: "approved",
          decidedBy: req.user.id,
          decidedAt: new Date(),
        })
        .where(
          and(
            inArray(submissionAccessRequestsTable.teamId, uniqueIds),
            // Only the season being worked in — exempting a team today must
            // not retroactively approve a request it made in Season 1.
            eq(
              submissionAccessRequestsTable.seasonId,
              await resolveSeason(req),
            ),
            eq(submissionAccessRequestsTable.status, "pending"),
          ),
        );
    } else {
      await db
        .delete(teamSubmissionExemptionsTable)
        .where(inArray(teamSubmissionExemptionsTable.teamId, uniqueIds));
    }
    await logAudit(
      req.user.id,
      "update_team_submission_exemptions",
      "team",
      uniqueIds[0],
      `${parsed.data.enabled ? "enabled" : "disabled"} submissions for ${uniqueIds.length} team(s)`,
    );
    // Email each affected team's leader + members (best-effort; never blocks
    // the response). Fires for single, header, bulk and request-enable toggles
    // since they all go through this one endpoint.
    void notifyTeamsSubmissionToggle(uniqueIds, parsed.data.enabled);
    res.json({
      ok: true,
      count: uniqueIds.length,
      enabled: parsed.data.enabled,
    });
  },
);

// Emails every member (leader included) of the given teams that their
// submissions were enabled/disabled. Best-effort: skips synthetic/placeholder
// addresses, logs and swallows all errors.
async function notifyTeamsSubmissionToggle(
  teamIds: number[],
  enabled: boolean,
): Promise<void> {
  try {
    const appUrl = getAppUrl();
    const isRealEmail = (e: string | null | undefined): e is string =>
      !!e && !/@forms\.local$/i.test(e) && !/^sso_/i.test(e) && e.includes("@");
    // Team names.
    const teams = await db
      .select({ id: teamsTable.id, name: teamsTable.name })
      .from(teamsTable)
      .where(inArray(teamsTable.id, teamIds));
    const nameById = new Map(teams.map((t) => [t.id, t.name]));
    // Members (with emails) for these teams.
    const members = await db
      .select({ teamId: teamMembersTable.teamId, email: usersTable.email })
      .from(teamMembersTable)
      .leftJoin(usersTable, eq(usersTable.id, teamMembersTable.userId))
      .where(inArray(teamMembersTable.teamId, teamIds));
    const emailsByTeam = new Map<number, string[]>();
    for (const m of members) {
      if (!isRealEmail(m.email)) continue;
      const arr = emailsByTeam.get(m.teamId) ?? [];
      if (!arr.includes(m.email)) arr.push(m.email);
      emailsByTeam.set(m.teamId, arr);
    }
    for (const teamId of teamIds) {
      const recipients = (emailsByTeam.get(teamId) ?? [])
        .slice(0, 50)
        .map((email) => ({ email }));
      if (recipients.length === 0) continue;
      const teamName = nameById.get(teamId) ?? "your team";
      const { subject, text, html } = enabled
        ? renderSubmissionEnabledEmail({ teamName, appUrl })
        : renderSubmissionDisabledEmail({ teamName, appUrl });
      await sendEmail({ category: "submissionAccess", to: recipients, subject, text, html });
    }
  } catch (err) {
    logger.error({ err }, "Failed to send team submission toggle emails");
  }
}

// ───────────────────────────────────────────────────────────────────────────
// "Request to submit" — a locked team leader asks an admin to enable their
// team's submissions. Reviewed on the Config "Teams Submissions" page and the
// Communications → Submission Requests page.
// ───────────────────────────────────────────────────────────────────────────

// Resolve the current user's team id (via team_members). Null if not on a team.
async function getMyTeamId(userId: string): Promise<number | null> {
  const [row] = await db
    .select({ teamId: teamMembersTable.teamId })
    .from(teamMembersTable)
    .where(eq(teamMembersTable.userId, userId))
    .limit(1);
  return row?.teamId ?? null;
}

const CreateRequestBody = z.object({
  purpose: z.string().trim().max(1000).optional(),
});

// Student (team leader) files a request. Idempotent: if a pending request
// already exists for the team, it is returned as-is instead of duplicated.
router.post(
  "/submission-access-request",
  async (req: Request, res: Response): Promise<void> => {
    if (!req.isAuthenticated()) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    const teamId = await getMyTeamId(req.user.id);
    if (teamId == null) {
      res.status(400).json({ error: "You are not on a team." });
      return;
    }
    // Only the team leader (or an admin override) may request.
    if (!(await requireTeamLeader(req, res, teamId))) return;
    // Admin can close the request channel entirely (Config toggle).
    const config = await getConfigRow(await resolveSeason(req));
    if (!config.submissionRequestEnabled) {
      res.status(403).json({ error: SUBMISSION_REQUEST_DISABLED_ERROR });
      return;
    }
    const parsed = CreateRequestBody.safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const [existing] = await db
      .select()
      .from(submissionAccessRequestsTable)
      .where(
        and(
          eq(submissionAccessRequestsTable.teamId, teamId),
          // Scoped, so a request left pending in Season 1 does not block a
          // team from asking again in Season 2.
          eq(submissionAccessRequestsTable.seasonId, await resolveSeason(req)),
          eq(submissionAccessRequestsTable.status, "pending"),
        ),
      )
      .limit(1);
    if (existing) {
      res.json({ ok: true, alreadyPending: true, request: existing });
      return;
    }
    const [request] = await db
      .insert(submissionAccessRequestsTable)
      .values({
        teamId,
        // Stamped with the season the request was made in, so an admin working
        // Season 2 never sees a Season 1 request still sitting as pending.
        seasonId: await resolveSeason(req),
        requestedBy: req.user.id,
        purpose: parsed.data.purpose?.trim() || null,
      })
      .returning();
    res.status(201).json({ ok: true, alreadyPending: false, request });
  },
);

// Student: does my team have a pending request already? (drives the banner UI)
router.get(
  "/submission-access-request/mine",
  async (req: Request, res: Response): Promise<void> => {
    if (!req.isAuthenticated()) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    const teamId = await getMyTeamId(req.user.id);
    if (teamId == null) {
      res.json({ pending: false });
      return;
    }
    const [row] = await db
      .select({ createdAt: submissionAccessRequestsTable.createdAt })
      .from(submissionAccessRequestsTable)
      .where(
        and(
          eq(submissionAccessRequestsTable.teamId, teamId),
          // Scoped, so a request left pending in Season 1 does not block a
          // team from asking again in Season 2.
          eq(submissionAccessRequestsTable.seasonId, await resolveSeason(req)),
          eq(submissionAccessRequestsTable.status, "pending"),
        ),
      )
      .limit(1);
    res.json({ pending: !!row, createdAt: row?.createdAt ?? null });
  },
);

// Admin: list open submission requests (pending + rejected, so a rejected one
// stays visible with its reason) with team + leader name + purpose.
router.get(
  "/admin/submission-access-requests",
  async (req: Request, res: Response): Promise<void> => {
    if (!requireAdmin(req, res)) return;
    const leader = usersTable;
    const rows = await db
      .select({
        id: submissionAccessRequestsTable.id,
        teamId: submissionAccessRequestsTable.teamId,
        purpose: submissionAccessRequestsTable.purpose,
        status: submissionAccessRequestsTable.status,
        decisionNote: submissionAccessRequestsTable.decisionNote,
        createdAt: submissionAccessRequestsTable.createdAt,
        teamName: teamsTable.name,
        campusName: campusesTable.name,
        leaderFirst: leader.firstName,
        leaderLast: leader.lastName,
      })
      .from(submissionAccessRequestsTable)
      .leftJoin(
        teamsTable,
        eq(teamsTable.id, submissionAccessRequestsTable.teamId),
      )
      .leftJoin(campusesTable, eq(campusesTable.id, teamsTable.campusId))
      .leftJoin(leader, eq(leader.id, teamsTable.leaderId))
      .where(
        and(
          // Season-scoped: the admin list pooled every season's requests, so
          // Season 1's decided ones sat under the 2.0 badge.
          eq(
            submissionAccessRequestsTable.seasonId,
            await resolveSeason(req),
          ),
          inArray(submissionAccessRequestsTable.status, [
            "pending",
            "rejected",
          ]),
        ),
      )
      .orderBy(desc(submissionAccessRequestsTable.createdAt));
    // Which of these teams are already exempted (so the UI can show state).
    const ids = rows.map((r) => r.teamId);
    const exemptSet = new Set<number>();
    if (ids.length) {
      const ex = await db
        .select({ teamId: teamSubmissionExemptionsTable.teamId })
        .from(teamSubmissionExemptionsTable)
        .where(inArray(teamSubmissionExemptionsTable.teamId, ids));
      for (const e of ex) exemptSet.add(e.teamId);
    }
    res.json({
      items: rows.map((r) => ({
        id: r.id,
        teamId: r.teamId,
        teamName: r.teamName ?? `Team #${r.teamId}`,
        campusName: r.campusName ?? "",
        leaderName:
          `${r.leaderFirst ?? ""} ${r.leaderLast ?? ""}`.trim() || "—",
        purpose: r.purpose ?? "",
        status: r.status,
        decisionNote: r.decisionNote ?? "",
        createdAt: r.createdAt,
        exempted: exemptSet.has(r.teamId),
      })),
    });
  },
);

const RejectRequestBody = z.object({
  reason: z.string().trim().min(1).max(1000),
});

// Admin: reject a pending "Request to submit" with a reason. The team's
// leader + members are emailed the reason. The row stays visible (status
// 'rejected') so admins can see what was declined and why.
router.put(
  "/admin/submission-access-requests/:id/reject",
  requireAdminPage("/admin/config", "edit"),
  async (req: Request, res: Response): Promise<void> => {
    if (!req.isAuthenticated() || req.user.role !== "admin") {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      res.status(400).json({ error: "Invalid request id" });
      return;
    }
    const parsed = RejectRequestBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const [updated] = await db
      .update(submissionAccessRequestsTable)
      .set({
        status: "rejected",
        decisionNote: parsed.data.reason,
        decidedBy: req.user.id,
        decidedAt: new Date(),
      })
      .where(eq(submissionAccessRequestsTable.id, id))
      .returning();
    if (!updated) {
      res.status(404).json({ error: "Request not found" });
      return;
    }
    await logAudit(
      req.user.id,
      "reject_submission_access_request",
      "team",
      updated.teamId,
      parsed.data.reason,
    );
    // Email the team (best-effort; never blocks the response).
    void notifySubmissionRequestRejected(updated.teamId, parsed.data.reason);
    res.json({ ok: true, id: updated.id, status: updated.status });
  },
);

// Emails a team's members that their submission request was rejected, with the
// admin's reason. Best-effort: skips placeholder addresses, swallows errors.
async function notifySubmissionRequestRejected(
  teamId: number,
  reason: string,
): Promise<void> {
  try {
    const appUrl = getAppUrl();
    const isRealEmail = (e: string | null | undefined): e is string =>
      !!e && !/@forms\.local$/i.test(e) && !/^sso_/i.test(e) && e.includes("@");
    const [team] = await db
      .select({ name: teamsTable.name })
      .from(teamsTable)
      .where(eq(teamsTable.id, teamId));
    const members = await db
      .select({ email: usersTable.email })
      .from(teamMembersTable)
      .leftJoin(usersTable, eq(usersTable.id, teamMembersTable.userId))
      .where(eq(teamMembersTable.teamId, teamId));
    const recipients = Array.from(
      new Set(members.map((m) => m.email).filter(isRealEmail)),
    )
      .slice(0, 50)
      .map((email) => ({ email }));
    if (recipients.length === 0) return;
    const { subject, text, html } = renderSubmissionRequestRejectedEmail({
      teamName: team?.name ?? "your team",
      appUrl,
      reason,
    });
    await sendEmail({ category: "submissionAccess", to: recipients, subject, text, html });
  } catch (err) {
    logger.error({ err }, "Failed to send submission-request rejected email");
  }
}

export default router;
