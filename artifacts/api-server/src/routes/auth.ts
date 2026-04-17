import * as oidc from "openid-client";
import { Router, type IRouter, type Request, type Response } from "express";
import { z } from "zod";
import { GetCurrentAuthUserResponse } from "@workspace/api-zod";
import crypto from "crypto";
import {
  db,
  usersTable,
  teamMembersTable,
  rosterTable,
  accessRequestsTable,
  createOrGetUserByFormsId,
  generateAuthToken,
  validateAndConsumeToken,
} from "@workspace/db";
import { eq, and } from "drizzle-orm";
import {
  clearSession,
  getOidcConfig,
  getSessionId,
  createSession,
  deleteSession,
  SESSION_COOKIE,
  SESSION_TTL,
  ISSUER_URL,
  type SessionData,
} from "../lib/auth";

const ExchangeMobileAuthorizationCodeBody = z.object({
  code: z.string(),
  code_verifier: z.string(),
  redirect_uri: z.string(),
  state: z.string(),
  nonce: z.string().optional(),
});
const ExchangeMobileAuthorizationCodeResponse = z.object({ token: z.string() });
const LogoutMobileSessionResponse = z.object({ success: z.boolean() });

const OIDC_COOKIE_TTL = 10 * 60 * 1000;

const router: IRouter = Router();

function getOrigin(req: Request): string {
  const proto = req.headers["x-forwarded-proto"] || "https";
  const host =
    req.headers["x-forwarded-host"] || req.headers["host"] || "localhost";
  return `${proto}://${host}`;
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

function setOidcCookie(res: Response, name: string, value: string) {
  res.cookie(name, value, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: OIDC_COOKIE_TTL,
  });
}

function getSafeReturnTo(value: unknown): string {
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//")) {
    return "/";
  }
  return value;
}

async function buildAuthUser(dbUser: typeof usersTable.$inferSelect) {
  const [member] = await db.select().from(teamMembersTable).where(eq(teamMembersTable.userId, dbUser.id));
  const [rosterEntry] = await db.select().from(rosterTable).where(
    and(eq(rosterTable.email, dbUser.email), eq(rosterTable.isWhitelisted, true))
  );
  return {
    id: dbUser.id,
    replitId: dbUser.replitId ?? null,
    email: dbUser.email,
    firstName: dbUser.firstName,
    lastName: dbUser.lastName,
    profileImage: dbUser.profileImage ?? null,
    role: dbUser.role,
    campusId: dbUser.campusId ?? null,
    teamId: member?.teamId ?? null,
    isOnRoster: !!rosterEntry,
  };
}

async function upsertUser(claims: Record<string, unknown>) {
  const email = (claims.email as string) || `${claims.sub}@replit.user`;
  const userData = {
    replitId: claims.sub as string,
    email,
    firstName: (claims.first_name as string) || (claims.given_name as string) || "",
    lastName: (claims.last_name as string) || (claims.family_name as string) || "",
    profileImage: ((claims.profile_image_url || claims.picture) as string) || null,
  };

  const [user] = await db
    .insert(usersTable)
    .values(userData)
    .onConflictDoUpdate({
      target: usersTable.replitId,
      set: {
        ...userData,
        updatedAt: new Date(),
      },
    })
    .returning();
  return user;
}

const GenerateTokenBody = z.object({ forms_user_id: z.string().min(1) });
const ValidateTokenBody = z.object({ token: z.string().min(1) });

function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

router.post("/auth/generate-token", async (req: Request, res: Response) => {
  const apiKey = process.env.FORMS_API_KEY;
  if (!apiKey) {
    res.status(500).json({ message: "FORMS_API_KEY not configured" });
    return;
  }
  const provided = req.headers["x-api-key"];
  if (typeof provided !== "string" || !safeEqual(provided, apiKey)) {
    res.status(401).json({ message: "Unauthorized" });
    return;
  }

  const parsed = GenerateTokenBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: "Invalid body" });
    return;
  }

  try {
    const user = await createOrGetUserByFormsId(parsed.data.forms_user_id);
    const auth_token = await generateAuthToken(user.id);
    res.json({ auth_token });
  } catch (err) {
    req.log.error({ err }, "generate-token failed");
    res.status(500).json({ message: "Failed to generate token" });
  }
});

router.post("/auth/validate-token", async (req: Request, res: Response) => {
  const parsed = ValidateTokenBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(401).json({ message: "Invalid or expired token" });
    return;
  }

  try {
    const dbUser = await validateAndConsumeToken(parsed.data.token);
    if (!dbUser) {
      res.status(401).json({ message: "Invalid or expired token" });
      return;
    }
    const authUser = await buildAuthUser(dbUser);

    const sessionData: SessionData = {
      user: authUser,
      access_token: "forms-sso",
    };
    const sid = await createSession(sessionData);
    setSessionCookie(res, sid);
    res.json(GetCurrentAuthUserResponse.parse({ user: authUser }));
  } catch (err) {
    req.log.error({ err }, "validate-token failed");
    res.status(401).json({ message: "Invalid or expired token" });
  }
});

router.get("/auth/user", (req: Request, res: Response) => {
  res.json(
    GetCurrentAuthUserResponse.parse({
      user: req.isAuthenticated() ? req.user : {
        id: null,
        replitId: null,
        email: null,
        firstName: null,
        lastName: null,
        profileImage: null,
        role: null,
        campusId: null,
        isOnRoster: null,
        teamId: null,
      },
    }),
  );
});

