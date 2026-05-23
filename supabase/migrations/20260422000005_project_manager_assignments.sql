-- =============================================================================
-- project_manager_assignments: link project_managers to specific projects
-- =============================================================================
-- company_admin users assign project_managers to individual projects.
-- project_managers can only see projects they are explicitly assigned to.
-- =============================================================================

CREATE TABLE IF NOT EXISTS project_manager_assignments (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  uuid        NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id     uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  assigned_by uuid        REFERENCES auth.users(id),
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, user_id)
);

ALTER TABLE project_manager_assignments ENABLE ROW LEVEL SECURITY;

-- Admins can do everything
CREATE POLICY "pm_assignments: admin all"
  ON project_manager_assignments FOR ALL
  USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

-- company_admin can manage assignments within their own company
CREATE POLICY "pm_assignments: company_admin manage own company"
  ON project_manager_assignments FOR ALL
  USING (
    (auth.jwt() -> 'app_metadata' ->> 'role') = 'company_admin'
    AND EXISTS (
      SELECT 1 FROM projects p
      JOIN company_memberships cm ON cm.company_id = p.company_id
      WHERE p.id = project_manager_assignments.project_id
        AND cm.user_id = auth.uid()
    )
  );

-- project_managers can read their own assignments
CREATE POLICY "pm_assignments: own read"
  ON project_manager_assignments FOR SELECT
  USING (user_id = auth.uid());

-- Index for efficient lookup
CREATE INDEX IF NOT EXISTS pm_assignments_user_idx
  ON project_manager_assignments (user_id);

CREATE INDEX IF NOT EXISTS pm_assignments_project_idx
  ON project_manager_assignments (project_id);

-- ── Update company_memberships: last-admin safety check ──────────────────────
-- Add a column to track membership role for the admin guard (already exists via
-- the 'role' text column inserted by initial schema — no migration needed).
-- The guard is enforced at the application layer in removeCompanyMember.
