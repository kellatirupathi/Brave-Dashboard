import * as oidc from "openid-client";
import { Router, type IRouter, type Request, type Response } from "express";
import { z } from "zod";
import {
  GetCurrentAuthUserResponse,
  UpdateCurrentAuthUserBody,
} from "@workspace/api-zod";
import crypto from "crypto";
import * as bcrypt from "bcryptjs";
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
import { eq, and, or } from "drizzle-orm";
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
import {
  getBootstrapAdminFormsIds,
  getBootstrapAdminEmails,
} from "../bootstrap-admins";
import { logAudit } from "../lib/audit";

// Returns a roster entry that resolves to a real campus for the given
// formsUserId / email — used to decide whether SSO is allowed to provision
// a brand new student row. Without this check the system would persist a
// student with no campus, which Task #42 forbids.
async function findUsableRosterMatch(opts: {
  formsUserId?: string | null;
  email?: string | null;
}) {
  const clauses = [] as ReturnType<typeof eq>[];
  if (opts.formsUserId)
    clauses.push(eq(rosterTable.studentId, opts.formsUserId));
  if (opts.email) clauses.push(eq(rosterTable.email, opts.email));
  if (clauses.length === 0) return null;
  const [match] = await db
    .select()
    .from(rosterTable)
    .where(and(or(...clauses), eq(rosterTable.isWhitelisted, true)));
  if (!match || match.campusId == null) return null;
  return match;
}

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

// Public marketing site (Framer). Users are redirected here on logout
// so they leave the dashboard subdomain entirely. Hardcoded by request —
// do not move to env.
const PUBLIC_SITE_URL = "https://www.brave.niatindia.com/";

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
  if (
    typeof value !== "string" ||
    !value.startsWith("/") ||
    value.startsWith("//")
  ) {
    return "/";
  }
  return value;
}

export async function buildAuthUser(dbUser: typeof usersTable.$inferSelect) {
  const [member] = await db
    .select()
    .from(teamMembersTable)
    .where(eq(teamMembersTable.userId, dbUser.id));
  const matchClauses = [eq(rosterTable.email, dbUser.email)];
  if (dbUser.formsUserId) {
    matchClauses.push(eq(rosterTable.studentId, dbUser.formsUserId));
  }
  const [rosterEntry] = await db
    .select()
    .from(rosterTable)
    .where(and(or(...matchClauses), eq(rosterTable.isWhitelisted, true)));
  // If we matched roster and the user has no campus / name / real email set
  // yet, propagate from roster. Forms-SSO accounts start life with a synthetic
  // `sso_<formsUserId>@forms.local` address; when the matched roster row holds
  // a real email we surface (and persist) it so the profile/email field shows
  // the real address instead of the placeholder.
  const isSyntheticEmail = (e: string | null | undefined): boolean =>
    !!e && (/@forms\.local$/i.test(e) || /^sso_/i.test(e));
  let campusId = dbUser.campusId ?? null;
  let firstName = dbUser.firstName;
  let lastName = dbUser.lastName;
  let email = dbUser.email;
  if (rosterEntry) {
    const updates: Partial<typeof usersTable.$inferInsert> = {};
    if (campusId == null && rosterEntry.campusId != null) {
      campusId = rosterEntry.campusId;
      updates.campusId = rosterEntry.campusId;
    }
    if ((!firstName || !lastName) && rosterEntry.fullName) {
      const parts = rosterEntry.fullName.trim().split(/\s+/);
      const fn = parts[0] ?? "";
      const ln = parts.slice(1).join(" ");
      if (!firstName) {
        firstName = fn;
        updates.firstName = fn;
      }
      if (!lastName) {
        lastName = ln;
        updates.lastName = ln;
      }
    }
    if (
      isSyntheticEmail(email) &&
      rosterEntry.email &&
      !isSyntheticEmail(rosterEntry.email)
    ) {
      email = rosterEntry.email;
      updates.email = rosterEntry.email;
    }
    if (Object.keys(updates).length > 0) {
      await db
        .update(usersTable)
        .set({ ...updates, updatedAt: new Date() })
        .where(eq(usersTable.id, dbUser.id));
    }
  }
  return {
    id: dbUser.id,
    replitId: dbUser.replitId ?? null,
    email,
    niatId: dbUser.niatId ?? null,
    firstName: firstName ?? "",
    lastName: lastName ?? "",
    profileImage: dbUser.profileImage ?? null,
    role: dbUser.role,
    campusId,
    teamId: member?.teamId ?? null,
    isOnRoster: !!rosterEntry,
    profileCompletedAt: dbUser.profileCompletedAt
      ? dbUser.profileCompletedAt.toISOString()
      : null,
    // Whether this account has a password set. Drives the "Change password"
    // option in the profile dropdown — SSO-only accounts never see it.
    hasPassword: !!dbUser.passwordHash,
  };
}

