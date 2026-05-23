"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { type AuthorityRequirements } from "./blueprintCompleteness";
import {
  BLUEPRINT_SLOTS,
  validateBlueprintTemplateSlots,
  buildCriticalErrorMessage,
  type SlotTemplateRow,
  type BlueprintSlotKey,
} from "@/lib/templates/validatePageTemplate";
import type { SupabaseClient } from "@supabase/supabase-js";

export type BlueprintActionState = { error: string | null; success?: boolean };

// ── Helper: load all page_templates referenced by a blueprint's slots ────────
// Used by activation paths to validate template existence/type/PDF/placement_box.
async function loadBlueprintSlotTemplates(
  supabase: SupabaseClient,
  bp: Partial<Record<BlueprintSlotKey, string | null>>
): Promise<Map<string, SlotTemplateRow>> {
  const ids = Array.from(new Set(
    BLUEPRINT_SLOTS
      .map((s) => bp[s.key])
      .filter((v): v is string => typeof v === "string" && v.length > 0)
  ));
  if (ids.length === 0) return new Map();
  const { data } = await supabase
    .from("page_templates")
    .select("id, template_type, storage_path, is_active, placement_box")
    .in("id", ids);
  const out = new Map<string, SlotTemplateRow>();
  for (const row of (data ?? []) as SlotTemplateRow[]) out.set(row.id, row);
  return out;
}

async function requireAdmin() {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  if (error || !data?.claims) return { supabase: null, error: "Not signed in." };
  const role = (data.claims.app_metadata as { role?: string })?.role;
  if (role !== "admin") return { supabase: null, error: "Admin required." };
  return { supabase, error: null };
}

// ── Create ────────────────────────────────────────────────────────────────────

export async function createBlueprint(
  _prev: BlueprintActionState,
  formData: FormData
): Promise<BlueprintActionState> {
  const { supabase, error: authError } = await requireAdmin();
  if (authError || !supabase) return { error: authError };

  const authorityId = (formData.get("authority_profile_id") as string)?.trim();
  if (!authorityId) return { error: "Authority is required." };

  const workType = (formData.get("work_type") as string)?.trim();
  if (!workType || !["aerial", "underground"].includes(workType)) {
    return { error: "Work type is required (aerial or underground)." };
  }

  const description = (formData.get("description") as string)?.trim() || null;

  const { data: authority } = await supabase
    .from("authority_profiles")
    .select("id")
    .eq("id", authorityId)
    .maybeSingle();

  if (!authority) return { error: "Authority not found." };

  const { data: blueprint, error: insertError } = await supabase
    .from("package_blueprints")
    .insert({
      authority_profile_id: authorityId,
      work_type: workType,
      description,
      status: "draft",
    })
    .select("id")
    .single();

  if (insertError) {
    console.error("Blueprint insert error:", insertError);
    return { error: "Failed to create blueprint." };
  }

  revalidatePath("/admin/settings/package-templates");
  redirect(`/admin/settings/package-templates/${blueprint.id}`);
}

// ── Update slots ──────────────────────────────────────────────────────────────

