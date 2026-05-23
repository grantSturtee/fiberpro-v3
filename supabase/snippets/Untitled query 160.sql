ALTER TABLE companies
  ADD COLUMN archived_at timestamptz DEFAULT NULL,
  ADD COLUMN archived_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX idx_companies_active
ON companies(archived_at)
WHERE archived_at IS NULL;