async function upsertUser(claims: Record<string, unknown>) {
  const email = (claims.email as string) || `${claims.sub}@replit.user`;
  const userData = {
    replitId: claims.sub as string,
    email,
    firstName:
      (claims.first_name as string) || (claims.given_name as string) || "",
    lastName:
      (claims.last_name as string) || (claims.family_name as string) || "",
    profileImage:
      ((claims.profile_image_url || claims.picture) as string) || null,
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

const GenerateTokenBody = z.object({ user_id: z.string().min(1) });
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
    const adminFormsIds = getBootstrapAdminFormsIds();
    const isBootstrapAdmin = adminFormsIds.includes(parsed.data.user_id);

    // Soft-onboarding policy: any authenticated Forms user is allowed in.
    // - Bootstrap admins are promoted to "admin" on first login.
    // - Roster matches keep "roster" provenance (so admins can see they came
    //   from the trusted roster import).
    // - Everyone else auto-provisions as a student tagged
    //   "auto_forms_sso" so admins can review or remove unexpected sign-ins.
    const [preExisting] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.formsUserId, parsed.data.user_id));

    let provenance: "roster" | "auto_forms_sso" = "auto_forms_sso";
    if (!preExisting && !isBootstrapAdmin) {
      const rosterMatch = await findUsableRosterMatch({
        formsUserId: parsed.data.user_id,
      });
      if (rosterMatch) provenance = "roster";
    }

    const { user: provisioned, created } = await createOrGetUserByFormsId(
      parsed.data.user_id,
      { provisionedVia: provenance },
    );
    let user = provisioned;
    // Promote to admin if this Forms user_id is in the bootstrap list.
    if (isBootstrapAdmin && user.role !== "admin") {
      const [updated] = await db
        .update(usersTable)
        .set({ role: "admin", isActive: true, campusId: null })
        .where(eq(usersTable.id, user.id))
        .returning();
      if (updated) user = updated;
    }

    if (created && !isBootstrapAdmin && provenance === "auto_forms_sso") {
      try {
        await logAudit(
          user.id,
          "auto_provisioned_student",
          "user",
          undefined,
          JSON.stringify({
            formsUserId: parsed.data.user_id,
            userId: user.id,
          }),
        );
      } catch (auditErr) {
        req.log.warn({ err: auditErr }, "Failed to write auto-provision audit");
      }
    }

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

    // TEMPORARILY DISABLED: campus-required gate for student sessions.
    // Previously we blocked any student session whose user row had no
    // campusId. Commented out so SSO-authenticated users can reach the
    // dashboard even without a roster/campus match.
    // if (authUser.role === "student" && authUser.campusId == null) {
    //   req.log.warn({ userId: authUser.id, email: authUser.email }, "Blocking SSO login: student has no campus");
    //   res.status(403).json({
    //     message:
    //       "We couldn't match you to a campus. Please contact your campus coordinator to be added to the roster.",
    //   });
    //   return;
    // }

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

