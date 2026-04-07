/**
 * Pricing rules engine.
 *
 * Match strategy: load all active rules, score each by how many scope fields
 * match the project, pick the most specific. Null scope field = wildcard.
 *
 * Specificity score = (state match ? 1 : 0) + (county match ? 1 : 0) + (authority_type match ? 1 : 0)
 * A rule with state="NJ", county=null applies to all of NJ.
 * A rule with state="NJ", county="Bergen" applies specifically to Bergen County.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

// ── Types ─────────────────────────────────────────────────────────────────────

export type PricingRule = {
  id: string;
  name: string;
  state: string | null;
  county: string | null;
  authority_type: string | null;
  base_project_fee: number;
  per_sheet_fee: number;
  per_mile_fee: number | null;
  rush_fee: number | null;
  aerial_multiplier: number;
  underground_multiplier: number;
  complexity_multiplier: number;
  include_application_fee: boolean;
  include_jurisdiction_fee: boolean;
  fiberpro_admin_fee: number;
  min_sheets: number | null;
  max_sheets: number | null;
  is_active: boolean;
};

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

// ── Internal helpers ───────────────────────────────────────────────────────────

function ruleMatchesScope(
  rule: PricingRule,
  project: { state: string | null; county: string | null; authority_type: string | null }
): boolean {
  if (rule.state !== null && rule.state !== project.state) return false;
  if (rule.county !== null && rule.county !== project.county) return false;
  if (rule.authority_type !== null && rule.authority_type !== project.authority_type) return false;
  return true;
}

function scopeSpecificity(rule: PricingRule): number {
  return (rule.state !== null ? 1 : 0) +
    (rule.county !== null ? 1 : 0) +
    (rule.authority_type !== null ? 1 : 0);
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Find the best-matching active pricing rule for a given scope.
 * Returns null if no rule exists.
 */
export async function matchPricingRule(
  supabase: SupabaseClient,
  scope: { state: string | null; county: string | null; authority_type: string | null }
): Promise<PricingRule | null> {
  const { data } = await supabase
    .from("pricing_rules")
    .select("*")
    .eq("is_active", true);

  const rules = (data ?? []) as PricingRule[];

  const matching = rules
    .filter((r) => ruleMatchesScope(r, scope))
    .sort((a, b) => scopeSpecificity(b) - scopeSpecificity(a));

  return matching[0] ?? null;
}

/**
 * Calculate the estimated price for a project.
 * - Fetches project fields, counts TCP PDF sheets, loads jurisdiction fees.
 * - Finds best matching pricing rule.
 * - Persists estimated_price + pricing_rule_id + sheet_count to projects table.
 * - Returns breakdown, or null if no rule matched.
 */
export async function calculateProjectPrice(
  supabase: SupabaseClient,
  projectId: string
): Promise<PriceBreakdown | null> {
  // 1. Fetch project
  const { data: project, error: projectError } = await supabase
    .from("projects")
    .select("id, state, county, authority_type, type_of_plan, jurisdiction_id")
    .eq("id", projectId)
    .single();

  if (projectError || !project) {
    console.error("calculateProjectPrice: project not found", projectError);
    return null;
  }

  // 2. Count TCP PDF sheets (designer-uploaded design files)
  const { count: sheetCount } = await supabase
    .from("project_files")
    .select("id", { count: "exact", head: true })
    .eq("project_id", projectId)
    .eq("file_category", "tcp_pdf");

  const sheets = sheetCount ?? 0;

  // 3. Fetch jurisdiction fees (only needed if rule includes them)
  let applicationFee = 0;
  let jurisdictionFee = 0;
  if (project.jurisdiction_id) {
    const { data: jur } = await supabase
      .from("jurisdictions")
      .select("application_fee, jurisdiction_fee")
      .eq("id", project.jurisdiction_id)
      .single();
    applicationFee = Number(jur?.application_fee ?? 0);
    jurisdictionFee = Number(jur?.jurisdiction_fee ?? 0);
  }

  // 4. Match pricing rule
  const rule = await matchPricingRule(supabase, {
    state: project.state ?? null,
    county: project.county ?? null,
    authority_type: project.authority_type ?? null,
  });

  if (!rule) return null;

  // 5. Check sheet count gates
  if (rule.min_sheets !== null && sheets < rule.min_sheets) return null;
  if (rule.max_sheets !== null && sheets > rule.max_sheets) return null;

  // 6. Compute subtotal
  const base = Number(rule.base_project_fee);
  const perSheetTotal = Number(rule.per_sheet_fee) * sheets;
  const appFeeIncluded = rule.include_application_fee ? applicationFee : 0;
  const jurFeeIncluded = rule.include_jurisdiction_fee ? jurisdictionFee : 0;
  const subtotal = base + perSheetTotal + appFeeIncluded + jurFeeIncluded;

  // 7. Apply plan-type multiplier
  const planType = project.type_of_plan as string | null;
  let planMultiplier = 1;
  if (planType === "aerial") planMultiplier = Number(rule.aerial_multiplier);
  else if (planType === "underground") planMultiplier = Number(rule.underground_multiplier);
  else if (planType === "mixed") {
    // Mixed: average of aerial and underground
    planMultiplier = (Number(rule.aerial_multiplier) + Number(rule.underground_multiplier)) / 2;
  }

  const complexityMultiplier = Number(rule.complexity_multiplier);
  const multipliedSubtotal = subtotal * planMultiplier * complexityMultiplier;

  // 8. Add FiberPro admin fee
  const adminFee = Number(rule.fiberpro_admin_fee);
  const total = multipliedSubtotal + adminFee;

  // 9. Persist to project
  await supabase
    .from("projects")
    .update({
      estimated_price: Math.round(total * 100) / 100,
      pricing_rule_id: rule.id,
      sheet_count: sheets,
    })
    .eq("id", projectId);

  return {
    rule_id: rule.id,
    rule_name: rule.name,
    sheet_count: sheets,
    base_project_fee: base,
    per_sheet_total: perSheetTotal,
    application_fee_included: appFeeIncluded,
    jurisdiction_fee_included: jurFeeIncluded,
    subtotal,
    plan_multiplier: planMultiplier,
    complexity_multiplier: complexityMultiplier,
    multiplied_subtotal: multipliedSubtotal,
    fiberpro_admin_fee: adminFee,
    total: Math.round(total * 100) / 100,
  };
}

/**
 * Fetch all active pricing rules for list display.
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
