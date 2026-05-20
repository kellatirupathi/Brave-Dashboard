/**
 * Dev-only sign-in helper.
 *
 * Lets developers mint a real session for any roster/users-table row with
 * one click from the /dev/login page. Mounted at /api/dev/* and ALWAYS
 * returns 404 in production so it can never be used to impersonate a real
 * user on the live deployment.
 */
import { Router, type IRouter, type Request, type Response } from "express";
import { z } from "zod";
import { and, asc, eq, ilike, inArray, or, sql } from "drizzle-orm";
import {
  db,
  usersTable,
  rosterTable,
  campusesTable,
  teamMembersTable,
  createOrGetUserByFormsId,
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

function isDev(): boolean {
  return process.env.NODE_ENV !== "production";
}

// Hard gate: any request to /api/dev/* in production returns 404 before
// the route handlers even run. Scoped to /dev/* paths only so requests
// for unrelated routes (mounted after this router) still fall through.
router.use((req: Request, res: Response, next) => {
  if (!req.path.startsWith("/dev/") && req.path !== "/dev") {
    next();
    return;
  }
  if (!isDev()) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  next();
});

router.get("/dev/enabled", (_req: Request, res: Response) => {
  res.json({ enabled: true });
});

const ListQuery = z.object({
  role: z.enum(["student", "coordinator", "admin"]).optional(),
  search: z.string().trim().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(500).optional(),
});

router.get("/dev/users", async (req: Request, res: Response): Promise<void> => {
  const parsed = ListQuery.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid query" });
    return;
  }
  const { role, search } = parsed.data;
  const limit = parsed.data.limit ?? 150;

  // Users (existing accounts)
  const userConds: ReturnType<typeof and>[] = [];
  if (role) userConds.push(eq(usersTable.role, role));
  if (search) {
    const pattern = `%${search}%`;
    const fuzzy = or(
      ilike(usersTable.email, pattern),
      ilike(usersTable.firstName, pattern),
      ilike(usersTable.lastName, pattern),
      ilike(
        sql`(${usersTable.firstName} || ' ' || ${usersTable.lastName})`,
        pattern,
      ),
      ilike(campusesTable.name, pattern),
    );
    if (fuzzy) userConds.push(fuzzy);
  }
  const whereUsers = userConds.length > 0 ? and(...userConds) : undefined;

  const rows = await db
    .select({
      id: usersTable.id,
      email: usersTable.email,
      firstName: usersTable.firstName,
      lastName: usersTable.lastName,
      role: usersTable.role,
      campusId: usersTable.campusId,
      campusName: campusesTable.name,
      formsUserId: usersTable.formsUserId,
    })
    .from(usersTable)
    .leftJoin(campusesTable, eq(campusesTable.id, usersTable.campusId))
    .where(whereUsers)
    .orderBy(
      asc(usersTable.role),
      asc(usersTable.firstName),
      asc(usersTable.lastName),
    )
    .limit(limit);

  // Attach teamId for each returned user (single query, no N+1).
  const userIds = rows.map((r) => r.id);
  const memberMap = new Map<string, number>();
  if (userIds.length > 0) {
    const members = await db
      .select({
        userId: teamMembersTable.userId,
        teamId: teamMembersTable.teamId,
      })
      .from(teamMembersTable)
      .where(inArray(teamMembersTable.userId, userIds));
    for (const m of members) memberMap.set(m.userId, m.teamId);
  }

  const users = rows.map((r) => ({
    id: r.id,
    email: r.email,
    firstName: r.firstName,
    lastName: r.lastName,
    role: r.role,
    campusId: r.campusId,
    campusName: r.campusName ?? null,
    teamId: memberMap.get(r.id) ?? null,
  }));

  // Roster-only entries: whitelisted students who have never signed in.
  // Only include when the caller didn't filter to a non-student role.
  let rosterOnly: Array<{
    id: number;
    studentId: string;
    fullName: string;
    email: string | null;
    campusId: number | null;
    campusName: string;
  }> = [];
  if (!role || role === "student") {
    const seenFormsIds = rows
      .map((r) => r.formsUserId)
      .filter((v): v is string => !!v);

    const rosterConds: ReturnType<typeof and>[] = [
      eq(rosterTable.isWhitelisted, true),
    ];
    if (seenFormsIds.length > 0) {
      rosterConds.push(sql`${rosterTable.studentId} NOT IN ${seenFormsIds}`);
    }
    if (search) {
      const pattern = `%${search}%`;
      const fuzzy = or(
        ilike(rosterTable.fullName, pattern),
        ilike(rosterTable.email, pattern),
        ilike(rosterTable.studentId, pattern),
        ilike(rosterTable.campusName, pattern),
      );
      if (fuzzy) rosterConds.push(fuzzy);
    }

    const rosterRows = await db
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
      .orderBy(asc(rosterTable.fullName))
      .limit(Math.max(20, Math.min(limit, 100)));

    // Exclude any roster entry whose studentId already matched a user row
    // (defensive — covers cases where studentId equals some user's id).
    const usedFormsIds = new Set(seenFormsIds);
    rosterOnly = rosterRows.filter((r) => !usedFormsIds.has(r.studentId));
  }

  res.json({ users, rosterOnly });
});

const SignInAsBody = z
  .object({
    userId: z.string().min(1).optional(),
    formsUserId: z.string().min(1).optional(),
  })
  .refine((v) => !!v.userId || !!v.formsUserId, {
    message: "Provide userId or formsUserId",
  });

function homeForRole(role: string): string {
  if (role === "admin") return "/admin";
  if (role === "coordinator") return "/coordinator";
  return "/";
}

function setSessionCookie(res: Response, sid: string) {
  res.cookie(SESSION_COOKIE, sid, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL,
  });
}

router.post(
  "/dev/sign-in-as",
  async (req: Request, res: Response): Promise<void> => {
    const parsed = SignInAsBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Provide userId or formsUserId" });
      return;
    }

    // Clear any existing session first so we don't leave an orphan row.
    try {
      const sid = getSessionId(req);
      if (sid) await clearSession(res, sid);
    } catch (err) {
      req.log.warn({ err }, "[dev] failed to clear prior session — continuing");
    }

    let dbUser: typeof usersTable.$inferSelect | null = null;

    if (parsed.data.userId) {
      const [row] = await db
        .select()
        .from(usersTable)
        .where(eq(usersTable.id, parsed.data.userId));
      dbUser = row ?? null;
    } else if (parsed.data.formsUserId) {
      const { user } = await createOrGetUserByFormsId(parsed.data.formsUserId, {
        provisionedVia: "roster",
      });
      dbUser = user;
    }

    if (!dbUser) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    const authUser = await buildAuthUser(dbUser);
    const sessionData: SessionData = {
      user: authUser,
      access_token: "dev-sign-in-as",
    };
    const sid = await createSession(sessionData);
    setSessionCookie(res, sid);

    req.log.info(
      { devSignInAs: { userId: dbUser.id, role: dbUser.role } },
      "[dev] minted session via /dev/sign-in-as",
    );

    res.json({ redirect: homeForRole(authUser.role) });
  },
);

router.post(
  "/dev/sign-out",
  async (req: Request, res: Response): Promise<void> => {
    const sid = getSessionId(req);
    await clearSession(res, sid);
    res.json({ ok: true });
  },
);

export default router;
