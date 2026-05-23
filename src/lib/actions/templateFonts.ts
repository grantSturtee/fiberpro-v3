"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { PAGE_TEMPLATES_BUCKET } from "@/lib/constants/files";

export type TemplateFont = {
  id: string;
  display_name: string;
  storage_path: string;
  original_filename: string;
  mime_type: string;
  file_ext: string;
  is_active: boolean;
  created_at: string;
};

export type TemplateFontActionState = {
  error: string | null;
  success?: boolean;
  font?: TemplateFont;
};

const ALLOWED_FONT_EXTENSIONS = new Set(["ttf", "otf"]);
const ALLOWED_FONT_MIME_TYPES = new Set([
  "font/ttf",
  "font/otf",
  "application/x-font-ttf",
  "application/x-font-opentype",
  "application/font-sfnt",
  // Browsers may report these for drag-and-drop
  "application/octet-stream",
]);

async function requireAdmin() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (!claims) return { supabase: null, error: "Not signed in." };
  const role = (claims.app_metadata as { role?: string })?.role;
  if (role !== "admin") return { supabase: null, error: "Admin required." };
  return { supabase, error: null };
}

export async function listTemplateFonts(): Promise<TemplateFont[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("page_template_fonts")
    .select("id, display_name, storage_path, original_filename, mime_type, file_ext, is_active, created_at")
    .eq("is_active", true)
    .order("display_name");
  return (data ?? []) as TemplateFont[];
}

export async function createTemplateFont(
  _prev: TemplateFontActionState,
  formData: FormData
): Promise<TemplateFontActionState> {
  const { supabase, error: authError } = await requireAdmin();
  if (authError || !supabase) return { error: authError };

  const displayName = (formData.get("display_name") as string)?.trim();
  if (!displayName) return { error: "Font name is required." };
  if (displayName.length > 80) return { error: "Font name must be 80 characters or less." };

  const file = formData.get("file") as File | null;
  if (!file || file.size === 0) return { error: "Font file is required." };
  if (file.size > 10 * 1024 * 1024) return { error: "Font file must be 10 MB or less." };

  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  if (!ALLOWED_FONT_EXTENSIONS.has(ext)) {
    return { error: "Only TTF and OTF font files are supported." };
  }
  if (file.type && !ALLOWED_FONT_MIME_TYPES.has(file.type)) {
    // Extension is the authoritative gate; MIME is best-effort
    console.warn(`templateFonts: unexpected MIME type "${file.type}" for font upload — extension gate passed`);
  }

  const safeName    = file.name.replace(/[^a-zA-Z0-9._-]/g, "_").toLowerCase();
  const storagePath = `fonts/${Date.now()}_${safeName}`;

  const serviceClient = createServiceClient();
  const { error: uploadError } = await serviceClient.storage
    .from(PAGE_TEMPLATES_BUCKET)
    .upload(storagePath, file, { contentType: "application/octet-stream", upsert: false });

  if (uploadError) return { error: `Upload failed: ${uploadError.message}` };

  const { data: row, error: insertError } = await supabase
    .from("page_template_fonts")
    .insert({
      display_name:      displayName,
      storage_path:      storagePath,
      original_filename: file.name,
      mime_type:         file.type || "application/octet-stream",
      file_ext:          ext,
    })
    .select("id, display_name, storage_path, original_filename, mime_type, file_ext, is_active, created_at")
    .single();

  if (insertError || !row) {
    await serviceClient.storage.from(PAGE_TEMPLATES_BUCKET).remove([storagePath]);
    return { error: "Failed to save font record." };
  }

  revalidatePath("/admin/settings/page-templates/fonts");
  return { error: null, success: true, font: row as TemplateFont };
}

export async function deleteTemplateFont(
  _prev: TemplateFontActionState,
  formData: FormData
): Promise<TemplateFontActionState> {
  const { supabase, error: authError } = await requireAdmin();
  if (authError || !supabase) return { error: authError };

  const fontId = (formData.get("font_id") as string)?.trim();
  if (!fontId) return { error: "Font ID required." };

  const { data: existing } = await supabase
    .from("page_template_fonts")
    .select("storage_path")
    .eq("id", fontId)
    .maybeSingle();

  const { error: deleteError } = await supabase
    .from("page_template_fonts")
    .delete()
    .eq("id", fontId);

  if (deleteError) return { error: "Failed to delete font." };

  if (existing?.storage_path) {
    const serviceClient = createServiceClient();
    await serviceClient.storage.from(PAGE_TEMPLATES_BUCKET).remove([existing.storage_path]);
  }

  revalidatePath("/admin/settings/page-templates/fonts");
  return { error: null, success: true };
}
