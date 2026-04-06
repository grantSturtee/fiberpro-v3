"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { AUTHORITY_TYPE_DB_MAP, type AuthorityTypeDisplay } from "@/lib/constants/authorities";

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
  const companyId = (formData.get("company_id") as string)?.trim();
  const jobName = (formData.get("job_name") as string)?.trim();
  const jobAddress = (formData.get("job_address") as string)?.trim();
  const authorityTypeRaw = (formData.get("authority_type") as string)?.trim();
  const city = (formData.get("city") as string)?.trim();
  const typeOfPlanRaw = (formData.get("type_of_plan") as string)?.trim();

  if (!companyId) return { error: "Company is required." };
  if (!jobName) return { error: "Job Name is required." };
  if (!jobAddress) return { error: "Job Address is required." };
  if (!authorityTypeRaw) return { error: "Authority Type is required." };
  if (!city) return { error: "City / Municipality is required." };
  if (!typeOfPlanRaw) return { error: "Job Type is required." };

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
  const jobNumberClient = (formData.get("job_number_client") as string)?.trim() || null;
  const county = (formData.get("county") as string)?.trim() || null;
  const stateAbbr = (formData.get("state") as string)?.trim() || null;
  const rhinoPm = (formData.get("rhino_pm") as string)?.trim() || null;
  const comcastManager = (formData.get("comcast_manager") as string)?.trim() || null;
  const jobTypeRaw = (formData.get("job_type") as string)?.trim() || null;
  const requestedApprovalDate = (formData.get("requested_approval_date") as string) || null;
  const notes = (formData.get("notes") as string)?.trim() || null;

  const jobTypeMap: Record<string, string> = {
    TCP: "tcp",
    SLD: "sld",
    "Full Package": "full_package",
    Revision: "revision",
    Other: "other",
  };
  const jobType = jobTypeRaw ? (jobTypeMap[jobTypeRaw] ?? null) : null;

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
      job_name: jobName,
      job_number_client: jobNumberClient,
      rhino_pm: rhinoPm,
      comcast_manager: comcastManager,
      submitted_to_fiberpro: today,
      requested_approval_date: requestedApprovalDate,
      job_address: jobAddress,
      state: stateAbbr,
      authority_type: authorityType,
      county,
      city,
      type_of_plan: typeOfPlan,
      job_type: jobType,
      notes,
    })
    .select("id")
    .single();

  if (insertError || !project) {
    console.error("Admin project insert error:", insertError);
    return { error: "Failed to create project. Please try again." };
  }

  // ── 5. Activity log ────────────────────────────────────────────────────────
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
