-- =============================================================================
-- project_messages: add sender_role + fix RLS for all three roles
-- =============================================================================

-- 1. Add sender_role column (snapshot of JWT role at send time)
ALTER TABLE project_messages
  ADD COLUMN IF NOT EXISTS sender_role text;

-- 2. Fix company INSERT policy:
--    Previously forced visible_to_company = false, blocking the shared thread.
--    Now company members can insert with any visible_to_company value;
--    the server action always sets it to true.
DROP POLICY IF EXISTS "project_messages: company insert" ON project_messages;

CREATE POLICY "project_messages: company insert"
  ON project_messages FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM projects p
      JOIN company_memberships cm ON cm.company_id = p.company_id
      WHERE p.id = project_messages.project_id
        AND cm.user_id = auth.uid()
    )
  );

-- 3. Add designer INSERT policy (was missing entirely)
CREATE POLICY "project_messages: designer insert assigned"
  ON project_messages FOR INSERT
  WITH CHECK (
    (auth.jwt() ->> 'app_metadata')::jsonb ->> 'role' = 'designer'
    AND EXISTS (
      SELECT 1 FROM projects p
      WHERE p.id = project_messages.project_id
        AND p.assigned_designer_id = auth.uid()
    )
  );

-- 4. Update designer SELECT policy to see all messages for their project
--    (not filtered by visible_to_company — they are internal collaborators)
--    Original policy already has no visible_to_company filter, so this is a no-op
--    but we drop/recreate for clarity.
DROP POLICY IF EXISTS "project_messages: designer read assigned" ON project_messages;

CREATE POLICY "project_messages: designer read assigned"
  ON project_messages FOR SELECT
  USING (
    (auth.jwt() ->> 'app_metadata')::jsonb ->> 'role' = 'designer'
    AND EXISTS (
      SELECT 1 FROM projects p
      WHERE p.id = project_messages.project_id
        AND p.assigned_designer_id = auth.uid()
    )
  );
