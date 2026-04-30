-- Auto-approve student team registrations. Eliminates the "pending" stage:
-- teams are now created with status='active' and immediately receive their
-- "Team Registered" milestone. This migration:
--   1. Flips the DB-level default for teams.status to 'active'.
--   2. Promotes any existing pending teams to active.
--   3. Backfills the "Team Registered" milestone for teams that never got
--      one (e.g. legacy pending teams or teams created via direct admin
--      paths that bypassed the approve flow).
-- Idempotent: safe to re-run.

ALTER TABLE teams ALTER COLUMN status SET DEFAULT 'active';

UPDATE teams SET status = 'active' WHERE status = 'pending';

INSERT INTO milestones (team_id, type, title, description, date, is_pinned)
SELECT t.id, 'auto', 'Team Registered', 'Your team is now active!', NOW(), false
FROM teams t
WHERE t.status = 'active'
  AND NOT EXISTS (
    SELECT 1 FROM milestones m
    WHERE m.team_id = t.id AND m.title = 'Team Registered'
  );
