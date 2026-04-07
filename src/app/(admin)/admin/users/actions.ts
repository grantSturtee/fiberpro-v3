"use server";

import { revalidatePath } from "next/cache";
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

  const { error: profileError } = await serviceClient.from("user_profiles").upsert({
    id: newUserId,
    role,
    display_name: displayName,
    email,
  });

  if (profileError) {
    console.error("Profile upsert error:", profileError);
    return { error: "User created but profile setup failed. Contact support." };
  }

  revalidatePath("/admin/users");
  return { error: null, success: true };
}
