"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { computeProject } from "@/lib/compute/projectCompute";
import { enqueueWorkflowJob } from "@/lib/workflow/enqueue";
import type { PermitPackageMetadata } from "@/types/workflow";
import { getStoragePath, categoryToFileType } from "@/lib/constants/files";

// ── Shared state type ─────────────────────────────────────────────────────────

export type AdminActionState = {
  error: string | null;
  success?: boolean;
};

// ── Helper: get actor label for activity records ──────────────────────────────

async function getActorLabel(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string
): Promise<string> {
  const { data } = await supabase
    .from("user_profiles")
    .select("display_name")
    .eq("id", userId)
    .single();
  return data?.display_name || "Admin";
}

// ── Update Intake Details ─────────────────────────────────────────────────────
// Admin edits the core intake fields on a project.

export async function updateIntakeDetails(
  _prevState: AdminActionState,
  formData: FormData
): Promise<AdminActionState> {
  const supabase = await createClient();

  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return { error: "Not authenticated." };

  const projectId = formData.get("project_id") as string;
  if (!projectId) return { error: "Missing project ID." };

  // Basic field hygiene
  const job_name = (formData.get("job_name") as string)?.trim();
  if (!job_name) return { error: "Job Name is required." };
  const city = (formData.get("city") as string)?.trim();
  if (!city) return { error: "City / Municipality is required." };
  const job_address = (formData.get("job_address") as string)?.trim();
  if (!job_address) return { error: "Job Address is required." };

  const patch: Record<string, string | null> = {
    job_name,
    job_number_client:      (formData.get("job_number_client") as string)?.trim()      || null,
    rhino_pm:               (formData.get("rhino_pm") as string)?.trim()               || null,
    comcast_manager:        (formData.get("comcast_manager") as string)?.trim()        || null,
    submitted_to_fiberpro:  (formData.get("submitted_to_fiberpro") as string)          || null,
    requested_approval_date:(formData.get("requested_approval_date") as string)        || null,
    type_of_plan:           (formData.get("type_of_plan") as string)                   || null,
    job_type:               (formData.get("job_type") as string)                       || null,
    authority_type:         (formData.get("authority_type") as string)                 || null,
    county:                 (formData.get("county") as string)?.trim()                 || null,
    township:               (formData.get("township") as string)?.trim()               || null,
    city,
    state:                  (formData.get("state") as string)                          || null,
    job_address,
    notes:                  (formData.get("notes") as string)?.trim()                  || null,
  };

  const { error: updateError } = await supabase
    .from("projects")
    .update(patch)
    .eq("id", projectId);

  if (updateError) {
    console.error("updateIntakeDetails error:", updateError);
    return { error: "Failed to save changes." };
  }

  const actorLabel = await getActorLabel(supabase, userData.user.id);

  await supabase.from("project_activity").insert({
    project_id: projectId,
    actor_id: userData.user.id,
    actor_label: actorLabel,
    action: "Updated intake details",
    metadata: {},
  });

  revalidatePath(`/admin/projects/${projectId}`);
  return { error: null, success: true };
}

// ── Upload SLD ────────────────────────────────────────────────────────────────
// Admin uploads a Street Layout Diagram for a project.
// Stores file in project-files bucket and creates a project_files record.

export async function uploadSLD(
  _prevState: AdminActionState,
  formData: FormData
): Promise<AdminActionState> {
  const supabase = await createClient();

  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return { error: "Not authenticated." };

  const projectId = formData.get("project_id") as string;
  const file = formData.get("file") as File | null;

  if (!projectId) return { error: "Missing project ID." };
  if (!file || file.size === 0) return { error: "Please select a file to upload." };
  if (file.type !== "application/pdf") return { error: "Only PDF files are accepted." };
  if (file.size > 52428800) return { error: "File exceeds 50 MB limit." };

  const userId = userData.user.id;
  const safeFileName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const storagePath = `${projectId}/sld/${Date.now()}_${safeFileName}`;

  // Use service client for storage upload — bypasses RLS on storage bucket.
  // Auth + role is already verified above via the user session.
  const storage = createServiceClient();
  const { error: uploadError } = await storage.storage
    .from("project-files")
    .upload(storagePath, file, { contentType: file.type, upsert: false });

  if (uploadError) {
    console.error("SLD upload error:", uploadError.message, uploadError);
    return { error: `File upload failed: ${uploadError.message}` };
  }

  const actorLabel = await getActorLabel(supabase, userId);

  // Create project_files record
  const { error: dbError } = await supabase.from("project_files").insert({
    project_id: projectId,
    uploaded_by: userId,
    uploader_label: actorLabel,
    file_category: "sld_sheet",
    file_type: "sld",
    file_name: file.name,
    storage_path: storagePath,
    file_size_bytes: file.size,
    mime_type: file.type,
  });

  if (dbError) {
    console.error("SLD file record error:", dbError);
    // Clean up uploaded storage file on DB failure
    await supabase.storage.from("project-files").remove([storagePath]);
    return { error: "Failed to record file in database." };
  }

  // Activity log
  await supabase.from("project_activity").insert({
    project_id: projectId,
    actor_id: userId,
    actor_label: actorLabel,
    action: `SLD sheet uploaded: ${file.name}`,
    metadata: { file_name: file.name, storage_path: storagePath },
  });

  revalidatePath(`/admin/projects/${projectId}`);
  return { error: null, success: true };
}

