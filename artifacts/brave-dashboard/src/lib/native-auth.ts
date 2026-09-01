// Native (Capacitor) sign-in bridge (additive, isolated).
//
// THE PROBLEM THIS SOLVES
// Sign-in navigates to the NIAT Forms SSO, which is a DIFFERENT ORIGIN. By
// default a Capacitor WebView only keeps same-origin navigation inside the app
// and hands anything external to Chrome. So tapping "Sign in with NIAT" bounced
// the student into a browser, the browser completed the OTP, and the returning
// `?auth_token=…` redirect landed there — never in the app, which sat on the
// sign-in screen forever.
//
// THE FIX
// `server.allowNavigation` in capacitor.config.ts lists the SSO hosts, so the
// whole round trip stays in the app's own WebView. The token comes back to the
// page that asked for it and `useAuth` exchanges it for a session cookie —
// the SAME path the browser build uses.
//
// An EARLIER attempt opened the SSO in a Custom Tab / InAppBrowser and asked
// Forms to return to a `in.niatindia.brave://auth` deep link. Forms ignores an
// arbitrary redirect_uri, so that deep link never fired. The listener below is
// kept only as a harmless fallback for the day Forms is configured to send one;
// nothing depends on it.
//
// WEB IS COMPLETELY UNAFFECTED. Every function here no-ops unless running in
// the native shell, so `pnpm build` for the browser behaves exactly as before.
// The shared @workspace/replit-auth-web package is NOT modified — this wraps
// it, so nothing else that depends on it changes.

/** True only inside the Capacitor native shell. */
export function isNativeApp(): boolean {
  if (typeof window === "undefined") return false;
  const w = window as { Capacitor?: { isNativePlatform?: () => boolean } };
  return !!w.Capacitor?.isNativePlatform?.();
}

/**
 * Custom scheme Android routes back to this app. Must match `appId` in
 * capacitor.config.ts and the intent-filter in AndroidManifest.xml — Capacitor
 * registers `<appId>://` for us.
 */
const APP_SCHEME = "in.niatindia.brave";
/** Where the SSO should send the student back to. */
export const NATIVE_REDIRECT_URI = `${APP_SCHEME}://auth`;

/**
 * Pull an auth token out of a deep-link URL.
 *
 * Accepts it in the query string or the fragment, because SSO providers differ on
 * which they use and guessing wrong means a silent failure.
 */
export function extractToken(url: string): string | null {
  try {
    const parsed = new URL(url);
    // Forms has used both names in its setup documentation. Accepting both
    // keeps Android login working while the provider configuration is rolled
    // out, without weakening token validation on the server.
    const fromQuery =
      parsed.searchParams.get("auth_token") ?? parsed.searchParams.get("token");
    if (fromQuery) return fromQuery;
    // Fragment form: in.niatindia.brave://auth#auth_token=…
    const hash = parsed.hash.startsWith("#") ? parsed.hash.slice(1) : parsed.hash;
    const hashParams = new URLSearchParams(hash);
    const fromHash =
      hashParams.get("auth_token") ?? hashParams.get("token");
    return fromHash || null;
  } catch {
    return null;
  }
}

/**
 * Exchange a token for a session cookie. Same endpoint and same shape the web
 * build already uses, so there is one validation path, not two.
 */
