"use server";

import { execFile } from "node:child_process";
import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

import { revalidatePath } from "next/cache";
import sharp from "sharp";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { computeProject } from "@/lib/compute/projectCompute";
import { enqueueWorkflowJob } from "@/lib/workflow/enqueue";
import type { PermitPackageMetadata, TemplateSlot } from "@/types/workflow";
import { getStoragePath, categoryToFileType } from "@/lib/constants/files";
import { resolveRequirements, type AuthorityRequirementDefaults, type ProjectRequirementOverrides } from "@/lib/utils/resolveRequirements";
import { buildPackageAssembly } from "@/lib/utils/packageAssembly";
import { normalizeUpperFormField } from "@/lib/utils/textNormalization";
import { parseAnnotations, type CoverMapAnnotations } from "@/types/coverMapAnnotations";

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

  // Basic field hygiene. job_name is permit-facing — normalize to uppercase.
  const job_name = normalizeUpperFormField(formData, "job_name");
  if (!job_name) return { error: "Job Name is required." };

  // job_type and township are intentionally excluded from the patch — they
  // still exist in the DB but are no longer managed via this form. Omitting
  // them here preserves any existing values rather than clobbering them.
  //
  // Phase A — street_address and zip_code are now the primary address inputs.
  // job_name and job_address are still saved when present in form data so the
  // legacy "Legacy fields" disclosure in EditIntakeForm continues to work,
  // but they're no longer auto-derived on edit.
  //
  // Permit-facing text fields are normalized to uppercase via
  // normalizeUpperFormField. Enum keys (type_of_plan, authority_type), opaque
  // identifiers (job_number_client), and date strings are preserved as-is.
  const patch: Record<string, string | null> = {
    job_name,
    job_address:             normalizeUpperFormField(formData, "job_address"),
    street_address:          normalizeUpperFormField(formData, "street_address"),
    zip_code:                normalizeUpperFormField(formData, "zip_code"),
    job_number_client:      (formData.get("job_number_client") as string)?.trim()      || null,
    rhino_pm:                normalizeUpperFormField(formData, "rhino_pm"),
    comcast_manager:         normalizeUpperFormField(formData, "comcast_manager"),
    submitted_to_fiberpro:  (formData.get("submitted_to_fiberpro") as string)          || null,
    requested_approval_date:(formData.get("requested_approval_date") as string)        || null,
    type_of_plan:           (formData.get("type_of_plan") as string)                   || null,
    authority_type:         (formData.get("authority_type") as string)                 || null,
    county:                  normalizeUpperFormField(formData, "county"),
    city:                    normalizeUpperFormField(formData, "city"),
    state:                   normalizeUpperFormField(formData, "state"),
    milepost_start:          normalizeUpperFormField(formData, "milepost_start"),
    milepost_end:            normalizeUpperFormField(formData, "milepost_end"),
    // notes intentionally excluded — no longer editable after project creation
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

  // Use service client for BOTH storage upload and DB insert — bypasses RLS.
  // Auth + role is already verified above via the user session.
  const serviceClient = createServiceClient();
  const { error: uploadError } = await serviceClient.storage
    .from("project-files")
    .upload(storagePath, file, { contentType: file.type, upsert: false });

  if (uploadError) {
    console.error("SLD upload error:", uploadError.message, uploadError);
    return { error: `File upload failed: ${uploadError.message}` };
  }

  const actorLabel = await getActorLabel(supabase, userId);

  // Create project_files record — service client to bypass RLS, same as storage upload.
  const { error: dbError } = await serviceClient.from("project_files").insert({
    project_id: projectId,
    uploaded_by: userId,
    uploader_label: actorLabel,
    file_category: "sld_sheet",
    file_type: "sld",
    file_name: file.name,
    storage_path: storagePath,
    file_size_bytes: file.size,
    mime_type: file.type,
    source: "admin_upload",
  });

  if (dbError) {
    console.error("SLD file record error:", dbError);
    // Clean up uploaded storage file on DB failure
    await serviceClient.storage.from("project-files").remove([storagePath]);
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

// ── Delete SLD File ───────────────────────────────────────────────────────────
// Admin removes an SLD sheet — deletes from storage and the project_files record.

export async function deleteSLDFile(
  _prevState: AdminActionState,
  formData: FormData
): Promise<AdminActionState> {
  const supabase = await createClient();

  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return { error: "Not authenticated." };

  const fileId = formData.get("file_id") as string;
  const projectId = formData.get("project_id") as string;
  if (!fileId || !projectId) return { error: "Missing file or project ID." };

  const serviceClient = createServiceClient();

  // Verify the file belongs to this project and is an SLD sheet
  const { data: fileRecord } = await serviceClient
    .from("project_files")
    .select("id, storage_path")
    .eq("id", fileId)
    .eq("project_id", projectId)
    .eq("file_category", "sld_sheet")
    .single();

  if (!fileRecord) return { error: "File not found." };

  // Remove from storage (best-effort — proceed to DB delete even if storage is already gone)
  await serviceClient.storage.from("project-files").remove([fileRecord.storage_path]);

  const { error: dbError } = await serviceClient
    .from("project_files")
    .delete()
    .eq("id", fileId);

  if (dbError) {
    console.error("Delete SLD file error:", dbError);
    return { error: "Failed to delete file." };
  }

  revalidatePath(`/admin/projects/${projectId}`);
  return { error: null, success: true };
}

// ── Upload TCP (admin) ────────────────────────────────────────────────────────
// Admin upload of TCP files — same storage/DB pattern as SLD but tcp_pdf category.
// Does NOT check designer assignment or change project status.

export async function uploadTCPAdmin(
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
  const storagePath = `${projectId}/tcp/${Date.now()}_${safeFileName}`;

  const serviceClient = createServiceClient();
  const { error: uploadError } = await serviceClient.storage
    .from("project-files")
    .upload(storagePath, file, { contentType: file.type, upsert: false });

  if (uploadError) {
    console.error("Admin TCP upload error:", uploadError.message, uploadError);
    return { error: `File upload failed: ${uploadError.message}` };
  }

  const actorLabel = await getActorLabel(supabase, userId);

  const { error: dbError } = await serviceClient.from("project_files").insert({
    project_id: projectId,
    uploaded_by: userId,
    uploader_label: actorLabel,
    file_category: "tcp_pdf",
    file_type: "tcp",
    file_name: file.name,
    storage_path: storagePath,
    file_size_bytes: file.size,
    mime_type: file.type,
    source: "admin_upload",
  });

  if (dbError) {
    console.error("Admin TCP file record error:", dbError);
    await serviceClient.storage.from("project-files").remove([storagePath]);
    return { error: "Failed to record file in database." };
  }

  await supabase.from("project_activity").insert({
    project_id: projectId,
    actor_id: userId,
    actor_label: actorLabel,
    action: `TCP sheet uploaded (admin): ${file.name}`,
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

  // Guard: cannot assign a designer to a closed or cancelled project.
  const { data: projectRow } = await supabase
    .from("projects")
    .select("status")
    .eq("id", projectId)
    .single();

  if (projectRow?.status === "closed" || projectRow?.status === "cancelled") {
    return { error: "Cannot assign a designer to a closed or cancelled project." };
  }

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
      unified_status: "in_production",
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

// ── Mark Setup Complete ───────────────────────────────────────────────────────
// Transitions project from intake_review or waiting_on_client → ready_for_assignment.
// Validates minimum setup requirements before allowing the transition:
//   - authority must be selected
//   - at least one SLD sheet must be uploaded
//   - at least one TCD must be selected

export async function markSetupComplete(
  _prevState: AdminActionState,
  formData: FormData
): Promise<AdminActionState> {
  const supabase = await createClient();

  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return { error: "Not authenticated." };

  const projectId = formData.get("project_id") as string;
  if (!projectId) return { error: "Missing project ID." };

  // Fetch current status + authority to validate preconditions
  const { data: projectRow } = await supabase
    .from("projects")
    .select("status, authority_id, jurisdiction_id")
    .eq("id", projectId)
    .single();

  if (!projectRow) return { error: "Project not found." };

  const currentStatus = projectRow.status as string;
  const allowedFromStatuses = ["intake_review", "waiting_on_client"];
  if (!allowedFromStatuses.includes(currentStatus)) {
    return { error: `Setup complete is only available from Intake Review or Waiting on Client. Current status: ${currentStatus}.` };
  }

  // ── Validate: authority selected ────────────────────────────────────────────
  // Accept either a direct authority_id or a jurisdiction that has an authority
  let hasAuthority = !!(projectRow as Record<string, unknown>).authority_id;
  if (!hasAuthority && (projectRow as Record<string, unknown>).jurisdiction_id) {
    const { data: jurAuth } = await supabase
      .from("jurisdictions")
      .select("authority_profile_id")
      .eq("id", (projectRow as Record<string, unknown>).jurisdiction_id as string)
      .maybeSingle();
    hasAuthority = !!jurAuth?.authority_profile_id;
  }
  if (!hasAuthority) {
    return { error: "Setup is not complete: no permitting authority selected. Set the authority before marking setup complete." };
  }

  // ── Validate: SLD sheet on file ─────────────────────────────────────────────
  const { count: sldCount } = await supabase
    .from("project_files")
    .select("id", { count: "exact", head: true })
    .eq("project_id", projectId)
    .eq("file_category", "sld_sheet");

  if (!sldCount || sldCount === 0) {
    return { error: "Setup is not complete: no SLD sheet on file. Upload an SLD before marking setup complete." };
  }

  // ── Validate: at least one TCD selected ─────────────────────────────────────
  const { count: tcdCount } = await supabase
    .from("project_tcd_selections")
    .select("id", { count: "exact", head: true })
    .eq("project_id", projectId);

  if (!tcdCount || tcdCount === 0) {
    return { error: "Setup is not complete: no TCD devices selected. Select at least one TCD before marking setup complete." };
  }

  // ── Transition ───────────────────────────────────────────────────────────────
  const { error: updateError } = await supabase
    .from("projects")
    .update({ status: "ready_for_assignment", unified_status: "new_project" })
    .eq("id", projectId);

  if (updateError) {
    console.error("markSetupComplete error:", updateError);
    return { error: "Failed to update project status." };
  }

  const actorLabel = await getActorLabel(supabase, userData.user.id);

  await supabase.from("project_activity").insert({
    project_id: projectId,
    actor_id: userData.user.id,
    actor_label: actorLabel,
    action: "Setup marked complete — ready for assignment",
    metadata: {},
  });

  revalidatePath(`/admin/projects/${projectId}`);
  return { error: null, success: true };
}

// ── Request Revisions ─────────────────────────────────────────────────────────
// Admin sends TCP sheets back to designer with optional notes.
// Also creates a project_updates row so the notes appear in the status feed
// and are visible to the designer in the revision banner.

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
  if (!notes) return { error: "Revision notes are required." };

  const actorLabel = await getActorLabel(supabase, userData.user.id);

  const { data: updated, error: updateError } = await supabase
    .from("projects")
    .update({ status: "revisions_required", unified_status: "in_production" })
    .eq("id", projectId)
    .in("status", ["waiting_for_admin_review"])
    .select("id");

  if (updateError) {
    console.error("requestRevisions error:", updateError);
    return { error: "Failed to request revisions." };
  }
  if (!updated?.length) return { error: "Cannot request revisions — project must be in Admin Review state." };

  const actionText = notes
    ? `Revisions requested: ${notes}`
    : "Revisions requested";

  await Promise.all([
    supabase.from("project_activity").insert({
      project_id: projectId,
      actor_id: userData.user.id,
      actor_label: actorLabel,
      action: actionText,
      metadata: notes ? { notes } : {},
    }),
    // Creates a status update row so the revision notes appear in the feed
    // and the designer can read them in the design-tab revision banner.
    supabase.from("project_updates").insert({
      project_id: projectId,
      status: "revisions_required",
      body: notes || null,
      created_by: actorLabel,
    }),
  ]);

  revalidatePath(`/admin/projects/${projectId}`);
  return { error: null, success: true };
}

// ── Approve Design ────────────────────────────────────────────────────────────
// Admin approves TCP sheets; project moves to "approved" status.
// Also creates a project_updates row so the approval appears in the status feed.

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

  const { data: updated, error: updateError } = await supabase
    .from("projects")
    .update({ status: "approved", unified_status: "pending_review" })
    .eq("id", projectId)
    .in("status", ["waiting_for_admin_review"])
    .select("id");

  if (updateError) {
    console.error("approveDesign error:", updateError);
    return { error: "Failed to approve design." };
  }
  if (!updated?.length) return { error: "Cannot approve — project must be in Admin Review state." };

  await Promise.all([
    supabase.from("project_activity").insert({
      project_id: projectId,
      actor_id: userData.user.id,
      actor_label: actorLabel,
      action: "Design approved",
      metadata: {},
    }),
    supabase.from("project_updates").insert({
      project_id: projectId,
      status: "approved",
      body: null,
      created_by: actorLabel,
    }),
  ]);

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
  warnings?: string[];
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

  const coverTemplateId = (formData.get("cover_template_id") as string | null)?.trim() || null;

  // ── Fetch project (including new override + blueprint columns) ─────────────
  const { data: projectRaw } = await supabase
    .from("projects")
    .select(
      "id, status, jurisdiction_id, authority_type, company_id, job_type, authority_id, " +
      "pe_required, blueprint_id, " +
      "req_application_override, req_certification_override, req_coi_override, " +
      "req_hard_copies_override, req_certified_check_override, req_notification_only_override"
    )
    .eq("id", projectId)
    .single();

  // Cast to Record so TypeScript doesn't complain about columns not yet in the generated types.
  const project = projectRaw as Record<string, unknown> | null;

  if (!project) return { error: "Project not found." };
  if (project.status !== "approved") return { error: "Design must be approved before generating package." };

  // ── Resolve effective authority ID ────────────────────────────────────────
  // Primary: projects.authority_id (set directly by admin).
  // Fallback: jurisdictions.authority_profile_id (if jurisdiction is set and authority is not).
  // jurisdiction_id is now optional supporting data — not a hard requirement.
  let effectiveAuthorityId = (project.authority_id as string | null) ?? null;
  if (!effectiveAuthorityId && project.jurisdiction_id) {
    const { data: jurAuth } = await supabase
      .from("jurisdictions")
      .select("authority_profile_id")
      .eq("id", project.jurisdiction_id)
      .single();
    effectiveAuthorityId = jurAuth?.authority_profile_id ?? null;
  }

  if (!effectiveAuthorityId) {
    return { error: "No authority selected — set the permitting authority on this project before generating a package." };
  }

  const actorLabel = await getActorLabel(supabase, userData.user.id);

  // ── Fetch authority profile requirement defaults ───────────────────────────
  const { data: authorityProfileRaw } = await supabase
    .from("authority_profiles")
    .select(
      "requires_application, requires_certification, requires_coi, requires_pe, " +
      "requires_hard_copies, requires_certified_check, notification_only"
    )
    .eq("id", effectiveAuthorityId)
    .single();

  // Cast to Record — these columns exist in the DB but may not be in the generated types yet.
  const authorityProfile = authorityProfileRaw as unknown as Record<string, boolean | null> | null;

  // ── Resolve effective requirements (authority defaults + project overrides) ─
  // Only document-output items go into required_documents (application_form,
  // certification_form, coi, pe_stamp). Operational flags (hard_copies,
  // certified_check, notification_only) are not PDF outputs.
  let requiredDocuments: string[] = [];
  if (authorityProfile) {
    const overrides: ProjectRequirementOverrides = {
      req_application_override:       (project.req_application_override       as boolean | null) ?? null,
      req_certification_override:     (project.req_certification_override     as boolean | null) ?? null,
      req_coi_override:               (project.req_coi_override               as boolean | null) ?? null,
      req_hard_copies_override:       (project.req_hard_copies_override       as boolean | null) ?? null,
      req_certified_check_override:   (project.req_certified_check_override   as boolean | null) ?? null,
      req_notification_only_override: (project.req_notification_only_override as boolean | null) ?? null,
      pe_required:                    (project.pe_required                    as boolean | null) ?? null,
    };
    const defaults: AuthorityRequirementDefaults = {
      requires_application:     authorityProfile.requires_application     ?? false,
      requires_certification:   authorityProfile.requires_certification   ?? false,
      requires_coi:             authorityProfile.requires_coi             ?? false,
      requires_pe:              authorityProfile.requires_pe              ?? false,
      requires_hard_copies:     authorityProfile.requires_hard_copies     ?? false,
      requires_certified_check: authorityProfile.requires_certified_check ?? false,
      notification_only:        authorityProfile.notification_only        ?? false,
    };
    const resolved = resolveRequirements(defaults, overrides);
    if (resolved.requiresApplication)   requiredDocuments.push("application_form");
    if (resolved.requiresCertification) requiredDocuments.push("certification_form");
    if (resolved.requiresCoi)           requiredDocuments.push("coi");
    if (resolved.requiresPe)            requiredDocuments.push("pe_stamp");
  }

  // ── Fetch jurisdiction metadata (informational only — not a gate) ──────────
  let jurisdiction = {
    id: null as string | null,
    authority_name: null as string | null,
    submission_method: null as string | null,
  };
  if (project.jurisdiction_id) {
    const { data: jur } = await supabase
      .from("jurisdictions")
      .select("id, authority_name, submission_method")
      .eq("id", project.jurisdiction_id)
      .single();
    if (jur) {
      jurisdiction = {
        id: jur.id,
        authority_name: jur.authority_name,
        submission_method: jur.submission_method,
      };
    }
  }

  // ── Fetch selected TCDs (ordered by sort_order) ───────────────────────────
  const { data: tcdRows } = await supabase
    .from("project_tcd_selections")
    .select("id, tcd_library ( id, code, storage_path )")
    .eq("project_id", projectId)
    .order("sort_order", { ascending: true });

  const selectedTcds = (tcdRows ?? []).map((row: Record<string, unknown>) => {
    const lib = row.tcd_library as { id: string; code: string; storage_path: string | null } | null;
    return { id: lib?.id ?? "", code: lib?.code ?? "", storage_path: lib?.storage_path ?? null };
  });

  // ── Fetch SLD + TCP files — ordered by manual sort_order, then upload time ──
  // TCP rows may carry an admin-assigned sort_order (Phase A). Existing rows
  // have sort_order = NULL and fall back to created_at ASC, preserving the
  // previous deterministic upload-order assembly. SLD rows always carry NULL
  // sort_order today, so their relative order is unchanged.
  // storage_path is included so n8n can download the actual PDF bytes.
  const { data: filesData } = await supabase
    .from("project_files")
    .select("id, file_category, storage_path")
    .eq("project_id", projectId)
    .in("file_category", ["sld_sheet", "tcp_pdf"])
    .order("sort_order", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: true });

  const files = filesData ?? [];
  type FileRow = { id: string; file_category: string; storage_path: string };
  const sldFiles = (files as FileRow[]).filter((f) => f.file_category === "sld_sheet");
  const tcpFiles = (files as FileRow[]).filter((f) => f.file_category === "tcp_pdf");
  const sldIds = sldFiles.map((f) => f.id);
  const tcpIds = tcpFiles.map((f) => f.id);

  // ── Pre-flight: design files + TCD selection ───────────────────────────────
  if (sldIds.length === 0) {
    return { error: "No SLD sheet on file — upload one before generating a package." };
  }
  if (selectedTcds.length === 0) {
    return { error: "No TCD devices selected — select at least one before generating a package." };
  }
  if (tcpIds.length === 0) {
    return { error: "No TCP design files on file — upload TCP sheets before generating a package." };
  }

  // ── Resolve blueprint ──────────────────────────────────────────────────────
  // Priority 1: projects.blueprint_id (admin-selected override for this project)
  // Priority 2: authority's current active blueprint
  //
  // Defensive guard: only accept overrides that are currently status="active"
  // and owned by the project's effective authority. Drafts, inactives, and
  // cross-authority overrides are ignored with a warning so the package falls
  // through to the authority default instead.
  const warnings: string[] = [];
  let blueprintId: string | null = (project.blueprint_id as string | null) ?? null;
  if (blueprintId) {
    const { data: overrideBp } = await supabase
      .from("package_blueprints")
      .select("authority_profile_id, status")
      .eq("id", blueprintId)
      .maybeSingle();
    const overrideRow = overrideBp as
      | { authority_profile_id: string | null; status: string | null }
      | null;

    if (!overrideRow) {
      warnings.push(
        "Project blueprint override no longer exists — falling back to authority default."
      );
      blueprintId = null;
    } else if (overrideRow.authority_profile_id !== effectiveAuthorityId) {
      warnings.push(
        "Project blueprint override belongs to a different authority — falling back to authority default."
      );
      blueprintId = null;
    } else if (overrideRow.status !== "active") {
      warnings.push(
        "Project package template override is not active — falling back to authority default."
      );
      blueprintId = null;
    }
  }
  if (!blueprintId) {
    const { data: bp } = await supabase
      .from("package_blueprints")
      .select("id")
      .eq("authority_profile_id", effectiveAuthorityId)
      .eq("status", "active")
      .maybeSingle();
    blueprintId = bp?.id ?? null;
    if (!blueprintId) {
      warnings.push(
        "No active package template configured for this authority — cover and authority forms will use attribute-based fallback resolution."
      );
      console.warn(
        `enqueuePackageGeneration: no active blueprint for authority ${effectiveAuthorityId} — ` +
        `cover and authority forms will use attribute-based fallback resolution`
      );
    }
  }

  // ── Wrapper PDF coverage check (non-blocking) ─────────────────────────────
  // If wrapper IDs are configured but their PDFs haven't been uploaded yet,
  // generation silently falls back to raw PDF + job-number overlay. Warn the
  // admin before queuing so they know to upload wrapper shells first.
  if (blueprintId) {
    const { data: bpWrappers } = await supabase
      .from("package_blueprints")
      .select("tcp_wrapper_id, tcd_wrapper_id, sld_wrapper_id")
      .eq("id", blueprintId)
      .maybeSingle();

    if (bpWrappers) {
      const wrapperIdMap: Array<{ id: string | null; label: string }> = [
        { id: bpWrappers.tcp_wrapper_id as string | null, label: "TCP" },
        { id: bpWrappers.tcd_wrapper_id as string | null, label: "TCD" },
        { id: bpWrappers.sld_wrapper_id as string | null, label: "SLD" },
      ];
      const populatedIds = wrapperIdMap.filter((w) => w.id).map((w) => w.id as string);
      if (populatedIds.length > 0) {
        const { data: wrapperTemplates } = await supabase
          .from("page_templates")
          .select("id, name, storage_path")
          .in("id", populatedIds);

        for (const { id, label } of wrapperIdMap.filter((w) => w.id)) {
          const tmpl = (wrapperTemplates ?? []).find((t) => t.id === id);
          if (tmpl && !tmpl.storage_path) {
            warnings.push(
              `${label} wrapper PDF not uploaded — ${label} sheets will use raw PDF. ` +
              `Upload a PDF at Settings → Page Templates → "${tmpl.name}".`
            );
          }
        }
      }
    }
  }

  // ── Resolve blueprint slots (wrapper + cover template details) ───────────────
  // Fetch the full template row for every slot configured in the blueprint so
  // n8n receives storage_path, placement_box, and field_mappings without
  // needing additional DB calls at generation time.
  let blueprintSlots: PermitPackageMetadata["blueprint_slots"] = undefined;
  if (blueprintId) {
    const { data: bpSlots } = await supabase
      .from("package_blueprints")
      .select(
        "cover_page_template_id, tcp_wrapper_id, tcd_wrapper_id, sld_wrapper_id, " +
        "app_page_template_id, cert_page_template_id"
      )
      .eq("id", blueprintId)
      .maybeSingle();

    if (bpSlots) {
      const slotRecord = bpSlots as unknown as Record<string, string | null>;
      // Collect all non-null template IDs for a single batched fetch.
      const slotIdMap: Record<string, string | null> = {
        cover:       slotRecord.cover_page_template_id,
        tcp_wrapper: slotRecord.tcp_wrapper_id,
        tcd_wrapper: slotRecord.tcd_wrapper_id,
        sld_wrapper: slotRecord.sld_wrapper_id,
        app_form:    slotRecord.app_page_template_id,
        cert_form:   slotRecord.cert_page_template_id,
      };

      const nonNullIds = Object.values(slotIdMap).filter((id): id is string => !!id);
      let templateRows: Array<{
        id: string;
        name: string;
        storage_path: string | null;
        placement_box: Record<string, unknown> | null;
        field_mappings: Record<string, unknown> | null;
      }> = [];

      if (nonNullIds.length > 0) {
        const { data: tmplData } = await supabase
          .from("page_templates")
          .select("id, name, storage_path, placement_box, field_mappings")
          .in("id", nonNullIds);
        templateRows = (tmplData ?? []) as typeof templateRows;
      }

      function resolveSlot(id: string | null): TemplateSlot | null {
        if (!id) return null;
        const row = templateRows.find((t) => t.id === id);
        if (!row) return null;
        const pb = row.placement_box;
        const placementBox =
          pb &&
          typeof pb.x      === "number" &&
          typeof pb.y      === "number" &&
          typeof pb.width  === "number" &&
          typeof pb.height === "number"
            ? { x: pb.x as number, y: pb.y as number, width: pb.width as number, height: pb.height as number }
            : null;
        return {
          id:             row.id,
          name:           row.name,
          storage_path:   row.storage_path,
          placement_box:  placementBox,
          field_mappings: row.field_mappings,
        };
      }

      blueprintSlots = {
        cover:       resolveSlot(slotIdMap.cover),
        tcp_wrapper: resolveSlot(slotIdMap.tcp_wrapper),
        tcd_wrapper: resolveSlot(slotIdMap.tcd_wrapper),
        sld_wrapper: resolveSlot(slotIdMap.sld_wrapper),
        app_form:    resolveSlot(slotIdMap.app_form),
        cert_form:   resolveSlot(slotIdMap.cert_form),
      };
    }
  }

  // ── Build assembly (page manifest + ordered inputs) ───────────────────────
  const assembly = buildPackageAssembly({
    projectId,
    tcpFileIds:      tcpIds,
    tcdSelections:   selectedTcds.map((t) => ({ tcdItemId: t.id, code: t.code })),
    sldFileIds:      sldIds,
    coverTemplateId,
    blueprintId,
    requiredDocuments,
    jurisdiction,
    tcdStorageItems: selectedTcds,
  });

  // ── Build metadata ───────────────────────────────────────────────────��─────
  const metadata: PermitPackageMetadata = {
    project_id: projectId,
    required_documents: requiredDocuments,
    jurisdiction,
    selected_tcds: selectedTcds,
    file_ids: {
      sld: sldIds,
      tcp: tcpIds,
      cover_template_id: coverTemplateId,
    },
    // Storage paths alongside IDs so n8n can download PDFs without DB lookups.
    file_details: {
      sld: sldFiles.map((f) => ({ id: f.id, storage_path: f.storage_path })),
      tcp: tcpFiles.map((f) => ({ id: f.id, storage_path: f.storage_path })),
    },
    blueprint_id: blueprintId,
    page_manifest: assembly.manifest,
    // Fully resolved blueprint slot templates — n8n uses these for wrapper execution.
    // If blueprint_slots is present, n8n MUST use these instead of raw PDFs.
    ...(blueprintSlots ? { blueprint_slots: blueprintSlots } : {}),
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

  // Fire n8n webhook synchronously so failures surface to the UI immediately.
  const webhookUrl = process.env.N8N_WEBHOOK_URL;
  if (webhookUrl) {
    let webhookError: string | null = null;
    try {
      const res = await fetch(webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ job_id: jobId, project_id: projectId, job_type: "generate_permit_package" }),
      });
      if (!res.ok) {
        webhookError = `n8n returned HTTP ${res.status}`;
      }
    } catch (err) {
      webhookError = err instanceof Error ? err.message : "Webhook unreachable";
    }

    if (webhookError) {
      console.error(`enqueuePackageGeneration: webhook failed for job ${jobId}: ${webhookError}`);
      await supabase
        .from("workflow_jobs")
        .update({ status: "failed", error: webhookError })
        .eq("id", jobId);
      revalidatePath(`/admin/projects/${projectId}`);
      return { error: `Package job created but failed to notify n8n: ${webhookError}` };
    }
  } else {
    console.warn(
      `enqueuePackageGeneration: N8N_WEBHOOK_URL not set — job ${jobId} queued but n8n was not notified`
    );
  }

  revalidatePath(`/admin/projects/${projectId}`);
  return { error: null, jobId, warnings: warnings.length > 0 ? warnings : undefined };
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

  // Determine the next sort_order value so new items are appended after existing ones.
  const { data: maxRow } = await supabase
    .from("project_tcd_selections")
    .select("sort_order")
    .eq("project_id", projectId)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  const nextSortOrder = (maxRow?.sort_order ?? -1) + 1;

  const rows = tcdIds.map((tcdId: string, index: number) => ({
    project_id: projectId,
    tcd_library_item_id: tcdId,
    added_by: userData.user!.id,
    sort_order: nextSortOrder + index,
  }));

  const { error: insertError } = await supabase
    .from("project_tcd_selections")
    .insert(rows);

  // Conflict (already selected) is fine — ignore duplicate-key errors.
  if (insertError && insertError.code !== "23505") {
    console.error("addTCDsToProject error:", insertError);
    return { error: "Failed to save TCD selection." };
  }

  // Fetch codes for the newly added TCDs for the activity log.
  const { data: tcdRows } = await supabase
    .from("tcd_library")
    .select("code")
    .in("id", tcdIds);
  const codes = (tcdRows ?? []).map((r: { code: string }) => r.code).join(", ");

  const actorLabel = await getActorLabel(supabase, userData.user!.id);
  await supabase.from("project_activity").insert({
    project_id: projectId,
    actor_id: userData.user!.id,
    actor_label: actorLabel,
    action: codes ? `TCD added: ${codes}` : `TCD added (${tcdIds.length} item${tcdIds.length === 1 ? "" : "s"})`,
    metadata: { tcd_ids: tcdIds },
  });

  revalidatePath(`/admin/projects/${projectId}`);
  return { error: null, success: true };
}