// ── Assign Designer ───────────────────────────────────────────────────────────
// Sets the assigned_designer_id and moves project to "assigned" status.

export async function assignDesigner(
  _prevState: AdminActionState,
  formData: FormData
): Promise<AdminActionState> {
  const supabase = await createClient();

  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return { error: "Not authenticated." };

  const projectId = formData.get("project_id") as string;
  const designerId = formData.get("designer_id") as string;

  if (!projectId) return { error: "Missing project ID." };
  if (!designerId) return { error: "Please select a designer." };

  // Verify designer exists and has designer role
  const { data: designerProfile } = await supabase
    .from("user_profiles")
    .select("id, display_name, role")
    .eq("id", designerId)
    .eq("role", "designer")
    .single();

  if (!designerProfile) return { error: "Selected user is not a valid designer." };

  const actorLabel = await getActorLabel(supabase, userData.user.id);

  const { error: updateError } = await supabase
    .from("projects")
    .update({
      assigned_designer_id: designerId,
      assigned_at: new Date().toISOString(),
      status: "assigned",
    })
    .eq("id", projectId);

  if (updateError) {
    console.error("assignDesigner error:", updateError);
    return { error: "Failed to assign designer." };
  }

  await supabase.from("project_activity").insert({
    project_id: projectId,
    actor_id: userData.user.id,
    actor_label: actorLabel,
    action: `Designer assigned: ${designerProfile.display_name}`,
    metadata: { designer_id: designerId, designer_name: designerProfile.display_name },
  });

  revalidatePath(`/admin/projects/${projectId}`);
  return { error: null, success: true };
}

// ── Request Revisions ─────────────────────────────────────────────────────────
// Admin sends TCP sheets back to designer with optional notes.

export async function requestRevisions(
  _prevState: AdminActionState,
  formData: FormData
): Promise<AdminActionState> {
  const supabase = await createClient();

  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return { error: "Not authenticated." };

  const projectId = formData.get("project_id") as string;
  const notes = (formData.get("revision_notes") as string)?.trim() || "";

  if (!projectId) return { error: "Missing project ID." };

  const actorLabel = await getActorLabel(supabase, userData.user.id);

  const { error: updateError } = await supabase
    .from("projects")
    .update({ status: "revisions_required" })
    .eq("id", projectId);

  if (updateError) {
    console.error("requestRevisions error:", updateError);
    return { error: "Failed to request revisions." };
  }

  const actionText = notes
    ? `Revisions requested: ${notes}`
    : "Revisions requested";

  await supabase.from("project_activity").insert({
    project_id: projectId,
    actor_id: userData.user.id,
    actor_label: actorLabel,
    action: actionText,
    metadata: notes ? { notes } : {},
  });

  revalidatePath(`/admin/projects/${projectId}`);
  return { error: null, success: true };
}

// ── Approve Design ────────────────────────────────────────────────────────────
// Admin approves TCP sheets; project moves to "approved" status.

