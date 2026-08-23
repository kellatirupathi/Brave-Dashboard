import { Router, type IRouter } from "express";
import { eq, and, or, ilike, desc, asc, sql, notInArray } from "drizzle-orm";
import {
  db,
  popupTemplatesTable,
  popupAcknowledgementsTable,
  usersTable,
  campusesTable,
} from "@workspace/db";
import { resolveSeason } from "../lib/season";
import { logAudit } from "../lib/audit";
import { requireAdminPage } from "../lib/require-admin-page";

const router: IRouter = Router();

// Admin-managed student pop-ups. Admins CRUD templates from the Config page;
// enabled templates are shown to students one at a time until each student
// acknowledges them. Entirely separate from the Terms & Conditions gate.

function requireAdmin(
  req: Parameters<Parameters<typeof router.get>[1]>[0],
  res: Parameters<Parameters<typeof router.get>[1]>[1],
): boolean {
  if (!req.isAuthenticated || !req.isAuthenticated() || !req.user) {
    res.status(401).json({ error: "Unauthorized" });
    return false;
  }
  if (req.user.role !== "admin") {
    res.status(403).json({ error: "Forbidden" });
    return false;
  }
  return true;
}

// ---------- Admin CRUD ----------

// List all templates (with acknowledgement counts) for the admin Config page.
router.get("/admin/popups", async (req, res): Promise<void> => {
  if (!requireAdmin(req, res)) return;
  // Scoped to the season being viewed, so a Season 2 pop-up never appears in
  // Season 1's list and vice versa.
  const season = await resolveSeason(req);
  const templates = await db
    .select()
    .from(popupTemplatesTable)
    .where(eq(popupTemplatesTable.seasonId, season))
    .orderBy(desc(popupTemplatesTable.createdAt));
  const counts = await db
    .select({
      popupId: popupAcknowledgementsTable.popupId,
      count: sql<number>`count(*)::int`,
    })
    .from(popupAcknowledgementsTable)
    .groupBy(popupAcknowledgementsTable.popupId);
  const countByPopup = new Map<number, number>();
  for (const c of counts) countByPopup.set(c.popupId, c.count);
  res.json(
    templates.map((t) => ({
      ...t,
      acknowledgedCount: countByPopup.get(t.id) ?? 0,
    })),
  );
});

router.post("/admin/popups", async (req, res): Promise<void> => {
  if (!requireAdmin(req, res)) return;
  const body = req.body ?? {};
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const message = typeof body.message === "string" ? body.message.trim() : "";
  if (!name) {
    res.status(400).json({ error: "A popup name is required." });
    return;
  }
  if (!message) {
    res.status(400).json({ error: "A popup message is required." });
    return;
  }
  const [created] = await db
    .insert(popupTemplatesTable)
    .values({
      // Belongs to whichever season the admin was looking at when they wrote it.
      seasonId: await resolveSeason(req),
      name,
      message,
      requireCheckbox: body.requireCheckbox === true,
      checkboxLabel:
        typeof body.checkboxLabel === "string" && body.checkboxLabel.trim()
          ? body.checkboxLabel.trim()
          : null,
      enabled: body.enabled === true,
    })
    .returning();
  await logAudit(
    req.user!.id,
    "create_popup_template",
    "popup_template",
    created.id,
    `Created popup "${name}"`,
  );
  res.status(201).json(created);
});

router.patch("/admin/popups/:id", async (req, res): Promise<void> => {
  if (!requireAdmin(req, res)) return;
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const body = req.body ?? {};
  const updates: Record<string, unknown> = {};
  if (typeof body.name === "string") {
    const n = body.name.trim();
    if (!n) {
      res.status(400).json({ error: "A popup name is required." });
      return;
    }
    updates.name = n;
  }
  if (typeof body.message === "string") {
    const m = body.message.trim();
    if (!m) {
      res.status(400).json({ error: "A popup message is required." });
      return;
    }
    updates.message = m;
  }
  if (typeof body.requireCheckbox === "boolean")
    updates.requireCheckbox = body.requireCheckbox;
  if (typeof body.enabled === "boolean") updates.enabled = body.enabled;
  if (body.checkboxLabel === null) updates.checkboxLabel = null;
  else if (typeof body.checkboxLabel === "string")
    updates.checkboxLabel = body.checkboxLabel.trim() || null;
  if (Object.keys(updates).length === 0) {
    res.status(400).json({ error: "No changes provided." });
    return;
  }
  const [updated] = await db
    .update(popupTemplatesTable)
    .set(updates as Partial<typeof popupTemplatesTable.$inferInsert>)
    .where(eq(popupTemplatesTable.id, id))
    .returning();
  if (!updated) {
    res.status(404).json({ error: "Popup not found" });
    return;
  }
  await logAudit(
    req.user!.id,
    "update_popup_template",
    "popup_template",
    id,
    `Updated popup "${updated.name}"`,
  );
  res.json(updated);
});

