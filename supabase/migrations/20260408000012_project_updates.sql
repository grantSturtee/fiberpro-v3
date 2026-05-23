-- =============================================================================
-- Project Updates
-- =============================================================================
-- One-way admin → company status updates. Separate from project_messages
-- (the bidirectional chat thread) by design: company users cannot insert here,
-- and these are displayed as a timeline rather than a conversation.
--
-- created_by is a display-name snapshot at insert time, matching the pattern
-- used by project_activity.actor_label and project_messages.sender_label.
-- =============================================================================

CREATE TABLE project_updates (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  uuid        NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  body        text        NOT NULL CHECK (char_length(body) BETWEEN 1 AND 2000),
  created_by  text        NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE project_updates ENABLE ROW LEVEL SECURITY;

-- Admins have full access
CREATE POLICY "project_updates: admin all"
  ON project_updates FOR ALL
  USING (
    (auth.jwt() ->> 'app_metadata')::jsonb ->> 'role' = 'admin'
  );

-- Company members can read updates for their own company's projects
CREATE POLICY "project_updates: company read"
  ON project_updates FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM projects p
      JOIN company_memberships cm ON cm.company_id = p.company_id
      WHERE p.id = project_updates.project_id
        AND cm.user_id = auth.uid()
    )
  );

-- Efficient lookup for project detail pages (most-recent-first)
CREATE INDEX idx_project_updates_project
  ON project_updates(project_id, created_at DESC);
