/**
 * Server-side query helpers for projects.
 * All functions accept an already-created Supabase server client
 * so callers control auth context.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { ProjectStatus, BillingStatus, UnifiedProjectStatus } from "@/types/domain";

// ── Types returned from queries ───────────────────────────────────────────────

export type ProjectListRow = {
  id: string;
  job_number: string;
  job_name: string;
  job_number_client: string | null;
  status: ProjectStatus;
  billing_status: BillingStatus;
  unified_status: UnifiedProjectStatus;
  authority_type: string | null;
  county: string | null;
  city: string | null;
  company_id: string;
  company_name: string | null;
  assigned_designer_id: string | null;
  assigned_designer_name: string | null;
  assigned_at: string | null;
  created_at: string;
  updated_at: string | null;
  requested_approval_date: string | null;
};

export type ProjectDetail = {
  id: string;
  job_number: string;
  job_name: string;
  job_number_client: string | null;
  rhino_pm: string | null;
  comcast_manager: string | null;
  submitted_to_fiberpro: string | null;
  requested_approval_date: string | null;
  job_address: string | null;
  // Phase A — structured address fields. Nullable; existing projects without
  // them continue to load and fall back to job_address/job_name on display.
  street_address: string | null;
  zip_code: string | null;
  authority_type: string | null;
  county: string | null;
  city: string | null;
  township: string | null;
  type_of_plan: string | null;
  job_type: string | null;
  notes: string | null;
  status: ProjectStatus;
  billing_status: BillingStatus;
  unified_status: UnifiedProjectStatus;
  company_id: string;
  company_name: string | null;
  submitted_by: string | null;
  assigned_designer_id: string | null;
  assigned_designer_name: string | null;
  assigned_designer_avatar_url: string | null;
  assigned_at: string | null;
  submission_date: string | null;
  submission_method: string | null;
  recipient_name: string | null;
  recipient_email: string | null;
  authority_tracking_number: string | null;
  expected_response_date: string | null;
  permit_received_date: string | null;
  permit_notes: string | null;
  state: string | null;
  jurisdiction_id: string | null;
  estimated_price: number | null;
  pricing_rule_id: string | null;
  base_price: number | null;
  discount_amount: number;
  invoice_number: string | null;
  invoice_notes: string | null;
  invoice_sent_at: string | null;
  invoice_paid_at: string | null;
  invoice_recipient_name: string | null;
  invoice_recipient_email: string | null;
  invoice_sent_by: string | null;
  invoice_send_notes: string | null;
  authority_id: string | null;
  pe_required: boolean | null;
  sheet_count: number | null;
  milepost_start: string | null;
  milepost_end: string | null;
  // Per-project requirement overrides (NULL = inherit authority default)
  req_application_override:       boolean | null;
  req_certification_override:     boolean | null;
  req_coi_override:               boolean | null;
  req_hard_copies_override:       boolean | null;
  req_certified_check_override:   boolean | null;
  req_notification_only_override: boolean | null;
  // Per-project package template override (NULL = use authority's active blueprint)
  blueprint_id: string | null;
  created_at: string;
  updated_at: string;
};

// ── Optional column resilience ────────────────────────────────────────────────
// Phase A added projects.street_address / zip_code via migration
// 20260505000001_project_structured_address.sql. Local DBs that have not yet
// applied that migration (or whose PostgREST schema cache is stale) will hard-
// fail any SELECT that includes those columns. We keep the main project SELECT
// to stable columns and fetch the structured address fields separately so a
// missing column degrades to null rather than throwing.

let _warnedStructuredAddressMissing = false;

async function fetchProjectStructuredAddress(
  supabase: SupabaseClient,
  projectId: string
): Promise<{ street_address: string | null; zip_code: string | null }> {
  try {
    const { data, error } = await supabase
      .from("projects")
      .select("street_address, zip_code")
      .eq("id", projectId)
      .maybeSingle();

    if (error) {
      if (!_warnedStructuredAddressMissing) {
        _warnedStructuredAddressMissing = true;
        console.warn(
          `[projects.ts] structured address columns unavailable (${error.message}). ` +
          `Returning null. Apply migration 20260505000001_project_structured_address to enable.`
        );
      }
      return { street_address: null, zip_code: null };
    }

    const row = data as { street_address?: string | null; zip_code?: string | null } | null;
    return {
      street_address: row?.street_address ?? null,
      zip_code:       row?.zip_code       ?? null,
    };
  } catch (e) {
    if (!_warnedStructuredAddressMissing) {
      _warnedStructuredAddressMissing = true;
      console.warn(`[projects.ts] structured address fetch threw:`, e);
    }
    return { street_address: null, zip_code: null };
  }
}

// ── Queries ───────────────────────────────────────────────────────────────────

/**
 * Fetch all projects for admin/designer view, with company name and designer name.
 * Returns most-recent-first.
 */
