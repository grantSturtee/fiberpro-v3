"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { INTAKE_ALLOWED_MIME_TYPES, INTAKE_ALLOWED_EXTENSIONS } from "@/lib/constants/files";

export type CompanyFileActionState = {
  error: string | null;
  success?: boolean;
};

// ── Upload Intake Attachment ──────────────────────────────────────────────────
// Company user uploads a reference file for their project.
// Verification: user must be a member of the project's company.
// Storage + DB writes use the service client to bypass RLS on project-files.
// Auth + ownership are verified above via the session client.

export async function uploadIntakeFile(
  _prevState: CompanyFileActionState,
  formData: FormData
): Promise<CompanyFileActionState> {
  const supabase = await createClient();

  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return { error: "Not authenticated." };

  const projectId = formData.get("project_id") as string;
  const file = formData.get("file") as File | null;

  if (!projectId) return { error: "Missing project ID." };
  if (!file || file.size === 0) return { error: "Please select a file to upload." };
  const fileExt = file.name.split(".").pop()?.toLowerCase() ?? "";
  if (!INTAKE_ALLOWED_MIME_TYPES.has(file.type) && !INTAKE_ALLOWED_EXTENSIONS.has(fileExt)) {
    return { error: "Unsupported file type. Accepted: PDF, PNG, JPEG, WebP, GIF, ZIP, DWG, DXF." };
  }
  if (file.size > 52428800) return { error: "File exceeds 50 MB limit." };

  const userId = userData.user.id;

  // Verify the user belongs to the project's company
  const { data: membership } = await supabase
    .from("company_memberships")
    .select("company_id")
    .eq("user_id", userId)
    .single();

  if (!membership) return { error: "Your account is not linked to a company." };

  const { data: project } = await supabase
    .from("projects")
    .select("id, company_id")
    .eq("id", projectId)
    .eq("company_id", membership.company_id)
    .single();

  if (!project) return { error: "Project not found or access denied." };

  // Fetch uploader's display name for labeling
  const { data: profile } = await supabase
    .from("user_profiles")
    .select("display_name")
    .eq("id", userId)
    .single();
  const uploaderLabel = profile?.display_name || "Company User";

  const safeFileName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const storagePath = `${projectId}/intake/${Date.now()}_${safeFileName}`;

  const serviceClient = createServiceClient();

  const { error: uploadError } = await serviceClient.storage
    .from("project-files")
    .upload(storagePath, file, { contentType: file.type, upsert: false });

  if (uploadError) {
    console.error("Intake file upload error:", uploadError.message, uploadError);
    return { error: `Upload failed: ${uploadError.message}` };
  }

  const { error: dbError } = await serviceClient.from("project_files").insert({
    project_id: projectId,
    uploaded_by: userId,
    uploader_label: uploaderLabel,
    file_category: "intake_attachment",
    file_type: "intake",
    file_name: file.name,
    storage_path: storagePath,
    file_size_bytes: file.size,
    mime_type: file.type,
  });

  if (dbError) {
    console.error("Intake file record error:", dbError);
    await serviceClient.storage.from("project-files").remove([storagePath]);
    return { error: "Failed to save file record." };
  }

  await serviceClient.from("project_activity").insert({
    project_id: projectId,
    actor_id: userId,
    actor_label: uploaderLabel,
    action: `Attachment uploaded: ${file.name}`,
    metadata: { file_name: file.name, storage_path: storagePath },
  });

  revalidatePath(`/company/projects/${projectId}`);
  return { error: null, success: true };
}
