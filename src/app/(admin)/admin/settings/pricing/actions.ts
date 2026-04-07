"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type PricingActionState = {
  error: string | null;
  success?: boolean;
};

// ── Auth guard ─────────────────────────────────────────────────────────────────

async function requireAdmin() {
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return { supabase: null, error: "Not signed in." };
  const { data: profile } = await supabase
    .from("user_profiles").select("role").eq("id", userData.user.id).single();
  if (profile?.role !== "admin") return { supabase: null, error: "Admin required." };
  return { supabase, error: null };
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function parseDec(raw: FormDataEntryValue | null): number | null {
  if (!raw || String(raw).trim() === "") return null;
  const n = parseFloat(String(raw).trim());
  return isNaN(n) || n < 0 ? null : Math.round(n * 100) / 100;
}

function parsePosFloat(raw: FormDataEntryValue | null, fallback: number): number {
  const n = parseDec(raw);
  return n !== null && n > 0 ? n : fallback;
}

function parseNullableInt(raw: FormDataEntryValue | null): number | null {
  if (!raw || String(raw).trim() === "") return null;
  const n = parseInt(String(raw).trim(), 10);
  return isNaN(n) ? null : n;
}

function parsePayload(formData: FormData) {
  return {
    name: (formData.get("name") as string)?.trim(),
    state: (formData.get("state") as string)?.trim().toUpperCase() || null,
    county: (formData.get("county") as string)?.trim() || null,
    authority_type: (formData.get("authority_type") as string)?.trim() || null,

    base_project_fee: parseDec(formData.get("base_project_fee")) ?? 0,
    per_sheet_fee: parseDec(formData.get("per_sheet_fee")) ?? 0,
    per_mile_fee: parseDec(formData.get("per_mile_fee")),
    rush_fee: parseDec(formData.get("rush_fee")),

    aerial_multiplier: parsePosFloat(formData.get("aerial_multiplier"), 1),
    underground_multiplier: parsePosFloat(formData.get("underground_multiplier"), 1),
    complexity_multiplier: parsePosFloat(formData.get("complexity_multiplier"), 1),

    include_application_fee: formData.get("include_application_fee") === "on",
    include_jurisdiction_fee: formData.get("include_jurisdiction_fee") === "on",
    fiberpro_admin_fee: parseDec(formData.get("fiberpro_admin_fee")) ?? 0,

    min_sheets: parseNullableInt(formData.get("min_sheets")),
    max_sheets: parseNullableInt(formData.get("max_sheets")),
  };
}

// ── Actions ────────────────────────────────────────────────────────────────────

export async function createPricingRule(
  _prev: PricingActionState,
  formData: FormData
): Promise<PricingActionState> {
  const { supabase, error: authError } = await requireAdmin();
  if (authError || !supabase) return { error: authError };

  const payload = parsePayload(formData);
  if (!payload.name) return { error: "Rule name is required." };

  const validAuthTypes = ["county", "njdot", "municipal", "other"];
  if (payload.authority_type && !validAuthTypes.includes(payload.authority_type)) {
    payload.authority_type = null;
  }

  const { error } = await supabase.from("pricing_rules").insert({ ...payload, is_active: true });
  if (error) {
    console.error("createPricingRule error:", error);
    return { error: "Failed to create pricing rule." };
  }

  revalidatePath("/admin/settings/pricing");
  redirect("/admin/settings/pricing");
}

export async function updatePricingRule(
  _prev: PricingActionState,
  formData: FormData
): Promise<PricingActionState> {
  const { supabase, error: authError } = await requireAdmin();
  if (authError || !supabase) return { error: authError };

  const id = (formData.get("id") as string)?.trim();
  if (!id) return { error: "Missing rule ID." };

  const payload = parsePayload(formData);
  if (!payload.name) return { error: "Rule name is required." };

  const validAuthTypes = ["county", "njdot", "municipal", "other"];
  if (payload.authority_type && !validAuthTypes.includes(payload.authority_type)) {
    payload.authority_type = null;
  }

  const { error } = await supabase.from("pricing_rules").update(payload).eq("id", id);
  if (error) {
    console.error("updatePricingRule error:", error);
    return { error: "Failed to update pricing rule." };
  }

  revalidatePath("/admin/settings/pricing");
  redirect("/admin/settings/pricing");
}

export async function deactivatePricingRule(
  _prev: PricingActionState,
  formData: FormData
): Promise<PricingActionState> {
  const { supabase, error: authError } = await requireAdmin();
  if (authError || !supabase) return { error: authError };

  const id = (formData.get("id") as string)?.trim();
  if (!id) return { error: "Missing rule ID." };

  const { error } = await supabase
    .from("pricing_rules").update({ is_active: false }).eq("id", id);

  if (error) return { error: "Failed to deactivate rule." };

  revalidatePath("/admin/settings/pricing");
  return { error: null, success: true };
}
