-- =============================================================================
-- Pricing Rules — fee pass-through restructure
-- =============================================================================
-- Replaces the single jurisdiction-fee pass-through + global fee markup with
-- three independent pass-through fees (application / permit / review), each
-- with its own optional admin-fee markup percentage.
--
-- The old columns (include_jurisdiction_fee, include_fee_markup,
-- fee_markup_percent) are dropped because the new structure supersedes them
-- per-rule. The previous global markup (~10%) maps onto the new per-fee
-- defaults (markup booleans default true, percent defaults 10).
--
-- Also seeds the global rush fee settings used by future rush-fee logic.
-- =============================================================================

ALTER TABLE pricing_rules
  ADD COLUMN IF NOT EXISTS application_fee_markup           boolean       NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS application_fee_markup_percent   numeric(5,2)  NOT NULL DEFAULT 10.00,
  ADD COLUMN IF NOT EXISTS include_permit_fee               boolean       NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS permit_fee_markup                boolean       NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS permit_fee_markup_percent        numeric(5,2)  NOT NULL DEFAULT 10.00,
  ADD COLUMN IF NOT EXISTS include_review_fee               boolean       NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS review_fee_markup                boolean       NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS review_fee_markup_percent        numeric(5,2)  NOT NULL DEFAULT 10.00;

INSERT INTO app_settings (key, value)
VALUES
  ('rush_fee_type',  'percent'),
  ('rush_fee_value', '10.00')
ON CONFLICT (key) DO NOTHING;

ALTER TABLE pricing_rules
  DROP COLUMN IF EXISTS include_jurisdiction_fee,
  DROP COLUMN IF EXISTS include_fee_markup,
  DROP COLUMN IF EXISTS fee_markup_percent;