export async function approveDesign(
  _prevState: AdminActionState,
  formData: FormData
): Promise<AdminActionState> {
  const supabase = await createClient();

  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return { error: "Not authenticated." };

  const projectId = formData.get("project_id") as string;
  if (!projectId) return { error: "Missing project ID." };

  const actorLabel = await getActorLabel(supabase, userData.user.id);

  const { error: updateError } = await supabase
    .from("projects")
    .update({ status: "approved" })
    .eq("id", projectId);

  if (updateError) {
    console.error("approveDesign error:", updateError);
    return { error: "Failed to approve design." };
  }

  await supabase.from("project_activity").insert({
    project_id: projectId,
    actor_id: userData.user.id,
    actor_label: actorLabel,
    action: "Design approved",
    metadata: {},
  });

  // Auto-enqueue permit package generation on approval.
  // Metadata is minimal here — admin can trigger a full enqueue from the UI
  // which includes TCD/file details.
  const packageJobId = await enqueueWorkflowJob(
    supabase,
    projectId,
    "generate_permit_package",
    { project_id: projectId, trigger: "design_approved" },
    userData.user.id
  );

  if (packageJobId) {
    await supabase.from("project_activity").insert({
      project_id: projectId,
      actor_id: userData.user.id,
      actor_label: actorLabel,
      action: "Package generation queued",
      metadata: { job_id: packageJobId, trigger: "design_approved" },
    });
  }

  revalidatePath(`/admin/projects/${projectId}`);
  return { error: null, success: true };
}

// ── Recompute Project ─────────────────────────────────────────────────────────
// Full compute pass: reassign jurisdiction + recalculate price.
// Logs to workflow_jobs for audit and future n8n pickup.

export type RecomputeProjectState = {
  error: string | null;
  jurisdictionMatched?: boolean;
  estimatedPrice?: number | null;
  ruleName?: string | null;
  sheetCount?: number | null;
};

export async function recomputeProject(
  _prevState: RecomputeProjectState,
  formData: FormData
): Promise<RecomputeProjectState> {
  const supabase = await createClient();

  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return { error: "Not authenticated." };

  const projectId = formData.get("project_id") as string;
  if (!projectId) return { error: "Missing project ID." };

  let result;
  try {
    result = await computeProject(supabase, projectId, userData.user.id);
  } catch (e) {
    console.error("recomputeProject error:", e);
    return { error: "Compute failed. Check server logs." };
  }

  revalidatePath(`/admin/projects/${projectId}`);
  return {
    error: null,
    jurisdictionMatched: result.outputs.jurisdiction_id !== null,
    estimatedPrice: result.outputs.estimated_price,
    ruleName: result.priceBreakdown?.rule_name ?? null,
    sheetCount: result.outputs.sheet_count,
  };
}

// ── Enqueue Permit Package Generation ────────────────────────────────────────
// Builds full metadata from project state, then inserts a workflow_jobs row.
// No PDF generation happens here — n8n picks up the pending job.

export type EnqueuePackageState = {
  error: string | null;
  jobId?: string | null;
};

