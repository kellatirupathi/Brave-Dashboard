/**
 * Support tickets (additive, isolated).
 *
 * A student raises a ticket; staff assign it, answer it, and close it. Both
 * sides read the same rows, so what a student is told and what staff recorded
 * cannot drift apart.
 *
 * A TICKET IS A CONVERSATION. The opening question lives on the ticket row
 * (subject + description). Everything after it — staff replies and student
 * follow-ups — lives in support_ticket_messages, oldest first. A follow-up
 * reopens the ticket so it lands back in the staff queue; a staff reply
 * closes it again and emails the student.
 *
 * Tickets answered before threads existed carry that answer only in
 * support_tickets.resolution. lockTicket() copies it into the thread the
 * first time anything touches the ticket, under a row lock, so it is never
 * lost and never copied twice. `resolution` stays in step with the latest
 * staff reply, so the list endpoints return what they always did.
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
 * routes/index.ts plus its import, and dropping the tables.
 */
import { Router, type IRouter, type Request, type Response } from "express";
import { and, asc, desc, eq, inArray, isNull, or, sql } from "drizzle-orm";
import {
  db,
  supportTicketsTable,
  supportTicketMessagesTable,
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

// The category tree the UI offers. Mirrored in the client at
// brave-dashboard/src/lib/ticket-categories.ts, which also holds the
// sub-category lists and the display labels.
//
// The six superseded values (technical / leads / revenue / team / account /
// other) are still valid in the database enum so older rows read back, but a
// new ticket can only be filed under one of these.
const TICKET_CATEGORIES = [
  "leads_clients",
  "projects_brd",
  "revenue_payments",
  "team_membership",
  "journal_grit",
  "account_technical",
] as const;

// Every value the admin filter may be given — the tree plus the superseded
// ones, so a queue filtered by an old category still finds those tickets.
const FILTERABLE_CATEGORIES: readonly string[] = [
  ...TICKET_CATEGORIES,
  "technical",
  "leads",
  "revenue",
  "team",
  "account",
  "other",
];

// publicId is a uuid column; a malformed value makes Postgres throw rather
// than match nothing, so it is turned away as "not found" before any query.
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const CreateTicketBody = z.object({
  subject: z.string().trim().min(3).max(200),
  description: z.string().trim().min(10).max(5000),
  category: z.enum(TICKET_CATEGORIES),
  // Required: the whole point of the tree is that a ticket arrives routed.
  subcategory: z.string().trim().min(1).max(200),
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
  subcategory: supportTicketsTable.subcategory,
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

// ── Threads ─────────────────────────────────────────────────────────────────

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * Lock a ticket for a thread change, and fold in its pre-thread answer.
 *
 * Every thread write — and the first read of an old ticket — goes through
 * here inside a transaction. The row lock serialises concurrent writers on
 * one ticket, which is what keeps the one-time copy of `resolution` into the
 * thread from ever happening twice. The copy only runs while the ticket has
 * no messages at all; a soft-deleted reply still counts, so an answer an
 * admin deleted is never resurrected.
 */
async function lockTicket(tx: Tx, publicId: string) {
  const [ticket] = await tx
    .select()
    .from(supportTicketsTable)
    .where(eq(supportTicketsTable.publicId, publicId))
    .for("update");
  if (!ticket) return null;

  if (ticket.resolution?.trim()) {
    const [existing] = await tx
      .select({ id: supportTicketMessagesTable.id })
      .from(supportTicketMessagesTable)
      .where(eq(supportTicketMessagesTable.ticketId, ticket.id))
      .limit(1);
    if (!existing) {
      await tx.insert(supportTicketMessagesTable).values({
        ticketId: ticket.id,
        authorId: ticket.resolvedBy ?? ticket.assignedTo ?? "system",
        authorKind: "staff",
        body: ticket.resolution,
        createdAt: ticket.resolvedAt ?? ticket.updatedAt,
      });
    }
  }
  return ticket;
}

/** The newest staff reply still standing, or null when none is left. */
async function latestStaffReply(tx: Tx, ticketId: number) {
  const [row] = await tx
    .select()
    .from(supportTicketMessagesTable)
    .where(
      and(
        eq(supportTicketMessagesTable.ticketId, ticketId),
        eq(supportTicketMessagesTable.authorKind, "staff"),
        isNull(supportTicketMessagesTable.deletedAt),
      ),
    )
    .orderBy(
      desc(supportTicketMessagesTable.createdAt),
      desc(supportTicketMessagesTable.id),
    )
    .limit(1);
  return row ?? null;
}

/**
 * The conversation after the opening question, oldest first.
 *
 * Students see every staff reply as "BRAVE team", as the ticket page always
 * has; staff see who actually wrote it. Author ids never leave the server.
 */
async function loadThread(ticketId: number, viewerIsStaff: boolean) {
  const rows = await db
    .select()
    .from(supportTicketMessagesTable)
    .where(
      and(
        eq(supportTicketMessagesTable.ticketId, ticketId),
        isNull(supportTicketMessagesTable.deletedAt),
      ),
    )
    .orderBy(
      asc(supportTicketMessagesTable.createdAt),
      asc(supportTicketMessagesTable.id),
    );

  const authorIds = [...new Set(rows.map((r) => r.authorId))];
  const authors = authorIds.length
    ? await db
        .select({
          id: usersTable.id,
          firstName: usersTable.firstName,
          lastName: usersTable.lastName,
        })
        .from(usersTable)
        .where(inArray(usersTable.id, authorIds))
    : [];
  const nameById = new Map(
    authors.map((a) => [
      a.id,
      `${a.firstName ?? ""} ${a.lastName ?? ""}`.trim(),
    ]),
  );

  return rows.map((r) => {
    const staff = r.authorKind === "staff";
    const name = nameById.get(r.authorId) ?? "";
    return {
      id: r.id,
      authorKind: staff ? ("staff" as const) : ("student" as const),
      authorName: staff
        ? viewerIsStaff
          ? name || "BRAVE team"
          : "BRAVE team"
        : name || "Student",
      body: r.body,
      createdAt: r.createdAt,
      editedAt: r.editedAt,
    };
  });
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
      subcategory: d.subcategory,
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

    if (category && FILTERABLE_CATEGORIES.includes(category)) {
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
        OR lower(coalesce(${supportTicketsTable.subcategory}, '')) LIKE ${like}
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
    if (!UUID_RE.test(publicId)) {
      res.status(404).json({ error: "Ticket not found" });
      return;
    }
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
 * Reply and close. The reply is sanitised before it is stored, so what reaches
 * a student's browser and inbox is already safe by the time anything renders
 * it. It is added to the thread and mirrored into `resolution`, so a ticket
 * can be answered again after a follow-up without losing the earlier replies.
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
    if (!UUID_RE.test(publicId)) {
      res.status(404).json({ error: "Ticket not found" });
      return;
    }
    const userId = req.user.id;

    const updated = await db.transaction(async (tx) => {
      const locked = await lockTicket(tx, publicId);
      if (!locked) return null;
      const [row] = await tx
        .update(supportTicketsTable)
        .set({
          resolution: clean,
          resolvedBy: userId,
          resolvedAt: new Date(),
          status: "resolved",
          // Answering a ticket nobody had claimed makes the answerer its
          // owner, so "my tickets" reflects what this person handled.
          assignedTo: sql`COALESCE(${supportTicketsTable.assignedTo}, ${userId})`,
        })
        .where(eq(supportTicketsTable.id, locked.id))
        .returning();
      await tx.insert(supportTicketMessagesTable).values({
        ticketId: locked.id,
        authorId: userId,
        authorKind: "staff",
        body: clean,
      });
      return row ?? null;
    });

    if (!updated) {
      res.status(404).json({ error: "Ticket not found" });
      return;
    }

    void sendTicketReplyEmail(updated, clean, "answered").catch((err) =>
      logger.warn(
        { err, ticketId: updated.id },
        "[tickets] resolved email failed",
      ),
    );

    try {
      await logAudit(
        userId,
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

// ── Ticket detail and conversation ──────────────────────────────────────────
//
// Registered after every literal /tickets/<word> route above (config, mine,
// assignees). Express matches in registration order, so /tickets/:publicId
// can never swallow them.

/**
 * GET /api/tickets/:publicId
 *
 * One ticket and its conversation. A student may open only their own; staff
 * may open any. A student asking for someone else's ticket gets the same
 * answer as a ticket that does not exist, so ids cannot be probed.
 */
router.get(
  "/tickets/:publicId",
  requireAdminPage("/admin/tickets", "view"),
  async (req: Request, res: Response): Promise<void> => {
    if (!req.isAuthenticated()) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    const publicId = String(req.params["publicId"] ?? "");
    if (!UUID_RE.test(publicId)) {
      res.status(404).json({ error: "Ticket not found" });
      return;
    }
    const staff = isTicketsStaff(req);
    if (!staff && !(await allowTicketAction(req, "view"))) {
      res.status(403).json({ error: "You cannot view tickets." });
      return;
    }

    const [ticket] = await ticketQuery()
      .where(eq(supportTicketsTable.publicId, publicId))
      .limit(1);
    if (!ticket || (!staff && ticket.createdBy !== req.user.id)) {
      res.status(404).json({ error: "Ticket not found" });
      return;
    }

    // An old ticket's answer is folded into the thread on its first read.
    if (ticket.resolution?.trim()) {
      await db.transaction((tx) => lockTicket(tx, publicId));
    }

    const messages = await loadThread(ticket.id, staff);
    res.json({ ticket, messages });
  },
);

const FollowUpBody = z.object({
  body: z.string().trim().min(2).max(5000),
});

/**
 * POST /api/tickets/:publicId/messages  (the student who raised it)
 *
 * A follow-up question on the same ticket. It puts the ticket back in front of
 * staff — open again, or in progress if somebody already holds it — so it
 * shows up in the Active queue with the whole conversation attached.
 */
router.post(
  "/tickets/:publicId/messages",
  async (req: Request, res: Response): Promise<void> => {
    if (!req.isAuthenticated()) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    if (isTicketsStaff(req)) {
      res
        .status(403)
        .json({ error: "Staff reply from the ticket page instead." });
      return;
    }
    if (!(await allowTicketAction(req, "add"))) {
      res
        .status(403)
        .json({ error: "Sending follow-ups is turned off right now." });
      return;
    }
    const parsed = FollowUpBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Write your follow-up before sending." });
      return;
    }
    const publicId = String(req.params["publicId"] ?? "");
    if (!UUID_RE.test(publicId)) {
      res.status(404).json({ error: "Ticket not found" });
      return;
    }
    const userId = req.user.id;
    const body = parsed.data.body;

    const message = await db.transaction(async (tx) => {
      const ticket = await lockTicket(tx, publicId);
      if (!ticket || ticket.createdBy !== userId) return null;
      const [row] = await tx
        .insert(supportTicketMessagesTable)
        .values({
          ticketId: ticket.id,
          authorId: userId,
          authorKind: "student",
          body,
        })
        .returning();
      await tx
        .update(supportTicketsTable)
        .set({
          status: ticket.assignedTo ? "in_progress" : "open",
          resolvedAt: null,
          resolvedBy: null,
        })
        .where(eq(supportTicketsTable.id, ticket.id));
      return row ?? null;
    });

    if (!message) {
      res.status(404).json({ error: "Ticket not found" });
      return;
    }
    res
      .status(201)
      .json({ message: { id: message.id, createdAt: message.createdAt } });
  },
);

const EditReplyBody = z.object({
  body: z.string().trim().min(1).max(20000),
});

type ReplyChange =
  | { kind: "missing" }
  | { kind: "not-staff" }
  | {
      kind: "ok";
      ticket: {
        id: number;
        publicId: string;
        subject: string;
        createdBy: string;
      };
    };

/** Parse the two path ids a reply route takes, or null when either is bad. */
function replyIds(req: Request): { publicId: string; messageId: number } | null {
  const publicId = String(req.params["publicId"] ?? "");
  const messageId = Number(req.params["messageId"]);
  if (!UUID_RE.test(publicId)) return null;
  if (!Number.isInteger(messageId) || messageId <= 0) return null;
  return { publicId, messageId };
}

/**
 * PATCH /api/tickets/:publicId/messages/:messageId  (staff)
 *
 * Correct a staff reply — on an open or a closed ticket. Only staff replies
 * can be changed here; a student's own words are never edited by staff. The
 * student is emailed the corrected reply, since what they were told changed.
 */
router.patch(
  "/tickets/:publicId/messages/:messageId",
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
    const parsed = EditReplyBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const clean = sanitizeRichText(parsed.data.body);
    if (!richTextToPlain(clean)) {
      res.status(400).json({ error: "Write the reply before saving." });
      return;
    }
    const ids = replyIds(req);
    if (!ids) {
      res.status(404).json({ error: "Reply not found" });
      return;
    }
    const userId = req.user.id;

    const outcome: ReplyChange = await db.transaction(async (tx) => {
      const ticket = await lockTicket(tx, ids.publicId);
      if (!ticket) return { kind: "missing" };
      const [msg] = await tx
        .select()
        .from(supportTicketMessagesTable)
        .where(
          and(
            eq(supportTicketMessagesTable.id, ids.messageId),
            eq(supportTicketMessagesTable.ticketId, ticket.id),
            isNull(supportTicketMessagesTable.deletedAt),
          ),
        )
        .limit(1);
      if (!msg) return { kind: "missing" };
      if (msg.authorKind !== "staff") return { kind: "not-staff" };

      await tx
        .update(supportTicketMessagesTable)
        .set({ body: clean, editedAt: new Date(), editedBy: userId })
        .where(eq(supportTicketMessagesTable.id, msg.id));

      // `resolution` mirrors the latest staff reply for the list endpoints.
      const latest = await latestStaffReply(tx, ticket.id);
      if (latest?.id === msg.id) {
        await tx
          .update(supportTicketsTable)
          .set({ resolution: clean })
          .where(eq(supportTicketsTable.id, ticket.id));
      }
      return { kind: "ok", ticket };
    });

    if (outcome.kind === "missing") {
      res.status(404).json({ error: "Reply not found" });
      return;
    }
    if (outcome.kind === "not-staff") {
      res
        .status(403)
        .json({ error: "Only replies from the BRAVE team can be edited." });
      return;
    }

    void sendTicketReplyEmail(outcome.ticket, clean, "updated").catch((err) =>
      logger.warn(
        { err, ticketId: outcome.ticket.id },
        "[tickets] updated-reply email failed",
      ),
    );

    try {
      await logAudit(
        userId,
        "edit_support_ticket_reply",
        "support_ticket",
        outcome.ticket.id,
        JSON.stringify({ publicId: ids.publicId, messageId: ids.messageId }),
      );
    } catch {
      // The edit is already saved; a missing audit row must not undo it.
    }

    res.json({ ok: true });
  },
);

/**
 * DELETE /api/tickets/:publicId/messages/:messageId  (staff)
 *
 * Withdraw a staff reply. It is soft-deleted, so the record of what the
 * student was told survives, and it disappears from both views. A ticket left
 * with no reply at all is not answered any more, so it goes back into the
 * Active queue rather than staying closed with nothing said.
 */
router.delete(
  "/tickets/:publicId/messages/:messageId",
  requireAdminPage("/admin/tickets", "delete"),
  async (req: Request, res: Response): Promise<void> => {
    if (!req.isAuthenticated()) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    if (!isTicketsStaff(req)) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
    const ids = replyIds(req);
    if (!ids) {
      res.status(404).json({ error: "Reply not found" });
      return;
    }
    const userId = req.user.id;

    const outcome: ReplyChange = await db.transaction(async (tx) => {
      const ticket = await lockTicket(tx, ids.publicId);
      if (!ticket) return { kind: "missing" };
      const [msg] = await tx
        .select()
        .from(supportTicketMessagesTable)
        .where(
          and(
            eq(supportTicketMessagesTable.id, ids.messageId),
            eq(supportTicketMessagesTable.ticketId, ticket.id),
            isNull(supportTicketMessagesTable.deletedAt),
          ),
        )
        .limit(1);
      if (!msg) return { kind: "missing" };
      if (msg.authorKind !== "staff") return { kind: "not-staff" };

      await tx
        .update(supportTicketMessagesTable)
        .set({ deletedAt: new Date(), deletedBy: userId })
        .where(eq(supportTicketMessagesTable.id, msg.id));

      const latest = await latestStaffReply(tx, ticket.id);
      if (latest) {
        await tx
          .update(supportTicketsTable)
          .set(
            ticket.status === "resolved"
              ? {
                  resolution: latest.body,
                  resolvedAt: latest.createdAt,
                  resolvedBy: latest.authorId,
                }
              : { resolution: latest.body },
          )
          .where(eq(supportTicketsTable.id, ticket.id));
      } else {
        await tx
          .update(supportTicketsTable)
          .set({
            resolution: null,
            resolvedAt: null,
            resolvedBy: null,
            status:
              ticket.status === "resolved"
                ? ticket.assignedTo
                  ? "in_progress"
                  : "open"
                : ticket.status,
          })
          .where(eq(supportTicketsTable.id, ticket.id));
      }
      return { kind: "ok", ticket };
    });

    if (outcome.kind === "missing") {
      res.status(404).json({ error: "Reply not found" });
      return;
    }
    if (outcome.kind === "not-staff") {
      res
        .status(403)
        .json({ error: "Only replies from the BRAVE team can be deleted." });
      return;
    }

    try {
      await logAudit(
        userId,
        "delete_support_ticket_reply",
        "support_ticket",
        outcome.ticket.id,
        JSON.stringify({ publicId: ids.publicId, messageId: ids.messageId }),
      );
    } catch {
      // The reply is already withdrawn; a missing audit row must not undo it.
    }

    res.json({ ok: true });
  },
);

// ── Emails ──────────────────────────────────────────────────────────────────

function shortId(publicId: string): string {
  return publicId.slice(0, 8).toUpperCase();
}

/** Student-written text goes into the HTML body, so it is escaped first. */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
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

/**
 * A staff reply, emailed to the student who raised the ticket — either a new
 * answer or a corrected one. Both go under the ticketResolved kill switch:
 * they are the same email to the student, and a second switch would only
 * give admins a way to stop corrections while answers still went out.
 */
async function sendTicketReplyEmail(
  ticket: { id: number; publicId: string; subject: string; createdBy: string },
  html: string,
  kind: "answered" | "updated",
): Promise<void> {
  const [user] = await db
    .select({ email: usersTable.email, firstName: usersTable.firstName })
    .from(usersTable)
    .where(eq(usersTable.id, ticket.createdBy))
    .limit(1);
  if (!user?.email) return;

  const name = user.firstName?.trim() || "there";
  const ref = shortId(ticket.publicId);
  const plain = richTextToPlain(html);
  const updated = kind === "updated";

  const subject = updated
    ? `Update to your ticket (${ref}) — ${ticket.subject}`
    : `Your ticket (${ref}) has been answered — ${ticket.subject}`;
  const intro = updated
    ? "The BRAVE team has updated its reply to your support ticket."
    : "Good news — your support ticket has been answered.";
  const lead = updated
    ? "Here's the updated reply:"
    : "Here's what the team said:";
  const followUp =
    "If this didn't sort it out, open the ticket on the Ticket Support page and send a follow-up. It comes straight back to us.";

  await sendEmail({
    to: { email: user.email, name: user.firstName ?? undefined },
    category: "ticketResolved",
    subject,
    text: `Hi ${name},

${intro}

Reference: ${ref}
Subject: ${ticket.subject}

${lead}

${plain}

${followUp}

— The BRAVE team`,
    html: `<p>Hi ${escapeHtml(name)},</p>
<p>${intro}</p>
<p><strong>Reference:</strong> ${ref}<br>
<strong>Subject:</strong> ${escapeHtml(ticket.subject)}</p>
<p>${lead}</p>
<div style="border-left:3px solid #ddd;padding-left:12px;margin:12px 0">${html}</div>
<p>${followUp}</p>
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