// ── Set Project Authority ─────────────────────────────────────────────────────
// Admin selects which authority_profile applies to this project.
// Auto-defaults pe_required from authority_profiles.requires_pe so the
// admin doesn't have to set it manually every time.
// Also clears any stale blueprint override that belongs to a different authority,
// so the project never points at a cross-authority template.

export async function setProjectAuthority(
  _prevState: AdminActionState,
  formData: FormData
): Promise<AdminActionState> {
  const supabase = await createClient();

  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return { error: "Not authenticated." };

  const projectId = formData.get("project_id") as string;
  if (!projectId) return { error: "Missing project ID." };

  const rawAuthorityId = (formData.get("authority_id") as string | null)?.trim() || null;

  // Load current project state so we can decide whether to clear a stale
  // blueprint override after the authority changes.
  const { data: currentProjectRaw } = await supabase
    .from("projects")
    .select("blueprint_id, jurisdiction_id")
    .eq("id", projectId)
    .single();
  const currentProject = currentProjectRaw as {
    blueprint_id: string | null;
    jurisdiction_id: string | null;
  } | null;

  // Auto-default pe_required from the selected authority's requires_pe.
  // If authority is cleared → reset pe_required to null.
  let defaultPeRequired: boolean | null = null;
  let authorityName: string | null = null;
  if (rawAuthorityId) {
    const { data: auth } = await supabase
      .from("authority_profiles")
      .select("name, requires_pe")
      .eq("id", rawAuthorityId)
      .single();
    if (auth) {
      defaultPeRequired = auth.requires_pe;
      authorityName = (auth as { name: string; requires_pe: boolean }).name ?? null;
    }
  }

  // Compute the effective authority that this project will have AFTER the save:
  // direct authority_id wins, otherwise fall back to jurisdictions.authority_profile_id.
  let newEffectiveAuthorityId: string | null = rawAuthorityId;
  if (!newEffectiveAuthorityId && currentProject?.jurisdiction_id) {
    const { data: jurAuth } = await supabase
      .from("jurisdictions")
      .select("authority_profile_id")
      .eq("id", currentProject.jurisdiction_id)
      .single();
    newEffectiveAuthorityId = (jurAuth?.authority_profile_id as string | null) ?? null;
  }

  // Decide whether to clear blueprint_id. NULL means "use authority default", so
  // we never auto-assign — we only clear stale overrides that belonged to a
  // different authority than the one now in effect.
  let clearBlueprint = false;
  if (currentProject?.blueprint_id) {
    if (!newEffectiveAuthorityId) {
      clearBlueprint = true;
    } else {
      const { data: bpAuth } = await supabase
        .from("package_blueprints")
        .select("authority_profile_id")
        .eq("id", currentProject.blueprint_id)
        .maybeSingle();
      const bpAuthorityId = (bpAuth?.authority_profile_id as string | null) ?? null;
      if (bpAuthorityId !== newEffectiveAuthorityId) {
        clearBlueprint = true;
      }
    }
  }

  const updatePatch: Record<string, string | boolean | null> = {
    authority_id: rawAuthorityId,
    pe_required: defaultPeRequired,
  };
  if (clearBlueprint) updatePatch.blueprint_id = null;

  const { error: updateError } = await supabase
    .from("projects")
    .update(updatePatch)
    .eq("id", projectId);

  if (updateError) {
    console.error("setProjectAuthority error:", updateError);
    return { error: "Failed to save authority." };
  }

  const actorLabel = await getActorLabel(supabase, userData.user.id);
  await supabase.from("project_activity").insert({
    project_id: projectId,
    actor_id: userData.user.id,
    actor_label: actorLabel,
    action: rawAuthorityId
      ? `Authority set: ${authorityName ?? rawAuthorityId}`
      : "Authority cleared",
    metadata: rawAuthorityId ? { authority_id: rawAuthorityId } : {},
  });

  if (clearBlueprint) {
    await supabase.from("project_activity").insert({
      project_id: projectId,
      actor_id: userData.user.id,
      actor_label: actorLabel,
      action: "Package blueprint cleared (authority changed; previous override belonged to a different authority)",
      metadata: {},
    });
  }

  revalidatePath(`/admin/projects/${projectId}`);
  return { error: null, success: true };
}