export async function getAdminProjectList(
  supabase: SupabaseClient
): Promise<ProjectListRow[]> {
  const { data, error } = await supabase
    .from("projects")
    .select(`
      id,
      job_number,
      job_name,
      job_number_client,
      status,
      billing_status,
      unified_status,
      authority_type,
      county,
      city,
      company_id,
      assigned_designer_id,
      assigned_at,
      created_at,
      updated_at,
      requested_approval_date,
      companies ( name )
    `)
    .order("updated_at", { ascending: false, nullsFirst: false });

    if (error) {
      console.error("getAdminProjectList error FULL:", JSON.stringify(error, null, 2));
      return [];
    }

  const rows = data ?? [];

  // Batch-resolve designer names: one query for all unique assigned_designer_ids.
  // This avoids N+1 queries — projects.assigned_designer_id references auth.users.id
  // and cannot be joined directly to user_profiles via a hint.
  const designerIds = [
    ...new Set(
      rows
        .map((r: Record<string, unknown>) => r.assigned_designer_id as string | null)
        .filter((id): id is string => id !== null)
    ),
  ];

  const designerNameMap = new Map<string, string>();
  if (designerIds.length > 0) {
    const { data: profiles } = await supabase
      .from("user_profiles")
      .select("id, display_name")
      .in("id", designerIds);

    for (const p of profiles ?? []) {
      if (p.display_name) designerNameMap.set(p.id, p.display_name);
    }
  }

  return rows.map((row: Record<string, unknown>) => ({
    id: row.id as string,
    job_number: row.job_number as string,
    job_name: row.job_name as string,
    job_number_client: row.job_number_client as string | null,
    status: row.status as ProjectStatus,
    billing_status: row.billing_status as BillingStatus,
    unified_status: row.unified_status as UnifiedProjectStatus,
    authority_type: row.authority_type as string | null,
    county: row.county as string | null,
    city: row.city as string | null,
    company_id: row.company_id as string,
    company_name: (row.companies as { name: string } | null)?.name ?? null,
    assigned_designer_id: row.assigned_designer_id as string | null,
    assigned_designer_name: designerNameMap.get(row.assigned_designer_id as string) ?? null,
    assigned_at: row.assigned_at as string | null,
    created_at: row.created_at as string,
    updated_at: row.updated_at as string | null,
    requested_approval_date: row.requested_approval_date as string | null,
  }));
}

/**
 * Fetch projects for a specific company (company portal view).
 */
export async function getCompanyProjectList(
  supabase: SupabaseClient,
  companyId: string
): Promise<ProjectListRow[]> {
  const { data, error } = await supabase
    .from("projects")
    .select(`
      id,
      job_number,
      job_name,
      job_number_client,
      status,
      billing_status,
      unified_status,
      authority_type,
      county,
      city,
      company_id,
      assigned_designer_id,
      created_at,
      requested_approval_date
    `)
    .eq("company_id", companyId)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("getCompanyProjectList error:", error);
    return [];
  }

  return (data ?? []).map((row: Record<string, unknown>) => ({
    id: row.id as string,
    job_number: row.job_number as string,
    job_name: row.job_name as string,
    job_number_client: row.job_number_client as string | null,
    status: row.status as ProjectStatus,
    billing_status: row.billing_status as BillingStatus,
    unified_status: row.unified_status as UnifiedProjectStatus,
    authority_type: row.authority_type as string | null,
    county: row.county as string | null,
    city: row.city as string | null,
    company_id: row.company_id as string,
    company_name: null,
    assigned_designer_id: row.assigned_designer_id as string | null,
    assigned_designer_name: null,
    assigned_at: null,
    created_at: row.created_at as string,
    updated_at: null,
    requested_approval_date: row.requested_approval_date as string | null,
  }));
}

