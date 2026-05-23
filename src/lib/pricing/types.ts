/**
 * Pricing Resolution types (Phase H1).
 *
 * `PricingResolution` is the single authoritative output of the pricing
 * engine. It replaces the older `PriceBreakdown | null` return shape:
 *
 *   - never null — a no-match is just a resolution with rule_id=null and
 *     a "low" confidence + matching warning
 *   - carries structured invoice-ready line items
 *   - carries a human-readable resolution_trail explaining every step
 *   - carries `confidence` so the queue / draft creator / snapshot can show
 *     how trustworthy the suggestion is
 *
 * Phase H1 scope:
 *   - same pricing math as the legacy resolver
 *   - `blocking_inputs` is always empty (Phase H1 has nothing to block yet)
 *   - `warnings` is wired with the minimal set listed in the prompt
 */

export type PricingConfidence = "high" | "medium" | "low";

export type PricingResolutionLineItem = {
  description: string;
  quantity: number;
  unit_price: number;
  line_total: number;
  /**
   * Free-form tagging so downstream code (snapshot builder, draft creator,
   * later phases) can pluck a specific line back out by `kind`.
   *
   * Phase H1 emits these kinds:
   *   - "base_project_fee"
   *   - "per_sheet"
   *   - "application_fee"
   *   - "jurisdiction_fee"
   *   - "multiplier_adjustment"  (only when plan × complexity !== 1)
   *   - "fiberpro_admin_fee"
   */
  metadata?: Record<string, unknown>;
};

export type PricingResolutionWarning = {
  code: string;
  message: string;
};

export type PricingResolutionBlock = {
  code: string;
  message: string;
};

export type PricingResolution = {
  rule_id: string | null;
  rule_name: string | null;

  confidence: PricingConfidence;

  suggested_subtotal: number;
  suggested_total: number;

  line_items: PricingResolutionLineItem[];

  blocking_inputs: PricingResolutionBlock[];
  warnings: PricingResolutionWarning[];

  resolution_trail: string[];

  /**
   * Read-only record of what fed the calculation. Phase H1 stashes the
   * pre/post-multiplier breakdown values here so the snapshot builder can
   * populate its legacy `calculation` block without re-running math.
   *
   * Shape is intentionally loose — consumers should treat fields as optional.
   */
  inputs_considered?: Record<string, unknown>;
};
