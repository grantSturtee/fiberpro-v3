-- =============================================================================
-- Pricing Rules v2 — company / work_type scoping + jurisdiction-fee markup
-- =============================================================================
-- Additive migration. No data changes.
--
-- New columns on pricing_rules:
--   company_id          — optional FK to companies. Null = wildcard.
--   work_type           — optional CHECK-constrained text. Null = wildcard.
--                         Matches projects.type_of_plan ('aerial' | 'underground').
--                         (projects.type_of_plan='mixed' will only match rules
--                         with work_type IS NULL — by design.)
--   include_fee_markup  — when true, the resolver emits a "Fee Administration"
--                         line item equal to the matched jurisdiction
--                         pass-through fees × fee_markup_percent / 100.
--   fee_markup_percent  — percentage applied to jurisdiction pass-through fees.
--
-- Also seeds the global 'default_admin_fee' app_setting that the resolver uses
-- when a matched rule's fiberpro_admin_fee is 0.
-- =============================================================================

ALTER TABLE pricing_rules
  ADD COLUMN IF NOT EXISTS company_id         uuid          REFERENCES companies(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS work_type          text          CHECK (work_type IN ('aerial','underground')),
  ADD COLUMN IF NOT EXISTS include_fee_markup boolean       NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS fee_markup_percent numeric(5,2)  NOT NULL DEFAULT 10.00;

CREATE INDEX IF NOT EXISTS idx_pricing_rules_company_id
  ON pricing_rules(company_id);

INSERT INTO app_settings (key, value)
VALUES ('default_admin_fee', '100.00')
ON CONFLICT (key) DO NOTHING;
