"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { normalizeUpperFormField } from "@/lib/utils/textNormalization";

export type JurisdictionActionState = {
  error: string | null;
  success?: boolean;
};

const VALID_METHODS = ["online", "email", "mail", "portal"] as const;

async function requireAdmin() {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  if (error || !data?.claims) return { supabase: null, error: "Not signed in." };
  const role = (data.claims.app_metadata as { role?: string })?.role;
  if (role !== "admin") return { supabase: null, error: "Admin required." };
  return { supabase, error: null };
}

function parseFee(value: FormDataEntryValue | null): number | null {
  if (!value || String(value).trim() === "") return null;
  const n = parseFloat(String(value).trim());
  return isNaN(n) || n < 0 ? null : Math.round(n * 100) / 100;
}

function bool(formData: FormData, key: string): boolean {
  return formData.get(key) === "on" || formData.get(key) === "true";
}

function parseMethod(raw: string | null) {
  if (!raw) return null;
  return (VALID_METHODS as readonly string[]).includes(raw) ? raw : null;
}

// ── Create ────────────────────────────────────────────────────────────────────

export async function createJurisdiction(
  _prev: JurisdictionActionState,
  formData: FormData
): Promise<JurisdictionActionState> {
  const { supabase, error: authError } = await requireAdmin();
  if (authError || !supabase) return { error: authError };

  // Permit-facing location/name fields are normalized to uppercase. URLs,
  // emails, IDs, enums (submission_method), and `notes` prose stay as typed.
  const state = normalizeUpperFormField(formData, "state");
  const authority_name = normalizeUpperFormField(formData, "authority_name");

  if (!state) return { error: "State is required." };
  if (!authority_name) return { error: "Authority name is required." };

  const payload = {
    state,
    county: normalizeUpperFormField(formData, "county"),
    township: normalizeUpperFormField(formData, "township"),
    authority_name,
    submission_method: parseMethod((formData.get("submission_method") as string)?.trim()),
    submission_url: (formData.get("submission_url") as string)?.trim() || null,
    submission_email: (formData.get("submission_email") as string)?.trim() || null,
    requires_coi: bool(formData, "requires_coi"),
    requires_pe_stamp: bool(formData, "requires_pe_stamp"),
    requires_traffic_control_plan: bool(formData, "requires_traffic_control_plan"),
    requires_cover_sheet: bool(formData, "requires_cover_sheet"),
    requires_application_form: bool(formData, "requires_application_form"),
    cover_sheet_template_id: (formData.get("cover_sheet_template_id") as string)?.trim() || null,
    application_fee: parseFee(formData.get("application_fee")),
    jurisdiction_fee: parseFee(formData.get("jurisdiction_fee")),
    requires_review_before_submission: bool(formData, "requires_review_before_submission"),
    allows_bulk_submission: bool(formData, "allows_bulk_submission"),
    avg_approval_days: parseInt(formData.get("avg_approval_days") as string) || null,
    notes: (formData.get("notes") as string)?.trim() || null,
    is_active: true,
  };

  const { error } = await supabase.from("jurisdictions").insert(payload);

  if (error) {
    console.error("Jurisdiction create error:", error);
    return { error: "Failed to create jurisdiction." };
  }

  revalidatePath("/admin/settings/jurisdictions");
  redirect("/admin/settings/jurisdictions");
}

// ── Update ────────────────────────────────────────────────────────────────────

export async function updateJurisdiction(
  _prev: JurisdictionActionState,
  formData: FormData
): Promise<JurisdictionActionState> {
  const { supabase, error: authError } = await requireAdmin();
  if (authError || !supabase) return { error: authError };

  const id = (formData.get("id") as string)?.trim();
  // See createJurisdiction for normalization rationale.
  const state = normalizeUpperFormField(formData, "state");
  const authority_name = normalizeUpperFormField(formData, "authority_name");

  if (!id) return { error: "Missing ID." };
  if (!state) return { error: "State is required." };
  if (!authority_name) return { error: "Authority name is required." };

  const payload = {
    state,
    county: normalizeUpperFormField(formData, "county"),
    township: normalizeUpperFormField(formData, "township"),
    authority_name,
    submission_method: parseMethod((formData.get("submission_method") as string)?.trim()),
    submission_url: (formData.get("submission_url") as string)?.trim() || null,
    submission_email: (formData.get("submission_email") as string)?.trim() || null,
    requires_coi: bool(formData, "requires_coi"),
    requires_pe_stamp: bool(formData, "requires_pe_stamp"),
    requires_traffic_control_plan: bool(formData, "requires_traffic_control_plan"),
    requires_cover_sheet: bool(formData, "requires_cover_sheet"),
    requires_application_form: bool(formData, "requires_application_form"),
    cover_sheet_template_id: (formData.get("cover_sheet_template_id") as string)?.trim() || null,
    application_fee: parseFee(formData.get("application_fee")),
    jurisdiction_fee: parseFee(formData.get("jurisdiction_fee")),
    requires_review_before_submission: bool(formData, "requires_review_before_submission"),
    allows_bulk_submission: bool(formData, "allows_bulk_submission"),
    avg_approval_days: parseInt(formData.get("avg_approval_days") as string) || null,
    notes: (formData.get("notes") as string)?.trim() || null,
  };

  const { error } = await supabase.from("jurisdictions").update(payload).eq("id", id);

  if (error) {
    console.error("Jurisdiction update error:", error);
    return { error: "Failed to update jurisdiction." };
  }

  revalidatePath("/admin/settings/jurisdictions");
  redirect("/admin/settings/jurisdictions");
}

// ── Deactivate ────────────────────────────────────────────────────────────────

export async function deactivateJurisdiction(
  _prev: JurisdictionActionState,
  formData: FormData
): Promise<JurisdictionActionState> {
  const { supabase, error: authError } = await requireAdmin();
  if (authError || !supabase) return { error: authError };

  const id = (formData.get("id") as string)?.trim();
  if (!id) return { error: "Missing ID." };

  const { error } = await supabase
    .from("jurisdictions").update({ is_active: false }).eq("id", id);

  if (error) return { error: "Failed to deactivate jurisdiction." };

  revalidatePath("/admin/settings/jurisdictions");
  return { error: null, success: true };
}
