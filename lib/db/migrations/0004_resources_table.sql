-- Resources: admin-curated projects/solutions list shown to students (read-only)
-- and on the public landing page (preview). Admins have full CRUD via /admin/resources.
-- Each row is a Google Doc link with a title + 2-line description.
-- Idempotent: safe to re-run.

CREATE TABLE IF NOT EXISTS resources (
  id            SERIAL PRIMARY KEY,
  title         TEXT NOT NULL,
  description   TEXT NOT NULL,
  doc_url       TEXT NOT NULL,
  created_by_id TEXT NOT NULL,
  created_at    TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS resources_created_at_idx ON resources (created_at);