/**
 * Fetch a single project by ID (admin/designer view, full detail).
 * Returns null if not found.
 */
export async function getProjectDetail(
  supabase: SupabaseClient,
  projectId: string
): Promise<ProjectDetail | null> {
  const { data, error } = await supabase
    .from("projects")
    .select(`
      id,
      job_number,
      job_name,
      job_number_client,
      rhino_pm,
      comcast_manager,
      submitted_to_fiberpro,
      requested_approval_date,
      job_address,
      authority_type,
      county,
      city,
      township,
      type_of_plan,
      job_type,
      notes,
      status,
      billing_status,
      unified_status,
      company_id,
      submitted_by,
      assigned_designer_id,
      assigned_at,
      submission_date,
      submission_method,
      recipient_name,
      recipient_email,
      authority_tracking_number,
      expected_response_date,
      permit_received_date,
      permit_notes,
      state,
      jurisdiction_id,
      estimated_price,
      pricing_rule_id,
      base_price,
      discount_amount,
      invoice_number,
      invoice_notes,
      invoice_sent_at,
      invoice_paid_at,
      invoice_recipient_name,
      invoice_recipient_email,
      invoice_sent_by,
      invoice_send_notes,
      authority_id,
      pe_required,
      sheet_count,
      milepost_start,
      milepost_end,
      req_application_override,
      req_certification_override,
      req_coi_override,
      req_hard_copies_override,
      req_certified_check_override,
      req_notification_only_override,
      blueprint_id,
      created_at,
      updated_at,
      companies ( name )
    `)
    .eq("id", projectId)
    .single();

  if (error) {
    if (error.code === "PGRST116") return null; // row not found — caller calls notFound()
    // Any other error (e.g. missing column from unapplied migration) should surface
    // as a real error, not silently become a 404.
    console.error("getProjectDetail error FULL:", JSON.stringify(error, null, 2));
    throw new Error(`getProjectDetail: ${error.message}`);
  }
  if (!data) return null;

  const row = data as Record<string, unknown>;

  // Phase A — structured address fields are fetched separately so a missing
  // column on stale local DBs degrades to null instead of crashing the page.
  const { street_address, zip_code } = await fetchProjectStructuredAddress(supabase, projectId);

  // Fetch designer name + raw avatar path separately — projects.assigned_designer_id
  // references auth.users.id, not a direct FK to user_profiles, so a join hint is unreliable.
  let designerName: string | null = null;
  let designerAvatarPath: string | null = null;
  const designerId = row.assigned_designer_id as string | null;
  if (designerId) {
    const { data: dp } = await supabase
      .from("user_profiles")
      .select("display_name, avatar_url")
      .eq("id", designerId)
      .single();
    designerName = dp?.display_name ?? null;
    designerAvatarPath = dp?.avatar_url ?? null;
  }

  return {
    id: row.id as string,
    job_number: row.job_number as string,
    job_name: row.job_name as string,
    job_number_client: row.job_number_client as string | null,
    rhino_pm: row.rhino_pm as string | null,
    comcast_manager: row.comcast_manager as string | null,
    submitted_to_fiberpro: row.submitted_to_fiberpro as string | null,
    requested_approval_date: row.requested_approval_date as string | null,
    job_address: row.job_address as string | null,
    street_address,
    zip_code,
    authority_type: row.authority_type as string | null,
    county: row.county as string | null,
    city: row.city as string | null,
    township: row.township as string | null,
    type_of_plan: row.type_of_plan as string | null,
    job_type: row.job_type as string | null,
    notes: row.notes as string | null,
    status: row.status as ProjectStatus,
    billing_status: row.billing_status as BillingStatus,
    unified_status: row.unified_status as UnifiedProjectStatus,
    company_id: row.company_id as string,
    company_name: (row.companies as { name: string } | null)?.name ?? null,
    submitted_by: row.submitted_by as string | null,
    assigned_designer_id: designerId,
    assigned_designer_name: designerName,
    assigned_designer_avatar_url: designerAvatarPath,
    assigned_at: row.assigned_at as string | null,
    submission_date: row.submission_date as string | null,
    submission_method: row.submission_method as string | null,
    recipient_name: row.recipient_name as string | null,
    recipient_email: row.recipient_email as string | null,
    authority_tracking_number: row.authority_tracking_number as string | null,
    expected_response_date: row.expected_response_date as string | null,
    permit_received_date: row.permit_received_date as string | null,
    permit_notes: row.permit_notes as string | null,
    state: row.state as string | null,
    jurisdiction_id: row.jurisdiction_id as string | null,
    estimated_price: row.estimated_price as number | null,
    pricing_rule_id: row.pricing_rule_id as string | null,
    base_price:      row.base_price as number | null,
    discount_amount: (row.discount_amount as number) ?? 0,
    invoice_number:          row.invoice_number as string | null,
    invoice_notes:           row.invoice_notes as string | null,
    invoice_sent_at:         row.invoice_sent_at as string | null,
    invoice_paid_at:         row.invoice_paid_at as string | null,
    invoice_recipient_name:  row.invoice_recipient_name as string | null,
    invoice_recipient_email: row.invoice_recipient_email as string | null,
    invoice_sent_by:         row.invoice_sent_by as string | null,
    invoice_send_notes:      row.invoice_send_notes as string | null,
    authority_id: row.authority_id as string | null,
    pe_required: row.pe_required as boolean | null,
    sheet_count: row.sheet_count as number | null,
    milepost_start: row.milepost_start as string | null,
    milepost_end: row.milepost_end as string | null,
    req_application_override:       row.req_application_override       as boolean | null,
    req_certification_override:     row.req_certification_override     as boolean | null,
    req_coi_override:               row.req_coi_override               as boolean | null,
    req_hard_copies_override:       row.req_hard_copies_override       as boolean | null,
    req_certified_check_override:   row.req_certified_check_override   as boolean | null,
    req_notification_only_override: row.req_notification_only_override as boolean | null,
    blueprint_id: row.blueprint_id as string | null,
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
  };
}

