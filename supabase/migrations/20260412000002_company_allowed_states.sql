-- Add optional state restriction list to companies.
-- NULL or empty array = unrestricted (default for all existing companies).
-- A non-empty array limits company-side users to creating projects only in those states.

ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS allowed_states text[] DEFAULT NULL;

COMMENT ON COLUMN companies.allowed_states IS
  'Optional list of US state abbreviations (e.g. {"NJ","NY"}) this company is '
  'allowed to create projects in. NULL or empty array means unrestricted.';