router.get("/login", async (req: Request, res: Response) => {
  const config = await getOidcConfig();
  const callbackUrl = `${getOrigin(req)}/api/callback`;

  const returnTo = getSafeReturnTo(req.query.returnTo);

  const state = oidc.randomState();
  const nonce = oidc.randomNonce();
  const codeVerifier = oidc.randomPKCECodeVerifier();
  const codeChallenge = await oidc.calculatePKCECodeChallenge(codeVerifier);

  const redirectTo = oidc.buildAuthorizationUrl(config, {
    redirect_uri: callbackUrl,
    scope: "openid email profile offline_access",
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
    prompt: "login consent",
    state,
    nonce,
  });

  setOidcCookie(res, "code_verifier", codeVerifier);
  setOidcCookie(res, "nonce", nonce);
  setOidcCookie(res, "state", state);
  setOidcCookie(res, "return_to", returnTo);

  res.redirect(redirectTo.href);
});

router.get("/callback", async (req: Request, res: Response) => {
  const config = await getOidcConfig();
  const callbackUrl = `${getOrigin(req)}/api/callback`;

  const codeVerifier = req.cookies?.code_verifier;
  const nonce = req.cookies?.nonce;
  const expectedState = req.cookies?.state;

  if (!codeVerifier || !expectedState) {
    res.redirect("/api/login");
    return;
  }

  const currentUrl = new URL(
    `${callbackUrl}?${new URL(req.url, `http://${req.headers.host}`).searchParams}`,
  );

  let tokens: oidc.TokenEndpointResponse & oidc.TokenEndpointResponseHelpers;
  try {
    tokens = await oidc.authorizationCodeGrant(config, currentUrl, {
      pkceCodeVerifier: codeVerifier,
      expectedNonce: nonce,
      expectedState,
      idTokenExpected: true,
    });
  } catch {
    res.redirect("/api/login");
    return;
  }

  const returnTo = getSafeReturnTo(req.cookies?.return_to);

  res.clearCookie("code_verifier", { path: "/" });
  res.clearCookie("nonce", { path: "/" });
  res.clearCookie("state", { path: "/" });
  res.clearCookie("return_to", { path: "/" });

  const claims = tokens.claims();
  if (!claims) {
    res.redirect("/api/login");
    return;
  }

  const dbUser = await upsertUser(claims as unknown as Record<string, unknown>);
  const authUser = await buildAuthUser(dbUser);

  const now = Math.floor(Date.now() / 1000);
  const sessionData: SessionData = {
    user: authUser,
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
    expires_at: tokens.expiresIn() ? now + tokens.expiresIn()! : claims.exp,
  };

  const sid = await createSession(sessionData);
  setSessionCookie(res, sid);
  res.redirect(returnTo);
});

router.get("/logout", async (req: Request, res: Response) => {
  const config = await getOidcConfig();
  const origin = getOrigin(req);

  const sid = getSessionId(req);
  await clearSession(res, sid);

  const endSessionUrl = oidc.buildEndSessionUrl(config, {
    client_id: process.env.REPL_ID!,
    post_logout_redirect_uri: origin,
  });

  res.redirect(endSessionUrl.href);
});

router.post(
  "/mobile-auth/token-exchange",
  async (req: Request, res: Response) => {
    const parsed = ExchangeMobileAuthorizationCodeBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Missing or invalid required parameters" });
      return;
    }

    const { code, code_verifier, redirect_uri, state, nonce } = parsed.data;

    try {
      const config = await getOidcConfig();

      const callbackUrl = new URL(redirect_uri);
      callbackUrl.searchParams.set("code", code);
      callbackUrl.searchParams.set("state", state);
      callbackUrl.searchParams.set("iss", ISSUER_URL);

      const tokens = await oidc.authorizationCodeGrant(config, callbackUrl, {
        pkceCodeVerifier: code_verifier,
        expectedNonce: nonce ?? undefined,
        expectedState: state,
        idTokenExpected: true,
      });

      const claims = tokens.claims();
      if (!claims) {
        res.status(401).json({ error: "No claims in ID token" });
        return;
      }

      const dbUser = await upsertUser(claims as unknown as Record<string, unknown>);
      const authUser = await buildAuthUser(dbUser);

      const now = Math.floor(Date.now() / 1000);
      const sessionData: SessionData = {
        user: authUser,
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
        expires_at: tokens.expiresIn() ? now + tokens.expiresIn()! : claims.exp,
      };

      const sid = await createSession(sessionData);
      res.json(ExchangeMobileAuthorizationCodeResponse.parse({ token: sid }));
    } catch (err) {
      req.log.error({ err }, "Mobile token exchange error");
      res.status(500).json({ error: "Token exchange failed" });
    }
  },
);

router.post("/mobile-auth/logout", async (req: Request, res: Response) => {
  const sid = getSessionId(req);
  if (sid) {
    await deleteSession(sid);
  }
  res.json(LogoutMobileSessionResponse.parse({ success: true }));
});

const SubmitAccessRequestBody = z.object({
  fullName: z.string().min(1),
  email: z.string().email(),
  batch: z.string().optional(),
  niatId: z.string().optional(),
  campusName: z.string().min(1),
});

router.post("/access-request", async (req: Request, res: Response) => {
  const parsed = SubmitAccessRequestBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request body" });
    return;
  }
  const { fullName, email, batch, niatId, campusName } = parsed.data;
  try {
    const [existing] = await db
      .select()
      .from(accessRequestsTable)
      .where(eq(accessRequestsTable.email, email));
    if (existing) {
      res.status(200).json(existing);
      return;
    }
    const [request] = await db
      .insert(accessRequestsTable)
      .values({ fullName, email, batch: batch ?? null, niatId: niatId ?? null, campusName, status: "pending" })
      .returning();
    res.status(201).json(request);
  } catch {
    res.status(500).json({ error: "Failed to submit request" });
  }
});

export default router;
