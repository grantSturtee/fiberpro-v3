-- ── Project Requirement Override Columns ──────────────────────────────────────
-- Per-project tri-state overrides for authority requirement flags.
--
-- NULL  = inherit from the linked authority_profile (default — no project override)
-- TRUE  = forced ON for this project regardless of authority_profile setting
-- FALSE = forced OFF for this project regardless of authority_profile setting
--
-- PE requirement is handled by the pre-existing pe_required column (nullable boolean,
-- same tri-state semantics). This migration adds the same pattern for the remaining
-- five requirement flags. No rename of pe_required in this migration.

ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS req_application_override       boolean,
  ADD COLUMN IF NOT EXISTS req_certification_override     boolean,
  ADD COLUMN IF NOT EXISTS req_coi_override               boolean,
  ADD COLUMN IF NOT EXISTS req_hard_copies_override       boolean,
  ADD COLUMN IF NOT EXISTS req_certified_check_override   boolean,
  ADD COLUMN IF NOT EXISTS req_notification_only_override boolean;

COMMENT ON COLUMN projects.req_application_override IS
  'NULL = inherit authority default; TRUE = force required; FALSE = force suppressed';
COMMENT ON COLUMN projects.req_certification_override IS
  'NULL = inherit authority default; TRUE = force required; FALSE = force suppressed';
COMMENT ON COLUMN projects.req_coi_override IS
  'NULL = inherit authority default; TRUE = force required; FALSE = force suppressed';
COMMENT ON COLUMN projects.req_hard_copies_override IS
  'NULL = inherit authority default; TRUE = force required; FALSE = force suppressed';
COMMENT ON COLUMN projects.req_certified_check_override IS
  'NULL = inherit authority default; TRUE = force required; FALSE = force suppressed';
COMMENT ON COLUMN projects.req_notification_only_override IS
  'NULL = inherit authority default; TRUE = force required; FALSE = force suppressed';
