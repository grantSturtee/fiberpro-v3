-- ── RLS for authority_profiles, template_sets, template_assets ────────────────
-- These tables were created without RLS in earlier migrations.
-- Admin is the only role that needs direct access to these tables.

ALTER TABLE authority_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authority_profiles: admin all"
  ON authority_profiles FOR ALL
  USING ((auth.jwt() ->> 'app_metadata')::jsonb ->> 'role' = 'admin');

-- ── template_sets ─────────────────────────────────────────────────────────────

ALTER TABLE template_sets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "template_sets: admin all"
  ON template_sets FOR ALL
  USING ((auth.jwt() ->> 'app_metadata')::jsonb ->> 'role' = 'admin');

-- ── template_assets ───────────────────────────────────────────────────────────

ALTER TABLE template_assets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "template_assets: admin all"
  ON template_assets FOR ALL
  USING ((auth.jwt() ->> 'app_metadata')::jsonb ->> 'role' = 'admin');
