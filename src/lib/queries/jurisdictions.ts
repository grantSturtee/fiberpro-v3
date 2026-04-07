/**
 * Jurisdiction query helpers.
 * Auto-match uses a progressive specificity strategy:
 *   1. state + county + township  (most specific — municipal level)
 *   2. state + county             (county level)
 *   3. state only                 (state DOT / statewide rules)
 * The first match found wins.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

export type JurisdictionSummary = {
  id: string;
  state: string;
  county: string | null;
  township: string | null;
  authority_name: string;
  submission_method: string | null;
  submission_url: string | null;
  submission_email: string | null;
  requires_coi: boolean;
  requires_pe_stamp: boolean;
  requires_traffic_control_plan: boolean;
  requires_cover_sheet: boolean;
  requires_application_form: boolean;
  application_fee: number | null;
  jurisdiction_fee: number | null;
  requires_review_before_submission: boolean;
  allows_bulk_submission: boolean;
  avg_approval_days: number | null;
  notes: string | null;
};

const JURISDICTION_SELECT =
  "id, state, county, township, authority_name, submission_method, submission_url, submission_email, " +
  "requires_coi, requires_pe_stamp, requires_traffic_control_plan, requires_cover_sheet, requires_application_form, " +
  "application_fee, jurisdiction_fee, requires_review_before_submission, allows_bulk_submission, " +
  "avg_approval_days, notes";

/**
 * Find the best-matching active jurisdiction for a project's location data.
 * Returns the jurisdiction id or null if nothing matches.
 *
 * Call after project insert to set jurisdiction_id.
 */
export async function matchJurisdiction(
  supabase: SupabaseClient,
  opts: { state: string | null; county: string | null; city: string | null }
): Promise<string | null> {
  const { state, county, city } = opts;
  if (!state) return null;

  // 1. Most specific: state + county + township match
  if (county && city) {
    const { data } = await supabase
      .from("jurisdictions")
      .select("id")
      .eq("state", state)
      .eq("county", county)
      .eq("township", city)
      .eq("is_active", true)
      .limit(1)
      .maybeSingle();
    if (data?.id) return data.id;
  }

  // 2. County-level: state + county (township is null — county-wide rule)
  if (county) {
    const { data } = await supabase
      .from("jurisdictions")
      .select("id")
      .eq("state", state)
      .eq("county", county)
      .is("township", null)
      .eq("is_active", true)
      .limit(1)
      .maybeSingle();
    if (data?.id) return data.id;
  }

  // 3. State-level: state only (county is null — e.g. NJDOT statewide)
  const { data } = await supabase
    .from("jurisdictions")
    .select("id")
    .eq("state", state)
    .is("county", null)
    .eq("is_active", true)
    .limit(1)
    .maybeSingle();
  if (data?.id) return data.id;

  return null;
}

/**
 * Fetch a single jurisdiction by id for display.
 */
export async function getJurisdiction(
  supabase: SupabaseClient,
  jurisdictionId: string
): Promise<JurisdictionSummary | null> {
  const { data, error } = await supabase
    .from("jurisdictions")
    .select(JURISDICTION_SELECT)
    .eq("id", jurisdictionId)
    .single();

  if (error || !data) return null;
  return data as JurisdictionSummary;
}
