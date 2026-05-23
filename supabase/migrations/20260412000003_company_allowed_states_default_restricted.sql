-- Semantics change: allowed_states is now a strict allowlist.
-- Previously: NULL or empty array = unrestricted (all states allowed).
-- New:        NULL or empty array = NO states allowed (fully restricted).
--
-- Safety backfill: any company that currently has NULL is unrestricted under
-- the old model. Set it to all 50 states explicitly so those companies retain
-- full access under the new model.
--
-- New companies created after this migration start with NULL (= restricted) and
-- must be explicitly configured by an admin before company users can submit projects.

UPDATE companies
SET allowed_states = ARRAY[
  'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA',
  'KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ',
  'NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT',
  'VA','WA','WV','WI','WY'
]::text[]
WHERE allowed_states IS NULL
   OR cardinality(allowed_states) = 0;

-- Update column comment to reflect new semantics
COMMENT ON COLUMN companies.allowed_states IS
  'Explicit allowlist of US state abbreviations (e.g. {NJ,NY}) this company is '
  'permitted to create projects in. NULL or empty array means NO states are '
  'allowed — the company is fully restricted. Must be explicitly configured.';
