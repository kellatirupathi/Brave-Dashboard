-- Track how each user was provisioned: NIAT roster import, manual admin
-- creation, CSV import, or auto-created on first Forms SSO login.
-- Idempotent: safe to re-run.

DO $$ BEGIN
  CREATE TYPE provisioned_via AS ENUM ('roster', 'csv_import', 'manual', 'auto_forms_sso');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS provisioned_via provisioned_via NOT NULL DEFAULT 'manual';
