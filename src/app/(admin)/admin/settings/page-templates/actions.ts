"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { PAGE_TEMPLATES_BUCKET } from "@/lib/constants/files";
import {
  parseFieldMappingsJson,
  validatePageTemplateMappings,
  buildCriticalErrorMessage,
} from "@/lib/templates/validatePageTemplate";

export type PageTemplateActionState = { error: string | null; success?: boolean };

const VALID_TYPES = [
  "cover",
  "tcp_wrapper",
  "tcd_wrapper",
  "sld_wrapper",
  "application_form",
  "certification_form",
  "coi",
] as const;
type PageTemplateType = (typeof VALID_TYPES)[number];

async function requireAdmin() {
  const supabase = await createClient();
  // getClaims() reads JWT claims locally (no network round-trip), matching
  // the middleware pattern. getUser() makes a server-side network call to
  // validate the JWT which is unreliable in server action context with
  // @supabase/ssr 0.10+ / supabase-js 2.101+.
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (!claims) return { supabase: null, error: "Not signed in." };
  const role = (claims.app_metadata as { role?: string })?.role;
  if (role !== "admin") return { supabase: null, error: "Admin required." };
  return { supabase, error: null };
}

// ── Create ────────────────────────────────────────────────────────────────────

export async function createPageTemplate(
  _prev: PageTemplateActionState,
  formData: FormData
): Promise<PageTemplateActionState> {
  const { supabase, error: authError } = await requireAdmin();
  if (authError || !supabase) return { error: authError };

  const name = (formData.get("name") as string)?.trim();
  if (!name) return { error: "Name is required." };

  const rawType = (formData.get("template_type") as string)?.trim();
  if (!(VALID_TYPES as readonly string[]).includes(rawType)) {
    return { error: "Invalid template type." };
  }
  const templateType = rawType as PageTemplateType;

  const file = formData.get("file") as File | null;
  let storagePath: string | null = null;

  if (file && file.size > 0) {
    if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
      return { error: "File must be a PDF." };
    }
    if (file.size > 20 * 1024 * 1024) return { error: "PDF must be 20 MB or less." };

    const timestamp = Date.now();
    const safeName  = file.name.replace(/[^a-zA-Z0-9._-]/g, "_").toLowerCase();
    storagePath     = `${templateType}/${timestamp}_${safeName}`;

    const storageClient = createServiceClient();
    const { error: uploadError } = await storageClient.storage
      .from(PAGE_TEMPLATES_BUCKET)
      .upload(storagePath, file, { contentType: "application/pdf", upsert: false });

    if (uploadError) {
      console.error("Page template upload error:", uploadError.message);
      return { error: `PDF upload failed: ${uploadError.message}` };
    }

    const { error: insertError } = await supabase
      .from("page_templates")
      .insert({ name, template_type: templateType, storage_path: storagePath });

    if (insertError) {
      await storageClient.storage.from(PAGE_TEMPLATES_BUCKET).remove([storagePath]);
      console.error("Page template insert error:", insertError);
      return { error: "Failed to create template record." };
    }
  } else {
    const { error: insertError } = await supabase
      .from("page_templates")
      .insert({ name, template_type: templateType, storage_path: null });

    if (insertError) {
      console.error("Page template insert error:", insertError);
      return { error: "Failed to create template record." };
    }
  }

  revalidatePath("/admin/settings/page-templates");
  return { error: null, success: true };
}

// ── Update ────────────────────────────────────────────────────────────────────

const WRAPPER_TYPES = new Set(["tcp_wrapper", "tcd_wrapper", "sld_wrapper"]);

