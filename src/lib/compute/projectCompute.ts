/**
 * Project compute engine.
 *
 * computeProject() is the single entry point for all automated project
 * intelligence: jurisdiction matching + price calculation.
 *
 * Design for n8n integration:
 * - Each run writes a workflow_jobs record (type = 'project_computed').
 * - The record stores structured inputs + outputs in metadata jsonb.
 * - n8n can poll or subscribe to these records to trigger downstream
 *   automations (e.g. notify on price change, flag no-match jurisdictions).
 * - The function itself is synchronous and self-contained — n8n is NOT
 *   required for computation; it only acts on the logged results.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { matchJurisdiction } from "@/lib/queries/jurisdictions";
import { calculateProjectPrice, type PriceBreakdown } from "@/lib/queries/pricing";

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
};

export type ComputeResult = {
  projectId: string;
  inputs: ComputeInputs;
  outputs: ComputeOutputs;
  priceBreakdown: PriceBreakdown | null;
  jobId: string | null;     // workflow_jobs.id for correlation
};

// ── Core function ─────────────────────────────────────────────────────────────

/**
 * Run the full compute pass for a project:
 * 1. Match and assign jurisdiction (state + county + city cascade)
 * 2. Calculate estimated price using matched rule
 * 3. Log inputs + outputs to workflow_jobs for audit and n8n pickup
 *
 * Returns the full result. Throws only on unrecoverable DB errors.
 * A no-match on jurisdiction or pricing is not an error — outputs will
 * contain nulls and the job is still logged as completed.
 */
export async function computeProject(
  supabase: SupabaseClient,
  projectId: string,
  triggeredBy?: string | null   // auth user id, for workflow_jobs.triggered_by
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

  // ── 3. Calculate price ────────────────────────────────────────────────────────
  // calculateProjectPrice fetches the project internally, so it picks up
  // the jurisdiction_id we just wrote above (important for fee passthrough).
  const priceBreakdown = await calculateProjectPrice(supabase, projectId);

  const outputs: ComputeOutputs = {
    jurisdiction_id: jurisdictionId,
    estimated_price: priceBreakdown?.total ?? null,
    pricing_rule_id: priceBreakdown?.rule_id ?? null,
    sheet_count: priceBreakdown?.sheet_count ?? null,
  };

  // ── 4. Log to workflow_jobs ───────────────────────────────────────────────────
  const { data: job } = await supabase
    .from("workflow_jobs")
    .insert({
      project_id: projectId,
      job_type: "project_computed",
      status: "completed",
      triggered_by: triggeredBy ?? null,
      completed_at: new Date().toISOString(),
      metadata: { inputs, outputs },
    })
    .select("id")
    .single();

  return {
    projectId,
    inputs,
    outputs,
    priceBreakdown: priceBreakdown ?? null,
    jobId: job?.id ?? null,
  };
}
