---
name: Mobile WebView session
description: Why the BRAVE Android app keeps login and authenticated dashboard navigation in one WebView.
---

Keep NIAT Forms login and all authenticated BRAVE pages inside the same persistent WebView. Do not make successful login depend on copying the dashboard's HTTP-only session cookie into React Native.

**Why:** Physical Android testing showed that OTP login and the dashboard redirect succeeded inside the WebView, but the native cookie manager repeatedly could not recover the secure session. Keeping navigation in the authenticated WebView removes that unreliable cross-runtime handoff.

**How to apply:** Authentication changes must preserve the same WebView across the Forms-to-dashboard redirect. Native session/API screens should not become the required post-login path unless the server provides an explicit, verified native token callback contract.