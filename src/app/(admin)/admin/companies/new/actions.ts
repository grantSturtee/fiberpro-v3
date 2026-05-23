"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";

export type NewCompanyState = {
  error: string | null;
};

export async function createCompany(
  _prevState: NewCompanyState,
  formData: FormData
): Promise<NewCompanyState> {
  const supabase = await createClient();

  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return { error: "You must be signed in." };

  const callerRole = (userData.user.app_metadata as { role?: string })?.role;
  if (callerRole !== "admin") return { error: "Admin access required." };

  // ── Validate inputs ───────────────────────────────────────────────────────
  const name = (formData.get("name") as string)?.trim();
  if (!name) return { error: "Company name is required." };

  const adminDisplayName = (formData.get("admin_display_name") as string)?.trim();
  if (!adminDisplayName) return { error: "Company Admin display name is required." };

  const adminEmail = (formData.get("admin_email") as string)?.trim().toLowerCase();
  if (!adminEmail) return { error: "Company Admin email is required." };

  const adminPassword = (formData.get("admin_password") as string) ?? "";
  if (!adminPassword) return { error: "Temporary password is required." };
  if (adminPassword.length < 8) return { error: "Temporary password must be at least 8 characters." };

  const billingEmail = (formData.get("billing_email") as string)?.trim() || null;
  const notes = (formData.get("notes") as string)?.trim() || null;

  const serviceClient = createServiceClient();

  // ── Check for existing auth user by email ─────────────────────────────────
  const { data: existingProfile } = await serviceClient
    .from("user_profiles")
    .select("id")
    .eq("email", adminEmail)
    .maybeSingle();

  let existingUserId: string | null = null;

  if (existingProfile) {
    // Block if that user is already in a company.
    const { count } = await serviceClient
      .from("company_memberships")
      .select("id", { count: "exact", head: true })
      .eq("user_id", existingProfile.id);

    if ((count ?? 0) > 0) {
      return { error: "A user with that email is already a member of another company." };
    }

    existingUserId = existingProfile.id;
  }

  // ── Step 1: Create the company ────────────────────────────────────────────
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

  const { data: company, error: companyError } = await serviceClient
    .from("companies")
    .insert({ name, slug, billing_email: billingEmail, notes })
    .select("id")
    .single();

  if (companyError || !company) {
    if (companyError?.code === "23505") return { error: "A company with that name already exists." };
    console.error("Company insert error:", companyError);
    return { error: "Failed to create company. Please try again." };
  }

  const companyId = company.id;
  let createdAuthUserId: string | null = null;

  // ── Steps 2–4: Create user, profile, and membership ──────────────────────
  // Any failure here triggers a full rollback of the company (and new auth user).
  try {
    let targetUserId: string;

    if (existingUserId) {
      // Relink an existing auth user who has no company yet.
      targetUserId = existingUserId;

      const { error: profileError } = await serviceClient
        .from("user_profiles")
        .update({ display_name: adminDisplayName, role: "company_admin" })
        .eq("id", targetUserId);

      if (profileError) throw new Error(`Profile update failed: ${profileError.message}`);

      const { error: authError } = await serviceClient.auth.admin.updateUserById(targetUserId, {
        app_metadata: { role: "company_admin" },
      });

      if (authError) throw new Error(`Auth metadata update failed: ${authError.message}`);
    } else {
      // Create a brand-new Supabase auth user.
      const { data: newUser, error: createError } = await serviceClient.auth.admin.createUser({
        email: adminEmail,
        password: adminPassword,
        email_confirm: true,
        app_metadata: { role: "company_admin" },
        user_metadata: { display_name: adminDisplayName },
      });

      if (createError || !newUser.user) {
        throw new Error(`Failed to create auth user: ${createError?.message ?? "unknown"}`);
      }

      createdAuthUserId = newUser.user.id;
      targetUserId = newUser.user.id;

      const { error: profileError } = await serviceClient
        .from("user_profiles")
        .upsert(
          { id: targetUserId, role: "company_admin", display_name: adminDisplayName, email: adminEmail },
          { onConflict: "id" }
        );

      if (profileError) throw new Error(`Profile setup failed: ${profileError.message}`);
    }

    // Step 4: Create company_admin membership.
    const { error: memberError } = await serviceClient.from("company_memberships").insert({
      company_id: companyId,
      user_id: targetUserId,
      role: "company_admin",
    });

    if (memberError) throw new Error(`Membership creation failed: ${memberError.message}`);
  } catch (err) {
    console.error("Company setup error — rolling back:", err);

    // Rollback: remove company first (cascades memberships if any were written).
    await serviceClient.from("companies").delete().eq("id", companyId);

    // Rollback: remove any newly created auth user.
    if (createdAuthUserId) {
      await serviceClient.auth.admin.deleteUser(createdAuthUserId);
    }

    const msg = err instanceof Error ? err.message : "Setup failed.";
    return { error: `Company creation failed — ${msg}` };
  }

  revalidatePath("/admin/companies");
  redirect(`/admin/companies/${companyId}`);
}
