"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type GlobalSettingActionState = {
  error: string | null;
  success?: boolean;
};

const ALLOWED_KEYS = ["default_admin_fee", "rush_fee_type", "rush_fee_value"] as const;
type AllowedKey = (typeof ALLOWED_KEYS)[number];

function isAllowed(key: string): key is AllowedKey {
  return (ALLOWED_KEYS as readonly string[]).includes(key);
}

async function requireAdmin() {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  if (error || !data?.claims) return { supabase: null, error: "Not signed in." };
  const role = (data.claims.app_metadata as { role?: string })?.role;
  if (role !== "admin") return { supabase: null, error: "Admin required." };
  return { supabase, error: null };
}

/**
 * Update a single app_settings row.
 *
 * Form contract: one `key` field (from the allowlist) + one `value` field.
 * The action validates the key is recognized, then runs an UPDATE so it can't
 * accidentally create a brand-new key. Existing settings are seeded via
 * migrations.
 *
 * Additional shape-validation per key:
 *   - rush_fee_type:  value must be 'percent' or 'fixed'
 *   - default_admin_fee / rush_fee_value: value must parse as a non-negative number
 */
export async function updateGlobalSetting(
  _prev: GlobalSettingActionState,
  formData: FormData
): Promise<GlobalSettingActionState> {
  const { supabase, error: authError } = await requireAdmin();
  if (authError || !supabase) return { error: authError };

  const rawKey = (formData.get("key") as string | null)?.trim() ?? "";
  const rawValue = (formData.get("value") as string | null)?.trim() ?? "";

  if (!rawKey) return { error: "Missing setting key." };
  if (!isAllowed(rawKey)) return { error: `Setting key "${rawKey}" is not editable.` };
  if (rawValue === "") return { error: "Value is required." };

  // Per-key shape validation.
  if (rawKey === "rush_fee_type") {
    if (rawValue !== "percent" && rawValue !== "fixed") {
      return { error: "Rush fee type must be 'percent' or 'fixed'." };
    }
  } else {
    // default_admin_fee + rush_fee_value: positive numeric
    const n = parseFloat(rawValue);
    if (!Number.isFinite(n) || n < 0) {
      return { error: "Value must be a non-negative number." };
    }
  }

  const { error: updateError } = await supabase
    .from("app_settings")
    .update({ value: rawValue })
    .eq("key", rawKey);

  if (updateError) {
    console.error("updateGlobalSetting error:", updateError);
    return { error: "Failed to save setting." };
  }

  revalidatePath("/admin/settings/pricing");
  return { error: null, success: true };
}
