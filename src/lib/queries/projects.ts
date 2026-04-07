/**
 * Server-side query helpers for projects.
 * All functions accept an already-created Supabase server client
 * so callers control auth context.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { ProjectStatus, BillingStatus } from "@/types/domain";

// ── Types returned from queries ───────────────────────────────────────────────

export type ProjectListRow = {
  id: string;
  job_number: string;
  job_name: string;
  job_number_client: string | null;
  status: ProjectStatus;
  billing_status: BillingStatus;
  authority_type: string | null;
  county: string | null;
  city: string | null;
  company_id: string;
  company_name: string | null;
  assigned_designer_id: string | null;
  assigned_designer_name: string | null;
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
  authority_type: string | null;
  county: string | null;
  city: string | null;
  township: string | null;
  type_of_plan: string | null;
  job_type: string | null;
  notes: string | null;
  status: ProjectStatus;
  billing_status: BillingStatus;
  company_id: string;
  company_name: string | null;
  submitted_by: string | null;
  assigned_designer_id: string | null;
  assigned_designer_name: string | null;
  assigned_at: string | null;
  submission_date: string | null;
  authority_tracking_number: string | null;
  expected_response_date: string | null;
  permit_received_date: string | null;
  permit_notes: string | null;
  created_at: string;
  updated_at: string;
};

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
      authority_type,
      county,
      city,
      company_id,
      assigned_designer_id,
      assigned_at,
      created_at,
      updated_at,
      requested_approval_date,
      companies ( name ),
      designer:user_profiles!projects_assigned_designer_id_fkey ( display_name )
    `)
    .order("updated_at", { ascending: false, nullsFirst: false });

  if (error) {
    console.error("getAdminProjectList error:", error);
    return [];
  }

  return (data ?? []).map((row: Record<string, unknown>) => ({
    id: row.id as string,
    job_number: row.job_number as string,
    job_name: row.job_name as string,
    job_number_client: row.job_number_client as string | null,
    status: row.status as ProjectStatus,
    billing_status: row.billing_status as BillingStatus,
    authority_type: row.authority_type as string | null,
    county: row.county as string | null,
    city: row.city as string | null,
    company_id: row.company_id as string,
    company_name: (row.companies as { name: string } | null)?.name ?? null,
    assigned_designer_id: row.assigned_designer_id as string | null,
    assigned_designer_name:
      (row.designer as { display_name: string } | null)?.display_name ?? null,
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
    authority_type: row.authority_type as string | null,
    county: row.county as string | null,
    city: row.city as string | null,
    company_id: row.company_id as string,
    company_name: null,
    assigned_designer_id: row.assigned_designer_id as string | null,
    assigned_designer_name: null,
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
      company_id,
      submitted_by,
      assigned_designer_id,
      assigned_at,
      submission_date,
      authority_tracking_number,
      expected_response_date,
      permit_received_date,
      permit_notes,
      created_at,
      updated_at,
      companies ( name ),
      designer:user_profiles!projects_assigned_designer_id_fkey ( display_name )
    `)
    .eq("id", projectId)
    .single();

  if (error || !data) {
    if (error?.code !== "PGRST116") {
      console.error("getProjectDetail error:", error);
    }
    return null;
  }

  const row = data as Record<string, unknown>;

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
    authority_type: row.authority_type as string | null,
    county: row.county as string | null,
    city: row.city as string | null,
    township: row.township as string | null,
    type_of_plan: row.type_of_plan as string | null,
    job_type: row.job_type as string | null,
    notes: row.notes as string | null,
    status: row.status as ProjectStatus,
    billing_status: row.billing_status as BillingStatus,
    company_id: row.company_id as string,
    company_name: (row.companies as { name: string } | null)?.name ?? null,
    submitted_by: row.submitted_by as string | null,
    assigned_designer_id: row.assigned_designer_id as string | null,
    assigned_designer_name:
      (row.designer as { display_name: string } | null)?.display_name ?? null,
    assigned_at: row.assigned_at as string | null,
    submission_date: row.submission_date as string | null,
    authority_tracking_number: row.authority_tracking_number as string | null,
    expected_response_date: row.expected_response_date as string | null,
    permit_received_date: row.permit_received_date as string | null,
    permit_notes: row.permit_notes as string | null,
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
 * Get a company record for display purposes.
 */
export async function getCompany(
  supabase: SupabaseClient,
  companyId: string
): Promise<{ id: string; name: string; billing_email: string | null } | null> {
  const { data, error } = await supabase
    .from("companies")
    .select("id, name, billing_email")
    .eq("id", companyId)
    .single();

  if (error || !data) return null;
  return data as { id: string; name: string; billing_email: string | null };
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
      authority_type,
      county,
      city,
      company_id,
      assigned_designer_id,
      created_at,
      requested_approval_date,
      companies!inner ( name )
    `)
    .eq("assigned_designer_id", designerId)
    .not("status", "in", '("approved","package_generating","ready_for_submission","submitted","waiting_on_authority","authority_action_needed","permit_received","closed","cancelled")')
    .order("created_at", { ascending: false });

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
    authority_type: row.authority_type as string | null,
    county: row.county as string | null,
    city: row.city as string | null,
    company_id: row.company_id as string,
    company_name: (row.companies as { name: string } | null)?.name ?? null,
    assigned_designer_id: row.assigned_designer_id as string | null,
    assigned_designer_name: null,
    created_at: row.created_at as string,
    updated_at: null,
    requested_approval_date: row.requested_approval_date as string | null,
  }));
}
