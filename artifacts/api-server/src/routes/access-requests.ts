// Student-facing endpoints for the New-User Access Request gate.
// Hand-written (bypasses Orval codegen) — additive, isolated feature.
import { Router, type IRouter } from "express";
import { and, desc, eq, or } from "drizzle-orm";
import {
  db,
  accessRequestsTable,
  campusesTable,
  rosterTable,
  usersTable,
} from "@workspace/db";
import { z } from "zod";

const router: IRouter = Router();

// Fresh roster lookup (matches the logic in buildAuthUser): a user is on the
// roster when a whitelisted roster row matches their email or forms studentId.
async function computeIsOnRoster(
  userId: string,
  email: string,
): Promise<boolean> {
  const [dbUser] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.id, userId));
  const clauses = [eq(rosterTable.email, email)];
  if (dbUser?.formsUserId) {
    clauses.push(eq(rosterTable.studentId, dbUser.formsUserId));
  }
  const [row] = await db
    .select()
    .from(rosterTable)
    .where(and(or(...clauses), eq(rosterTable.isWhitelisted, true)));
  return !!row;
}

// GET /api/access-requests/me — the caller's own access-request status.
router.get("/access-requests/me", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const userId = req.user.id;
  const email = req.user.email;
  const isOnRoster = await computeIsOnRoster(userId, email);
  // Match strictly by userId. Every gate-created row carries the owner's
  // userId, so this guarantees a user only ever sees their own request — email
  // is NOT unique in this system, so matching on it could cross-link accounts.
  const rows = await db
    .select()
    .from(accessRequestsTable)
    .where(eq(accessRequestsTable.userId, userId))
    .orderBy(desc(accessRequestsTable.createdAt));
  res.json({ request: rows[0] ?? null, isOnRoster });
});

// Identity is still bound server-side: the request is always linked to
// req.user.id, and roster matching keys off the account's real email
// (req.user.email) — so a caller can never claim another identity or
// self-grant roster access. The optional `email` here is only the
// *contact* email shown to admins. Forms-SSO accounts have a synthetic
// `sso_<id>@forms.local` address, so we let the student supply a real one;
// when omitted we fall back to the account email (previous behaviour).
const SubmitAccessRequestBody = z.object({
  fullName: z.string().trim().min(1),
  email: z.string().trim().email().optional(),
  campusId: z.number().int().positive(),
  mobileNumber: z.string().trim().min(1),
  sectionName: z.string().trim().min(1),
  niatId: z.string().trim().optional(),
});

// POST /api/access-requests — submit a new-user access request.
router.post("/access-requests", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const userId = req.user.id;
  const email = req.user.email;
  if (await computeIsOnRoster(userId, email)) {
    res.status(409).json({ error: "You already have access." });
    return;
  }
  const parsed = SubmitAccessRequestBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request body" });
    return;
  }
  const data = parsed.data;
  // Contact email shown to admins. Prefer the student-supplied address (real
  // mailbox) over the synthetic `sso_<id>@forms.local` account email. Identity
  // is still bound by userId above, so this never affects who the request
  // belongs to or roster matching.
  const contactEmail = data.email && data.email.length > 0 ? data.email : email;
  const [campus] = await db
    .select()
    .from(campusesTable)
    .where(eq(campusesTable.id, data.campusId));
  if (!campus) {
    res.status(400).json({ error: "Invalid campus" });
    return;
  }
  // One request per user: if a row already exists (any status), return it
  // rather than creating a duplicate.
  const [existing] = await db
    .select()
    .from(accessRequestsTable)
    .where(eq(accessRequestsTable.userId, userId))
    .orderBy(desc(accessRequestsTable.createdAt));
  if (existing) {
    res.status(200).json(existing);
    return;
  }
  const [row] = await db
    .insert(accessRequestsTable)
    .values({
      userId,
      fullName: data.fullName,
      email: contactEmail,
      niatId: data.niatId ?? null,
      campusId: data.campusId,
      campusName: campus.name,
      mobileNumber: data.mobileNumber,
      sectionName: data.sectionName,
      status: "pending",
    })
    .returning();
  res.status(201).json(row);
});

export default router;