export async function updatePageTemplate(
  _prev: PageTemplateActionState,
  formData: FormData
): Promise<PageTemplateActionState> {
  const { supabase, error: authError } = await requireAdmin();
  if (authError || !supabase) return { error: authError };

  const id = (formData.get("id") as string)?.trim();
  if (!id) return { error: "Template ID is required." };

  const name = (formData.get("name") as string)?.trim();
  if (!name) return { error: "Name is required." };

  const isActive = formData.get("is_active") === "true";

  // Always fetch existing row — needed for template_type gating and storage path.
  const { data: existing } = await supabase
    .from("page_templates")
    .select("template_type, storage_path")
    .eq("id", id)
    .maybeSingle();
  if (!existing) return { error: "Template not found." };

  const isWrapper = WRAPPER_TYPES.has(existing.template_type);

  const patch: Record<string, unknown> = {
    name,
    is_active:  isActive,
    updated_at: new Date().toISOString(),
  };

  // ── File replacement ───────────────────────────────────────────────────────
  const file = formData.get("file") as File | null;
  if (file && file.size > 0) {
    if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
      return { error: "File must be a PDF." };
    }
    if (file.size > 20 * 1024 * 1024) return { error: "PDF must be 20 MB or less." };

    const timestamp = Date.now();
    const safeName  = file.name.replace(/[^a-zA-Z0-9._-]/g, "_").toLowerCase();
    const newPath   = `${existing.template_type}/${timestamp}_${safeName}`;

    const storageClient = createServiceClient();
    const { error: uploadError } = await storageClient.storage
      .from(PAGE_TEMPLATES_BUCKET)
      .upload(newPath, file, { contentType: "application/pdf", upsert: false });

    if (uploadError) {
      return { error: `PDF upload failed: ${uploadError.message}` };
    }

    if (existing.storage_path) {
      await storageClient.storage.from(PAGE_TEMPLATES_BUCKET).remove([existing.storage_path]);
    }

    patch.storage_path = newPath;
  }

  // ── Placement box (wrapper types only) ────────────────────────────────────
  if (isWrapper) {
    const xStr = (formData.get("placement_box_x")      as string)?.trim();
    const yStr = (formData.get("placement_box_y")      as string)?.trim();
    const wStr = (formData.get("placement_box_width")  as string)?.trim();
    const hStr = (formData.get("placement_box_height") as string)?.trim();

    const allEmpty  = !xStr && !yStr && !wStr && !hStr;
    const allFilled = xStr && yStr && wStr && hStr;

    if (allEmpty) {
      patch.placement_box = null;
    } else if (allFilled) {
      const x = parseFloat(xStr);
      const y = parseFloat(yStr);
      const w = parseFloat(wStr);
      const h = parseFloat(hStr);
      if ([x, y, w, h].some(isNaN)) {
        return { error: "Placement box values must be numbers." };
      }
      if (x < 0 || y < 0) {
        return { error: "Placement box x and y must be 0 or greater." };
      }
      if (w <= 0 || h <= 0) {
        return { error: "Placement box width and height must be greater than 0." };
      }
      patch.placement_box = { x, y, width: w, height: h };
    } else {
      return { error: "Placement box requires all four values (x, y, width, height) or leave all empty to clear." };
    }
  }

  const { error: updateError } = await supabase
    .from("page_templates")
    .update(patch)
    .eq("id", id);

  if (updateError) {
    console.error("Page template update error:", updateError);
    return { error: "Failed to update template." };
  }

  revalidatePath("/admin/settings/page-templates");
  revalidatePath(`/admin/settings/page-templates/${id}`);
  return { error: null, success: true };
}

// ── Update field mappings only ────────────────────────────────────────────────

