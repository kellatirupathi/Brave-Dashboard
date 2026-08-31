# BRAVE — student mobile app

A **React Native** application for students. Not a website in a native shell:
every screen is built from native views (`View`, `Text`, `FlatList`), navigated
by real Android fragments, and styled with `StyleSheet` rather than CSS.

It shares exactly two things with `artifacts/brave-dashboard`: the **HTTP API**
it talks to, and the **brand palette** it paints with. No DOM, no Tailwind, no
shadcn/ui.

## Why this exists

The previous app was Capacitor — the React web app inside a WebView. It worked,
but it was mobile-responsive web UI, and it had two defects that no amount of
CSS could fix:

| Symptom | Cause |
| --- | --- |
| Asked "Sign in with NIAT" on **every** launch | Nothing was persisted. The session lived in a WebView cookie, which Android discards when the process is killed. |
| Sign-in appeared inside a Chrome tab with a URL bar | The in-app browser plugin failed to load and the code fell back to a Custom Tab. |

The first is fixed here (see **Authentication**). The second is discussed under
**The browser during sign-in** — it is a platform rule, not a framework choice.

## Layout

```
src/
  theme/tokens.ts        colours, spacing, type scale, elevation
  lib/
    config.ts            API base URL and the deep-link scheme
    session.ts           session id in the Android Keystore
    api.ts               fetch wrapper; attaches the session cookie by hand
    auth.tsx             SSO flow + silent restore on launch
    queries.ts           typed hooks, one per endpoint
    format.ts            ₹ formatting (Indian digit grouping), dates
  components/
    ui.tsx               Card, Button, Badge, Skeleton, EmptyState, type scale
    Screen.tsx           top app bar, scrolling body, pull-to-refresh
  navigation/
    RootNavigator.tsx    native stack; picks login vs app
    TabNavigator.tsx     hand-drawn Material 3 bottom bar
  screens/               one file per screen
```

## Authentication

The session id — not the SSO token — is what gets stored. The token is
**single use**: `POST /api/auth/validate-token` calls `validateAndConsumeToken`,
so replaying a saved one always fails. The server's answer to that call carries
`Set-Cookie: sid=…` with a **7-day** lifetime, and that is the durable thing.

```
first launch    SSO → auth_token → validate-token → sid → Keystore
every launch    Keystore → sid → GET /api/auth/user → Dashboard
```

`sid` is a bearer credential, so it lives in `react-native-keychain`
(hardware-backed Keystore), never in AsyncStorage.

### The browser during sign-in

Sign-in opens a **Chrome Custom Tab**. This is not avoidable and not a React
Native shortcoming: Android forbids an app from rendering a third party's login
inside its own views, because that is exactly how a malicious app would draw a
fake NIAT login and harvest passwords. Every framework — Capacitor, React
Native, Flutter, fully native Kotlin — uses the same Custom Tab.

What changed is the **frequency**. It happens once a week at most instead of
once per launch.

> **External dependency:** the Forms SSO team must allow
> `in.niatindia.brave://auth` as a redirect URI. Until they do, the tab opens,
> the student signs in, and nothing comes back — which is the behaviour seen in
> the Capacitor build. No app-side change can work around this.

## Building

```bash
npm install
cd android && ./gradlew assembleDebug
```

Output lands in `android/app/build/outputs/apk/debug/`.

APKs are **split per ABI** (`splits.abi` in `android/app/build.gradle`), so each
device downloads only its own native libraries:

| File | For |
| --- | --- |
| `app-arm64-v8a-debug.apk` | virtually every phone since ~2016 — **hand this out** |
| `app-armeabi-v7a-debug.apk` | older 32-bit devices |
| `app-x86_64-debug.apk` | emulators |
| `app-universal-debug.apk` | catch-all when the device is unknown |

A universal APK carries all four copies of the native layer and is roughly twice
the size for no benefit on a real device.

### Release builds

`assembleRelease` needs a signing keystore. The debug APK is signed with
Android's shared debug key: fine for testing, but it triggers an "unsafe app"
warning on install and cannot be updated in place by a differently-signed build
later. Generate a keystore, keep it somewhere durable, and wire it into
`android/app/build.gradle` before students install anything.

## Known gaps

Five destinations open the website rather than a native screen — GRIT Miles,
Demo Day, Resources, Guidebook, and the lead-capture form. They are honest
placeholders with an "Open in browser" button, not dead links. Demo Day and lead
capture both need file upload, which is the next piece of native work.

## Notes for whoever picks this up

- **Not in the pnpm workspace.** Metro cannot resolve pnpm's symlinked
  `node_modules`, so this package uses npm and is excluded in
  `pnpm-workspace.yaml`.
- **No database access.** The app speaks only to the Express API. An APK can be
  decompiled in minutes; a connection string inside one is a connection string
  handed to every student who installs it.
- **`networkTimeout` in `gradle-wrapper.properties` is raised to 180s** from the
  10s default, which is too short to fetch the Gradle distribution on a slow or
  proxied link.
