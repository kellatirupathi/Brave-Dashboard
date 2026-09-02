---
name: Access approval provisioning
description: The invariant connecting access-request decisions to usable student roster access.
---

Every admin path that approves a new-user access request must also provision or re-whitelist the bound student's roster record in the same transaction. Treat provisioning as idempotent so historical approved-but-unprovisioned requests can be safely repaired.

**Why:** The student gate displays its approved state from the request status but only releases the student when authentication finds a matching whitelisted roster record. Updating only the status creates an endless “Access Approved” spinner.

**How to apply:** Reuse the shared approval provisioning operation from every current or future admin surface. Keep a safe repair path for approved requests whose roster access is missing.