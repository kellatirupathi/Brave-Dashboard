import * as client from "openid-client";
import crypto from "crypto";
import { type Request, type Response } from "express";
import { db, sessionsTable, teamsTable, usersTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import type { AuthUser } from "@workspace/api-zod";

export const ISSUER_URL = process.env.ISSUER_URL ?? "https://replit.com/oidc";
export const SESSION_COOKIE = "sid";
export const SESSION_TTL = 7 * 24 * 60 * 60 * 1000;

export interface SessionData {
  user: AuthUser;
  access_token: string;
  refresh_token?: string;
  expires_at?: number;
}

let oidcConfig: client.Configuration | null = null;

export async function getOidcConfig(): Promise<client.Configuration> {
  if (!oidcConfig) {
    oidcConfig = await client.discovery(
      new URL(ISSUER_URL),
      process.env.REPL_ID!,
    );
  }
  return oidcConfig;
}

export async function createSession(data: SessionData): Promise<string> {
  const sid = crypto.randomBytes(32).toString("hex");
  await db.insert(sessionsTable).values({
    sid,
    sess: data as unknown as Record<string, unknown>,
    expire: new Date(Date.now() + SESSION_TTL),
  });
  // Bump login tracking for the user. A new session = a login (any method:
  // Forms SSO, password, dev, OIDC). Best-effort — never blocks the login.
  const userId = data.user?.id;
  if (userId) {
    try {
      await db
        .update(usersTable)
        .set({
          lastLoginAt: new Date(),
          loginCount: sql`${usersTable.loginCount} + 1`,
        })
        .where(eq(usersTable.id, userId));
    } catch {
      // ignore — login tracking must never break authentication
    }
  }
  return sid;
}

export async function getSession(sid: string): Promise<SessionData | null> {
  const [row] = await db
    .select()
    .from(sessionsTable)
    .where(eq(sessionsTable.sid, sid));

  if (!row || row.expire < new Date()) {
    if (row) await deleteSession(sid);
    return null;
  }

  return row.sess as unknown as SessionData;
}

export async function updateSession(
  sid: string,
  data: SessionData,
): Promise<void> {
  await db
    .update(sessionsTable)
    .set({
      sess: data as unknown as Record<string, unknown>,
      expire: new Date(Date.now() + SESSION_TTL),
    })
    .where(eq(sessionsTable.sid, sid));
}

export async function deleteSession(sid: string): Promise<void> {
  await db.delete(sessionsTable).where(eq(sessionsTable.sid, sid));
}

// Invalidates ALL sessions belonging to the given user.
// Use this when a user's role or active status changes so existing
// sessions can no longer use stale (elevated) permissions.
export async function deleteSessionsForUser(userId: string): Promise<void> {
  await db
    .delete(sessionsTable)
    .where(sql`(${sessionsTable.sess}->'user'->>'id') = ${userId}`);
}

export async function clearSession(res: Response, sid?: string): Promise<void> {
  if (sid) await deleteSession(sid);
  res.clearCookie(SESSION_COOKIE, { path: "/" });
}

export function getSessionId(req: Request): string | undefined {
  const authHeader = req.headers["authorization"];
  if (authHeader?.startsWith("Bearer ")) {
    return authHeader.slice(7);
  }
  return req.cookies?.[SESSION_COOKIE];
}

// Returns true if the authenticated user is an admin OR is the current
// leader of the supplied team. On false, writes a 403 response and returns
// false. Coordinators do NOT pass — only admin override. Returns false (with
// 401) if the request is not authenticated, and 404 if the team does not
// exist.
export async function requireTeamLeader(
  req: Request,
  res: Response,
  teamId: number,
): Promise<boolean> {
  if (!req.isAuthenticated || !req.isAuthenticated() || !req.user) {
    res.status(401).json({ error: "Unauthorized" });
    return false;
  }
  const [team] = await db
    .select()
    .from(teamsTable)
    .where(eq(teamsTable.id, teamId));
  if (!team) {
    res.status(404).json({ error: "Team not found" });
    return false;
  }
  const isAdmin = req.user.role === "admin";
  const isLeader = team.leaderId === req.user.id;
  if (!isAdmin && !isLeader) {
    res
      .status(403)
      .json({ error: "Only the team leader can perform this action." });
    return false;
  }
  return true;
}
