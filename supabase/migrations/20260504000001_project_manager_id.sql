-- =============================================================================
-- projects.project_manager_id: primary PM assignment column
-- =============================================================================
-- Pass 4B introduces a real foreign-key column for the project's primary
-- Project Manager so admin intake can persist a stable user ID alongside the
-- legacy rhino_pm display name. Existing PM visibility (via
-- project_manager_assignments) is preserved; the new column is informational
-- and will be used for additional defensive filtering.
--
-- Purely additive. No existing rows are modified. No RLS policies are changed.
-- =============================================================================

ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS project_manager_id uuid
    REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_projects_project_manager
  ON projects (project_manager_id);
