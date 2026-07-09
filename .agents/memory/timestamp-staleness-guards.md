---
name: Timestamp staleness guards
description: Never compare Postgres timestamptz to a JS Date with strict equality in guarded UPDATEs
---

Rule: guarded UPDATEs of the form `WHERE id = X AND submitted_at = <snapshot Date>` silently fail for rows whose timestamp was set by `defaultNow()` (microsecond precision) because a JS Date only carries milliseconds.

**Why:** The merged journal-AI writer used a strict `eq(submittedAt, snapshot)` guard; in prod every catch-up sweep ran 200 paid Gemini calls whose results were all discarded as "stale", and the rows stayed unanalysed so every boot re-burned 200 calls (major API-cost leak).

**How to apply:** For optimistic staleness guards against timestamptz columns, compare within 1ms: `sql\`abs(extract(epoch from col) - ${snapshot.getTime()/1000}) < 0.001\``. Watch `failed=N total=N` sweep logs — 100% failure means the guard, not the AI, is broken.
