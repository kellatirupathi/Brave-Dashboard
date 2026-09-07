/**
 * Support tickets (additive, isolated).
 *
 * A student raises a ticket; staff assign it, answer it, and close it. Both
 * sides read the same rows, so what a student is told and what staff recorded
 * cannot drift apart.
 *
 * SEASON-SCOPED. Every list is filtered to the caller's season, so Season 1's
 * support history stays separate from Season 2's rather than the two piling
 * into one queue.
 *
 * The student side is governed by lib/tickets-control.ts — add and view by
 * default, edit and delete only if an admin turns them on. Staff are never
 * governed by that map; their access is the ordinary role check.
 *
 * Deleting the feature means removing the single `router.use(...)` line in
 * routes/index.ts plus its import, and dropping the table.
 */
import { Router, type IRouter, type Request, type Response } from "express";
import { and, desc, eq, isNull, or, sql } from "drizzle-orm";
import {
  db,
  supportTicketsTable,
  usersTable,
  teamMembersTable,
  campusesTable,
  programmeConfigTable,
} from "@workspace/db";
import { z } from "zod";
import { resolveSeason } from "../lib/season";
import { requireAdminPage } from "../lib/require-admin-page";
import {
  allowTicketAction,
  getTicketsControlState,
  isTicketsStaff,
  normalizeTicketsControlPermissions,
} from "../lib/tickets-control";
import { sanitizeRichText, richTextToPlain } from "../lib/sanitize-html";
import { sendEmail } from "../lib/email/brevo";
import { logAudit } from "../lib/audit";
import { logger } from "../lib/logger";

const router: IRouter = Router();

const TICKET_CATEGORIES = [
  "technical",
  "leads",
  "revenue",
  "team",
  "account",
  "other",
] as const;

const CreateTicketBody = z.object({
  subject: z.string().trim().min(3).max(200),
  description: z.string().trim().min(10).max(5000),
  category: z.enum(TICKET_CATEGORIES).default("other"),
  // Object paths from the shared uploader. Bounded so one ticket cannot carry
  // an unbounded list.
  attachments: z.array(z.string().trim().min(1).max(2000)).max(5).optional(),
});

/** Everything a list row needs, joined once rather than per row. */
const ticketColumns = {
  id: supportTicketsTable.id,
  publicId: supportTicketsTable.publicId,
  seasonId: supportTicketsTable.seasonId,
  subject: supportTicketsTable.subject,
  description: supportTicketsTable.description,
  category: supportTicketsTable.category,
  attachments: supportTicketsTable.attachments,
  status: supportTicketsTable.status,
  assignedTo: supportTicketsTable.assignedTo,
  assignedAt: supportTicketsTable.assignedAt,
  resolution: supportTicketsTable.resolution,
  resolvedBy: supportTicketsTable.resolvedBy,
  resolvedAt: supportTicketsTable.resolvedAt,
  createdAt: supportTicketsTable.createdAt,
  createdBy: supportTicketsTable.createdBy,
  // Who raised it — the admin queue is unusable without a name.
  creatorFirstName: usersTable.firstName,
  creatorLastName: usersTable.lastName,
  creatorEmail: usersTable.email,
  creatorNiatId: usersTable.niatId,
  campusName: campusesTable.name,
};

function ticketQuery() {
  return db
    .select(ticketColumns)
    .from(supportTicketsTable)
    .leftJoin(usersTable, eq(usersTable.id, supportTicketsTable.createdBy))
    .leftJoin(campusesTable, eq(campusesTable.id, usersTable.campusId));
}

/**
 * GET /api/tickets/config
 *
 * What this caller may do, so the client can hide controls it would be refused
 * anyway. The server still enforces every rule below; this only avoids
 * offering a button that would fail.
 */
router.get(
  "/tickets/config",
  async (req: Request, res: Response): Promise<void> => {
    if (!req.isAuthenticated()) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    const state = await getTicketsControlState(req);
    res.json({
      ...state,
      isStaff: isTicketsStaff(req),
      categories: TICKET_CATEGORIES,
    });
  },
);

/**
 * GET /api/tickets/mine
 *
 * A student's own tickets for this season, newest first.
 */
router.get(
  "/tickets/mine",
  async (req: Request, res: Response): Promise<void> => {
    if (!req.isAuthenticated()) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    if (!(await allowTicketAction(req, "view"))) {
      res.status(403).json({ error: "You cannot view tickets." });
      return;
    }
    const season = await resolveSeason(req);
    const rows = await ticketQuery()
      .where(
        and(
          eq(supportTicketsTable.createdBy, req.user.id),
          eq(supportTicketsTable.seasonId, season),
        ),
      )
      .orderBy(desc(supportTicketsTable.createdAt));
    res.json({ tickets: rows });
  },
);