router.get("/auth/user", async (req: Request, res: Response) => {
  if (!req.isAuthenticated()) {
    res.json(GetCurrentAuthUserResponse.parse({ user: null }));
    return;
  }
  // Always re-derive the auth user from the DB so fields that can change
  // mid-session (e.g. teamId after a student creates or joins a team) are
  // live, not snapshotted at login. Falls back to the session-cached value
  // if the DB lookup fails for any reason.
  try {
    const [dbUser] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.id, req.user.id));
    if (dbUser) {
      const fresh = await buildAuthUser(dbUser);
      // GetCurrentAuthUserResponse is a Zod schema generated from OpenAPI
      // and strips fields it doesn't know about — including `hasPassword`,
      // which the sidebar uses to show/hide the "Change password" option.
      // Re-attach it after parsing.
      const parsed = GetCurrentAuthUserResponse.parse({ user: fresh });
      if (parsed.user) {
        (parsed.user as { hasPassword?: boolean }).hasPassword =
          fresh.hasPassword;
      }
      res.json(parsed);
      return;
    }
  } catch (err) {
    req.log.warn({ err }, "auth/user live rebuild failed; using session cache");
  }
  res.json(GetCurrentAuthUserResponse.parse({ user: req.user }));
});

router.patch("/auth/me", async (req: Request, res: Response) => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const parsed = UpdateCurrentAuthUserBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const updates: Partial<typeof usersTable.$inferInsert> = {};
  if (typeof parsed.data.firstName === "string") {
    const v = parsed.data.firstName.trim();
    if (v) updates.firstName = v;
  }
  if (typeof parsed.data.lastName === "string") {
    updates.lastName = parsed.data.lastName.trim();
  }
  if (typeof parsed.data.email === "string") {
    const v = parsed.data.email.trim();
    if (v) updates.email = v;
  }
  if (typeof parsed.data.niatId === "string") {
    const v = parsed.data.niatId.trim();
    updates.niatId = v.length > 0 ? v : null;
  }
  if (Object.keys(updates).length === 0) {
    // Even with no field changes, stamp the first-time profile completion flag
    // so users with fully-prefilled rosters can clear the profile gate by
    // simply confirming the page.
    if (!req.user.profileCompletedAt) {
      await db
        .update(usersTable)
        .set({ profileCompletedAt: new Date(), updatedAt: new Date() })
        .where(eq(usersTable.id, req.user.id));
    }
    const [dbUser] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.id, req.user.id));
    if (!dbUser) {
      res.status(404).json({ error: "User not found" });
      return;
    }
    const fresh = await buildAuthUser(dbUser);
    res.json(GetCurrentAuthUserResponse.parse({ user: fresh }));
    return;
  }

  if (updates.email) {
    const [emailHit] = await db
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(eq(usersTable.email, updates.email));
    if (emailHit && emailHit.id !== req.user.id) {
      res
        .status(409)
        .json({ error: "That email is already in use by another account." });
      return;
    }
  }
  if (updates.niatId) {
    const [niatHit] = await db
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(eq(usersTable.niatId, updates.niatId));
    if (niatHit && niatHit.id !== req.user.id) {
      res
        .status(409)
        .json({ error: "That NIAT ID is already in use by another account." });
      return;
    }
  }

  // Stamp the first-time profile completion flag if it has never been set.
  // Using the in-flight req.user as the "before" snapshot is sufficient — we
  // only need to know whether the user has ever completed it, not the exact
  // current row state.
  const finalUpdates: Partial<typeof usersTable.$inferInsert> = {
    ...updates,
    updatedAt: new Date(),
  };
  if (!req.user.profileCompletedAt) {
    finalUpdates.profileCompletedAt = new Date();
  }
  try {
    await db
      .update(usersTable)
      .set(finalUpdates)
      .where(eq(usersTable.id, req.user.id));
  } catch (err) {
    if ((err as { code?: string })?.code === "23505") {
      res
        .status(409)
        .json({ error: "That email or NIAT ID is already in use." });
      return;
    }
    req.log.error({ err }, "PATCH /auth/me failed");
    res.status(500).json({ error: "Failed to update profile" });
    return;
  }

  const [dbUser] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.id, req.user.id));
  if (!dbUser) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  const fresh = await buildAuthUser(dbUser);
  res.json(GetCurrentAuthUserResponse.parse({ user: fresh }));
});