// ── Set PE Required (manual override) ────────────────────────────────────────
// Admin can override the pe_required flag independently of the authority.

export async function setProjectPeRequired(
  _prevState: AdminActionState,
  formData: FormData
): Promise<AdminActionState> {
  const supabase = await createClient();

  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return { error: "Not authenticated." };

  const projectId = formData.get("project_id") as string;
  if (!projectId) return { error: "Missing project ID." };

  // Checkbox: present = true, absent = false.
  const peRequired = formData.get("pe_required") === "on";

  const { error: updateError } = await supabase
    .from("projects")
    .update({ pe_required: peRequired })
    .eq("id", projectId);

  if (updateError) {
    console.error("setProjectPeRequired error:", updateError);
    return { error: "Failed to save PE setting." };
  }

  revalidatePath(`/admin/projects/${projectId}`);
  return { error: null, success: true };
}

// ── Upload Manual Package ─────────────────────────────────────────────────────
// Admin uploads a permit package or application form directly when no matching
// template set exists. Uses same storage + project_files pattern as uploadSLD.

export async function uploadManualPackage(
  _prevState: AdminActionState,
  formData: FormData
): Promise<AdminActionState> {
  const supabase = await createClient();

  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return { error: "Not authenticated." };

  const projectId = formData.get("project_id") as string;
  const category = formData.get("category") as string;
  const file = formData.get("file") as File | null;

  if (!projectId) return { error: "Missing project ID." };
  if (!file || file.size === 0) return { error: "Please select a file to upload." };
  if (file.type !== "application/pdf") return { error: "Only PDF files are accepted." };
  if (file.size > 52428800) return { error: "File exceeds 50 MB limit." };

  const allowedCategories = ["permit_package", "application_form", "certification_form", "coi"];
  if (!allowedCategories.includes(category)) return { error: "Invalid file category." };

  const FOLDER_MAP: Record<string, string> = {
    permit_package:     "package",
    application_form:   "application",
    certification_form: "certification",
    coi:                "coi",
  };

  const userId = userData.user.id;
  const safeFileName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const folder = FOLDER_MAP[category] ?? "other";
  const storagePath = `${projectId}/${folder}/${Date.now()}_${safeFileName}`;

  const serviceClient = createServiceClient();
  const { error: uploadError } = await serviceClient.storage
    .from("project-files")
    .upload(storagePath, file, { contentType: file.type, upsert: false });

  if (uploadError) {
    console.error("uploadManualPackage upload error:", uploadError.message);
    return { error: `File upload failed: ${uploadError.message}` };
  }

  const actorLabel = await getActorLabel(supabase, userId);

  const { error: dbError } = await serviceClient.from("project_files").insert({
    project_id: projectId,
    uploaded_by: userId,
    uploader_label: actorLabel,
    file_category: category,
    file_type: folder,
    file_name: file.name,
    storage_path: storagePath,
    file_size_bytes: file.size,
    mime_type: file.type,
    source: "admin_upload",
  });

  if (dbError) {
    console.error("uploadManualPackage db error:", dbError);
    await serviceClient.storage.from("project-files").remove([storagePath]);
    return { error: "Failed to record file in database." };
  }

  const ACTIVITY_LABEL_MAP: Record<string, string> = {
    permit_package:     `Permit package uploaded manually`,
    application_form:   `Application form uploaded`,
    certification_form: `Certification form uploaded`,
    coi:                `COI uploaded`,
  };
  const actionLabel = `${ACTIVITY_LABEL_MAP[category] ?? "File uploaded"}: ${file.name}`;

  await supabase.from("project_activity").insert({
    project_id: projectId,
    actor_id: userId,
    actor_label: actorLabel,
    action: actionLabel,
    metadata: { file_name: file.name, storage_path: storagePath, category },
  });

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

  // Fetch TCD code before deleting so we can log a meaningful message.
  const { data: selectionRow } = await supabase
    .from("project_tcd_selections")
    .select("id, tcd_library ( code )")
    .eq("id", selectionId)
    .single();
  const tcdCode = (selectionRow?.tcd_library as { code?: string } | null)?.code ?? null;

  const { error } = await supabase
    .from("project_tcd_selections")
    .delete()
    .eq("id", selectionId);

  if (error) {
    console.error("removeTCDFromProject error:", error);
    return { error: "Failed to remove TCD." };
  }

  const actorLabel = await getActorLabel(supabase, userData.user.id);
  await supabase.from("project_activity").insert({
    project_id: projectId,
    actor_id: userData.user.id,
    actor_label: actorLabel,
    action: tcdCode ? `TCD removed: ${tcdCode}` : "TCD removed",
    metadata: { selection_id: selectionId },
  });

  revalidatePath(`/admin/projects/${projectId}`);
  return { error: null, success: true };
}

