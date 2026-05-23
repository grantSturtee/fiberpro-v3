"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";

export type TemplateActionState = { error: string | null; success?: boolean };

const VALID_TYPES = ["application", "certification"] as const;
type TemplateType = (typeof VALID_TYPES)[number];

async function requireAdmin() {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  if (error || !data?.claims) return { supabase: null, error: "Not signed in." };
  const role = (data.claims.app_metadata as { role?: string })?.role;
  if (role !== "admin") return { supabase: null, error: "Admin required." };
  return { supabase, error: null };
}

/**
 * Upload a PDF and create an authority_document_templates row.
 *
 * Storage path: authority-documents/{authority_id}/{timestamp}_{safe_filename}
 * field_mappings defaults to null — configure via the overlay editor.
 *
 * On success, redirects to the templates list for the authority so the admin
 * can immediately see the new entry and click "Configure Overlay".
 */
export async function createAuthorityDocTemplate(
  _prev: TemplateActionState,
  formData: FormData
): Promise<TemplateActionState> {
  const { supabase, error: authError } = await requireAdmin();
  if (authError || !supabase) return { error: authError };

  // ── Validate fields ───────────────────────────────────────────────────────
  const authorityId = (formData.get("authority_id") as string)?.trim();
  if (!authorityId) return { error: "Missing authority ID." };

  const rawType = (formData.get("type") as string)?.trim();
  if (!(VALID_TYPES as readonly string[]).includes(rawType)) {
    return { error: "Template type must be 'application' or 'certification'." };
  }
  const type = rawType as TemplateType;

  const file = formData.get("file") as File | null;
  if (!file || file.size === 0) return { error: "A PDF file is required." };
  if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
    return { error: "File must be a PDF." };
  }
  if (file.size > 20 * 1024 * 1024) return { error: "PDF must be 20 MB or less." };

  // ── Verify the authority exists (and admin can see it) ────────────────────
  const { data: authority } = await supabase
    .from("authority_profiles")
    .select("id, name")
    .eq("id", authorityId)
    .maybeSingle();

  if (!authority) return { error: "Authority not found." };

  // ── Upload PDF to authority-documents bucket ──────────────────────────────
  // Path: {authority_id}/{timestamp}_{safe_filename}
  const timestamp = Date.now();
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_").toLowerCase();
  const storagePath = `${authorityId}/${timestamp}_${safeName}`;

  const storageClient = createServiceClient();
  const { error: uploadError } = await storageClient.storage
    .from("authority-documents")
    .upload(storagePath, file, { contentType: "application/pdf", upsert: false });

  if (uploadError) {
    console.error("Authority template upload error:", uploadError.message, uploadError);
    return { error: `PDF upload failed: ${uploadError.message}` };
  }

  // ── Insert the template row ───────────────────────────────────────────────
  // field_mappings is intentionally null — the overlay editor will populate it.
  const { error: insertError } = await supabase
    .from("authority_document_templates")
    .insert({
      authority_id:   authorityId,
      type,
      file_url:       storagePath,
      field_mappings: null,
    });

  if (insertError) {
    // Best-effort: remove the uploaded file so we don't leave orphans
    await storageClient.storage
      .from("authority-documents")
      .remove([storagePath]);

    console.error("Authority template insert error:", insertError);
    return { error: "Failed to create template record." };
  }

  revalidatePath(`/admin/settings/authorities/${authorityId}/templates`);
  redirect(`/admin/settings/authorities/${authorityId}/templates`);
}

/**
 * Delete an authority_document_templates row and its backing PDF.
 * Only used when admin explicitly removes a template from the list.
 */
export async function deleteAuthorityDocTemplate(
  _prev: TemplateActionState,
  formData: FormData
): Promise<TemplateActionState> {
  const { supabase, error: authError } = await requireAdmin();
  if (authError || !supabase) return { error: authError };

  const templateId  = (formData.get("template_id") as string)?.trim();
  const authorityId = (formData.get("authority_id") as string)?.trim();
  if (!templateId || !authorityId) return { error: "Missing IDs." };

  // Fetch the row first so we can clean up storage
  const { data: template } = await supabase
    .from("authority_document_templates")
    .select("file_url")
    .eq("id", templateId)
    .eq("authority_id", authorityId)
    .maybeSingle();

  if (!template) return { error: "Template not found." };

  const { error: deleteError } = await supabase
    .from("authority_document_templates")
    .delete()
    .eq("id", templateId);

  if (deleteError) {
    console.error("Authority template delete error:", deleteError);
    return { error: "Failed to delete template." };
  }

  // Remove the file from storage (best-effort — don't fail the action if this errors)
  if (template.file_url) {
    const storageClient = createServiceClient();
    await storageClient.storage
      .from("authority-documents")
      .remove([template.file_url]);
  }

  revalidatePath(`/admin/settings/authorities/${authorityId}/templates`);
  return { error: null, success: true };
}
