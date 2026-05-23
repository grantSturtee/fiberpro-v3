-- =============================================================================
-- project_updates: add status column + make body optional
-- =============================================================================
-- Status is now the primary data point on an update record.
-- Message (body) is supplementary — optional free text.
-- Existing rows get status = NULL (displayed as legacy updates, body shown as-is).
-- =============================================================================

ALTER TABLE project_updates
  ADD COLUMN status text;

ALTER TABLE project_updates
  ADD CONSTRAINT project_updates_status_check
  CHECK (status IS NULL OR status IN (
    'not_started',
    'in_design',
    'submitted_for_review',
    'revisions_required',
    'approved',
    'package_generated',
    'submitted'
  ));

-- Make body optional: status-only updates carry no message.
ALTER TABLE project_updates
  ALTER COLUMN body DROP NOT NULL;

ALTER TABLE project_updates
  DROP CONSTRAINT IF EXISTS project_updates_body_check;

ALTER TABLE project_updates
  ADD CONSTRAINT project_updates_body_check
  CHECK (body IS NULL OR char_length(body) BETWEEN 1 AND 2000);
