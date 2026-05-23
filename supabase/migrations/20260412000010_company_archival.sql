-- Company archival: soft-delete model for companies.
-- archived_at IS NULL  → active
-- archived_at NOT NULL → archived (hidden from active workflows)

ALTER TABLE companies
  ADD COLUMN archived_at  timestamptz DEFAULT NULL,
  ADD COLUMN archived_by  uuid        DEFAULT NULL
    REFERENCES auth.users(id) ON DELETE SET NULL;

-- Partial index makes active-company queries fast.
-- "WHERE archived_at IS NULL" filters benefit from this automatically.
CREATE INDEX idx_companies_active
  ON companies(archived_at)
  WHERE archived_at IS NULL;
