---
name: Leads control policy
description: Durable authorization and data-protection rules for Leads, projects, phases, payments, interactions, and review submission.
---

Leads permissions are configured per season for Add, Edit, and Delete across Leads, Projects, Phases, Payments, and Interactions. Submit for review is independent. Only admins bypass these controls; coordinators do not.

The season's master Leads lock blocks every student mutation, including stage changes and Submit for review, and displays the configured student-facing message.

Submitted/frozen projects protect their project, phase, and payment data. Client-confirmed payments cannot be edited or deleted. A phase with recorded payments cannot be deleted.

**Why:** UI-only hiding is not sufficient protection, and later review or client confirmation must preserve the exact evidence that was assessed.

**How to apply:** Every new Leads mutation must enforce the matching season control on the server. Apply the master lock first, then the section action, then record-state safeguards. Keep UI visibility aligned with the same control state.