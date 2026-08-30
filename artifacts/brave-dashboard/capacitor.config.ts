import type { CapacitorConfig } from "@capacitor/cli";

/**
 * Android APK shell (additive, isolated).
 *
 * Wraps the SAME `vite build` output the PWA uses — no second codebase, no
 * duplicated screens. Deleting this file and the `android/` folder removes the
 * APK entirely and leaves the web app untouched.
 *
 * ── THE ONE DECISION THAT MATTERS ────────────────────────────────────────────
 *
 * `server.url` points the shell at the live dashboard instead of serving the
 * bundled copy of `dist/public`. That is deliberate:
 *
 *   - WITHOUT it, every fix means rebuilding the APK, redistributing it over
 *     WhatsApp, and asking 7,500 students to reinstall. For a 3-month
 *     programme under active development that is untenable.
 *   - WITH it, the APK is a thin shell that always shows the current
 *     deployment. Students install once; updates arrive like the PWA's.
 *
 * The bundled `webDir` copy still ships, so the app has something to render if
 * the shell ever falls back to local assets.
 *
 * The trade is that the APK needs connectivity for its first paint. That is
 * acceptable here because the offline story lives in the service worker, which
 * the Android WebView honours for the origin below.
 *
 * To build a fully-offline APK instead, delete the `server` block and rebuild:
 * everything else works unchanged.
 */
const config: CapacitorConfig = {
  appId: "in.niatindia.brave",
  appName: "BRAVE",
  webDir: "dist/public",
  android: {
    // Matches the light/dark grounds in index.css so there is no white flash
    // between the splash screen and first paint.
    backgroundColor: "#C0392B",
  },
  server: {
    url: "https://dashboard.brave.niatindia.com",
    // The dashboard is HTTPS-only; clear-text would silently allow a
    // downgrade on a hostile network.
    cleartext: false,
    androidScheme: "https",
  },
};

export default config;
