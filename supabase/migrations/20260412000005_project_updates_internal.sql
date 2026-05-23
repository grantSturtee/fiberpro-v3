-- =============================================================================
-- Make project_updates internal (admin + designer only)
-- =============================================================================
-- Previously, company members could read status updates.
-- Status updates are now internal progress tracking — visible only to admins
-- and designers assigned to the project.
-- =============================================================================

-- Remove company read access
DROP POLICY IF EXISTS "project_updates: company read" ON project_updates;

-- Grant designers read access to updates on their assigned projects
CREATE POLICY "project_updates: designer read"
  ON project_updates FOR SELECT
  USING (
    (auth.jwt() ->> 'app_metadata')::jsonb ->> 'role' = 'designer'
    AND EXISTS (
      SELECT 1 FROM projects p
      WHERE p.id = project_updates.project_id
        AND p.assigned_designer_id = auth.uid()
    )
  );
