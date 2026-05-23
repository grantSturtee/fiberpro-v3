/**
 * buildPricingSnapshot(supabase, projectId, actorLabel)
 *
 * Read-only snapshot builder for invoice creation. Reads project + related
 * rows and assembles a PricingSnapshotV1 from whatever data is available
 * right now.
 *
 * Phase H1: pricing math is no longer duplicated here. The authoritative
 * `resolvePricing` engine produces a structured `PricingResolution`, and the
 * snapshot builder is now a *consumer* of that output. Responsibilities:
 *
 *   - call `resolvePricing` once and store the structured result on
 *     `snapshot.resolved_pricing` (new in H1)
 *   - derive the legacy `snapshot.calculation` block from the resolver's
 *     `inputs_considered.breakdown` so the existing SnapshotSummary UI keeps
 *     rendering without modification
 *   - merge the resolver's `resolution_trail` into the snapshot's top-level
 *     `resolution_trail` (the human-readable explanation source)
 *
 * The snapshot is best-effort. Anything missing is recorded in the trail
 * rather than causing a failure — `createInvoiceFromProject` is still allowed
 * to draft an invoice even when no rule matched.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { resolvePricing } from "@/lib/pricing/resolve";
import type { PricingResolution } from "@/lib/pricing/types";
import type {
  PricingSnapshotV1,
  PricingSnapshotProject,
  PricingSnapshotCompany,
  PricingSnapshotAuthority,
  PricingSnapshotJurisdiction,
  PricingSnapshotRule,
  PricingSnapshotCalculation,
  PricingSnapshotPackage,
} from "@/types/invoice";

// ── Helpers ───────────────────────────────────────────────────────────────────

function num(v: unknown, fallback = 0): number {
  if (v === null || v === undefined) return fallback;
  const n = typeof v === "number" ? v : parseFloat(String(v));
  return Number.isFinite(n) ? n : fallback;
}

function roundMoney(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

type ResolverBreakdown = {
  base_project_fee?: number;
  per_sheet_fee?: number;
  per_sheet_total?: number;
  application_fee_included?: number;
  jurisdiction_fee_included?: number;
  subtotal_pre_multiplier?: number;
  plan_multiplier?: number;
  complexity_multiplier?: number;
  multiplier_adjustment?: number;
  multiplied_subtotal?: number;
  fiberpro_admin_fee?: number;
  grand_total_before_discount?: number;
  discount_amount?: number;
};

function breakdownFromResolution(resolution: PricingResolution): ResolverBreakdown {
  return ((resolution.inputs_considered?.breakdown as ResolverBreakdown | undefined) ?? {});
}

// ── Main ──────────────────────────────────────────────────────────────────────

export async function buildPricingSnapshot(
  supabase: SupabaseClient,
  projectId: string,
  actorLabel: string
): Promise<PricingSnapshotV1> {
  const trail: string[] = [];

  // 1. Project ----------------------------------------------------------------
  const { data: project } = await supabase
    .from("projects")
    .select(
      `
        id, job_number, job_name,
        state, county, authority_type, type_of_plan,
        sheet_count, pe_required, submission_date,
        company_id, authority_id, jurisdiction_id, pricing_rule_id,
        estimated_price, base_price, discount_amount, invoice_notes
      `
    )
    .eq("id", projectId)
    .single();

  if (!project) {
    trail.push("Project not found at snapshot time — produced empty snapshot.");
    return emptySnapshot(projectId, actorLabel, trail);
  }

  const projectSnapshot: PricingSnapshotProject = {
    id: project.id as string,
    job_number: (project.job_number as string) ?? "",
    job_name: (project.job_name as string) ?? "",
    state: (project.state as string) ?? null,
    county: (project.county as string) ?? null,
    authority_type: (project.authority_type as string) ?? null,
    type_of_plan: (project.type_of_plan as string) ?? null,
    sheet_count: num(project.sheet_count, 0),
    is_rush: false, // column does not exist yet; defaults to false until pricing engine extension
    pe_required: (project.pe_required as boolean | null) ?? null,
    submission_date: (project.submission_date as string | null) ?? null,
  };

  // 2. Company ----------------------------------------------------------------
  let company: PricingSnapshotCompany = {
    id: (project.company_id as string) ?? "",
    name: "",
    default_billing_name: null,
    default_billing_email: null,
  };

  if (project.company_id) {
    const { data: companyRow } = await supabase
      .from("companies")
      .select("id, name")
      .eq("id", project.company_id)
      .single();
    if (companyRow) {
      company = {
        id: companyRow.id as string,
        name: (companyRow.name as string) ?? "",
        // default_billing_name / default_billing_email columns are deferred
        // to the pricing-engine extension migration; null for now.
        default_billing_name: null,
        default_billing_email: null,
      };
    } else {
      trail.push("Company row not found for project.company_id.");
    }
  } else {
    trail.push("Project has no company_id.");
  }

  // 3. Authority --------------------------------------------------------------
  let authority: PricingSnapshotAuthority | null = null;
  if (project.authority_id) {
    const { data: authRow } = await supabase
      .from("authority_profiles")
      .select("id, name")
      .eq("id", project.authority_id)
      .single();
    if (authRow) {
      authority = {
        id: authRow.id as string,
        name: (authRow.name as string) ?? null,
      };
    } else {
      trail.push("authority_profiles row not found for project.authority_id.");
    }
  }

  // 4. Jurisdiction -----------------------------------------------------------
  let jurisdiction: PricingSnapshotJurisdiction | null = null;
  if (project.jurisdiction_id) {
    const { data: jurRow } = await supabase
      .from("jurisdictions")
      .select("id, authority_name, application_fee, jurisdiction_fee")
      .eq("id", project.jurisdiction_id)
      .single();
    if (jurRow) {
      jurisdiction = {
        id: jurRow.id as string,
        authority_name: (jurRow.authority_name as string | null) ?? null,
        application_fee: num(jurRow.application_fee, 0),
        jurisdiction_fee: num(jurRow.jurisdiction_fee, 0),
      };
    } else {
      trail.push("jurisdictions row not found for project.jurisdiction_id.");
    }
  }

  // 5. Resolve pricing (authoritative engine) ---------------------------------
  const resolution = await resolvePricing(supabase, projectId);
  // Merge resolver's trail into the snapshot trail so SnapshotSummary surfaces
  // a single chronological narrative.
  for (const line of resolution.resolution_trail) trail.push(line);

  // 6. Pricing rule ----------------------------------------------------------
  // Hydrate the legacy `pricing_rule` block from the rule the resolver picked.
  // We still fetch the full row here because the legacy block carries fields
  // the resolver doesn't surface (multipliers, include_* booleans).
  let pricingRule: PricingSnapshotRule | null = null;
  const ruleIdToHydrate =
    resolution.rule_id ?? ((project.pricing_rule_id as string | null) ?? null);
  if (ruleIdToHydrate) {
    const { data: ruleRow } = await supabase
      .from("pricing_rules")
      .select(
        `
          id, name,
          base_project_fee, per_sheet_fee,
          aerial_multiplier, underground_multiplier, complexity_multiplier,
          fiberpro_admin_fee,
          include_application_fee, application_fee_markup, application_fee_markup_percent,
          include_permit_fee, permit_fee_markup, permit_fee_markup_percent,
          include_review_fee, review_fee_markup, review_fee_markup_percent
        `
      )
      .eq("id", ruleIdToHydrate)
      .single();
    if (ruleRow) {
      pricingRule = {
        id: ruleRow.id as string,
        name: (ruleRow.name as string) ?? "",
        base_project_fee: num(ruleRow.base_project_fee, 0),
        per_sheet_fee: num(ruleRow.per_sheet_fee, 0),
        aerial_multiplier: num(ruleRow.aerial_multiplier, 1),
        underground_multiplier: num(ruleRow.underground_multiplier, 1),
        complexity_multiplier: num(ruleRow.complexity_multiplier, 1),
        fiberpro_admin_fee: num(ruleRow.fiberpro_admin_fee, 0),
        include_application_fee: Boolean(ruleRow.include_application_fee),
        application_fee_markup: Boolean(ruleRow.application_fee_markup),
        application_fee_markup_percent: num(ruleRow.application_fee_markup_percent, 0),
        include_permit_fee: Boolean(ruleRow.include_permit_fee),
        permit_fee_markup: Boolean(ruleRow.permit_fee_markup),
        permit_fee_markup_percent: num(ruleRow.permit_fee_markup_percent, 0),
        include_review_fee: Boolean(ruleRow.include_review_fee),
        review_fee_markup: Boolean(ruleRow.review_fee_markup),
        review_fee_markup_percent: num(ruleRow.review_fee_markup_percent, 0),
      };
    } else if (resolution.rule_id) {
      trail.push("pricing_rules row not found for resolved rule_id.");
    }
  }

  // 7. Calculation block (legacy shape, sourced from resolver breakdown) -----
  const breakdown = breakdownFromResolution(resolution);
  const projectDiscount = num(project.discount_amount, 0);

  // Total selection: prefer admin-set base_price → estimated_price →
  // resolver's grand_total_before_discount. This preserves the legacy total
  // priority the SnapshotSummary UI was built against.
  const grandTotalBeforeDiscount = num(
    breakdown.grand_total_before_discount,
    resolution.suggested_subtotal
  );
  const totalCandidate =
    project.base_price != null
      ? num(project.base_price, 0)
      : project.estimated_price != null
      ? num(project.estimated_price, 0)
      : grandTotalBeforeDiscount;

  const calculation: PricingSnapshotCalculation = {
    base_project_fee: num(breakdown.base_project_fee, 0),
    per_sheet_total: num(breakdown.per_sheet_total, 0),
    application_fee_included: num(breakdown.application_fee_included, 0),
    jurisdiction_fee_included: num(breakdown.jurisdiction_fee_included, 0),
    subtotal_pre_multiplier: num(breakdown.subtotal_pre_multiplier, 0),
    plan_multiplier: num(breakdown.plan_multiplier, 1),
    complexity_multiplier: num(breakdown.complexity_multiplier, 1),
    rush_fee: 0,                // not implemented until later pricing-engine phases
    pe_required_fee: 0,         // not implemented until later pricing-engine phases
    multiplied_subtotal: num(breakdown.multiplied_subtotal, 0),
    fiberpro_admin_fee: num(breakdown.fiberpro_admin_fee, 0),
    grand_total_before_discount: roundMoney(grandTotalBeforeDiscount),
    discount_amount: projectDiscount,
    total: roundMoney(totalCandidate),
  };

  // 8. Latest permit package --------------------------------------------------
  let packageSnap: PricingSnapshotPackage | null = null;
  const { data: pkgFile } = await supabase
    .from("project_files")
    .select("id, storage_path, created_at")
    .eq("project_id", projectId)
    .eq("file_category", "permit_package")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (pkgFile) {
    packageSnap = {
      file_id: pkgFile.id as string,
      storage_path: (pkgFile.storage_path as string) ?? null,
      generated_at: (pkgFile.created_at as string) ?? null,
    };
  } else {
    trail.push("No permit_package project_files row found yet.");
  }

  // 9. Top-level trail entries (legacy "what drove `calculation.total`") ------
  if (project.base_price != null) {
    trail.push(`Using project.base_price ($${num(project.base_price).toFixed(2)}) as total.`);
  } else if (project.estimated_price != null) {
    trail.push(`Using project.estimated_price ($${num(project.estimated_price).toFixed(2)}) as total — base_price not set.`);
  } else if (resolution.rule_id !== null) {
    trail.push(
      `Using resolver suggested_subtotal ($${grandTotalBeforeDiscount.toFixed(2)}) as total — base_price and estimated_price not set.`
    );
  } else {
    trail.push("No base_price, estimated_price, or matched rule — total is 0; admin should edit line items manually.");
  }

  if (projectDiscount > 0) {
    trail.push(`Project carries discount: $${projectDiscount.toFixed(2)}.`);
  }

  // ── Assemble ───────────────────────────────────────────────────────────────
  return {
    schema_version: 1,
    generated_at: new Date().toISOString(),
    project: projectSnapshot,
    company,
    authority,
    jurisdiction,
    pricing_rule: pricingRule,
    override: null, // pricing override columns are deferred to the pricing engine extension
    calculation,
    package: packageSnap,
    created_by: actorLabel,
    resolution_trail: trail,
    resolved_pricing: {
      confidence: resolution.confidence,
      suggested_subtotal: resolution.suggested_subtotal,
      suggested_total: resolution.suggested_total,
      line_items: resolution.line_items.map((li) => ({
        description: li.description,
        quantity: li.quantity,
        unit_price: li.unit_price,
        line_total: li.line_total,
        metadata: li.metadata,
      })),
      warnings: resolution.warnings,
      blocking_inputs: resolution.blocking_inputs,
    },
  };
}

function emptySnapshot(
  projectId: string,
  actorLabel: string,
  trail: string[]
): PricingSnapshotV1 {
  return {
    schema_version: 1,
    generated_at: new Date().toISOString(),
    project: {
      id: projectId,
      job_number: "",
      job_name: "",
      state: null,
      county: null,
      authority_type: null,
      type_of_plan: null,
      sheet_count: 0,
      is_rush: false,
      pe_required: null,
      submission_date: null,
    },
    company: {
      id: "",
      name: "",
      default_billing_name: null,
      default_billing_email: null,
    },
    authority: null,
    jurisdiction: null,
    pricing_rule: null,
    override: null,
    calculation: {
      base_project_fee: 0,
      per_sheet_total: 0,
      application_fee_included: 0,
      jurisdiction_fee_included: 0,
      subtotal_pre_multiplier: 0,
      plan_multiplier: 1,
      complexity_multiplier: 1,
      rush_fee: 0,
      pe_required_fee: 0,
      multiplied_subtotal: 0,
      fiberpro_admin_fee: 0,
      grand_total_before_discount: 0,
      discount_amount: 0,
      total: 0,
    },
    package: null,
    created_by: actorLabel,
    resolution_trail: trail,
  };
}
