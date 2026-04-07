"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

// ── Shared state type ─────────────────────────────────────────────────────────

export type DesignerActionState = {
  error: string | null;
  success?: boolean;
};

// ── Helper: get actor label ───────────────────────────────────────────────────

async function getActorLabel(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string
): Promise<string> {
  const { data } = await supabase
    .from("user_profiles")
    .select("display_name")
    .eq("id", userId)
    .single();
  return data?.display_name || "Designer";
}

// ── Upload TCP Sheet ──────────────────────────────────────────────────────────
// Designer uploads a Traffic Control Plan PDF for their assigned project.

export async function uploadTCP(
  _prevState: DesignerActionState,
  formData: FormData
): Promise<DesignerActionState> {
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

  // Verify this designer is assigned to the project
  const { data: project } = await supabase
    .from("projects")
    .select("id, status, assigned_designer_id")
    .eq("id", projectId)
    .eq("assigned_designer_id", userId)
    .single();

  if (!project) return { error: "Project not found or you are not the assigned designer." };

  // Only allow upload in active design statuses
  const allowedStatuses = ["assigned", "in_design", "revisions_required"];
  if (!allowedStatuses.includes(project.status)) {
    return { error: "TCP uploads are not allowed at the current project status." };
  }

  const safeFileName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const storagePath = `${projectId}/tcp/${Date.now()}_${safeFileName}`;

  // Upload to Supabase Storage
  const { error: uploadError } = await supabase.storage
    .from("project-files")
    .upload(storagePath, file, { contentType: "application/pdf", upsert: false });

  if (uploadError) {
    console.error("TCP upload error:", uploadError);
    return { error: "File upload failed. Please try again." };
  }

  const actorLabel = await getActorLabel(supabase, userId);

  // Create project_files record
  const { error: dbError } = await supabase.from("project_files").insert({
    project_id: projectId,
    uploaded_by: userId,
    uploader_label: actorLabel,
    file_category: "tcp_pdf",
    file_type: "tcp",
    file_name: file.name,
    storage_path: storagePath,
    file_size_bytes: file.size,
  });

  if (dbError) {
    console.error("TCP file record error:", dbError);
    await supabase.storage.from("project-files").remove([storagePath]);
    return { error: "Failed to record file in database." };
  }

  // Move to in_design if still on "assigned" status
  if (project.status === "assigned") {
    await supabase
      .from("projects")
      .update({ status: "in_design" })
      .eq("id", projectId);
  }

  // Activity log
  await supabase.from("project_activity").insert({
    project_id: projectId,
    actor_id: userId,
    actor_label: actorLabel,
    action: `TCP sheet uploaded: ${file.name}`,
    metadata: { file_name: file.name, storage_path: storagePath },
  });

  revalidatePath(`/designer/projects/${projectId}`);
  return { error: null, success: true };
}

// ── Submit for Review ─────────────────────────────────────────────────────────
// Designer marks TCP sheets as complete and submits for admin review.

export async function submitForReview(
  _prevState: DesignerActionState,
  formData: FormData
): Promise<DesignerActionState> {
  const supabase = await createClient();

  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return { error: "Not authenticated." };

  const projectId = formData.get("project_id") as string;
  if (!projectId) return { error: "Missing project ID." };

  const userId = userData.user.id;

  // Verify assignment and status
  const { data: project } = await supabase
    .from("projects")
    .select("id, status, assigned_designer_id")
    .eq("id", projectId)
    .eq("assigned_designer_id", userId)
    .single();

  if (!project) return { error: "Project not found or you are not the assigned designer." };

  const submittableStatuses = ["in_design", "revisions_required", "assigned"];
  if (!submittableStatuses.includes(project.status)) {
    return { error: "Project cannot be submitted for review at its current status." };
  }

  // Verify at least one TCP file exists
  const { count } = await supabase
    .from("project_files")
    .select("id", { count: "exact", head: true })
    .eq("project_id", projectId)
    .eq("file_category", "tcp_pdf");

  if (!count || count === 0) {
    return { error: "Upload at least one TCP sheet before submitting for review." };
  }

  const actorLabel = await getActorLabel(supabase, userId);

  const { error: updateError } = await supabase
    .from("projects")
    .update({ status: "waiting_for_admin_review" })
    .eq("id", projectId);

  if (updateError) {
    console.error("submitForReview error:", updateError);
    return { error: "Failed to submit for review." };
  }

  await supabase.from("project_activity").insert({
    project_id: projectId,
    actor_id: userId,
    actor_label: actorLabel,
    action: "Submitted TCP sheets for admin review",
    metadata: {},
  });

  revalidatePath(`/designer/projects/${projectId}`);
  return { error: null, success: true };
}

// ── Delete TCP File ───────────────────────────────────────────────────────────
// Designer removes a TCP sheet before submitting for review.

export async function deleteTCPFile(
  _prevState: DesignerActionState,
  formData: FormData
): Promise<DesignerActionState> {
  const supabase = await createClient();

  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return { error: "Not authenticated." };

  const fileId = formData.get("file_id") as string;
  const projectId = formData.get("project_id") as string;
  if (!fileId || !projectId) return { error: "Missing file or project ID." };

  const userId = userData.user.id;

  // Fetch file record — verify it belongs to this designer's project
  const { data: fileRecord } = await supabase
    .from("project_files")
    .select("id, storage_path, project_id, file_category")
    .eq("id", fileId)
    .eq("file_category", "tcp_pdf")
    .single();

  if (!fileRecord) return { error: "File not found." };

  // Verify designer is assigned to the project
  const { data: project } = await supabase
    .from("projects")
    .select("id, status, assigned_designer_id")
    .eq("id", fileRecord.project_id)
    .eq("assigned_designer_id", userId)
    .single();

  if (!project) return { error: "Not authorized to delete this file." };

  const allowedStatuses = ["assigned", "in_design", "revisions_required"];
  if (!allowedStatuses.includes(project.status)) {
    return { error: "Files cannot be deleted at the current project status." };
  }

  // Delete from storage
  await supabase.storage.from("project-files").remove([fileRecord.storage_path]);

  // Delete DB record
  const { error: dbError } = await supabase
    .from("project_files")
    .delete()
    .eq("id", fileId);

  if (dbError) return { error: "Failed to delete file record." };

  revalidatePath(`/designer/projects/${projectId}`);
  return { error: null, success: true };
}