// Dev-only login shortcut for seeded users. Disabled in production.
// Usage: GET /api/auth/dev-login?email=admin.1@brave.seed&returnTo=/admin
router.get("/auth/dev-login", async (req: Request, res: Response) => {
  if (process.env.NODE_ENV === "production") {
    res.status(404).json({ error: "Not found" });
    return;
  }
  const email = typeof req.query.email === "string" ? req.query.email : "";
  if (!email.endsWith("@brave.seed")) {
    res
      .status(400)
      .json({ error: "dev-login only works for seeded @brave.seed accounts" });
    return;
  }
  const [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.email, email));
  if (!user) {
    res.status(404).json({ error: `No seeded user with email ${email}` });
    return;
  }
  const authUser = await buildAuthUser(user);
  const sessionData: SessionData = {
    user: authUser,
    access_token: "dev-login",
  };
  const sid = await createSession(sessionData);
  setSessionCookie(res, sid);
  const returnTo = getSafeReturnTo(req.query.returnTo);
  res.redirect(returnTo);
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

  // If this is a brand-new replit user (no row yet) and we can't find a
  // roster entry to give them a campus, don't persist a student row at all
  // — that would violate the "no student/coordinator without a campus"
  // invariant.
  const replitId = (claims as Record<string, unknown>).sub as
    | string
    | undefined;
  const claimEmail =
    ((claims as Record<string, unknown>).email as string | undefined) ?? null;
  const [preExistingByReplit] = replitId
    ? await db
        .select()
        .from(usersTable)
        .where(eq(usersTable.replitId, replitId))
    : [];
  const [preExistingByEmail] =
    !preExistingByReplit && claimEmail
      ? await db
          .select()
          .from(usersTable)
          .where(eq(usersTable.email, claimEmail))
      : [];
  const preExistingUser = preExistingByReplit ?? preExistingByEmail;
  if (!preExistingUser) {
    const adminEmails = getBootstrapAdminEmails();
    const isBootstrapAdminEmail =
      !!claimEmail && adminEmails.includes(claimEmail.toLowerCase());
    const rosterMatch = isBootstrapAdminEmail
      ? null
      : await findUsableRosterMatch({ email: claimEmail });
    if (!isBootstrapAdminEmail && !rosterMatch) {
      req.log.warn(
        { replitId, email: claimEmail },
        "Refusing OIDC login: no existing user and no roster match with a campus",
      );
      res.redirect("/?error=no_campus");
      return;
    }
  }

  const dbUser = await upsertUser(claims as unknown as Record<string, unknown>);
  const authUser = await buildAuthUser(dbUser);

  if (authUser.role === "student" && authUser.campusId == null) {
    req.log.warn(
      { userId: authUser.id, email: authUser.email },
      "Blocking SSO login: student has no campus",
    );
    res.redirect("/?error=no_campus");
    return;
  }

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
  // Clear our local session (cookie + DB row) and bounce the user to the
  // public marketing site, off the dashboard subdomain entirely.
  //
  // We intentionally do NOT call Replit's OIDC end-session endpoint here.
  // That endpoint requires post_logout_redirect_uri to be pre-registered
  // with the OAuth client, and only the dashboard origin is registered —
  // sending users to www.brave.niatindia.com from there returns
  // invalid_request. The user's Replit IdP session lingers, but that is
  // harmless: /api/login passes prompt="login consent" which forces full
  // re-authentication on the next sign-in.
  const sid = getSessionId(req);
  await clearSession(res, sid);
  res.redirect(PUBLIC_SITE_URL);
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

      const replitId = (claims as Record<string, unknown>).sub as
        | string
        | undefined;
      const claimEmail =
        ((claims as Record<string, unknown>).email as string | undefined) ??
        null;
      const [preExistingByReplit] = replitId
        ? await db
            .select()
            .from(usersTable)
            .where(eq(usersTable.replitId, replitId))
        : [];
      const [preExistingByEmail] =
        !preExistingByReplit && claimEmail
          ? await db
              .select()
              .from(usersTable)
              .where(eq(usersTable.email, claimEmail))
          : [];
      const preExistingUser = preExistingByReplit ?? preExistingByEmail;
      if (!preExistingUser) {
        const adminEmails = getBootstrapAdminEmails();
        const isBootstrapAdminEmail =
          !!claimEmail && adminEmails.includes(claimEmail.toLowerCase());
        const rosterMatch = isBootstrapAdminEmail
          ? null
          : await findUsableRosterMatch({ email: claimEmail });
        if (!isBootstrapAdminEmail && !rosterMatch) {
          req.log.warn(
            { replitId, email: claimEmail },
            "Refusing mobile OIDC login: no existing user and no roster match with a campus",
          );
          res.status(403).json({
            error:
              "We couldn't match you to a campus. Please contact your campus coordinator to be added to the roster.",
          });
          return;
        }
      }

      const dbUser = await upsertUser(
        claims as unknown as Record<string, unknown>,
      );
      const authUser = await buildAuthUser(dbUser);

      if (authUser.role === "student" && authUser.campusId == null) {
        req.log.warn(
          { userId: authUser.id, email: authUser.email },
          "Blocking mobile SSO login: student has no campus",
        );
        res.status(403).json({
          error:
            "We couldn't match you to a campus. Please contact your campus coordinator to be added to the roster.",
        });
        return;
      }

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
      .values({
        fullName,
        email,
        batch: batch ?? null,
        niatId: niatId ?? null,
        campusName,
        status: "pending",
      })
      .returning();
    res.status(201).json(request);
  } catch {
    res.status(500).json({ error: "Failed to submit request" });
  }
});