export async function enqueuePackageGeneration(
  _prevState: EnqueuePackageState,
  formData: FormData
): Promise<EnqueuePackageState> {
  const supabase = await createClient();

  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return { error: "Not authenticated." };

  const projectId = formData.get("project_id") as string;
  if (!projectId) return { error: "Missing project ID." };

  // ── Fetch project ──────────────────────────────────────────────────────────
  const { data: project } = await supabase
    .from("projects")
    .select("id, status, jurisdiction_id, authority_type")
    .eq("id", projectId)
    .single();

  if (!project) return { error: "Project not found." };
  if (project.status !== "approved") return { error: "Design must be approved before generating package." };

  const actorLabel = await getActorLabel(supabase, userData.user.id);

  // ── Fetch jurisdiction ─────────────────────────────────────────────────────
  let jurisdiction = { id: null as string | null, authority_name: null as string | null, submission_method: null as string | null };
  let requiredDocuments: string[] = [];

  if (project.jurisdiction_id) {
    const { data: jur } = await supabase
      .from("jurisdictions")
      .select("id, authority_name, submission_method, requires_coi, requires_pe_stamp, requires_traffic_control_plan, requires_cover_sheet, requires_application_form")
      .eq("id", project.jurisdiction_id)
      .single();

    if (jur) {
      jurisdiction = { id: jur.id, authority_name: jur.authority_name, submission_method: jur.submission_method };
      if (jur.requires_coi) requiredDocuments.push("coi");
      if (jur.requires_pe_stamp) requiredDocuments.push("pe_stamp");
      if (jur.requires_traffic_control_plan) requiredDocuments.push("tcp");
      if (jur.requires_cover_sheet) requiredDocuments.push("cover_sheet");
      if (jur.requires_application_form) requiredDocuments.push("application_form");
    }
  }

  // ── Fetch selected TCDs (with storage paths) ───────────────────────────────
  const { data: tcdRows } = await supabase
    .from("project_tcd_selections")
    .select("id, tcd_library ( id, code, storage_path )")
    .eq("project_id", projectId)
    .order("sort_order", { ascending: true });

  const selectedTcds = (tcdRows ?? []).map((row: Record<string, unknown>) => {
    const lib = row.tcd_library as { id: string; code: string; storage_path: string | null } | null;
    return { id: lib?.id ?? "", code: lib?.code ?? "", storage_path: lib?.storage_path ?? null };
  });

  // ── Fetch SLD + TCP file IDs ───────────────────────────────────────────────
  const { data: filesData } = await supabase
    .from("project_files")
    .select("id, file_category")
    .eq("project_id", projectId)
    .in("file_category", ["sld_sheet", "tcp_pdf"]);

  const files = filesData ?? [];
  const sldIds = files.filter((f: { id: string; file_category: string }) => f.file_category === "sld_sheet").map((f: { id: string }) => f.id);
  const tcpIds = files.filter((f: { id: string; file_category: string }) => f.file_category === "tcp_pdf").map((f: { id: string }) => f.id);

  // ── Build metadata ─────────────────────────────────────────────────────────
  const metadata: PermitPackageMetadata = {
    project_id: projectId,
    required_documents: requiredDocuments,
    jurisdiction,
    selected_tcds: selectedTcds,
    file_ids: {
      sld: sldIds,
      tcp: tcpIds,
      cover_template_id: null, // TODO: allow admin to select cover template
    },
  };

  // ── Enqueue ────────────────────────────────────────────────────────────────
  const jobId = await enqueueWorkflowJob(
    supabase,
    projectId,
    "generate_permit_package",
    metadata as unknown as Record<string, unknown>,
    userData.user.id
  );

  if (!jobId) return { error: "Failed to enqueue job. Please try again." };

  await supabase.from("project_activity").insert({
    project_id: projectId,
    actor_id: userData.user.id,
    actor_label: actorLabel,
    action: "Package generation queued",
    metadata: { job_id: jobId },
  });

  revalidatePath(`/admin/projects/${projectId}`);
  return { error: null, jobId };
}

// ── TCD Selection ─────────────────────────────────────────────────────────────
// Add one or more TCD library items to a project's TCD selection.

export async function addTCDsToProject(
  _prevState: AdminActionState,
  formData: FormData
): Promise<AdminActionState> {
  const supabase = await createClient();

  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return { error: "Not authenticated." };

  const projectId = formData.get("project_id") as string;
  const tcdIdsRaw = formData.get("tcd_ids") as string;

  if (!projectId) return { error: "Missing project ID." };
  if (!tcdIdsRaw) return { error: "No TCDs selected." };

  let tcdIds: string[];
  try {
    tcdIds = JSON.parse(tcdIdsRaw);
  } catch {
    return { error: "Invalid TCD selection." };
  }
  if (!Array.isArray(tcdIds) || tcdIds.length === 0) return { error: "No TCDs selected." };

  const rows = tcdIds.map((tcdId: string) => ({
    project_id: projectId,
    tcd_library_item_id: tcdId,
    added_by: userData.user!.id,
    sort_order: 0,
  }));

  const { error: insertError } = await supabase
    .from("project_tcd_selections")
    .insert(rows);

  // Conflict (already selected) is fine — ignore duplicate-key errors.
  if (insertError && insertError.code !== "23505") {
    console.error("addTCDsToProject error:", insertError);
    return { error: "Failed to save TCD selection." };
  }

  revalidatePath(`/admin/projects/${projectId}`);
  return { error: null, success: true };
}

// Remove a single TCD selection row by its ID.

export async function removeTCDFromProject(
  _prevState: AdminActionState,
  formData: FormData
): Promise<AdminActionState> {
  const supabase = await createClient();

  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return { error: "Not authenticated." };

  const selectionId = formData.get("selection_id") as string;
  const projectId = formData.get("project_id") as string;

  if (!selectionId) return { error: "Missing selection ID." };
  if (!projectId) return { error: "Missing project ID." };

  const { error } = await supabase
    .from("project_tcd_selections")
    .delete()
    .eq("id", selectionId);

  if (error) {
    console.error("removeTCDFromProject error:", error);
    return { error: "Failed to remove TCD." };
  }

  revalidatePath(`/admin/projects/${projectId}`);
  return { error: null, success: true };
}
