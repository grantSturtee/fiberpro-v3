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

export async function addCompanyUser(
  _prevState: CompanyActionState,
  formData: FormData
): Promise<CompanyActionState> {
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

  const companyId = (formData.get("company_id") as string)?.trim();
  const email = (formData.get("email") as string)?.trim().toLowerCase();
  const displayName = (formData.get("display_name") as string)?.trim();
  const role = (formData.get("role") as string)?.trim();
  const password = (formData.get("password") as string) ?? "";
  const confirmPassword = (formData.get("confirm_password") as string) ?? "";

  if (!companyId) return { error: "Company ID missing." };
  if (!email) return { error: "Email is required." };
  if (!displayName) return { error: "Display name is required." };
  if (!["company_admin", "project_manager"].includes(role)) {
    return { error: "Invalid role. Must be company_admin or project_manager." };
  }
  if (!password) return { error: "Password is required." };
  if (password.length < 8) return { error: "Password must be at least 8 characters." };
  if (password !== confirmPassword) return { error: "Passwords do not match." };

  // Use service role client to create auth user
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
    console.error("Create company user error:", createError);
    return { error: "Failed to create user. Please try again." };
  }

  const newUserId = newUser.user.id;

  // Upsert user_profiles
  const { error: profileError } = await serviceClient.from("user_profiles").upsert({
    id: newUserId,
    role,
    display_name: displayName,
    email,
  });

  if (profileError) {
    console.error("User profile upsert error:", profileError);
    return { error: "User created but profile setup failed. Contact support." };
  }

  // Insert company_memberships (ignore conflict if already member)
  const { error: memberError } = await serviceClient.from("company_memberships").insert({
    company_id: companyId,
    user_id: newUserId,
    role,
  });

  if (memberError && memberError.code !== "23505") {
    console.error("Company membership insert error:", memberError);
    return { error: "User created but company link failed. Contact support." };
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