export async function updateBlueprintSlots(
  _prev: BlueprintActionState,
  formData: FormData
): Promise<BlueprintActionState> {
  const { supabase, error: authError } = await requireAdmin();
  if (authError || !supabase) return { error: authError };

  const blueprintId = (formData.get("blueprint_id") as string)?.trim();
  if (!blueprintId) return { error: "Blueprint ID is required." };

  const toNullable = (key: string) => {
    const v = (formData.get(key) as string)?.trim();
    return v || null;
  };

  const workTypeRaw = (formData.get("work_type") as string)?.trim();
  const workType =
    workTypeRaw && ["aerial", "underground", "mixed", "other"].includes(workTypeRaw)
      ? workTypeRaw
      : null;

  const newStatusRaw = (formData.get("new_status") as string)?.trim();
  const newStatus =
    newStatusRaw && ["active", "inactive"].includes(newStatusRaw)
      ? (newStatusRaw as "active" | "inactive")
      : null;

  if (newStatus === "active") {
    const incoming = {
      cover_page_template_id:    toNullable("cover_page_template_id"),
      tcp_wrapper_id:            toNullable("tcp_wrapper_id"),
      tcd_wrapper_id:            toNullable("tcd_wrapper_id"),
      sld_wrapper_id:            toNullable("sld_wrapper_id"),
      app_page_template_id:      toNullable("app_page_template_id"),
      cert_page_template_id:     toNullable("cert_page_template_id"),
      coi_template_id:           toNullable("coi_template_id"),
      application_template_id:   toNullable("application_template_id"),
      certification_template_id: toNullable("certification_template_id"),
    };

    const { data: bpAuthRow } = await supabase
      .from("package_blueprints")
      .select("authority_profile_id")
      .eq("id", blueprintId)
      .maybeSingle();
    const bpAuthorityId =
      (bpAuthRow as unknown as { authority_profile_id: string | null } | null)
        ?.authority_profile_id ?? null;

    let authorityReq: AuthorityRequirements | null = null;
    if (bpAuthorityId) {
      const { data: authRow } = await supabase
        .from("authority_profiles")
        .select("requires_application, requires_certification, requires_coi")
        .eq("id", bpAuthorityId)
        .maybeSingle();
      authorityReq = (authRow as unknown as AuthorityRequirements | null) ?? null;
    }

    // Full slot validation: required slots present + each referenced template
    // exists, is active, has a PDF, matches the slot's expected type, and
    // (for wrappers) has a placement_box. Subsumes the older completeness
    // checks while producing more specific messages.
    const templatesById = await loadBlueprintSlotTemplates(supabase, incoming);
    const slotIssues = validateBlueprintTemplateSlots({
      blueprint:             incoming,
      templatesById,
      authorityRequirements: authorityReq,
    });
    const slotError = buildCriticalErrorMessage(slotIssues, "Cannot activate blueprint");
    if (slotError) return { error: slotError };
  }

  const patch: Record<string, unknown> = {
    description:               toNullable("description"),
    cover_page_template_id:    toNullable("cover_page_template_id"),
    app_page_template_id:      toNullable("app_page_template_id"),
    cert_page_template_id:     toNullable("cert_page_template_id"),
    tcp_wrapper_id:            toNullable("tcp_wrapper_id"),
    tcd_wrapper_id:            toNullable("tcd_wrapper_id"),
    sld_wrapper_id:            toNullable("sld_wrapper_id"),
    coi_template_id:           toNullable("coi_template_id"),
    updated_at:                new Date().toISOString(),
  };

  if (workType !== null) patch.work_type = workType;
  if (newStatus !== null) patch.status = newStatus;

  // When activating, deactivate any other active blueprint for the same
  // authority first so the "one active per authority" rule holds without
  // relying on the legacy is_active unique index.
  if (newStatus === "active") {
    const { data: bpAuth } = await supabase
      .from("package_blueprints")
      .select("authority_profile_id")
      .eq("id", blueprintId)
      .maybeSingle();
    const authorityProfileId = (bpAuth as { authority_profile_id: string | null } | null)
      ?.authority_profile_id ?? null;
    if (authorityProfileId) {
      const { error: deactivateError } = await supabase
        .from("package_blueprints")
        .update({ status: "inactive", updated_at: new Date().toISOString() })
        .eq("authority_profile_id", authorityProfileId)
        .eq("status", "active")
        .neq("id", blueprintId);
      if (deactivateError) {
        console.error("Blueprint deactivate-others error:", deactivateError);
        return { error: "Failed to update blueprint." };
      }
    }
  }

  const { error: updateError } = await supabase
    .from("package_blueprints")
    .update(patch)
    .eq("id", blueprintId);

  if (updateError) {
    console.error("Blueprint update error:", updateError);
    return { error: "Failed to update blueprint." };
  }

  revalidatePath(`/admin/settings/package-templates/${blueprintId}`);
  return { error: null, success: true };
}

// ── Set status ────────────────────────────────────────────────────────────────

/**
 * Explicitly set a blueprint's status to draft, active, or inactive.
 * Activating an incomplete blueprint (missing required slots) is blocked.
 * Activating automatically demotes any previously active blueprint for the
 * same authority to "inactive", keeping the "one active per authority"
 * invariant without depending on the legacy is_active unique index.
 */