/**
 * Get a company member's company_id from their user_id.
 * Returns null if not found (user has no company association).
 */
export async function getCompanyIdForUser(
  supabase: SupabaseClient,
  userId: string
): Promise<string | null> {
  const { data, error } = await supabase
    .from("company_memberships")
    .select("company_id")
    .eq("user_id", userId)
    .single();

  if (error || !data) return null;
  return data.company_id;
}

/**
 * Get a company member's membership details (company_id + role).
 * Returns null if not found.
 */
export async function getCompanyMembership(
  supabase: SupabaseClient,
  userId: string
): Promise<{ company_id: string; role: string } | null> {
  const { data, error } = await supabase
    .from("company_memberships")
    .select("company_id, role")
    .eq("user_id", userId)
    .single();

  if (error || !data) return null;
  return { company_id: data.company_id, role: data.role };
}

/**
 * Fetch projects visible to a company member based on their role.
 *
 * Both company_admin and project_manager see all projects under the company.
 * The userId / role params are kept for caller signature stability.
 */
export async function getCompanyProjectListForUser(
  supabase: SupabaseClient,
  companyId: string,
  _userId: string,
  _role: string,
): Promise<ProjectListRow[]> {
  return getCompanyProjectList(supabase, companyId);
}

/**
 * Get a company record for display purposes.
 */
export async function getCompany(
  supabase: SupabaseClient,
  companyId: string
): Promise<{ id: string; name: string; billing_email: string | null; archived_at: string | null } | null> {
  const { data, error } = await supabase
    .from("companies")
    .select("id, name, billing_email, archived_at")
    .eq("id", companyId)
    .single();

  if (error || !data) return null;
  return data as { id: string; name: string; billing_email: string | null; archived_at: string | null };
}

