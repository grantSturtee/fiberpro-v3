"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";

export type SettingsActionState = {
  error: string | null;
  success?: boolean;
};

// ── Auth guard (shared) ───────────────────────────────────────────────────────

async function requireAdmin() {
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return { supabase: null, userId: null, error: "Not signed in." };
  const { data: profile } = await supabase
    .from("user_profiles").select("role").eq("id", userData.user.id).single();
  if (profile?.role !== "admin") return { supabase: null, userId: null, error: "Admin required." };
  return { supabase, userId: userData.user.id, error: null };
}

// =============================================================================
// D1. TCD LIBRARY
// =============================================================================

export async function addTCDEntry(
  _prev: SettingsActionState,
  formData: FormData
): Promise<SettingsActionState> {
  const { supabase, error: authError } = await requireAdmin();
  if (authError || !supabase) return { error: authError };

  const code = (formData.get("code") as string)?.trim().toUpperCase();
  const title = (formData.get("title") as string)?.trim() || null;
  const description = (formData.get("description") as string)?.trim();
  const category = (formData.get("category") as string)?.trim() || null;
  const state = (formData.get("state") as string)?.trim() || null;
  const sortOrder = parseInt((formData.get("sort_order") as string) || "0", 10) || 0;

  if (!code) return { error: "TCD code is required." };
  if (!description) return { error: "Description is required." };

  // Handle optional PDF upload
  let storagePath: string | null = null;
  const file = formData.get("pdf_file") as File | null;
  if (file && file.size > 0) {
    if (file.type !== "application/pdf") return { error: "File must be a PDF." };
    if (file.size > 20 * 1024 * 1024) return { error: "PDF must be 20 MB or less." };

    const timestamp = Date.now();
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const path = `${code.toLowerCase()}/${timestamp}_${safeName}`;

    const storageClient = createServiceClient();
    const { error: uploadError } = await storageClient.storage
      .from("tcd-pdfs")
      .upload(path, file, { contentType: "application/pdf", upsert: false });

    if (uploadError) {
      console.error("TCD PDF upload error:", uploadError.message, uploadError);
      return { error: `PDF upload failed: ${uploadError.message}` };
    }
    storagePath = path;
  }

  const { error: insertError } = await supabase.from("tcd_library").insert({
    code,
    title,
    description,
    category,
    state,
    storage_path: storagePath,
    sort_order: sortOrder,
    is_active: true,
  });

  if (insertError) {
    if (insertError.code === "23505") return { error: `TCD code "${code}" already exists.` };
    console.error("TCD insert error:", insertError);
    return { error: "Failed to add TCD entry." };
  }

  revalidatePath("/admin/settings/tcd");
  return { error: null, success: true };
}

export async function updateTCDEntry(
  _prev: SettingsActionState,
  formData: FormData
): Promise<SettingsActionState> {
  const { supabase, error: authError } = await requireAdmin();
  if (authError || !supabase) return { error: authError };

  const id = (formData.get("id") as string)?.trim();
  const code = (formData.get("code") as string)?.trim().toUpperCase();
  const title = (formData.get("title") as string)?.trim() || null;
  const description = (formData.get("description") as string)?.trim();
  const category = (formData.get("category") as string)?.trim() || null;
  const state = (formData.get("state") as string)?.trim() || null;
  const sortOrder = parseInt((formData.get("sort_order") as string) || "0", 10) || 0;

  if (!id) return { error: "Missing ID." };
  if (!code) return { error: "TCD code is required." };
  if (!description) return { error: "Description is required." };

  // Handle optional new PDF upload
  let storagePath: string | undefined = undefined; // undefined = don't update
  const file = formData.get("pdf_file") as File | null;
  if (file && file.size > 0) {
    if (file.type !== "application/pdf") return { error: "File must be a PDF." };
    if (file.size > 20 * 1024 * 1024) return { error: "PDF must be 20 MB or less." };

    const timestamp = Date.now();
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const path = `${code.toLowerCase()}/${timestamp}_${safeName}`;

    const storageClient = createServiceClient();
    const { error: uploadError } = await storageClient.storage
      .from("tcd-pdfs")
      .upload(path, file, { contentType: "application/pdf", upsert: false });

    if (uploadError) {
      console.error("TCD PDF upload error:", uploadError.message, uploadError);
      return { error: `PDF upload failed: ${uploadError.message}` };
    }
    storagePath = path;
  }

  const updatePayload: Record<string, unknown> = {
    code, title, description, category, state, sort_order: sortOrder,
  };
  if (storagePath !== undefined) updatePayload.storage_path = storagePath;

  const { error: updateError } = await supabase
    .from("tcd_library").update(updatePayload).eq("id", id);

  if (updateError) {
    console.error("TCD update error:", updateError);
    return { error: "Failed to update TCD entry." };
  }

  revalidatePath("/admin/settings/tcd");
  return { error: null, success: true };
}