// ---------- Email + password login (admins / coordinators only) ----------
// Runs alongside Forms SSO. Never replaces it. Students cannot use this path.
const PasswordLoginBody = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

router.post("/auth/password-login", async (req: Request, res: Response) => {
  const parsed = PasswordLoginBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid email or password format" });
    return;
  }
  const email = parsed.data.email.trim().toLowerCase();

  const [dbUser] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.email, email));
  // Generic message — don't leak whether email exists.
  const invalid = () =>
    res.status(401).json({ error: "Invalid email or password." });
  if (!dbUser || !dbUser.passwordHash) return invalid();
  if (!dbUser.isActive) {
    res.status(403).json({ error: "Account is inactive." });
    return;
  }
  if (dbUser.role === "student") {
    res.status(403).json({
      error: "Student accounts must sign in via Forms SSO.",
    });
    return;
  }

  let ok = false;
  try {
    ok = await bcrypt.compare(parsed.data.password, dbUser.passwordHash);
  } catch {
    ok = false;
  }
  if (!ok) return invalid();

  const authUser = await buildAuthUser(dbUser);
  const sessionData: SessionData = {
    user: authUser,
    access_token: "password-login",
  };
  const sid = await createSession(sessionData);
  setSessionCookie(res, sid);
  res.json(GetCurrentAuthUserResponse.parse({ user: authUser }));
});

// ---------- Self change-password ----------
const ChangePasswordBody = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8, "Password must be at least 8 characters"),
});

router.post("/auth/change-password", async (req: Request, res: Response) => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const parsed = ChangePasswordBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [dbUser] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.id, req.user.id));
  if (!dbUser || !dbUser.passwordHash) {
    res
      .status(400)
      .json({ error: "This account does not use password sign-in." });
    return;
  }
  let currentOk = false;
  try {
    currentOk = await bcrypt.compare(
      parsed.data.currentPassword,
      dbUser.passwordHash,
    );
  } catch {
    currentOk = false;
  }
  if (!currentOk) {
    res.status(401).json({ error: "Current password is incorrect." });
    return;
  }
  const newHash = await bcrypt.hash(parsed.data.newPassword, 10);
  await db
    .update(usersTable)
    .set({ passwordHash: newHash, updatedAt: new Date() })
    .where(eq(usersTable.id, dbUser.id));
  res.json({ ok: true });
});

export default router;
