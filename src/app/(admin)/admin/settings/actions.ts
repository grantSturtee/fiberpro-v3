"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { normalizeUpperFormField } from "@/lib/utils/textNormalization";

export type SettingsActionState = {
  error: string | null;
  success?: boolean;
};

// ── Auth guard (shared) ───────────────────────────────────────────────────────

async function requireAdmin() {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  if (error || !data?.claims) return { supabase: null, userId: null, error: "Not signed in." };
  const role = (data.claims.app_metadata as { role?: string })?.role;
  if (role !== "admin") return { supabase: null, userId: null, error: "Admin required." };
  const userId = data.claims.sub as string;
  return { supabase, userId, error: null };
}

// =============================================================================
// D0. GLOBAL APP SETTINGS
// =============================================================================

const VALID_CADENCE_DAYS = [1, 2, 3, 4, 5, 6, 7] as const;

export async function updateCadence(
  _prev: SettingsActionState,
  formData: FormData
): Promise<SettingsActionState> {
  const { supabase, error: authError } = await requireAdmin();
  if (authError || !supabase) return { error: authError };

  const raw = parseInt((formData.get("cadence_days") as string) ?? "", 10);
  if (!VALID_CADENCE_DAYS.includes(raw as (typeof VALID_CADENCE_DAYS)[number])) {
    return { error: "Invalid cadence value." };
  }

  const { error } = await supabase
    .from("app_settings")
    .upsert({ key: "project_update_cadence_days", value: String(raw), updated_at: new Date().toISOString() });

  if (error) {
    console.error("updateCadence error:", error);
    return { error: "Failed to save setting." };
  }

  revalidatePath("/admin/settings");
  revalidatePath("/admin/updates");
  return { error: null, success: true };
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

  // Permit-facing TCD identifiers are normalized to uppercase. description is
  // free-form prose and intentionally preserved as-is.
  const code = normalizeUpperFormField(formData, "code");
  const title = normalizeUpperFormField(formData, "title");
  const description = (formData.get("description") as string)?.trim();
  const category = normalizeUpperFormField(formData, "category");
  const state = normalizeUpperFormField(formData, "state");
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
  // See addTCDEntry for normalization rationale.
  const code = normalizeUpperFormField(formData, "code");
  const title = normalizeUpperFormField(formData, "title");
  const description = (formData.get("description") as string)?.trim();
  const category = normalizeUpperFormField(formData, "category");
  const state = normalizeUpperFormField(formData, "state");
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

    console.log("STEP 1: action start");
    console.log("STEP 2: file detected", file.name);

    const bytes = await file.arrayBuffer(); // read stream ONCE
    console.log("STEP 3: buffer created", bytes.byteLength);
    const buffer = Buffer.from(bytes);

    const timestamp = Date.now();
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const path = `${code.toLowerCase()}/${timestamp}_${safeName}`;

    const storageClient = createServiceClient();
    const { error: uploadError } = await storageClient.storage
      .from("tcd-pdfs")
      .upload(path, buffer, { contentType: "application/pdf", upsert: true });

    console.log("STEP 4: upload finished", uploadError);

    if (uploadError) {
      console.error("TCD PDF upload error:", uploadError.message, uploadError);
      return { error: `PDF upload failed: ${uploadError.message}` };
    }
    storagePath = path;
  }

  console.log("STEP 5: before return");

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

