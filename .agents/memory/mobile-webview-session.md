---
name: Mobile WebView session
description: The confirmed architecture for BRAVE Android login and student navigation.
---

Build the BRAVE mobile artifact with Capacitor, not React Native. Start its persistent WebView at the NIAT Forms SSO URL and keep all Forms redirects and authenticated student pages in that WebView.

**Why:** The user explicitly confirmed that the desired product is the prior Capacitor-style web wrapper using Forms SSO. Native session extraction and alternate OIDC login flows do not match that requirement and repeatedly introduced redirect handoff failures.

**How to apply:** Preserve one WebView from Forms OTP through the dashboard. Do not add a native callback, React Native auth layer, Google Sign-In, or Replit OIDC. Permit only CCBP/Forms and BRAVE dashboard navigation.