async function validateToken(token: string): Promise<boolean> {
  try {
    const res = await fetch("/api/auth/validate-token", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Start sign-in inside the app.
 *
 * ── WHAT WAS BROKEN ─────────────────────────────────────────────────────────
 *
 * This used to open the SSO in a SEPARATE browser surface — an InAppBrowser
 * WebView, falling back to a Chrome Custom Tab — with
 * `redirect_uri=in.niatindia.brave://auth` appended, and then wait for Android
 * to deliver that deep link back to the app.
 *
 * NIAT Forms does not honour an arbitrary `redirect_uri`. It redirects to the
 * destination configured against the form, which is
 * `https://dashboard.brave.niatindia.com/?auth_token=…`. So the token landed
 * in the *browser surface*, signing the student into a throwaway browser copy
 * of the dashboard. The deep link never fired, the surface was never closed,
 * and the app underneath sat on the sign-in screen forever — a blank page or a
 * spinner that never resolves.
 *
 * ── WHAT IT DOES NOW ────────────────────────────────────────────────────────
 *
 * Navigate the app's OWN WebView to the SSO. `server.allowNavigation` in
 * capacitor.config.ts keeps `forms.ccbp.in` inside that WebView instead of
 * handing it to Chrome, so:
 *
 *   already signed in to Forms → it redirects straight back, and the student
 *   is on the dashboard without seeing a login form at all;
 *
 *   not signed in → the mobile-number + OTP screens render in the app, and the
 *   same redirect follows.
 *
 * Either way the `?auth_token=` redirect lands on the page that asked for it,
 * where `useAuth`'s existing handler exchanges it for a session cookie. That
 * is the SAME code path the browser build uses — one flow, not two.
 *
 * Returns false when not running natively, so the caller falls straight through
 * to the normal web redirect.
 */
export async function startNativeLogin(loginUrl: string): Promise<boolean> {
  if (!isNativeApp() || !loginUrl) return false;

  // No `redirect_uri` is appended. Forms ignores it, and sending one only
  // invited the belief that the deep-link round trip was working.
  //
  // `assign` rather than `replace`: the sign-in screen stays in history, so a
  // student who backs out of the OTP step returns to the app rather than
  // dropping out of it.
  window.location.assign(loginUrl);
  return true;
}

/**
 * Listen for the deep link that carries the token home.
 *
 * Call once, early. Returns a cleanup function; safe to call on web, where it
 * does nothing and returns a no-op.
 */
export function registerAuthDeepLink(onSignedIn: () => void): () => void {
  if (!isNativeApp()) return () => {};

  let cleanup = () => {};
  void (async () => {
    try {
      const [{ App }, { Browser }] = await Promise.all([
        import("@capacitor/app"),
        import("@capacitor/browser"),
      ]);

      let consumedToken: string | null = null;
      const finishSignIn = async (url: string) => {
        const token = extractToken(url);
        if (!token || token === consumedToken) return;
        consumedToken = token;
        if (!token) return;
        // Close the Custom Tab first, so the student sees the app rather than
        // a browser tab sitting on a redirect page.
        // Close whichever surface was used to show the SSO.
        try {
          const nativePlugin = "@capacitor/inappbrowser";
          const { InAppBrowser } = await import(/* @vite-ignore */ nativePlugin);
          await InAppBrowser.close();
        } catch {
          /* not the in-app view, or already closed */
        }
        try {
          await Browser.close();
        } catch {
          /* not a Custom Tab, or already closed */
        }
        if (await validateToken(token)) {
          onSignedIn();
        } else {
          // Allow a retry if a transient network failure prevented exchange.
          consumedToken = null;
        }
      };

      const handle = await App.addListener("appUrlOpen", (event) => {
        void finishSignIn(event.url);
      });

      // If Android recreated the activity while Forms was open, appUrlOpen may
      // have fired before React mounted this listener. Recover that launch URL
      // so a valid OTP never ends on a blank or permanently signed-out screen.
      const launch = await App.getLaunchUrl();
      if (launch?.url) void finishSignIn(launch.url);

      cleanup = () => {
        void handle.remove();
      };
    } catch {
      /* plugins unavailable; nothing to listen for */
    }
  })();

  return () => cleanup();
}

/**
 * Sign out natively.
 *
 * ── WHY THIS IS NOT JUST A REDIRECT ─────────────────────────────────────────
 *
 * Sign-in now happens in the app's OWN WebView, so `forms.ccbp.in` sets its
 * SSO cookie in the app's cookie jar. Hitting /api/logout clears OUR session
 * cookie and nothing else — so the next tap on "Sign in with NIAT" finds the
 * SSO cookie still valid and signs the SAME student straight back in, with no
 * mobile number and no OTP.
 *
 * That is not a cosmetic problem. These phones get handed around: a student
 * who signs out so a teammate can sign in would instead watch their own
 * account reappear, and the teammate could never get in at all.
 *
 * The server can fix this properly by setting FORMS_LOGOUT_URL, which
 * routes/auth.ts already honours. Until it is set, clearing the WebView's
 * cookie jar is the half we control, and it is enough: dropping the SSO cookie
 * makes the next sign-in ask for the number and the OTP again.
 *
 * Returns false on web, where the caller should fall through to a plain
 * redirect.
 */
export async function nativeLogout(): Promise<boolean> {
  if (!isNativeApp()) return false;

  // Server-side first, so the session is invalidated even if the app is killed
  // before the redirect lands.
  //
  // Capped, because /api/logout does not just clear our session: it 302s on to
  // the IdP's end-session endpoint or to FORMS_LOGOUT_URL, and fetch follows
  // that chain to forms.ccbp.in. Cross-origin, so the read fails anyway -- but
  // only after the round trip. Without a cap, a slow upstream leaves the
  // student staring at an unresponsive Logout button. The server has already
  // cleared the session by the time it starts redirecting, so abandoning the
  // chain early costs nothing.
  try {
    const cutoff = new AbortController();
    const timer = setTimeout(() => cutoff.abort(), 4000);
    try {
      await fetch("/api/logout", {
        credentials: "include",
        signal: cutoff.signal,
      });
    } finally {
      clearTimeout(timer);
    }
  } catch {
    /* best effort — clearing cookies below still signs the student out here */
  }

  // Drops every cookie in the WebView: ours AND the SSO's. Android's
  // CookieManager.removeAllCookies underneath.
  try {
    const { CapacitorCookies } = await import("@capacitor/core");
    await CapacitorCookies.clearAllCookies();
  } catch {
    /* older shell without the cookie plugin; the server logout still applies */
  }

  // `replace`, not `href`: a pushed entry would leave the signed-in dashboard
  // in history, and the hardware back button would appear to undo the sign-out.
  // Go directly to the mobile login route instead of relying on the root
  // role redirect. That avoids a blank/intermediate frame after the WebView
  // session has just been cleared and guarantees the NIAT sign-in screen is
  // the first page the student sees after logout.
  window.location.replace("/login");
  return true;
}

/**
 * One sign-out for every caller.
 *
 * The app has to clear the SSO cookie as well as the session (see
 * nativeLogout); the browser only needs the redirect that `useAuth().logout`
 * already performs. Callers should not have to know which one they are, so
 * they pass their `logout` in and this picks.
 */
export async function signOut(webLogout: () => void): Promise<void> {
  if (await nativeLogout()) return;
  webLogout();
}