// ── Designer-specific queries ──────────────────────────────────────────────────

/**
 * Fetch all users with role = designer, for the assign designer dropdown.
 * Only callable from admin context (admin read-all policy on user_profiles).
 */
export async function getDesigners(
  supabase: SupabaseClient
): Promise<{ id: string; display_name: string; email: string }[]> {
  const { data, error } = await supabase
    .from("user_profiles")
    .select("id, display_name, email")
    .eq("role", "designer")
    .order("display_name", { ascending: true });

  if (error) {
    console.error("getDesigners error:", error);
    return [];
  }

  return (data ?? []) as { id: string; display_name: string; email: string }[];
}

/**
 * Fetch projects assigned to a specific designer.
 * Returns most-recent-first, scoped to the current user's assignments.
 */
export async function getDesignerProjectList(
  supabase: SupabaseClient,
  designerId: string
): Promise<ProjectListRow[]> {
  const { data, error } = await supabase
    .from("projects")
    .select(`
      id,
      job_number,
      job_name,
      job_number_client,
      status,
      billing_status,
      unified_status,
      authority_type,
      county,
      city,
      company_id,
      assigned_designer_id,
      assigned_at,
      created_at,
      updated_at,
      requested_approval_date,
      companies!inner ( name )
    `)
    .eq("assigned_designer_id", designerId)
    .neq("status", "cancelled")
    .order("updated_at", { ascending: false, nullsFirst: false });

  if (error) {
    console.error("getDesignerProjectList error:", error);
    return [];
  }

  return (data ?? []).map((row: Record<string, unknown>) => ({
    id: row.id as string,
    job_number: row.job_number as string,
    job_name: row.job_name as string,
    job_number_client: row.job_number_client as string | null,
    status: row.status as ProjectStatus,
    billing_status: row.billing_status as BillingStatus,
    unified_status: row.unified_status as UnifiedProjectStatus,
    authority_type: row.authority_type as string | null,
    county: row.county as string | null,
    city: row.city as string | null,
    company_id: row.company_id as string,
    company_name: (row.companies as { name: string } | null)?.name ?? null,
    assigned_designer_id: row.assigned_designer_id as string | null,
    assigned_designer_name: null,
    assigned_at: row.assigned_at as string | null,
    created_at: row.created_at as string,
    updated_at: row.updated_at as string | null,
    requested_approval_date: row.requested_approval_date as string | null,
  }));
}

/**
 * Fetch a single project for a designer — scoped to their assignment.
 * Selects only columns the designer workspace needs. Returns null if the
 * project does not exist or is not assigned to this designer.
 *
 * Keeps access control in the query (via assigned_designer_id filter) rather
 * than as a post-query guard, which avoids a class of false-404 regressions.
 */