// ── Requirement Override ──────────────────────────────────────────────────────
// Sets a single per-project requirement override column to null/true/false.
// 'inherit' → NULL (use authority default), 'on' → true, 'off' → false.

const REQUIREMENT_OVERRIDE_COLUMNS = [
  "req_application_override",
  "req_certification_override",
  "req_coi_override",
  "req_hard_copies_override",
  "req_certified_check_override",
  "req_notification_only_override",
  "pe_required",
] as const;
type RequirementOverrideColumn = typeof REQUIREMENT_OVERRIDE_COLUMNS[number];

export async function setRequirementOverride(
  _prevState: AdminActionState,
  formData: FormData
): Promise<AdminActionState> {
  const supabase = await createClient();

  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return { error: "Not authenticated." };

  const projectId = formData.get("project_id") as string;
  const column = formData.get("column") as string;
  const value = formData.get("value") as string; // 'inherit' | 'on' | 'off'

  if (!projectId) return { error: "Missing project ID." };
  if (!(REQUIREMENT_OVERRIDE_COLUMNS as readonly string[]).includes(column))
    return { error: "Invalid override column." };
  if (!["inherit", "on", "off"].includes(value)) return { error: "Invalid override value." };

  const dbValue: boolean | null = value === "inherit" ? null : value === "on";

  const { error: updateError } = await supabase
    .from("projects")
    .update({ [column as RequirementOverrideColumn]: dbValue })
    .eq("id", projectId);

  if (updateError) {
    console.error("setRequirementOverride error:", updateError);
    return { error: "Failed to save requirement override." };
  }

  revalidatePath(`/admin/projects/${projectId}`);
  return { error: null, success: true };
}

// ── Set All Requirement Overrides ────────────────────────────────────────────
// Saves all six per-project requirement override columns in one update.
// Each value is 'inherit' | 'on' | 'off' → mapped to null | true | false.

function decodeOverride(raw: string | null): boolean | null {
  if (raw === "on") return true;
  if (raw === "off") return false;
  return null; // 'inherit' or missing
}

