---
name: Cron locking
description: How cron jobs are guarded against overlapping runs across multiple instances
---

# Cron run guarding

Cron endpoints must NOT use in-process module-level booleans (e.g. the old
`reelsRunInFlight` / `reminderRunInFlight` / `backupInFlight`) to prevent
overlapping runs. On an autoscale deploy there can be >1 instance, so a boolean
in one process cannot stop a second process (or a cron-job.org retry routed to
another instance) from starting a concurrent run.

Use `tryAcquireCronLock(name)` (`artifacts/api-server/src/lib/cron-lock.ts`),
which takes a Postgres `pg_try_advisory_lock` on a dedicated pooled connection —
global to the DB, so it coordinates across every instance. Returns a handle with
`release()` (idempotent, also frees the connection) or `null` if held elsewhere.

**Release pattern depends on the handler shape:**
- Handlers that respond early then keep working in the background (reels,
  reminders, backup): release in a `.finally()` on the background promise.
- Handlers that do ALL awaited work before responding (journal-escalation):
  release in `try { ... } finally { await lock.release(); }`. Do NOT release on
  `res.once("finish"/"close")` — `close` fires on client/proxy disconnect before
  the work finishes, freeing the lock early and re-allowing concurrent runs (and
  leaking the held DB connection).

**Why:** advisory locks are connection-scoped, so a leaked lock also leaks a
pooled connection; lock lifetime must track execution, not the client socket.

**Limit:** the lock cannot make partially-completed side effects (emails sent
before the "already sent" log row is written) crash-safe — that needs separate
idempotency.
