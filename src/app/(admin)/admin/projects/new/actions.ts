"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { AUTHORITY_TYPE_DB_MAP, type AuthorityTypeDisplay } from "@/lib/constants/authorities";
import { computeProject } from "@/lib/compute/projectCompute";
import { normalizeUpperText, normalizeUpperFormField } from "@/lib/utils/textNormalization";

export type NewProjectState = {
  error: string | null;
};

export async function createAdminProject(
  _prevState: NewProjectState,
  formData: FormData
): Promise<NewProjectState> {
  const supabase = await createClient();

  // ── 1. Verify admin ────────────────────────────────────────────────────────
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) {
    return { error: "You must be signed in." };
  }

  const { data: profile } = await supabase
    .from("user_profiles")
    .select("display_name, role")
    .eq("id", userData.user.id)
    .single();

  if (profile?.role !== "admin") {
    return { error: "Admin access required." };
  }

  const actorLabel = profile.display_name || userData.user.email || "Admin";

  // ── 2. Validate required fields ────────────────────────────────────────────
  // Phase A — admin intake captures structured address fields; the legacy
  // job_name / job_address columns are derived from them server-side so
  // existing PDF mappings and display surfaces keep working.
  // Permit-facing text is normalized to uppercase. Enum display labels
  // (authority_type, type_of_plan) feed the display→DB maps below, so they
  // must NOT be uppercased; same for the company_id UUID and the opaque
  // job_number_client.
  const companyId = (formData.get("company_id") as string)?.trim();
  const streetAddress = normalizeUpperFormField(formData, "street_address");
  const zipCode = normalizeUpperFormField(formData, "zip_code");
  const authorityTypeRaw = (formData.get("authority_type") as string)?.trim();
  const city = normalizeUpperFormField(formData, "city");
  const typeOfPlanRaw = (formData.get("type_of_plan") as string)?.trim();
  const jobNumberClientEarly = (formData.get("job_number_client") as string)?.trim() || null;

  if (!companyId) return { error: "Company is required." };
  if (!streetAddress) return { error: "Street Address is required." };
  if (!authorityTypeRaw) return { error: "Authority Type is required." };
  if (!city) return { error: "City / Municipality is required." };
  if (!typeOfPlanRaw) return { error: "Plan Type is required." };

  // Derive legacy job_name / job_address from the structured address. job_name
  // is NOT NULL in the schema and is read by many surfaces; the fallback
  // chain guarantees a stable non-empty value. streetAddress is already
  // uppercase; the jobNumberClient fallback path is re-normalized so job_name
  // is always uppercase regardless of source.
  const jobName    =
    normalizeUpperText(streetAddress || jobNumberClientEarly) ?? "UNTITLED PROJECT";
  const jobAddress = streetAddress;

  const authorityType = AUTHORITY_TYPE_DB_MAP[authorityTypeRaw as AuthorityTypeDisplay];
  if (!authorityType) return { error: "Invalid authority type." };

  const planTypeMap: Record<string, string> = {
    Aerial: "aerial",
    Underground: "underground",
    Mixed: "mixed",
    Other: "other",
  };
  const typeOfPlan = planTypeMap[typeOfPlanRaw];
  if (!typeOfPlan) return { error: "Invalid job type." };

  // ── 3. Optional fields ─────────────────────────────────────────────────────
  // Permit-facing location fields are normalized to uppercase. The opaque
  // job_number_client and the prose `notes` field are preserved as typed.
  const jobNumberClient = jobNumberClientEarly;
  const county = normalizeUpperFormField(formData, "county");
  const stateAbbr = normalizeUpperFormField(formData, "state");
  const requestedApprovalDate = (formData.get("requested_approval_date") as string) || null;
  const notes = (formData.get("notes") as string)?.trim() || null;
  const milepostStart = normalizeUpperFormField(formData, "milepost_start");
  const milepostEnd   = normalizeUpperFormField(formData, "milepost_end");

  // ── 3b. PM: validate and resolve display label ────────────────────────────
  // The form submits a user ID. The action validates it belongs to the
  // selected company as a project_manager, then fetches a display label so
  // the legacy rhino_pm text column stays populated for PDF mappings.
  const projectManagerId = (formData.get("project_manager_id") as string)?.trim() || null;

  const serviceClient = createServiceClient();

  async function resolveProjectManager(
    userId: string | null
  ): Promise<{ ok: true; userId: string | null; label: string | null } | { ok: false; error: string }> {
    if (!userId) return { ok: true, userId: null, label: null };

    const { data: membershipRow } = await serviceClient
      .from("company_memberships")
      .select("user_id, role")
      .eq("company_id", companyId)
      .eq("user_id", userId)
      .maybeSingle();

    const membership = membershipRow as { user_id: string; role: string } | null;
    if (!membership || membership.role !== "project_manager") {
      return {
        ok: false,
        error: "Invalid Project Manager — selected user is not a project manager of this company.",
      };
    }

    const { data: profileRow } = await serviceClient
      .from("user_profiles")
      .select("display_name, email")
      .eq("id", userId)
      .maybeSingle();
    const p = profileRow as { display_name: string | null; email: string | null } | null;
    const label =
      p?.display_name?.trim() || p?.email?.trim() || null;

    return { ok: true, userId, label };
  }

  const pmResolved = await resolveProjectManager(projectManagerId);
  if (!pmResolved.ok) return { error: pmResolved.error };

  // Legacy permit-facing text column — normalize the resolved PM label to
  // uppercase for consistent rendering. comcast_manager (legacy CA text
  // column) is left null since the client_admin role no longer exists.
  const rhinoPm        = normalizeUpperText(pmResolved.label);
  const comcastManager: string | null = null;

  const today = new Date().toISOString().slice(0, 10);

  // ── 4. Insert project ──────────────────────────────────────────────────────
  const { data: project, error: insertError } = await supabase
    .from("projects")
    .insert({
      job_number: "",
      company_id: companyId,
      submitted_by: userData.user.id,
      status: "intake_review",
      billing_status: "not_ready",
      unified_status: "new_project",
      job_name: jobName,
      job_number_client: jobNumberClient,
      // Real FK columns (Pass 4B).
      project_manager_id: pmResolved.userId,
      // Legacy text columns — kept populated for PDF mappings + display
      // surfaces that still read from them.
      rhino_pm: rhinoPm,
      comcast_manager: comcastManager,
      submitted_to_fiberpro: today,
      requested_approval_date: requestedApprovalDate,
      job_address: jobAddress,
      // Phase A — structured address fields, written alongside legacy
      // job_name / job_address until the latter are fully migrated.
      street_address: streetAddress,
      zip_code:       zipCode,
      state: stateAbbr,
      authority_type: authorityType,
      county,
      city,
      type_of_plan: typeOfPlan,
      milepost_start: milepostStart,
      milepost_end:   milepostEnd,
      notes,
    })
    .select("id")
    .single();

  if (insertError || !project) {
    console.error("Admin project insert error:", insertError);
    return { error: "Failed to create project. Please try again." };
  }

  // ── 4b. Project Manager assignment ─────────────────────────────────────────
  // Mirror the selected PM into project_manager_assignments so the existing
  // visibility filter (queries/projects.ts:getCompanyProjectListForUser)
  // continues to surface the project to that PM. UNIQUE(project_id, user_id)
  // makes this idempotent; we use the service client because RLS only allows
  // company_admin/admin via JWT and the admin path already validated above.
  if (pmResolved.userId) {
    const { error: assignmentError } = await serviceClient
      .from("project_manager_assignments")
      .upsert(
        {
          project_id:  project.id,
          user_id:     pmResolved.userId,
          assigned_by: userData.user.id,
        },
        { onConflict: "project_id,user_id", ignoreDuplicates: true }
      );
    if (assignmentError) {
      console.error("Admin project PM assignment error:", assignmentError);
      // Non-fatal: project is already created and project_manager_id is set.
    }
  }

  // ── 5. Compute project (jurisdiction + price) ──────────────────────────────
  // Runs async but we await it before redirect so the detail page shows
  // fresh data immediately. Errors are non-fatal — project was already created.
  try {
    await computeProject(supabase, project.id, userData.user.id);
  } catch (e) {
    console.error("computeProject error on creation:", e);
  }

  // ── 6. Activity log ────────────────────────────────────────────────────────
  await supabase.from("project_activity").insert({
    project_id: project.id,
    actor_id: userData.user.id,
    actor_label: actorLabel,
    action: "Project created by admin",
    metadata: { source: "admin_new_project" },
  });

  revalidatePath("/admin/projects");
  redirect(`/admin/projects/${project.id}`);
}
