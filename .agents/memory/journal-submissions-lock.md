---
name: Journal submissions lock
description: Distinguishes the operational Weekly Journal lock from archive write permissions.
---

The Weekly Journal submissions lock is a season-scoped operational control, separate from a season archive's `allowJournalWrites` capability. When enabled, students can read previous journals but cannot create, edit, or delete entries; admins and coordinators retain correction access.

**Why:** Archive permissions answer whether a closed season may accept writes at all, while programme staff also need to pause journal submissions independently in either the live or archived season. Combining them would make one toggle silently alter the meaning of the other.

**How to apply:** Enforce both controls server-side on every student journal mutation. In the student UI, any denial makes the page view-only; show the operational lock's configured message when that lock is the cause. Do not apply the operational lock to staff corrections.