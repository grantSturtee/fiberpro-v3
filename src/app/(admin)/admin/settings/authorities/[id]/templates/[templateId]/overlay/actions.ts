"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";

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

export type SaveResult = { error: string | null };

export type ReplaceResult = {
  error: string | null;
  newFileUrl?: string;
  newFileName?: string;
};

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

export async function saveOverlayMappings(
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

  const { error } = await supabase
    .from("authority_document_templates")
    .update({ field_mappings: mappings })
    .eq("id", templateId);

  if (error) {
    console.error("saveOverlayMappings:", error);
    return { error: "Failed to save. Check console for details." };
  }

  revalidatePath("/admin/settings/authorities");
  return { error: null };
}

// ── Replace (or initial-upload) source PDF ────────────────────────────────────
/**
 * Upload a new PDF for an existing authority_document_templates row.
 * Replaces the stored file_url and removes the old file from storage.
 *
 * Storage path: {authorityId}/{timestamp}_{safe_filename}
 * Revalidates the overlay editor path so the server re-reads the new file_url
 * on next navigation.
 *
 * Returns { newFileUrl, newFileName } on success so the client can immediately
 * update its cached pdfUrl and avoid a full page reload.
 */
export async function replacePdf(
  _prev: ReplaceResult,
  formData: FormData
): Promise<ReplaceResult> {
  const { supabase, error: authError } = await requireAdmin();
  if (authError || !supabase) return { error: authError };

  const templateId  = (formData.get("template_id")  as string)?.trim();
  const authorityId = (formData.get("authority_id") as string)?.trim();
  if (!templateId || !authorityId)
    return { error: "Missing template_id or authority_id." };

  const file = formData.get("file") as File | null;
  if (!file || file.size === 0) return { error: "A PDF file is required." };
  if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf"))
    return { error: "File must be a PDF." };
  if (file.size > 20 * 1024 * 1024) return { error: "PDF must be 20 MB or less." };

  // Fetch the current template so we can remove the old file afterwards
  const { data: template } = await supabase
    .from("authority_document_templates")
    .select("id, file_url")
    .eq("id", templateId)
    .eq("authority_id", authorityId)
    .maybeSingle();

  if (!template) return { error: "Template not found." };

  // Upload the new file
  const timestamp = Date.now();
  const safeName  = file.name.replace(/[^a-zA-Z0-9._-]/g, "_").toLowerCase();
  const newPath   = `${authorityId}/${timestamp}_${safeName}`;

  const service = createServiceClient();
  const { error: uploadError } = await service.storage
    .from("authority-documents")
    .upload(newPath, file, { contentType: "application/pdf", upsert: false });

  if (uploadError) {
    console.error("replacePdf upload error:", uploadError);
    return { error: `Upload failed: ${uploadError.message}` };
  }

  // Update the template row with the new path
  const { error: updateError } = await supabase
    .from("authority_document_templates")
    .update({ file_url: newPath })
    .eq("id", templateId);

  if (updateError) {
    // Best-effort: remove the newly uploaded file to avoid orphans
    await service.storage.from("authority-documents").remove([newPath]);
    console.error("replacePdf update error:", updateError);
    return { error: "Failed to update template record." };
  }

  // Remove the old file (best-effort — don't fail if it errors)
  if (template.file_url && template.file_url !== newPath) {
    await service.storage
      .from("authority-documents")
      .remove([template.file_url])
      .catch(() => {}); // intentionally swallowed
  }

  revalidatePath(
    `/admin/settings/authorities/${authorityId}/templates/${templateId}/overlay`
  );

  return { error: null, newFileUrl: newPath, newFileName: safeName };
}
