"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";

export type CreateUserState = {
  error: string | null;
  success?: boolean;
};

export async function createInternalUser(
  _prevState: CreateUserState,
  formData: FormData
): Promise<CreateUserState> {
  const supabase = await createClient();

  // Verify caller is admin
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return { error: "You must be signed in." };

  const { data: callerProfile } = await supabase
    .from("user_profiles")
    .select("role")
    .eq("id", userData.user.id)
    .single();

  if (callerProfile?.role !== "admin") return { error: "Admin access required." };

  const email = (formData.get("email") as string)?.trim().toLowerCase();
  const displayName = (formData.get("display_name") as string)?.trim();
  const role = (formData.get("role") as string)?.trim();
  const password = (formData.get("password") as string) ?? "";
  const confirmPassword = (formData.get("confirm_password") as string) ?? "";

  if (!email) return { error: "Email is required." };
  if (!displayName) return { error: "Display name is required." };
  if (!["admin", "designer"].includes(role)) {
    return { error: "Role must be admin or designer." };
  }
  if (!password) return { error: "Password is required." };
  if (password.length < 8) return { error: "Password must be at least 8 characters." };
  if (password !== confirmPassword) return { error: "Passwords do not match." };

  const serviceClient = createServiceClient();

  const { data: newUser, error: createError } = await serviceClient.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    app_metadata: { role },
    user_metadata: { display_name: displayName },
  });

  if (createError || !newUser.user) {
    if (createError?.message?.includes("already been registered")) {
      return { error: "A user with that email already exists." };
    }
    console.error("Create internal user error:", createError);
    return { error: "Failed to create user. Please try again." };
  }

  const newUserId = newUser.user.id;

  // Upsert user_profiles.
  // Explicit onConflict: 'id' ensures an UPDATE is performed if a database trigger
  // already created an empty row for this user_id before we get here.
  const { error: profileError } = await serviceClient
    .from("user_profiles")
    .upsert(
      { id: newUserId, role, display_name: displayName, email },
      { onConflict: "id" }
    );

  if (profileError) {
    console.error("Profile upsert error:", {
      code: profileError.code,
      message: profileError.message,
      details: profileError.details,
      userId: newUserId,
    });
    return { error: "User created but profile setup failed. Contact support." };
  }

  revalidatePath("/admin/users");
  return { error: null, success: true };
}

// ── Update any user profile ───────────────────────────────────────────────────
// Handles both internal (admin/designer) and company (company_admin/project_manager) users.
// Email changes are intentionally excluded — Supabase email updates require
// the user to confirm via a verification link, which is not practical here.

export type UpdateUserState = {
  error: string | null;
  success?: boolean;
};

export async function updateUserProfile(
  _prevState: UpdateUserState,
  formData: FormData
): Promise<UpdateUserState> {
  const supabase = await createClient();

  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return { error: "You must be signed in." };

  const { data: callerProfile } = await supabase
    .from("user_profiles")
    .select("role")
    .eq("id", userData.user.id)
    .single();

  if (callerProfile?.role !== "admin") return { error: "Admin access required." };

  const targetId = (formData.get("user_id") as string)?.trim();
  const displayName = (formData.get("display_name") as string)?.trim();
  const role = (formData.get("role") as string)?.trim();
  const newPassword = (formData.get("new_password") as string) ?? "";
  const confirmPassword = (formData.get("confirm_new_password") as string) ?? "";
  const returnTo = (formData.get("return_to") as string)?.trim() || "/admin/users";

  if (!targetId) return { error: "User ID missing." };
  if (!displayName) return { error: "Display name is required." };

  const validRoles = ["admin", "designer", "company_admin", "project_manager"];
  if (!validRoles.includes(role)) return { error: "Invalid role." };

  if (newPassword) {
    if (newPassword.length < 8) return { error: "Password must be at least 8 characters." };
    if (newPassword !== confirmPassword) return { error: "Passwords do not match." };
  }

  const serviceClient = createServiceClient();

  // Update user_profiles
  const { error: profileError } = await serviceClient
    .from("user_profiles")
    .update({ display_name: displayName, role })
    .eq("id", targetId);

  if (profileError) {
    console.error("Profile update error:", profileError);
    return { error: "Failed to update profile." };
  }

  // Update auth app_metadata (role for middleware/RLS checks)
  const authUpdate: { app_metadata?: { role: string }; password?: string } = {
    app_metadata: { role },
  };
  if (newPassword) authUpdate.password = newPassword;

  const { error: authError } = await serviceClient.auth.admin.updateUserById(targetId, authUpdate);

  if (authError) {
    console.error("Auth update error:", authError);
    return { error: "Profile saved but auth update failed. Contact support." };
  }

  revalidatePath("/admin/users");
  revalidatePath("/admin/companies");
  redirect(returnTo);
}
