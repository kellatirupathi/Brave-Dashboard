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
