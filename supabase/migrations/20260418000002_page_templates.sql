-- Generic page template library for cover sheets, TCP wrappers, TCD wrappers, SLD wrappers, and COI.
-- storage_path references the "page-templates" storage bucket (must be created in Supabase dashboard).
CREATE TABLE page_templates (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name          text        NOT NULL,
  template_type text        NOT NULL CHECK (template_type IN ('cover', 'tcp_wrapper', 'tcd_wrapper', 'sld_wrapper', 'coi')),
  storage_path  text,
  is_active     boolean     NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE page_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "page_templates: admin all" ON page_templates FOR ALL
  USING  ((auth.jwt() ->> 'app_metadata')::jsonb ->> 'role' = 'admin')
  WITH CHECK ((auth.jwt() ->> 'app_metadata')::jsonb ->> 'role' = 'admin');

CREATE POLICY "page_templates: authenticated read" ON page_templates FOR SELECT
  USING (auth.role() = 'authenticated');

-- Wire new page_template slots into package blueprints.
-- ON DELETE SET NULL so deleting a template doesn't cascade-delete blueprints.
ALTER TABLE package_blueprints
  ADD COLUMN IF NOT EXISTS tcp_wrapper_id  uuid REFERENCES page_templates(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS tcd_wrapper_id  uuid REFERENCES page_templates(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS sld_wrapper_id  uuid REFERENCES page_templates(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS coi_template_id uuid REFERENCES page_templates(id) ON DELETE SET NULL;
