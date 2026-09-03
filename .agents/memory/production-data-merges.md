---
name: Production data merges
description: Safety rules for reconciling records copied between the project's database connections.
---

For cross-database imports, first verify the actual source and target connections and compare records by their natural business keys. Never assume matching serial IDs represent the same record; when an ID collides, preserve the production row and insert the missing source record with a new production ID.

**Why:** The production read-only view can lag the direct application database, and cloned databases can allocate the same serial ID to different records. A primary-key-only merge can therefore skip valid records or overwrite unrelated production data.

**How to apply:** Use a dry run, insert only missing business records inside one transaction with conflict protection, advance affected sequences, and verify that every source business key exists in production before declaring completion.