/**
 * POST /api/tickets
 *
 * Raise a ticket. Season and author come from the session — neither is
 * accepted from the client, so a ticket cannot be filed into another season or
 * under someone else's name.
 */
router.post("/tickets", async (req: Request, res: Response): Promise<void> => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  if (!(await allowTicketAction(req, "add"))) {
    res.status(403).json({ error: "Raising tickets is turned off right now." });
    return;
  }
  const parsed = CreateTicketBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const d = parsed.data;
  const season = await resolveSeason(req);

  const [team] = await db
    .select({ teamId: teamMembersTable.teamId })
    .from(teamMembersTable)
    .where(eq(teamMembersTable.userId, req.user.id))
    .limit(1);

  const [ticket] = await db
    .insert(supportTicketsTable)
    .values({
      seasonId: season,
      createdBy: req.user.id,
      teamId: team?.teamId ?? null,
      subject: d.subject,
      description: d.description,
      category: d.category,
      attachments: d.attachments ?? null,
    })
    .returning();

  if (!ticket) {
    res.status(500).json({ error: "Could not raise the ticket." });
    return;
  }

  // Acknowledgement. Best-effort: a mail failure must not lose the ticket the
  // student just wrote.
  void sendTicketCreatedEmail(req.user.id, ticket).catch((err) =>
    logger.warn({ err, ticketId: ticket.id }, "[tickets] created email failed"),
  );

  res.status(201).json({ ticket });
});

/**
 * GET /api/tickets  (staff)
 *
 * The queue. `scope` selects the tab: open work, closed work, or mine.
 */
router.get(
  "/tickets",
  requireAdminPage("/admin/tickets", "view"),
  async (req: Request, res: Response): Promise<void> => {
    if (!req.isAuthenticated()) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    if (!isTicketsStaff(req)) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
    const season = await resolveSeason(req);
    const scope = String(req.query["scope"] ?? "active");
    const search = String(req.query["search"] ?? "")
      .trim()
      .toLowerCase();
    const category = String(req.query["category"] ?? "").trim();
    const from = String(req.query["from"] ?? "").trim();
    const to = String(req.query["to"] ?? "").trim();

    const where = [eq(supportTicketsTable.seasonId, season)];

    if (scope === "closed") {
      where.push(eq(supportTicketsTable.status, "resolved"));
    } else if (scope === "mine") {
      // Mine means everything I hold, open or already answered — an admin wants
      // to see what they closed as well as what is still on their plate.
      where.push(eq(supportTicketsTable.assignedTo, req.user.id));
    } else {
      where.push(
        or(
          eq(supportTicketsTable.status, "open"),
          eq(supportTicketsTable.status, "in_progress"),
        )!,
      );
    }

    if (
      category &&
      (TICKET_CATEGORIES as readonly string[]).includes(category)
    ) {
      where.push(
        eq(
          supportTicketsTable.category,
          category as (typeof TICKET_CATEGORIES)[number],
        ),
      );
    }
    if (/^\d{4}-\d{2}-\d{2}$/.test(from)) {
      where.push(sql`${supportTicketsTable.createdAt} >= ${from}::date`);
    }
    if (/^\d{4}-\d{2}-\d{2}$/.test(to)) {
      // Inclusive of the whole end day, which is what a date picker implies.
      where.push(
        sql`${supportTicketsTable.createdAt} < (${to}::date + interval '1 day')`,
      );
    }
    if (search.length >= 2) {
      const like = `%${search}%`;
      where.push(
        sql`(
        lower(${supportTicketsTable.subject}) LIKE ${like}
        OR lower(${supportTicketsTable.description}) LIKE ${like}
        OR lower(coalesce(${usersTable.firstName}, '') || ' ' || coalesce(${usersTable.lastName}, '')) LIKE ${like}
        OR lower(coalesce(${usersTable.email}, '')) LIKE ${like}
        OR lower(coalesce(${usersTable.niatId}, '')) LIKE ${like}
      )`,
      );
    }

    const rows = await ticketQuery()
      .where(and(...where))
      .orderBy(desc(supportTicketsTable.createdAt));

    // Tab counts, so the labels are right without three more round-trips.
    const [counts] = await db
      .select({
        active: sql<number>`count(*) filter (where status <> 'resolved')::int`,
        closed: sql<number>`count(*) filter (where status = 'resolved')::int`,
        mine: sql<number>`count(*) filter (where assigned_to = ${req.user.id})::int`,
      })
      .from(supportTicketsTable)
      .where(eq(supportTicketsTable.seasonId, season));

    res.json({
      tickets: rows,
      counts: {
        active: Number(counts?.active ?? 0),
        closed: Number(counts?.closed ?? 0),
        mine: Number(counts?.mine ?? 0),
      },
    });
  },
);

