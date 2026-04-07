/**
 * Workflow job enqueueing.
 *
 * The app's only role is to insert rows into workflow_jobs with status = "pending".
 * n8n polls this table, picks up pending jobs, executes them, and writes back
 * status + result via webhook. No generation logic runs in the app.
 *
 * Modular design: callers pass typed metadata shaped for their job type.
 * n8n reads the metadata to know which files to fetch and what to produce.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { WorkflowJobType } from "@/types/workflow";

/**
 * Insert a new workflow job record with status = "pending".
 * Returns the new job's id, or null on failure.
 */
export async function enqueueWorkflowJob(
  supabase: SupabaseClient,
  projectId: string,
  jobType: WorkflowJobType,
  metadata: Record<string, unknown>,
  triggeredBy?: string | null
): Promise<string | null> {
  const { data, error } = await supabase
    .from("workflow_jobs")
    .insert({
      project_id: projectId,
      job_type: jobType,
      status: "pending",
      triggered_by: triggeredBy ?? null,
      metadata,
    })
    .select("id")
    .single();

  if (error) {
    console.error(`enqueueWorkflowJob(${jobType}) error:`, error);
    return null;
  }

  return data.id;
}

/**
 * Fetch the latest job of a given type for a project.
 * Used to drive status display on the project detail page.
 */
export async function getLatestJob(
  supabase: SupabaseClient,
  projectId: string,
  jobType: WorkflowJobType
) {
  const { data } = await supabase
    .from("workflow_jobs")
    .select("id, status, error, result, created_at, updated_at")
    .eq("project_id", projectId)
    .eq("job_type", jobType)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return data ?? null;
}
