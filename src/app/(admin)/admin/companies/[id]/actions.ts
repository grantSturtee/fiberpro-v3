"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";

export type CompanyActionState = {
  error: string | null;
  success?: boolean;
};

// ── Add company user ──────────────────────────────────────────────────────────
// Creates a Supabase auth user + user_profiles entry + company_memberships link.
// If a user with that email already exists (e.g. previously removed from this
// company), skips auth user creation and re-links them with the new role instead.

export async function addCompanyUser(
  _prevState: CompanyActionState,
  formData: FormData
): Promise<CompanyActionState> {
  const supabase = await createClient();

  // Verify caller is admin
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return { error: "You must be signed in." };

  const callerRole = (userData.user.app_metadata as { role?: string })?.role;
  if (callerRole !== "admin") return { error: "Admin access required." };

  const companyId = (formData.get("company_id") as string)?.trim();
  const email = (formData.get("email") as string)?.trim().toLowerCase();
  const displayName = (formData.get("display_name") as string)?.trim();
  const role = (formData.get("role") as string)?.trim();
  const password = (formData.get("password") as string) ?? "";

  if (!companyId) return { error: "Company ID missing." };
  if (!email) return { error: "Email is required." };
  if (!displayName) return { error: "Display name is required." };
  if (role !== "project_manager") {
    return { error: "Invalid role." };
  }

  const serviceClient = createServiceClient();

  // ── Check for an existing user by email ──────────────────────────────────
  console.log("[addCompanyUser] checking for existing profile:", email);

  const { data: existingProfile, error: lookupError } = await serviceClient
    .from("user_profiles")
    .select("id")
    .eq("email", email)
    .maybeSingle();

  if (lookupError) {
    console.error("[addCompanyUser] profile lookup error:", JSON.stringify(lookupError, null, 2));
  }

  console.log("[addCompanyUser] existing profile:", existingProfile ? existingProfile.id : "none");

  let targetUserId: string;

  if (existingProfile) {
    // Re-linking a previously removed user — no new auth account needed.
    targetUserId = existingProfile.id;

    console.log("[addCompanyUser] re-linking existing user:", targetUserId, "new role:", role);

    // Update display name and role on the existing profile.
    const { error: profileError } = await serviceClient
      .from("user_profiles")
      .update({ display_name: displayName, role })
      .eq("id", targetUserId);

    if (profileError) {
      console.error(
        "[addCompanyUser] profile update error for", targetUserId, ":",
        JSON.stringify(profileError, null, 2)
      );
      return {
        error: `Profile update failed (${profileError.code}: ${profileError.message}). Contact support.`,
      };
    }

    console.log("[addCompanyUser] profile updated ok");

    // Keep app_metadata.role in sync so middleware and RLS see the new role.
    const { error: authError } = await serviceClient.auth.admin.updateUserById(targetUserId, {
      app_metadata: { role },
    });

    if (authError) {
      console.error(
        "[addCompanyUser] auth metadata update error for", targetUserId, ":",
        JSON.stringify(authError, null, 2)
      );
      return {
        error: `Profile updated but auth sync failed (${authError.message}). Contact support.`,
      };
    }

    console.log("[addCompanyUser] auth metadata updated ok");
  } else {
    // New user — password is required.
    if (!password) return { error: "Password is required." };
    if (password.length < 8) return { error: "Password must be at least 8 characters." };

    console.log("[addCompanyUser] creating new auth user:", email);

    const { data: newUser, error: createError } = await serviceClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      app_metadata: { role },
      user_metadata: { display_name: displayName },
    });

    if (createError || !newUser.user) {
      console.error("[addCompanyUser] createUser error:", JSON.stringify(createError, null, 2));
      return { error: "Failed to create user. Please try again." };
    }

    targetUserId = newUser.user.id;
    console.log("[addCompanyUser] auth user created:", targetUserId);

    // Upsert user_profiles. onConflict: 'id' handles the case where a DB
    // trigger already created an empty row before we get here.
    const { error: profileError } = await serviceClient
      .from("user_profiles")
      .upsert(
        { id: targetUserId, role, display_name: displayName, email },
        { onConflict: "id" }
      );

    if (profileError) {
      console.error("[addCompanyUser] profile upsert error:", JSON.stringify(profileError, null, 2));
      return {
        error: `User created but profile setup failed (${profileError.code}: ${profileError.message}). Contact support.`,
      };
    }

    console.log("[addCompanyUser] profile upserted ok");
  }

  // ── Insert company membership ─────────────────────────────────────────────
  console.log("[addCompanyUser] inserting membership: user", targetUserId, "→ company", companyId, "role", role);

  const { error: memberError } = await serviceClient
    .from("company_memberships")
    .insert({ company_id: companyId, user_id: targetUserId, role });

  if (memberError) {
    if (memberError.code === "23505") {
      return { error: "This user is already a member of this company." };
    }
    console.error("[addCompanyUser] membership insert error:", JSON.stringify(memberError, null, 2));
    return { error: `Failed to add user to company (${memberError.code}: ${memberError.message}). Contact support.` };
  }

  console.log("[addCompanyUser] membership inserted ok");

  revalidatePath(`/admin/companies/${companyId}`);
  return { error: null, success: true };
}

