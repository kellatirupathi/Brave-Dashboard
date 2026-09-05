---
name: Staff season default
description: How the default viewed season differs between students and staff.
---

The student-facing live season and the default season shown to admins and coordinators are independent settings. An explicit header, query parameter, or remembered staff selection takes priority over the configured staff default.

**Why:** Super admins need to move staff reporting and review work between programme versions without changing which season students are actively using.

**How to apply:** Keep student write routing tied to the live season. Use the staff default only as the fallback for admins and coordinators who have not selected a season themselves.

A valid per-student season override is authoritative for that student and takes priority over URL/query values, the `x-brave-season` header, remembered session state, and the global live season. Staff selection precedence remains unchanged.

**Why:** Client season state can be stale. Allowing it to outrank a pin lets a student remain in or navigate back to a different season, defeating the promise that pinned students see only their assigned season.

**How to apply:** Resolve a student override before inspecting request-selected season state. Only unpinned students fall through to existing request/global behavior; admins and coordinators keep explicit season selection above their staff default.