"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { PAGE_TEMPLATES_BUCKET } from "@/lib/constants/files";

export type TemplateAsset = {
  id: string;
  name: string;
  storage_path: string;
  mime_type: string;
  created_at: string;
};

export type TemplateAssetActionState = {
  error: string | null;
  success?: boolean;
  asset?: TemplateAsset;
};

const ALLOWED_ASSET_TYPES = new Set([
  "image/png", "image/jpeg", "image/jpg", "image/webp",
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

export async function createTemplateAsset(
  _prev: TemplateAssetActionState,
  formData: FormData
): Promise<TemplateAssetActionState> {
  const { supabase, error: authError } = await requireAdmin();
  if (authError || !supabase) return { error: authError };

  const templateId = (formData.get("template_id") as string)?.trim();
  if (!templateId) return { error: "Template ID required." };

  const name = ((formData.get("name") as string)?.trim()) || "";
  const file = formData.get("file") as File | null;
  if (!file || file.size === 0) return { error: "Image file required." };

  if (!ALLOWED_ASSET_TYPES.has(file.type)) {
    return { error: "Only PNG, JPEG, or WebP images are supported." };
  }
  if (file.size > 5 * 1024 * 1024) return { error: "Image must be 5 MB or less." };

  const safeName    = file.name.replace(/[^a-zA-Z0-9._-]/g, "_").toLowerCase();
  const storagePath = `assets/${templateId}/${Date.now()}_${safeName}`;
  const assetName   = name || file.name.replace(/\.[^.]+$/, "");

  const serviceClient = createServiceClient();
  const { error: uploadError } = await serviceClient.storage
    .from(PAGE_TEMPLATES_BUCKET)
    .upload(storagePath, file, { contentType: file.type, upsert: false });

  if (uploadError) return { error: `Upload failed: ${uploadError.message}` };

  const { data: row, error: insertError } = await supabase
    .from("page_template_assets")
    .insert({ page_template_id: templateId, name: assetName, storage_path: storagePath, mime_type: file.type })
    .select("id, name, storage_path, mime_type, created_at")
    .single();

  if (insertError || !row) {
    await serviceClient.storage.from(PAGE_TEMPLATES_BUCKET).remove([storagePath]);
    return { error: "Failed to save asset record." };
  }

  revalidatePath(`/admin/settings/page-templates/${templateId}`);
  return { error: null, success: true, asset: row as TemplateAsset };
}

export async function renameTemplateAsset(
  _prev: TemplateAssetActionState,
  formData: FormData
): Promise<TemplateAssetActionState> {
  const { supabase, error: authError } = await requireAdmin();
  if (authError || !supabase) return { error: authError };

  const assetId    = (formData.get("asset_id")    as string)?.trim();
  const templateId = (formData.get("template_id") as string)?.trim();
  const name       = (formData.get("name")        as string)?.trim();
  if (!assetId || !templateId || !name) return { error: "Missing required fields." };

  const { error } = await supabase
    .from("page_template_assets")
    .update({ name })
    .eq("id", assetId)
    .eq("page_template_id", templateId);

  if (error) return { error: "Failed to rename asset." };

  revalidatePath(`/admin/settings/page-templates/${templateId}`);
  return { error: null, success: true };
}

export async function deleteTemplateAsset(
  _prev: TemplateAssetActionState,
  formData: FormData
): Promise<TemplateAssetActionState> {
  const { supabase, error: authError } = await requireAdmin();
  if (authError || !supabase) return { error: authError };

  const assetId    = (formData.get("asset_id")    as string)?.trim();
  const templateId = (formData.get("template_id") as string)?.trim();
  if (!assetId || !templateId) return { error: "Asset and template ID required." };

  const { data: asset } = await supabase
    .from("page_template_assets")
    .select("storage_path")
    .eq("id", assetId)
    .eq("page_template_id", templateId)
    .maybeSingle();

  const { error: deleteError } = await supabase
    .from("page_template_assets")
    .delete()
    .eq("id", assetId)
    .eq("page_template_id", templateId);

  if (deleteError) return { error: "Failed to delete asset." };

  if (asset?.storage_path) {
    const serviceClient = createServiceClient();
    await serviceClient.storage.from(PAGE_TEMPLATES_BUCKET).remove([asset.storage_path]);
  }

  revalidatePath(`/admin/settings/page-templates/${templateId}`);
  return { error: null, success: true };
}
