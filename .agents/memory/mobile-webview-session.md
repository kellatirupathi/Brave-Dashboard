---
name: Mobile WebView session
description: Why the BRAVE Android app keeps login and authenticated dashboard navigation in one WebView.
---

Start the persistent WebView at the dashboard's server-owned `/api/login` route, then keep Replit OIDC and all authenticated BRAVE pages inside that same WebView. Do not use the Forms OTP URL or make successful login depend on copying an HTTP-only session cookie into React Native.

**Why:** The previously working Capacitor flow used `/api/login`, whose `/api/callback` creates the real dashboard session. Physical Android testing showed the Forms OTP path could stall and has no completed app callback contract; native cookie recovery also failed repeatedly.

**How to apply:** Preserve one WebView across `/api/login` → OIDC → `/api/callback` → dashboard. Loading overlays may cover only the initial document load, never later OIDC navigation or in-page submissions.