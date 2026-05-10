-- Adds an admin-controlled toggle that hides the Resources sidebar entry
-- (and the /resources-library route) from students when set to FALSE.
-- Admin's own /admin/resources page is always reachable regardless.
-- Defaults to TRUE so existing students keep access on upgrade.
-- Idempotent: safe to re-run.

ALTER TABLE programme_config
  ADD COLUMN IF NOT EXISTS resources_enabled_for_students BOOLEAN NOT NULL DEFAULT TRUE;
