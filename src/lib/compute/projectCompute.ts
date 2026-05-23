/**
 * Project compute engine.
 *
 * `computeProject` is the single entry point for all automated project
 * intelligence: jurisdiction matching + pricing resolution.
 *
 * Phase H1 changes:
 *   - pricing now flows through the authoritative `resolvePricing` engine
 *     in `src/lib/pricing/resolve.ts`
 *   - `computeProject` owns the persist step (estimated_price / pricing_rule_id
 *     / sheet_count); the resolver itself is pure
 *   - the returned `ComputeResult` gains a `resolution` field carrying the
 *     full structured output; the legacy `priceBreakdown` field is preserved
 *     for back-compat with the `recomputeProject` server action
 *
 * Design for n8n integration (unchanged):
 *   - Each run writes a workflow_jobs record (type = 'project_computed').
 *   - The record stores structured inputs + outputs in metadata jsonb.
 *   - n8n can poll or subscribe to these records to trigger downstream
 *     automations (e.g. notify on price change, flag no-match jurisdictions).
 *   - The function itself is synchronous and self-contained — n8n is NOT
 *     required for computation; it only acts on the logged results.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { matchJurisdiction } from "@/lib/queries/jurisdictions";
import { resolvePricing } from "@/lib/pricing/resolve";
import type { PricingResolution } from "@/lib/pricing/types";
import type { PriceBreakdown } from "@/lib/queries/pricing";

// ── Types ─────────────────────────────────────────────────────────────────────

export type ComputeInputs = {
  state: string | null;
  county: string | null;
  city: string | null;
  authority_type: string | null;
  type_of_plan: string | null;
};

export type ComputeOutputs = {
  jurisdiction_id: string | null;
  estimated_price: number | null;
  pricing_rule_id: string | null;
  sheet_count: number | null;
  pricing_confidence: PricingResolution["confidence"];
  pricing_warnings: PricingResolution["warnings"];
};

export type ComputeResult = {
  projectId: string;
  inputs: ComputeInputs;
  outputs: ComputeOutputs;
  /** New in Phase H1 — full structured resolver output. */
  resolution: PricingResolution;
  /**
   * Legacy shape preserved for back-compat with the `recomputeProject` admin
   * action. Built from `resolution`. `null` when no rule matched.
   */
  priceBreakdown: PriceBreakdown | null;
  jobId: string | null;
};

// ── Helpers ──────────────────────────────────────────────────────────────────

function num(v: unknown, fallback = 0): number {
  if (v === null || v === undefined) return fallback;
  const n = typeof v === "number" ? v : parseFloat(String(v));
  return Number.isFinite(n) ? n : fallback;
}

/**
 * Project the structured `PricingResolution` back into the legacy
 * `PriceBreakdown` shape used by the `recomputeProject` server action.
 */
function legacyBreakdownFromResolution(
  resolution: PricingResolution
): PriceBreakdown | null {
  if (resolution.rule_id === null) return null;

  const inputs = resolution.inputs_considered ?? {};
  const breakdown = (inputs.breakdown ?? {}) as {
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
  };
  const sheetCount = num(inputs.sheet_count, 0);
  const total = num(breakdown.grand_total_before_discount, resolution.suggested_subtotal);

  return {
    rule_id: resolution.rule_id,
    rule_name: resolution.rule_name ?? "",
    sheet_count: sheetCount,
    base_project_fee: num(breakdown.base_project_fee, 0),
    per_sheet_total: num(breakdown.per_sheet_total, 0),
    application_fee_included: num(breakdown.application_fee_included, 0),
    jurisdiction_fee_included: num(breakdown.jurisdiction_fee_included, 0),
    subtotal: num(breakdown.subtotal_pre_multiplier, 0),
    plan_multiplier: num(breakdown.plan_multiplier, 1),
    complexity_multiplier: num(breakdown.complexity_multiplier, 1),
    multiplied_subtotal: num(breakdown.multiplied_subtotal, 0),
    fiberpro_admin_fee: num(breakdown.fiberpro_admin_fee, 0),
    total,
  };
}

// ── Core function ─────────────────────────────────────────────────────────────