export async function getDesignerProjectDetail(
  supabase: SupabaseClient,
  projectId: string,
  designerId: string
): Promise<ProjectDetail | null> {
  const { data, error } = await supabase
    .from("projects")
    .select(`
      id,
      job_number,
      job_name,
      job_number_client,
      rhino_pm,
      comcast_manager,
      submitted_to_fiberpro,
      requested_approval_date,
      job_address,
      authority_type,
      county,
      city,
      township,
      type_of_plan,
      job_type,
      notes,
      status,
      billing_status,
      unified_status,
      company_id,
      submitted_by,
      assigned_designer_id,
      assigned_at,
      submission_date,
      submission_method,
      recipient_name,
      recipient_email,
      authority_tracking_number,
      expected_response_date,
      permit_received_date,
      permit_notes,
      state,
      jurisdiction_id,
      estimated_price,
      pricing_rule_id,
      base_price,
      discount_amount,
      invoice_number,
      invoice_notes,
      invoice_sent_at,
      invoice_paid_at,
      invoice_recipient_name,
      invoice_recipient_email,
      invoice_sent_by,
      invoice_send_notes,
      authority_id,
      pe_required,
      sheet_count,
      milepost_start,
      milepost_end,
      req_application_override,
      req_certification_override,
      req_coi_override,
      req_hard_copies_override,
      req_certified_check_override,
      req_notification_only_override,
      blueprint_id,
      created_at,
      updated_at,
      companies ( name )
    `)
    .eq("id", projectId)
    .eq("assigned_designer_id", designerId)
    .single();

  if (error) {
    if (error.code === "PGRST116") return null; // not found or not assigned to this designer
    console.error("getDesignerProjectDetail error:", JSON.stringify(error, null, 2));
    return null; // treat unexpected errors as not-found rather than crashing the page
  }
  if (!data) return null;

  const row = data as Record<string, unknown>;

  // Phase A — same defensive fetch pattern as getProjectDetail.
  const { street_address, zip_code } = await fetchProjectStructuredAddress(supabase, projectId);

  return {
    id: row.id as string,
    job_number: row.job_number as string,
    job_name: row.job_name as string,
    job_number_client: row.job_number_client as string | null,
    rhino_pm: row.rhino_pm as string | null,
    comcast_manager: row.comcast_manager as string | null,
    submitted_to_fiberpro: row.submitted_to_fiberpro as string | null,
    requested_approval_date: row.requested_approval_date as string | null,
    job_address: row.job_address as string | null,
    street_address,
    zip_code,
    authority_type: row.authority_type as string | null,
    county: row.county as string | null,
    city: row.city as string | null,
    township: row.township as string | null,
    type_of_plan: row.type_of_plan as string | null,
    job_type: row.job_type as string | null,
    notes: row.notes as string | null,
    status: row.status as ProjectStatus,
    billing_status: row.billing_status as BillingStatus,
    unified_status: row.unified_status as UnifiedProjectStatus,
    company_id: row.company_id as string,
    company_name: (row.companies as { name: string } | null)?.name ?? null,
    submitted_by: row.submitted_by as string | null,
    assigned_designer_id: row.assigned_designer_id as string | null,
    assigned_designer_name: null,
    assigned_designer_avatar_url: null,
    assigned_at: row.assigned_at as string | null,
    submission_date: row.submission_date as string | null,
    submission_method: row.submission_method as string | null,
    recipient_name: row.recipient_name as string | null,
    recipient_email: row.recipient_email as string | null,
    authority_tracking_number: row.authority_tracking_number as string | null,
    expected_response_date: row.expected_response_date as string | null,
    permit_received_date: row.permit_received_date as string | null,
    permit_notes: row.permit_notes as string | null,
    state: row.state as string | null,
    jurisdiction_id: row.jurisdiction_id as string | null,
    estimated_price: row.estimated_price as number | null,
    pricing_rule_id: row.pricing_rule_id as string | null,
    base_price: row.base_price as number | null,
    discount_amount: (row.discount_amount as number) ?? 0,
    invoice_number: row.invoice_number as string | null,
    invoice_notes: row.invoice_notes as string | null,
    invoice_sent_at: row.invoice_sent_at as string | null,
    invoice_paid_at: row.invoice_paid_at as string | null,
    invoice_recipient_name: row.invoice_recipient_name as string | null,
    invoice_recipient_email: row.invoice_recipient_email as string | null,
    invoice_sent_by: row.invoice_sent_by as string | null,
    invoice_send_notes: row.invoice_send_notes as string | null,
    authority_id: row.authority_id as string | null,
    pe_required: row.pe_required as boolean | null,
    sheet_count: row.sheet_count as number | null,
    milepost_start: row.milepost_start as string | null,
    milepost_end: row.milepost_end as string | null,
    req_application_override:       row.req_application_override       as boolean | null,
    req_certification_override:     row.req_certification_override     as boolean | null,
    req_coi_override:               row.req_coi_override               as boolean | null,
    req_hard_copies_override:       row.req_hard_copies_override       as boolean | null,
    req_certified_check_override:   row.req_certified_check_override   as boolean | null,
    req_notification_only_override: row.req_notification_only_override as boolean | null,
    blueprint_id: row.blueprint_id as string | null,
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
  };
}