export async function setAllRequirementOverrides(
  _prevState: AdminActionState,
  formData: FormData
): Promise<AdminActionState> {
  const supabase = await createClient();

  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return { error: "Not authenticated." };

  const projectId = formData.get("project_id") as string;
  if (!projectId) return { error: "Missing project ID." };

  const patch = {
    req_application_override:       decodeOverride(formData.get("req_application_override") as string | null),
    req_certification_override:     decodeOverride(formData.get("req_certification_override") as string | null),
    req_coi_override:               decodeOverride(formData.get("req_coi_override") as string | null),
    req_hard_copies_override:       decodeOverride(formData.get("req_hard_copies_override") as string | null),
    req_certified_check_override:   decodeOverride(formData.get("req_certified_check_override") as string | null),
    req_notification_only_override: decodeOverride(formData.get("req_notification_only_override") as string | null),
    pe_required:                    decodeOverride(formData.get("pe_required") as string | null),
  };

  const { error: updateError } = await supabase
    .from("projects")
    .update(patch)
    .eq("id", projectId);

  if (updateError) {
    console.error("setAllRequirementOverrides error:", updateError);
    return { error: "Failed to save requirement overrides." };
  }

  const actorLabel = await getActorLabel(supabase, userData.user.id);
  await supabase.from("project_activity").insert({
    project_id: projectId,
    actor_id: userData.user.id,
    actor_label: actorLabel,
    action: "Requirement overrides updated",
    metadata: {},
  });

  revalidatePath(`/admin/projects/${projectId}`);
  return { error: null, success: true };
}

// ── Set Project Blueprint ─────────────────────────────────────────────────────
// Admin selects a specific package blueprint for this project, overriding the
// authority's active blueprint. NULL clears the override (revert to authority default).
//
// Guardrails:
//  - Only blueprints with status="active" are accepted.
//  - Drafts and inactive blueprints are rejected with a clear message.
//  - The blueprint must belong to the project's effective authority.
//    Cross-authority overrides are not allowed.

export async function setProjectBlueprint(
  _prevState: AdminActionState,
  formData: FormData
): Promise<AdminActionState> {
  const supabase = await createClient();

  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return { error: "Not authenticated." };

  const projectId = formData.get("project_id") as string;
  if (!projectId) return { error: "Missing project ID." };

  const rawBlueprintId = (formData.get("blueprint_id") as string | null)?.trim() || null;

  // Validate the chosen blueprint against the project's effective authority.
  let blueprintName: string | null = null;
  if (rawBlueprintId) {
    const { data: projectRow } = await supabase
      .from("projects")
      .select("authority_id, jurisdiction_id")
      .eq("id", projectId)
      .single();
    const projectAuthIds = projectRow as {
      authority_id: string | null;
      jurisdiction_id: string | null;
    } | null;

    let effectiveAuthorityId: string | null = projectAuthIds?.authority_id ?? null;
    if (!effectiveAuthorityId && projectAuthIds?.jurisdiction_id) {
      const { data: jurAuth } = await supabase
        .from("jurisdictions")
        .select("authority_profile_id")
        .eq("id", projectAuthIds.jurisdiction_id)
        .single();
      effectiveAuthorityId = (jurAuth?.authority_profile_id as string | null) ?? null;
    }

    if (!effectiveAuthorityId) {
      return {
        error:
          "Select a permitting authority before choosing a package template.",
      };
    }

    const { data: bp } = await supabase
      .from("package_blueprints")
      .select("name, authority_profile_id, status")
      .eq("id", rawBlueprintId)
      .maybeSingle();
    const bpRow = bp as
      | { name: string | null; authority_profile_id: string | null; status: string | null }
      | null;

    if (!bpRow) {
      return { error: "Selected package template not found." };
    }
    if (bpRow.authority_profile_id !== effectiveAuthorityId) {
      return {
        error: "Package template must belong to the selected permitting authority.",
      };
    }
    if (bpRow.status === "draft") {
      return {
        error:
          "Draft package templates must be activated before they can be used on projects.",
      };
    }
    if (bpRow.status === "inactive") {
      return { error: "Inactive package templates cannot be selected." };
    }
    if (bpRow.status !== "active") {
      return { error: "Only active package templates can be selected." };
    }

    blueprintName = bpRow.name ?? null;
  }

  const { error: updateError } = await supabase
    .from("projects")
    .update({ blueprint_id: rawBlueprintId })
    .eq("id", projectId);

  if (updateError) {
    console.error("setProjectBlueprint error:", updateError);
    return { error: "Failed to save blueprint override." };
  }

  const actorLabel = await getActorLabel(supabase, userData.user.id);
  await supabase.from("project_activity").insert({
    project_id: projectId,
    actor_id: userData.user.id,
    actor_label: actorLabel,
    action: rawBlueprintId
      ? `Package blueprint set: ${blueprintName ?? rawBlueprintId}`
      : "Package blueprint cleared (using authority default)",
    metadata: rawBlueprintId ? { blueprint_id: rawBlueprintId } : {},
  });

  revalidatePath(`/admin/projects/${projectId}`);
  return { error: null, success: true };
}

// ── Reorder TCD Selections ────────────────────────────────────────────────────
// Accepts an ordered array of selection IDs and writes sequential sort_order
// values so the UI drag-drop order is persisted to the database.

export async function reorderProjectTCDs(
  _prevState: AdminActionState,
  formData: FormData
): Promise<AdminActionState> {
  const supabase = await createClient();

  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return { error: "Not authenticated." };

  const projectId = formData.get("project_id") as string;
  const orderedIdsRaw = formData.get("ordered_ids") as string;

  if (!projectId) return { error: "Missing project ID." };
  if (!orderedIdsRaw) return { error: "Missing ordered IDs." };

  let orderedIds: string[];
  try {
    orderedIds = JSON.parse(orderedIdsRaw);
  } catch {
    return { error: "Invalid ordered IDs." };
  }
  if (!Array.isArray(orderedIds) || orderedIds.length === 0) return { error: "No IDs provided." };

  const updates = orderedIds.map((selectionId: string, index: number) =>
    supabase
      .from("project_tcd_selections")
      .update({ sort_order: index })
      .eq("id", selectionId)
      .eq("project_id", projectId)
  );

  const results = await Promise.all(updates);
  const firstError = results.find((r) => r.error)?.error;
  if (firstError) {
    console.error("reorderProjectTCDs error:", firstError);
    return { error: "Failed to save TCD order." };
  }

  revalidatePath(`/admin/projects/${projectId}`);
  return { error: null, success: true };
}

// ── Phase E/F/J — Project Cover Map ──────────────────────────────────────────
// Upload / replace / remove the per-project cover map. Stored in the existing
// `project-files` bucket under cover-maps/{project_id}/...; the
// project_cover_maps row keeps the canonical pointer (one per project).
//
// Phase J — uploads are now PDF-only. We rasterize the first page via sharp
// (libvips PDFium) and run the existing centered crop math against that
// raster, persisting the result as the cropped PNG that the renderer reads.
// Legacy rows uploaded before Phase J (image originals) keep their existing
// cropped_storage_path and continue to render unchanged.

const COVER_MAP_MAX_BYTES = 20_971_520; // 20 MB
const COVER_MAP_ALLOWED_MIMES: ReadonlySet<string> = new Set([
  "application/pdf",
]);
// Phase F — target aspect ratio for the auto-crop. ~550 / 300 ≈ 1.833.
// The crop is the largest 1.83-ratio box that fits inside the original.
const COVER_MAP_TARGET_RATIO = 1.83;
// Vertical bias for the crop window (0.5 = centered, 0.4 = shifted upward,
// 0.35 = further upward). Google Maps PDFs tend to have UI chrome / scale
// bars / attribution along the bottom edge that we'd rather discard, so we
// favor the top-and-middle of the source. Horizontal stays centered.
const COVER_MAP_CROP_Y_BIAS  = 0.40;
// DPI for rasterizing the source PDF. 300 gives the future crop editor enough
// pixel headroom to zoom into the persisted raster without visible softness.
// Trade-off: ~2× larger raster vs. the previous 200 DPI value.
const COVER_MAP_PDF_DENSITY  = 300;
// Phase 1 — design target for the cover map slot. cropBox is captured in
// raster pixel coordinates; this output size is recorded in crop_transform
// so a future renderer or crop editor can round-trip the design intent.
const COVER_MAP_OUTPUT_WIDTH  = 550;
const COVER_MAP_OUTPUT_HEIGHT = 300;

/**
 * Phase J — admin OR designer-assigned-to-this-project may edit cover maps.
 * Returns { ok: true } when authorized, { ok: false, error } otherwise.
 */
async function authorizeCoverMapEdit(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId:   string,
  role:     string | undefined,
  projectId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (role === "admin") return { ok: true };
  if (role === "designer") {
    const { data, error } = await supabase
      .from("projects")
      .select("assigned_designer_id")
      .eq("id", projectId)
      .maybeSingle();
    if (error) return { ok: false, error: "Could not verify project assignment." };
    if (!data)  return { ok: false, error: "Project not found." };
    const assigned = (data as { assigned_designer_id: string | null }).assigned_designer_id;
    if (assigned === userId) return { ok: true };
    return { ok: false, error: "This project is not assigned to you." };
  }
  return { ok: false, error: "Admin or assigned-designer access required." };
}

// ── Phase J/L — PDF → PNG conversion via system Poppler ──────────────────────
//
// Sharp's libvips PDF support is unreliable on macOS dev boxes (and in any
// libvips build that wasn't compiled with PDF backing). We instead shell out
// to system Poppler — `pdftocairo` (preferred) or `pdftoppm` (fallback) —
// which both ship with the same `poppler-utils` package on every supported
// platform.
//
// SYSTEM DEPENDENCY:
//   macOS dev:        brew install poppler
//   Linux / Docker:   apt-get install -y poppler-utils
//
// If neither binary is on PATH, the upload fails with a clear admin-facing
// error pointing the operator at the install command.

const execFileAsync = promisify(execFile);

type PopplerTool = "pdftocairo" | "pdftoppm";
type RasterResult =
  | { ok: true;  png: Uint8Array }
  | { ok: false; code: "poppler_missing" | "pdf_failed" };

// Cache the binary lookup for the lifetime of the Node process — PATH doesn't
// change at runtime, so re-probing on every upload is wasteful. `undefined`
// means "not yet probed"; `null` means "probed and missing".
let popplerToolCache: PopplerTool | null | undefined = undefined;

async function locatePopplerBinary(): Promise<PopplerTool | null> {
  if (popplerToolCache !== undefined) return popplerToolCache;
  for (const tool of ["pdftocairo", "pdftoppm"] as const) {
    try {
      // Both tools support `-v`, write their version to stderr, and exit
      // non-zero (typically 99). The only result we treat as "missing" is
      // ENOENT from the spawn itself.
      await execFileAsync(tool, ["-v"], { timeout: 5_000 });
      popplerToolCache = tool;
      return tool;
    } catch (e) {
      const code = (e as NodeJS.ErrnoException)?.code;
      if (code === "ENOENT") continue;
      // Any other error means the binary exists; keep it.
      popplerToolCache = tool;
      return tool;
    }
  }
  popplerToolCache = null;
  return null;
}

