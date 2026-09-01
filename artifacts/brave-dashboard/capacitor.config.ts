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

    // ── WHY THIS LIST EXISTS ────────────────────────────────────────────────
    //
    // Sign-in leaves this origin: the student is sent to the NIAT Forms SSO on
    // `forms.ccbp.in` to enter a mobile number and an OTP, and Forms then
    // redirects back here with `?auth_token=…`.
    //
    // Without these hosts listed, Capacitor treats that first hop as an
    // EXTERNAL link and hands it to Chrome. The student finishes the OTP in a
    // browser, the `?auth_token=` redirect lands in that browser's copy of the
    // dashboard, and the app behind it never hears a thing — it sits on the
    // sign-in screen forever. That is exactly the bug this list fixes.
    //
    // With them listed, the whole round trip stays in the app's own WebView.
    // The token comes back to the same page that asked for it, `useAuth`
    // exchanges it for a session cookie, and the student lands on the
    // dashboard — no browser, no deep link, no token hand-off.
    //
    // ── THE OBJECTION THIS ANSWERS ──────────────────────────────────────────
    //
    // An earlier version of lib/native-auth.ts refused to use allowNavigation,
    // on the grounds that Capacitor would then proxy the SSO page — losing
    // native platform detection and dropping its `Set-Cookie` headers. That
    // was true of older Capacitor. It is NOT true here, and the difference is
    // worth writing down because the claim is otherwise very plausible.
    //
    // Bridge.loadWebView() (capacitor-android 8.5.0) injects the bridge with
    // `WebViewCompat.addDocumentStartJavaScript(..., singleton(appUrl))` when
    // WebViewFeature.DOCUMENT_START_SCRIPT is supported — and then sets its
    // JSInjector to null. A null injector makes WebViewLocalServer's
    // handleProxyRequest() return immediately, so NOTHING on this list is ever
    // proxied. minSdk here is 26 and the feature needs WebView 83+, which
    // updates through Play independently of the OS, so this is the path every
    // real device takes.
    //
    // Two consequences, both wanted:
    //   - The bridge is scoped to `server.url` alone. The third-party SSO page
    //     never gets native API access (no Camera, no Geolocation), and coming
    //     back to the dashboard re-injects it, so isNativeApp() stays true.
    //   - Navigation is a plain WebView load. Cookies, redirects and the OTP
    //     POST behave exactly as they do in a browser.
    allowNavigation: [
      "forms.ccbp.in",
      "*.ccbp.in",
      "dashboard.brave.niatindia.com",
      "*.niatindia.com",
      // Forms' OTP step embeds Google reCAPTCHA. Capacitor's
      // shouldOverrideUrlLoading does not check isForMainFrame, so without
      // these an iframe load would be flung out to Chrome and the student
      // could never complete the challenge.
      "www.google.com",
      "www.gstatic.com",
    ],
  },
};

export default config;
