---
name: Non-unique email identity
description: Why user/roster scoping must key on userId/formsUserId, never email.
---

# Email is NOT a unique identity in this app

`users.email` and `roster.email` are both nullable/non-unique columns — two
distinct accounts can share an email. The app-wide identity model
(`buildAuthUser` in api-server `routes/auth.ts`) deliberately resolves roster
membership by `roster.email == user.email OR roster.studentId == formsUserId`.

**Rule:** any *user-scoped* read/dedupe (e.g. "fetch the caller's own row")
must key strictly on `userId` (or `formsUserId`), never on `email`. Matching a
user-scoped query by email can cross-link two accounts that share an address —
one user reads another's row (PII leak) and gets blocked from creating their own.

**Why:** during the New-User Access Request gate work, an `OR(userId, email)`
lookup in the student `/access-requests/me` + submit-dedupe endpoints was flagged
as a cross-account data-isolation bug. Fix was to match by `userId` only.

**How to apply:**
- User-scoped queries: `WHERE userId = caller`. Do not add an email fallback.
- Roster/whitelist *membership* checks intentionally use the email-or-formsUserId
  match to stay consistent with `buildAuthUser`; mirror that logic exactly when
  you need a fresh roster check (do NOT "harden" it to diverge, or the gate will
  disagree with the rest of the app).
- Admin reject re-freeze must un-whitelist by `roster.studentId` (unique), never
  by `roster.email` (non-unique → revokes unrelated students).