/**
 * Run the full compute pass for a project:
 * 1. Match and assign jurisdiction (state + county + city cascade)
 * 2. Resolve pricing (authoritative engine, never null)
 * 3. Persist estimated_price + pricing_rule_id + sheet_count when a rule matched
 * 4. Log inputs + outputs to workflow_jobs for audit and n8n pickup
 *
 * Returns the full result. Throws only on unrecoverable DB errors. A no-match
 * on jurisdiction or pricing is not an error — the resolution captures it and
 * the job is still logged as completed.
 */
export async function computeProject(
  supabase: SupabaseClient,
  projectId: string,
  triggeredBy?: string | null
): Promise<ComputeResult> {
  // ── 1. Fetch project location fields ────────────────────────────────────────
  const { data: project, error: fetchError } = await supabase
    .from("projects")
    .select("id, state, county, city, authority_type, type_of_plan")
    .eq("id", projectId)
    .single();

  if (fetchError || !project) {
    throw new Error(`computeProject: project ${projectId} not found`);
  }

  const inputs: ComputeInputs = {
    state: project.state ?? null,
    county: project.county ?? null,
    city: project.city ?? null,
    authority_type: project.authority_type ?? null,
    type_of_plan: project.type_of_plan ?? null,
  };

  // ── 2. Match jurisdiction ────────────────────────────────────────────────────
  const jurisdictionId = await matchJurisdiction(supabase, {
    state: inputs.state,
    county: inputs.county,
    city: inputs.city,
  });

  if (jurisdictionId) {
    await supabase
      .from("projects")
      .update({ jurisdiction_id: jurisdictionId })
      .eq("id", projectId);
  }

  // ── 3. Resolve pricing (pure; sees the jurisdiction we just wrote) ──────────
  const resolution = await resolvePricing(supabase, projectId);

  const sheetCount =
    typeof resolution.inputs_considered?.sheet_count === "number"
      ? (resolution.inputs_considered.sheet_count as number)
      : null;

  // Legacy `estimated_price` semantics = grand_total_before_discount, which
  // is what the resolver carries as `suggested_subtotal` (and what the legacy
  // engine used to write).
  const estimatedPrice =
    resolution.rule_id !== null ? resolution.suggested_subtotal : null;

  // ── 4. Persist estimated_price / pricing_rule_id / sheet_count ──────────────
  // Only write when there is an authoritative rule. A no-match leaves the
  // existing values untouched (mirrors legacy behavior — `calculateProjectPrice`
  // returned null and skipped the update).
  if (resolution.rule_id !== null) {
    await supabase
      .from("projects")
      .update({
        estimated_price: estimatedPrice,
        pricing_rule_id: resolution.rule_id,
        sheet_count: sheetCount,
      })
      .eq("id", projectId);
  }

  const priceBreakdown = legacyBreakdownFromResolution(resolution);

  const outputs: ComputeOutputs = {
    jurisdiction_id: jurisdictionId,
    estimated_price: estimatedPrice,
    pricing_rule_id: resolution.rule_id,
    sheet_count: sheetCount,
    pricing_confidence: resolution.confidence,
    pricing_warnings: resolution.warnings,
  };

  // ── 5. Log to workflow_jobs ───────────────────────────────────────────────────
  const { data: job } = await supabase
    .from("workflow_jobs")
    .insert({
      project_id: projectId,
      job_type: "project_computed",
      status: "completed",
      triggered_by: triggeredBy ?? null,
      completed_at: new Date().toISOString(),
      metadata: {
        inputs,
        outputs,
        resolution_trail: resolution.resolution_trail,
      },
    })
    .select("id")
    .single();

  return {
    projectId,
    inputs,
    outputs,
    resolution,
    priceBreakdown,
    jobId: job?.id ?? null,
  };
}

// =============================================================================
// Phase H2 — Auto-recompute hook for package generation callbacks
// =============================================================================

