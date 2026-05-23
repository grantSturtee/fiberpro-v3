"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type MilepostActionState = {
  error: string | null;
  success?: boolean;
};

/**
 * Save milepost_start and milepost_end for a project.
 * Callable by any authenticated internal user (admin or designer).
 * RLS on the projects table enforces access rights.
 */
export async function saveMileposts(
  _prevState: MilepostActionState,
  formData: FormData
): Promise<MilepostActionState> {
  const supabase = await createClient();

  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return { error: "Not authenticated." };

  const projectId = formData.get("project_id") as string;
  if (!projectId) return { error: "Missing project ID." };

  const milepost_start = (formData.get("milepost_start") as string)?.trim() || null;
  const milepost_end   = (formData.get("milepost_end")   as string)?.trim() || null;

  const { error } = await supabase
    .from("projects")
    .update({ milepost_start, milepost_end })
    .eq("id", projectId);

  if (error) {
    console.error("saveMileposts error:", error);
    return { error: "Failed to save mileposts." };
  }

  revalidatePath(`/admin/projects/${projectId}`);
  revalidatePath(`/designer/projects/${projectId}`);
  revalidatePath(`/company/projects/${projectId}`);

  return { error: null, success: true };
}