router.delete("/admin/popups/:id", async (req, res): Promise<void> => {
  if (!requireAdmin(req, res)) return;
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const [existing] = await db
    .select()
    .from(popupTemplatesTable)
    .where(eq(popupTemplatesTable.id, id));
  if (!existing) {
    res.status(404).json({ error: "Popup not found" });
    return;
  }
  await db.transaction(async (tx) => {
    await tx
      .delete(popupAcknowledgementsTable)
      .where(eq(popupAcknowledgementsTable.popupId, id));
    await tx.delete(popupTemplatesTable).where(eq(popupTemplatesTable.id, id));
  });
  await logAudit(
    req.user!.id,
    "delete_popup_template",
    "popup_template",
    id,
    `Deleted popup "${existing.name}"`,
  );
  res.status(204).end();
});

// ---------- Admin: confirmations report ----------
//
// Every student's acknowledgement of every popup (one row per confirmation),
// joined to the popup template + the student's profile + campus. Powers the
// admin "Popups" page under Communications. Searchable, filterable by popup,
// paginated, with a CSV export.

function buildConfirmationWhere(search: string, popupId: number | null) {
  const conds = [];
  if (popupId) conds.push(eq(popupAcknowledgementsTable.popupId, popupId));
  if (search) {
    const pat = `%${search}%`;
    const orClause = or(
      ilike(usersTable.firstName, pat),
      ilike(usersTable.lastName, pat),
      ilike(
        sql`(coalesce(${usersTable.firstName}, '') || ' ' || coalesce(${usersTable.lastName}, ''))`,
        pat,
      ),
      ilike(usersTable.niatId, pat),
      ilike(usersTable.email, pat),
      ilike(popupTemplatesTable.name, pat),
    );
    if (orClause) conds.push(orClause);
  }
  return conds.length > 0 ? and(...conds) : undefined;
}

function confirmationsBaseQuery() {
  return db
    .select({
      id: popupAcknowledgementsTable.id,
      popupId: popupAcknowledgementsTable.popupId,
      templateName: popupTemplatesTable.name,
      firstName: usersTable.firstName,
      lastName: usersTable.lastName,
      niatId: usersTable.niatId,
      email: usersTable.email,
      campusName: campusesTable.name,
      confirmedAt: popupAcknowledgementsTable.confirmedAt,
    })
    .from(popupAcknowledgementsTable)
    .leftJoin(
      popupTemplatesTable,
      eq(popupTemplatesTable.id, popupAcknowledgementsTable.popupId),
    )
    .leftJoin(usersTable, eq(usersTable.id, popupAcknowledgementsTable.userId))
    .leftJoin(campusesTable, eq(campusesTable.id, usersTable.campusId));
}

router.get("/admin/popup-confirmations", async (req, res): Promise<void> => {
  if (!requireAdmin(req, res)) return;
  const search =
    typeof req.query.search === "string" ? req.query.search.trim() : "";
  const popupId =
    typeof req.query.popupId === "string" &&
    Number.isInteger(Number(req.query.popupId))
      ? Number(req.query.popupId)
      : null;
  const page = Math.max(1, Number(req.query.page) || 1);
  const pageSize = Math.min(500, Math.max(1, Number(req.query.pageSize) || 50));
  const offset = (page - 1) * pageSize;
  const whereClause = buildConfirmationWhere(search, popupId);

  const rows = await confirmationsBaseQuery()
    .where(whereClause)
    .orderBy(desc(popupAcknowledgementsTable.confirmedAt))
    .limit(pageSize)
    .offset(offset);

  const [cnt] = await db
    .select({ c: sql<number>`count(*)::int` })
    .from(popupAcknowledgementsTable)
    .leftJoin(
      popupTemplatesTable,
      eq(popupTemplatesTable.id, popupAcknowledgementsTable.popupId),
    )
    .leftJoin(usersTable, eq(usersTable.id, popupAcknowledgementsTable.userId))
    .where(whereClause);

  res.json({
    items: rows.map((r) => ({
      id: r.id,
      popupId: r.popupId,
      templateName: r.templateName ?? "(deleted popup)",
      studentName: `${r.firstName ?? ""} ${r.lastName ?? ""}`.trim() || "—",
      niatId: r.niatId ?? null,
      email: r.email ?? null,
      campusName: r.campusName ?? null,
      confirmedAt: r.confirmedAt,
    })),
    total: Number(cnt?.c ?? 0),
    page,
    pageSize,
  });
});