export async function setBlueprintStatus(
  _prev: BlueprintActionState,
  formData: FormData
): Promise<BlueprintActionState> {
  const { supabase, error: authError } = await requireAdmin();
  if (authError || !supabase) return { error: authError };

  const blueprintId = (formData.get("blueprint_id") as string)?.trim();
  const newStatus   = (formData.get("new_status") as string)?.trim();

  if (!blueprintId) return { error: "Blueprint ID is required." };
  if (!newStatus || !["draft", "active", "inactive"].includes(newStatus)) {
    return { error: "Invalid status value." };
  }

  let authorityProfileId: string | null = null;
  if (newStatus === "active") {
    const { data: bp, error: fetchError } = await supabase
      .from("package_blueprints")
      .select(
        "authority_profile_id, cover_page_template_id, tcp_wrapper_id, " +
        "tcd_wrapper_id, sld_wrapper_id, app_page_template_id, " +
        "cert_page_template_id, application_template_id, " +
        "certification_template_id, coi_template_id"
      )
      .eq("id", blueprintId)
      .maybeSingle();

    if (fetchError || !bp) return { error: "Blueprint not found." };

    const bpRow = bp as unknown as Record<string, unknown>;
    authorityProfileId = (bpRow.authority_profile_id as string | null) ?? null;

    let authorityReq: AuthorityRequirements | null = null;
    if (authorityProfileId) {
      const { data: authRow } = await supabase
        .from("authority_profiles")
        .select("requires_application, requires_certification, requires_coi")
        .eq("id", authorityProfileId)
        .maybeSingle();
      authorityReq = (authRow as unknown as AuthorityRequirements | null) ?? null;
    }

    // Full slot validation: required + template existence/type/PDF/placement_box.
    const slotBlueprint = {
      cover_page_template_id:    (bpRow.cover_page_template_id    as string | null) ?? null,
      tcp_wrapper_id:            (bpRow.tcp_wrapper_id            as string | null) ?? null,
      tcd_wrapper_id:            (bpRow.tcd_wrapper_id            as string | null) ?? null,
      sld_wrapper_id:            (bpRow.sld_wrapper_id            as string | null) ?? null,
      app_page_template_id:      (bpRow.app_page_template_id      as string | null) ?? null,
      cert_page_template_id:     (bpRow.cert_page_template_id     as string | null) ?? null,
      coi_template_id:           (bpRow.coi_template_id           as string | null) ?? null,
      application_template_id:   (bpRow.application_template_id   as string | null) ?? null,
      certification_template_id: (bpRow.certification_template_id as string | null) ?? null,
    };
    const templatesById = await loadBlueprintSlotTemplates(supabase, slotBlueprint);
    const slotIssues = validateBlueprintTemplateSlots({
      blueprint:             slotBlueprint,
      templatesById,
      authorityRequirements: authorityReq,
    });
    const slotError = buildCriticalErrorMessage(slotIssues, "Cannot activate blueprint");
    if (slotError) return { error: slotError };

    if (authorityProfileId) {
      const { error: deactivateError } = await supabase
        .from("package_blueprints")
        .update({ status: "inactive", updated_at: new Date().toISOString() })
        .eq("authority_profile_id", authorityProfileId)
        .eq("status", "active")
        .neq("id", blueprintId);
      if (deactivateError) {
        console.error("Blueprint deactivate-others error:", deactivateError);
        return { error: "Failed to update blueprint status." };
      }
    }
  }

  const { error: updateError } = await supabase
    .from("package_blueprints")
    .update({
      status:     newStatus,
      updated_at: new Date().toISOString(),
    })
    .eq("id", blueprintId);

  if (updateError) {
    console.error("Blueprint status error:", updateError);
    return { error: "Failed to update blueprint status." };
  }

  revalidatePath(`/admin/settings/package-templates/${blueprintId}`);
  revalidatePath("/admin/settings/package-templates");
  return { error: null, success: true };
}

// ── Delete ────────────────────────────────────────────────────────────────────

export async function deleteBlueprint(
  _prev: BlueprintActionState,
  formData: FormData
): Promise<BlueprintActionState> {
  const { supabase, error: authError } = await requireAdmin();
  if (authError || !supabase) return { error: authError };

  const blueprintId = (formData.get("blueprint_id") as string)?.trim();
  if (!blueprintId) return { error: "Blueprint ID is required." };

  const { error: deleteError } = await supabase
    .from("package_blueprints")
    .delete()
    .eq("id", blueprintId);

  if (deleteError) {
    console.error("Blueprint delete error:", deleteError);
    return { error: "Failed to delete blueprint." };
  }

  revalidatePath("/admin/settings/package-templates");
  redirect("/admin/settings/package-templates");
}
