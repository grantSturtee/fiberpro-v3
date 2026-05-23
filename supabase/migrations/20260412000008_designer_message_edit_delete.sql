-- =============================================================================
-- Designer UPDATE + DELETE on project_messages (own notes only)
-- =============================================================================
-- Designers have SELECT and INSERT on project_messages for assigned projects.
-- The AdminNotesRail component shows edit/delete controls to authors
-- (sender_id = current user). Without UPDATE/DELETE policies, those actions
-- are silently blocked by RLS even though the UI shows the buttons.
--
-- Scope: designers may only modify notes where sender_id = their own user ID.
-- Admins retain full access via the existing "project_messages: admin all" policy.
-- =============================================================================

-- Designers may update the body of their own notes
CREATE POLICY "project_messages: designer update own"
  ON project_messages FOR UPDATE
  USING (
    (auth.jwt() ->> 'app_metadata')::jsonb ->> 'role' = 'designer'
    AND sender_id = auth.uid()
  )
  WITH CHECK (
    (auth.jwt() ->> 'app_metadata')::jsonb ->> 'role' = 'designer'
    AND sender_id = auth.uid()
  );

-- Designers may delete their own notes
CREATE POLICY "project_messages: designer delete own"
  ON project_messages FOR DELETE
  USING (
    (auth.jwt() ->> 'app_metadata')::jsonb ->> 'role' = 'designer'
    AND sender_id = auth.uid()
  );
