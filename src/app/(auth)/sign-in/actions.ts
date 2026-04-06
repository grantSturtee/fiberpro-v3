"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { UserRole } from "@/lib/auth/roles";

function roleRedirect(role: UserRole): string {
  if (role === "admin") return "/admin";
  if (role === "designer") return "/designer";
  // company_admin and project_manager both land on company portal
  return "/company";
}

export async function signIn(
  _prevState: { error: string | null },
  formData: FormData
): Promise<{ error: string | null }> {
  const email = formData.get("email") as string;
  const password = formData.get("password") as string;

  if (!email || !password) {
    return { error: "Email and password are required." };
  }

  const supabase = await createClient();

  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    return { error: "Invalid email or password." };
  }

  // Role comes from app_metadata (set server-side by admin, not modifiable by user)
  const role = data.user?.app_metadata?.role as UserRole | undefined;

  if (!role) {
    // User exists but has no role assigned — sign them back out
    await supabase.auth.signOut();
    return { error: "Your account has not been assigned a role. Contact your administrator." };
  }

  redirect(roleRedirect(role));
}

export async function signOut(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/sign-in");
}
