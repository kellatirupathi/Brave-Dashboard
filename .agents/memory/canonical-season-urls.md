---
name: Canonical season URLs
description: Source-of-truth and compatibility rules for season-aware authenticated navigation.
---

Authenticated browser URLs must include the role and public season slug. The URL-selected slug wins over stored or server defaults and must be resolved through the season catalogue to obtain the internal ID; never use internal-ID ordering to infer a programme version.

The canonical student home is `/<role>/season/<slug>/dashboard`; the page tree may still render that screen from its legacy `/` route internally. Bare student season roots are compatibility inputs and must replace-redirect to `/dashboard`.

When canonical and legacy URLs map to the same internal route, canonical gates must subscribe to the real browser URL; an adapted router path alone may not re-render. Auth/season redirects must keep the BRAVE Loader mounted.

Students resolve the admin-active season before dashboard queries. Ignore stale stored/session season choices for student first-load routing, and install the API season getter before child query effects run.

**Why:** Internal IDs differ across environments, and a canonical redirect from `/` to the student dashboard can leave the router's adapted path unchanged. Without a raw-URL subscription, the redirect renders null until refresh.

**How to apply:** Preserve role, suffix, query, and hash. Keep old links as compatibility redirects, emit canonical URLs, reject inactive student-season URLs to the active dashboard, and block rendering until the API season header and cache synchronize.