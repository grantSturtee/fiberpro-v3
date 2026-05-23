-- Extend page_templates to support application_form and certification_form types.
-- The old authority_document_templates system is preserved for runtime compat.
ALTER TABLE page_templates
  DROP CONSTRAINT page_templates_template_type_check,
  ADD CONSTRAINT page_templates_template_type_check
    CHECK (template_type IN (
      'cover',
      'tcp_wrapper',
      'tcd_wrapper',
      'sld_wrapper',
      'application_form',
      'certification_form',
      'coi'
    ));

-- Add page-template-backed columns for application and certification form slots.
-- The old application_template_id / certification_template_id columns (FK to
-- authority_document_templates) are intentionally preserved for runtime generation.
ALTER TABLE package_blueprints
  ADD COLUMN IF NOT EXISTS app_page_template_id  uuid
    REFERENCES page_templates(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS cert_page_template_id uuid
    REFERENCES page_templates(id) ON DELETE SET NULL;
