---
name: Canonical season URLs
description: Source-of-truth and compatibility rules for season-aware authenticated navigation.
---

Authenticated browser URLs must include the role and public season slug. The URL-selected slug wins over stored or server defaults and must be resolved through the season catalogue to obtain the internal ID; never use internal-ID ordering to infer a programme version.

The canonical student home is `/<role>/season/<slug>/dashboard`; the page tree may still render that screen from its legacy `/` route internally. Bare student season roots are compatibility inputs and must replace-redirect to `/dashboard`.

**Why:** Internal IDs are storage details and may differ across environments, while links and bookmarks must remain stable and explicit about the viewed season.

**How to apply:** Preserve role, page suffix, query string, and hash when switching seasons. Keep old unprefixed links as redirects/compatibility inputs, but emit canonical URLs and block page rendering until the API season header and cached data have synchronized.