// ── Remove company member ─────────────────────────────────────────────────────
// Deletes the company_memberships row only. Auth user is preserved.
// Guard: refuses if this would remove the last company_admin.

export async function removeCompanyMember(
  _prevState: CompanyActionState,
  formData: FormData
): Promise<CompanyActionState> {
  const supabase = await createClient();

  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return { error: "You must be signed in." };

  const callerRole = (userData.user.app_metadata as { role?: string })?.role;
  if (callerRole !== "admin") return { error: "Admin access required." };

  const membershipId = (formData.get("membership_id") as string)?.trim();
  const companyId = (formData.get("company_id") as string)?.trim();

  if (!membershipId) return { error: "Membership ID missing." };
  if (!companyId) return { error: "Company ID missing." };

  // Fetch the membership role before deleting
  const { data: membership } = await supabase
    .from("company_memberships")
    .select("role")
    .eq("id", membershipId)
    .single();

  if (!membership) return { error: "Membership not found." };

  // Last-admin guard: refuse if this is the only company_admin
  if (membership.role === "company_admin") {
    const { count } = await supabase
      .from("company_memberships")
      .select("id", { count: "exact", head: true })
      .eq("company_id", companyId)
      .eq("role", "company_admin");
    if ((count ?? 0) <= 1) {
      return { error: "Cannot remove the last company admin. Assign another admin first." };
    }
  }

  const { error } = await supabase
    .from("company_memberships")
    .delete()
    .eq("id", membershipId);

  if (error) {
    console.error("Remove company member error:", error);
    return { error: "Failed to remove user from company." };
  }

  revalidatePath(`/admin/companies/${companyId}`);
  return { error: null, success: true };
}

// ── Update allowed project states ────────────────────────────────────────────
// Sets the list of states company-side users are allowed to create projects in.
// An empty selection clears the restriction (all states allowed).

export async function updateAllowedStates(
  _prevState: CompanyActionState,
  formData: FormData
): Promise<CompanyActionState> {
  const supabase = await createClient();

  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return { error: "You must be signed in." };

  const callerRole = (userData.user.app_metadata as { role?: string })?.role;
  if (callerRole !== "admin") return { error: "Admin access required." };

  const companyId = (formData.get("company_id") as string)?.trim();
  if (!companyId) return { error: "Company ID missing." };

  // getAll returns [] when no checkboxes are checked — treat as unrestricted (NULL).
  const states = formData.getAll("allowed_states") as string[];
  const allowedStates = states.length > 0 ? states : null;

  const { error } = await supabase
    .from("companies")
    .update({ allowed_states: allowedStates })
    .eq("id", companyId);

  if (error) {
    console.error("updateAllowedStates error:", error);
    return { error: "Failed to update state restrictions." };
  }

  revalidatePath(`/admin/companies/${companyId}`);
  return { error: null, success: true };
}

