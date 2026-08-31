/**
 * Where the app talks to. The mobile app has NO database access of its own —
 * it speaks only to the Express API, which owns the Neon connection. A
 * credential shipped inside an APK is a credential handed to every student who
 * installs it, so this must stay a plain HTTPS base URL and nothing more.
 */
export const API_BASE = 'https://dashboard.brave.niatindia.com';

/** Custom scheme the SSO returns to. Must match `namespace` in build.gradle. */
export const APP_SCHEME = 'in.niatindia.brave';
export const REDIRECT_URI = `${APP_SCHEME}://auth`;

/**
 * Public NIAT Forms SSO entry point.
 *
 * This is intentionally not `/api/login`: that route starts the dashboard's
 * Replit OIDC flow and always returns to `/api/callback`. The Forms endpoint
 * accepts our native `redirect_uri` and returns the one-time `auth_token` to
 * the app's custom scheme.
 *
 * Keep this value aligned with the dashboard's shared
 * `VITE_FORMS_LOGIN_URL` build variable.
 */
export const FORMS_LOGIN_URL = 'https://forms.ccbp.in/mid/brave-dashboard';

export function buildFormsLoginUrl(): string {
  const url = new URL(FORMS_LOGIN_URL);
  url.searchParams.set('redirect_uri', REDIRECT_URI);
  return url.toString();
}
