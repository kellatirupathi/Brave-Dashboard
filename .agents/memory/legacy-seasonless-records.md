---
name: Legacy seasonless records
description: Compatibility rule for records created before first-class season identity existed.
---

Legacy records with a null season identity belong to the Season 1 archive at read time. Never interpret null as matching every season, and do not bulk-rewrite historical rows solely to add season identity.

**Why:** A null-as-wildcard rule lets old report or reminder state leak into later seasons, while rewriting live historical rows adds avoidable production risk. Read-time Season 1 classification preserves compatibility and isolates new seasons.

**How to apply:** New records must write their season explicitly. Queries may include legacy null rows only when resolving Season 1; Season 2 and later require an exact season match. Historical links whose related week was removed remain discoverable under Season 1.