/**
 * Best-effort pricing recompute triggered after a successful package
 * generation. Phase H2 wires this into both the `/api/generate-package` and
 * `/api/workflows/complete` endpoints so a freshly-generated package
 * automatically populates `projects.estimated_price` / `pricing_rule_id` /
 * `sheet_count` — no manual "Recalculate Project" click required.
 *
 * Contract:
 *   - NEVER throws. Pricing recompute is operational enrichment, not part
 *     of the package-generation transaction. A failure here logs to console
 *     and returns `{ ran: false, reason: "error" }`. The caller MUST NOT
 *     unwind the package-generation success on a non-zero return.
 *
 *   - Idempotent across the two callback paths. When n8n's success flow
 *     fires both endpoints back-to-back, only the first one actually runs
 *     `computeProject`. The second sees the recent `project_computed`
 *     workflow_jobs row and short-circuits.
 *
 *   - Bounded write surface. Skips entirely when the project's billing
 *     state is already past the pre-invoice window (invoiced /
 *     partially_paid / paid / hold) — pricing on a sent invoice is frozen
 *     in `invoices.pricing_snapshot` and the project's cache columns must
 *     not be silently rewritten.
 *
 * Returns a small status record useful only for tests and structured logs.
 * The function never affects the HTTP response.
 */
export async function autoRecomputeAfterPackage(
  supabase: SupabaseClient,
  projectId: string,
  triggerSource: "generate-package" | "workflows-complete"
): Promise<{ ran: boolean; reason: string }> {
  try {
    // ── 1. Eligibility check by billing state ────────────────────────────────
    const { data: project, error: projectErr } = await supabase
      .from("projects")
      .select("billing_status")
      .eq("id", projectId)
      .single();
    if (projectErr || !project) {
      console.warn(
        `autoRecomputeAfterPackage: project ${projectId} not found — skipping pricing recompute.`
      );
      return { ran: false, reason: "project_not_found" };
    }
    const eligible = new Set(["not_ready", "ready_to_invoice", "draft_invoice"]);
    if (!eligible.has(project.billing_status as string)) {
      // Don't touch pricing on an invoiced / paid / hold project — its
      // invoice carries a frozen pricing_snapshot and the cache columns
      // should match the invoice, not a freshly-resolved value.
      return { ran: false, reason: "billing_status_locked" };
    }

    // ── 2. Idempotency — skip if compute already ran for this project very
    //      recently (one of the other callback paths got there first). ───────
    const sixtySecondsAgo = new Date(Date.now() - 60_000).toISOString();
    const { data: recent } = await supabase
      .from("workflow_jobs")
      .select("id")
      .eq("project_id", projectId)
      .eq("job_type", "project_computed")
      .gte("created_at", sixtySecondsAgo)
      .limit(1);
    if (recent && recent.length > 0) {
      return { ran: false, reason: "recent_compute_skipped" };
    }

    // ── 3. Run compute — persists estimated_price / pricing_rule_id /
    //      sheet_count and inserts its own workflow_jobs row. ────────────────
    const result = await computeProject(supabase, projectId);
    const ruleMatched = result.resolution.rule_id !== null;
    const estimatedPrice = result.outputs.estimated_price;
    const summary = ruleMatched
      ? `Pricing auto-recomputed after package generation — $${(estimatedPrice ?? 0).toFixed(2)} (${result.resolution.rule_name ?? "unknown rule"})`
      : "Pricing auto-recomputed after package generation — no rule matched.";

    // ── 4. Lightweight activity log so the project timeline reflects the
    //      auto-trigger alongside the "Permit package generated" entry. ──────
    await supabase.from("project_activity").insert({
      project_id: projectId,
      actor_id: null,
      actor_label: "System",
      action: summary,
      metadata: {
        trigger: triggerSource,
        rule_id: result.resolution.rule_id,
        rule_name: result.resolution.rule_name,
        estimated_price: estimatedPrice,
        sheet_count: result.outputs.sheet_count,
        confidence: result.resolution.confidence,
        warning_codes: result.resolution.warnings.map((w) => w.code),
      },
    });

    return { ran: true, reason: ruleMatched ? "completed" : "no_rule" };
  } catch (err) {
    // Operational enrichment — never propagate. Package generation has
    // already succeeded at this point and must not be unwound.
    console.error(
      `autoRecomputeAfterPackage: pricing recompute failed for project ${projectId}:`,
      err
    );
    return { ran: false, reason: "error" };
  }
}
