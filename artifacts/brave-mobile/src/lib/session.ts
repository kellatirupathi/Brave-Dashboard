/**
 * Session persistence — the fix for "sign in with NIAT every single launch".
 *
 * WHY THE APP KEPT ASKING
 * The Capacitor build stored nothing at all. Its login depended on a cookie
 * living inside the WebView, and Android discards that when the app process is
 * killed, so every cold start began logged out.
 *
 * WHY WE STORE THE COOKIE AND NOT THE TOKEN
 * `POST /api/auth/validate-token` calls `validateAndConsumeToken` — the SSO
 * token is SINGLE USE. Replaying a stored one always fails. What has a life of
 * its own is the session id the server sets afterwards (`sid`, 7-day TTL), so
 * that is what we keep.
 *
 * WHERE IT IS KEPT
 * Keychain, which on Android is the hardware-backed Keystore. A session id is a
 * bearer credential: anyone holding it is the student until it expires, so it
 * does not belong in AsyncStorage, which is world-readable on a rooted device.
 */
import * as Keychain from 'react-native-keychain';
import CookieManager from '@preeternal/react-native-cookie-manager';

const SERVICE = 'in.niatindia.brave.session';
/** Matches SESSION_COOKIE in the API (`lib/auth.ts`). */
export const COOKIE_NAME = 'sid';

export async function saveSessionId(sid: string): Promise<void> {
  try {
    await Keychain.setGenericPassword(COOKIE_NAME, sid, {
      service: SERVICE,
      accessible: Keychain.ACCESSIBLE.AFTER_FIRST_UNLOCK,
    });
  } catch {
    // A device with no secure hardware still has to be able to sign in; it
    // just will not stay signed in across launches.
  }
}

export async function loadSessionId(): Promise<string | null> {
  try {
    const creds = await Keychain.getGenericPassword({ service: SERVICE });
    return creds ? creds.password : null;
  } catch {
    return null;
  }
}

export async function clearSession(): Promise<void> {
  try {
    await Keychain.resetGenericPassword({ service: SERVICE });
  } catch {
    /* nothing stored */
  }
}

/**
 * Pull `sid` out of a Set-Cookie header.
 *
 * React Native joins multiple Set-Cookie headers into one comma-separated
 * string, and cookie EXPIRY dates contain commas of their own
 * ("Expires=Wed, 09 Jun 2027"), so splitting on "," corrupts them. Matching the
 * name directly sidesteps the whole problem.
 */
export function extractSessionId(setCookie: string | null): string | null {
  if (!setCookie) return null;
  const m = setCookie.match(
    new RegExp(`(?:^|[,;\\s])${COOKIE_NAME}=([^;,\\s]+)`),
  );
  return m ? m[1] : null;
}

/**
 * Take the session straight out of the WebView's cookie jar.
 *
 * This is the route that does not depend on NxtWave handing us anything. Once
 * the login WebView reaches the dashboard, our own server has already set its
 * `sid` cookie; lifting it into the Keystore turns that browser session into
 * the app's session, with no redirect, no deep link and no callback anywhere.
 *
 * Returns the id so the caller can decide whether the login actually worked —
 * an empty jar means the student never finished signing in.
 */
export async function adoptSessionFromCookies(
  url: string,
): Promise<string | null> {
  try {
    // Android may notify the WebView that navigation finished just before its
    // shared CookieManager has flushed the response cookie. Keep the WebView
    // mounted while polling briefly rather than turning a successful OTP into
    // a false "sign-in did not complete" error.
    const targets = Array.from(
      new Set([
        url,
        (() => {
          try {
            return new URL(url).origin;
          } catch {
            return url;
          }
        })(),
      ]),
    );

    for (let attempt = 0; attempt < 8; attempt += 1) {
      await CookieManager.flush();

      for (const target of targets) {
        const jar = await CookieManager.get(target, true);
        // `useWebKit`/httpOnly handling differs by platform, and the value may
        // be a bare string on some versions, so accept both supported shapes.
        const raw = (jar as Record<string, unknown> | undefined)?.[COOKIE_NAME];
        const structuredSid =
          typeof raw === 'string'
            ? raw
            : ((raw as { value?: string } | undefined)?.value ?? null);
        const sid =
          structuredSid ||
          extractSessionId(await CookieManager.getCookieHeader(target, true));

        if (sid) {
          await saveSessionId(sid);
          return sid;
        }
      }

      if (attempt < 7) {
        await new Promise<void>(resolve =>
          setTimeout(() => resolve(), 250),
        );
      }
    }

    return null;
  } catch {
    // No cookie module, or a platform that refuses to read httpOnly cookies.
    // The caller still has the auth_token route to fall back on.
    return null;
  }
}

/** Wipe the WebView's cookies so a sign-out does not silently sign back in. */
export async function clearWebCookies(): Promise<void> {
  try {
    await CookieManager.clearAll(true);
  } catch {
    /* nothing to clear */
  }
}
