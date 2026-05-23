-- =============================================================================
-- Designer write access for project_updates
-- =============================================================================
-- project_updates: designers previously had SELECT only on assigned projects.
--   Add INSERT so designers can post status updates from the project workspace.
--
-- Note: project_messages designer INSERT was already added in migration
--   20260406000013 alongside the sender_role column. No change needed there.
-- =============================================================================

-- Status updates: designer may insert on their assigned project
CREATE POLICY "project_updates: designer insert assigned"
  ON project_updates FOR INSERT
  WITH CHECK (
    (auth.jwt() ->> 'app_metadata')::jsonb ->> 'role' = 'designer'
    AND EXISTS (
      SELECT 1 FROM projects p
      WHERE p.id = project_updates.project_id
        AND p.assigned_designer_id = auth.uid()
    )
  );
