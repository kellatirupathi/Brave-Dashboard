# BRAVE Student Mobile

Android wrapper for the BRAVE student web application, built with Capacitor.

## Authentication and navigation

- The native WebView starts at `https://forms.ccbp.in/mid/brave-dashboard`.
- NIAT Forms SSO, its `ccbp.in` redirects, and the BRAVE dashboard remain in the
  same Capacitor WebView.
- The app does not use React Native, Replit OIDC, Google Sign-In, a native token
  callback, or native session-cookie extraction.
- HTTPS is required. Cleartext traffic and mixed-content loading are disabled.

## Development

```bash
pnpm install
pnpm run build
pnpm run typecheck
pnpm exec cap sync android
```

## Android release

The package ID is `in.niatindia.brave`. Release builds use the existing BRAVE
production keystore and require these environment values:

- `BRAVE_ANDROID_KEYSTORE_PASSWORD`
- `BRAVE_ANDROID_KEY_ALIAS`
- `BRAVE_ANDROID_KEY_PASSWORD`

Build with Java 21:

```bash
cd android
./gradlew assembleRelease
```

The signed APK is emitted at `android/app/build/outputs/apk/release/app-release.apk`.