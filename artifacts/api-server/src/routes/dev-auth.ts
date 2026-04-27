import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import { z } from "zod";
import { and, eq, ilike, or, sql } from "drizzle-orm";
import {
  db,
  usersTable,
  campusesTable,
  rosterTable,
  teamMembersTable,
} from "@workspace/db";
import {
  clearSession,
  createSession,
  getSessionId,
  SESSION_COOKIE,
  SESSION_TTL,
  type SessionData,
} from "../lib/auth";
import { buildAuthUser } from "./auth";

const router: IRouter = Router();

function isDevEnabled(): boolean {
  if (process.env.NODE_ENV === "production") return false;
  if (process.env.DEV_AUTH_DISABLED === "true") return false;
  return true;
}

if (isDevEnabled()) {
  // eslint-disable-next-line no-console
  console.warn(
    "[dev-auth] Dev sign-in routes are ENABLED (/api/dev/*). " +
      "These permit impersonating any roster user without authentication. " +
      "Set NODE_ENV=production or DEV_AUTH_DISABLED=true to disable.",
  );
}

router.use("/dev", (req: Request, res: Response, next: NextFunction) => {
  if (!isDevEnabled()) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  next();
});

router.get("/dev/enabled", (_req: Request, res: Response) => {
  res.json({ enabled: true });
});

const ListUsersQuery = z.object({
  role: z.enum(["student", "coordinator", "admin"]).optional(),
  search: z.string().trim().optional(),
  limit: z.coerce.number().int().positive().max(200).default(100),
});

router.get("/dev/users", async (req: Request, res: Response) => {
  const parsed = ListUsersQuery.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid query" });
    return;
  }
  const { role, search, limit } = parsed.data;

  const conds = [] as ReturnType<typeof eq>[];
  if (role) conds.push(eq(usersTable.role, role));
  if (search && search.length > 0) {
    const like = `%${search}%`;
    conds.push(
      or(
        ilike(usersTable.email, like),
        ilike(usersTable.firstName, like),
        ilike(usersTable.lastName, like),
        ilike(campusesTable.name, like),
        ilike(sql`coalesce(${usersTable.firstName}, '') || ' ' || coalesce(${usersTable.lastName}, '')`, like),
      )!,
    );
  }

  const rows = await db
    .select({
      id: usersTable.id,
      email: usersTable.email,
      firstName: usersTable.firstName,
      lastName: usersTable.lastName,
      role: usersTable.role,
      campusId: usersTable.campusId,
      campusName: campusesTable.name,
      teamId: teamMembersTable.teamId,
    })
    .from(usersTable)
    .leftJoin(campusesTable, eq(campusesTable.id, usersTable.campusId))
    .leftJoin(teamMembersTable, eq(teamMembersTable.userId, usersTable.id))
    .where(conds.length > 0 ? and(...conds) : undefined)
    .orderBy(usersTable.role, usersTable.firstName, usersTable.lastName)
    .limit(limit);

  // Roster-only entries (not yet in users): include so you can sign in as them
  // and trigger the auto-provision flow.
  const rosterConds = [eq(rosterTable.isWhitelisted, true)] as ReturnType<typeof eq>[];
  if (search && search.length > 0) {
    const like = `%${search}%`;
    rosterConds.push(
      or(
        ilike(rosterTable.email, like),
        ilike(rosterTable.fullName, like),
        ilike(rosterTable.campusName, like),
        ilike(rosterTable.studentId, like),
      )!,
    );
  }
  // Only include roster (students) when no explicit non-student role filter is set.
  const includeRoster = !role || role === "student";
  const rosterRows = includeRoster
    ? await db
        .select({
          id: rosterTable.id,
          studentId: rosterTable.studentId,
          fullName: rosterTable.fullName,
          email: rosterTable.email,
          campusId: rosterTable.campusId,
          campusName: rosterTable.campusName,
        })
        .from(rosterTable)
        .where(and(...rosterConds))
        .limit(limit)
    : [];

  // Drop roster rows whose email already exists in users (avoid duplicates).
  const userEmails = new Set(rows.map((u) => u.email.toLowerCase()));
  const rosterOnly = rosterRows.filter(
    (r) => r.email && !userEmails.has(r.email.toLowerCase()),
  );

  res.json({
    users: rows,
    rosterOnly,
  });
});

const SignInAsBody = z.object({
  userId: z.string().min(1).optional(),
  formsUserId: z.string().min(1).optional(),
}).refine((d) => d.userId || d.formsUserId, { message: "userId or formsUserId required" });

router.post("/dev/sign-in-as", async (req: Request, res: Response) => {
  const parsed = SignInAsBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid body" });
    return;
  }

  try {
    let dbUser: typeof usersTable.$inferSelect | undefined;
    if (parsed.data.userId) {
      [dbUser] = await db.select().from(usersTable).where(eq(usersTable.id, parsed.data.userId));
    } else if (parsed.data.formsUserId) {
      // Auto-provision via the same path Forms SSO uses, and promote to admin
      // if the forms id is in the bootstrap list (mirrors the real SSO flow).
      const { createOrGetUserByFormsId } = await import("@workspace/db");
      const { ensureAdminForFormsId } = await import("../bootstrap-admins");
      dbUser = await createOrGetUserByFormsId(parsed.data.formsUserId);
      const promoted = await ensureAdminForFormsId(parsed.data.formsUserId);
      if (promoted) {
        // Re-read so the session reflects the promoted role.
        const { db, usersTable } = await import("@workspace/db");
        const { eq } = await import("drizzle-orm");
        [dbUser] = await db.select().from(usersTable).where(eq(usersTable.id, dbUser.id));
      }
    }
    if (!dbUser) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    // Use the same auth-user shaping as the real Forms SSO flow so roster
    // status, campus backfill, and team membership match production behavior.
    const authUser = await buildAuthUser(dbUser);

    const sessionData: SessionData = {
      user: authUser,
      access_token: "dev-impersonation",
    };
    const sid = await createSession(sessionData);
    res.cookie(SESSION_COOKIE, sid, {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
      maxAge: SESSION_TTL,
    });

    let redirect = "/";
    if (dbUser.role === "coordinator") redirect = "/coordinator";
    else if (dbUser.role === "admin") redirect = "/admin";

    res.json({ user: authUser, redirect });
  } catch (err) {
    req.log.error({ err }, "dev sign-in-as failed");
    res.status(500).json({ error: "Failed to sign in" });
  }
});

router.post("/dev/sign-out", async (req: Request, res: Response) => {
  const sid = getSessionId(req);
  await clearSession(res, sid);
  res.json({ ok: true });
});

export default router;
