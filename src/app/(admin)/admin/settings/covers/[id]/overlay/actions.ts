"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";

// Re-use the same overlay mapping shape as authority templates.
export type OverlayField = {
  key: string;
  x: number;
  y: number;
  page: number;
};

export type OverlayMappings = {
  mode: "overlay";
  fontSize: number;
  fields: OverlayField[];
};

export type SaveResult    = { error: string | null };
export type ReplaceResult = { error: string | null; newFileUrl?: string; newFileName?: string };
export type UploadVersionResult = {
  error: string | null;
  versionId?: string;
};
export type MakeLiveResult = { error: string | null };

// ── Auth helper ───────────────────────────────────────────────────────────────

async function requireAdmin() {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  if (error || !data?.claims) return { supabase: null, error: "Not signed in." };
  const role = (data.claims.app_metadata as { role?: string })?.role;
  if (role !== "admin") return { supabase: null, error: "Admin required." };
  return { supabase, error: null };
}

// ── Save overlay field mappings ───────────────────────────────────────────────
// Saves to the live version's field_mappings AND keeps the template in sync.

export async function saveCoverOverlayMappings(
  templateId: string,
  mappingsJson: string
): Promise<SaveResult> {
  const { supabase, error: authError } = await requireAdmin();
  if (authError || !supabase) return { error: authError };

  let mappings: OverlayMappings;
  try {
    mappings = JSON.parse(mappingsJson) as OverlayMappings;
  } catch {
    return { error: "Invalid JSON." };
  }

  if (mappings.mode !== "overlay") return { error: "mode must be 'overlay'." };
  if (!Array.isArray(mappings.fields)) return { error: "fields must be an array." };

  // Save to template for backward compatibility.
  const { error: templateError } = await supabase
    .from("cover_sheet_templates")
    .update({ field_mappings: mappings })
    .eq("id", templateId);

  if (templateError) {
    console.error("saveCoverOverlayMappings (template):", templateError);
    return { error: "Failed to save. Check console for details." };
  }

  // Also save to the live version.
  await supabase
    .from("cover_template_versions")
    .update({ field_mappings: mappings })
    .eq("cover_template_id", templateId)
    .eq("is_live", true);

  revalidatePath("/admin/settings/covers");
  return { error: null };
}

// ── Upload a new PDF version ──────────────────────────────────────────────────
// Creates a new cover_template_versions row.  If make_live is "true" the new
// version becomes live (all others are unset) and storage_path on the parent
// template is updated for backward compatibility.

export async function uploadCoverPdfVersion(
  formData: FormData
): Promise<UploadVersionResult> {
  const { supabase, error: authError } = await requireAdmin();
  if (authError || !supabase) return { error: authError };

  const templateId = (formData.get("template_id") as string)?.trim();
  if (!templateId) return { error: "Missing template_id." };

  const file = formData.get("file") as File | null;
  if (!file || file.size === 0) return { error: "A PDF file is required." };
  if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf"))
    return { error: "File must be a PDF." };
  if (file.size > 20 * 1024 * 1024) return { error: "PDF must be 20 MB or less." };

  const makeLive = formData.get("make_live") === "true";

  const timestamp = Date.now();
  const safeName  = file.name.replace(/[^a-zA-Z0-9._-]/g, "_").toLowerCase();
  const newPath   = `${timestamp}_${safeName}`;

  const service = createServiceClient();
  const { error: uploadError } = await service.storage
    .from("cover-templates")
    .upload(newPath, file, { contentType: "application/pdf", upsert: false });

  if (uploadError) {
    console.error("uploadCoverPdfVersion upload error:", uploadError);
    return { error: `Upload failed: ${uploadError.message}` };
  }

  // If making live, clear the existing live flag first.
  if (makeLive) {
    await supabase
      .from("cover_template_versions")
      .update({ is_live: false })
      .eq("cover_template_id", templateId)
      .eq("is_live", true);
  }

  const versionId = crypto.randomUUID();

  const { error: insertError } = await supabase
    .from("cover_template_versions")
    .insert({
      id: versionId,
      cover_template_id: templateId,
      storage_path: newPath,
      filename: safeName,
      is_live: makeLive,
    });

  if (insertError) {
    // Remove the orphaned file.
    await service.storage.from("cover-templates").remove([newPath]).catch(() => {});
    console.error("uploadCoverPdfVersion insert error:", insertError);
    return { error: "Failed to save version record." };
  }

  // Keep template.storage_path in sync when going live.
  if (makeLive) {
    await supabase
      .from("cover_sheet_templates")
      .update({ storage_path: newPath })
      .eq("id", templateId);
  }

  revalidatePath(`/admin/settings/covers/${templateId}/edit`);
  revalidatePath(`/admin/settings/covers/${templateId}/overlay`);

  return { error: null, versionId };
}

// ── Make a specific version live ──────────────────────────────────────────────
// Flips is_live on the target version and updates the parent template's
// storage_path so the PDF proxy and generation pipeline continue to work.

export async function makeCoverVersionLive(
  versionId: string,
  templateId: string
): Promise<MakeLiveResult> {
  const { supabase, error: authError } = await requireAdmin();
  if (authError || !supabase) return { error: authError };

  // Fetch the target version.
  const { data: version } = await supabase
    .from("cover_template_versions")
    .select("id, storage_path, cover_template_id")
    .eq("id", versionId)
    .eq("cover_template_id", templateId)
    .maybeSingle();

  if (!version) return { error: "Version not found." };

  // Clear existing live flag.
  const { error: clearError } = await supabase
    .from("cover_template_versions")
    .update({ is_live: false })
    .eq("cover_template_id", templateId)
    .eq("is_live", true);

  if (clearError) {
    console.error("makeCoverVersionLive clear error:", clearError);
    return { error: "Failed to update live version." };
  }

  // Set the new live version.
  const { error: setError } = await supabase
    .from("cover_template_versions")
    .update({ is_live: true })
    .eq("id", versionId);

  if (setError) {
    console.error("makeCoverVersionLive set error:", setError);
    return { error: "Failed to set live version." };
  }

  // Sync template.storage_path.
  await supabase
    .from("cover_sheet_templates")
    .update({ storage_path: version.storage_path })
    .eq("id", templateId);

  revalidatePath(`/admin/settings/covers/${templateId}/edit`);
  revalidatePath(`/admin/settings/covers/${templateId}/overlay`);

  return { error: null };
}

// ── Legacy: replace source PDF (kept for backward compat, wraps uploadCoverPdfVersion) ──

export async function replaceCoverPdf(
  _prev: ReplaceResult,
  formData: FormData
): Promise<ReplaceResult> {
  formData.set("make_live", "true");
  const result = await uploadCoverPdfVersion(formData);
  if (result.error) return { error: result.error };
  return { error: null };
}
