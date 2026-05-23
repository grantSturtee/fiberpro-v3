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
  const { data, error } = await supabase.auth.getClaims();
  if (error || !data?.claims) return { supabase: null, error: "Not signed in." };
  const role = (data.claims.app_metadata as { role?: string })?.role;
  if (role !== "admin") return { supabase: null, error: "Admin required." };
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

const VALID_WORK_TYPES = ["aerial", "underground"] as const;
type ValidWorkType = (typeof VALID_WORK_TYPES)[number];

function parseWorkType(raw: FormDataEntryValue | null): ValidWorkType | null {
  const v = (raw as string | null)?.trim();
  if (!v) return null;
  return (VALID_WORK_TYPES as readonly string[]).includes(v) ? (v as ValidWorkType) : null;
}

function parsePayload(formData: FormData) {
  return {
    name: (formData.get("name") as string)?.trim(),
    state: (formData.get("state") as string)?.trim().toUpperCase() || null,
    county: (formData.get("county") as string)?.trim() || null,
    authority_type: (formData.get("authority_type") as string)?.trim() || null,

    company_id: (formData.get("company_id") as string)?.trim() || null,
    work_type: parseWorkType(formData.get("work_type")),

    base_project_fee: parseDec(formData.get("base_project_fee")) ?? 0,
    per_sheet_fee: parseDec(formData.get("per_sheet_fee")) ?? 0,

    aerial_multiplier: parsePosFloat(formData.get("aerial_multiplier"), 1),
    underground_multiplier: parsePosFloat(formData.get("underground_multiplier"), 1),
    complexity_multiplier: parsePosFloat(formData.get("complexity_multiplier"), 1),

    include_application_fee: formData.get("include_application_fee") === "on",
    application_fee_markup: formData.get("application_fee_markup") === "on",
    application_fee_markup_percent: parseDec(formData.get("application_fee_markup_percent")) ?? 10,

    include_permit_fee: formData.get("include_permit_fee") === "on",
    permit_fee_markup: formData.get("permit_fee_markup") === "on",
    permit_fee_markup_percent: parseDec(formData.get("permit_fee_markup_percent")) ?? 10,

    include_review_fee: formData.get("include_review_fee") === "on",
    review_fee_markup: formData.get("review_fee_markup") === "on",
    review_fee_markup_percent: parseDec(formData.get("review_fee_markup_percent")) ?? 10,

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

  const validAuthTypes = ["state", "county", "municipal"];
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

  const validAuthTypes = ["state", "county", "municipal"];
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

/**
 * Hard-delete a pricing rule.
 *
 * projects.pricing_rule_id has ON DELETE SET NULL, so projects that reference
 * the deleted rule will simply lose the link — they won't be cascade-deleted.
 * Snapshots on past invoices are stored as JSONB and aren't affected.
 *
 * Single-argument signature with `Promise<void>` return so it can be bound
 * directly to `<form action={deletePricingRule}>` (React 19's form action
 * prop only accepts void-returning actions). Errors are logged server-side;
 * the trash-icon button confirms via `window.confirm` before submitting, so
 * a UI error channel isn't needed for this rarely-invoked path.
 */
export async function deletePricingRule(formData: FormData): Promise<void> {
  const { supabase, error: authError } = await requireAdmin();
  if (authError || !supabase) {
    console.error("deletePricingRule auth error:", authError);
    return;
  }

  const id = (formData.get("id") as string | null)?.trim();
  if (!id) {
    console.error("deletePricingRule: missing rule ID.");
    return;
  }

  const { error } = await supabase
    .from("pricing_rules")
    .delete()
    .eq("id", id);
  if (error) {
    console.error("deletePricingRule error:", error);
    return;
  }

  revalidatePath("/admin/settings/pricing");
}