// ── Archive company ───────────────────────────────────────────────────────────
// Sets archived_at / archived_by. Does NOT touch memberships or projects.

export async function archiveCompany(
  _prevState: CompanyActionState,
  formData: FormData
): Promise<CompanyActionState> {
  const supabase = await createClient();

  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return { error: "You must be signed in." };

  const callerRole = (userData.user.app_metadata as { role?: string })?.role;
  if (callerRole !== "admin") return { error: "Admin access required." };

  const companyId = (formData.get("company_id") as string)?.trim();
  if (!companyId) return { error: "Company ID missing." };

  const { error } = await supabase
    .from("companies")
    .update({ archived_at: new Date().toISOString(), archived_by: userData.user.id })
    .eq("id", companyId);

  if (error) {
    console.error("archiveCompany error:", error);
    return { error: "Failed to archive company." };
  }

  revalidatePath(`/admin/companies/${companyId}`);
  revalidatePath("/admin/companies");
  return { error: null, success: true };
}

// ── Unarchive company ─────────────────────────────────────────────────────────

export async function unarchiveCompany(
  _prevState: CompanyActionState,
  formData: FormData
): Promise<CompanyActionState> {
  const supabase = await createClient();

  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return { error: "You must be signed in." };

  const callerRole = (userData.user.app_metadata as { role?: string })?.role;
  if (callerRole !== "admin") return { error: "Admin access required." };

  const companyId = (formData.get("company_id") as string)?.trim();
  if (!companyId) return { error: "Company ID missing." };

  const { error } = await supabase
    .from("companies")
    .update({ archived_at: null, archived_by: null })
    .eq("id", companyId);

  if (error) {
    console.error("unarchiveCompany error:", error);
    return { error: "Failed to unarchive company." };
  }

  revalidatePath(`/admin/companies/${companyId}`);
  revalidatePath("/admin/companies");
  return { error: null, success: true };
}

// ── Upload company logo ──────────────────────────────────────────────────────
// Phase D — admin uploads a per-company logo (PNG / JPEG / WebP, ≤ 5 MB).
// File is stored in the `company-assets` bucket under
// `company-logos/{company_id}/logo.{ext}`. Any previous logo file in that
// folder is removed first so each company keeps a single logo on disk.
//
// On success: companies.logo_path is updated to the new storage path. The
// renderer prefers this path when an image_region binds to "company_logo",
// falling back to the legacy projects.client_logo_url for older projects.

const COMPANY_LOGO_BUCKET = "company-assets";
const COMPANY_LOGO_MAX_BYTES = 5_242_880; // 5 MB
const COMPANY_LOGO_ALLOWED_MIMES: ReadonlySet<string> = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
]);

function extForMime(mime: string): string {
  if (mime === "image/png")  return "png";
  if (mime === "image/webp") return "webp";
  return "jpg"; // image/jpeg or fallback
}