/**
 * Rasterize page 1 of a PDF to a PNG buffer by spawning the system Poppler
 * binary. Writes the input PDF to a temp dir, invokes the binary, reads the
 * PNG back, and always cleans up the temp dir on the way out.
 *
 * Returns a discriminated union so the caller can distinguish "Poppler isn't
 * installed" (operator action required) from "this specific PDF couldn't be
 * processed" (user-facing).
 */
async function rasterizePdfFirstPage(pdfBuf: Uint8Array): Promise<RasterResult> {
  const tool = await locatePopplerBinary();
  if (!tool) return { ok: false, code: "poppler_missing" };

  let workDir: string | null = null;
  try {
    workDir = await mkdtemp(join(tmpdir(), "fp-cover-map-"));
    const pdfPath = join(workDir, "in.pdf");
    const outBase = join(workDir, "out");
    await writeFile(pdfPath, pdfBuf);

    if (tool === "pdftocairo") {
      // -singlefile drops the page-number suffix; the output is exactly
      // `${outBase}.png`. -r sets the rasterization DPI.
      await execFileAsync(
        tool,
        [
          "-png",
          "-singlefile",
          "-r", String(COVER_MAP_PDF_DENSITY),
          "-f", "1",
          "-l", "1",
          pdfPath,
          outBase,
        ],
        { timeout: 30_000, maxBuffer: 1024 * 1024 },
      );
      const png = await readFile(`${outBase}.png`);
      return { ok: true, png: new Uint8Array(png) };
    }

    // pdftoppm — no -singlefile flag; output is `${outBase}-N.png` where the
    // page number's zero-padding depends on the source's total page count.
    // Scan the temp dir to find whatever it actually wrote.
    await execFileAsync(
      tool,
      [
        "-png",
        "-r", String(COVER_MAP_PDF_DENSITY),
        "-f", "1",
        "-l", "1",
        pdfPath,
        outBase,
      ],
      { timeout: 30_000, maxBuffer: 1024 * 1024 },
    );
    const entries = await readdir(workDir);
    const pngName = entries.find((n) => n.startsWith("out-") && n.endsWith(".png"));
    if (!pngName) {
      console.warn("rasterizePdfFirstPage: pdftoppm produced no PNG in", workDir);
      return { ok: false, code: "pdf_failed" };
    }
    const png = await readFile(join(workDir, pngName));
    return { ok: true, png: new Uint8Array(png) };
  } catch (e) {
    console.warn("rasterizePdfFirstPage failed:", e);
    return { ok: false, code: "pdf_failed" };
  } finally {
    if (workDir) {
      try {
        await rm(workDir, { recursive: true, force: true });
      } catch (cleanupErr) {
        console.warn("rasterizePdfFirstPage: temp cleanup failed:", cleanupErr);
      }
    }
  }
}

type CropBox = { left: number; top: number; width: number; height: number };
type AutoCropResult = {
  png:          Uint8Array;
  cropBox:      CropBox;     // raster pixel coordinates — authoritative
  rasterWidth:  number;
  rasterHeight: number;
};

/**
 * Largest 1.83-ratio crop that fits inside the source. Returns the cropped
 * PNG, the raster's native pixel dimensions, and the cropBox in raster
 * coordinates so callers can persist a `crop_transform`. Returns null if
 * sharp could not read the image.
 *
 * Math:
 *   ratio = W / H
 *   if ratio > target → "too wide": keep H, crop W → H * target
 *   if ratio < target → "too tall":  keep W, crop H → W / target
 *   if ratio = target → no crop (still convert to PNG for pdf-lib parity)
 *
 * Horizontal placement is centered. Vertical placement uses
 * COVER_MAP_CROP_Y_BIAS — a fraction of the leftover vertical space taken
 * from the top. 0.5 = centered, 0.4 = shifted upward.
 */
async function autoCropCoverMap(input: Uint8Array): Promise<AutoCropResult | null> {
  try {
    const meta = await sharp(input).metadata();
    const W = meta.width;
    const H = meta.height;
    if (!W || !H) return null;

    let cropW = W;
    let cropH = H;
    const origRatio = W / H;
    if (origRatio > COVER_MAP_TARGET_RATIO) {
      cropH = H;
      cropW = Math.round(H * COVER_MAP_TARGET_RATIO);
    } else if (origRatio < COVER_MAP_TARGET_RATIO) {
      cropW = W;
      cropH = Math.round(W / COVER_MAP_TARGET_RATIO);
    }
    const left = Math.max(0, Math.round((W - cropW) / 2));
    const top  = Math.max(0, Math.round((H - cropH) * COVER_MAP_CROP_Y_BIAS));

    // Always emit PNG so the renderer can use embedPng without per-mime branching.
    const out = await sharp(input)
      .extract({ left, top, width: cropW, height: cropH })
      .png()
      .toBuffer();

    return {
      png:          new Uint8Array(out),
      cropBox:      { left, top, width: cropW, height: cropH },
      rasterWidth:  W,
      rasterHeight: H,
    };
  } catch (e) {
    console.warn("autoCropCoverMap failed:", e);
    return null;
  }
}

export async function uploadProjectCoverMap(
  _prevState: AdminActionState,
  formData: FormData
): Promise<AdminActionState> {
  const supabase = await createClient();

  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return { error: "Not authenticated." };

  const callerRole = (userData.user.app_metadata as { role?: string })?.role;
  const userId     = userData.user.id;

  const projectId = (formData.get("project_id") as string)?.trim();
  if (!projectId) return { error: "Missing project ID." };

  // Phase J — admin OR designer assigned to this project may upload.
  const auth = await authorizeCoverMapEdit(supabase, userId, callerRole, projectId);
  if (!auth.ok) return { error: auth.error };

  const file = formData.get("file") as File | null;
  if (!file || file.size === 0) return { error: "Please select a cover map PDF to upload." };
  // Phase J — PDF only. Some browsers send "" for type; defend against that.
  if (file.type !== "application/pdf" && !COVER_MAP_ALLOWED_MIMES.has(file.type)) {
    return { error: "Cover map must be a PDF." };
  }
  if (file.size > COVER_MAP_MAX_BYTES) {
    return { error: "Cover map exceeds the 20 MB limit." };
  }

  const ts = Date.now();
  // Phase 1 — original PDF + full-page raster + cropped PNG live side by side.
  const folder             = `cover-maps/${projectId}`;
  const storagePath        = `${folder}/${ts}_original.pdf`;
  const rasterStoragePath  = `${folder}/${ts}_raster.png`;
  const croppedStoragePath = `${folder}/${ts}_cropped.png`;

  const serviceClient = createServiceClient();

  // Look up the prior cover map (if any) so we can delete its storage objects
  // after the new ones are in place. The user-scoped auth check above already
  // confirmed both project existence and edit permission.
  const { data: existing } = await serviceClient
    .from("project_cover_maps")
    .select("id, storage_path, cropped_storage_path, raster_storage_path")
    .eq("project_id", projectId)
    .maybeSingle();
  const previousPath         = (existing as { storage_path?:        string } | null)?.storage_path         ?? null;
  const previousCroppedPath  = (existing as { cropped_storage_path?: string } | null)?.cropped_storage_path ?? null;
  const previousRasterPath   = (existing as { raster_storage_path?:  string } | null)?.raster_storage_path  ?? null;

  // ── Read the file once into a buffer; both the upload and sharp need it.
  const fileBuffer = new Uint8Array(await file.arrayBuffer());

  // ── Rasterize first page of PDF via system Poppler, then run the auto-crop
  // helper which now returns the crop box in raster pixel coords so we can
  // persist `crop_transform`. Conversion failure is FATAL: a cover map that
  // can't be rendered is useless, so we refuse the upload and surface a clear
  // message. "Poppler missing" gets its own admin-facing error so an operator
  // can fix the host install rather than chasing a generic failure.
  const raster = await rasterizePdfFirstPage(fileBuffer);
  if (!raster.ok) {
    if (raster.code === "poppler_missing") {
      return {
        error:
          "PDF processing requires Poppler. Install it locally with `brew install poppler` and ensure `pdftocairo` or `pdftoppm` is available in PATH.",
      };
    }
    return { error: "Could not extract a cover map image from this PDF." };
  }
  const cropResult = await autoCropCoverMap(raster.png);
  if (!cropResult) {
    return { error: "Could not extract a cover map image from this PDF." };
  }
  const { png: croppedBytes, cropBox, rasterWidth, rasterHeight } = cropResult;

  // ── Upload original PDF, raster PNG, then cropped PNG. Track every
  // successful upload in `uploaded` so any later failure can roll back the
  // full set without leaving orphans.
  const uploaded: string[] = [];
  const rollbackUploads = async () => {
    if (uploaded.length === 0) return;
    await serviceClient.storage.from("project-files").remove(uploaded);
  };

  const { error: uploadError } = await serviceClient.storage
    .from("project-files")
    .upload(storagePath, fileBuffer, { contentType: "application/pdf", upsert: false });
  if (uploadError) {
    console.error("uploadProjectCoverMap upload error:", uploadError.message);
    return { error: `Cover map upload failed: ${uploadError.message}` };
  }
  uploaded.push(storagePath);

  const { error: rasterUploadError } = await serviceClient.storage
    .from("project-files")
    .upload(rasterStoragePath, raster.png, { contentType: "image/png", upsert: false });
  if (rasterUploadError) {
    console.error("uploadProjectCoverMap raster upload error:", rasterUploadError.message);
    await rollbackUploads();
    return { error: "Could not save the rasterized cover map. Please try again." };
  }
  uploaded.push(rasterStoragePath);

  const { error: cropUploadError } = await serviceClient.storage
    .from("project-files")
    .upload(croppedStoragePath, croppedBytes, { contentType: "image/png", upsert: false });
  if (cropUploadError) {
    console.error("uploadProjectCoverMap cropped upload error:", cropUploadError.message);
    await rollbackUploads();
    return { error: "Could not save the cover map crop. Please try again." };
  }
  uploaded.push(croppedStoragePath);

  // Phase 1 — capture the auto-crop in raster pixel coordinates. The cropBox
  // is the source of truth; the editor / future renderer can re-derive zoom
  // and offset from it. `output` records the design target (550 × 300) so
  // intent survives across DPI / image-size changes; `ratio` is exact.
  const cropTransform = {
    cropBox,
    output:  { width: COVER_MAP_OUTPUT_WIDTH, height: COVER_MAP_OUTPUT_HEIGHT },
    ratio:   COVER_MAP_OUTPUT_WIDTH / COVER_MAP_OUTPUT_HEIGHT,
    source:  "auto" as const,
    version: 1 as const,
  };

  // ── Upsert the project_cover_maps row. UNIQUE(project_id) makes this a
  // clean insert-or-update — service client bypasses RLS.
  const dbPayload = {
    project_id:           projectId,
    storage_path:         storagePath,
    cropped_storage_path: croppedStoragePath,
    raster_storage_path:  rasterStoragePath,
    raster_width:         rasterWidth,
    raster_height:        rasterHeight,
    crop_transform:       cropTransform,
    file_name:            file.name,
    mime_type:            "application/pdf",
    file_size_bytes:      file.size,
  };
  console.info("uploadProjectCoverMap db write payload:", dbPayload);

  const { error: dbError } = await serviceClient
    .from("project_cover_maps")
    .upsert(dbPayload, { onConflict: "project_id" });

  if (dbError) {
    // Surface every Supabase field — `dbError` stringifies poorly without this.
    console.error("uploadProjectCoverMap db error:", {
      message: dbError.message,
      details: dbError.details,
      hint:    dbError.hint,
      code:    dbError.code,
    });
    // Roll back ALL three new uploads so we don't leave orphans.
    await rollbackUploads();

    // PostgREST returns "PGRST205" / "42P01" when the table is missing — the
    // canonical sign that migrations haven't been applied. Surface that
    // explicitly so an operator knows what to do.
    const missingTable =
      dbError.code === "42P01" ||
      dbError.code === "PGRST205" ||
      /relation .*project_cover_maps.* does not exist/i.test(dbError.message ?? "");
    if (missingTable) {
      return {
        error:
          "Cover map processed, but the project_cover_maps table is missing. Run `supabase migration up` to apply pending migrations.",
      };
    }
    return {
      error: `Cover map processed, but database write failed: ${dbError.message ?? "unknown error"}`,
    };
  }

  // ── Best-effort cleanup of the previous files. Non-fatal.
  const toRemove: string[] = [];
  if (previousPath        && previousPath        !== storagePath)        toRemove.push(previousPath);
  if (previousRasterPath  && previousRasterPath  !== rasterStoragePath)  toRemove.push(previousRasterPath);
  if (previousCroppedPath && previousCroppedPath !== croppedStoragePath) toRemove.push(previousCroppedPath);
  if (toRemove.length > 0) {
    await serviceClient.storage.from("project-files").remove(toRemove);
  }

  const actorLabel = await getActorLabel(supabase, userId);
  await supabase.from("project_activity").insert({
    project_id:  projectId,
    actor_id:    userId,
    actor_label: actorLabel,
    action:      previousPath ? `Cover map replaced: ${file.name}` : `Cover map uploaded: ${file.name}`,
    metadata:    {
      file_name:            file.name,
      storage_path:         storagePath,
      raster_storage_path:  rasterStoragePath,
      cropped_storage_path: croppedStoragePath,
      mime_type:            "application/pdf",
    },
  });

  revalidatePath(`/admin/projects/${projectId}`);
  revalidatePath(`/designer/projects/${projectId}`);
  return { error: null, success: true };
}