export async function deactivateTCDEntry(
  _prev: SettingsActionState,
  formData: FormData
): Promise<SettingsActionState> {
  const { supabase, error: authError } = await requireAdmin();
  if (authError || !supabase) return { error: authError };

  const id = (formData.get("id") as string)?.trim();
  if (!id) return { error: "Missing ID." };

  const { error } = await supabase
    .from("tcd_library").update({ is_active: false }).eq("id", id);

  if (error) return { error: "Failed to deactivate entry." };

  revalidatePath("/admin/settings/tcd");
  return { error: null, success: true };
}

// =============================================================================
// D2. COVER SHEET TEMPLATES
// =============================================================================

export async function addCoverTemplate(
  _prev: SettingsActionState,
  formData: FormData
): Promise<SettingsActionState> {
  const { supabase, error: authError } = await requireAdmin();
  if (authError || !supabase) return { error: authError };

  const name = (formData.get("name") as string)?.trim();
  const authorityTypeRaw = (formData.get("authority_type") as string)?.trim() || null;
  const county = (formData.get("county") as string)?.trim() || null;
  const state = (formData.get("state") as string)?.trim() || null;
  const workType = (formData.get("work_type") as string)?.trim() || null;
  const notes = (formData.get("notes") as string)?.trim() || null;
  const isDefault = formData.get("is_default") === "true";

  if (!name) return { error: "Template name is required." };

  const validAuthTypes = ["county", "njdot", "municipal", "other"];
  const authorityType = authorityTypeRaw && validAuthTypes.includes(authorityTypeRaw)
    ? authorityTypeRaw : null;

  let storagePath: string | null = null;
  const file = formData.get("template_file") as File | null;
  if (file && file.size > 0) {
    if (file.type !== "application/pdf") return { error: "Template file must be a PDF." };
    if (file.size > 20 * 1024 * 1024) return { error: "File must be 20 MB or less." };

    const timestamp = Date.now();
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const path = `${timestamp}_${safeName}`;

    const storageClient = createServiceClient();
    const { error: uploadError } = await storageClient.storage
      .from("cover-templates")
      .upload(path, file, { contentType: "application/pdf", upsert: false });

    if (uploadError) {
      console.error("Cover template upload error:", uploadError.message, uploadError);
      return { error: `File upload failed: ${uploadError.message}` };
    }
    storagePath = path;
  }

  const { error: insertError } = await supabase.from("cover_sheet_templates").insert({
    name,
    authority_type: authorityType,
    county,
    state,
    work_type: workType,
    notes,
    storage_path: storagePath,
    is_default: isDefault,
    is_active: true,
  });

  if (insertError) {
    console.error("Cover template insert error:", insertError);
    return { error: "Failed to add template." };
  }

  revalidatePath("/admin/settings/covers");
  return { error: null, success: true };
}

export async function updateCoverTemplate(
  _prev: SettingsActionState,
  formData: FormData
): Promise<SettingsActionState> {
  const { supabase, error: authError } = await requireAdmin();
  if (authError || !supabase) return { error: authError };

  const id = (formData.get("id") as string)?.trim();
  const name = (formData.get("name") as string)?.trim();
  const authorityTypeRaw = (formData.get("authority_type") as string)?.trim() || null;
  const county = (formData.get("county") as string)?.trim() || null;
  const state = (formData.get("state") as string)?.trim() || null;
  const workType = (formData.get("work_type") as string)?.trim() || null;
  const notes = (formData.get("notes") as string)?.trim() || null;
  const isDefault = formData.get("is_default") === "true";

  if (!id) return { error: "Missing ID." };
  if (!name) return { error: "Template name is required." };

  const validAuthTypes = ["county", "njdot", "municipal", "other"];
  const authorityType = authorityTypeRaw && validAuthTypes.includes(authorityTypeRaw)
    ? authorityTypeRaw : null;

  let storagePath: string | undefined = undefined;
  const file = formData.get("template_file") as File | null;
  if (file && file.size > 0) {
    if (file.type !== "application/pdf") return { error: "Template file must be a PDF." };
    const timestamp = Date.now();
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const path = `${timestamp}_${safeName}`;
    const storageClient = createServiceClient();
    const { error: uploadError } = await storageClient.storage
      .from("cover-templates")
      .upload(path, file, { contentType: "application/pdf", upsert: false });
    if (uploadError) return { error: `File upload failed: ${uploadError.message}` };
    storagePath = path;
  }

  const updatePayload: Record<string, unknown> = {
    name, authority_type: authorityType, county, state, work_type: workType, notes, is_default: isDefault,
  };
  if (storagePath !== undefined) updatePayload.storage_path = storagePath;

  const { error } = await supabase.from("cover_sheet_templates").update(updatePayload).eq("id", id);
  if (error) return { error: "Failed to update template." };

  revalidatePath("/admin/settings/covers");
  return { error: null, success: true };
}

