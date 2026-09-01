> ## ⚠️ NOT THE SHIPPING APP — DO NOT BUILD THIS
>
> The BRAVE Android app that students install is built from
> **`artifacts/brave-dashboard/android`** (`pnpm --filter @workspace/brave-dashboard
> run apk:release`). That is where `versionCode`/`versionName`, the release
> signing config and the Capacitor config that reached 1.0.5 all live.
>
> This directory is a second, abandoned Capacitor project on an older major
> version, pointed at a different `server.url`. Nothing builds it and nothing
> imports from it; `pnpm-workspace.yaml` excludes it from the workspace.
>
> It is dangerous precisely because it looks canonical — it is named
> `brave-mobile`, it has its own README describing an auth flow, and its
> `package.json` version (1.0.4) trails the real one closely enough to look
> current. Building it produces an APK that signs nobody in.
>
> Keep it only as history. Read `artifacts/brave-dashboard/capacitor.config.ts`
> for how sign-in actually works.

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