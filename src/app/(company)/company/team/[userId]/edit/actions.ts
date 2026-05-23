"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { getCompanyMembership } from "@/lib/queries/projects";

export type EditUserState = {
  error: string | null;
  success?: boolean;
};

export async function updateCompanyUser(
  _prevState: EditUserState,
  formData: FormData
): Promise<EditUserState> {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated." };

  // Must be company_admin
  const callerMembership = await getCompanyMembership(supabase, user.id);
  if (!callerMembership || callerMembership.role !== "company_admin") {
    return { error: "Company admin access required." };
  }
  const { company_id: companyId } = callerMembership;

  const targetUserId = (formData.get("user_id") as string)?.trim();
  const displayName = (formData.get("display_name") as string)?.trim();
  const email = (formData.get("email") as string)?.trim().toLowerCase();
  const newPassword = ((formData.get("new_password") as string) ?? "").trim();
  const confirmPassword = ((formData.get("confirm_new_password") as string) ?? "").trim();
  const returnTo = (formData.get("return_to") as string)?.trim() || "/company/team";

  if (!targetUserId) return { error: "User ID missing." };
  if (!displayName) return { error: "Display name is required." };
  if (!email) return { error: "Email is required." };

  const hasPassword = newPassword.length > 0;
  const hasConfirm = confirmPassword.length > 0;
  if (hasPassword || hasConfirm) {
    if (!hasPassword || !hasConfirm) return { error: "Please fill in both password fields." };
    if (newPassword.length < 8) return { error: "Password must be at least 8 characters." };
    if (newPassword !== confirmPassword) return { error: "Passwords do not match." };
  }

  const serviceClient = createServiceClient();

  // Security: target must belong to caller's company
  const { data: targetMembership } = await serviceClient
    .from("company_memberships")
    .select("id, role")
    .eq("user_id", targetUserId)
    .eq("company_id", companyId)
    .single();

  if (!targetMembership) return { error: "User not found in your company." };

  // Fetch current email to detect changes
  const { data: currentProfile } = await serviceClient
    .from("user_profiles")
    .select("email")
    .eq("id", targetUserId)
    .single();

  const emailChanged = email !== (currentProfile?.email ?? "").toLowerCase();

  // Update user_profiles (display_name + email if changed)
  const profileUpdate: Record<string, unknown> = { display_name: displayName };
  if (emailChanged) profileUpdate.email = email;

  const { error: profileError } = await serviceClient
    .from("user_profiles")
    .update(profileUpdate)
    .eq("id", targetUserId);

  if (profileError) {
    console.error("updateCompanyUser profile error:", profileError);
    return { error: "Failed to update profile." };
  }

  // Update auth: email and/or password
  if (emailChanged || hasPassword) {
    const authUpdate: { email?: string; password?: string } = {};
    if (emailChanged) authUpdate.email = email;
    if (hasPassword) authUpdate.password = newPassword;

    const { error: authError } = await serviceClient.auth.admin.updateUserById(
      targetUserId,
      authUpdate
    );
    if (authError) {
      console.error("updateCompanyUser auth error:", authError);
      const msg = authError.message?.toLowerCase().includes("already")
        ? "That email is already in use by another account."
        : "Profile saved but credentials update failed. Contact support.";
      return { error: msg };
    }
  }

  revalidatePath("/company/team");
  revalidatePath(`/company/team/${targetUserId}`);
  redirect(returnTo);
}