export async function deactivateCoverTemplate(
  _prev: SettingsActionState,
  formData: FormData
): Promise<SettingsActionState> {
  const { supabase, error: authError } = await requireAdmin();
  if (authError || !supabase) return { error: authError };

  const id = (formData.get("id") as string)?.trim();
  if (!id) return { error: "Missing ID." };

  const { error } = await supabase
    .from("cover_sheet_templates").update({ is_active: false }).eq("id", id);

  if (error) return { error: "Failed to deactivate template." };

  revalidatePath("/admin/settings/covers");
  return { error: null, success: true };
}

// =============================================================================
// D3. PRICING RULES — moved to /admin/settings/pricing/actions.ts
// =============================================================================

// =============================================================================
// D4. JURISDICTION REQUIREMENTS
// =============================================================================

export async function addJurisdiction(
  _prev: SettingsActionState,
  formData: FormData
): Promise<SettingsActionState> {
  const { supabase, error: authError } = await requireAdmin();
  if (authError || !supabase) return { error: authError };

  const state = (formData.get("state") as string)?.trim() || "NJ";
  const county = (formData.get("county") as string)?.trim() || null;
  const municipality = (formData.get("municipality") as string)?.trim() || null;
  const authorityName = (formData.get("authority_name") as string)?.trim() || null;
  const authorityTypeRaw = (formData.get("authority_type") as string)?.trim() || null;
  const submissionMethod = (formData.get("submission_method") as string)?.trim() || null;
  const submissionUrl = (formData.get("submission_url") as string)?.trim() || null;
  const submissionEmail = (formData.get("submission_email") as string)?.trim() || null;
  const mailingAddress = (formData.get("mailing_address") as string)?.trim() || null;

  if (!state) return { error: "State is required." };

  const validAuthTypes = ["county", "njdot", "municipal", "other"];
  const authorityType = authorityTypeRaw && validAuthTypes.includes(authorityTypeRaw)
    ? authorityTypeRaw : null;

  const validMethods = ["online", "email", "mail", "in_person"];
  const cleanMethod = submissionMethod && validMethods.includes(submissionMethod)
    ? submissionMethod : null;

  const bool = (key: string) => formData.get(key) === "on" || formData.get(key) === "true";

  const { error: insertError } = await supabase.from("jurisdiction_requirements").insert({
    state,
    county,
    municipality,
    authority_name: authorityName,
    authority_type: authorityType,
    submission_method: cleanMethod,
    submission_url: submissionUrl,
    submission_email: submissionEmail,
    mailing_address: mailingAddress,
    requires_application_form: bool("requires_application_form"),
    requires_cover_sheet: bool("requires_cover_sheet"),
    requires_tcp: bool("requires_tcp"),
    requires_sld: bool("requires_sld"),
    requires_tcd: bool("requires_tcd"),
    requires_coi: bool("requires_coi"),
    requires_pe: bool("requires_pe"),
    requires_payment_upfront: bool("requires_payment_upfront"),
    payment_method_notes: (formData.get("payment_method_notes") as string)?.trim() || null,
    turnaround_notes: (formData.get("turnaround_notes") as string)?.trim() || null,
    special_instructions: (formData.get("special_instructions") as string)?.trim() || null,
    billing_impact_notes: (formData.get("billing_impact_notes") as string)?.trim() || null,
    package_impact_notes: (formData.get("package_impact_notes") as string)?.trim() || null,
    is_active: true,
  });

  if (insertError) {
    console.error("Jurisdiction insert error:", insertError);
    return { error: "Failed to add jurisdiction." };
  }

  revalidatePath("/admin/settings/jurisdictions");
  return { error: null, success: true };
}

export async function deactivateJurisdiction(
  _prev: SettingsActionState,
  formData: FormData
): Promise<SettingsActionState> {
  const { supabase, error: authError } = await requireAdmin();
  if (authError || !supabase) return { error: authError };

  const id = (formData.get("id") as string)?.trim();
  if (!id) return { error: "Missing ID." };

  const { error } = await supabase
    .from("jurisdiction_requirements").update({ is_active: false }).eq("id", id);

  if (error) return { error: "Failed to deactivate jurisdiction." };

  revalidatePath("/admin/settings/jurisdictions");
  return { error: null, success: true };
}
