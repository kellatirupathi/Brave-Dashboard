---
name: Student product tours
description: Persistence and platform behavior for first-run student walkthroughs.
---

Treat the student mobile and desktop walkthroughs as separate per-user experiences. Each platform is eligible once; either Finish or Close is terminal and must persist so the same platform tour does not appear again.

**Why:** Mobile and desktop navigation differ, and the user explicitly requires both completing and dismissing a tour to permanently suppress it for that student.

**How to apply:** Store state by user and platform. Keep mobile steps focused on the app header/bottom navigation and compact pages; keep desktop steps focused on the sidebar and desktop dashboard.