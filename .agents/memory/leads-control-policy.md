---
name: Leads control policy
description: Durable authorization and data-protection rules for Leads, projects, phases, payments, interactions, and review submission.
---

Leads permissions are configured per season for Add, Edit, and Delete across Leads, Projects, Phases, Payments, and Interactions. Submit for review is independent. Student writes are leader-only; ordinary team members are read-only. Only admins bypass these controls; coordinators do not.

The student-facing Leads score is completion progress, not trust or an award tier: five equally weighted items (interaction, work, proof, phases, payment) produce a 0–100% score. Interactions add progress but never gate “Client said yes.”

The season's master Leads lock blocks every student mutation, including stage changes and Submit for review, and displays the configured student-facing message.

Submitted/frozen projects protect their project, phase, and payment data. Client-confirmed payments cannot be edited or deleted. A phase with recorded payments cannot be deleted.

**Why:** UI-only hiding is not sufficient protection, team leadership owns the pipeline record, and later review or client confirmation must preserve the exact evidence that was assessed. Progress should encourage completion without blocking genuine client conversion.

**How to apply:** Every new Leads mutation must enforce team leadership and the matching season control on the server. Apply the master lock, section action, and record-state safeguards. Keep UI visibility aligned, and never restore interaction-count/time gates or Bronze/Silver/Gold trust tiers.