/**
 * POST /api/tickets/:publicId/assign  (staff)
 *
 * Take a ticket, or hand it to someone else. Reassignment simply overwrites
 * the owner, so a ticket always names exactly one.
 */
router.post(
  "/tickets/:publicId/assign",
  requireAdminPage("/admin/tickets", "edit"),
  async (req: Request, res: Response): Promise<void> => {
    if (!req.isAuthenticated()) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    if (!isTicketsStaff(req)) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
    const publicId = String(req.params["publicId"] ?? "");
    const assignee =
      typeof req.body?.assignTo === "string" && req.body.assignTo.trim()
        ? String(req.body.assignTo)
        : req.user.id;

    const [updated] = await db
      .update(supportTicketsTable)
      .set({
        assignedTo: assignee,
        assignedAt: new Date(),
        // Taking an open ticket starts work on it. A resolved one keeps its
        // status — reassigning history must not reopen it.
        status: sql`CASE WHEN ${supportTicketsTable.status} = 'open'
                         THEN 'in_progress'::support_ticket_status
                         ELSE ${supportTicketsTable.status} END`,
      })
      .where(eq(supportTicketsTable.publicId, publicId))
      .returning();

    if (!updated) {
      res.status(404).json({ error: "Ticket not found" });
      return;
    }
    res.json({ ticket: updated });
  },
);

const ResolveBody = z.object({
  resolution: z.string().trim().min(1).max(20000),
});

/**
 * POST /api/tickets/:publicId/resolve  (staff)
 *
 * Answer and close. The resolution is sanitised before it is stored, so what
 * reaches a student's browser and inbox is already safe by the time anything
 * renders it.
 */
router.post(
  "/tickets/:publicId/resolve",
  requireAdminPage("/admin/tickets", "edit"),
  async (req: Request, res: Response): Promise<void> => {
    if (!req.isAuthenticated()) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    if (!isTicketsStaff(req)) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
    const parsed = ResolveBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const clean = sanitizeRichText(parsed.data.resolution);
    if (!richTextToPlain(clean)) {
      res.status(400).json({ error: "Write a resolution before submitting." });
      return;
    }

    const publicId = String(req.params["publicId"] ?? "");
    const [updated] = await db
      .update(supportTicketsTable)
      .set({
        resolution: clean,
        resolvedBy: req.user.id,
        resolvedAt: new Date(),
        status: "resolved",
        // Answering a ticket nobody had claimed makes the answerer its owner,
        // so "my tickets" reflects what this person actually handled.
        assignedTo: sql`COALESCE(${supportTicketsTable.assignedTo}, ${req.user.id})`,
      })
      .where(eq(supportTicketsTable.publicId, publicId))
      .returning();

    if (!updated) {
      res.status(404).json({ error: "Ticket not found" });
      return;
    }

    void sendTicketResolvedEmail(updated).catch((err) =>
      logger.warn(
        { err, ticketId: updated.id },
        "[tickets] resolved email failed",
      ),
    );

    try {
      await logAudit(
        req.user.id,
        "resolve_support_ticket",
        "support_ticket",
        updated.id,
        JSON.stringify({ publicId }),
      );
    } catch {
      // An audit hiccup must not undo a resolution that already succeeded.
    }

    res.json({ ticket: updated });
  },
);

/** Everyone who could be handed a ticket. */
router.get(
  "/tickets/assignees",
  async (req: Request, res: Response): Promise<void> => {
    if (!req.isAuthenticated()) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    if (!isTicketsStaff(req)) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
    const rows = await db
      .select({
        id: usersTable.id,
        firstName: usersTable.firstName,
        lastName: usersTable.lastName,
        email: usersTable.email,
        role: usersTable.role,
      })
      .from(usersTable)
      .where(
        or(eq(usersTable.role, "admin"), eq(usersTable.role, "coordinator")),
      );
    res.json({ assignees: rows });
  },
);

// ── Emails ──────────────────────────────────────────────────────────────────

function shortId(publicId: string): string {
  return publicId.slice(0, 8).toUpperCase();
}

