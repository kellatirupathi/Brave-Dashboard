// Native (Capacitor) sign-in bridge (additive, isolated).
//
// THE PROBLEM THIS SOLVES
// Sign-in navigates to the NIAT Forms SSO, which is a DIFFERENT ORIGIN. A
// Capacitor WebView only keeps same-origin navigation inside the app; anything
// external is handed to the system browser. So tapping "Login to Dashboard"
// bounced the student into Chrome, Chrome completed the login, and the
// `?auth_token=…` redirect landed in Chrome's tab — never in the app. The app
// sat on the login screen forever.
//
// THE FIX, IN TWO HALVES
//   1. Open the SSO in a Chrome Custom Tab (@capacitor/browser) instead of
//      letting the WebView hand it to Chrome. A Custom Tab is chrome-less, and
//      it shares the browser's cookie jar, so an already-signed-in student is
//      straight through.
//   2. Have the SSO return to a deep link (`in.niatindia.brave://auth?...`)
//      that Android routes back to THIS app. We read the token off it, hand it
//      to the same /api/auth/validate-token endpoint the web build uses, and
//      close the tab.
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
    const fromQuery = parsed.searchParams.get("auth_token");
    if (fromQuery) return fromQuery;
    // Fragment form: in.niatindia.brave://auth#auth_token=…
    const hash = parsed.hash.startsWith("#") ? parsed.hash.slice(1) : parsed.hash;
    const fromHash = new URLSearchParams(hash).get("auth_token");
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
 * Returns false when not running natively, so the caller falls straight through
 * to the normal web redirect.
 */
export async function startNativeLogin(loginUrl: string): Promise<boolean> {
  if (!isNativeApp() || !loginUrl) return false;

  const url = new URL(loginUrl);
  url.searchParams.set("redirect_uri", NATIVE_REDIRECT_URI);

  // PREFERRED: a WebView INSIDE the app. Chrome never appears, and the student
  // stays in BRAVE the whole way through.
  //
  // Deliberately NOT `server.allowNavigation`, which would load the SSO in the
  // main WebView: Capacitor then reports the app as a *web* platform (losing
  // the native APIs) and its proxy drops set-cookie headers, which is exactly
  // what a session-cookie login depends on.
  try {
    const { InAppBrowser } = await import("@capacitor/inappbrowser");
    await InAppBrowser.openInWebView({
      url: url.toString(),
      options: {
        showURL: false,
        showToolbar: true,
        clearCache: false,
        clearSessionCache: false,
        closeButtonText: "Cancel",
        toolbarType: "navigation" as never,
      } as never,
    });
    return true;
  } catch {
    // Plugin unavailable in this build — fall through.
  }

  // FALLBACK: Chrome Custom Tab. Still inside the app's task and still returns
  // via the deep link, just with the browser's chrome rather than ours.
  try {
    const { Browser } = await import("@capacitor/browser");
    await Browser.open({ url: url.toString(), presentationStyle: "popover" });
    return true;
  } catch {
    return false;
  }
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

      const handle = await App.addListener("appUrlOpen", async (event) => {
        const token = extractToken(event.url);
        if (!token) return;
        // Close the Custom Tab first, so the student sees the app rather than
        // a browser tab sitting on a redirect page.
        // Close whichever surface was used to show the SSO.
        try {
          const { InAppBrowser } = await import("@capacitor/inappbrowser");
          await InAppBrowser.close();
        } catch {
          /* not the in-app view, or already closed */
        }
        try {
          await Browser.close();
        } catch {
          /* not a Custom Tab, or already closed */
        }
        if (await validateToken(token)) onSignedIn();
      });

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
 * The session cookie lives in the WebView, so hitting /api/logout there is
 * enough — but the Custom Tab keeps its own SSO cookie, which is why a plain
 * redirect would silently sign the student straight back in on the next tap.
 */
export async function nativeLogout(): Promise<boolean> {
  if (!isNativeApp()) return false;
  try {
    await fetch("/api/logout", { credentials: "include" });
  } catch {
    /* best effort — the reload below still clears in-memory state */
  }
  window.location.href = "/";
  return true;
}
