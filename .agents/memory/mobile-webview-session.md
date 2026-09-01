---
name: Mobile WebView session
description: The confirmed architecture for BRAVE Android login and student navigation.
---

Build the BRAVE mobile artifact with Capacitor, not React Native. Keep the main WebView on the canonical BRAVE dashboard origin. Open NIAT Forms SSO in the Capacitor in-app browser and return its one-time token through the Android app deep link; exchange that token from the dashboard WebView so its host-scoped session cookie is created in the correct cookie jar.

**Why:** Physical-device testing proved that making Forms the permanent Capacitor `server.url` turns white after OTP and never reliably establishes the dashboard session. The supported in-app Forms flow keeps the student inside BRAVE while preserving native APIs and dashboard cookies.

**How to apply:** Package the dashboard artifact's Capacitor project. Keep the Forms in-app-browser plugin, custom-scheme Android intent, callback listener, and dashboard-host `server.url` together. Do not use React Native, Google Sign-In, Replit OIDC, or direct Forms `server.url`.