async function sendTicketCreatedEmail(
  userId: string,
  ticket: {
    id: number;
    publicId: string;
    subject: string;
    description: string;
  },
): Promise<void> {
  const [user] = await db
    .select({
      email: usersTable.email,
      firstName: usersTable.firstName,
    })
    .from(usersTable)
    .where(eq(usersTable.id, userId))
    .limit(1);
  if (!user?.email) return;

  const name = user.firstName?.trim() || "there";
  const ref = shortId(ticket.publicId);
  await sendEmail({
    to: { email: user.email, name: user.firstName ?? undefined },
    category: "ticketCreated",
    subject: `We've got your ticket (${ref}) — ${ticket.subject}`,
    text: `Hi ${name},

Thanks for getting in touch. Your support ticket is with the BRAVE team.

Reference: ${ref}
Subject: ${ticket.subject}

What you told us:
${ticket.description}

We'll email you as soon as somebody has looked at it. You can also see the
status any time on the Ticket Support page in your dashboard.

— The BRAVE team`,
  });
}

async function sendTicketResolvedEmail(ticket: {
  id: number;
  publicId: string;
  subject: string;
  createdBy: string;
  resolution: string | null;
}): Promise<void> {
  const [user] = await db
    .select({ email: usersTable.email, firstName: usersTable.firstName })
    .from(usersTable)
    .where(eq(usersTable.id, ticket.createdBy))
    .limit(1);
  if (!user?.email) return;

  const name = user.firstName?.trim() || "there";
  const ref = shortId(ticket.publicId);
  const html = ticket.resolution ?? "";
  const plain = richTextToPlain(html);

  await sendEmail({
    to: { email: user.email, name: user.firstName ?? undefined },
    category: "ticketResolved",
    subject: `Your ticket (${ref}) has been answered — ${ticket.subject}`,
    text: `Hi ${name},

Good news — your support ticket has been answered.

Reference: ${ref}
Subject: ${ticket.subject}

Here's what the team said:

${plain}

If this didn't sort it out, raise a new ticket from the Ticket Support page and
we'll pick it up.

— The BRAVE team`,
    html: `<p>Hi ${name},</p>
<p>Good news — your support ticket has been answered.</p>
<p><strong>Reference:</strong> ${ref}<br>
<strong>Subject:</strong> ${ticket.subject}</p>
<p>Here's what the team said:</p>
<div style="border-left:3px solid #ddd;padding-left:12px;margin:12px 0">${html}</div>
<p>If this didn't sort it out, raise a new ticket from the Ticket Support page
and we'll pick it up.</p>
<p>— The BRAVE team</p>`,
  });
}

// ── Admin controls (Config → Leads Control area) ─────────────────────────────

const AdminControlBody = z.object({
  menuEnabled: z.boolean(),
  permissions: z.object({
    add: z.boolean(),
    view: z.boolean(),
    edit: z.boolean(),
    delete: z.boolean(),
  }),
});

/** What the Config screen shows for this season. */
router.get(
  "/admin/tickets-control",
  requireAdminPage("/admin/config", "view"),
  async (req: Request, res: Response): Promise<void> => {
    if (!req.isAuthenticated()) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    res.json(await getTicketsControlState(req));
  },
);

/**
 * Save them. Season-scoped like every other Config control, so turning tickets
 * on for Season 2 leaves Season 1 exactly as it was.
 */
router.put(
  "/admin/tickets-control",
  requireAdminPage("/admin/config", "edit"),
  async (req: Request, res: Response): Promise<void> => {
    if (!req.isAuthenticated() || req.user.role !== "admin") {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
    const parsed = AdminControlBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const seasonId = await resolveSeason(req);
    const [row] = await db
      .select({ id: programmeConfigTable.id })
      .from(programmeConfigTable)
      .where(eq(programmeConfigTable.seasonId, seasonId))
      .limit(1);
    if (!row) {
      res
        .status(404)
        .json({ error: "No programme configuration for this season yet." });
      return;
    }
    await db
      .update(programmeConfigTable)
      .set({
        ticketsMenuEnabled: parsed.data.menuEnabled,
        ticketsControlPermissions: normalizeTicketsControlPermissions(
          parsed.data.permissions,
        ),
      })
      .where(eq(programmeConfigTable.id, row.id));

    await logAudit(
      req.user.id,
      "update_tickets_control",
      "programme_config",
      row.id,
      `Ticket Support menu ${parsed.data.menuEnabled ? "on" : "off"}`,
    );
    res.json(await getTicketsControlState(req));
  },
);

export default router;
