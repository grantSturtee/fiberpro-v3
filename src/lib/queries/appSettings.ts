/**
 * Global app settings helpers.
 * Reads from the app_settings key-value table with safe fallbacks.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

export const DEFAULT_UPDATE_CADENCE_DAYS = 3;

/**
 * Returns the configured project update cadence in days.
 * Falls back to DEFAULT_UPDATE_CADENCE_DAYS if the setting is missing or invalid.
 */
export async function getUpdateCadenceDays(supabase: SupabaseClient): Promise<number> {
  const { data } = await supabase
    .from("app_settings")
    .select("value")
    .eq("key", "project_update_cadence_days")
    .single();

  if (!data?.value) return DEFAULT_UPDATE_CADENCE_DAYS;
  const parsed = parseInt(data.value, 10);
  return isNaN(parsed) || parsed < 1 ? DEFAULT_UPDATE_CADENCE_DAYS : parsed;
}
