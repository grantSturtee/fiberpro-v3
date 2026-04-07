"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type RetryJobState = {
  error: string | null;
  success?: boolean;
};

export async function retryJob(
  _prevState: RetryJobState,
  formData: FormData
): Promise<RetryJobState> {
  const supabase = await createClient();

  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return { error: "Not authenticated." };

  const jobId = formData.get("job_id") as string;
  if (!jobId) return { error: "Missing job ID." };

  // Verify job exists and is in a retryable state
  const { data: job } = await supabase
    .from("workflow_jobs")
    .select("id, project_id, status")
    .eq("id", jobId)
    .single();

  if (!job) return { error: "Job not found." };
  if (job.status === "running") return { error: "Job is currently running." };
  if (job.status === "pending") return { error: "Job is already pending." };

  const { error: updateError } = await supabase
    .from("workflow_jobs")
    .update({
      status: "pending",
      error: null,
      result: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", jobId);

  if (updateError) {
    console.error("retryJob error:", updateError);
    return { error: "Failed to retry job." };
  }

  revalidatePath(`/admin/workflows`);
  revalidatePath(`/admin/workflows/${jobId}`);
  revalidatePath(`/admin/projects/${job.project_id}`);
  return { error: null, success: true };
}
