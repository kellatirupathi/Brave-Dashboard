---
name: Email kill switches
description: How per-category email toggles work and the rules for adding new email call sites.
---

Rule: every transactional email must be tagged with a `category` (one of EMAIL_CATEGORIES in the api-server's email-controls lib) when calling `sendEmail()`. Untagged emails bypass the super-admin kill switches and always send (only the admin test email should do that).

**Why:** Super admins control per-category email sending from Config → Notifications & Reminders; enforcement is centralized inside `sendEmail()` (fail-open: read errors never block sending). Stored as a jsonb map on programme_config where a missing key = enabled.

**How to apply:** When adding a new email flow, pick or add a category, tag the call site, and add a matching toggle entry in the dashboard's reminder-settings card. Controls are cached ~30s server-side; the PATCH endpoint invalidates the cache. Only super admins may change them (server-enforced).
