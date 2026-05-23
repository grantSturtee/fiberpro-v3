-- =============================================================================
-- conversation_last_seen: track per-user last-seen timestamp per project
-- =============================================================================
-- Used to compute unread message counts on project pages.
-- Upserted each time a user opens a project conversation.
-- =============================================================================

CREATE TABLE IF NOT EXISTS conversation_last_seen (
  project_id  uuid        NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id     uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (project_id, user_id)
);

ALTER TABLE conversation_last_seen ENABLE ROW LEVEL SECURITY;

-- Each user can read and upsert their own row
CREATE POLICY "conversation_last_seen: own read"
  ON conversation_last_seen FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "conversation_last_seen: own upsert"
  ON conversation_last_seen FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "conversation_last_seen: own update"
  ON conversation_last_seen FOR UPDATE
  USING (auth.uid() = user_id);

-- Admins can read all (for ops tooling)
CREATE POLICY "conversation_last_seen: admin read all"
  ON conversation_last_seen FOR SELECT
  USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');