export async function removeProjectCoverMap(
  _prevState: AdminActionState,
  formData: FormData
): Promise<AdminActionState> {
  const supabase = await createClient();

  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return { error: "Not authenticated." };

  const callerRole = (userData.user.app_metadata as { role?: string })?.role;

  const projectId = (formData.get("project_id") as string)?.trim();
  if (!projectId) return { error: "Missing project ID." };

  const auth = await authorizeCoverMapEdit(supabase, userData.user.id, callerRole, projectId);
  if (!auth.ok) return { error: auth.error };

  const serviceClient = createServiceClient();

  const { data: existing } = await serviceClient
    .from("project_cover_maps")
    .select("id, storage_path, cropped_storage_path, raster_storage_path")
    .eq("project_id", projectId)
    .maybeSingle();

  const row = existing as {
    id: string;
    storage_path: string;
    cropped_storage_path: string | null;
    raster_storage_path:  string | null;
  } | null;
  if (!row) {
    // Already gone — treat as success so the UI re-renders the empty state.
    revalidatePath(`/admin/projects/${projectId}`);
    return { error: null, success: true };
  }

  const { error: dbError } = await serviceClient
    .from("project_cover_maps")
    .delete()
    .eq("id", row.id);

  if (dbError) {
    console.error("removeProjectCoverMap db error:", dbError);
    return { error: "Failed to remove cover map record." };
  }

  // Best-effort storage cleanup — original PDF, raster PNG (Phase 1), and cropped PNG (Phase F).
  const toRemove = [row.storage_path];
  if (row.raster_storage_path)  toRemove.push(row.raster_storage_path);
  if (row.cropped_storage_path) toRemove.push(row.cropped_storage_path);
  await serviceClient.storage.from("project-files").remove(toRemove);

  const actorLabel = await getActorLabel(supabase, userData.user.id);
  await supabase.from("project_activity").insert({
    project_id:  projectId,
    actor_id:    userData.user.id,
    actor_label: actorLabel,
    action:      "Cover map removed",
    metadata:    { storage_path: row.storage_path },
  });

  revalidatePath(`/admin/projects/${projectId}`);
  revalidatePath(`/designer/projects/${projectId}`);
  return { error: null, success: true };
}

// ── Phase 2 — Manual Cover Map Crop ──────────────────────────────────────────
// Apply a user-supplied crop box (in raster pixel coordinates) to the
// already-persisted full raster, re-emit the cropped PNG, and update the row.
// FormData carries `project_id` and integer `crop_left`/`crop_top`/`crop_width`/
// `crop_height` fields. Annotations are CLEARED on save (the geometric
// reproject is deferred to a later phase — clearing is the safe default since
// existing normalized points would otherwise misalign against the new crop).

const COVER_MAP_RATIO_TOLERANCE = 0.02; // accept |ratio - target| ≤ 0.02

// ── Phase 3 — annotation reprojection ────────────────────────────────────────
// Saved work-path points are normalized 0..1 against whichever cropBox was
// active at save time. When a designer adjusts the crop, those normalized
// values would silently misalign — so we project each point through raster
// pixel space and re-normalize into the new cropBox.
//
// Returns:
//   - annotations:    the reprojected payload, or null on safety fallback
//   - fellBackToNull: true when malformed input forced the clear-on-save path
//   - count fields:   for telemetry / debug logging
//
// All path metadata (id, style fields, presets) is preserved verbatim — only
// `points` is replaced.
type ReprojectInput = unknown; // raw jsonb from the row
type ReprojectResult = {
  annotations:    CoverMapAnnotations | null;
  fellBackToNull: boolean;
  pathsBefore:    number;
  pathsAfter:     number;
  pathsDropped:   number;
  pointsBefore:   number;
  pointsAfter:    number;
  pointsDropped:  number;
};

function readOldCropBox(rawTransform: ReprojectInput): { left: number; top: number; width: number; height: number } | null {
  if (!rawTransform || typeof rawTransform !== "object") return null;
  const cb = (rawTransform as Record<string, unknown>).cropBox;
  if (!cb || typeof cb !== "object") return null;
  const r = cb as Record<string, unknown>;
  const nums = [r.left, r.top, r.width, r.height];
  if (!nums.every((n) => typeof n === "number" && Number.isFinite(n))) return null;
  const left   = r.left   as number;
  const top    = r.top    as number;
  const width  = r.width  as number;
  const height = r.height as number;
  if (width <= 0 || height <= 0) return null; // avoid div-by-zero
  return { left, top, width, height };
}

function reprojectCoverMapAnnotations(
  rawTransform:   ReprojectInput,
  rawAnnotations: ReprojectInput,
  newCrop:        { left: number; top: number; width: number; height: number },
): ReprojectResult {
  const empty: ReprojectResult = {
    annotations:    null,
    fellBackToNull: false,
    pathsBefore:    0,
    pathsAfter:     0,
    pathsDropped:   0,
    pointsBefore:   0,
    pointsAfter:    0,
    pointsDropped:  0,
  };

  // No annotations to transform — leave the column null (not a fallback).
  if (rawAnnotations === null || rawAnnotations === undefined) return empty;

  const oldCrop = readOldCropBox(rawTransform);
  if (!oldCrop) {
    return { ...empty, fellBackToNull: true };
  }
  if (newCrop.width <= 0 || newCrop.height <= 0) {
    return { ...empty, fellBackToNull: true };
  }

  // parseAnnotations is the canonical validator — it normalizes legacy fields
  // and returns null on malformed input, which is exactly the safety case we
  // need to fall back on.
  const parsed = parseAnnotations(rawAnnotations);
  if (!parsed) {
    return { ...empty, fellBackToNull: true };
  }

  let pathsBefore   = parsed.paths.length;
  let pointsBefore  = 0;
  let pointsAfter   = 0;
  const newPaths: typeof parsed.paths = [];

  for (const path of parsed.paths) {
    pointsBefore += path.points.length;
    const newPoints: typeof path.points = [];
    for (const p of path.points) {
      const rx = oldCrop.left + p.x * oldCrop.width;
      const ry = oldCrop.top  + p.y * oldCrop.height;
      const nx = (rx - newCrop.left) / newCrop.width;
      const ny = (ry - newCrop.top)  / newCrop.height;
      if (nx < 0 || nx > 1 || ny < 0 || ny > 1) continue;
      newPoints.push({ x: nx, y: ny });
    }
    if (newPoints.length < 2) continue;
    pointsAfter += newPoints.length;
    newPaths.push({ ...path, points: newPoints });
  }

  // No survivors → store null so the renderer's "annotations exists?" check
  // skips cleanly. This matches today's behavior when there were never any
  // annotations to begin with.
  if (newPaths.length === 0) {
    return {
      annotations:    null,
      fellBackToNull: false,
      pathsBefore,
      pathsAfter:     0,
      pathsDropped:   pathsBefore,
      pointsBefore,
      pointsAfter:    0,
      pointsDropped:  pointsBefore,
    };
  }

  return {
    annotations:    { paths: newPaths },
    fellBackToNull: false,
    pathsBefore,
    pathsAfter:     newPaths.length,
    pathsDropped:   pathsBefore - newPaths.length,
    pointsBefore,
    pointsAfter,
    pointsDropped:  pointsBefore - pointsAfter,
  };
}

