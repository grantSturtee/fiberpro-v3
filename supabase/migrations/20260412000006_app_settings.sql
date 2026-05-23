-- =============================================================================
-- App Settings
-- =============================================================================
-- Global key-value store for admin-controlled operational settings.
-- Not intended for user preferences or per-project overrides.
--
-- key:   lowercase_snake_case identifier
-- value: text representation of the setting value (parsed by callers)
-- =============================================================================

CREATE TABLE app_settings (
  key        text        PRIMARY KEY,
  value      text        NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE app_settings ENABLE ROW LEVEL SECURITY;

-- Admins have full access (read + write)
CREATE POLICY "app_settings: admin all"
  ON app_settings FOR ALL
  USING (
    (auth.jwt() ->> 'app_metadata')::jsonb ->> 'role' = 'admin'
  );

-- Designers can read settings they need for their own logic
CREATE POLICY "app_settings: designer read"
  ON app_settings FOR SELECT
  USING (
    (auth.jwt() ->> 'app_metadata')::jsonb ->> 'role' = 'designer'
  );

-- ── Seed defaults ─────────────────────────────────────────────────────────────

INSERT INTO app_settings (key, value) VALUES
  ('project_update_cadence_days', '3');
