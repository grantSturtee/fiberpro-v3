"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { AUTHORITY_TYPE_DB_MAP, type AuthorityTypeDisplay } from "@/lib/constants/authorities";
import { normalizeUpperText, normalizeUpperFormField } from "@/lib/utils/textNormalization";

export type SubmitProjectState = {
  error: string | null;
};

export async function submitProject(
  _prevState: SubmitProjectState,
  formData: FormData
): Promise<SubmitProjectState> {
  const supabase = await createClient();

  // ── 1. Verify authenticated user ──────────────────────────────────────────
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) {
    return { error: "You must be signed in to submit a project." };
  }

  const userId = userData.user.id;

  // ── 2. Look up membership → company_id + role ─────────────────────────────
  const { data: membership, error: membershipError } = await supabase
    .from("company_memberships")
    .select("company_id, role")
    .eq("user_id", userId)
    .single();

  if (membershipError || !membership) {
    return { error: "Your account is not associated with a company. Contact your administrator." };
  }

  const companyId = membership.company_id;
  const submitterRole: string = membership.role;

  // ── 3. Enforce state restriction ──────────────────────────────────────────
  const stateAbbrEarly = normalizeUpperFormField(formData, "state");

  const { data: companyData } = await supabase
    .from("companies")
    .select("allowed_states, archived_at")
    .eq("id", companyId)
    .single();

  if (companyData?.archived_at) {
    return { error: "This company is no longer active. Contact GRANTED support." };
  }

  const allowedStates = companyData?.allowed_states as string[] | null | undefined;
  if (!allowedStates || allowedStates.length === 0) {
    return { error: "Your company is not configured to create projects in any state. Contact your administrator." };
  }
  if (!stateAbbrEarly || !allowedStates.includes(stateAbbrEarly)) {
    return { error: "The selected state is not allowed for your account. Contact your administrator." };
  }

  // ── 4. Resolve Project Manager ────────────────────────────────────────────
  // PM submitters: override to self (server doesn't trust form value).
  // company_admin submitters: PM comes from form.
  const serviceClient = createServiceClient();

  async function resolveProjectManager(
    userIdToResolve: string | null
  ): Promise<{ ok: true; userId: string | null; label: string | null } | { ok: false; error: string }> {
    if (!userIdToResolve) return { ok: true, userId: null, label: null };

    const { data: row } = await serviceClient
      .from("company_memberships")
      .select("user_id, role")
      .eq("company_id", companyId)
      .eq("user_id", userIdToResolve)
      .maybeSingle();

    const m = row as { user_id: string; role: string } | null;
    if (!m || m.role !== "project_manager") {
      return {
        ok: false,
        error: "Invalid Project Manager — selected user is not a project manager of this company.",
      };
    }

    const { data: profileRow } = await serviceClient
      .from("user_profiles")
      .select("display_name, email")
      .eq("id", userIdToResolve)
      .maybeSingle();
    const p = profileRow as { display_name: string | null; email: string | null } | null;
    const label = p?.display_name?.trim() || p?.email?.trim() || null;

    return { ok: true, userId: userIdToResolve, label };
  }

  const projectManagerIdInput =
    submitterRole === "project_manager"
      ? userId
      : (formData.get("project_manager_id") as string)?.trim() || null;

  const pmResolved = await resolveProjectManager(projectManagerIdInput);
  if (!pmResolved.ok) return { error: pmResolved.error };

  // Submitter label fallback for activity log + when no PM is selected.
  const { data: submitterProfileRow } = await supabase
    .from("user_profiles")
    .select("display_name, email")
    .eq("id", userId)
    .single();
  const submitterProfile = submitterProfileRow as
    | { display_name: string | null; email: string | null }
    | null;
  const submitterLabel =
    submitterProfile?.display_name?.trim() ||
    submitterProfile?.email?.trim() ||
    userData.user.email ||
    "Unknown";

  // Legacy text columns (PDF mappings). comcast_manager (legacy CA) is left
  // null since the client_admin role no longer exists.
  const rhinoPm = normalizeUpperText(
    pmResolved.label ?? (submitterRole === "project_manager" ? submitterLabel : null)
  );
  const comcastManager: string | null = null;

  const today = new Date().toISOString().slice(0, 10);

  // ── 5. Parse and validate project fields ──────────────────────────────────
  const requestedApprovalDate = formData.get("requested_approval_date") as string | null;
  const streetAddress = normalizeUpperFormField(formData, "street_address");
  const zipCode      = normalizeUpperFormField(formData, "zip_code");
  const authorityTypeRaw = formData.get("authority_type") as string;
  const city = normalizeUpperFormField(formData, "city");
  const typeOfPlanRaw = (formData.get("type_of_plan") as string);

  if (!requestedApprovalDate) return { error: "Requested Approval Date is required." };
  if (!streetAddress) return { error: "Street Address is required." };
  if (!authorityTypeRaw) return { error: "Authority Type is required." };
  if (!city) return { error: "City / Municipality is required." };
  if (!typeOfPlanRaw) return { error: "Job Type is required." };

  const authorityType = AUTHORITY_TYPE_DB_MAP[authorityTypeRaw as AuthorityTypeDisplay];
  if (!authorityType) return { error: "Invalid authority type." };

  const planTypeMap: Record<string, string> = {
    Aerial:      "aerial",
    Underground: "underground",
    Mixed:       "mixed",
    Other:       "other",
  };
  const typeOfPlan = planTypeMap[typeOfPlanRaw];
  if (!typeOfPlan) return { error: "Invalid job type." };

  const jobNumberClient  = (formData.get("job_number_client") as string)?.trim() || null;
  const county           = normalizeUpperFormField(formData, "county");
  const notes            = (formData.get("notes")            as string)?.trim() || null;
  const stateAbbr        = normalizeUpperFormField(formData, "state");
  const milepostStart    = normalizeUpperFormField(formData, "milepost_start");
  const milepostEnd      = normalizeUpperFormField(formData, "milepost_end");

  const jobName    =
    normalizeUpperText(streetAddress || jobNumberClient) ?? "UNTITLED PROJECT";
  const jobAddress = streetAddress;

  // ── 6. Insert project record ───────────────────────────────────────────────
  const { data: project, error: insertError } = await supabase
    .from("projects")
    .insert({
      job_number: "",
      company_id: companyId,
      submitted_by: userId,
      status: "intake_review",
      billing_status: "not_ready",
      unified_status: "new_project",
      job_name: jobName,
      job_number_client: jobNumberClient,
      project_manager_id: pmResolved.userId,
      rhino_pm: rhinoPm,
      comcast_manager: comcastManager,
      submitted_to_fiberpro: today,
      requested_approval_date: requestedApprovalDate,
      job_address: jobAddress,
      street_address: streetAddress,
      zip_code:       zipCode,
      state: stateAbbr,
      authority_type: authorityType,
      county,
      city,
      township: null,
      type_of_plan: typeOfPlan,
      job_type: null,
      notes,
      milepost_start: milepostStart,
      milepost_end:   milepostEnd,
    })
    .select("id")
    .single();

  if (insertError || !project) {
    console.error("Project insert error:", insertError);
    return { error: "Failed to create project. Please try again." };
  }

  // ── 6b. Project Manager assignment ─────────────────────────────────────────
  if (pmResolved.userId) {
    const { error: assignmentError } = await serviceClient
      .from("project_manager_assignments")
      .upsert(
        {
          project_id:  project.id,
          user_id:     pmResolved.userId,
          assigned_by: userId,
        },
        { onConflict: "project_id,user_id", ignoreDuplicates: true }
      );
    if (assignmentError) {
      console.error("Submit project PM assignment error:", assignmentError);
    }
  }

  // ── 7. Create initial activity record ─────────────────────────────────────
  await supabase.from("project_activity").insert({
    project_id: project.id,
    actor_id: userId,
    actor_label: submitterLabel,
    action: "Project submitted",
    metadata: { source: "company_submit" },
  });

  // ── 8. Redirect to new project detail page ────────────────────────────────
  redirect(`/company/projects/${project.id}`);
}
