/**
 * Pricing queries + legacy compat surface.
 *
 * Phase H1: the authoritative pricing engine moved to `src/lib/pricing/`.
 * This file now:
 *   - keeps the `PricingRule` row type used by the rule editor + matcher
 *   - re-exports `resolvePricing` / `matchPricingRule` from the new module
 *   - keeps `calculateProjectPrice` as a backwards-compat shim that returns
 *     the legacy `PriceBreakdown | null` shape so out-of-scope callers
 *     (admin billing-actions.ts) keep working unchanged. The shim is the
 *     only place that persists `projects.estimated_price / pricing_rule_id /
 *     sheet_count` for the legacy "Recalculate" UI button — `computeProject`
 *     persists the same fields via its own path.
 *
 * Future phases will remove the shim once all callers have been migrated to
 * `resolvePricing`.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

// ── Re-exports of the Phase H1 resolver ──────────────────────────────────────
export { resolvePricing, matchPricingRule } from "@/lib/pricing/resolve";
export type {
  PricingResolution,
  PricingResolutionLineItem,
  PricingResolutionWarning,
  PricingResolutionBlock,
  PricingConfidence,
} from "@/lib/pricing/types";

import { resolvePricing } from "@/lib/pricing/resolve";

// ── Types ─────────────────────────────────────────────────────────────────────

export type PricingRule = {
  id: string;
  name: string;
  state: string | null;
  county: string | null;
  authority_type: string | null;
  company_id: string | null;
  work_type: "aerial" | "underground" | null;
  base_project_fee: number;
  per_sheet_fee: number;
  per_mile_fee: number | null;
  rush_fee: number | null;
  aerial_multiplier: number;
  underground_multiplier: number;
  complexity_multiplier: number;
  // Per-fee pass-throughs (replaces single jurisdiction fee + global markup).
  include_application_fee: boolean;
  application_fee_markup: boolean;
  application_fee_markup_percent: number;
  include_permit_fee: boolean;
  permit_fee_markup: boolean;
  permit_fee_markup_percent: number;
  include_review_fee: boolean;
  review_fee_markup: boolean;
  review_fee_markup_percent: number;
  fiberpro_admin_fee: number;
  min_sheets: number | null;
  max_sheets: number | null;
  is_active: boolean;
};

/**
 * Legacy breakdown shape returned by `calculateProjectPrice`.
 *
 * @deprecated New code should call `resolvePricing` and consume
 * `PricingResolution` instead. This type is kept only so the existing
 * `recalculateEstimate` server action (out of Phase H1 scope) keeps
 * compiling.
 */
export type PriceBreakdown = {
  rule_id: string;
  rule_name: string;
  sheet_count: number;
  base_project_fee: number;
  per_sheet_total: number;
  application_fee_included: number;
  jurisdiction_fee_included: number;
  subtotal: number;
  plan_multiplier: number;
  complexity_multiplier: number;
  multiplied_subtotal: number;
  fiberpro_admin_fee: number;
  total: number;
};

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Legacy entry point — kept for back-compat with callers outside Phase H1
 * scope. Returns `null` when no rule matches so the existing UI message
 * ("No pricing rule matched…") still surfaces.
 *
 * Internally delegates to `resolvePricing` so there is exactly one pricing
 * engine. The shim re-runs the resolver, persists the same three project
 * fields the legacy implementation wrote, and projects the structured
 * resolution back into the legacy `PriceBreakdown` shape.
 *
 * @deprecated Prefer `resolvePricing`.
 */
export async function calculateProjectPrice(
  supabase: SupabaseClient,
  projectId: string
): Promise<PriceBreakdown | null> {
  const resolution = await resolvePricing(supabase, projectId);

  if (resolution.rule_id === null) {
    // Preserves legacy contract: no rule match = null return.
    return null;
  }

  const breakdownRaw = resolution.inputs_considered?.breakdown as
    | {
        base_project_fee?: number;
        per_sheet_total?: number;
        application_fee_included?: number;
        jurisdiction_fee_included?: number;
        subtotal_pre_multiplier?: number;
        plan_multiplier?: number;
        complexity_multiplier?: number;
        multiplied_subtotal?: number;
        fiberpro_admin_fee?: number;
        grand_total_before_discount?: number;
      }
    | undefined;

  const sheetCount =
    (resolution.inputs_considered?.sheet_count as number | undefined) ?? 0;

  const total = breakdownRaw?.grand_total_before_discount ?? resolution.suggested_subtotal;

  // Persist the same three columns the legacy resolver wrote, so the
  // existing "Recalculate Estimate" button continues to update the project.
  await supabase
    .from("projects")
    .update({
      estimated_price: total,
      pricing_rule_id: resolution.rule_id,
      sheet_count: sheetCount,
    })
    .eq("id", projectId);

  return {
    rule_id: resolution.rule_id,
    rule_name: resolution.rule_name ?? "",
    sheet_count: sheetCount,
    base_project_fee: breakdownRaw?.base_project_fee ?? 0,
    per_sheet_total: breakdownRaw?.per_sheet_total ?? 0,
    application_fee_included: breakdownRaw?.application_fee_included ?? 0,
    jurisdiction_fee_included: breakdownRaw?.jurisdiction_fee_included ?? 0,
    subtotal: breakdownRaw?.subtotal_pre_multiplier ?? 0,
    plan_multiplier: breakdownRaw?.plan_multiplier ?? 1,
    complexity_multiplier: breakdownRaw?.complexity_multiplier ?? 1,
    multiplied_subtotal: breakdownRaw?.multiplied_subtotal ?? 0,
    fiberpro_admin_fee: breakdownRaw?.fiberpro_admin_fee ?? 0,
    total,
  };
}

/**
 * Fetch all pricing rules (active + inactive) for list display.
 */
export async function getPricingRules(supabase: SupabaseClient): Promise<PricingRule[]> {
  const { data } = await supabase
    .from("pricing_rules")
    .select("*")
    .order("name");
  return (data ?? []) as PricingRule[];
}

/**
 * Fetch a single pricing rule by id.
 */
export async function getPricingRule(
  supabase: SupabaseClient,
  id: string
): Promise<PricingRule | null> {
  const { data } = await supabase
    .from("pricing_rules")
    .select("*")
    .eq("id", id)
    .single();
  return (data ?? null) as PricingRule | null;
}
