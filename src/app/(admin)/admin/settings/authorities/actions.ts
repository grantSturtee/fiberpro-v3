"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { normalizeUpperFormField } from "@/lib/utils/textNormalization";

export type AuthorityActionState = { error: string | null };

const VALID_METHODS = ["email", "portal", "mail", "courier", "in_person"] as const;
const VALID_TYPES   = ["state", "county", "municipality"] as const;

async function requireAdmin() {
  const supabase = await createClient();
  const { data: userData, error } = await supabase.auth.getUser();
  if (error || !userData.user) {
    console.error("[requireAdmin] getUser failed:", error?.message);
    return { supabase: null, error: "Not signed in." };
  }
  const role = (userData.user.app_metadata as { role?: string })?.role;
  console.log("[requireAdmin] userId:", userData.user.id, "role:", role);
  if (role !== "admin") return { supabase: null, error: "Admin required." };
  return { supabase, error: null };
}

function bool(formData: FormData, key: string): boolean {
  return formData.get(key) === "on" || formData.get(key) === "true";
}

function str(formData: FormData, key: string): string | null {
  const v = (formData.get(key) as string)?.trim();
  return v || null;
}

function buildPayload(formData: FormData) {
  const rawMethod = str(formData, "submission_method");
  const rawType   = str(formData, "type");
  return {
    // Authority name is permit-facing — normalize to uppercase. All other
    // fields are enum keys, contact info (email/phone), or prose, and stay
    // in their original case.
    name:                      normalizeUpperFormField(formData, "name"),
    type:                      (VALID_TYPES as readonly string[]).includes(rawType ?? "") ? rawType : null,
    submission_method:         (VALID_METHODS as readonly string[]).includes(rawMethod ?? "") ? rawMethod : null,
    output_format:             str(formData, "output_format"),
    requires_application:      bool(formData, "requires_application"),
    requires_certification:    bool(formData, "requires_certification"),
    requires_coi:              bool(formData, "requires_coi"),
    requires_pe:               bool(formData, "requires_pe"),
    requires_hard_copies:      bool(formData, "requires_hard_copies"),
    requires_certified_check:  bool(formData, "requires_certified_check"),
    notification_only:         bool(formData, "notification_only"),
    contact_name:              str(formData, "contact_name"),
    contact_email:             str(formData, "contact_email"),
    contact_phone:             str(formData, "contact_phone"),
    submission_instructions:   str(formData, "submission_instructions"),
    internal_notes:            str(formData, "internal_notes"),
    notes:                     str(formData, "notes"),
  };
}

// ── Create ────────────────────────────────────────────────────────────────────

export async function createAuthority(
  formData: FormData
): Promise<AuthorityActionState | void> {
  const { supabase, error: authError } = await requireAdmin();
  if (authError || !supabase) return { error: authError };

  const payload = buildPayload(formData);
  if (!payload.name) return { error: "Name is required." };
  if (!payload.type) return { error: "Type is required." };

  const { error } = await supabase.from("authority_profiles").insert(payload);
  if (error) {
    console.error("Authority create error:", error);
    return { error: "Failed to create authority." };
  }

  revalidatePath("/admin/settings/authorities");
  redirect("/admin/settings/authorities");
}

// ── Update ────────────────────────────────────────────────────────────────────

export async function updateAuthority(
  formData: FormData
): Promise<AuthorityActionState | void> {
  const { supabase, error: authError } = await requireAdmin();
  if (authError || !supabase) return { error: authError };

  const id = str(formData, "id");
  if (!id) return { error: "Missing ID." };

  const payload = buildPayload(formData);
  if (!payload.name) return { error: "Name is required." };
  if (!payload.type) return { error: "Type is required." };

  const { error } = await supabase.from("authority_profiles").update(payload).eq("id", id);
  if (error) {
    console.error("Authority update error:", error);
    return { error: "Failed to update authority." };
  }

  revalidatePath("/admin/settings/authorities");
  redirect("/admin/settings/authorities");
}

// ── Delete ────────────────────────────────────────────────────────────────────

export async function deleteAuthority(
  _prev: AuthorityActionState,
  formData: FormData
): Promise<AuthorityActionState> {
  const { supabase, error: authError } = await requireAdmin();
  if (authError || !supabase) return { error: authError };

  const id = str(formData, "id");
  if (!id) return { error: "Missing ID." };

  const { error } = await supabase.from("authority_profiles").delete().eq("id", id);
  if (error) {
    console.error("Authority delete error:", error);
    return { error: "Cannot delete — authority may be in use by projects." };
  }

  revalidatePath("/admin/settings/authorities");
  return { error: null, success: true };
}