function csvCell(v: unknown): string {
  const s = v == null ? "" : String(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

router.get(
  "/admin/popup-confirmations/export.csv",
  requireAdminPage("/admin/popups", "export"),
  async (req, res): Promise<void> => {
    if (!requireAdmin(req, res)) return;
    const search =
      typeof req.query.search === "string" ? req.query.search.trim() : "";
    const popupId =
      typeof req.query.popupId === "string" &&
      Number.isInteger(Number(req.query.popupId))
        ? Number(req.query.popupId)
        : null;
    const whereClause = buildConfirmationWhere(search, popupId);

    const rows = await confirmationsBaseQuery()
      .where(whereClause)
      .orderBy(desc(popupAcknowledgementsTable.confirmedAt))
      .limit(100000);

    const header = [
      "Template",
      "Student",
      "NIAT ID",
      "Campus",
      "Email",
      "Confirmed At",
    ];
    const lines = [header.map(csvCell).join(",")];
    for (const r of rows) {
      lines.push(
        [
          r.templateName ?? "(deleted popup)",
          `${r.firstName ?? ""} ${r.lastName ?? ""}`.trim() || "—",
          r.niatId ?? "",
          r.campusName ?? "",
          r.email ?? "",
          r.confirmedAt
            ? new Date(r.confirmedAt)
                .toISOString()
                .slice(0, 16)
                .replace("T", " ")
            : "",
        ]
          .map(csvCell)
          .join(","),
      );
    }
    const csv = lines.join("\r\n");
    const buffer = Buffer.concat([
      Buffer.from("﻿", "utf8"),
      Buffer.from(csv, "utf8"),
    ]);
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="popup-confirmations.csv"`,
    );
    res.send(buffer);
  },
);

// ---------- Student-facing ----------

// Enabled popups this student has NOT yet acknowledged, oldest first. The
// client shows them one at a time (confirm one → the next appears). Only
// students receive popups.
router.get("/popups/pending", async (req, res): Promise<void> => {
  if (!req.isAuthenticated || !req.isAuthenticated() || !req.user) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  if (req.user.role !== "student") {
    res.json([]);
    return;
  }
  const acked = await db
    .select({ popupId: popupAcknowledgementsTable.popupId })
    .from(popupAcknowledgementsTable)
    .where(eq(popupAcknowledgementsTable.userId, req.user.id));
  const ackedIds = acked.map((a) => a.popupId);
  // Only pop-ups belonging to the season this student is viewing. Without
  // this, a Season 2 announcement would interrupt someone reading their
  // Season 1 archive.
  const season = await resolveSeason(req);
  const whereClause =
    ackedIds.length > 0
      ? and(
          eq(popupTemplatesTable.enabled, true),
          eq(popupTemplatesTable.seasonId, season),
          notInArray(popupTemplatesTable.id, ackedIds),
        )
      : and(
          eq(popupTemplatesTable.enabled, true),
          eq(popupTemplatesTable.seasonId, season),
        );
  const pending = await db
    .select({
      id: popupTemplatesTable.id,
      name: popupTemplatesTable.name,
      message: popupTemplatesTable.message,
      requireCheckbox: popupTemplatesTable.requireCheckbox,
      checkboxLabel: popupTemplatesTable.checkboxLabel,
    })
    .from(popupTemplatesTable)
    .where(whereClause)
    .orderBy(asc(popupTemplatesTable.createdAt));
  res.json(pending);
});

// Record a student's acknowledgement of a popup. Idempotent: a repeat confirm
// (unique popup_id + user_id) is a no-op success.
router.post("/popups/:id/ack", async (req, res): Promise<void> => {
  if (!req.isAuthenticated || !req.isAuthenticated() || !req.user) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const [popup] = await db
    .select({ id: popupTemplatesTable.id })
    .from(popupTemplatesTable)
    .where(eq(popupTemplatesTable.id, id));
  if (!popup) {
    res.status(404).json({ error: "Popup not found" });
    return;
  }
  await db
    .insert(popupAcknowledgementsTable)
    .values({ popupId: id, userId: req.user.id })
    .onConflictDoNothing();
  res.json({ ok: true });
});

export default router;