export async function uploadCompanyLogo(
  _prevState: CompanyActionState,
  formData: FormData
): Promise<CompanyActionState> {
  const supabase = await createClient();

  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return { error: "You must be signed in." };

  const callerRole = (userData.user.app_metadata as { role?: string })?.role;
  if (callerRole !== "admin") return { error: "Admin access required." };

  const companyId = (formData.get("company_id") as string)?.trim();
  if (!companyId) return { error: "Company ID missing." };

  const file = formData.get("file") as File | null;
  if (!file || file.size === 0) return { error: "Please select a logo image to upload." };
  if (!COMPANY_LOGO_ALLOWED_MIMES.has(file.type)) {
    return { error: "Logo must be a PNG, JPEG, or WebP image." };
  }
  if (file.size > COMPANY_LOGO_MAX_BYTES) {
    return { error: "Logo exceeds the 5 MB limit." };
  }

  const serviceClient = createServiceClient();

  // Remove any previous file(s) in this company's logo folder so each company
  // keeps exactly one logo on disk regardless of extension changes.
  const folder = `company-logos/${companyId}`;
  const { data: existing } = await serviceClient.storage
    .from(COMPANY_LOGO_BUCKET)
    .list(folder);
  if (existing && existing.length > 0) {
    const paths = existing.map((o) => `${folder}/${o.name}`);
    await serviceClient.storage.from(COMPANY_LOGO_BUCKET).remove(paths);
  }

  const ext         = extForMime(file.type);
  const storagePath = `${folder}/logo.${ext}`;

  const { error: uploadError } = await serviceClient.storage
    .from(COMPANY_LOGO_BUCKET)
    .upload(storagePath, file, { contentType: file.type, upsert: true });

  if (uploadError) {
    console.error("uploadCompanyLogo upload error:", uploadError.message);
    return { error: `Logo upload failed: ${uploadError.message}` };
  }

  const { error: updateError } = await serviceClient
    .from("companies")
    .update({ logo_path: storagePath })
    .eq("id", companyId);

  if (updateError) {
    console.error("uploadCompanyLogo db update error:", updateError);
    // Best-effort cleanup so we don't leave an orphan file.
    await serviceClient.storage.from(COMPANY_LOGO_BUCKET).remove([storagePath]);
    return { error: "Logo uploaded but failed to save to company record." };
  }

  revalidatePath(`/admin/companies/${companyId}`);
  return { error: null, success: true };
}

// ── Remove company logo ──────────────────────────────────────────────────────
// Clears companies.logo_path and best-effort removes the file from storage.

export async function removeCompanyLogo(
  _prevState: CompanyActionState,
  formData: FormData
): Promise<CompanyActionState> {
  const supabase = await createClient();

  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return { error: "You must be signed in." };

  const callerRole = (userData.user.app_metadata as { role?: string })?.role;
  if (callerRole !== "admin") return { error: "Admin access required." };

  const companyId = (formData.get("company_id") as string)?.trim();
  if (!companyId) return { error: "Company ID missing." };

  const serviceClient = createServiceClient();

  const { data: company } = await serviceClient
    .from("companies")
    .select("logo_path")
    .eq("id", companyId)
    .maybeSingle();
  const currentPath = (company as { logo_path: string | null } | null)?.logo_path ?? null;

  const { error: updateError } = await serviceClient
    .from("companies")
    .update({ logo_path: null })
    .eq("id", companyId);

  if (updateError) {
    console.error("removeCompanyLogo db update error:", updateError);
    return { error: "Failed to clear logo from company record." };
  }

  if (currentPath) {
    await serviceClient.storage.from(COMPANY_LOGO_BUCKET).remove([currentPath]);
  }

  revalidatePath(`/admin/companies/${companyId}`);
  return { error: null, success: true };
}

// ── Update company info ───────────────────────────────────────────────────────

export async function updateCompany(
  _prevState: CompanyActionState,
  formData: FormData
): Promise<CompanyActionState> {
  const supabase = await createClient();

  const companyId = (formData.get("company_id") as string)?.trim();
  const name = (formData.get("name") as string)?.trim();
  const billingEmail = (formData.get("billing_email") as string)?.trim() || null;
  const notes = (formData.get("notes") as string)?.trim() || null;

  if (!companyId) return { error: "Company ID missing." };
  if (!name) return { error: "Company name is required." };

  const { error } = await supabase
    .from("companies")
    .update({ name, billing_email: billingEmail, notes })
    .eq("id", companyId);

  if (error) {
    console.error("Company update error:", error);
    return { error: "Failed to update company." };
  }

  revalidatePath(`/admin/companies/${companyId}`);
  revalidatePath("/admin/companies");
  return { error: null, success: true };
}
