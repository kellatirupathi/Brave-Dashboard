import * as oidc from "openid-client";
import { type Request, type Response, type NextFunction } from "express";
import type { AuthUser } from "@workspace/api-zod";
import { db, usersTable } from "@workspace/db";
import { and, eq, or, isNull, lt } from "drizzle-orm";
import {
  clearSession,
  getOidcConfig,
  getSessionId,
  getSession,
  updateSession,
  type SessionData,
} from "../lib/auth";
import { logger } from "../lib/logger";

// In-process throttle: skip the DB write if we bumped lastSeenAt for this
// user within the last LAST_SEEN_THROTTLE_MS. Survives only the lifetime of
// the process — that's fine; the DB-side `lt(lastSeenAt, cutoff)` guard
// makes the write idempotent across instances.
const LAST_SEEN_THROTTLE_MS = 5 * 60 * 1000;
const lastSeenLocal = new Map<string, number>();

function bumpLastSeen(userId: string): void {
  const now = Date.now();
  const recent = lastSeenLocal.get(userId);
  if (recent && now - recent < LAST_SEEN_THROTTLE_MS) return;
  lastSeenLocal.set(userId, now);
  const cutoff = new Date(now - LAST_SEEN_THROTTLE_MS);
  void db
    .update(usersTable)
    .set({ lastSeenAt: new Date(now) })
    .where(
      and(
        eq(usersTable.id, userId),
        or(isNull(usersTable.lastSeenAt), lt(usersTable.lastSeenAt, cutoff)),
      ),
    )
    .catch((err) => {
      logger.warn({ err, userId }, "Failed to bump lastSeenAt");
    });
}

declare global {
  namespace Express {
    interface User extends AuthUser {}

    interface Request {
      isAuthenticated(): this is AuthedRequest;

      user?: User | undefined;
    }

    export interface AuthedRequest {
      user: User;
    }
  }
}

async function refreshIfExpired(
  sid: string,
  session: SessionData,
): Promise<SessionData | null> {
  const now = Math.floor(Date.now() / 1000);
  if (!session.expires_at || now <= session.expires_at) return session;

  if (!session.refresh_token) return null;

  try {
    const config = await getOidcConfig();
    const tokens = await oidc.refreshTokenGrant(config, session.refresh_token);
    session.access_token = tokens.access_token;
    session.refresh_token = tokens.refresh_token ?? session.refresh_token;
    session.expires_at = tokens.expiresIn()
      ? now + tokens.expiresIn()!
      : session.expires_at;
    await updateSession(sid, session);
    return session;
  } catch {
    return null;
  }
}

export async function authMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  req.isAuthenticated = function (this: Request) {
    return this.user != null;
  } as Request["isAuthenticated"];

  const sid = getSessionId(req);
  if (!sid) {
    next();
    return;
  }

  const session = await getSession(sid);
  if (!session?.user?.id) {
    await clearSession(res, sid);
    next();
    return;
  }

  const refreshed = await refreshIfExpired(sid, session);
  if (!refreshed) {
    await clearSession(res, sid);
    next();
    return;
  }

  req.user = refreshed.user;
  bumpLastSeen(refreshed.user.id);
  next();
}
