"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

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

  const name = (formData.get("name") as string)?.trim();
  if (!name) return { error: "Company name is required." };

  const billingEmail = (formData.get("billing_email") as string)?.trim() || null;
  const notes = (formData.get("notes") as string)?.trim() || null;

  // Generate slug from name
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

  const { data: company, error } = await supabase
    .from("companies")
    .insert({ name, slug, billing_email: billingEmail, notes })
    .select("id")
    .single();

  if (error || !company) {
    if (error?.code === "23505") return { error: "A company with that name already exists." };
    console.error("Company insert error:", error);
    return { error: "Failed to create company. Please try again." };
  }

  revalidatePath("/admin/companies");
  redirect(`/admin/companies/${company.id}`);
}