export async function saveProjectCoverMapCrop(
  _prevState: AdminActionState,
  formData: FormData
): Promise<AdminActionState> {
  const supabase = await createClient();

  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return { error: "Not authenticated." };

  const callerRole = (userData.user.app_metadata as { role?: string })?.role;
  const userId     = userData.user.id;

  const projectId = (formData.get("project_id") as string)?.trim();
  if (!projectId) return { error: "Missing project ID." };

  const auth = await authorizeCoverMapEdit(supabase, userId, callerRole, projectId);
  if (!auth.ok) return { error: auth.error };

  const parseIntField = (key: string): number | null => {
    const raw = formData.get(key);
    if (typeof raw !== "string") return null;
    const n = Number.parseInt(raw, 10);
    return Number.isFinite(n) ? n : null;
  };
  const left   = parseIntField("crop_left");
  const top    = parseIntField("crop_top");
  const width  = parseIntField("crop_width");
  const height = parseIntField("crop_height");
  if (left === null || top === null || width === null || height === null) {
    return { error: "Crop box is missing or invalid." };
  }
  if (left < 0 || top < 0 || width <= 0 || height <= 0) {
    return { error: "Crop box has negative or zero dimensions." };
  }

  const serviceClient = createServiceClient();

  const { data: existing, error: existingErr } = await serviceClient
    .from("project_cover_maps")
    .select("id, raster_storage_path, raster_width, raster_height, cropped_storage_path, crop_transform, annotations")
    .eq("project_id", projectId)
    .maybeSingle();
  if (existingErr) {
    console.error("saveProjectCoverMapCrop fetch error:", existingErr.message);
    return { error: "Failed to load cover map." };
  }
  const row = existing as {
    id: string;
    raster_storage_path:  string | null;
    raster_width:         number | null;
    raster_height:        number | null;
    cropped_storage_path: string | null;
    crop_transform:       unknown;
    annotations:          unknown;
  } | null;
  if (!row) {
    return { error: "Upload a cover map before adjusting the crop." };
  }
  if (!row.raster_storage_path || !row.raster_width || !row.raster_height) {
    return {
      error:
        "This cover map was uploaded before manual cropping was supported. Re-upload the PDF to enable Adjust Crop.",
    };
  }

  // Bounds check against persisted raster dimensions.
  if (left + width > row.raster_width || top + height > row.raster_height) {
    return { error: "Crop box extends beyond the rasterized image." };
  }

  // Aspect-ratio enforcement — server is the ratio gate regardless of what
  // the client sends.
  const target = COVER_MAP_OUTPUT_WIDTH / COVER_MAP_OUTPUT_HEIGHT;
  const actual = width / height;
  if (Math.abs(actual - target) > COVER_MAP_RATIO_TOLERANCE) {
    return { error: "Crop box must be 550 × 300 ratio (~1.83)." };
  }

  // ── Download the raster, sharp-extract, re-emit as PNG. Service client
  // bypasses storage RLS.
  let rasterBytes: Uint8Array;
  try {
    const { data: blob, error: dlErr } = await serviceClient.storage
      .from("project-files")
      .download(row.raster_storage_path);
    if (dlErr || !blob) {
      console.error("saveProjectCoverMapCrop raster download error:", dlErr?.message);
      return { error: "Could not load the rasterized cover map. Try re-uploading the PDF." };
    }
    rasterBytes = new Uint8Array(await blob.arrayBuffer());
  } catch (e) {
    console.error("saveProjectCoverMapCrop raster download threw:", e);
    return { error: "Could not load the rasterized cover map. Try re-uploading the PDF." };
  }

  let croppedBytes: Uint8Array;
  try {
    const out = await sharp(rasterBytes)
      .extract({ left, top, width, height })
      .png()
      .toBuffer();
    croppedBytes = new Uint8Array(out);
  } catch (e) {
    console.error("saveProjectCoverMapCrop sharp.extract threw:", e);
    return { error: "Could not generate the cropped cover map." };
  }

  // Upload as a new versioned object — never overwrite the previous cropped
  // path so we can roll back on DB failure and clean up the old one only on
  // success.
  const ts                  = Date.now();
  const newCroppedPath      = `cover-maps/${projectId}/${ts}_cropped.png`;
  const previousCroppedPath = row.cropped_storage_path;

  const { error: uploadErr } = await serviceClient.storage
    .from("project-files")
    .upload(newCroppedPath, croppedBytes, { contentType: "image/png", upsert: false });
  if (uploadErr) {
    console.error("saveProjectCoverMapCrop cropped upload error:", uploadErr.message);
    return { error: "Could not save the cover map crop. Please try again." };
  }

  const cropTransform = {
    cropBox: { left, top, width, height },
    output:  { width: COVER_MAP_OUTPUT_WIDTH, height: COVER_MAP_OUTPUT_HEIGHT },
    ratio:   target,
    source:  "manual" as const,
    version: 1 as const,
  };

  // Phase 3 — reproject annotations into the new crop space. Each saved point
  // is normalized 0..1 against the OLD cropBox, so we project it through
  // raster pixel space and re-normalize against the NEW cropBox. Points that
  // fall outside [0, 1] in either axis are dropped; paths with fewer than 2
  // surviving points are dropped entirely.
  //
  // Safety fallbacks (clear annotations rather than misalign):
  //   • old crop_transform.cropBox missing or malformed
  //   • annotations column malformed
  //   • old cropBox has zero width/height (would divide by zero)
  const newCrop = { left, top, width, height };
  const transformResult = reprojectCoverMapAnnotations(row.crop_transform, row.annotations, newCrop);
  console.info("saveProjectCoverMapCrop annotation reproject:", {
    pathsBefore:    transformResult.pathsBefore,
    pathsAfter:     transformResult.pathsAfter,
    pathsDropped:   transformResult.pathsDropped,
    pointsBefore:   transformResult.pointsBefore,
    pointsAfter:    transformResult.pointsAfter,
    pointsDropped:  transformResult.pointsDropped,
    fellBackToNull: transformResult.fellBackToNull,
  });

  const { error: dbError } = await serviceClient
    .from("project_cover_maps")
    .update({
      cropped_storage_path: newCroppedPath,
      crop_transform:       cropTransform,
      annotations:          transformResult.annotations,
    })
    .eq("id", row.id);

  if (dbError) {
    console.error("saveProjectCoverMapCrop db error:", {
      message: dbError.message,
      details: dbError.details,
      hint:    dbError.hint,
      code:    dbError.code,
    });
    await serviceClient.storage.from("project-files").remove([newCroppedPath]);
    return {
      error: `Crop processed, but database write failed: ${dbError.message ?? "unknown error"}`,
    };
  }

  // Best-effort cleanup of the previous cropped object. Non-fatal.
  if (previousCroppedPath && previousCroppedPath !== newCroppedPath) {
    await serviceClient.storage.from("project-files").remove([previousCroppedPath]);
  }

  const actorLabel = await getActorLabel(supabase, userId);
  await supabase.from("project_activity").insert({
    project_id:  projectId,
    actor_id:    userId,
    actor_label: actorLabel,
    action:      "Cover map crop adjusted",
    metadata:    {
      cropped_storage_path: newCroppedPath,
      crop_box:             { left, top, width, height },
    },
  });

  revalidatePath(`/admin/projects/${projectId}`);
  revalidatePath(`/designer/projects/${projectId}`);
  return { error: null, success: true };
}

// ── Phase G — Cover Map Work Path annotations ────────────────────────────────
// Save (or clear) the polyline linework drawn over the cropped cover map.
// FormData carries an `annotations_json` field whose body is the stringified
// CoverMapAnnotations object, or "" / "null" to clear.

export async function saveProjectCoverMapAnnotations(
  _prevState: AdminActionState,
  formData: FormData
): Promise<AdminActionState> {
  const supabase = await createClient();

  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return { error: "Not authenticated." };

  const callerRole = (userData.user.app_metadata as { role?: string })?.role;

  const projectId = (formData.get("project_id") as string)?.trim();
  if (!projectId) return { error: "Missing project ID." };

  const auth = await authorizeCoverMapEdit(supabase, userData.user.id, callerRole, projectId);
  if (!auth.ok) return { error: auth.error };

  const raw = (formData.get("annotations_json") as string | null) ?? "";
  const trimmed = raw.trim();

  // Empty payload = clear annotations.
  let annotations: ReturnType<typeof parseAnnotations> = null;
  if (trimmed && trimmed !== "null") {
    try {
      const parsed = JSON.parse(trimmed);
      annotations = parseAnnotations(parsed);
      if (!annotations) return { error: "Invalid annotations payload." };
    } catch {
      return { error: "Annotations payload was not valid JSON." };
    }
  }

  const serviceClient = createServiceClient();

  // The cover map row must already exist — we don't create it from this action.
  const { data: existing, error: fetchErr } = await serviceClient
    .from("project_cover_maps")
    .select("id")
    .eq("project_id", projectId)
    .maybeSingle();
  if (fetchErr) {
    console.error("saveProjectCoverMapAnnotations fetch error:", fetchErr.message);
    return { error: "Failed to load cover map." };
  }
  if (!existing) {
    return { error: "Upload a cover map before saving a work path." };
  }

  const { error: updateErr } = await serviceClient
    .from("project_cover_maps")
    .update({ annotations: annotations ?? null })
    .eq("project_id", projectId);

  if (updateErr) {
    console.error("saveProjectCoverMapAnnotations update error:", updateErr.message);
    return { error: "Failed to save work path." };
  }

  const actorLabel = await getActorLabel(supabase, userData.user.id);
  const totalPoints = annotations?.paths.reduce((n, p) => n + p.points.length, 0) ?? 0;
  await supabase.from("project_activity").insert({
    project_id:  projectId,
    actor_id:    userData.user.id,
    actor_label: actorLabel,
    action:      annotations
      ? `Cover map work path saved (${annotations.paths.length} path${annotations.paths.length === 1 ? "" : "s"}, ${totalPoints} points)`
      : "Cover map work path cleared",
    metadata:    {
      // (Phase G/J) — annotation activity payload
      paths:  annotations?.paths.length ?? 0,
      points: totalPoints,
    },
  });

  revalidatePath(`/admin/projects/${projectId}`);
  revalidatePath(`/designer/projects/${projectId}`);
  return { error: null, success: true };
}