export async function deleteTCDEntry(
  _prev: SettingsActionState,
  formData: FormData
): Promise<SettingsActionState> {
  const { supabase, error: authError } = await requireAdmin();
  if (authError || !supabase) return { error: authError };

  const id = (formData.get("id") as string)?.trim();
  if (!id) return { error: "Missing ID." };

  const { data: item } = await supabase
    .from("tcd_library")
    .select("storage_path")
    .eq("id", id)
    .single();

  if (!item) return { error: "TCD entry not found." };

  const { error: deleteError } = await supabase
    .from("tcd_library")
    .delete()
    .eq("id", id);

  if (deleteError) {
    if (deleteError.code === "23503") {
      return { error: "This TCD sheet is used in one or more projects. Remove it from all projects first." };
    }
    console.error("TCD delete error:", deleteError);
    return { error: "Failed to delete TCD entry." };
  }

  if (item.storage_path) {
    const storageClient = createServiceClient();
    await storageClient.storage.from("tcd-pdfs").remove([item.storage_path]);
  }

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

  // Permit-facing template metadata is normalized to uppercase. authority_type
  // and work_type are system enum keys (validated against fixed lowercase sets
  // below) and must NOT be uppercased.
  const name = normalizeUpperFormField(formData, "name");
  const authorityTypeRaw = (formData.get("authority_type") as string)?.trim() || null;
  const county = normalizeUpperFormField(formData, "county");
  const state = normalizeUpperFormField(formData, "state");
  const workType = (formData.get("work_type") as string)?.trim() || null;

  if (!name) return { error: "Template name is required." };

  const validAuthTypes = ["state", "county", "township"];
  const authorityType = authorityTypeRaw && validAuthTypes.includes(authorityTypeRaw)
    ? authorityTypeRaw : null;

  const peRequired = formData.get("pe_required") === "true";

  // Validate work_type against the accepted set — reject any stale "both"/"any" values.
  const validWorkTypes = ["aerial", "underground"];
  const normalizedWorkType = workType && validWorkTypes.includes(workType) ? workType : null;

  let storagePath: string | null = null;
  let uploadedFilename: string | null = null;
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
    uploadedFilename = safeName;
  }

  // Pre-generate the ID so we can link the version record without needing
  // INSERT ... RETURNING, which can silently fail with certain RLS policies.
  const newTemplateId = crypto.randomUUID();

  const { error: insertError } = await supabase
    .from("cover_sheet_templates")
    .insert({
      id: newTemplateId,
      name,
      authority_type: authorityType,
      county,
      state,
      work_type: normalizedWorkType,
      storage_path: storagePath,
      pe_required: peRequired,
      is_active: true,
    });

  if (insertError) {
    console.error("Cover template insert error:", insertError);
    return { error: `Failed to add template. (${insertError.code ?? insertError.message})` };
  }

  // Create first version record (live) when a PDF was provided.
  if (storagePath && uploadedFilename) {
    const { error: versionError } = await supabase.from("cover_template_versions").insert({
      cover_template_id: newTemplateId,
      storage_path: storagePath,
      filename: uploadedFilename,
      is_live: true,
    });
    if (versionError) {
      console.error("Cover version insert error:", versionError);
      // Non-fatal — template exists, version can be uploaded from the edit page.
    }
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
  // See addCoverTemplate for normalization rationale.
  const name = normalizeUpperFormField(formData, "name");
  const authorityTypeRaw = (formData.get("authority_type") as string)?.trim() || null;
  const county = normalizeUpperFormField(formData, "county");
  const state = normalizeUpperFormField(formData, "state");
  const workType = (formData.get("work_type") as string)?.trim() || null;

  if (!id) return { error: "Missing ID." };
  if (!name) return { error: "Template name is required." };

  const validAuthTypes = ["state", "county", "township"];
  const authorityType = authorityTypeRaw && validAuthTypes.includes(authorityTypeRaw)
    ? authorityTypeRaw : null;

  const peRequired = formData.get("pe_required") === "true";

  const { error } = await supabase.from("cover_sheet_templates").update({
    name,
    authority_type: authorityType,
    county,
    state,
    work_type: workType,
    pe_required: peRequired,
  }).eq("id", id);

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

export async function activateCoverTemplate(
  _prev: SettingsActionState,
  formData: FormData
): Promise<SettingsActionState> {
  const { supabase, error: authError } = await requireAdmin();
  if (authError || !supabase) return { error: authError };

  const id = (formData.get("id") as string)?.trim();
  if (!id) return { error: "Missing ID." };

  const { error } = await supabase
    .from("cover_sheet_templates").update({ is_active: true }).eq("id", id);

  if (error) return { error: "Failed to activate template." };

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

  // Permit-facing jurisdiction location/name fields are normalized to upper.
  // authority_type / submission_method are enum keys; submission URLs, emails,
  // and the *_notes prose are excluded per Phase 2 rules.
  const state = normalizeUpperFormField(formData, "state") ?? "NJ";
  const county = normalizeUpperFormField(formData, "county");
  const municipality = normalizeUpperFormField(formData, "municipality");
  const authorityName = normalizeUpperFormField(formData, "authority_name");
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