export async function updateFieldMappings(
  _prev: PageTemplateActionState,
  formData: FormData
): Promise<PageTemplateActionState> {
  const { supabase, error: authError } = await requireAdmin();
  if (authError || !supabase) return { error: authError };

  const id = (formData.get("id") as string)?.trim();
  if (!id) return { error: "Template ID is required." };

  // Parse JSON safely — invalid JSON is critical (cannot be stored).
  const mappingsJson = (formData.get("field_mappings_json") as string)?.trim();
  const parsed = parseFieldMappingsJson(mappingsJson);
  if (!parsed.ok) return { error: parsed.error };
  const fieldMappings = parsed.value;

  // Fetch template + assets + fonts so we can validate font/asset references
  // and template-type-aware checks (wrappers, missing PDF) before saving.
  const [tplResult, assetsResult, fontsResult] = await Promise.all([
    supabase
      .from("page_templates")
      .select("template_type, storage_path, placement_box")
      .eq("id", id)
      .maybeSingle(),
    supabase
      .from("page_template_assets")
      .select("id")
      .eq("page_template_id", id),
    supabase
      .from("page_template_fonts")
      .select("id")
      .eq("is_active", true),
  ]);

  if (!tplResult.data) return { error: "Template not found." };

  const tpl = tplResult.data as unknown as {
    template_type: string;
    storage_path:  string | null;
    placement_box: Record<string, unknown> | null;
  };

  const pb = tpl.placement_box;
  const placementBox =
    pb &&
    typeof pb.x      === "number" &&
    typeof pb.y      === "number" &&
    typeof pb.width  === "number" &&
    typeof pb.height === "number"
      ? { x: pb.x as number, y: pb.y as number, width: pb.width as number, height: pb.height as number }
      : null;

  const issues = validatePageTemplateMappings({
    templateType:  tpl.template_type,
    storagePath:   tpl.storage_path,
    placementBox,
    fieldMappings,
    fonts:         (fontsResult.data ?? []) as Array<{ id: string }>,
    assets:        (assetsResult.data ?? []) as Array<{ id: string }>,
  });

  // Block save only on critical issues that would corrupt rendering
  // (unknown field keys, malformed shape, missing field key).
  // Template-level criticals like missing_pdf are independent of the mappings
  // payload, so we ignore them here — they're surfaced by the diagnostics panel.
  const blockingIssues = issues.filter(
    (i) => i.severity === "critical" && i.targetType !== "template"
  );
  const criticalError = buildCriticalErrorMessage(blockingIssues, "Cannot save field mappings");
  if (criticalError) return { error: criticalError };

  const { error: updateError } = await supabase
    .from("page_templates")
    .update({ field_mappings: fieldMappings, updated_at: new Date().toISOString() })
    .eq("id", id);

  if (updateError) {
    console.error("Field mappings update error:", updateError);
    return { error: "Failed to save field mappings." };
  }

  revalidatePath("/admin/settings/page-templates");
  revalidatePath(`/admin/settings/page-templates/${id}`);
  return { error: null, success: true };
}

// ── Archive / restore ─────────────────────────────────────────────────────────
// Simple single-arg form action — no prev state needed, page revalidates on success.
// On a blocked archive (template referenced by an active blueprint) we redirect
// back to the list with an `archive_error` query param the page banner reads.

const ACTIVE_BLUEPRINT_SLOT_COLUMNS = [
  "cover_page_template_id",
  "tcp_wrapper_id",
  "tcd_wrapper_id",
  "sld_wrapper_id",
  "app_page_template_id",
  "cert_page_template_id",
  "coi_template_id",
] as const;

export async function setPageTemplateActive(formData: FormData): Promise<void> {
  const { supabase, error: authError } = await requireAdmin();
  if (authError || !supabase) return;

  const id       = (formData.get("id") as string)?.trim();
  const newActive = formData.get("is_active") === "true";
  if (!id) return;

  // Archive guard — block when an active blueprint references this template.
  if (!newActive) {
    const orFilter = ACTIVE_BLUEPRINT_SLOT_COLUMNS
      .map((col) => `${col}.eq.${id}`)
      .join(",");
    const { data: refs } = await supabase
      .from("package_blueprints")
      .select("id, status")
      .eq("status", "active")
      .or(orFilter)
      .limit(1);
    if (refs && refs.length > 0) {
      const msg =
        "This template is used by an active package template and cannot be archived until it is removed or the package template is deactivated.";
      redirect(`/admin/settings/page-templates?archive_error=${encodeURIComponent(msg)}`);
    }
  }

  await supabase
    .from("page_templates")
    .update({ is_active: newActive, updated_at: new Date().toISOString() })
    .eq("id", id);

  revalidatePath("/admin/settings/page-templates");
}

// ── Delete ────────────────────────────────────────────────────────────────────

export async function deletePageTemplate(
  _prev: PageTemplateActionState,
  formData: FormData
): Promise<PageTemplateActionState> {
  const { supabase, error: authError } = await requireAdmin();
  if (authError || !supabase) return { error: authError };

  const id = (formData.get("id") as string)?.trim();
  if (!id) return { error: "Template ID is required." };

  const { data: existing } = await supabase
    .from("page_templates")
    .select("storage_path")
    .eq("id", id)
    .maybeSingle();

  const { error: deleteError } = await supabase
    .from("page_templates")
    .delete()
    .eq("id", id);

  if (deleteError) {
    console.error("Page template delete error:", deleteError);
    return { error: "Failed to delete template." };
  }

  if (existing?.storage_path) {
    const storageClient = createServiceClient();
    await storageClient.storage.from(PAGE_TEMPLATES_BUCKET).remove([existing.storage_path]);
  }

  revalidatePath("/admin/settings/page-templates");
  redirect("/admin/settings/page-templates");
}
