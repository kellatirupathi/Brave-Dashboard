---
name: Membership approval gate
description: Invariants for the admin approval gate over team membership changes.
---

# Membership approval gate

ALL team membership mutations require admin approval and flow through the
`membership_requests` table. The gated flows: join-by-code, accept invitation,
leader approving a join-request, member leaving, and leader removing a member.
Team creation and ADMIN direct add/remove stay instant.

## Rules to preserve

- **Atomic claim on decision.** Admin approve/reject must claim the pending row
  with a conditional `UPDATE ... WHERE id=? AND status='pending' RETURNING`
  before doing any side effects. On approve, if `applyMembershipRequest` then
  fails an invariant, revert the row back to `pending`.
  **Why:** approve runs membership change + email + notif + audit; two
  concurrent approvals without an atomic claim double-apply those side effects
  (removal flows are not protected by a unique constraint).

- **No instant-mutation bypass paths.** The legacy
  `POST /leave-requests/:id/approve` in `team-flow.ts` used to delete membership
  directly; it is intentionally disabled (returns 409) so it cannot bypass the
  gate. If you add/restore any membership-mutating endpoint, route it through a
  `membership_request`, never mutate `team_members` directly outside admin
  direct add/remove.

- **Re-check invariants at approval time, not request time.** one-team,
  capacity, and leader-transfer rules are validated inside
  `applyMembershipRequest` (under team-row lock) because state can change between
  request and approval.

**How to apply:** When touching any team membership endpoint, confirm it creates
a pending request (HTTP 202) rather than applying instantly, and that the only
code performing the real change is `applyMembershipRequest`.
